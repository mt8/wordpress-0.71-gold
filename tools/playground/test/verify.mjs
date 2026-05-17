// EN: 071-now headless verification (Issue #116, full build 1/6).
//
//     Builds the playground, serves the production build with `vite
//     preview`, opens it in headless Chromium, and asserts that the
//     WordPress 0.71 blog is served through the service worker: the
//     front page renders with its CSS, and a visitor can click through
//     to a post page and a category page. A PNG screenshot is written
//     for the record.
//
//     This extends the feasibility spike's check (Issue #108, which
//     only confirmed the front-page text rendered) with the two things
//     the service-worker request handler unlocks -- styling and
//     navigation -- the goal of this step.
// JA: 071-now のヘッドレス検証(Issue #116、フル実装 1/6)。
//
//     playground をビルドし、`vite preview` で配信し、ヘッドレス
//     Chromium で開き、WordPress 0.71 ブログがサービスワーカー経由で
//     配信されることを検証する。フロントページが CSS 付きで描画され、
//     訪問者が投稿ページとカテゴリーページへ辿れることを確認する。
//
//     これは実現可能性検証(Issue #108、フロントページのテキスト描画のみ
//     確認)を、サービスワーカーのリクエストハンドラが解放する 2 点 --
//     スタイリングと遷移 -- で拡張したものである。
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
		console.log( 'screenshot: tools/playground/test/071-now-frontpage.png' );

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
