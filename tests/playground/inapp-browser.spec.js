// @ts-check
const { test, expect } = require( '@playwright/test' );
const { INAPP_USER_AGENT, BOOT_TIMEOUT } = require( './helpers/playground' );

/**
 * EN: 071-now playground in-app-browser E2E spec (Issue #141; supersedes
 *     the in-app-browser check of the bespoke
 *     tools/playground/test/verify.mjs; covers Issue #140).
 *
 *     The playground boots @php-wasm/web, which needs cross-origin
 *     isolation / SharedArrayBuffer and a reliably controlling service
 *     worker. Mobile in-app browsers -- the WebViews embedded inside
 *     native apps such as X/Twitter, Facebook, Instagram and LINE --
 *     often lack those, so src/inapp-browser.js detects them and
 *     src/main.js shows the "open in your standard browser" screen
 *     instead of booting. This spec opens the playground in a browser
 *     context whose user-agent is a real mobile in-app browser string
 *     (the X/Twitter iOS WebView) and asserts that screen is shown
 *     instead of php-wasm booting: the #inapp-notice is visible, it
 *     shows the page URL and the open-in-browser guidance, and the
 *     loading splash is removed. It then exercises the "continue anyway"
 *     escape hatch and confirms the playground boots after it.
 *
 *     A dedicated browser context with the overridden user-agent is
 *     used so the in-app fixture does not leak into the other specs.
 * JA: 071-now playground のアプリ内ブラウザ E2E spec(Issue #141。手書き
 *     の tools/playground/test/verify.mjs のアプリ内ブラウザチェックを
 *     置き換える。Issue #140 を網羅)。
 *
 *     playground は @php-wasm/web を起動し、それは cross-origin
 *     isolation / SharedArrayBuffer と確実に制御するサービスワーカーを
 *     必要とする。モバイルのアプリ内ブラウザ -- X/Twitter・Facebook・
 *     Instagram・LINE 等のネイティブアプリに埋め込まれた WebView --
 *     はこれらを欠くことが多く、src/inapp-browser.js がそれらを検出し
 *     src/main.js は起動せず「標準ブラウザで開く」画面を表示する。この
 *     spec は実在するモバイルアプリ内ブラウザ文字列(X/Twitter の iOS
 *     WebView)のユーザーエージェントを持つコンテキストで playground を
 *     開き、php-wasm が起動する代わりにその画面が表示されることを検証
 *     する。続いて「continue anyway」の回避手段を動かし、playground が
 *     起動することを確認する。
 */

test.describe( 'Playground in-app browser screen', () => {
	// EN: A dedicated context with the in-app user-agent. Overriding it
	//     at the context level keeps the fixture out of the other specs,
	//     which run with the default user-agent.
	// JA: アプリ内ユーザーエージェントを持つ専用コンテキスト。コンテキスト
	//     レベルで上書きし、既定ユーザーエージェントで動く他の spec から
	//     フィクスチャを隔離する。
	test.use( { userAgent: INAPP_USER_AGENT } );

	test( 'shows the standard-browser notice instead of booting php-wasm', async ( {
		page,
		baseURL,
	} ) => {
		await page.goto( '/', { waitUntil: 'load' } );

		// EN: The notice replaces the php-wasm boot -- the app reveals
		//     #inapp-notice (it adds the 'shown' class).
		// JA: 通知が php-wasm の起動を置き換える -- アプリは
		//     #inapp-notice を表示する('shown' クラスを付与)。
		await expect(
			page.locator( '#inapp-notice' )
		).toHaveClass( /shown/, { timeout: 15000 } );

		// EN: The app sets a distinct boot hook on the in-app path --
		//     window.__071now.inAppBrowser is true and there is no
		//     numeric status, so php-wasm was not booted.
		// JA: アプリはアプリ内経路で別の起動フックを設定する --
		//     window.__071now.inAppBrowser が true で数値の status は
		//     無く、php-wasm は起動していない。
		const hook = await page.evaluate( () => window.__071now || {} );
		expect(
			hook.inAppBrowser,
			'the app should flag the in-app-browser path'
		).toBe( true );
		expect(
			typeof hook.status,
			'php-wasm should not have booted'
		).not.toBe( 'number' );

		// EN: The notice carries the open-in-browser guidance and the
		//     page URL so a visitor can reopen it in a standard browser.
		// JA: 通知は標準ブラウザで再度開けるよう、開き方の案内とページ
		//     URL を持つ。
		const noticeText = await page
			.locator( '#inapp-notice' )
			.innerText();
		expect( noticeText ).toContain( 'standard browser' );
		expect( noticeText ).toMatch( /Safari|Chrome/ );

		const urlText = await page.locator( '#inapp-url' ).innerText();
		expect( urlText ).toContain( baseURL || '' );

		// EN: The loading splash must be gone -- the notice, not a
		//     spinner over a blank iframe, is what the visitor sees.
		// JA: ローディングスプラッシュは消えているはず -- 訪問者が見る
		//     のは空 iframe 上のスピナーではなく通知。
		await expect(
			page.locator( '#splash' )
		).toHaveClass( /hidden/ );
	} );

	test( '"continue anyway" boots the playground', async ( { page } ) => {
		await page.goto( '/', { waitUntil: 'load' } );
		await expect(
			page.locator( '#inapp-notice' )
		).toHaveClass( /shown/, { timeout: 15000 } );

		// EN: The "continue anyway" escape hatch -- after tapping it the
		//     playground must boot (a numeric status appears), so a false
		//     positive is recoverable.
		// JA: 「continue anyway」の回避手段 -- タップ後 playground は
		//     起動するはず(数値の status が現れる)で、誤検出は回復可能。
		await page.locator( '#inapp-continue' ).click();
		await page.waitForFunction(
			() =>
				window.__071now &&
				typeof window.__071now.status === 'number',
			{ timeout: BOOT_TIMEOUT }
		);
	} );
} );
