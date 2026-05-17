// EN: 071-now headless verification (Issue #108 feasibility spike).
//
//     Builds the playground, serves the production build with `vite
//     preview`, opens it in headless Chromium, and asserts that the
//     WordPress 0.71 front page rendered in-browser with the seeded
//     post visible. A PNG screenshot is written for the record.
//
//     This is the spike's success check: php-wasm renders 0.71's front
//     page from a SQLite-backed database, in a real browser.
// JA: 071-now のヘッドレス検証(Issue #108 実現可能性検証)。
//
//     playground をビルドし、`vite preview` で配信し、ヘッドレス
//     Chromium で開き、WordPress 0.71 のフロントページがブラウザ内で
//     描画され投入済み投稿が見えることを検証する。
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
 * Verify the front page in headless Chromium.
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

	try {
		await page.goto( PREVIEW_URL, { waitUntil: 'load' } );

		// EN: Wait for the boot hook the app sets once the render is done.
		await page.waitForFunction(
			() => window.__071now && typeof window.__071now.status === 'number',
			{ timeout: 60000 }
		);

		const result = await page.evaluate( () => ( {
			status: window.__071now.status,
			html: window.__071now.html,
			statusLine: document.getElementById( 'status' ).textContent,
		} ) );

		// EN: The front page renders inside the iframe; read it back.
		const frame = page.frameLocator( '#blog' );
		const titleVisible = await frame
			.locator( `text=${ EXPECTED_TITLE }` )
			.count();

		await page.screenshot( {
			path: join( here, '071-now-frontpage.png' ),
			fullPage: true,
		} );

		const checks = [
			[ 'HTTP 200 from index.php', result.status === 200 ],
			[ 'seeded post title in HTML', result.html.includes( EXPECTED_TITLE ) ],
			[ 'seeded post body in HTML', result.html.includes( EXPECTED_BODY ) ],
			[ 'seeded post title visible in iframe', titleVisible > 0 ],
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
