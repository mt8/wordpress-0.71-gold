// Vite config for the 071-now playground (Issue #108, #116, #118,
//     #128).
//
//     Bundles the browser app that boots @php-wasm/web. Three things
//     need care: the WebAssembly PHP runtime ships large .wasm/.data
//     assets that must not be inlined as base64; php-wasm's threading
//     code wants cross-origin isolation headers in dev; and @php-wasm/web
//     statically references every PHP version it supports (5.2-8.5), so
//     the build must be told to ship only the PHP 8.3 runtime.
import { defineConfig } from 'vite';

// The public base path the built app is served under (Issue #128).
//
//     `vite preview` and the headless verifier serve the app at the
//     origin root, so the default is '/'. The GitHub Pages deploy serves
//     it under the repository name (https://mt8.github.io/
//     wordpress-0.71-gold/), so the Pages workflow sets PLAYGROUND_BASE
//     to '/wordpress-0.71-gold/'. The value reaches the browser app as
//     import.meta.env.BASE_URL: src/main.js registers the service worker
//     and builds the scoped blog paths under it, so a project-page
//     deploy and a root-served preview both work from one build config.
const PUBLIC_BASE = process.env.PLAYGROUND_BASE || '/';

// The only PHP version 071-now runs. WordPress 0.71-gold is being
//     ported to PHP 8.3, so the playground boots @php-wasm/web with
//     '8.3' (see src/main.js) and never any other version.
const TARGET_PHP_VERSION = '8.3';

// The per-version php-wasm web packages 071-now must NOT bundle.
//     @php-wasm/web depends on one package per supported PHP version
//     (@php-wasm/web-5-2 ... @php-wasm/web-8-5) and its getPHPLoaderModule
//     / getIntlExtensionPath functions are a switch whose every case is a
//     static `await import('@php-wasm/web-<v>')`. Rollup resolves every
//     one of those literal-string imports at build time, so a plain build
//     ships all eight PHP runtimes -- roughly 290 MB of .wasm. Only the
//     '8.3' case is ever reached at runtime; the rest are dead branches.
const UNUSED_PHP_WASM_PACKAGES = [
	'@php-wasm/web-5-2',
	'@php-wasm/web-7-4',
	'@php-wasm/web-8-0',
	'@php-wasm/web-8-1',
	'@php-wasm/web-8-2',
	'@php-wasm/web-8-4',
	'@php-wasm/web-8-5',
];

/**
 * Trim the php-wasm bundle to the PHP 8.3 runtime only (Issue #118).
 *
 *     Resolves every @php-wasm/web-<v> package other than the PHP 8.3
 *     one to an inert stub module. The stub re-exports the same surface
 *     (`getPHPLoaderModule`, `getIntlExtensionPath`, `jspi`) so the named
 *     imports in @php-wasm/web still resolve, but it carries no `.wasm`
 *     import -- so Rollup never pulls those runtimes into the build. The
 *     stub's functions throw if called, which never happens: src/main.js
 *     loads '8.3', so getPHPLoaderModule only ever takes the 8.3 branch.
 * @return {import('vite').Plugin} The Vite plugin.
 */
function trimPhpWasmToTargetVersion() {
	const virtualPrefix = '\0php-wasm-unused-version-stub:';
	return {
		name: '071-now-trim-php-wasm-versions',
		// Resolve these specifiers before Vite's own resolver maps
		//     them to the real on-disk packages.
		enforce: 'pre',
		resolveId( source ) {
			if ( UNUSED_PHP_WASM_PACKAGES.includes( source ) ) {
				return virtualPrefix + source;
			}
			return null;
		},
		load( id ) {
			if ( id.startsWith( virtualPrefix ) ) {
				const pkg = id.slice( virtualPrefix.length );
				return [
					`// 071-now: stub for ${ pkg } -- 071-now ships only`,
					`// the PHP ${ TARGET_PHP_VERSION } runtime (Issue #118).`,
					'const unreachable = ( name ) => {',
					'\tthrow new Error(',
					"\t\t`071-now bundles only PHP " +
						TARGET_PHP_VERSION +
						"; ${ name } from " +
						pkg +
						' was called`',
					'\t);',
					'};',
					'export const getPHPLoaderModule = () =>',
					"\tunreachable( 'getPHPLoaderModule' );",
					'export const getIntlExtensionPath = () =>',
					"\tunreachable( 'getIntlExtensionPath' );",
					'export const jspi = false;',
				].join( '\n' );
			}
			return null;
		},
	};
}

/**
 * Stub the optional Intl ICU data import in @php-wasm/web.
 *
 *     @php-wasm/web has a dynamic import for `../intl/shared/icu.dat`,
 *     the data file of the optional `intl` PHP extension. 071-now never
 *     enables `intl` (WordPress 0.71 does not use it), but Rollup still
 *     tries to resolve that path at build time and fails. This plugin
 *     resolves the import to an empty virtual module so the build
 *     succeeds; the dynamic import is never reached at runtime.
 * @return {import('vite').Plugin} The Vite plugin.
 */
function stubPhpWasmIntlData() {
	const virtualId = '\0php-wasm-intl-data-stub';
	return {
		name: '071-now-stub-php-wasm-intl-data',
		resolveId( source ) {
			if ( source.includes( 'intl/shared/icu.dat' ) ) {
				return virtualId;
			}
			return null;
		},
		load( id ) {
			if ( id === virtualId ) {
				return 'export default undefined;';
			}
			return null;
		},
	};
}

export default defineConfig( {
	// Serve the app under PUBLIC_BASE so the built index.html and the
	//     bundled assets resolve relative to the deploy path -- '/' for the
	//     local preview, '/wordpress-0.71-gold/' for the GitHub Pages
	//     project page (Issue #128).
	base: PUBLIC_BASE,
	plugins: [ stubPhpWasmIntlData(), trimPhpWasmToTargetVersion() ],
	// @php-wasm/web imports its .wasm / .data runtime files as plain
	//     module imports expecting a URL string (emscripten loads them
	//     itself). Treating them as static assets makes Vite emit a URL,
	//     which is what the emscripten loader wants -- not an ESM wasm
	//     module. The .data files are the php-wasm bundled filesystem.
	assetsInclude: [ '**/*.wasm', '**/*.data' ],
	// php-wasm pulls in Node-shaped imports it does not use in the
	//     browser; exclude it from dep pre-bundling so Vite serves the
	//     ESM build untouched and the .wasm assets resolve at runtime.
	optimizeDeps: {
		exclude: [ '@php-wasm/web', '@php-wasm/universal' ],
	},
	server: {
		// Cross-origin isolation -- php-wasm uses SharedArrayBuffer.
		headers: {
			'Cross-Origin-Embedder-Policy': 'require-corp',
			'Cross-Origin-Opener-Policy': 'same-origin',
		},
	},
	preview: {
		headers: {
			'Cross-Origin-Embedder-Policy': 'require-corp',
			'Cross-Origin-Opener-Policy': 'same-origin',
		},
	},
	build: {
		// Keep the .wasm / .data runtime assets as separate files.
		assetsInlineLimit: 0,
		target: 'esnext',
		chunkSizeWarningLimit: 8192,
	},
} );
