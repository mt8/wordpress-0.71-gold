// @ts-check
const { expect } = require( '@playwright/test' );

/**
 * EN: Page-level assertion helpers for the WordPress 0.71-gold E2E suite.
 * JA: WordPress 0.71-gold E2E スイート用のページレベル検証ヘルパー。
 */

/**
 * EN: Assert that the page body shows no PHP error output. WordPress 0.71 runs
 *     on PHP 8.3, where any surviving legacy construct surfaces as a visible
 *     `Fatal error`, `Warning`, `Notice` or `Deprecated` line. The migration
 *     work aims for clean pages, so any such text is a regression.
 * JA: ページ本文に PHP のエラー出力が無いことを検証する。WordPress 0.71 は
 *     PHP 8.3 上で動作し、残存するレガシー構文は `Fatal error` / `Warning` /
 *     `Notice` / `Deprecated` 行として可視化される。移行作業はクリーンな
 *     ページを目指しているため、その種の文字列はリグレッションである。
 *
 * @param {import('@playwright/test').Page} page Playwright page. / Playwright ページ。
 */
async function expectNoPhpErrors( page ) {
	const body = ( await page.content() ) || '';

	// EN: Patterns PHP emits when display_errors is on. Each is checked
	//     individually so a failure message names the exact culprit.
	// JA: display_errors が有効なとき PHP が出力するパターン。失敗メッセージで
	//     原因を特定できるよう個別に検査する。
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
