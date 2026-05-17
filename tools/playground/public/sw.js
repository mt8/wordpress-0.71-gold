// 071-now service worker (Issue #116, #128).
//
//     This one service worker does two jobs.
//
//     1. Request-routing (Issue #116). It routes playground-origin
//        requests through the in-browser @php-wasm/web request handler,
//        the model WordPress Playground uses. Without this, the rendered
//        front page would be shown via a blob: URL and its asset
//        requests (layout2b.css, the block-library CSS, ...) and link
//        clicks would never reach php-wasm -- so the page would render
//        unstyled and could not be navigated.
//
//        The blog is served under a single scope path segment
//        (<base>scope:<id>/...): WordPress 0.71's b2config.php is
//        overlaid so its $siteurl points at that scoped path, hence
//        every asset URL and internal link the blog emits is same-origin
//        and scoped. This worker intercepts exactly those scoped
//        requests, forwards them to the controlling page (which owns the
//        php-wasm request handler) over a MessageChannel, and turns the
//        reply into a Response.
//
//     2. Cross-origin isolation (Issue #128). php-wasm runs PHP threads
//        on SharedArrayBuffer, which a browser only exposes to a
//        cross-origin-isolated page -- a page served with the
//        Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy
//        headers. The local dev / preview server sets them (see
//        vite.config.js), but GitHub Pages cannot set custom HTTP
//        headers. So this worker adds them itself: every other request
//        -- the app shell document, the bundled JS, the .wasm/.data
//        runtime assets -- is fetched from the network and re-served with
//        the COOP/COEP (and CORP) headers attached. This is the
//        coi-serviceworker technique; the deployed page becomes
//        cross-origin-isolated once this worker controls it.

// Path segment that marks a request as belonging to the in-browser
//     blog. Must match the SCOPE_PREFIX in src/main.js.
const SCOPE_MARKER = 'scope:';

// The public base path the app is served under. The worker is
//     registered from <base>sw.js, so its registration scope IS that
//     base -- '/' for the local preview, '/wordpress-0.71-gold/' for the
//     GitHub Pages project-page deploy. Deriving it from the scope keeps
//     the worker free of any hard-coded deploy path (Issue #128).
const APP_BASE = new URL( self.registration.scope ).pathname;

// How long to wait for the controlling page to answer a forwarded
//     request before giving up. The page runs PHP in WebAssembly; the
//     first request after boot is the slowest.
const REPLY_TIMEOUT_MS = 30000;

// The cross-origin isolation headers (Issue #128). COOP/COEP make the
//     page cross-origin-isolated so php-wasm's SharedArrayBuffer is
//     available; CORP marks the worker's own responses embeddable under
//     the require-corp policy.
const COOP_COEP_HEADERS = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp',
	'Cross-Origin-Resource-Policy': 'same-origin',
};

self.addEventListener( 'install', () => {
	// Activate this worker immediately instead of waiting for the
	//     previous one's clients to close.
	self.skipWaiting();
} );

self.addEventListener( 'activate', ( event ) => {
	// Take control of already-open clients so the very first blog
	//     navigation after registration is intercepted, and so the next
	//     document load is served with the cross-origin isolation headers.
	event.waitUntil( self.clients.claim() );
} );

/**
 * Forward an intercepted request to the controlling page and await the
 * php-wasm response.
 *
 * @param {Request} request The scoped request to serve through php-wasm.
 * @return {Promise<Response>} The response produced by the page.
 */
async function serveThroughPhpWasm( request ) {
	const url = new URL( request.url );

	// Strip the leading "<base>scope:<id>" segment so the path handed
	//     to the php-wasm request handler is the blog-relative path. The
	//     base may be '/' or a project-page sub-path; either way the
	//     scope segment is the first path segment after it.
	const scopeRegExp = new RegExp(
		`^${ APP_BASE }${ SCOPE_MARKER }[^/]+`
	);
	const scopedPath = url.pathname.replace( scopeRegExp, '' ) || '/';
	const phpUrl = scopedPath + url.search;

	// Collect headers as a plain object; the page re-attaches them
	//     to the php-wasm request.
	const headers = {};
	for ( const [ name, value ] of request.headers.entries() ) {
		headers[ name ] = value;
	}

	// Buffer a request body for non-GET/HEAD methods (the admin write
	//     paths and image upload; the front end issues only GETs).
	let body;
	if ( request.method !== 'GET' && request.method !== 'HEAD' ) {
		body = new Uint8Array( await request.clone().arrayBuffer() );
	}

	// There must be a controlling client that owns the php-wasm
	//     request handler. If there is none the page has not booted yet.
	const clients = await self.clients.matchAll( {
		includeUncontrolled: true,
		type: 'window',
	} );
	const client = clients.find(
		( c ) => ! c.url.includes( SCOPE_MARKER )
	);
	if ( ! client ) {
		return new Response(
			'071-now: the playground page is not ready yet.',
			{ status: 503, headers: { 'content-type': 'text/plain' } }
		);
	}

	// Request/response over a dedicated MessageChannel so concurrent
	//     asset requests do not cross wires.
	const reply = await new Promise( ( resolve, reject ) => {
		const channel = new MessageChannel();
		const timer = setTimeout( () => {
			channel.port1.close();
			reject( new Error( 'php-wasm request timed out' ) );
		}, REPLY_TIMEOUT_MS );

		channel.port1.onmessage = ( messageEvent ) => {
			clearTimeout( timer );
			channel.port1.close();
			resolve( messageEvent.data );
		};

		client.postMessage(
			{
				type: '071-now-request',
				request: {
					url: phpUrl,
					method: request.method,
					headers,
					body,
				},
			},
			[ channel.port2 ]
		);
	} );

	if ( reply.error ) {
		return new Response( `071-now: ${ reply.error }`, {
			status: 500,
			headers: { 'content-type': 'text/plain' },
		} );
	}

	// The php-wasm request handler returns headers as name -> string[]
	//     (one entry per header line). Flatten them onto a Headers object.
	const responseHeaders = new Headers();
	for ( const [ name, values ] of Object.entries( reply.headers || {} ) ) {
		for ( const value of values ) {
			responseHeaders.append( name, value );
		}
	}

	// The page is cross-origin-isolated (the document was served with
	//     COOP/COEP -- by the dev/preview server, or by this worker on the
	//     deployed site). Under Cross-Origin-Embedder-Policy: require-corp
	//     the embedded blog iframe and its sub-resources are blocked unless
	//     they carry a compatible policy of their own. These php-wasm
	//     responses are same-origin and synthesized in the worker, so it is
	//     safe to mark them embeddable.
	for ( const [ name, value ] of Object.entries( COOP_COEP_HEADERS ) ) {
		responseHeaders.set( name, value );
	}

	return new Response( reply.body, {
		status: reply.status,
		headers: responseHeaders,
	} );
}

/**
 * Fetch an app-shell request from the network and re-serve it with the
 * cross-origin isolation headers attached (Issue #128).
 *
 * This is the coi-serviceworker technique. GitHub Pages serves the app
 * shell -- the host document, the bundled JS, the .wasm/.data runtime
 * assets -- with no COOP/COEP headers, so the page is not
 * cross-origin-isolated and php-wasm's SharedArrayBuffer is unavailable.
 * This worker fetches the response and rebuilds it with COOP/COEP (and
 * CORP) added, so once it controls the page the next document load is
 * isolated.
 *
 * @param {Request} request The app-shell request.
 * @return {Promise<Response>} The network response with the COOP/COEP
 *                             (and CORP) headers attached.
 */
async function serveCrossOriginIsolated( request ) {
	const response = await fetch( request );

	// An opaque response (a no-cors cross-origin fetch) has an
	//     unreadable, immutable body and headers -- it cannot be rebuilt,
	//     and an opaque resource is blocked under require-corp anyway.
	//     Pass it through untouched; the COOP/COEP rebuild only applies to
	//     the app's own same-origin responses.
	if ( response.type === 'opaque' || response.type === 'opaqueredirect' ) {
		return response;
	}

	const headers = new Headers( response.headers );
	for ( const [ name, value ] of Object.entries( COOP_COEP_HEADERS ) ) {
		headers.set( name, value );
	}

	return new Response( response.body, {
		status: response.status,
		statusText: response.statusText,
		headers,
	} );
}

self.addEventListener( 'fetch', ( event ) => {
	const url = new URL( event.request.url );
	const sameOrigin = url.origin === self.location.origin;

	// Scoped blog requests -- the in-browser blog's pages, assets and
	//     link clicks -- are served through php-wasm (Issue #116).
	if (
		sameOrigin &&
		url.pathname.startsWith( APP_BASE + SCOPE_MARKER )
	) {
		event.respondWith( serveThroughPhpWasm( event.request ) );
		return;
	}

	// Every other request -- the app shell document, the bundled JS,
	//     the .wasm/.data runtime assets -- is fetched from the network and
	//     re-served with the cross-origin isolation headers, so the
	//     deployed page becomes cross-origin-isolated (Issue #128).
	//
	//     Only same-origin GET requests are rebuilt: a request that is not
	//     a plain GET, or one to another origin, is left to the network so
	//     the worker never interferes with anything it does not need to.
	if ( sameOrigin && event.request.method === 'GET' ) {
		event.respondWith( serveCrossOriginIsolated( event.request ) );
	}
} );
