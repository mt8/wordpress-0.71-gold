// @ts-check
const { expect } = require( '@playwright/test' );

/**
 * EN: Admin authentication helper for the WordPress 0.71-gold E2E suite.
 * JA: WordPress 0.71-gold E2E スイート用の管理ログインヘルパー。
 */

// EN: Default Docker-environment admin credentials (see docs/docker-environment.md).
// JA: Docker 環境の既定の管理者資格情報 (docs/docker-environment.md 参照)。
const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'password';

/**
 * EN: Log in to the b2/cafelog admin by driving the real `b2login.php` form.
 *     On success WordPress 0.71 redirects to `wp-admin/b2edit.php`; this helper
 *     waits for that page and asserts the post form is visible.
 * JA: 実際の `b2login.php` フォームを操作して b2/cafelog 管理画面にログインする。
 *     成功すると WordPress 0.71 は `wp-admin/b2edit.php` へリダイレクトする。
 *     本ヘルパーはそのページを待ち、投稿フォームが表示されることを検証する。
 *
 * @param {import('@playwright/test').Page} page Playwright page. / Playwright ページ。
 */
async function loginAsAdmin( page ) {
	await page.goto( '/b2login.php' );
	await page.fill( 'input[name="log"]', ADMIN_USER );
	await page.fill( 'input[name="pwd"]', ADMIN_PASS );
	await Promise.all( [
		page.waitForURL( /b2edit\.php/ ),
		page.click( 'input[type="submit"]' ),
	] );
	// EN: The post composer textarea proves the admin session is active.
	// JA: 投稿作成のテキストエリアが管理セッション有効の証拠。
	await expect( page.locator( 'textarea[name="content"]' ) ).toBeVisible();
}

module.exports = { loginAsAdmin, ADMIN_USER, ADMIN_PASS };
