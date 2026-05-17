// EN: Vite build config for the WordPress 0.71 custom block-editor prototype
//     (Issue #65). It bundles React and every @wordpress/* package the editor
//     uses INTO a single standalone module, so the boot page (editor.php)
//     needs no separate WordPress JavaScript runtime. The build output is
//     written into src/block-editor/assets/, which the Docker blog serves.
// JA: WordPress 0.71 カスタムブロックエディタ試作(Issue #65)向けの Vite
//     ビルド設定。React とエディタが使う全 @wordpress/* パッケージを 1 つの
//     スタンドアロンモジュールへバンドルするため、起動ページ(editor.php)
//     は別の WordPress JavaScript ランタイムを必要としない。ビルド成果物は
//     Docker のブログが配信する src/block-editor/assets/ へ書き出す。
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

/**
 * EN: Emit `@wordpress/block-library`'s FRONT-END stylesheet as a standalone,
 *     stably named CSS file in the build output (Issue #94).
 *
 *     The editor bundle already imports the block-library styles, so layout
 *     blocks (columns, group, ...) look right INSIDE the editor. But the
 *     WordPress 0.71 front end (src/index.php) only loads layout2b.css and has
 *     no rule for `.wp-block-columns` etc., so a Columns block stored in
 *     post_content renders as unstyled stacked divs.
 *
 *     This plugin copies `@wordpress/block-library/build-style/style.css`
 *     (the front-end stylesheet -- NOT editor.css, which is editor chrome)
 *     verbatim into the build output dir as `block-library.css`, a fixed
 *     filename. A `<link>` in src/index.php points at that file, so the front
 *     end and the exported static site render layout blocks consistently.
 *
 *     A fixed name (no content hash) is used deliberately: src/index.php is a
 *     hand-written PHP file with a hard-coded path and has no manifest lookup.
 * JA: `@wordpress/block-library` の「フロント用」スタイルシートを、安定した
 *     固定名の単独 CSS ファイルとしてビルド成果物へ出力する(Issue #94)。
 *
 *     エディタバンドルはブロックライブラリのスタイルを既に取り込むため、
 *     レイアウト系ブロック(カラム・グループ等)はエディタ「内」では正しく
 *     見える。しかし WordPress 0.71 のフロントエンド(src/index.php)は
 *     layout2b.css しか読み込まず `.wp-block-columns` 等の規則を持たないため、
 *     post_content に保存されたカラムブロックは無装飾の縦積み div になる。
 *
 *     本プラグインは `@wordpress/block-library/build-style/style.css`
 *     (フロント用スタイルシート -- エディタ用 editor.css ではない)を
 *     そのままビルド成果物へ固定名 `block-library.css` でコピーする。
 *     src/index.php の `<link>` がそのファイルを指し、フロントエンドと
 *     書き出した静的サイトがレイアウトブロックを一貫して描画する。
 *
 *     固定名(コンテンツハッシュなし)は意図的である: src/index.php は手書きの
 *     PHP ファイルでパスをハードコードしており、マニフェスト参照を持たない。
 *
 * @return {import('vite').Plugin} The Vite plugin.
 */
function emitBlockLibraryFrontEndCss() {
	// EN: The front-end stylesheet shipped by @wordpress/block-library.
	// JA: @wordpress/block-library が同梱するフロント用スタイルシート。
	const source = fileURLToPath(
		new URL(
			'./node_modules/@wordpress/block-library/build-style/style.css',
			import.meta.url
		)
	);

	return {
		name: 'emit-block-library-front-end-css',
		generateBundle() {
			this.emitFile( {
				type: 'asset',
				fileName: 'block-library.css',
				source: readFileSync( source, 'utf8' ),
			} );
		},
	};
}

/**
 * EN: Repair the Safari-only `::selection` hack that the CSS minifier breaks.
 *
 *     `@wordpress/block-editor`'s content.css hides the native text-selection
 *     highlight on the block canvas with a deliberate Safari-only CSS hack:
 *
 *         _::-webkit-full-page-media, _:future,
 *         :root .block-editor-block-list__layout::selection { background: transparent }
 *
 *     The hack works because a comma-separated selector LIST is dropped in
 *     full by any browser that cannot parse one of its selectors --
 *     `_::-webkit-full-page-media` is unknown outside Safari, so Chromium and
 *     Firefox discard the whole rule and keep painting the native highlight.
 *
 *     Vite's default (esbuild) CSS minifier "optimises" that one rule into
 *     SEPARATE rules, one selector each. The standalone
 *     `:root .block-editor-block-list__layout::selection { background:
 *     transparent }` rule is then perfectly valid in Chromium / Firefox, so
 *     it applies -- and the text-selection highlight disappears inside every
 *     paragraph block (Issue #79 bug).
 *
 *     This plugin runs after minification and rejoins the split rules back
 *     into the original comma-separated list, so the hack is Safari-only
 *     again and the highlight works in Chromium / Firefox.
 * JA: CSS minifier が壊す Safari 限定の `::selection` ハックを修復する。
 *
 *     `@wordpress/block-editor` の content.css は、意図的な Safari 限定 CSS
 *     ハックでブロックキャンバスのネイティブなテキスト選択ハイライトを
 *     隠している(上記セレクタ)。カンマ区切りのセレクタ「リスト」は、その
 *     中の 1 つでも解釈できないセレクタがあるとブラウザがルール全体を破棄
 *     する。`_::-webkit-full-page-media` は Safari 以外では未知のため、
 *     Chromium / Firefox はルール全体を捨て、ネイティブハイライトを描画し
 *     続ける。
 *
 *     Vite 既定(esbuild)の CSS minifier はこのルールをセレクタごとの
 *     「別々のルール」へ最適化する。単独になった
 *     `:root .block-editor-block-list__layout::selection { background:
 *     transparent }` は Chromium / Firefox でも有効なため適用され、すべての
 *     段落ブロック内でテキスト選択ハイライトが消える(Issue #79 のバグ)。
 *
 *     本プラグインは minify 後に走り、分割されたルールを元のカンマ区切り
 *     リストへ結合し直す。これによりハックは再び Safari 限定となり、
 *     Chromium / Firefox でハイライトが効くようになる。
 *
 * @return {import('vite').Plugin} The Vite plugin.
 */
function repairSelectionHack() {
	// EN: The two `:root ... ::selection` rules the minifier splits out,
	//     paired with the Safari-only guard selectors they must be rejoined
	//     with. Matching the standalone rule and prefixing the guards
	//     restores the original comma-separated list.
	// JA: minifier が切り出す 2 つの `:root ... ::selection` ルールと、
	//     結合し直すべき Safari 限定のガードセレクタの対応。単独ルールに
	//     一致させガードを前置することで元のカンマ区切りリストへ戻す。
	const guards = '_::-webkit-full-page-media,_:future,';
	const broken = [
		':root .block-editor-block-list__layout::selection{background-color:#0000}',
		':root [data-has-multi-selection=true] .block-editor-block-list__layout::selection{background-color:#0000}',
	];

	return {
		name: 'repair-wp-selection-hack',
		generateBundle( _options, bundle ) {
			for ( const asset of Object.values( bundle ) ) {
				if ( asset.type !== 'asset' || ! asset.fileName.endsWith( '.css' ) ) {
					continue;
				}
				let css = String( asset.source );
				for ( const rule of broken ) {
					// EN: Only rejoin a rule that is NOT already guarded.
					// JA: まだガードされていないルールだけを結合し直す。
					css = css.replaceAll( rule, ( match, offset ) => {
						const before = css.slice( Math.max( 0, offset - guards.length ), offset );
						return before.endsWith( guards ) ? match : guards + match;
					} );
				}
				asset.source = css;
			}
		},
	};
}

export default defineConfig( {
	plugins: [ react(), repairSelectionHack(), emitBlockLibraryFrontEndCss() ],
	define: {
		// EN: @wordpress/* packages branch on process.env.NODE_ENV; provide it.
		// JA: @wordpress/* は process.env.NODE_ENV で分岐するため供給する。
		'process.env.NODE_ENV': JSON.stringify( 'production' ),
		// EN: A few @wordpress/* modules reference a bare `global`.
		// JA: 一部の @wordpress/* モジュールは裸の `global` を参照する。
		global: 'globalThis',
	},
	build: {
		// EN: Emit into src/ so the Docker-served blog can load the bundle.
		// JA: Docker が配信するブログがバンドルを読めるよう src/ へ出力する。
		outDir: fileURLToPath( new URL( '../assets', import.meta.url ) ),
		emptyOutDir: true,
		// EN: editor.php reads this manifest to find the hashed bundle name.
		// JA: editor.php はこのマニフェストからハッシュ付きバンドル名を得る。
		manifest: true,
		rollupOptions: {
			input: fileURLToPath( new URL( './index.html', import.meta.url ) ),
		},
		// EN: The @wordpress/* bundle is large; silence the size warning.
		// JA: @wordpress/* のバンドルは大きい。サイズ警告を抑制する。
		chunkSizeWarningLimit: 4096,
	},
} );
