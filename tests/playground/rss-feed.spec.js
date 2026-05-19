// @ts-check
const { test, expect } = require( '@playwright/test' );
const { openPlayground } = require( './helpers/playground' );

/**
 * 071-now playground RSS feed spec (Issue #189).
 *
 * The front end keeps a single syndication feed -- RSS 2.0
 * (src/b2rss2.php). The obsolete RSS 0.92 (b2rss.php) and RDF 1.0
 * (b2rdf.php) feeds were removed, along with their sidebar links and
 * the <head> RDF autodiscovery tag. This fetches the feed paths
 * through the in-browser request handler -- the same SQLite-backed
 * wpdb path a real visitor takes -- and confirms RSS 2.0 still serves
 * a well-formed document while the removed feeds are no longer
 * served. It keeps RSS 2.0 in the playground verification scope.
 */

/**
 * Fetch a blog path through the in-browser request handler and
 * return its status, content-type and decoded body.
 *
 * @param {import('@playwright/test').Page} page    The host page.
 * @param {string}                         relPath Blog-relative path.
 * @return {Promise<{status:number, contentType:string, body:string}>}
 */
async function fetchBlogPath( page, relPath ) {
	return page.evaluate( async ( rel ) => {
		const response = await window.__071now.get( rel );
		const headers = response.headers || {};
		const contentType = ( headers[ 'content-type' ] || [] )[ 0 ] || '';
		const body = response.bytes
			? new TextDecoder().decode( new Uint8Array( response.bytes ) )
			: '';
		return { status: response.httpStatusCode, contentType, body };
	}, relPath );
}

test.describe( 'Playground RSS 2.0 feed', () => {
	test( 'b2rss2.php serves a well-formed RSS 2.0 document', async ( {
		page,
	} ) => {
		await openPlayground( page );

		const feed = await fetchBlogPath( page, '/b2rss2.php' );

		expect( feed.status ).toBe( 200 );
		expect( feed.contentType ).toContain( 'text/xml' );
		// The feed declares UTF-8 (Issue #217) -- on the Content-type
		// header and in the XML prolog -- so the static export renders
		// non-ASCII content correctly once published.
		expect( feed.contentType ).toContain( 'charset=UTF-8' );
		expect( feed.body ).toContain( 'encoding="UTF-8"' );
		// The rss root, the channel, and the seeded post as an item.
		expect( feed.body ).toContain( '<rss version="2.0"' );
		expect( feed.body ).toContain( '<channel>' );
		expect( feed.body ).toContain( '<item' );
		// 0.71's wpdb prints SQL errors inline rather than failing the
		// request, so a clean feed must carry no error marker.
		expect( feed.body ).not.toContain( 'SQL/DB Error' );
	} );

	test( 'the removed RSS 0.92 and RDF 1.0 feeds are gone', async ( {
		page,
	} ) => {
		await openPlayground( page );

		for ( const removed of [ '/b2rss.php', '/b2rdf.php' ] ) {
			const response = await fetchBlogPath( page, removed );
			expect(
				response.status,
				`${ removed } should no longer be served`
			).toBe( 404 );
		}
	} );
} );
