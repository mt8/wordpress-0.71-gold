// @ts-check
const { defineConfig, devices } = require( '@playwright/test' );

/**
 * Playwright configuration for the WordPress 0.71-gold E2E suites.
 *
 * Two distinct suites share this config, each as its own set of
 * Playwright projects:
 *
 * 1. The Docker-site suite (`tests/e2e/`, project `chromium`) --
 *    the classic WordPress 0.71 served by the local Docker
 *    environment (see docs/docker-environment.md). Start it first
 *    with `npx 071-env start`. Run it with
 *    `npm run test:e2e` (which selects only that project).
 *
 * 2. The 071-now playground suite (`tests/playground/`, projects
 *    `playground-chromium` and `playground-webkit`, Issue #141) --
 *    the browser-based WordPress 0.71 on @php-wasm/web
 *    (tools/playground/). It needs no Docker: Playwright's
 *    `webServer` builds the playground and serves the production
 *    build with `vite preview`, and the specs run against that.
 *    Run it with `npm run test:e2e:playground`. It runs on Chromium
 *    and WebKit (Safari's engine) so a browser-compatibility
 *    regression -- such as Safari's OPFS lacking createWritable,
 *    which once broke the playground's persistence -- is caught.
 *
 * The two suites are independent: `npm run test:e2e` selects only
 * the Docker-site project and never builds the playground;
 * `npm run test:e2e:playground` selects only the playground
 * projects and never needs Docker.
 */

// The base URL the playground's `vite preview` server listens on.
// vite.config.js fixes the preview port to 4173.
const PLAYGROUND_BASE_URL = 'http://localhost:4173';

// Whether this Playwright invocation targets the playground suite.
//
// Playwright starts every configured `webServer` regardless of which
// project runs, so an unconditional playground `webServer` would
// build and serve the playground even for a `test:e2e` Docker-site
// run -- changing that suite's behaviour. The playground `webServer`
// is therefore added only when a `playground-*` project is being
// run: detected from the `--project` arguments, or assumed when no
// `--project` filter is given (a bare `playwright test` runs every
// project, the playground included).
const projectArgs = process.argv
	.filter( ( arg ) => arg.startsWith( '--project' ) )
	.join( ' ' );
const playgroundTargeted =
	! projectArgs || projectArgs.includes( 'playground' );

module.exports = defineConfig( {
	// The 2003-era b2/cafelog forms touch a small shared database, so
	// the admin specs that create/delete data must not race each
	// other. Run files serially with a single worker. The playground
	// specs also share one in-browser SQLite database per boot, so
	// serial execution suits both suites.
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
		// Accept the legacy ISO-8859-1 pages without locale warnings.
		ignoreHTTPSErrors: true,
	},

	// Build the 071-now playground and serve its production build
	// with `vite preview`, so the playground specs run against the
	// real built app -- the same bundle the GitHub Pages deploy
	// ships. `vite preview` adds the COOP/COEP cross-origin isolation
	// headers php-wasm needs (see tools/playground/vite.config.js).
	// Added only when the playground suite is targeted, so a
	// Docker-site run never builds the playground (see
	// `playgroundTargeted` above).
	webServer: playgroundTargeted
		? {
				// Build the playground, then serve its production
				// build with `vite preview`. `vite preview` only
				// serves an existing dist/, so the build must run
				// first; chaining them keeps it one webServer entry.
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
		// The Docker-site suite -- unchanged from before Issue #141.
		// Named `chromium` so `npm run test:e2e` and any existing
		// invocation keep selecting exactly this project.
		{
			name: 'chromium',
			testDir: './tests/e2e',
			use: { ...devices['Desktop Chrome'] },
		},

		// The 071-now playground suite on Chromium (Issue #141).
		// Its own testDir, a localhost:4173 baseURL pointing at the
		// `vite preview` server, and a longer timeout -- php-wasm's
		// ~40 MB PHP 8.3 .wasm runtime takes several seconds to boot.
		{
			name: 'playground-chromium',
			testDir: './tests/playground',
			timeout: 120 * 1000,
			use: {
				...devices[ 'Desktop Chrome' ],
				baseURL: PLAYGROUND_BASE_URL,
			},
		},

		// The 071-now playground suite on WebKit (Safari's engine,
		// Issue #130 / #141). Running WebKit catches a
		// browser-compatibility regression -- Safari's OPFS lacks
		// FileSystemFileHandle.prototype.createWritable, so the
		// persistence layer must fall back to IndexedDB there, and
		// this project proves that fallback path.
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
