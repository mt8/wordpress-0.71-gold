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
 * EN: 071-now playground persistence E2E spec (Issue #141; supersedes
 *     the persistence checks of the bespoke
 *     tools/playground/test/verify.mjs).
 *
 *     Verifies that the in-browser SQLite database persists across a
 *     page reload, and that the reset control returns the playground to
 *     its fresh seeded state (Issue #122). A uniquely named post is
 *     created through the admin, the whole page is reloaded (a fresh
 *     php-wasm instance with a fresh virtual filesystem) and the post is
 *     asserted still present -- the database was restored from OPFS /
 *     IndexedDB rather than re-seeded. The reset is then triggered,
 *     which clears the persisted store and reloads; the created post is
 *     asserted gone and the original seeded post back.
 * JA: 071-now playground の永続化 E2E spec(Issue #141。手書きの
 *     tools/playground/test/verify.mjs の永続化チェックを置き換える)。
 *
 *     ブラウザ内 SQLite データベースがページのリロードを越えて残り、
 *     リセット操作が playground を新しいシード済み状態へ戻すことを検証
 *     する(Issue #122)。一意な名前の投稿を管理画面から作成し、ページ
 *     全体をリロードし(新しい仮想ファイルシステムを持つ新しい php-wasm
 *     インスタンス)、投稿が残っていることを検証する -- データベースは
 *     再シードではなく OPFS / IndexedDB から復元された。続いてリセットを
 *     起動し、作成した投稿が消え元のシード投稿が戻ることを検証する。
 */

// EN: The newest seeded post -- present after a reset returns the blog
//     to its fresh seeded state.
// JA: 最新のシード投稿 -- リセットでブログが新しいシード済み状態へ
//     戻った後に存在する。
const SEEDED_TITLE = 'Hello world from 071-now';

test.describe( 'Playground persistence', () => {
	test( 'database survives a reload and the reset returns to a fresh seed', async ( {
		page,
	} ) => {
		// EN: A unique marker so the spec is unaffected by any post an
		//     earlier run left behind.
		// JA: 以前の実行が残した投稿に影響されないよう一意なマーカー。
		const persistedTitle = `071-now persisted post ${ Date.now() }`;
		const persistedBody = 'This post must survive a page reload.';
		const isFront = ( url ) => url.endsWith( '/index.php' );

		await openPlayground( page );

		// EN: A persistence backend must have been selected -- OPFS when
		//     the browser has it, IndexedDB otherwise (WebKit's OPFS
		//     lacks createWritable, so it falls back, Issue #130).
		// JA: 永続化バックエンドが選択されているはず -- ブラウザが持て
		//     ば OPFS、なければ IndexedDB(WebKit の OPFS は
		//     createWritable を欠くためフォールバックする、Issue #130)。
		const backend = await page.evaluate(
			() => window.__071now.persistenceBackend
		);
		expect(
			[ 'opfs', 'indexeddb' ],
			`a persistence backend should be selected (saw "${ backend }")`
		).toContain( backend );

		// EN: Create a post through the admin, then confirm it on the
		//     front page before the reload so the baseline is known-good.
		// JA: 管理画面から投稿を作成し、リロード前にフロントページで
		//     確認してベースラインを既知良好にする。
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

		// EN: Force-flush the database to the persistent store so the
		//     reload below never races the post-request save.
		// JA: データベースを永続化ストアへ強制フラッシュし、下のリロード
		//     がリクエスト後の保存と競合しないようにする。
		await page.evaluate( () => window.__071now.persist() );

		// EN: Reload the whole page -- a fresh php-wasm instance with a
		//     fresh virtual filesystem. Without persistence the boot shim
		//     would re-seed and the created post would be gone; with
		//     persistence the app restores the database from OPFS /
		//     IndexedDB.
		// JA: ページ全体をリロードする -- 新しい仮想ファイルシステムを
		//     持つ新しい php-wasm インスタンス。永続化が無ければ起動シム
		//     が再シードし作成投稿は消える。
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

		// EN: Reset -- clear the persisted store and reload. The created
		//     post must be gone and the original seeded post back.
		// JA: リセット -- 永続化ストアをクリアしリロードする。作成投稿は
		//     消え元のシード投稿が戻るはず。
		await resetAndWaitForBoot( page );
		const afterResetRestored = await page.evaluate(
			() => window.__071now.databaseRestored
		);
		expect(
			afterResetRestored,
			'reset should clear the persistent store'
		).toBe( false );

		const frontAfterReset = await gotoBlog( page, '/index.php' );
		expectTrue(
			await waitForBlogText( page, isFront, SEEDED_TITLE ),
			'the seeded post should be back after a reset'
		);

		// EN: The created post must NOT reappear after a reset. The
		//     seeded post being back already proves the front page
		//     rendered, so one body read is enough.
		// JA: 作成投稿はリセット後に再出現してはならない。
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
