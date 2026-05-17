// @ts-check
const { expect } = require( '@playwright/test' );

/**
 * EN: Shared helpers for the 071-now playground E2E suite (Issue #141).
 *
 *     The playground (tools/playground/) boots @php-wasm/web in the
 *     browser tab and serves WordPress 0.71 through a service worker.
 *     The host page is a thin chrome around a blog iframe; the WordPress
 *     0.71 blog itself is reachable inside that iframe at a per-boot
 *     scoped same-origin path. These helpers wrap the awkward parts so
 *     the spec files read as plain `test()` cases: waiting for php-wasm
 *     to boot, pointing the blog iframe at a scoped path and waiting for
 *     the right frame, asserting on the rendered text (a form submit
 *     leaves the iframe URL unchanged), and driving the reset control.
 *
 *     The logic here is the helper layer the bespoke verify.mjs script
 *     carried inline -- it is folded into proper `@playwright/test`
 *     helpers so the specs supersede that script (Issue #141).
 * JA: 071-now playground E2E スイートの共有ヘルパー(Issue #141)。
 *
 *     playground(tools/playground/)はブラウザタブ内で @php-wasm/web を
 *     起動し、サービスワーカー経由で WordPress 0.71 を配信する。ホスト
 *     ページはブログ iframe を囲む薄いクロームで、WordPress 0.71 ブログ
 *     自体はその iframe 内の起動ごとのスコープ付き同一オリジンパスで
 *     到達できる。これらのヘルパーは厄介な部分 -- php-wasm の起動待ち、
 *     ブログ iframe をスコープ付きパスへ向け正しいフレームを待つこと、
 *     描画されたテキストの検証(フォーム送信は iframe の URL を変えない)、
 *     リセット操作の駆動 -- を包み、spec ファイルが素の `test()` ケース
 *     として読めるようにする。
 *
 *     ここのロジックは手書きの verify.mjs スクリプトがインラインで持って
 *     いたヘルパー層であり、spec がそのスクリプトを置き換えられるよう
 *     本格的な `@playwright/test` ヘルパーへ取り込んだもの(Issue #141)。
 */

// EN: How long php-wasm's boot may take. The PHP 8.3 .wasm runtime is
//     roughly 40 MB, so a cold boot is several seconds; WebKit is
//     slower than Chromium. 60 s leaves generous headroom.
// JA: php-wasm の起動に許す時間。PHP 8.3 の .wasm ランタイムは約 40 MB で
//     コールドブートは数秒、WebKit は Chromium より遅い。60 秒は十分。
const BOOT_TIMEOUT = 60 * 1000;

// EN: An in-app browser user-agent (Issue #140) -- a real mobile in-app
//     browser string, the X/Twitter iOS in-app browser: an iOS WKWebView
//     ("AppleWebKit ... Mobile" with no "Safari/" token) that also
//     carries the "Twitter" app marker. The in-app-browser spec opens
//     the playground with this user-agent and asserts the "open in your
//     standard browser" screen is shown instead of php-wasm booting.
// JA: アプリ内ブラウザのユーザーエージェント(Issue #140)。実在する
//     モバイルアプリ内ブラウザ文字列で、X/Twitter の iOS アプリ内
//     ブラウザ。"Safari/" トークンを持たない iOS WKWebView で
//     "Twitter" アプリマーカーも持つ。
const INAPP_USER_AGENT =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) ' +
	'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Twitter for iPhone';

/**
 * EN: Wait for the 071-now app to finish booting.
 *
 *     The app sets `window.__071now` with a numeric `status` once
 *     php-wasm is up and the front page has been served through the
 *     request handler. Awaited on the initial load and after every
 *     reload the persistence specs perform.
 * JA: 071-now アプリの起動完了を待つ。
 *
 *     php-wasm が起動しフロントページがリクエストハンドラ経由で配信
 *     されると、アプリは数値の `status` を持つ `window.__071now` を
 *     設定する。
 *
 * @param {import('@playwright/test').Page} page The host page. / ホストページ。
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
 * EN: Open the playground host page and wait for php-wasm to boot.
 * JA: playground ホストページを開き php-wasm の起動を待つ。
 *
 * @param {import('@playwright/test').Page} page The host page. / ホストページ。
 */
async function openPlayground( page ) {
	await page.goto( '/', { waitUntil: 'load' } );
	await waitForBoot( page );
}

/**
 * EN: Wait until the blog iframe has navigated to a scoped path whose
 *     URL matches the given predicate, then return that frame.
 *
 *     The matched frame can be detached between being found and having
 *     its body awaited -- the blog iframe re-navigates, and WebKit in
 *     particular swaps the frame out mid-wait. A `waitForSelector` on a
 *     detached frame throws "Frame was detached"; that is treated as
 *     "not ready yet" and the loop retries until a stable frame is found
 *     or the deadline passes.
 * JA: ブログ iframe がスコープ付きパスへ遷移し、URL が指定の述語に
 *     一致するまで待ち、そのフレームを返す。
 *
 *     一致したフレームは、見つかってから body を待つ間に detach され
 *     うる -- ブログ iframe は再遷移し、特に WebKit は待機中にフレームを
 *     入れ替える。detach されたフレームへの `waitForSelector` は
 *     "Frame was detached" を投げる。それは「まだ準備できていない」と
 *     扱い、安定したフレームが見つかるか期限切れまでループを再試行する。
 *
 * @param {import('@playwright/test').Page} page  The host page. / ホストページ。
 * @param {(url: string) => boolean}        match URL predicate. / URL 述語。
 * @return {Promise<import('@playwright/test').Frame>} The blog frame. / ブログフレーム。
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
				// EN: Make sure the document has actually rendered its body.
				// JA: ドキュメントが実際に body を描画したことを確認する。
				await frame.waitForSelector( 'body', { timeout: 10000 } );
				return frame;
			} catch ( error ) {
				// EN: A detached frame means the iframe re-navigated mid
				//     wait -- retry the loop to pick up the new frame.
				// JA: detach されたフレームは iframe が待機中に再遷移した
				//     ことを意味する -- ループを再試行し新フレームを拾う。
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
 * EN: Point the blog iframe at a scoped blog path and return the frame
 *     once it has loaded there.
 *
 *     The blog is served under the per-boot scope segment the app picked
 *     (`window.__071now.scopePrefix`); a blog-relative path is resolved
 *     against it so the navigation goes through the service worker.
 * JA: ブログ iframe をスコープ付きブログパスへ向け、そこへ読み込まれた
 *     フレームを返す。
 *
 *     ブログはアプリが選んだ起動ごとのスコープ区間
 *     (`window.__071now.scopePrefix`)配下で配信される。ブログ相対パスを
 *     それに対して解決し、遷移がサービスワーカーを経由するようにする。
 *
 * @param {import('@playwright/test').Page} page    The host page. / ホストページ。
 * @param {string}                         relPath Blog-relative path, e.g.
 *        '/wp-admin/b2edit.php'. / ブログ相対パス。
 * @return {Promise<import('@playwright/test').Frame>} The blog frame. / ブログフレーム。
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
 * EN: Wait until the blog iframe shows a frame, at a URL matching the
 *     given predicate, whose body contains the expected text.
 *
 *     A form submit / redirect leaves the iframe URL unchanged
 *     (b2edit.php posts to b2edit.php), so a URL check alone can match
 *     the pre-submit document. Asserting on the rendered text instead
 *     waits for the new page to actually be in place.
 *
 *     Both `innerText` and `textContent` are searched: `innerText` is
 *     the rendered text, but WebKit omits `<option>` content from it
 *     while Chromium includes it -- so a category name, which 0.71's
 *     category admin shows inside a `<select>`, would be missed on
 *     WebKit. Checking `textContent` too makes the assertion
 *     engine-independent (Issue #130).
 * JA: ブログ iframe が、URL が指定の述語に一致し body が期待テキストを
 *     含むフレームを表示するまで待つ。
 *
 *     フォーム送信 / リダイレクトは iframe の URL を変えない
 *     (b2edit.php は b2edit.php へ POST する)ため、URL チェックだけでは
 *     送信前のドキュメントに一致しうる。代わりに描画テキストを検証し、
 *     新ページが実際に置かれるのを待つ。
 *
 *     `innerText` と `textContent` の両方を検索する。`innerText` は描画
 *     テキストだが WebKit は `<option>` の内容を省き Chromium は含める。
 *     0.71 のカテゴリー管理が `<select>` 内に表示するカテゴリー名は
 *     WebKit で見落とされうる。`textContent` も調べることでアサーション
 *     をエンジン非依存にする(Issue #130)。
 *
 * @param {import('@playwright/test').Page} page         The host page. / ホストページ。
 * @param {(url: string) => boolean}        matchUrl     URL predicate. / URL 述語。
 * @param {string}                          expectedText Text the body must
 *        contain. / body が含むべきテキスト。
 * @return {Promise<boolean>} True once the text is found, false on
 *         timeout. / テキストが見つかれば true、タイムアウトで false。
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
 * EN: Read a blog frame's rendered text and assert it carries no SQL
 *     error.
 *
 *     WordPress 0.71's wpdb prints a database error inline into the page
 *     -- "SQL/DB Error --" followed by the failing statement -- rather
 *     than raising a console error or a non-200 status. A query the
 *     MySQL -> SQLite translator does not cover (Issue #131:
 *     DATE_FORMAT() in the front-page Links sidebar) therefore renders a
 *     visible error into the HTML that a text-presence check would miss.
 *     This reads the whole body -- innerText and textContent, so a
 *     sidebar / `<option>` error is caught on both engines -- and
 *     returns whether the SQL-error marker is absent.
 * JA: ブログフレームの描画テキストを読み、SQL エラーが無いことを検証
 *     する。
 *
 *     WordPress 0.71 の wpdb はデータベースエラーをページ内へインライン
 *     出力する -- "SQL/DB Error --" の後に失敗した文 -- 。コンソール
 *     エラーや非 200 ステータスは出さない。MySQL -> SQLite トランス
 *     レータが扱わないクエリ(Issue #131: フロントページの Links
 *     サイドバーの DATE_FORMAT())は可視エラーを HTML へ描画する。
 *
 * @param {import('@playwright/test').Frame} frame A loaded blog frame. / 読み込み済みブログフレーム。
 * @return {Promise<boolean>} True when the page shows no SQL error. / SQL エラーが無ければ true。
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
 * EN: Trigger the app's reset control and wait for the reloaded page to
 *     boot.
 *
 *     `window.__071now.reset()` clears the persisted stores and then
 *     calls `location.reload()`. The reload starts asynchronously, so a
 *     bare `waitForBoot` afterwards can race it -- matching the
 *     pre-reload `window.__071now` (so a stale `databaseRestored` is
 *     read) or hitting "Execution context was destroyed" when the
 *     navigation lands mid call. WebKit reaches this window far more
 *     often than Chromium. This drives the reset robustly: it fires
 *     `reset()`, ignores a context-destroyed error from the in-flight
 *     navigation, waits for the new document's load event, then waits
 *     for the fresh boot hook.
 * JA: アプリのリセット操作を起動し、再読み込みされたページの起動を
 *     待つ。
 *
 *     `window.__071now.reset()` は永続化ストアをクリアし
 *     `location.reload()` を呼ぶ。再読み込みは非同期で始まるため、後続の
 *     素の `waitForBoot` は競合しうる。`reset()` を発火し、進行中の遷移
 *     による context-destroyed エラーを無視し、新ドキュメントの load
 *     イベントを待ち、新しい起動フックを待つ。
 *
 * @param {import('@playwright/test').Page} page The host page. / ホストページ。
 */
async function resetAndWaitForBoot( page ) {
	const navigated = page
		.waitForEvent( 'load', { timeout: BOOT_TIMEOUT } )
		.catch( () => {} );
	await page
		.evaluate( () => window.__071now.reset() )
		.catch( ( error ) => {
			// EN: location.reload() can destroy the context before the
			//     evaluate resolves -- expected, the navigation is what
			//     this awaits next.
			// JA: location.reload() は evaluate の解決前に context を
			//     破棄しうる -- 想定内、次に待つのがその遷移である。
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
 * EN: Create a post through the WordPress 0.71 admin's own post form.
 *
 *     Opens b2edit.php, fills the title / body / category and submits.
 *     The form carries 0.71's CSRF token, so a successful write proves
 *     the token round-trips. b2edit.php redirects back to itself after
 *     the INSERT; this waits for the post list to show the new title.
 * JA: WordPress 0.71 管理画面自身の投稿フォームから投稿を作成する。
 *
 *     b2edit.php を開き、タイトル / 本文 / カテゴリーを入力し送信する。
 *     フォームは 0.71 の CSRF トークンを持つため、書き込み成功は
 *     トークンが往復することを証明する。
 *
 * @param {import('@playwright/test').Page} page  The host page. / ホストページ。
 * @param {string}                         title The post title. / 投稿タイトル。
 * @param {string}                         body  The post body. / 投稿本文。
 * @return {Promise<boolean>} True once the admin lists the new post. / 管理画面が新投稿を一覧したら true。
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
 * EN: Fetch a blog path through the in-browser request handler and
 *     report whether it served an image.
 *
 *     Used to check an uploaded image is served from the php-wasm VFS: a
 *     200 status with an `image/*` content-type and a non-empty body
 *     means the static-file handler returned the stored upload.
 *
 *     The probe can run straight after a reset / reload, so the host
 *     page may still be navigating and `page.evaluate` can hit
 *     "Execution context was destroyed". That is retried (after
 *     re-awaiting the boot hook) rather than failing.
 * JA: ブラウザ内リクエストハンドラ経由でブログパスを取得し、画像が
 *     配信されたかを返す。
 *
 *     アップロード画像が php-wasm VFS から配信されることの確認に使う。
 *     `image/*` content-type と非空 body を伴う 200 ステータスは、静的
 *     ファイルハンドラが保存済みアップロードを返したことを意味する。
 *
 * @param {import('@playwright/test').Page} page    The host page. / ホストページ。
 * @param {string}                         relPath Blog-relative path. / ブログ相対パス。
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
			// EN: The host page was navigating -- wait for the fresh boot
			//     hook, then retry the probe against the new context.
			// JA: ホストページが遷移中だった -- 新しい起動フックを待ち、
			//     新 context に対して再試行する。
			await waitForBoot( page );
		}
	}
}

/**
 * EN: Wait for the block editor to mount in the blog iframe and return
 *     its frame, once the editor's title input is present.
 *
 *     The block editor is the custom @wordpress/block-editor app served
 *     by src/block-editor/api/editor.php. It is opened at a scoped blog
 *     path (/block-editor/api/editor.php?post=ID); editor.php serves the
 *     HTML shell, the bundle mounts the React editor, and load.php fills
 *     the title -- so a present `input.be-title` proves editor.php found
 *     the bundle (not the "bundle not built" fallback) and load.php
 *     answered.
 * JA: ブロックエディタがブログ iframe にマウントするのを待ち、エディタ
 *     のタイトル入力が存在したらそのフレームを返す。
 *
 *     ブロックエディタは src/block-editor/api/editor.php が配信する
 *     カスタム @wordpress/block-editor アプリ。`input.be-title` の存在は
 *     editor.php がバンドルを見つけ load.php が応答したことを証明する。
 *
 * @param {import('@playwright/test').Page} page The host page. / ホストページ。
 * @param {number}                         post The post id to open. / 開く投稿 ID。
 * @return {Promise<import('@playwright/test').Frame>} The editor frame. / エディタフレーム。
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
				// EN: A detached frame or a not-yet-mounted editor -- retry.
				// JA: detach されたフレームか未マウントのエディタ -- 再試行。
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
 * EN: Attach console-error / pageerror listeners to a page and return a
 *     growing array of the messages collected.
 *
 *     The playground has no server log to inspect, so a JavaScript
 *     console error or an uncaught page error is the signal that
 *     something broke. A spec collects these and asserts the array is
 *     empty at the end.
 * JA: ページに console-error / pageerror リスナーを取り付け、収集した
 *     メッセージの配列を返す。
 *
 * @param {import('@playwright/test').Page} page The page. / ページ。
 * @return {string[]} A live array of collected error messages. / 収集中のエラー配列。
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
 * EN: Assert a value is truthy with a descriptive message. A thin
 *     wrapper so the specs can assert on the helper-returned booleans
 *     (e.g. waitForBlogText) and still get a `@playwright/test` failure
 *     with a clear label.
 * JA: 値が truthy であることを説明付きで検証する。ヘルパーが返す真偽値
 *     を spec が検証しつつ、明確なラベル付きの失敗を得るための薄い
 *     ラッパー。
 *
 * @param {unknown} value   The value to assert truthy. / truthy を検証する値。
 * @param {string}  message The failure message. / 失敗メッセージ。
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
