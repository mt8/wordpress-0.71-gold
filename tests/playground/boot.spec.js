// @ts-check
const { test, expect } = require( '@playwright/test' );
const {
	waitForBoot,
	waitForBlogFrame,
	frameHasNoSqlError,
	collectConsoleErrors,
	expectTrue,
} = require( './helpers/playground' );

/**
 * EN: 071-now playground boot / front-page E2E specs (Issue #141;
 *     supersedes the boot and front-page checks of the bespoke
 *     tools/playground/test/verify.mjs).
 *
 *     The playground (tools/playground/) boots @php-wasm/web in the
 *     browser tab and serves WordPress 0.71 through a service worker, so
 *     the in-browser blog is reachable at real same-origin paths with
 *     its own CSS and navigation. These specs assert that boot path end
 *     to end: the loading splash covers the php-wasm boot and is
 *     replaced by the blog (Issue #126), the host page frames the
 *     playground and links to the repository, the page is
 *     cross-origin-isolated and service-worker-controlled (Issue #128),
 *     the front page renders with its CSS and the seeded demo blog --
 *     several posts across a couple of categories -- and a visitor can
 *     click through to a post page and a category page. Every page is
 *     asserted to render no SQL error (Issue #131) and no console error.
 * JA: 071-now playground の起動 / フロントページ E2E spec(Issue #141。
 *     手書きの tools/playground/test/verify.mjs の起動・フロントページ
 *     チェックを置き換える)。
 *
 *     playground(tools/playground/)はブラウザタブ内で @php-wasm/web を
 *     起動し、サービスワーカー経由で WordPress 0.71 を配信する。これらの
 *     spec はその起動経路をエンドツーエンドで検証する。ローディング
 *     スプラッシュが php-wasm の起動を覆いブログに置き換わること
 *     (Issue #126)、ホストページが playground を枠付けしリポジトリへ
 *     リンクすること、ページが cross-origin-isolated でサービスワーカー
 *     制御下であること(Issue #128)、フロントページが CSS とシード済み
 *     デモブログ付きで描画されること、訪問者が投稿ページとカテゴリー
 *     ページへ辿れることを検証する。
 */

// EN: Text the seeded demo blog (tools/playground/db/seed.php) must
//     contribute. EXPECTED_TITLE is the newest seeded post -- the post
//     the front-page-to-post-to-category click-through follows.
// JA: シード済みデモブログ(tools/playground/db/seed.php)が寄与する
//     はずのテキスト。EXPECTED_TITLE は最新のシード投稿。
const EXPECTED_TITLE = 'Hello world from 071-now';
const EXPECTED_BODY = 'in-browser SQLite database';

// EN: Other seeded post titles -- the front page must list more than
//     one post, so the demo blog shows 0.71's real multi-post rendering.
// JA: 他のシード投稿タイトル -- フロントページは複数の投稿を一覧する
//     はずで、デモブログは 0.71 の実マルチ投稿描画を示す。
const OTHER_SEEDED_TITLES = [
	'A quick tour of the playground',
	'How the database works without MySQL',
	'WordPress 0.71, twenty years on',
];

// EN: Seeded category names -- the front page's category list must show
//     the demo blog's categories.
// JA: シード済みカテゴリー名 -- フロントページのカテゴリー一覧が
//     デモブログのカテゴリーを示すはず。
const SEEDED_CATEGORIES = [ 'Announcements', 'Notes from 2003' ];

test.describe( 'Playground boot and front page', () => {
	test( 'boots php-wasm and renders the styled, navigable blog', async ( {
		page,
	} ) => {
		const consoleErrors = collectConsoleErrors( page );

		await page.goto( '/', { waitUntil: 'load' } );

		// EN: Loading-splash check (Issue #126) -- the host page shows a
		//     splash with a spinner over the blank iframe while php-wasm
		//     boots. Catch it before waitForBoot resolves.
		// JA: ローディングスプラッシュ確認(Issue #126)。
		await expect( page.locator( '#splash' ) ).toBeVisible();
		await expect( page.locator( '#splash .spinner' ) ).toHaveCount( 1 );

		// EN: Wait for the boot hook the app sets once php-wasm is up and
		//     the front page has been served through the request handler.
		// JA: php-wasm 起動とフロントページ配信後にアプリが設定する起動
		//     フックを待つ。
		await waitForBoot( page );

		// EN: Once the blog iframe has loaded the front page the splash is
		//     faded out (the 'hidden' class) and replaced by the live blog.
		// JA: ブログ iframe がフロントページを読み込むとスプラッシュは
		//     'hidden' クラスでフェードアウトしライブブログに置き換わる。
		await expect( page.locator( '#splash' ) ).toHaveClass( /hidden/ );

		const bootState = await page.evaluate( () => ( {
			status: window.__071now.status,
			html: window.__071now.html,
			swController: !! navigator.serviceWorker.controller,
			crossOriginIsolated: window.crossOriginIsolated === true,
		} ) );

		// EN: php-wasm served the front page with HTTP 200.
		// JA: php-wasm が HTTP 200 でフロントページを配信した。
		expect( bootState.status ).toBe( 200 );

		// EN: The service worker controls the page and serves the blog.
		// JA: サービスワーカーがページを制御しブログを配信する。
		expect( bootState.swController ).toBe( true );

		// EN: Cross-origin isolation (Issue #128). php-wasm runs PHP
		//     threads on SharedArrayBuffer, which a browser only exposes
		//     to a cross-origin-isolated page -- so the COOP/COEP headers
		//     must be in place.
		// JA: クロスオリジン分離(Issue #128)。php-wasm は
		//     SharedArrayBuffer 上で PHP スレッドを動かし、ブラウザは
		//     cross-origin-isolated なページにのみそれを公開する。
		expect( bootState.crossOriginIsolated ).toBe( true );

		// EN: The seeded post text is in the served front-page HTML.
		// JA: シード投稿テキストが配信されたフロントページ HTML にある。
		expect( bootState.html ).toContain( EXPECTED_TITLE );
		expect( bootState.html ).toContain( EXPECTED_BODY );

		// EN: The blog renders inside the iframe at a real scoped
		//     same-origin path served through the service worker.
		// JA: ブログはサービスワーカー経由の実スコープ同一オリジン
		//     パスで iframe 内に描画される。
		const frontFrame = await waitForBlogFrame( page, ( url ) =>
			url.endsWith( '/index.php' )
		);
		await expect(
			frontFrame.locator( `text=${ EXPECTED_TITLE }` ).first()
		).toBeVisible();

		// EN: CSS check -- layout2b.css gives #header a non-transparent
		//     background. A styled #header proves the stylesheet loaded
		//     through the service worker.
		// JA: CSS 確認 -- layout2b.css は #header に非透明背景を与える。
		const headerBackground = await frontFrame
			.locator( '#header' )
			.first()
			.evaluate( ( el ) => getComputedStyle( el ).backgroundColor );
		expect( headerBackground ).not.toBe( 'rgba(0, 0, 0, 0)' );
		expect( headerBackground ).not.toBe( 'transparent' );

		// EN: The front page renders no inline SQL error (Issue #131) --
		//     its Links sidebar issues a DATE_FORMAT() query.
		// JA: フロントページはインライン SQL エラーを描画しない
		//     (Issue #131)。
		expectTrue(
			await frameHasNoSqlError( frontFrame ),
			'front page renders no SQL/DB error'
		);

		expect(
			consoleErrors,
			`console errors on boot: ${ consoleErrors.join( ', ' ) }`
		).toEqual( [] );
	} );

	test( 'host chrome frames the playground and links to the repository', async ( {
		page,
	} ) => {
		await page.goto( '/', { waitUntil: 'load' } );
		await waitForBoot( page );

		// EN: Chrome check (Issue #126) -- the host page frames the
		//     playground and links back to the GitHub repository.
		// JA: クローム確認(Issue #126)。
		const repoLink = page.locator( '#chrome a' ).first();
		await expect( repoLink ).toHaveAttribute(
			'href',
			/github\.com\/mt8\/wordpress-0\.71-gold/
		);

		// EN: The toolbar carries the reset control (Issue #122).
		// JA: ツールバーはリセット操作を持つ(Issue #122)。
		await expect( page.locator( '#reset' ) ).toBeVisible();
	} );

	test( 'front page lists the seeded demo blog', async ( { page } ) => {
		await page.goto( '/', { waitUntil: 'load' } );
		await waitForBoot( page );

		const frontFrame = await waitForBlogFrame( page, ( url ) =>
			url.endsWith( '/index.php' )
		);

		// EN: The front page lists a post per <h3 class="storytitle"> --
		//     the demo seed (Issue #126) must contribute several, not one.
		// JA: フロントページは <h3 class="storytitle"> ごとに投稿を一覧
		//     する -- デモシード(Issue #126)は複数を寄与するはず。
		const storyCount = await frontFrame
			.locator( 'h3.storytitle' )
			.count();
		expect(
			storyCount,
			`front page should list several seeded posts (saw ${ storyCount })`
		).toBeGreaterThanOrEqual( 4 );

		const bodyText = await frontFrame
			.evaluate( () =>
				document.body ? document.body.innerText : ''
			)
			.catch( () => '' );

		// EN: The further seeded posts all show on the front page.
		// JA: 残りのシード投稿がすべてフロントページに表示される。
		for ( const title of OTHER_SEEDED_TITLES ) {
			expect(
				bodyText,
				`seeded post "${ title }" should show on the front page`
			).toContain( title );
		}

		// EN: The seeded categories show in the category list.
		// JA: シード済みカテゴリーがカテゴリー一覧に表示される。
		for ( const name of SEEDED_CATEGORIES ) {
			expect(
				bodyText,
				`seeded category "${ name }" should show in the list`
			).toContain( name );
		}
	} );

	test( 'a visitor can navigate to a post page and a category page', async ( {
		page,
	} ) => {
		await page.goto( '/', { waitUntil: 'load' } );
		await waitForBoot( page );

		const frontFrame = await waitForBlogFrame( page, ( url ) =>
			url.endsWith( '/index.php' )
		);

		// EN: Navigation check 1 -- click the post permalink and confirm
		//     the post page loads (still served through the worker) with
		//     its CSS and no SQL error.
		// JA: 遷移確認 1 -- 投稿パーマリンクをクリックし、投稿ページが
		//     CSS 付き・SQL エラー無しで読み込まれることを確認する。
		const postLink = frontFrame.locator( 'h3.storytitle a' ).first();
		await postLink.click();
		const postFrame = await waitForBlogFrame( page, ( url ) =>
			url.includes( '?' )
		);
		await expect(
			postFrame.locator( `text=${ EXPECTED_TITLE }` ).first()
		).toBeVisible();
		const postHeaderBg = await postFrame
			.locator( '#header' )
			.first()
			.evaluate( ( el ) => getComputedStyle( el ).backgroundColor );
		expect( postHeaderBg ).not.toBe( 'rgba(0, 0, 0, 0)' );
		expectTrue(
			await frameHasNoSqlError( postFrame ),
			'post page renders no SQL/DB error'
		);

		// EN: Navigation check 2 -- click the post's category link and
		//     confirm the category archive shows the seeded post with no
		//     SQL error (its get_archives() DATE_FORMAT query, Issue #131).
		// JA: 遷移確認 2 -- 投稿のカテゴリーリンクをクリックし、カテゴリー
		//     アーカイブがシード投稿を SQL エラー無しで表示することを
		//     確認する。
		const categoryLink = postFrame.locator( '.meta a' ).first();
		await categoryLink.click();
		const categoryFrame = await waitForBlogFrame( page, ( url ) =>
			url.includes( 'cat=' )
		);
		await expect(
			categoryFrame.locator( `text=${ EXPECTED_TITLE }` ).first()
		).toBeVisible();
		expectTrue(
			await frameHasNoSqlError( categoryFrame ),
			'category page renders no SQL/DB error'
		);
	} );
} );
