// @ts-check
const { defineConfig, devices } = require( '@playwright/test' );

/**
 * EN: Playwright configuration for the WordPress 0.71-gold E2E suite.
 *     The suite runs against the local Docker environment (see
 *     docs/docker-environment.md). Start it first with `docker compose up -d`.
 * JA: WordPress 0.71-gold E2E スイートの Playwright 設定。
 *     スイートはローカル Docker 環境 (docs/docker-environment.md 参照) に対して
 *     実行する。先に `docker compose up -d` で起動しておくこと。
 */
module.exports = defineConfig( {
	testDir: './tests/e2e',

	// EN: The 2003-era b2/cafelog forms touch a small shared database, so the
	//     admin specs that create/delete data must not race each other. Run
	//     files serially with a single worker.
	// JA: 2003 年当時の b2/cafelog のフォームは小さな共有 DB を触るため、
	//     データを作成/削除する管理画面 spec は競合させてはならない。
	//     ワーカー 1 つで直列実行する。
	fullyParallel: false,
	workers: 1,
	forbidOnly: !! process.env.CI,
	retries: 0,

	reporter: [ [ 'list' ], [ 'html', { open: 'never' } ] ],

	timeout: 30 * 1000,
	expect: { timeout: 10 * 1000 },

	use: {
		baseURL: process.env.E2E_BASE_URL || 'http://localhost:8080',
		actionTimeout: 10 * 1000,
		navigationTimeout: 15 * 1000,
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure',
		// EN: Accept the legacy ISO-8859-1 pages without locale warnings.
		// JA: レガシーな ISO-8859-1 ページをロケール警告なしで受け入れる。
		ignoreHTTPSErrors: true,
	},

	projects: [
		{
			name: 'chromium',
			use: { ...devices['Desktop Chrome'] },
		},
	],
} );
