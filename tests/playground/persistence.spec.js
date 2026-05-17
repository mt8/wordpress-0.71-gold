// @ts-check
const { test, expect } = require( '@playwright/test' );
const {
	openPlayground,
	waitForBoot,
	gotoBlog,
	waitForBlogText,
	resetAndWaitForBoot,
	createPostThroughAdmin,
	expectTrue,
} = require( './helpers/playground' );

/**
 * 071-now playground persistence E2E spec (Issue #141; the reset
 * coverage extended to a full reset in Issue #144; supersedes the
 * persistence checks of the bespoke tools/playground/test/verify.mjs).
 *
 * Verifies that the in-browser SQLite database persists across a
 * page reload, and that the reset control is a full environment
 * reset (Issue #144) -- it returns the playground to exactly the
 * state of a brand-new first visit. A uniquely named post is created
 * through the admin, the whole page is reloaded (a fresh php-wasm
 * instance with a fresh virtual filesystem) and the post is asserted
 * still present -- the database was restored from OPFS / IndexedDB
 * rather than re-seeded. Before the reset, marker state is planted in
 * every store the playground keeps -- the Cache API and Web Storage
 * -- and the reset is then triggered. After it, the created post is
 * asserted gone and the original seeded post back, and -- the Issue
 * #144 additions -- the planted Cache API entry and Web Storage
 * markers are asserted cleared and no service worker registration is
 * left behind, so the playground is a pristine first visit.
 */

// The newest seeded post -- present after a reset returns the blog
// to its fresh seeded state.
const SEEDED_TITLE = 'Hello world from 071-now';

// A Cache API cache name and Web Storage keys planted before the
// reset so the reset's full-state clearing (Issue #144) can be
// asserted: a full reset must leave neither behind.
const RESET_MARKER_CACHE = '071-now-reset-marker-cache';
const RESET_MARKER_KEY = '071-now-reset-marker';

test.describe( 'Playground persistence', () => {
	test( 'database survives a reload and the reset is a full first-visit reset', async ( {
		page,
	} ) => {
		// A unique marker so the spec is unaffected by any post an
		// earlier run left behind.
		const persistedTitle = `071-now persisted post ${ Date.now() }`;
		const persistedBody = 'This post must survive a page reload.';
		const isFront = ( url ) => url.endsWith( '/index.php' );

		await openPlayground( page );

		// A persistence backend must have been selected -- OPFS when
		// the browser has it, IndexedDB otherwise (WebKit's OPFS
		// lacks createWritable, so it falls back, Issue #130).
		const backend = await page.evaluate(
			() => window.__071now.persistenceBackend
		);
		expect(
			[ 'opfs', 'indexeddb' ],
			`a persistence backend should be selected (saw "${ backend }")`
		).toContain( backend );

		// Create a post through the admin, then confirm it on the
		// front page before the reload so the baseline is known-good.
		expectTrue(
			await createPostThroughAdmin(
				page,
				persistedTitle,
				persistedBody
			),
			'post should be created through the admin'
		);
		await gotoBlog( page, '/index.php' );
		expectTrue(
			await waitForBlogText( page, isFront, persistedTitle ),
			'created post should show before the reload'
		);

		// Force-flush the database to the persistent store so the
		// reload below never races the post-request save.
		await page.evaluate( () => window.__071now.persist() );

		// Reload the whole page -- a fresh php-wasm instance with a
		// fresh virtual filesystem. Without persistence the boot shim
		// would re-seed and the created post would be gone; with
		// persistence the app restores the database from OPFS /
		// IndexedDB.
		await page.reload( { waitUntil: 'load' } );
		await waitForBoot( page );
		const restored = await page.evaluate(
			() => window.__071now.databaseRestored
		);
		expect(
			restored,
			'database should be restored from the persistent store'
		).toBe( true );

		await gotoBlog( page, '/index.php' );
		expectTrue(
			await waitForBlogText( page, isFront, persistedTitle ),
			'created post should survive a page reload'
		);

		// A service worker must be registered and controlling the
		// page -- the playground routes the blog through it. The
		// reset must later leave none behind (Issue #144).
		const swBeforeReset = await page.evaluate( async () => {
			const registrations =
				await navigator.serviceWorker.getRegistrations();
			return registrations.length;
		} );
		expect(
			swBeforeReset,
			'a service worker should be registered before the reset'
		).toBeGreaterThan( 0 );

		// Plant marker state in the stores a full reset must clear
		// (Issue #144): a Cache API cache and a key in each of
		// sessionStorage / localStorage. The reset has to leave none
		// of these, the way a first visit has none.
		await page.evaluate(
			async ( { cacheName, key } ) => {
				const cache = await caches.open( cacheName );
				await cache.put(
					'/071-now-reset-marker',
					new Response( 'marker' )
				);
				sessionStorage.setItem( key, '1' );
				localStorage.setItem( key, '1' );
			},
			{ cacheName: RESET_MARKER_CACHE, key: RESET_MARKER_KEY }
		);

		// Reset -- a full environment reset (Issue #144). The created
		// post must be gone and the original seeded post back, and
		// all the planted state cleared.
		await resetAndWaitForBoot( page );
		const afterResetRestored = await page.evaluate(
			() => window.__071now.databaseRestored
		);
		expect(
			afterResetRestored,
			'reset should clear the persistent database store'
		).toBe( false );

		// No uploaded media may survive the reset either.
		const mediaAfterReset = await page.evaluate(
			() => window.__071now.mediaRestoredCount
		);
		expect(
			mediaAfterReset,
			'reset should clear the persisted uploaded media'
		).toBe( 0 );

		// The full reset (Issue #144) must have cleared the Cache API
		// and Web Storage markers planted above -- a first visit has
		// none of them.
		const leftoverState = await page.evaluate(
			async ( { cacheName, key } ) => {
				const cacheNames = await caches.keys();
				return {
					markerCachePresent: cacheNames.includes( cacheName ),
					sessionMarker: sessionStorage.getItem( key ),
					localMarker: localStorage.getItem( key ),
				};
			},
			{ cacheName: RESET_MARKER_CACHE, key: RESET_MARKER_KEY }
		);
		expect(
			leftoverState.markerCachePresent,
			'reset should delete the Cache API caches'
		).toBe( false );
		expect(
			leftoverState.sessionMarker,
			'reset should clear sessionStorage'
		).toBeNull();
		expect(
			leftoverState.localMarker,
			'reset should clear localStorage'
		).toBeNull();

		const frontAfterReset = await gotoBlog( page, '/index.php' );
		expectTrue(
			await waitForBlogText( page, isFront, SEEDED_TITLE ),
			'the seeded post should be back after a reset'
		);

		// The created post must NOT reappear after a reset. The
		// seeded post being back already proves the front page
		// rendered, so one body read is enough.
		const frontText = await frontAfterReset
			.evaluate( () =>
				document.body ? document.body.innerText : ''
			)
			.catch( () => '' );
		expect(
			frontText,
			'the created post should be gone after a reset'
		).not.toContain( persistedTitle );
	} );
} );
