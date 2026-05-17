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
 * EN: 071-now playground image-upload E2E spec (Issue #141; supersedes
 *     the image-upload checks of the bespoke
 *     tools/playground/test/verify.mjs).
 *
 *     Verifies WordPress 0.71's image upload running inside the
 *     playground, and that an uploaded image persists across a reload
 *     and is cleared by a reset (Issue #124). The classic admin's upload
 *     page (wp-admin/b2upload.php) is opened, a PNG is uploaded through
 *     its own multipart form, and the upload page is asserted to confirm
 *     it and the stored image to be served from the php-wasm VFS. The
 *     whole page is then reloaded (a fresh php-wasm instance) and the
 *     image asserted restored from the persistent store and still
 *     served. Finally the reset is triggered and the uploaded image
 *     asserted gone.
 * JA: 071-now playground の画像アップロード E2E spec(Issue #141。手書き
 *     の tools/playground/test/verify.mjs の画像アップロードチェックを
 *     置き換える)。
 *
 *     playground 内で動作する WordPress 0.71 の画像アップロードと、
 *     アップロード画像がリロードを越えて残りリセットでクリアされること
 *     を検証する(Issue #124)。従来型管理画面のアップロードページ
 *     (wp-admin/b2upload.php)を開き、その multipart フォームから PNG を
 *     アップロードし、アップロードページが確認し保存画像が php-wasm VFS
 *     から配信されることを検証する。続いてページ全体をリロードし画像が
 *     復元・配信されることを、最後にリセットで画像が消えることを検証
 *     する。
 */

// EN: A minimal but valid 1x1 PNG, the image the upload spec sends
//     through WordPress 0.71's wp-admin/b2upload.php. It is uploaded as
//     a real multipart/form-data POST so the spec exercises the whole
//     path -- the service worker forwarding the body, php-wasm parsing
//     $_FILES, b2upload.php's move_uploaded_file() -- with genuine
//     image bytes.
// JA: 最小だが正当な 1x1 PNG。アップロード spec が WordPress 0.71 の
//     wp-admin/b2upload.php へ送る画像。実 multipart/form-data POST と
//     して送られ、spec はサービスワーカーの本文転送・php-wasm の $_FILES
//     解析・b2upload.php の move_uploaded_file() という全経路を実画像
//     バイトで動かす。
const TEST_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8' +
	'z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test.describe( 'Playground image upload', () => {
	test( 'uploads an image, it persists across a reload, and reset clears it', async ( {
		page,
	} ) => {
		// EN: A unique file name so the spec never collides with a file
		//     an earlier run left in the persistent store.
		// JA: 以前の実行が永続化ストアに残したファイルと衝突しないよう
		//     一意なファイル名。
		const uploadName = `071-now-upload-${ Date.now() }.png`;
		const uploadDesc = 'Uploaded through the WordPress 0.71 admin.';
		const uploadPath = `/wp-content/uploads/${ uploadName }`;
		const isUpload = ( url ) =>
			url.includes( '/wp-admin/b2upload.php' );

		await openPlayground( page );

		// EN: Open the upload page. Auto-login means it opens straight
		//     onto the upload form; b2upload.php dies with "Cheatin' uh ?"
		//     for a logged-out visitor, so reaching the file input proves
		//     the page served and the user is authenticated.
		// JA: アップロードページを開く。自動ログインによりアップロード
		//     フォームで直接開く。b2upload.php はログアウト訪問者には
		//     "Cheatin' uh ?" で die するため、ファイル入力に到達できる
		//     ことはページが配信されユーザーが認証済みであることを証明。
		const uploadFrame = await gotoBlog(
			page,
			'/wp-admin/b2upload.php'
		);
		await expect(
			uploadFrame.locator( 'input[name="img1"]' )
		).toHaveCount( 1, { timeout: 15000 } );

		// EN: Upload the PNG through b2upload.php's own multipart form.
		//     The file is supplied from memory; Playwright sends a real
		//     multipart/form-data POST, which the service worker forwards
		//     to php-wasm with the body intact.
		// JA: b2upload.php 自身の multipart フォームから PNG をアップロード
		//     する。ファイルはメモリから供給され、Playwright は実
		//     multipart/form-data POST を送る。
		await uploadFrame.setInputFiles( 'input[name="img1"]', {
			name: uploadName,
			mimeType: 'image/png',
			buffer: Buffer.from( TEST_PNG_BASE64, 'base64' ),
		} );
		await uploadFrame.fill( 'input[name="imgdesc"]', uploadDesc );
		await uploadFrame.click( 'input[name="submit"]' );

		// EN: b2upload.php replies with a "File uploaded !" confirmation
		//     page naming the stored file.
		// JA: b2upload.php は保存ファイルを名指す "File uploaded !" 確認
		//     ページで応答する。
		expectTrue(
			await waitForBlogText( page, isUpload, 'File uploaded' ),
			'b2upload.php should confirm the upload'
		);

		// EN: Force-flush so the media store is written before the
		//     reload.
		// JA: リロード前にメディアストアが書かれるよう強制フラッシュ。
		await page.evaluate( () => window.__071now.persist() );

		// EN: The stored image is served from the php-wasm VFS through
		//     the request handler -- a 200 with an image/png content-type
		//     and a non-empty body.
		// JA: 保存画像はリクエストハンドラ経由で php-wasm VFS から配信
		//     される -- image/png content-type と非空 body を伴う 200。
		const served = await fetchBlogImage( page, uploadPath );
		expect(
			served.status,
			`uploaded image should be served (saw ${ served.status })`
		).toBe( 200 );
		expect( served.contentType ).toContain( 'image/png' );
		expect( served.length ).toBeGreaterThan( 0 );

		// EN: The uploaded image renders -- point the iframe straight at
		//     the image URL and confirm the document loaded an image.
		// JA: アップロード画像が描画される -- iframe を画像 URL へ直接
		//     向け、ドキュメントが画像を読み込んだことを確認する。
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

		// EN: Reload the whole page -- a fresh php-wasm instance with an
		//     empty virtual filesystem. Without media persistence the
		//     uploaded image would be gone; with it the app restores the
		//     uploads tree from OPFS / IndexedDB before the first request.
		// JA: ページ全体をリロードする -- 空の仮想ファイルシステムを持つ
		//     新しい php-wasm インスタンス。メディア永続化が無ければ
		//     画像は消える。
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

		// EN: Reset -- clear the persisted database and media, then
		//     reload. The uploaded image must be gone: no media restored,
		//     and the request handler no longer serves the file.
		// JA: リセット -- 永続化データベースとメディアをクリアしリロード
		//     する。アップロード画像は消えるはず。
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
