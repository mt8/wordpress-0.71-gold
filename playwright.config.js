// @ts-check
const { defineConfig, devices } = require( '@playwright/test' );

/**
 * EN: Playwright configuration for the WordPress 0.71-gold E2E suites.
 *
 *     Two distinct suites share this config, each as its own set of
 *     Playwright projects:
 *
 *     1. The Docker-site suite (`tests/e2e/`, project `chromium`) --
 *        the classic WordPress 0.71 served by the local Docker
 *        environment (see docs/docker-environment.md). Start it first
 *        with `docker compose up -d`. Run it with
 *        `npm run test:e2e` (which selects only that project).
 *
 *     2. The 071-now playground suite (`tests/playground/`, projects
 *        `playground-chromium` and `playground-webkit`, Issue #141) --
 *        the browser-based WordPress 0.71 on @php-wasm/web
 *        (tools/playground/). It needs no Docker: Playwright's
 *        `webServer` builds the playground and serves the production
 *        build with `vite preview`, and the specs run against that.
 *        Run it with `npm run test:e2e:playground`. It runs on Chromium
 *        and WebKit (Safari's engine) so a browser-compatibility
 *        regression -- such as Safari's OPFS lacking createWritable,
 *        which once broke the playground's persistence -- is caught.
 *
 *     The two suites are independent: `npm run test:e2e` selects only
 *     the Docker-site project and never builds the playground;
 *     `npm run test:e2e:playground` selects only the playground
 *     projects and never needs Docker.
 * JA: WordPress 0.71-gold E2E スイートの Playwright 設定。
 *
 *     2 つの独立したスイートがこの設定を共有し、それぞれが独自の
 *     Playwright プロジェクト群となる。
 *
 *     1. Docker サイトスイート(`tests/e2e/`、プロジェクト `chromium`)
 *        -- ローカル Docker 環境(docs/docker-environment.md 参照)が
 *        配信する従来型 WordPress 0.71。先に `docker compose up -d` で
 *        起動すること。`npm run test:e2e` で実行する(そのプロジェクト
 *        のみを選択する)。
 *
 *     2. 071-now playground スイート(`tests/playground/`、プロジェクト
 *        `playground-chromium` と `playground-webkit`、Issue #141)--
 *        @php-wasm/web 上のブラウザ内 WordPress 0.71
 *        (tools/playground/)。Docker は不要で、Playwright の
 *        `webServer` が playground をビルドし `vite preview` で本番
 *        ビルドを配信し、spec はそれに対して実行される。
 *        `npm run test:e2e:playground` で実行する。Chromium と WebKit
 *        (Safari のエンジン)で実行し、ブラウザ互換性の退行を捕捉する。
 *
 *     2 つのスイートは独立している。`npm run test:e2e` は Docker サイト
 *     プロジェクトのみを選択し playground をビルドしない。
 *     `npm run test:e2e:playground` は playground プロジェクトのみを
 *     選択し Docker を必要としない。
 */

// EN: The base URL the playground's `vite preview` server listens on.
//     vite.config.js fixes the preview port to 4173.
// JA: playground の `vite preview` サーバーが待ち受けるベース URL。
//     vite.config.js はプレビューポートを 4173 に固定する。
const PLAYGROUND_BASE_URL = 'http://localhost:4173';

// EN: Whether this Playwright invocation targets the playground suite.
//
//     Playwright starts every configured `webServer` regardless of which
//     project runs, so an unconditional playground `webServer` would
//     build and serve the playground even for a `test:e2e` Docker-site
//     run -- changing that suite's behaviour. The playground `webServer`
//     is therefore added only when a `playground-*` project is being
//     run: detected from the `--project` arguments, or assumed when no
//     `--project` filter is given (a bare `playwright test` runs every
//     project, the playground included).
// JA: この Playwright 実行が playground スイートを対象とするか。
//
//     Playwright はどのプロジェクトを実行するかに関わらず設定済みの
//     `webServer` をすべて起動するため、無条件の playground `webServer`
//     は `test:e2e` の Docker サイト実行でも playground をビルド・配信
//     してしまい、そのスイートの挙動を変えてしまう。そこで playground
//     `webServer` は `playground-*` プロジェクトが実行されるときのみ
//     追加する。`--project` 引数から検出し、`--project` フィルタが無い
//     場合は対象とみなす(素の `playwright test` は playground を含む
//     全プロジェクトを実行する)。
const projectArgs = process.argv
	.filter( ( arg ) => arg.startsWith( '--project' ) )
	.join( ' ' );
const playgroundTargeted =
	! projectArgs || projectArgs.includes( 'playground' );

module.exports = defineConfig( {
	// EN: The 2003-era b2/cafelog forms touch a small shared database, so
	//     the admin specs that create/delete data must not race each
	//     other. Run files serially with a single worker. The playground
	//     specs also share one in-browser SQLite database per boot, so
	//     serial execution suits both suites.
	// JA: 2003 年当時の b2/cafelog のフォームは小さな共有 DB を触るため、
	//     データを作成/削除する管理画面 spec は競合させてはならない。
	//     ワーカー 1 つで直列実行する。playground spec も起動ごとに
	//     1 つのブラウザ内 SQLite DB を共有するため、直列実行が双方に
	//     適する。
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

	// EN: Build the 071-now playground and serve its production build
	//     with `vite preview`, so the playground specs run against the
	//     real built app -- the same bundle the GitHub Pages deploy
	//     ships. `vite preview` adds the COOP/COEP cross-origin isolation
	//     headers php-wasm needs (see tools/playground/vite.config.js).
	//     Added only when the playground suite is targeted, so a
	//     Docker-site run never builds the playground (see
	//     `playgroundTargeted` above).
	// JA: 071-now playground をビルドし `vite preview` で本番ビルドを
	//     配信する。これで playground spec は実際にビルドされたアプリ
	//     -- GitHub Pages デプロイと同じバンドル -- に対して実行される。
	//     `vite preview` は php-wasm が必要とする COOP/COEP のクロス
	//     オリジン分離ヘッダを付与する(tools/playground/vite.config.js
	//     参照)。playground スイートが対象のときのみ追加するため、
	//     Docker サイト実行は playground をビルドしない。
	webServer: playgroundTargeted
		? {
				// EN: Build the playground, then serve its production
				//     build with `vite preview`. `vite preview` only
				//     serves an existing dist/, so the build must run
				//     first; chaining them keeps it one webServer entry.
				// JA: playground をビルドし `vite preview` で本番ビルドを
				//     配信する。`vite preview` は既存の dist/ を配信する
				//     だけなので先にビルドを実行する必要がある。
				command:
					'npm run build --workspace tools/playground && ' +
					'npm run preview --workspace tools/playground',
				url: PLAYGROUND_BASE_URL,
				timeout: 240 * 1000,
				reuseExistingServer: ! process.env.CI,
				stdout: 'pipe',
				stderr: 'pipe',
		  }
		: undefined,

	projects: [
		// EN: The Docker-site suite -- unchanged from before Issue #141.
		//     Named `chromium` so `npm run test:e2e` and any existing
		//     invocation keep selecting exactly this project.
		// JA: Docker サイトスイート -- Issue #141 以前から変更なし。
		//     `chromium` と命名し、`npm run test:e2e` や既存の呼び出しが
		//     このプロジェクトを選び続けるようにする。
		{
			name: 'chromium',
			testDir: './tests/e2e',
			use: { ...devices['Desktop Chrome'] },
		},

		// EN: The 071-now playground suite on Chromium (Issue #141).
		//     Its own testDir, a localhost:4173 baseURL pointing at the
		//     `vite preview` server, and a longer timeout -- php-wasm's
		//     ~40 MB PHP 8.3 .wasm runtime takes several seconds to boot.
		// JA: Chromium 上の 071-now playground スイート(Issue #141)。
		//     独自の testDir、`vite preview` サーバーを指す
		//     localhost:4173 の baseURL、長めのタイムアウト -- php-wasm の
		//     約 40 MB の PHP 8.3 .wasm ランタイムは起動に数秒かかる。
		{
			name: 'playground-chromium',
			testDir: './tests/playground',
			timeout: 120 * 1000,
			use: {
				...devices[ 'Desktop Chrome' ],
				baseURL: PLAYGROUND_BASE_URL,
			},
		},

		// EN: The 071-now playground suite on WebKit (Safari's engine,
		//     Issue #130 / #141). Running WebKit catches a
		//     browser-compatibility regression -- Safari's OPFS lacks
		//     FileSystemFileHandle.prototype.createWritable, so the
		//     persistence layer must fall back to IndexedDB there, and
		//     this project proves that fallback path.
		// JA: WebKit 上の 071-now playground スイート(Safari のエンジン、
		//     Issue #130 / #141)。WebKit を実行することでブラウザ互換性
		//     の退行を捕捉する -- Safari の OPFS は
		//     FileSystemFileHandle.prototype.createWritable を欠くため、
		//     永続化層はそこで IndexedDB へフォールバックする必要があり、
		//     このプロジェクトがそのフォールバック経路を検証する。
		{
			name: 'playground-webkit',
			testDir: './tests/playground',
			timeout: 120 * 1000,
			use: {
				...devices[ 'Desktop Safari' ],
				baseURL: PLAYGROUND_BASE_URL,
			},
		},
	],
} );
