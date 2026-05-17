// EN: 071-now headless verification (Issue #116, #120; full build).
//
//     Builds the playground, serves the production build with `vite
//     preview`, opens it in headless Chromium, and asserts that the
//     WordPress 0.71 blog is served through the service worker: the
//     front page renders with its CSS, and a visitor can click through
//     to a post page and a category page. A PNG screenshot is written
//     for the record.
//
//     It then exercises the WordPress 0.71 admin (Issue #120): the
//     admin opens already logged in (auto-login), a post is created and
//     then edited through the admin's own forms, a category is added,
//     and each change is confirmed on the front page.
//
//     This extends the feasibility spike's check (Issue #108, which
//     only confirmed the front-page text rendered) with the things the
//     full build unlocks -- styling and navigation (the service worker,
//     step 1) and the working admin (step 3).
// JA: 071-now のヘッドレス検証(Issue #116・#120、フル実装)。
//
//     playground をビルドし、`vite preview` で配信し、ヘッドレス
//     Chromium で開き、WordPress 0.71 ブログがサービスワーカー経由で
//     配信されることを検証する。フロントページが CSS 付きで描画され、
//     訪問者が投稿ページとカテゴリーページへ辿れることを確認する。
//
//     続いて WordPress 0.71 の管理画面を動かす(Issue #120)。管理画面は
//     ログイン済みで開き(自動ログイン)、管理画面自身のフォームから
//     投稿を作成・編集し、カテゴリーを追加し、各変更をフロントページで
//     確認する。
//
//     これは実現可能性検証(Issue #108、フロントページのテキスト描画のみ
//     確認)を、フル実装が解放するもの -- スタイリングと遷移(サービス
//     ワーカー、ステップ 1)、および動作する管理画面(ステップ 3)--
//     で拡張したものである。
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';

const here = dirname( fileURLToPath( import.meta.url ) );
const playgroundDir = join( here, '..' );

const PREVIEW_PORT = 4173;
const PREVIEW_URL = `http://localhost:${ PREVIEW_PORT }/`;

// EN: Text the seeded post (tools/playground/db/seed.php) must contribute.
const EXPECTED_TITLE = 'Hello world from 071-now';
const EXPECTED_BODY = 'in-browser SQLite database';

/**
 * Run an npm script in the playground package and wait for it to exit.
 *
 * @param {string[]} args Arguments after `npm`.
 * @return {Promise<void>}
 */
function runNpm( args ) {
	return new Promise( ( resolve, reject ) => {
		const child = spawn( 'npm', args, {
			cwd: playgroundDir,
			stdio: 'inherit',
		} );
		child.on( 'exit', ( code ) =>
			code === 0 ? resolve() : reject( new Error( `npm ${ args.join( ' ' ) } exited ${ code }` ) )
		);
	} );
}

/**
 * Start `vite preview` and resolve once it is accepting connections.
 *
 * @return {Promise<import('node:child_process').ChildProcess>}
 */
async function startPreview() {
	const child = spawn(
		'npm',
		[ 'run', 'preview', '--', '--port', String( PREVIEW_PORT ), '--strictPort' ],
		{ cwd: playgroundDir, stdio: 'inherit' }
	);
	for ( let attempt = 0; attempt < 60; attempt++ ) {
		try {
			const response = await fetch( PREVIEW_URL );
			if ( response.ok ) {
				return child;
			}
		} catch {
			// EN: Server not up yet; keep polling.
		}
		await new Promise( ( r ) => setTimeout( r, 500 ) );
	}
	child.kill();
	throw new Error( 'vite preview did not become reachable' );
}

/**
 * Wait until the blog iframe has navigated to a scoped path whose URL
 * matches the given predicate, then return that frame.
 *
 * @param {import('playwright').Page}            page  The host page.
 * @param {(url: string) => boolean}             match URL predicate.
 * @return {Promise<import('playwright').Frame>} The blog frame.
 */
async function waitForBlogFrame( page, match ) {
	const deadline = Date.now() + 30000;
	while ( Date.now() < deadline ) {
		const frame = page
			.frames()
			.find( ( f ) => f.url().includes( '/scope:' ) && match( f.url() ) );
		if ( frame ) {
			// EN: Make sure the document has actually rendered its body.
			await frame.waitForSelector( 'body', { timeout: 10000 } );
			return frame;
		}
		await new Promise( ( r ) => setTimeout( r, 250 ) );
	}
	throw new Error( 'blog iframe did not reach the expected scoped URL' );
}

/**
 * Point the blog iframe at a scoped blog path and return the frame once
 * it has loaded there.
 *
 * The blog is served under the per-boot scope segment the app picked
 * (window.__071now.scopePrefix); a blog-relative path is resolved
 * against it so the navigation goes through the service worker.
 *
 * @param {import('playwright').Page} page    The host page.
 * @param {string}                   relPath Blog-relative path, e.g.
 *                                            '/wp-admin/b2edit.php'.
 * @return {Promise<import('playwright').Frame>} The blog frame.
 */
async function gotoBlog( page, relPath ) {
	await page.evaluate( ( rel ) => {
		const target = window.__071now.scopePrefix + rel;
		document.getElementById( 'blog' ).src = target;
	}, relPath );
	const want = relPath.split( '?' )[ 0 ];
	return waitForBlogFrame( page, ( url ) => url.includes( want ) );
}

/**
 * Wait until the blog iframe shows a frame, at a URL matching the given
 * predicate, whose body contains the expected text.
 *
 * A form submit / redirect leaves the iframe URL unchanged (b2edit.php
 * posts to b2edit.php), so a URL check alone can match the pre-submit
 * document. Asserting on the rendered text instead waits for the new
 * page to actually be in place.
 *
 * @param {import('playwright').Page}  page         The host page.
 * @param {(url: string) => boolean}   matchUrl     URL predicate.
 * @param {string}                     expectedText Text the body must
 *                                                  contain.
 * @return {Promise<boolean>} True once the text is found, false on
 *                            timeout.
 */
async function waitForBlogText( page, matchUrl, expectedText ) {
	const deadline = Date.now() + 20000;
	while ( Date.now() < deadline ) {
		const frame = page
			.frames()
			.find(
				( f ) => f.url().includes( '/scope:' ) && matchUrl( f.url() )
			);
		if ( frame ) {
			const body = await frame
				.evaluate( () =>
					document.body ? document.body.innerText : ''
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
 * Exercise the WordPress 0.71 admin in the playground (Issue #120).
 *
 * Opens the admin (which must already be logged in -- the auto-login),
 * creates a post through the admin's own form, edits it, adds a
 * category, and confirms each change on the front page. Every page is
 * served through the service worker, the same path a real visitor's
 * browser takes.
 *
 * @param {import('playwright').Page} page The host page.
 * @return {Promise<Array<[string, boolean]>>} Labelled check results.
 */
async function verifyAdmin( page ) {
	const CREATED_TITLE = '071-now admin smoke post';
	const CREATED_BODY = 'Created through the WordPress 0.71 admin.';
	const EDITED_TITLE = '071-now admin smoke post edited';
	const NEW_CATEGORY = 'Playground Notes';

	const isAdmin = ( url ) => url.includes( '/wp-admin/b2edit.php' );
	const isCatAdmin = ( url ) => url.includes( '/wp-admin/b2categories.php' );
	const isFront = ( url ) => url.endsWith( '/index.php' );

	// EN: Open the post editor. Auto-login means it opens straight onto
	//     the editor; without a logged-in user b2verifauth.php would
	//     redirect to b2login.php, so reaching the post form at all is
	//     the auto-login check.
	const editFrame = await gotoBlog( page, '/wp-admin/b2edit.php' );
	await editFrame.waitForSelector( 'form[name="post"] #content', {
		timeout: 15000,
	} );
	const adminReachable =
		( await editFrame.locator( 'form[name="post"]' ).count() ) > 0;

	// EN: Create a post through the admin's own form -- fill the title,
	//     body and category and submit. The form carries 0.71's CSRF
	//     token, so a successful write proves the token round-trips.
	//     b2edit.php redirects back to itself after the INSERT; wait for
	//     the post list to actually show the new title.
	await editFrame.fill( 'form[name="post"] #title', CREATED_TITLE );
	await editFrame.fill( 'form[name="post"] #content', CREATED_BODY );
	await editFrame.selectOption( 'form[name="post"] select#category', {
		index: 0,
	} );
	await editFrame.click( 'form[name="post"] input[type="submit"]' );
	const postListed = await waitForBlogText( page, isAdmin, CREATED_TITLE );

	// EN: The created post shows on the front page.
	await gotoBlog( page, '/index.php' );
	const createdOnFront = await waitForBlogText(
		page,
		isFront,
		CREATED_TITLE
	);

	// EN: Edit the post. The admin lists an "Edit" link per post -- the
	//     b2edit.php?action=edit permalink. Follow it to the edit form,
	//     change the title and submit.
	const editList = await gotoBlog( page, '/wp-admin/b2edit.php' );
	await editList.waitForSelector( 'a[href*="action=edit"]', {
		timeout: 15000,
	} );
	await editList.locator( 'a[href*="action=edit"]' ).first().click();
	const editFormFrame = await waitForBlogFrame( page, ( url ) =>
		url.includes( 'action=edit' )
	);
	await editFormFrame.waitForSelector( 'form[name="post"] #title', {
		timeout: 15000,
	} );
	await editFormFrame.fill( 'form[name="post"] #title', EDITED_TITLE );
	await editFormFrame.click( 'form[name="post"] input[type="submit"]' );
	const postEdited = await waitForBlogText( page, isAdmin, EDITED_TITLE );

	// EN: The edited title shows on the front page.
	await gotoBlog( page, '/index.php' );
	const editedOnFront = await waitForBlogText( page, isFront, EDITED_TITLE );

	// EN: Manage a category -- add one through the category admin and
	//     confirm it lands in the category list.
	const catFrame = await gotoBlog( page, '/wp-admin/b2categories.php' );
	await catFrame.waitForSelector(
		'form[name="addcat"] input[name="cat_name"]',
		{ timeout: 15000 }
	);
	await catFrame.fill(
		'form[name="addcat"] input[name="cat_name"]',
		NEW_CATEGORY
	);
	await catFrame.click( 'form[name="addcat"] input[type="submit"]' );
	const categoryListed = await waitForBlogText(
		page,
		isCatAdmin,
		NEW_CATEGORY
	);

	await page.screenshot( {
		path: join( here, '071-now-admin.png' ),
		fullPage: true,
	} );

	return [
		[ 'admin opens logged in (auto-login)', adminReachable ],
		[ 'post created through the admin form', postListed ],
		[ 'created post shows on the front page', createdOnFront ],
		[ 'post edited through the admin form', postEdited && editedOnFront ],
		[ 'category added through the admin', categoryListed ],
	];
}

/**
 * Verify the service-worker-served blog in headless Chromium.
 *
 * @return {Promise<void>}
 */
async function verify() {
	const browser = await chromium.launch();
	const page = await browser.newPage();
	const consoleErrors = [];
	page.on( 'console', ( message ) => {
		if ( message.type() === 'error' ) {
			consoleErrors.push( message.text() );
		}
	} );
	page.on( 'pageerror', ( error ) => {
		consoleErrors.push( `pageerror: ${ error.message }` );
	} );

	try {
		await page.goto( PREVIEW_URL, { waitUntil: 'load' } );

		// EN: Wait for the boot hook the app sets once php-wasm is up and
		//     the front page has been served through the request handler.
		await page.waitForFunction(
			() => window.__071now && typeof window.__071now.status === 'number',
			{ timeout: 60000 }
		);

		const result = await page.evaluate( () => ( {
			status: window.__071now.status,
			html: window.__071now.html,
			scopePrefix: window.__071now.scopePrefix,
			statusLine: document.getElementById( 'status' ).textContent,
		} ) );

		// EN: The service worker controls the page and serves the blog.
		const swController = await page.evaluate(
			() => !! navigator.serviceWorker.controller
		);

		// EN: The blog renders inside the iframe, served through the
		//     service worker at a real scoped same-origin path.
		const frontFrame = await waitForBlogFrame( page, ( url ) =>
			url.endsWith( '/index.php' )
		);
		const titleVisible = await frontFrame
			.locator( `text=${ EXPECTED_TITLE }` )
			.count();

		// EN: CSS check -- layout2b.css gives #header a grey background.
		//     A styled #header proves the stylesheet loaded through the
		//     service worker; an unstyled page leaves it transparent.
		const headerBackground = await frontFrame
			.locator( '#header' )
			.first()
			.evaluate( ( el ) => getComputedStyle( el ).backgroundColor );
		const cssApplied =
			headerBackground !== 'rgba(0, 0, 0, 0)' &&
			headerBackground !== 'transparent';

		await page.screenshot( {
			path: join( here, '071-now-frontpage.png' ),
			fullPage: true,
		} );

		// EN: Navigation check 1 -- click the post permalink and confirm
		//     the post page loads (still served through the worker).
		const postLink = frontFrame.locator( 'h3.storytitle a' ).first();
		const postHref = await postLink.getAttribute( 'href' );
		await postLink.click();
		const postFrame = await waitForBlogFrame( page, ( url ) =>
			url.includes( '?' )
		);
		const postTitleVisible = await postFrame
			.locator( `text=${ EXPECTED_TITLE }` )
			.count();
		const postCssApplied = await postFrame
			.locator( '#header' )
			.first()
			.evaluate(
				( el ) =>
					getComputedStyle( el ).backgroundColor !==
					'rgba(0, 0, 0, 0)'
			);

		// EN: Navigation check 2 -- click the post's category link and
		//     confirm the category archive shows the seeded post.
		const categoryLink = postFrame.locator( '.meta a' ).first();
		const categoryHref = await categoryLink.getAttribute( 'href' );
		await categoryLink.click();
		const categoryFrame = await waitForBlogFrame( page, ( url ) =>
			url.includes( 'cat=' )
		);
		const categoryPostVisible = await categoryFrame
			.locator( `text=${ EXPECTED_TITLE }` )
			.count();

		// EN: Exercise the WordPress 0.71 admin (Issue #120) -- this runs
		//     after the front-page navigation checks and before the
		//     console-error assertion so an admin-side console error is
		//     also caught.
		const adminChecks = await verifyAdmin( page );

		const checks = [
			[ 'HTTP 200 from index.php', result.status === 200 ],
			[ 'service worker controls the page', swController ],
			[ 'seeded post title in HTML', result.html.includes( EXPECTED_TITLE ) ],
			[ 'seeded post body in HTML', result.html.includes( EXPECTED_BODY ) ],
			[ 'front page served through the service worker', titleVisible > 0 ],
			[ `front page CSS applied (#header bg ${ headerBackground })`, cssApplied ],
			[ `post page reached by clicking "${ postHref }"`, postTitleVisible > 0 ],
			[ 'post page keeps its CSS', postCssApplied ],
			[
				`category page reached by clicking "${ categoryHref }"`,
				categoryPostVisible > 0,
			],
			...adminChecks,
			[ 'no console errors', consoleErrors.length === 0 ],
		];

		let ok = true;
		for ( const [ label, passed ] of checks ) {
			// eslint-disable-next-line no-console
			console.log( `${ passed ? 'PASS' : 'FAIL' }  ${ label }` );
			ok = ok && passed;
		}
		// eslint-disable-next-line no-console
		console.log( `\nstatus line: ${ result.statusLine }` );
		if ( consoleErrors.length ) {
			// eslint-disable-next-line no-console
			console.log( 'console errors:\n  ' + consoleErrors.join( '\n  ' ) );
		}
		// eslint-disable-next-line no-console
		console.log(
			'screenshots: tools/playground/test/071-now-frontpage.png, 071-now-admin.png'
		);

		if ( ! ok ) {
			throw new Error( '071-now verification failed' );
		}
		// eslint-disable-next-line no-console
		console.log( '\n071-now verification PASSED' );
	} finally {
		await browser.close();
	}
}

const args = process.argv.slice( 2 );

if ( ! args.includes( '--no-build' ) ) {
	await runNpm( [ 'run', 'build' ] );
}

const preview = await startPreview();
try {
	await verify();
} finally {
	preview.kill();
}
