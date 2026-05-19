// @ts-check
const { test, expect } = require( '@playwright/test' );
const {
	BOOT_TIMEOUT,
	openPlayground,
	gotoBlog,
	waitForBlogText,
	createPostThroughAdmin,
	resetAndWaitForBoot,
	waitForBoot,
	expectTrue,
} = require( './helpers/playground' );

/**
 * 071-now playground environment export / import spec (Issue #207).
 *
 * The playground can export its environment -- the SQLite database and
 * the uploaded-media tree -- as a JSON envelope, and import one back.
 * This creates a post through the admin, exports the environment,
 * resets the playground to a fresh first visit (so the post is gone),
 * imports the exported envelope, and confirms the post is restored --
 * the export captured it and the import brought the environment back.
 */

test.describe( 'Playground environment export / import', () => {
	test( 'exporting then importing restores a created post', async ( {
		page,
	} ) => {
		const postTitle = `071-now export test ${ Date.now() }`;
		const isFront = ( url ) => url.includes( 'index.php' );

		await openPlayground( page );

		// Create a post through the WordPress 0.71 admin.
		expectTrue(
			await createPostThroughAdmin(
				page,
				postTitle,
				'Body of the environment-export test post.'
			),
			'the test post should be created'
		);

		// Export the environment as a JSON envelope string.
		const envelope = await page.evaluate( () =>
			window.__071now.exportEnvironment()
		);
		expect( typeof envelope ).toBe( 'string' );
		expect( envelope ).toContain( '071-now-environment' );

		// Reset to a fresh first visit -- the created post is gone.
		await resetAndWaitForBoot( page );
		const freshFrame = await gotoBlog( page, '/index.php' );
		const freshBody = await freshFrame.evaluate( () =>
			document.body ? document.body.innerText : ''
		);
		expect(
			freshBody,
			'the created post should be gone after a reset'
		).not.toContain( postTitle );

		// Import the exported envelope. importEnvironment() writes the
		//     environment to the persistent store and reloads the page;
		//     the reload destroys this execution context, which is
		//     expected and not an error.
		const navigated = page
			.waitForEvent( 'load', { timeout: BOOT_TIMEOUT } )
			.catch( () => {} );
		await page
			.evaluate(
				( text ) => window.__071now.importEnvironment( text ),
				envelope
			)
			.catch( ( error ) => {
				if (
					! /Execution context|navigation/i.test(
						error.message
					)
				) {
					throw error;
				}
			} );
		await navigated;
		await waitForBoot( page );

		// The imported environment restores the created post.
		await gotoBlog( page, '/index.php' );
		expectTrue(
			await waitForBlogText( page, isFront, postTitle ),
			'importing the environment should restore the created post'
		);
	} );
} );
