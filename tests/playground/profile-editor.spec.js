// @ts-check
const { test, expect } = require( '@playwright/test' );
const {
	openPlayground,
	gotoBlog,
	waitForBlogText,
	expectTrue,
} = require( './helpers/playground' );

/**
 * 071-now playground spec for the wp-admin profile editor (Issue #197).
 *
 * b2profile.php echoes user-controlled profile fields back into the
 * page -- the profile view and the edit form's value="" attributes.
 * Unescaped, a field value with a quote or a tag injected markup into
 * the admin page (XSS). A separate bug left whitespace in the ICQ
 * field's value="", which the update handler's numeric ICQ check then
 * rejected, so the profile could not be saved at all.
 *
 * This opens the profile editor (the playground is logged in as the
 * admin), sets the nickname to a payload that -- unescaped -- would
 * break out of value="" and inject an element, saves through
 * b2profile.php's own form, and reloads the editor. It confirms the
 * save SUCCEEDED (the ICQ fix) and that the payload injected NO
 * element (the escaping fix).
 */

test.describe( 'Playground profile editor', () => {
	test( 'saves a profile and escapes a markup payload in a field', async ( {
		page,
	} ) => {
		// A nickname that, echoed unescaped into value="...", would
		//     close the attribute and inject a <b data-x> element.
		const payload = 'xss"><b data-x>BOOM</b>';
		const isProfile = ( url ) =>
			url.includes( '/wp-admin/b2profile.php' );

		await openPlayground( page );

		let frame = await gotoBlog( page, '/wp-admin/b2profile.php' );
		await frame.waitForSelector( 'input#newuser_nickname', {
			timeout: 15000,
		} );

		await frame.fill( 'input#newuser_nickname', payload );
		await frame.click( 'form#profile input[type="submit"]' );

		// The update handler answers with a "Profile updated!" page.
		//     Reaching it proves the save was accepted -- before the ICQ
		//     fix the handler rejected the whole form over the ICQ field.
		const saved = await waitForBlogText(
			page,
			isProfile,
			'Profile updated'
		);
		expectTrue( saved, 'the profile save should succeed' );

		// Reload the editor: the saved nickname is rendered back into
		//     the value="" attribute.
		frame = await gotoBlog( page, '/wp-admin/b2profile.php' );
		await frame.waitForSelector( 'input#newuser_nickname', {
			timeout: 15000,
		} );

		// The payload's tag must NOT have become a real element: an
		//     unescaped value="" would let `"><b ...>` break out and
		//     inject a <b data-x> element into the admin page.
		const injected = await frame.locator( 'b[data-x]' ).count();
		expect(
			injected,
			'the payload must not inject an element'
		).toBe( 0 );
	} );
} );
