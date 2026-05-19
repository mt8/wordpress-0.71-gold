// @ts-check
const { test, expect } = require( '@playwright/test' );
const {
	waitForBoot,
	gotoBlog,
	waitForBlogText,
	expectTrue,
} = require( './helpers/playground' );

/**
 * 071-now playground blueprint spec (Issue #209).
 *
 * The playground can provision a fresh environment from a declarative
 * blueprint, delivered via a `?blueprint=<url>` query parameter -- the
 * 071-now counterpart of the official WordPress Playground's
 * blueprints. This boots the playground with the bundled
 * `example-blueprint.json` (a `setOption`, a `runSql` that inserts a
 * post, and a `runPHP`) and confirms the blueprint was applied and its
 * `runSql` step's post renders on the blog.
 */

test.describe( 'Playground blueprint', () => {
	test( 'a ?blueprint= URL provisions the environment on boot', async ( {
		page,
	} ) => {
		await page.goto( '/?blueprint=example-blueprint.json', {
			waitUntil: 'load',
		} );
		await waitForBoot( page );

		// __071now.blueprintApplied is set once a requested blueprint
		//     has run -- it confirms the blueprint loaded and applied.
		const applied = await page.evaluate(
			() => window.__071now.blueprintApplied
		);
		expect(
			applied,
			'the requested blueprint should have been applied'
		).toBe( true );

		// The blueprint's runSql step inserted a published post; it
		//     renders on the WordPress 0.71 front page.
		await gotoBlog( page, '/index.php' );
		expectTrue(
			await waitForBlogText(
				page,
				( url ) => url.includes( 'index.php' ),
				'Blueprint demo post'
			),
			"the blueprint's runSql step should have inserted a post"
		);
	} );
} );
