// @ts-check
const { test, expect } = require( '@playwright/test' );
const {
	openPlayground,
	waitForBoot,
	gotoBlog,
	waitForBlogText,
	resetAndWaitForBoot,
	fetchBlogImage,
	expectTrue,
} = require( './helpers/playground' );

/**
 * 071-now playground image-upload E2E spec (Issue #141; supersedes
 * the image-upload checks of the bespoke
 * tools/playground/test/verify.mjs).
 *
 * Verifies WordPress 0.71's image upload running inside the
 * playground, and that an uploaded image persists across a reload
 * and is cleared by a reset (Issue #124). The classic admin's upload
 * page (wp-admin/b2upload.php) is opened, a PNG is uploaded through
 * its own multipart form, and the upload page is asserted to confirm
 * it and the stored image to be served from the php-wasm VFS. The
 * whole page is then reloaded (a fresh php-wasm instance) and the
 * image asserted restored from the persistent store and still
 * served. Finally the reset is triggered and the uploaded image
 * asserted gone.
 */

// A minimal but valid 1x1 PNG, the image the upload spec sends
// through WordPress 0.71's wp-admin/b2upload.php. It is uploaded as
// a real multipart/form-data POST so the spec exercises the whole
// path -- the service worker forwarding the body, php-wasm parsing
// $_FILES, b2upload.php's move_uploaded_file() -- with genuine
// image bytes.
const TEST_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8' +
	'z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.describe( 'Playground image upload', () => {
	test( 'uploads an image, it persists across a reload, and reset clears it', async ( {
		page,
	} ) => {
		// A unique file name so the spec never collides with a file
		// an earlier run left in the persistent store.
		const uploadName = `071-now-upload-${ Date.now() }.png`;
		const uploadDesc = 'Uploaded through the WordPress 0.71 admin.';
		const uploadPath = `/wp-content/uploads/${ uploadName }`;
		const isUpload = ( url ) =>
			url.includes( '/wp-admin/b2upload.php' );

		await openPlayground( page );

		// Open the upload page. Auto-login means it opens straight
		// onto the upload form; b2upload.php dies with "Cheatin' uh ?"
		// for a logged-out visitor, so reaching the file input proves
		// the page served and the user is authenticated.
		const uploadFrame = await gotoBlog(
			page,
			'/wp-admin/b2upload.php'
		);
		await expect(
			uploadFrame.locator( 'input[name="img1"]' )
		).toHaveCount( 1, { timeout: 15000 } );

		// Upload the PNG through b2upload.php's own multipart form.
		// The file is supplied from memory; Playwright sends a real
		// multipart/form-data POST, which the service worker forwards
		// to php-wasm with the body intact.
		await uploadFrame.setInputFiles( 'input[name="img1"]', {
			name: uploadName,
			mimeType: 'image/png',
			buffer: Buffer.from( TEST_PNG_BASE64, 'base64' ),
		} );
		await uploadFrame.fill( 'input[name="imgdesc"]', uploadDesc );
		await uploadFrame.click( 'input[name="submit"]' );

		// b2upload.php replies with a "File uploaded !" confirmation
		// page naming the stored file.
		expectTrue(
			await waitForBlogText( page, isUpload, 'File uploaded' ),
			'b2upload.php should confirm the upload'
		);

		// Force-flush so the media store is written before the
		// reload.
		await page.evaluate( () => window.__071now.persist() );

		// The stored image is served from the php-wasm VFS through
		// the request handler -- a 200 with an image/png content-type
		// and a non-empty body.
		const served = await fetchBlogImage( page, uploadPath );
		expect(
			served.status,
			`uploaded image should be served (saw ${ served.status })`
		).toBe( 200 );
		expect( served.contentType ).toContain( 'image/png' );
		expect( served.length ).toBeGreaterThan( 0 );

		// The uploaded image renders -- point the iframe straight at
		// the image URL and confirm the document loaded an image.
		const imageFrame = await gotoBlog( page, uploadPath );
		expectTrue(
			await imageFrame
				.evaluate( () => {
					const img = document.querySelector( 'img' );
					return !! img && img.naturalWidth > 0;
				} )
				.catch( () => false ),
			'uploaded image should render from its blog URL'
		);

		// Reload the whole page -- a fresh php-wasm instance with an
		// empty virtual filesystem. Without media persistence the
		// uploaded image would be gone; with it the app restores the
		// uploads tree from OPFS / IndexedDB before the first request.
		await page.reload( { waitUntil: 'load' } );
		await waitForBoot( page );
		const mediaRestoredCount = await page.evaluate(
			() => window.__071now.mediaRestoredCount
		);
		expect(
			mediaRestoredCount,
			'media should be restored from the persistent store'
		).toBeGreaterThan( 0 );

		const servedAfterReload = await fetchBlogImage( page, uploadPath );
		expect(
			servedAfterReload.status,
			'uploaded image should still be served after a reload'
		).toBe( 200 );
		expect( servedAfterReload.contentType ).toContain( 'image/png' );
		expect( servedAfterReload.length ).toBeGreaterThan( 0 );

		// Reset -- clear the persisted database and media, then
		// reload. The uploaded image must be gone: no media restored,
		// and the request handler no longer serves the file.
		await resetAndWaitForBoot( page );
		const mediaAfterReset = await page.evaluate(
			() => window.__071now.mediaRestoredCount
		);
		expect(
			mediaAfterReset,
			'reset should leave no restored media'
		).toBe( 0 );

		const servedAfterReset = await fetchBlogImage( page, uploadPath );
		expect(
			servedAfterReset.status,
			'reset should clear the persisted uploaded image'
		).not.toBe( 200 );
	} );
} );

/**
 * 071-now playground iOS image-upload E2E spec (Issue #178).
 *
 * On the playground, uploading an image from an iPhone (iOS Safari /
 * iOS Chrome -- both WebKit) failed: the photo picker opened but the
 * upload then errored or froze, while PC upload worked. Two causes
 * were found and fixed:
 *
 *   1. The playground writes its own /internal/shared/php.ini, which
 *      fully replaces php-wasm's default. The default raised
 *      upload_max_filesize / post_max_size to 2000M; the playground's
 *      ini omitted them, so PHP fell back to its compiled-in defaults
 *      (upload_max_filesize 2M, post_max_size 8M) and rejected any
 *      photo larger than 2 MB. A real iPhone photo is almost always
 *      bigger. tools/playground/src/main.js now sets the limits.
 *
 *   2. iOS cameras save HEIC photos; WordPress 0.71 cannot display
 *      HEIC and the upload allow-list is jpg/gif/png, so a HEIC was
 *      rejected. The block editor's mediaUpload
 *      (tools/block-editor/src/Editor.jsx) now converts HEIC to JPEG
 *      in the browser before upload.
 *
 * These tests run under both the playground-chromium (PC) and
 * playground-webkit (Safari engine) projects, so they prove the iOS
 * fix on WebKit and guard against a PC regression.
 */

// A real HEIC image (a 120x90 solid-colour photo), base64-encoded.
// iOS hands the photo picker a .heic file; this is the genuine
// article so the test exercises the real browser HEIC decode path
// the block editor's mediaUpload relies on.
const TEST_HEIC_BASE64 =
	'AAAAJGZ0eXBoZWljAAAAAG1pZjFNaVBybWlhZk1pSEJoZWljAAABeW1ldGEA' +
	'AAAAAAAAIWhkbHIAAAAAAAAAAHBpY3QAAAAAAAAAAAAAAAAAAAAAJGRpbmYA' +
	'AAAcZHJlZgAAAAAAAAABAAAADHVybCAAAAABAAAADnBpdG0AAAAAAAEAAAAj' +
	'aWluZgAAAAAAAQAAABVpbmZlAgAAAAABAABodmMxAAAAANlpcHJwAAAAuWlw' +
	'Y28AAAATY29scm5jbHgAAgACAAaAAAAAcWh2Y0MBA3AAAACwAAAAAAAe8AD8' +
	'/fj4AAALA6AAAQAXQAEMAf//A3AAAAMAsAAAAwAAAwAecCShAAEAI0IBAQNw' +
	'AAADALAAAAMAAAMAHqAUIGHCsmIe5FlU3AgIGpAIogABAAlEAcBhcshAUyQA' +
	'AAAUaXNwZQAAAAAAAAB4AAAAWgAAAAlpcm90AAAAABBwaXhpAAAAAAMICAgA' +
	'AAAYaXBtYQAAAAAAAAABAAEFgYIDhAUAAAAeaWxvYwAAAABEAAABAAEAAAAB' +
	'AAABrQAAADYAAAABbWRhdAAAAAAAAABGAAAAMigBr7Lw8EaBfP/yLfr/cr//' +
	'9gOPsW/Z5rGiaab//Ghbf2t9Pm3F/Oc2s/QisWIkd3kc';

test.describe( 'Playground iOS image upload (Issue #178)', () => {
	// Open the block editor for post #1 and return its frame. The
	// editor's mediaUpload is the upload seam an iPhone visitor uses.
	async function openEditorFrame( page ) {
		await gotoBlog( page, '/block-editor/api/editor.php?post=1' );
		const deadline = Date.now() + 40000;
		while ( Date.now() < deadline ) {
			const frame = page
				.frames()
				.find( ( f ) =>
					f.url().includes( '/block-editor/api/editor.php' )
				);
			if ( frame ) {
				try {
					await frame.waitForSelector( 'input.be-title', {
						timeout: 5000,
					} );
					return frame;
				} catch ( error ) {
					if (
						! /detached|Timeout/i.test(
							/** @type {Error} */ ( error ).message
						)
					) {
						throw error;
					}
				}
			}
			await new Promise( ( r ) => setTimeout( r, 250 ) );
		}
		throw new Error( 'block editor did not mount' );
	}

	test( 'a large (4 MB) image uploads through the block editor endpoint', async ( {
		page,
	} ) => {
		// A 4 MB image is well above PHP's 2M compiled default
		// upload_max_filesize and roughly the size of a real phone
		// photo. Before the php.ini fix this failed with
		// "upload_failed"; it must now succeed.
		await openPlayground( page );
		const editorFrame = await openEditorFrame( page );

		const result = await editorFrame.evaluate( async () => {
			const bytes = new Uint8Array( 4 * 1024 * 1024 );
			// A JPEG SOI marker so the bytes look like an image.
			bytes[ 0 ] = 0xff;
			bytes[ 1 ] = 0xd8;
			bytes[ 2 ] = 0xff;
			const body = new FormData();
			body.append(
				'file',
				new File( [ bytes ], 'large-photo.jpg', {
					type: 'image/jpeg',
				} )
			);
			const response = await fetch( 'upload.php', {
				method: 'POST',
				credentials: 'include',
				body,
			} );
			return {
				status: response.status,
				data: await response.json().catch( () => null ),
			};
		} );

		expect(
			result.status,
			`a 4 MB upload should succeed (saw ${ result.status } ` +
				`${ JSON.stringify( result.data ) })`
		).toBe( 200 );
		expect(
			result.data && typeof result.data.url === 'string'
		).toBe( true );
	} );

	test( 'a HEIC photo added to the Image block converts to JPEG or fails fast', async ( {
		page,
		browserName,
	} ) => {
		// Drive the block editor's Image block exactly as an iPhone
		// visitor would: insert an Image block, hand its file input a
		// real .heic file.
		//
		// The HEIC -> JPEG conversion depends on a browser HEIC codec.
		// WebKit -- the engine of iOS Safari and iOS Chrome, the
		// browsers Issue #178 is about -- decodes HEIC, so there the
		// editor converts the photo and the Image block ends up showing
		// the stored JPEG. Chromium on the CI runner has no HEIC codec;
		// there the conversion cannot happen, but the upload must still
		// FAIL FAST with a clear error notice instead of an indefinite
		// freeze -- which is the Issue #178 done-when condition for the
		// case where an upload genuinely cannot succeed.
		await openPlayground( page );
		const editorFrame = await openEditorFrame( page );

		// The editor canvas must be mounted before the inserter is
		// driven -- the .be-app wrapper proves the React editor is up.
		await expect(
			editorFrame.locator( '.be-app' )
		).toBeVisible( { timeout: 15000 } );

		// Insert an Image block through the "+" inserter. Each step is
		// awaited on a visible element so a slow WebKit boot cannot let
		// a later step race ahead of the panel it depends on.
		await editorFrame.locator( '.be-inserter-toggle' ).click();
		const inserterSearch = editorFrame
			.locator(
				'.block-editor-inserter__search input, ' +
					'input.components-search-control__input'
			)
			.first();
		await expect( inserterSearch ).toBeVisible( { timeout: 15000 } );
		await inserterSearch.fill( 'Image' );
		const imageBlockButton = editorFrame
			.locator( 'button.block-editor-block-types-list__item', {
				hasText: 'Image',
			} )
			.first();
		await expect( imageBlockButton ).toBeVisible( { timeout: 15000 } );
		await imageBlockButton.click();

		// The Image block placeholder carries a hidden file input.
		const fileInput = editorFrame
			.locator( '.wp-block-image input[type=file], input[type=file]' )
			.first();
		await expect( fileInput ).toHaveCount( 1, { timeout: 15000 } );
		await fileInput.setInputFiles( {
			name: 'IMG_0001.heic',
			mimeType: 'image/heic',
			buffer: Buffer.from( TEST_HEIC_BASE64, 'base64' ),
		} );

		if ( browserName === 'webkit' ) {
			// WebKit decodes HEIC: the editor converts it to JPEG and
			// the Image block shows the stored .jpg.
			await expect(
				editorFrame.locator( '.wp-block-image img' )
			).toHaveAttribute(
				'src',
				/\/wp-content\/uploads\/.+\.jpg$/,
				{ timeout: 30000 }
			);
		} else {
			// Chromium has no HEIC codec: the upload cannot succeed,
			// but it must fail fast with a visible error in the
			// editor's own notice banner -- not hang silently.
			await expect(
				editorFrame.locator( '.be-notice' )
			).toContainText( /Image upload failed/i, {
				timeout: 30000,
			} );
		}
	} );
} );
