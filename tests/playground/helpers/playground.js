// @ts-check
const { expect } = require( '@playwright/test' );

/**
 * Shared helpers for the 071-now playground E2E suite (Issue #141).
 *
 * The playground (tools/playground/) boots @php-wasm/web in the
 * browser tab and serves WordPress 0.71 through a service worker.
 * The host page is a thin chrome around a blog iframe; the WordPress
 * 0.71 blog itself is reachable inside that iframe at a per-boot
 * scoped same-origin path. These helpers wrap the awkward parts so
 * the spec files read as plain `test()` cases: waiting for php-wasm
 * to boot, pointing the blog iframe at a scoped path and waiting for
 * the right frame, asserting on the rendered text (a form submit
 * leaves the iframe URL unchanged), and driving the reset control.
 *
 * The logic here is the helper layer the bespoke verify.mjs script
 * carried inline -- it is folded into proper `@playwright/test`
 * helpers so the specs supersede that script (Issue #141).
 */

// How long php-wasm's boot may take. The PHP 8.3 .wasm runtime is
// roughly 40 MB, so a cold boot is several seconds; WebKit is
// slower than Chromium. 60 s leaves generous headroom.
const BOOT_TIMEOUT = 60 * 1000;

// An in-app browser user-agent (Issue #140) -- a real mobile in-app
// browser string, the X/Twitter iOS in-app browser: an iOS WKWebView
// ("AppleWebKit ... Mobile" with no "Safari/" token) that also
// carries the "Twitter" app marker. The in-app-browser spec opens
// the playground with this user-agent and asserts the "open in your
// standard browser" screen is shown instead of php-wasm booting.
const INAPP_USER_AGENT =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ' +
	'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone';

/**
 * Wait for the 071-now app to finish booting.
 *
 * The app sets `window.__071now` with a numeric `status` once
 * php-wasm is up and the front page has been served through the
 * request handler. Awaited on the initial load and after every
 * reload the persistence specs perform.
 *
 * @param {import('@playwright/test').Page} page The host page.
 */
async function waitForBoot( page ) {
	await page.waitForFunction(
		() =>
			window.__071now &&
			typeof window.__071now.status === 'number',
		{ timeout: BOOT_TIMEOUT }
	);
}

/**
 * Open the playground host page and wait for php-wasm to boot.
 *
 * @param {import('@playwright/test').Page} page The host page.
 */
async function openPlayground( page ) {
	await page.goto( '/', { waitUntil: 'load' } );
	await waitForBoot( page );
}

/**
 * Wait until the blog iframe has navigated to a scoped path whose
 * URL matches the given predicate, then return that frame.
 *
 * The matched frame can be detached between being found and having
 * its body awaited -- the blog iframe re-navigates, and WebKit in
 * particular swaps the frame out mid-wait. A `waitForSelector` on a
 * detached frame throws "Frame was detached"; that is treated as
 * "not ready yet" and the loop retries until a stable frame is found
 * or the deadline passes.
 *
 * @param {import('@playwright/test').Page} page  The host page.
 * @param {(url: string) => boolean}        match URL predicate.
 * @return {Promise<import('@playwright/test').Frame>} The blog frame.
 */
async function waitForBlogFrame( page, match ) {
	const deadline = Date.now() + 30000;
	while ( Date.now() < deadline ) {
		const frame = page
			.frames()
			.find(
				( f ) =>
					f.url().includes( '/scope:' ) && match( f.url() )
			);
		if ( frame ) {
			try {
				// Make sure the document has actually rendered its body.
				await frame.waitForSelector( 'body', { timeout: 10000 } );
				return frame;
			} catch ( error ) {
				// A detached frame means the iframe re-navigated mid
				// wait -- retry the loop to pick up the new frame.
				if ( ! /detached/i.test( /** @type {Error} */ ( error ).message ) ) {
					throw error;
				}
			}
		}
		await new Promise( ( r ) => setTimeout( r, 250 ) );
	}
	throw new Error( 'blog iframe did not reach the expected scoped URL' );
}

/**
 * Point the blog iframe at a scoped blog path and return the frame
 * once it has loaded there.
 *
 * The blog is served under the per-boot scope segment the app picked
 * (`window.__071now.scopePrefix`); a blog-relative path is resolved
 * against it so the navigation goes through the service worker.
 *
 * @param {import('@playwright/test').Page} page    The host page.
 * @param {string}                         relPath Blog-relative path, e.g.
 *        '/wp-admin/b2edit.php'.
 * @return {Promise<import('@playwright/test').Frame>} The blog frame.
 */
async function gotoBlog( page, relPath ) {
	await page.evaluate( ( rel ) => {
		const target = window.__071now.scopePrefix + rel;
		/** @type {HTMLIFrameElement} */ (
			document.getElementById( 'blog' )
		).src = target;
	}, relPath );
	const want = relPath.split( '?' )[ 0 ];
	return waitForBlogFrame( page, ( url ) => url.includes( want ) );
}

/**
 * Wait until the blog iframe shows a frame, at a URL matching the
 * given predicate, whose body contains the expected text.
 *
 * A form submit / redirect leaves the iframe URL unchanged
 * (b2edit.php posts to b2edit.php), so a URL check alone can match
 * the pre-submit document. Asserting on the rendered text instead
 * waits for the new page to actually be in place.
 *
 * Both `innerText` and `textContent` are searched: `innerText` is
 * the rendered text, but WebKit omits `<option>` content from it
 * while Chromium includes it -- so a category name, which 0.71's
 * category admin shows inside a `<select>`, would be missed on
 * WebKit. Checking `textContent` too makes the assertion
 * engine-independent (Issue #130).
 *
 * @param {import('@playwright/test').Page} page         The host page.
 * @param {(url: string) => boolean}        matchUrl     URL predicate.
 * @param {string}                          expectedText Text the body must
 *        contain.
 * @return {Promise<boolean>} True once the text is found, false on
 *         timeout.
 */
async function waitForBlogText( page, matchUrl, expectedText ) {
	const deadline = Date.now() + 20000;
	while ( Date.now() < deadline ) {
		const frame = page
			.frames()
			.find(
				( f ) =>
					f.url().includes( '/scope:' ) && matchUrl( f.url() )
			);
		if ( frame ) {
			const body = await frame
				.evaluate( () =>
					document.body
						? `${ document.body.innerText }\n${ document.body.textContent }`
						: ''
				)
				.catch( () => '' );
			if ( body.includes( expectedText ) ) {
				return true;
			}
		}
		await new Promise( ( r ) => setTimeout( r, 250 ) );
	}
	return false;
}

/**
 * Read a blog frame's rendered text and assert it carries no SQL
 * error.
 *
 * WordPress 0.71's wpdb prints a database error inline into the page
 * -- "SQL/DB Error --" followed by the failing statement -- rather
 * than raising a console error or a non-200 status. A query the
 * MySQL -> SQLite translator does not cover (Issue #131:
 * DATE_FORMAT() in the front-page Links sidebar) therefore renders a
 * visible error into the HTML that a text-presence check would miss.
 * This reads the whole body -- innerText and textContent, so a
 * sidebar / `<option>` error is caught on both engines -- and
 * returns whether the SQL-error marker is absent.
 *
 * @param {import('@playwright/test').Frame} frame A loaded blog frame.
 * @return {Promise<boolean>} True when the page shows no SQL error.
 */
async function frameHasNoSqlError( frame ) {
	const body = await frame
		.evaluate( () =>
			document.body
				? `${ document.body.innerText }\n${ document.body.textContent }`
				: ''
		)
		.catch( () => '' );
	return ! body.includes( 'SQL/DB Error' );
}

/**
 * Trigger the app's reset control and wait for the reloaded page to
 * boot.
 *
 * `window.__071now.reset()` clears the persisted stores and then
 * calls `location.reload()`. The reload starts asynchronously, so a
 * bare `waitForBoot` afterwards can race it -- matching the
 * pre-reload `window.__071now` (so a stale `databaseRestored` is
 * read) or hitting "Execution context was destroyed" when the
 * navigation lands mid call. WebKit reaches this window far more
 * often than Chromium. This drives the reset robustly: it fires
 * `reset()`, ignores a context-destroyed error from the in-flight
 * navigation, waits for the new document's load event, then waits
 * for the fresh boot hook.
 *
 * @param {import('@playwright/test').Page} page The host page.
 */
async function resetAndWaitForBoot( page ) {
	const navigated = page
		.waitForEvent( 'load', { timeout: BOOT_TIMEOUT } )
		.catch( () => {} );
	await page
		.evaluate( () => window.__071now.reset() )
		.catch( ( error ) => {
			// location.reload() can destroy the context before the
			// evaluate resolves -- expected, the navigation is what
			// this awaits next.
			if (
				! /Execution context was destroyed|navigation/i.test(
					error.message
				)
			) {
				throw error;
			}
		} );
	await navigated;
	await waitForBoot( page );
}

/**
 * Create a post through the WordPress 0.71 admin's own post form.
 *
 * Opens b2edit.php, fills the title / body / category and submits.
 * The form carries 0.71's CSRF token, so a successful write proves
 * the token round-trips. b2edit.php redirects back to itself after
 * the INSERT; this waits for the post list to show the new title.
 *
 * @param {import('@playwright/test').Page} page  The host page.
 * @param {string}                         title The post title.
 * @param {string}                         body  The post body.
 * @return {Promise<boolean>} True once the admin lists the new post.
 */
async function createPostThroughAdmin( page, title, body ) {
	const isAdmin = ( url ) => url.includes( '/wp-admin/b2edit.php' );
	const editFrame = await gotoBlog( page, '/wp-admin/b2edit.php' );
	await editFrame.waitForSelector( 'form[name="post"] #content', {
		timeout: 15000,
	} );
	await editFrame.fill( 'form[name="post"] #title', title );
	await editFrame.fill( 'form[name="post"] #content', body );
	await editFrame.selectOption( 'form[name="post"] select#category', {
		index: 0,
	} );
	await editFrame.click( 'form[name="post"] input[type="submit"]' );
	return waitForBlogText( page, isAdmin, title );
}

/**
 * Fetch a blog path through the in-browser request handler and
 * report whether it served an image.
 *
 * Used to check an uploaded image is served from the php-wasm VFS: a
 * 200 status with an `image/*` content-type and a non-empty body
 * means the static-file handler returned the stored upload.
 *
 * The probe can run straight after a reset / reload, so the host
 * page may still be navigating and `page.evaluate` can hit
 * "Execution context was destroyed". That is retried (after
 * re-awaiting the boot hook) rather than failing.
 *
 * @param {import('@playwright/test').Page} page    The host page.
 * @param {string}                         relPath Blog-relative path.
 * @return {Promise<{status:number, contentType:string, length:number}>}
 */
async function fetchBlogImage( page, relPath ) {
	for ( let attempt = 0; ; attempt++ ) {
		try {
			return await page.evaluate( async ( rel ) => {
				const response = await window.__071now.get( rel );
				const headers = response.headers || {};
				const contentType =
					( headers[ 'content-type' ] || [] )[ 0 ] || '';
				return {
					status: response.httpStatusCode,
					contentType,
					length: response.bytes ? response.bytes.length : 0,
				};
			}, relPath );
		} catch ( error ) {
			const transient = /Execution context was destroyed|navigation/i.test(
				/** @type {Error} */ ( error ).message
			);
			if ( ! transient || attempt >= 5 ) {
				throw error;
			}
			// The host page was navigating -- wait for the fresh boot
			// hook, then retry the probe against the new context.
			await waitForBoot( page );
		}
	}
}

/**
 * Wait for the block editor to mount in the blog iframe and return
 * its frame, once the editor's title input is present.
 *
 * The block editor is the custom @wordpress/block-editor app served
 * by src/block-editor/api/editor.php. It is opened at a scoped blog
 * path (/block-editor/api/editor.php?post=ID); editor.php serves the
 * HTML shell, the bundle mounts the React editor, and load.php fills
 * the title -- so a present `input.be-title` proves editor.php found
 * the bundle (not the "bundle not built" fallback) and load.php
 * answered.
 *
 * @param {import('@playwright/test').Page} page The host page.
 * @param {number}                         post The post id to open.
 * @return {Promise<import('@playwright/test').Frame>} The editor frame.
 */
async function openBlockEditor( page, post ) {
	await gotoBlog( page, `/block-editor/api/editor.php?post=${ post }` );
	const deadline = Date.now() + 40000;
	while ( Date.now() < deadline ) {
		const frame = page
			.frames()
			.find( ( f ) =>
				f.url().includes( '/block-editor/api/editor.php' )
			);
		if ( frame ) {
			try {
				await frame.waitForSelector( 'input.be-title', {
					timeout: 5000,
				} );
				return frame;
			} catch ( error ) {
				// A detached frame or a not-yet-mounted editor -- retry.
				if (
					! /detached|Timeout/i.test(
						/** @type {Error} */ ( error ).message
					)
				) {
					throw error;
				}
			}
		}
		await new Promise( ( r ) => setTimeout( r, 250 ) );
	}
	throw new Error( 'block editor did not mount in the blog iframe' );
}

/**
 * Attach console-error / pageerror listeners to a page and return a
 * growing array of the messages collected.
 *
 * The playground has no server log to inspect, so a JavaScript
 * console error or an uncaught page error is the signal that
 * something broke. A spec collects these and asserts the array is
 * empty at the end.
 *
 * @param {import('@playwright/test').Page} page The page.
 * @return {string[]} A live array of collected error messages.
 */
function collectConsoleErrors( page ) {
	/** @type {string[]} */
	const errors = [];
	page.on( 'console', ( message ) => {
		if ( message.type() === 'error' ) {
			errors.push( message.text() );
		}
	} );
	page.on( 'pageerror', ( error ) => {
		errors.push( `pageerror: ${ error.message }` );
	} );
	return errors;
}

/**
 * Assert a value is truthy with a descriptive message. A thin
 * wrapper so the specs can assert on the helper-returned booleans
 * (e.g. waitForBlogText) and still get a `@playwright/test` failure
 * with a clear label.
 *
 * @param {unknown} value   The value to assert truthy.
 * @param {string}  message The failure message.
 */
function expectTrue( value, message ) {
	expect( Boolean( value ), message ).toBe( true );
}

module.exports = {
	BOOT_TIMEOUT,
	INAPP_USER_AGENT,
	waitForBoot,
	openPlayground,
	waitForBlogFrame,
	gotoBlog,
	waitForBlogText,
	frameHasNoSqlError,
	resetAndWaitForBoot,
	createPostThroughAdmin,
	fetchBlogImage,
	openBlockEditor,
	collectConsoleErrors,
	expectTrue,
};
