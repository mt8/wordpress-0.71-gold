// @ts-check
const { test, expect } = require( '@playwright/test' );
const { loginAsAdmin } = require( './helpers/auth' );
const { expectNoPhpErrors } = require( './helpers/assertions' );
const {
	E2E_MARKER,
	cleanupE2EData,
	findPostIdByTitle,
	findCategoryIdByName,
} = require( './helpers/test-data' );

/**
 * Admin E2E specs for WordPress 0.71-gold.
 * Covers logging in, the full post lifecycle (create / edit / delete) and
 * category management (add / delete). The specs drive the real b2/cafelog
 * admin forms and links, so the hidden `_b2csrf` token in every POST form
 * and the `_b2csrf` parameter on every delete link are handled
 * automatically — the suite never has to mint a token by hand.
 */

test.describe( 'Admin', () => {
	// Always start and end clean so re-running the suite is idempotent.
	test.beforeAll( () => cleanupE2EData() );
	test.afterAll( () => cleanupE2EData() );

	test( 'logs in to the admin', async ( { page } ) => {
		await loginAsAdmin( page );
		await expect( page ).toHaveURL( /b2edit\.php/ );
		await expectNoPhpErrors( page );
	} );

	test( 'creates, edits and deletes a post', async ( { page } ) => {
		const createdTitle = 'Admin Lifecycle Post';
		const editedTitle = 'Admin Lifecycle Post (edited)';

		await loginAsAdmin( page );

		// --- Create / 作成 -------------------------------------------------
		// Fill the real "New Post" form; submitting it carries the
		// form's hidden _b2csrf token automatically.
		await page.fill(
			'input[name="post_title"]',
			`${ E2E_MARKER } ${ createdTitle }`
		);
		await page.fill(
			'textarea[name="content"]',
			'Created by the admin E2E spec.'
		);
		await Promise.all( [
			page.waitForURL( /b2edit\.php/ ),
			page.click( 'input[name="submit"][value="Blog this!"]' ),
		] );

		const postId = findPostIdByTitle( createdTitle );
		expect( postId, 'post should exist in the database after create' ).not.toBeNull();
		await expectNoPhpErrors( page );

		// --- Edit / 編集 ---------------------------------------------------
		// Open the editor for the created post and change its title.
		await page.goto( `/wp-admin/b2edit.php?action=edit&post=${ postId }` );
		await expect( page.locator( 'input[name="post_title"]' ) ).toHaveValue(
			`${ E2E_MARKER } ${ createdTitle }`
		);
		await page.fill(
			'input[name="post_title"]',
			`${ E2E_MARKER } ${ editedTitle }`
		);
		await Promise.all( [
			page.waitForURL( /b2edit\.php/ ),
			page.click( 'input[name="submit"][value="Edit this!"]' ),
		] );

		expect(
			findPostIdByTitle( editedTitle ),
			'post title should be updated in the database'
		).toBe( postId );
		expect(
			findPostIdByTitle( createdTitle ),
			'old post title should no longer exist'
		).toBeNull();
		await expectNoPhpErrors( page );

		// --- Delete / 削除 -------------------------------------------------
		// The delete link on the post-list page already carries the
		// _b2csrf token in its href; clicking it deletes the post.
		// Accept the JS confirm() dialog the link triggers.
		page.on( 'dialog', ( dialog ) => dialog.accept() );
		await page.goto( '/wp-admin/b2edit.php' );
		const deleteLink = page.locator(
			`a[href*="action=delete"][href*="post=${ postId }"]`
		);
		await expect( deleteLink ).toBeVisible();
		await Promise.all( [
			page.waitForURL( /b2edit\.php/ ),
			deleteLink.click(),
		] );

		expect(
			findPostIdByTitle( editedTitle ),
			'post should be removed from the database after delete'
		).toBeNull();
		await expectNoPhpErrors( page );
	} );

	test( 'adds and deletes a category', async ( { page } ) => {
		const categoryName = 'Admin Lifecycle Category';

		await loginAsAdmin( page );

		// --- Add / 追加 ----------------------------------------------------
		// Submit the real "Add a category" form (its hidden _b2csrf
		// token rides along).
		await page.goto( '/wp-admin/b2categories.php' );
		await page.fill(
			'form[name="addcat"] input[name="cat_name"]',
			`${ E2E_MARKER } ${ categoryName }`
		);
		await Promise.all( [
			page.waitForURL( /b2categories\.php/ ),
			page.click( 'form[name="addcat"] input[type="submit"]' ),
		] );

		const catId = findCategoryIdByName( categoryName );
		expect(
			catId,
			'category should exist in the database after add'
		).not.toBeNull();
		await expect(
			page.locator( 'select#cat_ID option', {
				hasText: `${ E2E_MARKER } ${ categoryName }`,
			} )
		).toHaveCount( 1 );
		await expectNoPhpErrors( page );

		// --- Delete / 削除 -------------------------------------------------
		// Select the new category in the edit form and press Delete;
		// the form's hidden _b2csrf token authorises the request.
		// The default category (ID 1) is intentionally never deleted.
		await page.selectOption( 'select#cat_ID', String( catId ) );
		await Promise.all( [
			page.waitForURL( /b2categories\.php/ ),
			page.click( 'input[name="action"][value="Delete"]' ),
		] );

		expect(
			findCategoryIdByName( categoryName ),
			'category should be removed from the database after delete'
		).toBeNull();
		await expectNoPhpErrors( page );
	} );
} );
