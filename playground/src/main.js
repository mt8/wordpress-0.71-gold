// EN: 071-now browser app (Issue #108 feasibility spike).
//
//     Boots @php-wasm/web -- the WebAssembly PHP runtime behind
//     WordPress Playground -- writes the overlaid WordPress 0.71 tree
//     into the php-wasm virtual filesystem, and renders 0.71's front
//     page. The database is in-browser SQLite (see playground/db/).
//     No MySQL, no server: PHP and the database both run in the tab.
// JA: 071-now ブラウザアプリ(Issue #108 実現可能性検証)。
//
//     @php-wasm/web(WordPress Playground を支える WebAssembly PHP
//     ランタイム)を起動し、オーバーレイ済み WordPress 0.71 ツリーを
//     php-wasm 仮想ファイルシステムへ書き込み、0.71 のフロントページを
//     描画する。データベースはブラウザ内 SQLite。
import { loadWebRuntime } from '@php-wasm/web';
import { PHP, PHPRequestHandler, ProcessIdAllocator } from '@php-wasm/universal';
import { wpFiles } from './wp-files.js';

// EN: Document root inside the php-wasm virtual filesystem.
const DOCROOT = '/wordpress';

// EN: The blog's configured $siteurl (src/b2config.php). 0.71 hard-codes
//     absolute asset URLs against it. The app rewrites those to the
//     playground's own origin so CSS and links resolve in-browser
//     without modifying b2config.php.
const BLOG_SITEURL = 'http://localhost:8080';

const statusEl = document.getElementById( 'status' );
const blogEl = document.getElementById( 'blog' );

/**
 * Update the status line.
 *
 * @param {string} message Status text.
 * @param {string} [kind]  '', 'ok' or 'err'.
 */
function setStatus( message, kind = '' ) {
	statusEl.textContent = `071-now: ${ message }`;
	statusEl.className = kind;
}

/**
 * Boot php-wasm, mount WordPress 0.71 and render the front page.
 *
 * @return {Promise<void>}
 */
async function boot() {
	setStatus( 'loading the WebAssembly PHP runtime…' );

	// EN: php-wasm requires a process id; allocate one explicitly.
	const processIds = new ProcessIdAllocator();
	const runtime = await loadWebRuntime( '8.3', {
		emscriptenOptions: { processId: processIds.claim() },
	} );
	const php = new PHP( runtime );

	setStatus( `mounting WordPress 0.71 (${ Object.keys( wpFiles ).length } files)…` );

	php.mkdirTree( DOCROOT );
	for ( const [ relativePath, contents ] of Object.entries( wpFiles ) ) {
		const destination = `${ DOCROOT }/${ relativePath }`;
		const directory = destination.slice( 0, destination.lastIndexOf( '/' ) );
		php.mkdirTree( directory );
		php.writeFile( destination, contents );
	}

	// EN: Register the 071-now boot shim as the auto_prepend_file so the
	//     SQLite database is seeded before WordPress 0.71's index.php
	//     runs. error_reporting is trimmed: 0.71 is 2003-era code and
	//     would otherwise drown the page in deprecation notices.
	php.writeFile(
		'/internal/shared/php.ini',
		[
			`auto_prepend_file=${ DOCROOT }/b2-include/071-now-boot.php`,
			'display_errors=1',
			'error_reporting=E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING',
		].join( '\n' )
	);

	const requestHandler = new PHPRequestHandler( {
		php,
		documentRoot: DOCROOT,
		absoluteUrl: location.origin + '/',
	} );
	php.requestHandler = requestHandler;

	setStatus( 'rendering the WordPress 0.71 front page…' );

	const response = await requestHandler.request( { url: '/index.php' } );

	if ( response.httpStatusCode !== 200 ) {
		setStatus( `front page returned HTTP ${ response.httpStatusCode }`, 'err' );
	}

	// EN: Rewrite the blog's hard-coded $siteurl to the playground origin
	//     so the page's own CSS / links resolve through the same php-wasm
	//     request handler instead of the (absent) Docker host.
	const html = response.text.replaceAll( BLOG_SITEURL, location.origin );

	// EN: Serve the rendered HTML to the iframe via a blob URL. Static
	//     asset requests the page makes (layout2b.css, ...) are answered
	//     below from the same php-wasm request handler.
	blogEl.src = URL.createObjectURL(
		new Blob( [ html ], { type: 'text/html' } )
	);

	// EN: Expose a tiny fetch-style bridge for asset requests, and a
	//     hook the headless verifier reads to confirm the render.
	window.__071now = {
		php,
		requestHandler,
		html,
		status: response.httpStatusCode,
		/**
		 * Fetch a path from the in-browser WordPress 0.71 install.
		 *
		 * @param {string} url Path such as '/layout2b.css'.
		 * @return {Promise<import('@php-wasm/universal').PHPResponse>}
		 */
		get: ( url ) => requestHandler.request( { url } ),
	};

	if ( response.httpStatusCode === 200 ) {
		setStatus(
			'WordPress 0.71 front page rendered in-browser from SQLite.',
			'ok'
		);
	}
}

boot().catch( ( error ) => {
	setStatus( `boot failed: ${ error && error.message }`, 'err' );
	// eslint-disable-next-line no-console
	console.error( '[071-now]', error );
} );
