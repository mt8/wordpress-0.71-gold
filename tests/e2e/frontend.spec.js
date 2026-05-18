// @ts-check
const { test, expect } = require( '@playwright/test' );
const { expectNoPhpErrors } = require( './helpers/assertions' );
const {
	seedCategory,
	seedPost,
	cleanupE2EData,
} = require( './helpers/test-data' );

/**
 * Front-end E2E specs for WordPress 0.71-gold.
 * Covers the home page, a single post (`?p=`), a category page (`?cat=`),
 * a monthly archive (`?m=`) and the RSS 2.0 feed. Every page is checked
 * for the absence of PHP error output.
 */

// Seeded fixtures shared by the front-end specs.
const fixture = {
	/** @type {number} */ categoryId: 0,
	/** @type {number} */ postId: 0,
	/** @type {string} */ archiveMonth: '',
	postTitle: 'Frontend Fixture Post',
};

test.describe( 'Front end', () => {
	test.beforeAll( () => {
		// Start from a clean slate, then seed a known category + post.
		cleanupE2EData();
		fixture.categoryId = seedCategory( 'Frontend Category' );
		// Pin the post to a fixed date so the monthly-archive URL is stable.
		const date = '2026-05-15 12:00:00';
		fixture.archiveMonth = '202605';
		fixture.postId = seedPost( {
			title: fixture.postTitle,
			content: 'Front-end fixture body for the E2E suite.',
			category: fixture.categoryId,
			date,
		} );
	} );

	test.afterAll( () => {
		cleanupE2EData();
	} );

	test( 'home page renders without PHP errors', async ( { page } ) => {
		await page.goto( '/' );
		await expect( page.locator( '#header' ) ).toBeVisible();
		// The seeded post is recent, so it appears on the home page.
		await expect(
			page.locator( 'h3.storytitle', { hasText: fixture.postTitle } )
		).toBeVisible();
		await expectNoPhpErrors( page );
	} );

	test( 'single post page (?p=) renders without PHP errors', async ( {
		page,
	} ) => {
		await page.goto( `/?p=${ fixture.postId }` );
		await expect(
			page.locator( 'h3.storytitle', { hasText: fixture.postTitle } )
		).toBeVisible();
		await expect( page.locator( '.storycontent' ) ).toContainText(
			'Front-end fixture body'
		);
		await expectNoPhpErrors( page );
	} );

	test( 'category page (?cat=) renders without PHP errors', async ( {
		page,
	} ) => {
		await page.goto( `/?cat=${ fixture.categoryId }` );
		// The seeded post belongs to the seeded category.
		await expect(
			page.locator( 'h3.storytitle', { hasText: fixture.postTitle } )
		).toBeVisible();
		await expectNoPhpErrors( page );
	} );

	test( 'monthly archive (?m=) renders without PHP errors', async ( {
		page,
	} ) => {
		await page.goto( `/?m=${ fixture.archiveMonth }` );
		await expect( page.locator( '#header' ) ).toBeVisible();
		await expect(
			page.locator( 'h3.storytitle', { hasText: fixture.postTitle } )
		).toBeVisible();
		await expectNoPhpErrors( page );
	} );

	test( 'RSS 2.0 feed (b2rss2.php) is valid XML without PHP errors', async ( {
		page,
	} ) => {
		const response = await page.goto( '/b2rss2.php' );
		expect( response?.status() ).toBe( 200 );
		const body = ( await response?.text() ) || '';
		expect( body ).toContain( '<rss' );
		expectNoPhpErrorsInText( body, '/b2rss2.php' );
	} );
} );

/**
 * Feed bodies are XML, not a rendered DOM, so check the raw text directly
 * for PHP error output.
 *
 * @param {string} body Raw response text.
 * @param {string} where Identifying URL for the failure message.
 */
function expectNoPhpErrorsInText( body, where ) {
	const patterns = [
		/Fatal error/i,
		/Parse error/i,
		/\bWarning:\s/i,
		/\bNotice:\s/i,
		/\bDeprecated:\s/i,
		/Uncaught (Error|TypeError|Exception)/i,
	];
	for ( const regex of patterns ) {
		expect( body, `PHP error output found in ${ where }` ).not.toMatch(
			regex
		);
	}
}
