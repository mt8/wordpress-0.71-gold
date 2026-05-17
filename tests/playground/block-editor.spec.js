// @ts-check
const { test, expect } = require( '@playwright/test' );
const {
	openPlayground,
	gotoBlog,
	waitForBlogText,
	openBlockEditor,
	expectTrue,
} = require( './helpers/playground' );

/**
 * 071-now playground block-editor E2E spec (Issue #141; supersedes
 * the block-editor checks of the bespoke
 * tools/playground/test/verify.mjs).
 *
 * Verifies the block editor in the playground (Issue #132). The
 * block editor (src/block-editor/) is a custom @wordpress/
 * block-editor app over a thin WordPress 0.71 JSON backend; the
 * playground build builds it and carries its bundle in the overlay.
 * This opens the editor from the admin's own "Block editor" link,
 * edits a post's title through it, saves, and confirms the change
 * round-trips -- the editor reloads with the new title and the
 * WordPress 0.71 front page renders it. Every request goes through
 * the service worker and the SQLite-backed wpdb, the same path a
 * real visitor takes.
 */

test.describe( 'Playground block editor', () => {
	test( 'opens from the admin, saves an edit, and the edit round-trips', async ( {
		page,
	} ) => {
		// A unique title so the spec is unaffected by any earlier
		// edit and the front-page assertion cannot match stale text.
		const blockEditedTitle = `071-now block-edited post ${ Date.now() }`;
		const isFront = ( url ) => url.includes( 'index.php?p=' );

		await openPlayground( page );

		// The admin lists a per-post "Block editor" link
		// (b2edit.showposts.php). Open the post editor and confirm
		// the link is present. Reaching the link also confirms the
		// admin is logged in (the auto-login).
		const adminFrame = await gotoBlog( page, '/wp-admin/b2edit.php' );
		await adminFrame.waitForSelector(
			'a[href*="block-editor/api/editor.php"]',
			{ timeout: 15000 }
		);
		await expect(
			adminFrame.locator(
				'a[href*="block-editor/api/editor.php"]'
			)
		).not.toHaveCount( 0 );

		// The href is "../block-editor/api/editor.php?post=ID"
		// relative to wp-admin/; take the post id from it and open
		// the editor the same way a click would, through the service
		// worker.
		const editorHref = await adminFrame
			.locator(
				'a[href*="block-editor/api/editor.php?post="]'
			)
			.first()
			.getAttribute( 'href' );
		const postId = Number(
			( editorHref || '' ).match( /post=(\d+)/ )?.[ 1 ]
		);
		expect(
			Number.isInteger( postId ) && postId > 0,
			`a block-editor post id should be found (saw "${ editorHref }")`
		).toBe( true );

		const editorFrame = await openBlockEditor( page, postId );

		// editor.php found the bundle -- the editor mounted rather
		// than showing the "Block editor bundle not built" page.
		const bodyText = await editorFrame
			.evaluate( () =>
				document.body ? document.body.innerText : ''
			)
			.catch( () => '' );
		expect(
			bodyText,
			'the block editor should mount (not the "bundle not built" page)'
		).not.toContain( 'bundle not built' );
		await expect(
			editorFrame.locator( '.be-app' )
		).not.toHaveCount( 0 );

		// load.php answered -- the title input carries the post's
		// title.
		const loadedTitle = await editorFrame.evaluate(
			() =>
				/** @type {HTMLInputElement} */ (
					document.querySelector( 'input.be-title' )
				).value
		);
		expect( typeof loadedTitle ).toBe( 'string' );

		// Edit the title and save through the editor. The Save button
		// is the primary toolbar button; save.php writes the block
		// markup and title back into b2posts through the
		// SQLite-backed wpdb.
		await editorFrame.fill( 'input.be-title', blockEditedTitle );
		await editorFrame
			.locator( 'button.is-primary', { hasText: 'Save' } )
			.first()
			.click();
		await expect(
			editorFrame.locator(
				'.be-notice .components-notice.is-success'
			)
		).toBeVisible( { timeout: 20000 } );

		// Re-open the editor for the same post -- the new title must
		// come back from load.php, proving save.php persisted it to
		// the database rather than only updating the React state.
		const reopened = await openBlockEditor( page, postId );
		const reopenedTitle = await reopened.evaluate(
			() =>
				/** @type {HTMLInputElement} */ (
					document.querySelector( 'input.be-title' )
				).value
		);
		expect(
			reopenedTitle,
			'the block-editor edit should persist to the database'
		).toBe( blockEditedTitle );

		// The edited post renders on the WordPress 0.71 front end --
		// the change is visible to a visitor, not just in the editor.
		await gotoBlog( page, `/index.php?p=${ postId }` );
		expectTrue(
			await waitForBlogText( page, isFront, blockEditedTitle ),
			'the block-editor edit should show on the 0.71 front page'
		);
	} );
} );
