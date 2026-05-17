// @ts-check
const { test, expect } = require( '@playwright/test' );
const { INAPP_USER_AGENT, BOOT_TIMEOUT } = require( './helpers/playground' );

/**
 * 071-now playground in-app-browser E2E spec (Issue #141; supersedes
 * the in-app-browser check of the bespoke
 * tools/playground/test/verify.mjs; covers Issue #140).
 *
 * The playground boots @php-wasm/web, which needs cross-origin
 * isolation / SharedArrayBuffer and a reliably controlling service
 * worker. Mobile in-app browsers -- the WebViews embedded inside
 * native apps such as X/Twitter, Facebook, Instagram and LINE --
 * often lack those, so src/inapp-browser.js detects them and
 * src/main.js shows the "open in your standard browser" screen
 * instead of booting. This spec opens the playground in a browser
 * context whose user-agent is a real mobile in-app browser string
 * (the X/Twitter iOS WebView) and asserts that screen is shown
 * instead of php-wasm booting: the #inapp-notice is visible, it
 * shows the page URL and the open-in-browser guidance, and the
 * loading splash is removed. It then exercises the "continue anyway"
 * escape hatch and confirms the playground boots after it.
 *
 * A dedicated browser context with the overridden user-agent is
 * used so the in-app fixture does not leak into the other specs.
 */

test.describe( 'Playground in-app browser screen', () => {
	// A dedicated context with the in-app user-agent. Overriding it
	// at the context level keeps the fixture out of the other specs,
	// which run with the default user-agent.
	test.use( { userAgent: INAPP_USER_AGENT } );

	test( 'shows the standard-browser notice instead of booting php-wasm', async ( {
		page,
		baseURL,
	} ) => {
		await page.goto( '/', { waitUntil: 'load' } );

		// The notice replaces the php-wasm boot -- the app reveals
		// #inapp-notice (it adds the 'shown' class).
		await expect(
			page.locator( '#inapp-notice' )
		).toHaveClass( /shown/, { timeout: 15000 } );

		// The app sets a distinct boot hook on the in-app path --
		// window.__071now.inAppBrowser is true and there is no
		// numeric status, so php-wasm was not booted.
		const hook = await page.evaluate( () => window.__071now || {} );
		expect(
			hook.inAppBrowser,
			'the app should flag the in-app-browser path'
		).toBe( true );
		expect(
			typeof hook.status,
			'php-wasm should not have booted'
		).not.toBe( 'number' );

		// The notice carries the open-in-browser guidance and the
		// page URL so a visitor can reopen it in a standard browser.
		const noticeText = await page
			.locator( '#inapp-notice' )
			.innerText();
		expect( noticeText ).toContain( 'standard browser' );
		expect( noticeText ).toMatch( /Safari|Chrome/ );

		const urlText = await page.locator( '#inapp-url' ).innerText();
		expect( urlText ).toContain( baseURL || '' );

		// The loading splash must be gone -- the notice, not a
		// spinner over a blank iframe, is what the visitor sees.
		await expect(
			page.locator( '#splash' )
		).toHaveClass( /hidden/ );
	} );

	test( '"continue anyway" boots the playground', async ( { page } ) => {
		await page.goto( '/', { waitUntil: 'load' } );
		await expect(
			page.locator( '#inapp-notice' )
		).toHaveClass( /shown/, { timeout: 15000 } );

		// The "continue anyway" escape hatch -- after tapping it the
		// playground must boot (a numeric status appears), so a false
		// positive is recoverable.
		await page.locator( '#inapp-continue' ).click();
		await page.waitForFunction(
			() =>
				window.__071now &&
				typeof window.__071now.status === 'number',
			{ timeout: BOOT_TIMEOUT }
		);
	} );
} );
