/**
 * EN: Entry point for the WordPress 0.71 custom block-editor prototype
 *     (Issue #65). Registers the core static blocks, then mounts the editor
 *     component into #block-editor-root.
 * JA: WordPress 0.71 カスタムブロックエディタ試作(Issue #65)のエントリ
 *     ポイント。標準の静的ブロックを登録し、エディタコンポーネントを
 *     #block-editor-root にマウントする。
 */
import { createRoot } from '@wordpress/element';
import { registerCoreBlocks } from '@wordpress/block-library';
// EN: Importing @wordpress/format-library registers the core RichText formats
//     (bold, italic, link, ...) as a side effect, so they appear in the block
//     toolbar when editing text.
// JA: @wordpress/format-library の読み込みは、副作用としてコアの RichText
//     フォーマット(太字・斜体・リンク等)を登録する。テキスト編集時に
//     ブロックツールバーへ表示される。
import '@wordpress/format-library';

// EN: Stylesheets for the bundled @wordpress/* UI. Vite collects them into
//     the build's CSS, which editor.php links from the manifest.
// JA: バンドルした @wordpress/* UI のスタイルシート。Vite はこれらをビルドの
//     CSS にまとめ、editor.php がマニフェストから link する。
import '@wordpress/components/build-style/style.css';
import '@wordpress/block-editor/build-style/style.css';
import '@wordpress/block-editor/build-style/content.css';
import '@wordpress/block-library/build-style/style.css';
import '@wordpress/block-library/build-style/editor.css';

import { Editor } from './Editor.jsx';
import './app.css';

// EN: The core static blocks (paragraph, heading, list, image, quote, ...)
//     register themselves client-side -- no server-side register_block_type()
//     is needed, which is exactly why this works on WordPress 0.71.
// JA: 標準の静的ブロック(段落・見出し・リスト・画像・引用ほか)はクライアント
//     側で自己登録する -- サーバー側の register_block_type() は不要であり、
//     これこそが WordPress 0.71 でも動作する理由である。
registerCoreBlocks();

// EN: Configuration comes from the boot page (editor.php). When the bundle is
//     opened directly by Vite dev, fall back to sensible defaults.
// JA: 設定は起動ページ(editor.php)から渡される。Vite dev で直接開いた
//     場合は妥当な既定値にフォールバックする。
const config = window.BLOCK_EDITOR_PROTOTYPE || {
	postId: 1,
	loadEndpoint: '/src/block-editor/api/load.php',
	saveEndpoint: '/src/block-editor/api/save.php',
	frontEndUrl: '/src/index.php?p=1',
};

const container = document.getElementById( 'block-editor-root' );
const root = createRoot( container );
root.render( <Editor config={ config } /> );
