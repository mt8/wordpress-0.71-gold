// EN: Vite config for the 071-now playground (Issue #108, #116, #118).
//
//     Bundles the browser app that boots @php-wasm/web. Three things
//     need care: the WebAssembly PHP runtime ships large .wasm/.data
//     assets that must not be inlined as base64; php-wasm's threading
//     code wants cross-origin isolation headers in dev; and @php-wasm/web
//     statically references every PHP version it supports (5.2-8.5), so
//     the build must be told to ship only the PHP 8.3 runtime.
// JA: 071-now playground(Issue #108・#116・#118)向けの Vite 設定。
import { defineConfig } from 'vite';

// EN: The only PHP version 071-now runs. WordPress 0.71-gold is being
//     ported to PHP 8.3, so the playground boots @php-wasm/web with
//     '8.3' (see src/main.js) and never any other version.
// JA: 071-now が動かす唯一の PHP バージョン。
const TARGET_PHP_VERSION = '8.3';

// EN: The per-version php-wasm web packages 071-now must NOT bundle.
//     @php-wasm/web depends on one package per supported PHP version
//     (@php-wasm/web-5-2 ... @php-wasm/web-8-5) and its getPHPLoaderModule
//     / getIntlExtensionPath functions are a switch whose every case is a
//     static `await import('@php-wasm/web-<v>')`. Rollup resolves every
//     one of those literal-string imports at build time, so a plain build
//     ships all eight PHP runtimes -- roughly 290 MB of .wasm. Only the
//     '8.3' case is ever reached at runtime; the rest are dead branches.
// JA: 071-now がバンドルしてはならないバージョン別 php-wasm web パッケージ。
//     @php-wasm/web は対応 PHP バージョンごとに 1 パッケージへ依存し、その
//     getPHPLoaderModule / getIntlExtensionPath は全 case が静的な
//     `await import('@php-wasm/web-<v>')` の switch である。Rollup は
//     それらのリテラル import をビルド時に解決するため、素のビルドは
//     8 つの PHP ランタイム(約 290 MB の .wasm)を同梱する。実行時に到達
//     するのは '8.3' の case だけで、残りは到達しない分岐である。
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
 * EN: Trim the php-wasm bundle to the PHP 8.3 runtime only (Issue #118).
 *
 *     Resolves every @php-wasm/web-<v> package other than the PHP 8.3
 *     one to an inert stub module. The stub re-exports the same surface
 *     (`getPHPLoaderModule`, `getIntlExtensionPath`, `jspi`) so the named
 *     imports in @php-wasm/web still resolve, but it carries no `.wasm`
 *     import -- so Rollup never pulls those runtimes into the build. The
 *     stub's functions throw if called, which never happens: src/main.js
 *     loads '8.3', so getPHPLoaderModule only ever takes the 8.3 branch.
 * JA: php-wasm バンドルを PHP 8.3 ランタイムのみへ絞る(Issue #118)。
 *
 *     PHP 8.3 以外の @php-wasm/web-<v> パッケージをすべて不活性なスタブ
 *     モジュールへ解決する。スタブは同じ表面(`getPHPLoaderModule`・
 *     `getIntlExtensionPath`・`jspi`)を再エクスポートするので
 *     @php-wasm/web の名前付き import は解決できるが、`.wasm` の import を
 *     持たないため Rollup はそれらのランタイムをビルドへ取り込まない。
 *     スタブの関数は呼ばれれば throw するが、src/main.js は '8.3' を
 *     読み込むため呼ばれることはない。
 *
 * @return {import('vite').Plugin} The Vite plugin.
 */
function trimPhpWasmToTargetVersion() {
	const virtualPrefix = '\0php-wasm-unused-version-stub:';
	return {
		name: '071-now-trim-php-wasm-versions',
		// EN: Resolve these specifiers before Vite's own resolver maps
		//     them to the real on-disk packages.
		// JA: Vite 自身のリゾルバが実パッケージへ解決する前に解決する。
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
 * EN: Stub the optional Intl ICU data import in @php-wasm/web.
 *
 *     @php-wasm/web has a dynamic import for `../intl/shared/icu.dat`,
 *     the data file of the optional `intl` PHP extension. 071-now never
 *     enables `intl` (WordPress 0.71 does not use it), but Rollup still
 *     tries to resolve that path at build time and fails. This plugin
 *     resolves the import to an empty virtual module so the build
 *     succeeds; the dynamic import is never reached at runtime.
 * JA: @php-wasm/web の任意の Intl ICU データ import をスタブする。
 *
 *     @php-wasm/web は任意の `intl` PHP 拡張のデータファイル
 *     `../intl/shared/icu.dat` を動的 import する。071-now は `intl` を
 *     有効化しない(WordPress 0.71 は使わない)が、Rollup はビルド時に
 *     そのパスを解決しようとして失敗する。空の仮想モジュールへ解決させる。
 *
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
	plugins: [ stubPhpWasmIntlData(), trimPhpWasmToTargetVersion() ],
	// EN: @php-wasm/web imports its .wasm / .data runtime files as plain
	//     module imports expecting a URL string (emscripten loads them
	//     itself). Treating them as static assets makes Vite emit a URL,
	//     which is what the emscripten loader wants -- not an ESM wasm
	//     module. The .data files are the php-wasm bundled filesystem.
	// JA: @php-wasm/web は .wasm / .data ランタイムファイルを URL 文字列を
	//     期待する素の import で取り込む。静的アセット扱いにすると Vite は
	//     URL を出力し、emscripten ローダーが求める形になる。
	assetsInclude: [ '**/*.wasm', '**/*.data' ],
	// EN: php-wasm pulls in Node-shaped imports it does not use in the
	//     browser; exclude it from dep pre-bundling so Vite serves the
	//     ESM build untouched and the .wasm assets resolve at runtime.
	// JA: php-wasm はブラウザで使わない Node 形式の import を含むため、
	//     依存事前バンドルから除外する。
	optimizeDeps: {
		exclude: [ '@php-wasm/web', '@php-wasm/universal' ],
	},
	server: {
		// EN: Cross-origin isolation -- php-wasm uses SharedArrayBuffer.
		// JA: クロスオリジン分離 -- php-wasm は SharedArrayBuffer を使う。
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
		// EN: Keep the .wasm / .data runtime assets as separate files.
		// JA: .wasm / .data ランタイムアセットを別ファイルのまま保つ。
		assetsInlineLimit: 0,
		target: 'esnext',
		chunkSizeWarningLimit: 8192,
	},
} );
