// EN: 071-now service worker (Issue #116).
//
//     Routes playground-origin requests through the in-browser
//     @php-wasm/web request handler, the model WordPress Playground
//     uses. Without this, the rendered front page would be shown via a
//     blob: URL and its asset requests (layout2b.css, the block-library
//     CSS, ...) and link clicks would never reach php-wasm -- so the
//     page would render unstyled and could not be navigated.
//
//     The blog is served under a single scope path segment
//     (/scope:<id>/...): WordPress 0.71's b2config.php is overlaid so
//     its $siteurl points at that scoped path, hence every asset URL
//     and internal link the blog emits is same-origin and scoped. This
//     worker intercepts exactly those scoped requests, forwards them to
//     the controlling page (which owns the php-wasm request handler)
//     over a MessageChannel, and turns the reply into a Response. Every
//     other request -- the app shell, the .wasm/.data runtime assets --
//     is left to the network untouched.
// JA: 071-now サービスワーカー(Issue #116)。
//
//     playground オリジンへの要求を、ブラウザ内 @php-wasm/web リクエスト
//     ハンドラ経由でルーティングする(WordPress Playground と同じ方式)。
//     これが無いと描画済みフロントページは blob: URL で表示され、その
//     アセット要求やリンククリックが php-wasm に届かず、ページは無装飾で
//     描画され遷移もできない。
//
//     ブログは単一のスコープパスセグメント(/scope:<id>/...)配下で配信
//     される。WordPress 0.71 の b2config.php をオーバーレイして $siteurl
//     をそのスコープパスに向け、ブログが出力する全アセット URL と内部
//     リンクが同一オリジンかつスコープ付きになる。本ワーカーはそのスコープ
//     付き要求だけを横取りし、php-wasm リクエストハンドラを持つ制御中の
//     ページへ MessageChannel 経由で転送し、応答を Response に変換する。

// EN: Path segment that marks a request as belonging to the in-browser
//     blog. Must match the SCOPE_PREFIX in src/main.js.
const SCOPE_MARKER = '/scope:';

// EN: How long to wait for the controlling page to answer a forwarded
//     request before giving up. The page runs PHP in WebAssembly; the
//     first request after boot is the slowest.
const REPLY_TIMEOUT_MS = 30000;

self.addEventListener( 'install', () => {
	// EN: Activate this worker immediately instead of waiting for the
	//     previous one's clients to close.
	self.skipWaiting();
} );

self.addEventListener( 'activate', ( event ) => {
	// EN: Take control of already-open clients so the very first blog
	//     navigation after registration is intercepted.
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

	// EN: Strip the leading "/scope:<id>" segment so the path handed to
	//     the php-wasm request handler is the blog-relative path.
	const scopedPath = url.pathname.replace( /^\/scope:[^/]+/, '' ) || '/';
	const phpUrl = scopedPath + url.search;

	// EN: Collect headers as a plain object; the page re-attaches them
	//     to the php-wasm request.
	const headers = {};
	for ( const [ name, value ] of request.headers.entries() ) {
		headers[ name ] = value;
	}

	// EN: Buffer a request body for non-GET/HEAD methods (later steps
	//     add the admin write paths; the front end issues only GETs).
	let body;
	if ( request.method !== 'GET' && request.method !== 'HEAD' ) {
		body = new Uint8Array( await request.clone().arrayBuffer() );
	}

	// EN: There must be a controlling client that owns the php-wasm
	//     request handler. If there is none the page has not booted yet.
	const clients = await self.clients.matchAll( {
		includeUncontrolled: true,
		type: 'window',
	} );
	const client = clients.find( ( c ) => ! c.url.includes( SCOPE_MARKER ) );
	if ( ! client ) {
		return new Response(
			'071-now: the playground page is not ready yet.',
			{ status: 503, headers: { 'content-type': 'text/plain' } }
		);
	}

	// EN: Request/response over a dedicated MessageChannel so concurrent
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

	// EN: The php-wasm request handler returns headers as name -> string[]
	//     (one entry per header line). Flatten them onto a Headers object.
	const responseHeaders = new Headers();
	for ( const [ name, values ] of Object.entries( reply.headers || {} ) ) {
		for ( const value of values ) {
			responseHeaders.append( name, value );
		}
	}

	// EN: The dev / preview server sends the page cross-origin isolation
	//     headers (vite.config.js) because php-wasm uses SharedArrayBuffer.
	//     Under Cross-Origin-Embedder-Policy: require-corp the embedded
	//     blog iframe and its sub-resources are blocked unless they carry
	//     a compatible policy of their own. These php-wasm responses are
	//     same-origin and synthesized in the worker, so it is safe to mark
	//     them embeddable. (Production COOP/COEP hosting is a separate
	//     deployment task -- this only keeps the served responses valid.)
	responseHeaders.set( 'Cross-Origin-Embedder-Policy', 'require-corp' );
	responseHeaders.set( 'Cross-Origin-Resource-Policy', 'same-origin' );

	return new Response( reply.body, {
		status: reply.status,
		headers: responseHeaders,
	} );
}

self.addEventListener( 'fetch', ( event ) => {
	const url = new URL( event.request.url );

	// EN: Only intercept same-origin requests that carry the scope
	//     marker. The app shell (index.html, the bundled JS, the
	//     .wasm/.data runtime assets) is served straight from the
	//     network so the worker never blocks its own host page.
	if (
		url.origin === self.location.origin &&
		url.pathname.startsWith( SCOPE_MARKER )
	) {
		event.respondWith( serveThroughPhpWasm( event.request ) );
	}
} );
