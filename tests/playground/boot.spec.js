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
 * 071-now playground boot / front-page E2E specs (Issue #141;
 * supersedes the boot and front-page checks of the bespoke
 * tools/playground/test/verify.mjs).
 *
 * The playground (tools/playground/) boots @php-wasm/web in the
 * browser tab and serves WordPress 0.71 through a service worker, so
 * the in-browser blog is reachable at real same-origin paths with
 * its own CSS and navigation. These specs assert that boot path end
 * to end: the loading splash covers the php-wasm boot and is
 * replaced by the blog (Issue #126), the host page frames the
 * playground and links to the repository, the page is
 * cross-origin-isolated and service-worker-controlled (Issue #128),
 * the front page renders with its CSS and the seeded demo blog --
 * several posts across a couple of categories -- and a visitor can
 * click through to a post page and a category page. Every page is
 * asserted to render no SQL error (Issue #131) and no console error.
 */

// Text the seeded demo blog (tools/playground/db/seed.php) must
// contribute. EXPECTED_TITLE is the newest seeded post -- the post
// the front-page-to-post-to-category click-through follows.
const EXPECTED_TITLE = 'Hello world from 071-now';
const EXPECTED_BODY = 'in-browser SQLite database';

// Other seeded post titles -- the front page must list more than
// one post, so the demo blog shows 0.71's real multi-post rendering.
const OTHER_SEEDED_TITLES = [
	'A quick tour of the playground',
	'How the database works without MySQL',
	'WordPress 0.71, twenty years on',
];

// Seeded category names -- the front page's category list must show
// the demo blog's categories.
const SEEDED_CATEGORIES = [ 'Announcements', 'Notes from 2003' ];

test.describe( 'Playground boot and front page', () => {
	test( 'boots php-wasm and renders the styled, navigable blog', async ( {
		page,
	} ) => {
		const consoleErrors = collectConsoleErrors( page );

		await page.goto( '/', { waitUntil: 'load' } );

		// Loading-splash check (Issue #126) -- the host page shows a
		// splash with a spinner over the blank iframe while php-wasm
		// boots. Catch it before waitForBoot resolves.
		await expect( page.locator( '#splash' ) ).toBeVisible();
		await expect( page.locator( '#splash .spinner' ) ).toHaveCount( 1 );

		// Wait for the boot hook the app sets once php-wasm is up and
		// the front page has been served through the request handler.
		await waitForBoot( page );

		// Once the blog iframe has loaded the front page the splash is
		// faded out (the 'hidden' class) and replaced by the live blog.
		await expect( page.locator( '#splash' ) ).toHaveClass( /hidden/ );

		const bootState = await page.evaluate( () => ( {
			status: window.__071now.status,
			html: window.__071now.html,
			swController: !! navigator.serviceWorker.controller,
			crossOriginIsolated: window.crossOriginIsolated === true,
		} ) );

		// php-wasm served the front page with HTTP 200.
		expect( bootState.status ).toBe( 200 );

		// The service worker controls the page and serves the blog.
		expect( bootState.swController ).toBe( true );

		// Cross-origin isolation (Issue #128). php-wasm runs PHP
		// threads on SharedArrayBuffer, which a browser only exposes
		// to a cross-origin-isolated page -- so the COOP/COEP headers
		// must be in place.
		expect( bootState.crossOriginIsolated ).toBe( true );

		// The seeded post text is in the served front-page HTML.
		expect( bootState.html ).toContain( EXPECTED_TITLE );
		expect( bootState.html ).toContain( EXPECTED_BODY );

		// The front page declares UTF-8 (Issue #217), so the static
		// export renders non-ASCII content correctly once published on a
		// host that sends no charset of its own. The modern <meta charset>
		// form (Issue #224) quotes the value, so allow either form.
		expect( bootState.html ).toMatch( /charset=["']?UTF-8/i );
		expect( bootState.html ).not.toContain( 'iso-8859-1' );

		// The generator meta names the 0.71-gold edition deliberately --
		// the published site is static, so there is no live install
		// whose exact version needs hiding (Issue #218).
		expect( bootState.html ).toContain( 'content="WordPress 0.71-gold"' );

		// Minimum modern-web baseline on the rendered head (Issue #224).
		// The HTML5 doctype is at the very top of the document, the html
		// element declares its language (sourced from the rss_language
		// config so RSS and HTML stay in sync), and the viewport meta
		// makes a phone render the page at device width instead of the
		// desktop default. (The 0.71 footer still carries a "Valid XHTML"
		// badge for the 2003-era aesthetic; that is visible UI, not the
		// document's declared doctype, so the assertion is anchored to
		// the start of the document with /^\s*<!DOCTYPE html>/.)
		expect( bootState.html ).toMatch( /^\s*<!DOCTYPE html>/i );
		expect( bootState.html ).toMatch( /<html\s+lang="[^"]+"/i );
		expect( bootState.html ).toContain(
			'name="viewport" content="width=device-width, initial-scale=1"'
		);

		// The blog renders inside the iframe at a real scoped
		// same-origin path served through the service worker.
		const frontFrame = await waitForBlogFrame( page, ( url ) =>
			url.endsWith( '/index.php' )
		);
		await expect(
			frontFrame.locator( `text=${ EXPECTED_TITLE }` ).first()
		).toBeVisible();

		// CSS check -- layout2b.css gives #header a non-transparent
		// background. A styled #header proves the stylesheet loaded
		// through the service worker.
		const headerBackground = await frontFrame
			.locator( '#header' )
			.first()
			.evaluate( ( el ) => getComputedStyle( el ).backgroundColor );
		expect( headerBackground ).not.toBe( 'rgba(0, 0, 0, 0)' );
		expect( headerBackground ).not.toBe( 'transparent' );

		// The front page renders no inline SQL error (Issue #131) --
		// its Links sidebar issues a DATE_FORMAT() query.
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

		// Chrome check (Issue #126) -- the host page frames the
		// playground and links back to the GitHub repository.
		const repoLink = page.locator( '#chrome a' ).first();
		await expect( repoLink ).toHaveAttribute(
			'href',
			/github\.com\/mt8\/wordpress-0\.71-gold/
		);

		// The toolbar carries the reset control (Issue #122).
		await expect( page.locator( '#reset' ) ).toBeVisible();
	} );

	test( 'front page lists the seeded demo blog', async ( { page } ) => {
		await page.goto( '/', { waitUntil: 'load' } );
		await waitForBoot( page );

		const frontFrame = await waitForBlogFrame( page, ( url ) =>
			url.endsWith( '/index.php' )
		);

		// The front page lists a post per <h3 class="storytitle"> --
		// the demo seed (Issue #126) must contribute several, not one.
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

		// The further seeded posts all show on the front page.
		for ( const title of OTHER_SEEDED_TITLES ) {
			expect(
				bodyText,
				`seeded post "${ title }" should show on the front page`
			).toContain( title );
		}

		// The seeded categories show in the category list.
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

		// Navigation check 1 -- click the post permalink and confirm
		// the post page loads (still served through the worker) with
		// its CSS and no SQL error.
		const postLink = frontFrame.locator( 'h3.storytitle a' ).first();
		// The seed sets archive_mode = 'postbypost', so a post title
		//     links to the single-post URL index.php?p=<id> (Issue #212),
		//     not the ?m=YYYYMM month-archive anchor 0.71 defaults to.
		const postHref = await postLink.getAttribute( 'href' );
		expect(
			postHref,
			`post permalink should be a single-post ?p= URL (saw ${ postHref })`
		).toMatch( /\?p=\d+/ );
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

		// Navigation check 2 -- click the post's category link and
		// confirm the category archive shows the seeded post with no
		// SQL error (its get_archives() DATE_FORMAT query, Issue #131).
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
