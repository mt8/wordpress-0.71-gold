// @ts-check
const { test, expect } = require( '@playwright/test' );
const {
	openPlayground,
	gotoBlog,
	waitForBlogFrame,
	waitForBlogText,
	collectConsoleErrors,
	expectTrue,
} = require( './helpers/playground' );

/**
 * EN: 071-now playground admin E2E specs (Issue #141; supersedes the
 *     admin checks of the bespoke tools/playground/test/verify.mjs).
 *
 *     Exercises the WordPress 0.71 admin running inside the playground
 *     (Issue #120). The playground auto-logs the user in, so the admin
 *     opens straight onto the editor; without a logged-in user
 *     b2verifauth.php would redirect to b2login.php, so reaching the
 *     post form at all is the auto-login check. A post is created and
 *     then edited through the admin's own forms, a category is added
 *     through the category admin, and each change is confirmed on the
 *     front page -- every page served through the service worker, the
 *     same path a real visitor's browser takes.
 * JA: 071-now playground の管理画面 E2E spec(Issue #141。手書きの
 *     tools/playground/test/verify.mjs の管理画面チェックを置き換える)。
 *
 *     playground 内で動作する WordPress 0.71 管理画面を動かす
 *     (Issue #120)。playground はユーザーを自動ログインさせるため、
 *     管理画面はエディタで直接開く。ログイン済みユーザーが無ければ
 *     b2verifauth.php は b2login.php へリダイレクトするため、投稿
 *     フォームに到達できること自体が自動ログインの確認である。投稿を
 *     作成・編集し、カテゴリーを追加し、各変更をフロントページで確認
 *     する。
 */

test.describe( 'Playground admin', () => {
	test( 'admin opens already logged in (auto-login)', async ( { page } ) => {
		await openPlayground( page );

		// EN: Open the post editor. Auto-login means it opens straight
		//     onto the editor; reaching the post form proves the
		//     auto-login worked.
		// JA: 投稿エディタを開く。自動ログインによりエディタで直接開く。
		const editFrame = await gotoBlog( page, '/wp-admin/b2edit.php' );
		await expect(
			editFrame.locator( 'form[name="post"] #content' )
		).toBeVisible( { timeout: 15000 } );
		await expect(
			editFrame.locator( 'form[name="post"]' )
		).toHaveCount( 1 );
	} );

	test( 'creates and edits a post through the admin forms', async ( {
		page,
	} ) => {
		const consoleErrors = collectConsoleErrors( page );
		const createdTitle = '071-now admin smoke post';
		const createdBody = 'Created through the WordPress 0.71 admin.';
		const editedTitle = '071-now admin smoke post edited';

		const isAdmin = ( url ) => url.includes( '/wp-admin/b2edit.php' );
		const isFront = ( url ) => url.endsWith( '/index.php' );

		await openPlayground( page );

		// EN: Create a post through the admin's own form. The form
		//     carries 0.71's CSRF token, so a successful write proves the
		//     token round-trips. b2edit.php redirects back to itself
		//     after the INSERT; wait for the post list to show the title.
		// JA: 管理画面自身のフォームから投稿を作成する。フォームは 0.71
		//     の CSRF トークンを持ち、書き込み成功はトークンの往復を
		//     証明する。
		const editFrame = await gotoBlog( page, '/wp-admin/b2edit.php' );
		await editFrame.waitForSelector( 'form[name="post"] #content', {
			timeout: 15000,
		} );
		await editFrame.fill( 'form[name="post"] #title', createdTitle );
		await editFrame.fill( 'form[name="post"] #content', createdBody );
		await editFrame.selectOption(
			'form[name="post"] select#category',
			{ index: 0 }
		);
		await editFrame.click( 'form[name="post"] input[type="submit"]' );
		expectTrue(
			await waitForBlogText( page, isAdmin, createdTitle ),
			'created post should be listed in the admin'
		);

		// EN: The created post shows on the front page.
		// JA: 作成した投稿がフロントページに表示される。
		await gotoBlog( page, '/index.php' );
		expectTrue(
			await waitForBlogText( page, isFront, createdTitle ),
			'created post should show on the front page'
		);

		// EN: Edit the post. The admin lists an "Edit" link per post --
		//     the b2edit.php?action=edit permalink. Follow it, change the
		//     title and submit.
		// JA: 投稿を編集する。管理画面は投稿ごとに "Edit" リンクを一覧
		//     する。それを辿り、タイトルを変更し送信する。
		const editList = await gotoBlog( page, '/wp-admin/b2edit.php' );
		await editList.waitForSelector( 'a[href*="action=edit"]', {
			timeout: 15000,
		} );
		await editList
			.locator( 'a[href*="action=edit"]' )
			.first()
			.click();
		const editFormFrame = await waitForBlogFrame( page, ( url ) =>
			url.includes( 'action=edit' )
		);
		await editFormFrame.waitForSelector( 'form[name="post"] #title', {
			timeout: 15000,
		} );
		await editFormFrame.fill(
			'form[name="post"] #title',
			editedTitle
		);
		await editFormFrame.click(
			'form[name="post"] input[type="submit"]'
		);
		expectTrue(
			await waitForBlogText( page, isAdmin, editedTitle ),
			'edited post title should be listed in the admin'
		);

		// EN: The edited title shows on the front page.
		// JA: 編集したタイトルがフロントページに表示される。
		await gotoBlog( page, '/index.php' );
		expectTrue(
			await waitForBlogText( page, isFront, editedTitle ),
			'edited post title should show on the front page'
		);

		expect(
			consoleErrors,
			`console errors during admin post flow: ${ consoleErrors.join(
				', '
			) }`
		).toEqual( [] );
	} );

	test( 'adds a category through the category admin', async ( { page } ) => {
		const newCategory = 'Playground Notes';
		const isCatAdmin = ( url ) =>
			url.includes( '/wp-admin/b2categories.php' );

		await openPlayground( page );

		// EN: Add a category through the category admin and confirm it
		//     lands in the category list.
		// JA: カテゴリー管理からカテゴリーを追加し、それがカテゴリー
		//     一覧に入ることを確認する。
		const catFrame = await gotoBlog(
			page,
			'/wp-admin/b2categories.php'
		);
		await catFrame.waitForSelector(
			'form[name="addcat"] input[name="cat_name"]',
			{ timeout: 15000 }
		);
		await catFrame.fill(
			'form[name="addcat"] input[name="cat_name"]',
			newCategory
		);
		await catFrame.click(
			'form[name="addcat"] input[type="submit"]'
		);
		expectTrue(
			await waitForBlogText( page, isCatAdmin, newCategory ),
			'added category should be listed in the category admin'
		);
	} );
} );
