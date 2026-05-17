// @ts-check
const { expect } = require( '@playwright/test' );

/**
 * Page-level assertion helpers for the WordPress 0.71-gold E2E suite.
 */

/**
 * Assert that the page body shows no PHP error output. WordPress 0.71 runs
 * on PHP 8.3, where any surviving legacy construct surfaces as a visible
 * `Fatal error`, `Warning`, `Notice` or `Deprecated` line. The migration
 * work aims for clean pages, so any such text is a regression.
 *
 * @param {import('@playwright/test').Page} page Playwright page.
 */
async function expectNoPhpErrors( page ) {
	const body = ( await page.content() ) || '';

	// Patterns PHP emits when display_errors is on. Each is checked
	// individually so a failure message names the exact culprit.
	const patterns = [
		{ label: 'PHP Fatal error', regex: /Fatal error/i },
		{ label: 'PHP Parse error', regex: /Parse error/i },
		{ label: 'PHP Warning', regex: /<b>\s*Warning\s*<\/b>/i },
		{ label: 'PHP Notice', regex: /<b>\s*Notice\s*<\/b>/i },
		{ label: 'PHP Deprecated', regex: /<b>\s*Deprecated\s*<\/b>/i },
		{ label: 'PHP Warning (plain)', regex: /\bWarning:\s/i },
		{ label: 'PHP Deprecated (plain)', regex: /\bDeprecated:\s/i },
		{ label: 'Uncaught Error', regex: /Uncaught (Error|TypeError|Exception)/i },
	];

	for ( const { label, regex } of patterns ) {
		expect( body, `${ label } found on ${ page.url() }` ).not.toMatch( regex );
	}
}

module.exports = { expectNoPhpErrors };
