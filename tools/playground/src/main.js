// 071-now browser app (Issue #116, full build 1/6).
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
import { loadWebRuntime } from '@php-wasm/web';
import { PHP, PHPRequestHandler, ProcessIdAllocator } from '@php-wasm/universal';
import { wpFiles } from './wp-files.js';
import { DatabasePersistence } from './persistence.js';
import { MediaPersistence } from './media-persistence.js';
import { detectInAppBrowser } from './inapp-browser.js';

// Document root inside the php-wasm virtual filesystem.
const DOCROOT = '/wordpress';

// The SQLite database file inside the php-wasm virtual filesystem.
//     Must match WP071_DB_PATH in tools/playground/db/boot.php -- that
//     boot shim seeds and reads the database at this path, and this app
//     loads the persisted bytes into it and saves them back from it.
const DB_PATH = '/tmp/071-now.sqlite';

// The uploaded-media directory inside the php-wasm virtual
//     filesystem. WordPress 0.71's wp-admin/b2upload.php writes uploaded
//     images to $fileupload_realpath; the in-VFS copy of b2config.php is
//     rewritten so that path is this directory (see bootPhpWasm), under
//     the document root so the static-file handler can serve the images.
//     The boot shim creates this directory, and this app persists and
//     restores its contents (Issue #124).
const UPLOADS_DIR = `${ DOCROOT }/wp-content/uploads`;

// The PHP upload size limits the playground's php.ini must set
//     (Issue #178).
//
//     The playground writes its own /internal/shared/php.ini (see
//     bootPhpWasm), which fully REPLACES php-wasm's default ini. The
//     default ini raised upload_max_filesize / post_max_size to 2000M;
//     an ini that omits them lets PHP fall back to its compiled-in
//     defaults -- upload_max_filesize 2M, post_max_size 8M. WordPress
//     0.71's b2config.php allows uploads up to $fileupload_maxk (16 MB),
//     so an iPhone photo (HEIC ~2-5 MB, or the JPEG iOS transcodes a
//     HEIC to on upload, often 5-15 MB) silently failed: PHP rejected
//     the file with UPLOAD_ERR_INI_SIZE above 2 MB, or discarded $_FILES
//     entirely above the 8 MB post_max_size. The block editor's upload
//     then errored or hung. PC uploads "worked" only because they used
//     small test images. These limits restore a headroom above
//     $fileupload_maxk so a real phone photo uploads; multipart overhead
//     means post_max_size must exceed upload_max_filesize.
const PHP_UPLOAD_MAX_FILESIZE = '64M';
const PHP_POST_MAX_SIZE = '80M';

// The PHP memory_limit the playground's php.ini must set (Issue #178).
//     The php.ini the playground writes replaces php-wasm's default,
//     which set memory_limit=256M; restoring it here keeps the heap
//     headroom php-wasm intends, so a multi-megabyte upload does not
//     exhaust memory mid-request.
const PHP_MEMORY_LIMIT = '256M';

// The blog's configured $siteurl (src/b2config.php). 0.71 hard-codes
//     absolute asset URLs and internal links against it.
const BLOG_SITEURL = 'http://localhost:8080';

// The public base path the app is served under (Issue #128). Vite
//     sets import.meta.env.BASE_URL to its `base` config: '/' for the
//     local preview / headless verifier, '/wordpress-0.71-gold/' for the
//     GitHub Pages project-page deploy. Every app-owned path -- the
//     service worker, the scoped blog paths -- is built under this base
//     so a project-page deploy and a root-served preview both work. The
//     value always has a trailing slash.
const APP_BASE = import.meta.env.BASE_URL;

// Every request the in-browser blog makes is served under a single
//     scope path segment so the service worker can tell blog traffic
//     apart from the app shell. The marker must match SCOPE_MARKER in
//     public/sw.js. A per-boot random id keeps separate tabs distinct.
//     The segment sits under APP_BASE so it falls inside the service
//     worker's scope -- a service worker served from APP_BASE controls
//     only paths under APP_BASE, so on a project-page deploy a scope at
//     the origin root would never be intercepted (Issue #128).
const SCOPE_PREFIX = `${ APP_BASE }scope:${ Math.random()
	.toString( 36 )
	.slice( 2, 10 ) }`;

const statusEl = document.getElementById( 'status' );
const blogEl = document.getElementById( 'blog' );
const resetButtonEl = document.getElementById( 'reset' );
const exportButtonEl = document.getElementById( 'export' );
const importButtonEl = document.getElementById( 'import' );
const importFileEl = document.getElementById( 'import-file' );
const splashEl = document.getElementById( 'splash' );
const splashPhaseEl = document.getElementById( 'splash-phase' );
const inAppNoticeEl = document.getElementById( 'inapp-notice' );

// The query flag the "continue anyway" escape hatch sets (Issue
//     #140). When the in-app browser notice is shown and a visitor taps
//     "Continue anyway" -- in case the detection was a false positive --
//     the page reloads with this flag, and showInAppNoticeIfNeeded()
//     skips the notice on that reload so the playground boots.
const CONTINUE_ANYWAY_FLAG = '071-now-continue';

/**
 * Update the status line and, while the loading splash is still up, its
 * phase line.
 *
 * php-wasm's boot fetches and starts the ~40 MB PHP 8.3 WebAssembly
 * runtime, which takes a few seconds; index.html shows a loading splash
 * over the (blank) blog iframe meanwhile. The same message that drives
 * the toolbar status line is mirrored into the splash so a visitor sees
 * the boot progressing rather than a frozen spinner (Issue #126).
 *
 * @param {string} message Status text.
 * @param {string} [kind]  '', 'ok' or 'err'.
 */
function setStatus( message, kind = '' ) {
	statusEl.textContent = `071-now: ${ message }`;
	// The ok / err colours live on the toolbar so the reset button
	//     shares the status background.
	statusEl.parentElement.className = kind;
	// Mirror the phase into the splash while it is still visible.
	if ( splashPhaseEl && splashEl && ! splashEl.classList.contains( 'hidden' ) ) {
		splashPhaseEl.textContent = message;
	}
}

/**
 * Fade out and remove the loading splash.
 *
 * Called once the blog iframe has actually rendered the front page, so
 * the splash is replaced by the live blog rather than by a still-blank
 * frame. Idempotent -- a second call (a later navigation) is a no-op.
 */
function hideSplash() {
	if ( splashEl && ! splashEl.classList.contains( 'hidden' ) ) {
		splashEl.classList.add( 'hidden' );
	}
}

// sessionStorage key guarding the one-time cross-origin isolation
//     reload below, so the reload happens at most once per tab session
//     and a tab that never becomes isolated does not reload forever.
const COI_RELOAD_GUARD = '071-now-coi-reload';

/**
 * Register the service worker, wait until it controls this page, and --
 * on the deployed site -- reload once so the document is re-served with
 * the cross-origin isolation headers (Issue #116, #128).
 *
 * The worker must be controlling the page before the iframe is pointed
 * at a scoped URL, otherwise the first navigation would miss the
 * interception and hit the (nonexistent) network path.
 *
 * The same worker also adds the COOP/COEP headers php-wasm needs for
 * SharedArrayBuffer (Issue #128). On the first visit the host document
 * was fetched from the network before the worker controlled the page, so
 * it carried no COOP/COEP and window.crossOriginIsolated is false. The
 * local dev / preview server sends those headers itself, so there the
 * page is already isolated and no reload happens. On GitHub Pages it is
 * not, so this reloads once: the reload's document request goes through
 * the now-controlling worker, which attaches the headers, and the
 * reloaded page is cross-origin-isolated. A sessionStorage guard makes
 * the reload fire at most once.
 *
 * @return {Promise<boolean>} True when the page is reloading to become
 *                            cross-origin-isolated -- the caller must
 *                            then stop booting and let the reload run.
 */
async function registerServiceWorker() {
	if ( ! ( 'serviceWorker' in navigator ) ) {
		throw new Error( 'this browser has no service worker support' );
	}

	// sw.js sits at the app base (Vite copies public/ verbatim), so
	//     its default scope is APP_BASE -- it intercepts the scoped blog
	//     paths, which src/main.js builds under APP_BASE. On the GitHub
	//     Pages project-page deploy APP_BASE is '/wordpress-0.71-gold/',
	//     so the worker is registered (and scoped) there, not at the
	//     origin root (Issue #128).
	await navigator.serviceWorker.register( `${ APP_BASE }sw.js`, {
		type: 'classic',
	} );
	await navigator.serviceWorker.ready;

	// A freshly registered worker calls clients.claim() on activate,
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

	// Cross-origin isolation (Issue #128). php-wasm needs
	//     SharedArrayBuffer, which a browser only exposes to a
	//     cross-origin-isolated page. When the page is not isolated -- the
	//     deployed GitHub Pages document carried no COOP/COEP -- reload
	//     once: the now-controlling worker serves the reloaded document
	//     with the headers. The guard makes this a one-shot, and a worker
	//     must actually be in control for the reload to change anything.
	if (
		! self.crossOriginIsolated &&
		navigator.serviceWorker.controller &&
		! sessionStorage.getItem( COI_RELOAD_GUARD )
	) {
		sessionStorage.setItem( COI_RELOAD_GUARD, '1' );
		setStatus( 'enabling cross-origin isolation…' );
		location.reload();
		return true;
	}

	return false;
}

/**
 * Unregister every service worker registered for this origin scope.
 *
 * Part of the full reset (Issue #144). The playground's reset has to
 * leave no service worker behind: the next boot must re-register it from
 * scratch, exactly as a first visit does. unregister() does not stop a
 * worker that is currently controlling the page, but it removes the
 * registration so the post-reload boot starts clean -- registerServiceWorker()
 * then installs and activates a fresh worker.
 *
 * @return {Promise<void>}
 */
async function unregisterServiceWorkers() {
	if ( ! ( 'serviceWorker' in navigator ) ) {
		return;
	}
	const registrations = await navigator.serviceWorker.getRegistrations();
	await Promise.all(
		registrations.map( ( registration ) => registration.unregister() )
	);
}

/**
 * Delete every Cache API cache for this origin.
 *
 * Part of the full reset (Issue #144). The service worker and php-wasm
 * may populate the Cache API -- the coi-serviceworker app-shell rebuild
 * and php-wasm's runtime-asset caching both can. A full reset must clear
 * those caches so the next boot re-fetches and re-caches everything, the
 * way a first visit does.
 *
 * @return {Promise<void>}
 */
async function clearCacheStorage() {
	if ( typeof caches === 'undefined' ) {
		return;
	}
	const keys = await caches.keys();
	await Promise.all( keys.map( ( key ) => caches.delete( key ) ) );
}

/**
 * Clear the sessionStorage / localStorage the playground sets.
 *
 * Part of the full reset (Issue #144). The playground keeps a small
 * amount of Web Storage -- the cross-origin isolation first-visit reload
 * guard (COI_RELOAD_GUARD). A first visit finds none of it, so a full
 * reset clears it. The whole of each store is cleared: the playground
 * owns its origin, so nothing else is expected there, and clearing both
 * stores guarantees no stale flag survives the reload.
 */
function clearWebStorage() {
	try {
		sessionStorage.clear();
	} catch {
		// Web Storage can be unavailable (a privacy mode) -- the
		//     reset proceeds regardless.
	}
	try {
		localStorage.clear();
	} catch {
		// As above -- ignore an unavailable store.
	}
}

/**
 * Clear every piece of the playground's persistent and cached state and
 * reload to a brand-new first-visit state (Issue #144).
 *
 * The caller (resetPlayground) has already cleared the persisted SQLite
 * database and uploaded-media stores. This finishes the full reset by
 * clearing the rest -- the service worker registration, the Cache API
 * caches it or php-wasm populated, and the session/local storage -- and
 * then reloads the page. The post-reload boot therefore re-registers the
 * service worker, re-boots php-wasm, re-seeds a fresh database and starts
 * with an empty virtual filesystem: indistinguishable from a first visit.
 *
 * Each clear step is independent; a failure in one is swallowed so the
 * others and the reload still run -- a reset must not get stuck.
 *
 * @return {Promise<void>}
 */
async function clearAllStateAndReload() {
	await unregisterServiceWorkers().catch( () => {} );
	await clearCacheStorage().catch( () => {} );
	clearWebStorage();
	location.reload();
}

/**
 * Boot php-wasm and mount the overlaid WordPress 0.71 tree.
 *
 * @return {Promise<{php: PHP, requestHandler: PHPRequestHandler}>} The
 *         php-wasm instance and the request handler serving 0.71.
 */
async function bootPhpWasm() {
	setStatus( 'loading the WebAssembly PHP runtime…' );

	// php-wasm requires a process id; allocate one explicitly.
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

	// Point the blog's $siteurl at this origin's scoped path so every
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

	// Point WordPress 0.71's image-upload directory at the php-wasm
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

	// Register the 071-now boot shim as the auto_prepend_file so the
	//     SQLite database is seeded before WordPress 0.71's index.php
	//     runs. error_reporting is trimmed: 0.71 is 2003-era code and
	//     would otherwise drown the page in deprecation notices.
	//
	//     This file fully REPLACES php-wasm's default php.ini, so every
	//     directive the upload path relies on must be set here -- the
	//     upload size limits and memory_limit included. Omitting the
	//     upload limits would let PHP fall back to its compiled-in
	//     defaults (upload_max_filesize 2M, post_max_size 8M) and reject
	//     any photo bigger than 2 MB (Issue #178).
	php.writeFile(
		'/internal/shared/php.ini',
		[
			`auto_prepend_file=${ DOCROOT }/b2-include/071-now-boot.php`,
			'display_errors=1',
			'error_reporting=E_ALL & ~E_DEPRECATED & ~E_NOTICE & ~E_WARNING',
			// Upload size limits -- without these PHP would reject any
			//     upload above its 2M compiled default (Issue #178).
			`upload_max_filesize=${ PHP_UPLOAD_MAX_FILESIZE }`,
			`post_max_size=${ PHP_POST_MAX_SIZE }`,
			`memory_limit=${ PHP_MEMORY_LIMIT }`,
		].join( '\n' )
	);

	// absoluteUrl is the origin root: the service worker strips the
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
	// DB_PATH lives under /tmp; make sure the directory exists before
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
			// listFiles includes the '.'/'..' entries on some
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
 * The format marker an exported environment file carries, so an
 * imported file can be recognised as a 071-now export (Issue #207).
 */
const ENVIRONMENT_FORMAT = '071-now-environment';

/**
 * Encode a byte array as base64.
 *
 * The bytes are converted in chunks: String.fromCharCode applied to a
 * whole large array at once overflows the call stack.
 *
 * @param {Uint8Array} bytes The bytes to encode.
 * @return {string} The base64 string.
 */
function bytesToBase64( bytes ) {
	let binary = '';
	const chunkSize = 0x8000;
	for ( let i = 0; i < bytes.length; i += chunkSize ) {
		binary += String.fromCharCode.apply(
			null,
			bytes.subarray( i, i + chunkSize )
		);
	}
	return btoa( binary );
}

/**
 * Decode a base64 string to a byte array.
 *
 * @param {string} base64 The base64 string.
 * @return {Uint8Array} The decoded bytes.
 */
function base64ToBytes( base64 ) {
	const binary = atob( base64 );
	const bytes = new Uint8Array( binary.length );
	for ( let i = 0; i < binary.length; i++ ) {
		bytes[ i ] = binary.charCodeAt( i );
	}
	return bytes;
}

/**
 * Trigger a browser download of a text file.
 *
 * @param {string} filename The download file name.
 * @param {string} text     The file contents.
 * @param {string} mimeType The MIME type.
 */
function downloadTextFile( filename, text, mimeType ) {
	const blob = new Blob( [ text ], { type: mimeType } );
	const url = URL.createObjectURL( blob );
	const link = document.createElement( 'a' );
	link.href = url;
	link.download = filename;
	document.body.appendChild( link );
	link.click();
	link.remove();
	URL.revokeObjectURL( url );
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

		// PHPResponse.bytes is a Uint8Array; structured-clone copies
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
 * Show the in-app browser notice when the playground is opened inside a
 * mobile in-app browser, and report whether it was shown (Issue #140).
 *
 * The playground boots php-wasm, which needs cross-origin isolation /
 * SharedArrayBuffer and a reliably controlling service worker. Mobile
 * in-app browsers -- the WebViews embedded in apps such as X/Twitter,
 * Facebook, Instagram and LINE -- often lack or only unreliably support
 * those, so the playground would fail to boot or misbehave there. When
 * detectInAppBrowser() flags the user agent, this reveals the
 * "open in your standard browser" screen (index.html's #inapp-notice),
 * fills in the page URL, wires its copy and "continue anyway" controls,
 * and removes the loading splash so the screen is not covered. The
 * caller (boot) then stops before booting php-wasm.
 *
 * The "continue anyway" control is an escape hatch for a false positive:
 * it reloads the page with the CONTINUE_ANYWAY_FLAG query flag, and this
 * function honours that flag by skipping the notice on the reload -- so
 * the playground boots as normal.
 *
 * @return {boolean} True when the notice was shown and php-wasm must not
 *                    be booted; false when the playground should boot.
 */
function showInAppNoticeIfNeeded() {
	// Honour the "continue anyway" escape hatch -- a reload carrying
	//     the flag boots the playground even though the user agent still
	//     looks like an in-app browser.
	const params = new URLSearchParams( location.search );
	if ( params.has( CONTINUE_ANYWAY_FLAG ) ) {
		return false;
	}

	const detection = detectInAppBrowser( navigator );
	if ( ! detection.isInApp || ! inAppNoticeEl ) {
		return false;
	}

	// Show the page URL so a visitor can copy it into a standard
	//     browser; the address bar of an in-app browser is often hidden.
	const urlEl = document.getElementById( 'inapp-url' );
	if ( urlEl ) {
		urlEl.textContent = location.href;
	}

	// "Copy address" puts the URL on the clipboard. The Clipboard API
	//     is not guaranteed in every in-app browser, so a failure falls
	//     back to selecting the URL text for a manual copy.
	const copyButtonEl = document.getElementById( 'inapp-copy' );
	if ( copyButtonEl ) {
		copyButtonEl.addEventListener( 'click', async () => {
			try {
				await navigator.clipboard.writeText( location.href );
				copyButtonEl.textContent = 'Address copied';
			} catch {
				if ( urlEl ) {
					const range = document.createRange();
					range.selectNodeContents( urlEl );
					const selection = window.getSelection();
					selection.removeAllRanges();
					selection.addRange( range );
				}
				copyButtonEl.textContent = 'Press and hold to copy';
			}
		} );
	}

	// "Continue anyway" is the false-positive escape hatch: reload
	//     with the flag so this function lets the playground boot.
	const continueButtonEl = document.getElementById( 'inapp-continue' );
	if ( continueButtonEl ) {
		continueButtonEl.addEventListener( 'click', () => {
			params.set( CONTINUE_ANYWAY_FLAG, '1' );
			location.search = params.toString();
		} );
	}

	// Reveal the notice and remove the loading splash so it does not
	//     sit on top of the screen.
	inAppNoticeEl.classList.add( 'shown' );
	hideSplash();
	setStatus( 'opened in an in-app browser — open in a standard browser' );

	// Expose a hook the headless verifier reads to confirm the notice
	//     was shown in place of the php-wasm boot (Issue #140).
	window.__071now = {
		inAppBrowser: true,
		appName: detection.appName,
		reason: detection.reason,
	};

	return true;
}

/**
 * Boot php-wasm, wire up the service worker bridge and load the blog.
 *
 * @return {Promise<void>}
 */
async function boot() {
	// In-app browser check (Issue #140). When the playground is
	//     opened inside a mobile in-app browser -- a WebView that often
	//     lacks the cross-origin isolation and reliable service worker
	//     php-wasm needs -- show the "open in your standard browser"
	//     screen and stop here rather than booting into a broken
	//     playground. A standard browser boots on as before.
	if ( showInAppNoticeIfNeeded() ) {
		return;
	}

	setStatus( 'registering the request-routing service worker…' );

	// Register the service worker. On the deployed site this may
	//     trigger a one-time reload to pick up the cross-origin isolation
	//     headers (Issue #128); when it does, stop here and let the reload
	//     run -- the reloaded page boots afresh, this time isolated.
	const reloading = await registerServiceWorker();
	if ( reloading ) {
		return;
	}

	const { php, requestHandler } = await bootPhpWasm();

	// Persist the SQLite database in the browser (Issue #122). OPFS is
	//     used when available, IndexedDB otherwise. Restore any persisted
	//     database into the php-wasm filesystem before the first request:
	//     when one is found the boot shim sees an existing database and
	//     skips re-seeding, so content created through the admin on an
	//     earlier visit is what the blog renders. A first run finds none
	//     and the boot shim seeds a fresh database as before.
	//
	//     selectBackend() is awaited before the first load / save: it
	//     confirms OPFS with a real round-trip and downgrades to IndexedDB
	//     when OPFS is exposed but not usable -- WebKit / Safari, where the
	//     OPFS API is present but unusable on this path (Issue #130).
	const persistence = new DatabasePersistence();
	await persistence.selectBackend();
	const restored = await restorePersistedDatabase( php, persistence );

	// Persist the uploaded-media tree in the browser (Issue #124).
	//     WordPress 0.71's wp-admin/b2upload.php writes uploaded images
	//     under UPLOADS_DIR; the media persistence layer (the counterpart
	//     of the database one above) restores any media persisted on an
	//     earlier visit into that directory before the first request, so
	//     an uploaded image is on disk when the blog renders it, and saves
	//     it back after every request that adds or changes a file. A first
	//     run, or a boot after a reset, finds nothing persisted. Its
	//     backend is confirmed the same way as the database layer's.
	const mediaPersistence = new MediaPersistence();
	await mediaPersistence.selectBackend();
	const mediaRestored = await restorePersistedMedia( php, mediaPersistence );

	// The last database snapshot written to the persistent store.
	//     A request is persisted only when it changed the database, so a
	//     front-page view or an asset request triggers no storage write.
	let lastSavedDb = restored ? readDatabaseBytes( php ) : null;

	// The last uploaded-media tree written to the persistent store,
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

		// Persist the uploaded-media tree the same way -- an upload
		//     through the admin adds a file under UPLOADS_DIR, and that
		//     new tree is written to the media store so the image
		//     survives a reload the way the database does.
		const currentMedia = readMediaTree( php );
		if ( ! mediaTreesEqual( currentMedia, lastSavedMedia ) ) {
			await mediaPersistence.save( currentMedia );
			lastSavedMedia = currentMedia;
		}
	}

	// The service worker forwards every scoped blog request here.
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

	// Sanity-check the front page before handing it to the iframe so
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

	// On a first run this front-page request is what triggered the
	//     boot shim's seed; persist that freshly seeded database now so
	//     the seeded post survives the very first reload.
	await persistIfChanged();

	// Point the iframe at the real scoped path. The navigation and
	//     every asset request and link click inside it are intercepted
	//     by the service worker and served through php-wasm -- so the
	//     blog loads its own CSS and is fully navigable.
	//
	//     The loading splash (index.html) is removed once the iframe has
	//     actually loaded the front page, so the splash is replaced by
	//     the live blog rather than by a still-blank frame (Issue #126).
	//     A fallback timer hides it regardless after a few seconds, so a
	//     missed load event can never leave the splash stuck over a
	//     rendered blog.
	const frontPageUrl = SCOPE_PREFIX + '/index.php';
	blogEl.addEventListener( 'load', hideSplash, { once: true } );
	setTimeout( hideSplash, 4000 );
	blogEl.src = frontPageUrl;

	/**
	 * Export the environment -- the SQLite database and the uploaded
	 * media tree -- as a JSON envelope string (Issue #207).
	 *
	 * Binary parts are base64-encoded. Pending changes are flushed
	 * first so the export reflects the latest state.
	 *
	 * @return {Promise<string>} The environment envelope as JSON.
	 */
	async function exportEnvironment() {
		await persistIfChanged();
		const dbBytes   = readDatabaseBytes( php );
		const mediaTree = readMediaTree( php );
		const media     = {};
		for ( const [ path, bytes ] of Object.entries( mediaTree ) ) {
			media[ path ] = bytesToBase64( bytes );
		}
		return JSON.stringify( {
			format: ENVIRONMENT_FORMAT,
			version: 1,
			exportedAt: new Date().toISOString(),
			database: dbBytes ? bytesToBase64( dbBytes ) : null,
			media,
		} );
	}

	/**
	 * Import an environment from an exported envelope and reload.
	 *
	 * The database and uploaded media are written into the persistent
	 * store; the reload's boot-time restore then brings the imported
	 * environment up. Throws when the text is not a 071-now export.
	 *
	 * @param {string} text The environment envelope JSON.
	 * @return {Promise<void>}
	 */
	async function importEnvironment( text ) {
		let envelope;
		try {
			envelope = JSON.parse( text );
		} catch ( error ) {
			throw new Error( 'the file is not valid JSON.' );
		}
		if ( ! envelope || envelope.format !== ENVIRONMENT_FORMAT ) {
			throw new Error(
				'the file is not a 071-now environment export.'
			);
		}
		if ( envelope.database ) {
			await persistence.save( base64ToBytes( envelope.database ) );
		}
		const mediaTree = {};
		for ( const [ path, encoded ] of Object.entries(
			envelope.media || {}
		) ) {
			mediaTree[ path ] = base64ToBytes( encoded );
		}
		// Clear first so media from the replaced environment cannot
		//     linger alongside the imported tree.
		await mediaPersistence.clear();
		await mediaPersistence.save( mediaTree );
		location.reload();
	}

	/**
	 * Reset the playground to a brand-new first-visit state (Issue
	 * #122, #124; full environment reset since Issue #144).
	 *
	 * Earlier this cleared only the persisted database and uploaded
	 * media -- a database reset. State that survived the reload (the
	 * registered service worker and any Cache API caches it or
	 * php-wasm populated, and the sessionStorage / localStorage the
	 * playground sets) made it less than a full reset. This now clears
	 * every piece of the playground's persistent and cached state in
	 * one action, then reloads, so the next boot is indistinguishable
	 * from a first visit: the service worker re-registers, php-wasm
	 * re-boots, the boot shim re-seeds a fresh database, and the
	 * in-browser virtual filesystem starts empty.
	 *
	 * @return {Promise<void>}
	 */
	async function resetPlayground() {
		// Clear the persisted SQLite database and uploaded-media
		//     stores, and drop the in-VFS database file so the current
		//     php-wasm instance holds no stale content either.
		await persistence.clear();
		await mediaPersistence.clear();
		if ( php.fileExists( DB_PATH ) ) {
			php.unlink( DB_PATH );
		}
		lastSavedDb = null;
		lastSavedMedia = {};

		// Clear the service worker, the Cache API caches and the
		//     session/local storage, then reload to a pristine
		//     first-visit state (Issue #144).
		await clearAllStateAndReload();
	}

	resetButtonEl.addEventListener( 'click', () => {
		resetButtonEl.disabled = true;
		setStatus( 'resetting the playground to a fresh first visit…' );
		resetPlayground().catch( ( error ) => {
			resetButtonEl.disabled = false;
			setStatus( `reset failed: ${ error && error.message }`, 'err' );
		} );
	} );

	exportButtonEl.addEventListener( 'click', () => {
		exportButtonEl.disabled = true;
		setStatus( 'exporting the environment…' );
		exportEnvironment()
			.then( ( envelope ) => {
				downloadTextFile(
					'071-now-environment.json',
					envelope,
					'application/json'
				);
				setStatus( 'environment exported.', 'ok' );
			} )
			.catch( ( error ) => {
				setStatus(
					`export failed: ${ error && error.message }`,
					'err'
				);
			} )
			.finally( () => {
				exportButtonEl.disabled = false;
			} );
	} );

	// Import opens the hidden file picker; its change event does the
	//     work. importEnvironment() reloads the page on success.
	importButtonEl.addEventListener( 'click', () => {
		importFileEl.click();
	} );
	importFileEl.addEventListener( 'change', () => {
		const file = importFileEl.files && importFileEl.files[ 0 ];
		importFileEl.value = '';
		if ( ! file ) {
			return;
		}
		importButtonEl.disabled = true;
		setStatus( 'importing the environment…' );
		file.text()
			.then( ( text ) => importEnvironment( text ) )
			.catch( ( error ) => {
				importButtonEl.disabled = false;
				setStatus(
					`import failed: ${ error && error.message }`,
					'err'
				);
			} );
	} );

	// Expose a hook the headless verifier reads to confirm the boot,
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
		// The number of uploaded-media files restored from the
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
		 * Reset the playground to a brand-new first-visit state -- clear
		 * every piece of persistent and cached state and reload (Issue
		 * #144).
		 *
		 * @return {Promise<void>}
		 */
		reset: resetPlayground,
		/**
		 * Export the environment (the SQLite database and uploaded
		 * media) as a JSON envelope string.
		 *
		 * @return {Promise<string>}
		 */
		exportEnvironment,
		/**
		 * Import an environment from an exported envelope string, then
		 * reload so the boot-time restore brings it up.
		 *
		 * @param {string} text The environment envelope JSON.
		 * @return {Promise<void>}
		 */
		importEnvironment,
	};

	if ( frontPage.httpStatusCode === 200 ) {
		setStatus(
			`ready — database and uploads persist via ${ persistence.backend }.`,
			'ok'
		);
	}
}

boot().catch( ( error ) => {
	// setStatus mirrors into the splash only while the splash has no
	//     'hidden' class, so a boot failure's message reaches the splash
	//     phase line; surface it on the splash mark too so a failed boot
	//     does not leave a visitor staring at "Starting WordPress 0.71".
	setStatus( `boot failed: ${ error && error.message }`, 'err' );
	const splashMarkEl = splashEl && splashEl.querySelector( '.mark' );
	if ( splashMarkEl ) {
		splashMarkEl.textContent = 'WordPress 0.71 failed to start';
	}
	// eslint-disable-next-line no-console
	console.error( '[071-now]', error );
} );
