// @ts-check
const { expect } = require( '@playwright/test' );

/**
 * Admin authentication helper for the WordPress 0.71-gold E2E suite.
 */

// Default Docker-environment admin credentials (see docs/docker-environment.md).
const ADMIN_USER = process.env.E2E_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.E2E_ADMIN_PASS || 'password';

/**
 * Log in to the b2/cafelog admin by driving the real `b2login.php` form.
 * On success WordPress 0.71 redirects to `wp-admin/b2edit.php`; this helper
 * waits for that page and asserts the post form is visible.
 *
 * @param {import('@playwright/test').Page} page Playwright page.
 */
async function loginAsAdmin( page ) {
	await page.goto( '/b2login.php' );
	await page.fill( 'input[name="log"]', ADMIN_USER );
	await page.fill( 'input[name="pwd"]', ADMIN_PASS );
	await Promise.all( [
		page.waitForURL( /b2edit\.php/ ),
		page.click( 'input[type="submit"]' ),
	] );
	// The post composer textarea proves the admin session is active.
	await expect( page.locator( 'textarea[name="content"]' ) ).toBeVisible();
}

module.exports = { loginAsAdmin, ADMIN_USER, ADMIN_PASS };
