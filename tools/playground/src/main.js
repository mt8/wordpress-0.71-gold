// EN: 071-now browser app (Issue #116, full build 1/6).
//
//     Boots @php-wasm/web -- the WebAssembly PHP runtime behind
//     WordPress Playground -- writes the overlaid WordPress 0.71 tree
//     into the php-wasm virtual filesystem, and serves 0.71 through a
//     service worker so the in-browser blog is reachable at real
//     same-origin paths.
//
//     The spike (Issue #108) rendered 0.71's front-page HTML into a
//     blob: URL iframe. Because of the blob URL the page's asset
//     requests (layout2b.css, the block-library CSS) and link clicks
//     never reached php-wasm, so the page rendered unstyled and could
//     not be navigated. This build fixes that the way WordPress
//     Playground does: a service worker (public/sw.js) intercepts the
//     blog's scoped same-origin requests and routes them, via this
//     page, through the @php-wasm/web request handler. The iframe is
//     then pointed at a real scoped path (/scope:<id>/index.php) and
//     the blog serves its own CSS and follows its own links.
//
//     The database is in-browser SQLite (see playground/db/). No MySQL,
//     no server: PHP and the database both run in the tab.
// JA: 071-now ブラウザアプリ(Issue #116、フル実装 1/6)。
//
//     @php-wasm/web(WordPress Playground を支える WebAssembly PHP
//     ランタイム)を起動し、オーバーレイ済み WordPress 0.71 ツリーを
//     php-wasm 仮想ファイルシステムへ書き込み、サービスワーカー経由で
//     0.71 を同一オリジンの実パスで配信する。
//
//     スパイク(Issue #108)は 0.71 のフロントページ HTML を blob: URL の
//     iframe に描画した。blob URL のためアセット要求やリンククリックが
//     php-wasm に届かず、ページは無装飾で描画され遷移もできなかった。本
//     実装は WordPress Playground と同じ方式でそれを解決する。サービス
//     ワーカー(public/sw.js)がブログのスコープ付き同一オリジン要求を
//     横取りし、本ページ経由で @php-wasm/web リクエストハンドラへ通す。
//     iframe を実スコープパス(/scope:<id>/index.php)に向け、ブログは
//     自身の CSS を読み込み自身のリンクを辿る。
import { loadWebRuntime } from '@php-wasm/web';
import { PHP, PHPRequestHandler, ProcessIdAllocator } from '@php-wasm/universal';
import { wpFiles } from './wp-files.js';
import { DatabasePersistence } from './persistence.js';
import { MediaPersistence } from './media-persistence.js';

// EN: Document root inside the php-wasm virtual filesystem.
const DOCROOT = '/wordpress';

// EN: The SQLite database file inside the php-wasm virtual filesystem.
//     Must match WP071_DB_PATH in tools/playground/db/boot.php -- that
//     boot shim seeds and reads the database at this path, and this app
//     loads the persisted bytes into it and saves them back from it.
const DB_PATH = '/tmp/071-now.sqlite';

// EN: The uploaded-media directory inside the php-wasm virtual
//     filesystem. WordPress 0.71's wp-admin/b2upload.php writes uploaded
//     images to $fileupload_realpath; the in-VFS copy of b2config.php is
//     rewritten so that path is this directory (see bootPhpWasm), under
//     the document root so the static-file handler can serve the images.
//     The boot shim creates this directory, and this app persists and
//     restores its contents (Issue #124).
const UPLOADS_DIR = `${ DOCROOT }/wp-content/uploads`;

// EN: The blog's configured $siteurl (src/b2config.php). 0.71 hard-codes
//     absolute asset URLs and internal links against it.
const BLOG_SITEURL = 'http://localhost:8080';

// EN: Every request the in-browser blog makes is served under a single
//     scope path segment so the service worker can tell blog traffic
//     apart from the app shell. The marker must match SCOPE_MARKER in
//     public/sw.js. A per-boot random id keeps separate tabs distinct.
const SCOPE_PREFIX = `/scope:${ Math.random().toString( 36 ).slice( 2, 10 ) }`;

const statusEl = document.getElementById( 'status' );
const blogEl = document.getElementById( 'blog' );
const resetButtonEl = document.getElementById( 'reset' );

/**
 * Update the status line.
 *
 * @param {string} message Status text.
 * @param {string} [kind]  '', 'ok' or 'err'.
 */
function setStatus( message, kind = '' ) {
	statusEl.textContent = `071-now: ${ message }`;
	// EN: The ok / err colours live on the toolbar so the reset button
	//     shares the status background.
	statusEl.parentElement.className = kind;
}

/**
 * Register the request-routing service worker and wait until it
 * controls this page.
 *
 * The worker must be controlling the page before the iframe is pointed
 * at a scoped URL, otherwise the first navigation would miss the
 * interception and hit the (nonexistent) network path.
 *
 * @return {Promise<void>}
 */
async function registerServiceWorker() {
	if ( ! ( 'serviceWorker' in navigator ) ) {
		throw new Error( 'this browser has no service worker support' );
	}

	// EN: sw.js sits at the app root (Vite copies public/ verbatim), so
	//     its default scope is the whole origin -- it can intercept the
	//     scoped blog paths.
	await navigator.serviceWorker.register( '/sw.js', { type: 'classic' } );
	await navigator.serviceWorker.ready;

	// EN: A freshly registered worker calls clients.claim() on activate,
	//     but the current page may still be uncontrolled for a tick.
	//     Wait for the controllerchange unless it already controls us.
	if ( ! navigator.serviceWorker.controller ) {
		await new Promise( ( resolve ) => {
			navigator.serviceWorker.addEventListener(
				'controllerchange',
				() => resolve(),
				{ once: true }
			);
		} );
	}
}

/**
 * Boot php-wasm and mount the overlaid WordPress 0.71 tree.
 *
 * @return {Promise<{php: PHP, requestHandler: PHPRequestHandler}>} The
 *         php-wasm instance and the request handler serving 0.71.
 */
async function bootPhpWasm() {
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

	// EN: Point the blog's $siteurl at this origin's scoped path so every
	//     page it renders (front page, post pages, archives) emits its
	//     own assets and internal links as same-origin, scoped URLs the
	//     service worker intercepts.
	//
	//     b2config.php also derives $abspath -- the include path WordPress
	//     0.71 uses for require_once -- from $siteurl by treating its path
	//     component as a filesystem-relative path (line ~371-376). The
	//     scope segment is a URL routing concern, not a filesystem one, so
	//     that derivation is replaced with the plain document root; the
	//     blog tree is mounted directly at DOCROOT.
	//
	//     Both rewrites touch only the in-VFS copy of b2config.php -- src/
	//     and the on-disk overlay are never modified.
	const scopedSiteUrl = location.origin + SCOPE_PREFIX;
	const configPath = `${ DOCROOT }/b2config.php`;
	let config = php.readFileAsText( configPath );
	config = config.replaceAll( BLOG_SITEURL, scopedSiteUrl );
	config = config.replace(
		"$abspath    = getenv( 'DOCUMENT_ROOT' ) . $relpath . '/';",
		"$abspath    = getenv( 'DOCUMENT_ROOT' ) . '/';"
	);

	// EN: Point WordPress 0.71's image-upload directory at the php-wasm
	//     virtual filesystem (Issue #124). b2config.php hard-codes
	//     $fileupload_realpath at the Docker document root
	//     (/var/www/html/wp-content/uploads), a path that does not exist
	//     in the in-browser VFS -- so wp-admin/b2upload.php's
	//     move_uploaded_file() / realpath() would fail. Rewrite it to the
	//     uploads directory under DOCROOT (the boot shim creates that
	//     directory). $fileupload_url is derived from $siteurl, which is
	//     already rewritten to the scoped path above, so an uploaded
	//     image's URL is a scoped same-origin path the service worker
	//     intercepts and the static-file handler serves from the VFS.
	//     Like the other rewrites here this touches only the in-VFS copy
	//     -- src/ and the on-disk overlay are never modified.
	config = config.replace(
		"$fileupload_realpath = '/var/www/html/wp-content/uploads';",
		`$fileupload_realpath = '${ UPLOADS_DIR }';`
	);
	php.writeFile( configPath, config );

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

	// EN: absoluteUrl is the origin root: the service worker strips the
	//     /scope:<id> segment before handing the path to the handler, so
	//     the handler always sees a plain blog-relative path.
	const requestHandler = new PHPRequestHandler( {
		php,
		documentRoot: DOCROOT,
		absoluteUrl: location.origin + '/',
	} );
	php.requestHandler = requestHandler;

	return { php, requestHandler };
}

/**
 * Load a persisted SQLite database into the php-wasm virtual filesystem.
 *
 * Called once, before the first request is served. When a database has
 * been persisted (a returning visitor) its bytes are written to DB_PATH,
 * so the boot shim's `file_exists( WP071_DB_PATH )` check sees an
 * existing database and skips re-seeding -- the persisted content (posts
 * and categories created through the admin) is what the blog renders.
 * When nothing is persisted (a first run, or after a reset) DB_PATH is
 * left absent and the boot shim seeds a fresh database as before.
 *
 * @param {PHP}                 php         The php-wasm instance.
 * @param {DatabasePersistence} persistence The persistence handle.
 * @return {Promise<boolean>} True when a persisted database was restored.
 */
async function restorePersistedDatabase( php, persistence ) {
	const bytes = await persistence.load();
	if ( ! bytes ) {
		return false;
	}
	// EN: DB_PATH lives under /tmp; make sure the directory exists before
	//     writing the restored database file into it.
	php.mkdirTree( DB_PATH.slice( 0, DB_PATH.lastIndexOf( '/' ) ) );
	php.writeFile( DB_PATH, bytes );
	return true;
}

/**
 * Restore a persisted uploaded-media tree into the php-wasm filesystem.
 *
 * Called once, before the first request is served. WordPress 0.71's
 * wp-admin/b2upload.php writes uploaded images under UPLOADS_DIR; this
 * writes any media persisted on an earlier visit back into that directory
 * so an uploaded image is on disk before the blog renders it. When
 * nothing is persisted (a first run, or after a reset) the directory is
 * left empty.
 *
 * @param {PHP}              php         The php-wasm instance.
 * @param {MediaPersistence} persistence The media persistence handle.
 * @return {Promise<number>} The number of media files restored.
 */
async function restorePersistedMedia( php, persistence ) {
	const tree = await persistence.load();
	if ( ! tree ) {
		return 0;
	}
	for ( const [ relativePath, bytes ] of Object.entries( tree ) ) {
		const destination = `${ UPLOADS_DIR }/${ relativePath }`;
		php.mkdirTree( destination.slice( 0, destination.lastIndexOf( '/' ) ) );
		php.writeFile( destination, bytes );
	}
	return Object.keys( tree ).length;
}

/**
 * Read the uploaded-media tree from the php-wasm filesystem.
 *
 * Walks UPLOADS_DIR recursively and returns a relative-path -> bytes map,
 * the shape MediaPersistence stores. The bytes are copied out of the
 * php-wasm heap (readFileAsBuffer may return a view backed by the shared
 * WASM memory) so a later PHP write cannot mutate them.
 *
 * @param {PHP} php The php-wasm instance.
 * @return {Object<string,Uint8Array>} The relative-path -> bytes map
 *                                     (empty when nothing is uploaded).
 */
function readMediaTree( php ) {
	const tree = {};
	if ( ! php.isDir( UPLOADS_DIR ) ) {
		return tree;
	}

	/**
	 * Recurse into one directory of the uploads tree.
	 *
	 * @param {string} absoluteDir Absolute directory path in the VFS.
	 * @param {string} prefix      Path prefix relative to UPLOADS_DIR.
	 */
	const walk = ( absoluteDir, prefix ) => {
		for ( const name of php.listFiles( absoluteDir ) ) {
			// EN: listFiles includes the '.'/'..' entries on some
			//     emscripten builds; skip them so the walk terminates.
			if ( name === '.' || name === '..' ) {
				continue;
			}
			const absolute = `${ absoluteDir }/${ name }`;
			const relative = prefix ? `${ prefix }/${ name }` : name;
			if ( php.isDir( absolute ) ) {
				walk( absolute, relative );
			} else {
				tree[ relative ] = new Uint8Array(
					php.readFileAsBuffer( absolute )
				);
			}
		}
	};

	walk( UPLOADS_DIR, '' );
	return tree;
}

/**
 * Whether two uploaded-media trees hold identical content.
 *
 * Used to skip persisting the media when a request did not change it --
 * only an upload through wp-admin/b2upload.php adds or changes a file, so
 * a front-page view or an asset request leaves the tree untouched.
 *
 * @param {Object<string,Uint8Array>} a First media tree.
 * @param {Object<string,Uint8Array>} b Second media tree.
 * @return {boolean} True when both hold the same files, byte-for-byte.
 */
function mediaTreesEqual( a, b ) {
	const aKeys = Object.keys( a );
	const bKeys = Object.keys( b );
	if ( aKeys.length !== bKeys.length ) {
		return false;
	}
	for ( const key of aKeys ) {
		if ( ! bytesEqual( a[ key ], b[ key ] ) ) {
			return false;
		}
	}
	return true;
}

/**
 * Read the current SQLite database bytes from the php-wasm filesystem.
 *
 * The bytes are copied out of the php-wasm heap: readFileAsBuffer may
 * return a view backed by the (possibly shared) WASM memory, which a
 * later PHP write would mutate under us. A standalone copy is what the
 * persistent store and the change comparison need.
 *
 * @param {PHP} php The php-wasm instance.
 * @return {Uint8Array|null} The database bytes, or null when the file is
 *                           not present.
 */
function readDatabaseBytes( php ) {
	if ( ! php.fileExists( DB_PATH ) ) {
		return null;
	}
	return new Uint8Array( php.readFileAsBuffer( DB_PATH ) );
}

/**
 * Whether two byte arrays hold identical content.
 *
 * Used to skip persisting the database when a request did not change it
 * -- a front-page view or an asset request leaves the database untouched,
 * and only writes (a new post, an edit, a new category) need saving.
 *
 * @param {Uint8Array|null} a First byte array.
 * @param {Uint8Array|null} b Second byte array.
 * @return {boolean} True when both are present and byte-for-byte equal.
 */
function bytesEqual( a, b ) {
	if ( ! a || ! b || a.length !== b.length ) {
		return false;
	}
	for ( let i = 0; i < a.length; i++ ) {
		if ( a[ i ] !== b[ i ] ) {
			return false;
		}
	}
	return true;
}

/**
 * Serve one service-worker-forwarded request through php-wasm and reply
 * over the request's MessagePort.
 *
 * @param {PHPRequestHandler} requestHandler The php-wasm request handler.
 * @param {object}            request        Forwarded request descriptor.
 * @param {MessagePort}       port           Port to post the reply on.
 * @return {Promise<import('@php-wasm/universal').PHPResponse|null>}
 *         The php-wasm response, or null on failure.
 */
async function handleForwardedRequest( requestHandler, request, port ) {
	try {
		const response = await requestHandler.request( {
			url: request.url,
			method: request.method,
			headers: request.headers,
			...( request.body ? { body: request.body } : {} ),
		} );

		// EN: PHPResponse.bytes is a Uint8Array; structured-clone copies
		//     it to the worker. headers is name -> string[].
		port.postMessage( {
			status: response.httpStatusCode,
			headers: response.headers,
			body: response.bytes,
		} );
		return response;
	} catch ( error ) {
		port.postMessage( {
			error: ( error && error.message ) || 'php-wasm request failed',
		} );
		return null;
	}
}

/**
 * Boot php-wasm, wire up the service worker bridge and load the blog.
 *
 * @return {Promise<void>}
 */
async function boot() {
	setStatus( 'registering the request-routing service worker…' );
	await registerServiceWorker();

	const { php, requestHandler } = await bootPhpWasm();

	// EN: Persist the SQLite database in the browser (Issue #122). OPFS is
	//     used when available, IndexedDB otherwise. Restore any persisted
	//     database into the php-wasm filesystem before the first request:
	//     when one is found the boot shim sees an existing database and
	//     skips re-seeding, so content created through the admin on an
	//     earlier visit is what the blog renders. A first run finds none
	//     and the boot shim seeds a fresh database as before.
	const persistence = new DatabasePersistence();
	const restored = await restorePersistedDatabase( php, persistence );

	// EN: Persist the uploaded-media tree in the browser (Issue #124).
	//     WordPress 0.71's wp-admin/b2upload.php writes uploaded images
	//     under UPLOADS_DIR; the media persistence layer (the counterpart
	//     of the database one above) restores any media persisted on an
	//     earlier visit into that directory before the first request, so
	//     an uploaded image is on disk when the blog renders it, and saves
	//     it back after every request that adds or changes a file. A first
	//     run, or a boot after a reset, finds nothing persisted.
	const mediaPersistence = new MediaPersistence();
	const mediaRestored = await restorePersistedMedia( php, mediaPersistence );

	// EN: The last database snapshot written to the persistent store.
	//     A request is persisted only when it changed the database, so a
	//     front-page view or an asset request triggers no storage write.
	let lastSavedDb = restored ? readDatabaseBytes( php ) : null;

	// EN: The last uploaded-media tree written to the persistent store,
	//     compared the same way so only an upload triggers a storage write.
	let lastSavedMedia = readMediaTree( php );

	/**
	 * Persist the SQLite database if the latest request changed it.
	 *
	 * @return {Promise<void>}
	 */
	async function persistIfChanged() {
		const current = readDatabaseBytes( php );
		if ( current && ! bytesEqual( current, lastSavedDb ) ) {
			await persistence.save( current );
			lastSavedDb = current;
		}

		// EN: Persist the uploaded-media tree the same way -- an upload
		//     through the admin adds a file under UPLOADS_DIR, and that
		//     new tree is written to the media store so the image
		//     survives a reload the way the database does.
		const currentMedia = readMediaTree( php );
		if ( ! mediaTreesEqual( currentMedia, lastSavedMedia ) ) {
			await mediaPersistence.save( currentMedia );
			lastSavedMedia = currentMedia;
		}
	}

	// EN: The service worker forwards every scoped blog request here.
	//     Answer each one through the php-wasm request handler, reply on
	//     the MessagePort that came with the message, then persist the
	//     database if that request changed it -- so a post or category
	//     created through the admin is saved the moment the form submit
	//     finishes.
	let firstResponseStatus = null;
	navigator.serviceWorker.addEventListener( 'message', async ( event ) => {
		if ( ! event.data || event.data.type !== '071-now-request' ) {
			return;
		}
		const port = event.ports[ 0 ];
		const response = await handleForwardedRequest(
			requestHandler,
			event.data.request,
			port
		);
		if ( firstResponseStatus === null && response ) {
			firstResponseStatus = response.httpStatusCode;
		}
		await persistIfChanged();
	} );

	setStatus( 'serving the WordPress 0.71 front page…' );

	// EN: Sanity-check the front page before handing it to the iframe so
	//     a boot failure shows up in the status line rather than as a
	//     blank frame. This goes straight through the handler.
	const frontPage = await requestHandler.request( {
		url: '/index.php',
	} );
	if ( frontPage.httpStatusCode !== 200 ) {
		setStatus(
			`front page returned HTTP ${ frontPage.httpStatusCode }`,
			'err'
		);
	}

	// EN: On a first run this front-page request is what triggered the
	//     boot shim's seed; persist that freshly seeded database now so
	//     the seeded post survives the very first reload.
	await persistIfChanged();

	// EN: Point the iframe at the real scoped path. The navigation and
	//     every asset request and link click inside it are intercepted
	//     by the service worker and served through php-wasm -- so the
	//     blog loads its own CSS and is fully navigable.
	const frontPageUrl = SCOPE_PREFIX + '/index.php';
	blogEl.src = frontPageUrl;

	/**
	 * Reset the playground to a fresh seeded state (Issue #122, #124).
	 *
	 * Clears the persistent database store and the in-VFS database file,
	 * and the persistent media store too (Issue #124), then reloads the
	 * page. The next boot finds nothing persisted, so the boot shim seeds
	 * a fresh database -- the playground is back to its clean state and
	 * every post, category and uploaded image added through the admin is
	 * gone.
	 *
	 * @return {Promise<void>}
	 */
	async function resetDatabase() {
		await persistence.clear();
		await mediaPersistence.clear();
		if ( php.fileExists( DB_PATH ) ) {
			php.unlink( DB_PATH );
		}
		lastSavedDb = null;
		lastSavedMedia = {};
		location.reload();
	}

	resetButtonEl.addEventListener( 'click', () => {
		resetButtonEl.disabled = true;
		setStatus( 'resetting to a fresh seeded database…' );
		resetDatabase().catch( ( error ) => {
			resetButtonEl.disabled = false;
			setStatus( `reset failed: ${ error && error.message }`, 'err' );
		} );
	} );

	// EN: Expose a hook the headless verifier reads to confirm the boot,
	//     plus a fetch-style bridge for direct request-handler probes and
	//     the persistence controls (the backend in use and the reset).
	window.__071now = {
		requestHandler,
		scopePrefix: SCOPE_PREFIX,
		frontPageUrl,
		status: frontPage.httpStatusCode,
		html: frontPage.text,
		persistenceBackend: persistence.backend,
		databaseRestored: restored,
		// EN: The number of uploaded-media files restored from the
		//     persistent store at boot (Issue #124). The verifier reads
		//     this after a reload to confirm an uploaded image was
		//     restored, and after a reset to confirm it was cleared.
		mediaRestoredCount: mediaRestored,
		/**
		 * Fetch a path from the in-browser WordPress 0.71 install.
		 *
		 * @param {string} url Blog-relative path such as '/layout2b.css'.
		 * @return {Promise<import('@php-wasm/universal').PHPResponse>}
		 */
		get: ( url ) => requestHandler.request( { url } ),
		/**
		 * Persist the database and uploaded media now if they changed.
		 *
		 * Each request already persists them when it changed them; this
		 * lets a caller force-flush before a reload, used by the headless
		 * verifier so its assertions never race the save.
		 *
		 * @return {Promise<void>}
		 */
		persist: persistIfChanged,
		/**
		 * Reset the playground to a fresh seeded state.
		 *
		 * @return {Promise<void>}
		 */
		reset: resetDatabase,
	};

	if ( frontPage.httpStatusCode === 200 ) {
		setStatus(
			`WordPress 0.71 served in-browser; database and uploads persisted via ${ persistence.backend }.`,
			'ok'
		);
	}
}

boot().catch( ( error ) => {
	setStatus( `boot failed: ${ error && error.message }`, 'err' );
	// eslint-disable-next-line no-console
	console.error( '[071-now]', error );
} );
