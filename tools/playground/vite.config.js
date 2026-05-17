// EN: Vite config for the 071-now feasibility spike (Issue #108).
//
//     Bundles the browser app that boots @php-wasm/web. Two things need
//     care: the WebAssembly PHP runtime ships large .wasm/.data assets
//     that must not be inlined as base64, and php-wasm's threading code
//     wants cross-origin isolation headers in dev.
// JA: 071-now 実現可能性検証(Issue #108)向けの Vite 設定。
import { defineConfig } from 'vite';

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
	plugins: [ stubPhpWasmIntlData() ],
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
