<?php
/**
 * Block-editor prototype -- boot page.
 *
 * EN: Issue #65 experimental prototype. Serves the HTML shell that loads the
 *     bundled custom block editor (built from tools/block-editor/ by
 *     `npm run build` into ../assets/) and mounts it for a chosen post id.
 *     Usage: open
 *     editor.php?post=ID in a browser while logged in to WordPress 0.71's
 *     admin.
 *
 *     Issue #96 adds a "new post" mode. When the request has no usable post id
 *     (no `post` parameter, or `post=new`), the boot config reports postId 0
 *     and an isNew flag, so the editor starts empty and the first save INSERTs
 *     a fresh b2posts row instead of UPDATE-ing an existing one.
 * JA: Issue #65 の実験的試作。バンドル済みのカスタムブロックエディタ
 *     (tools/block-editor/ から `npm run build` で ../assets/ へビルド)を
 *     読み込み、選んだ投稿 ID に対してマウントする HTML シェルを配信する。
 *     使い方:
 *     WordPress 0.71 の管理画面にログインした状態で、ブラウザで
 *     editor.php?post=ID を開く。
 *
 *     Issue #96 で「新規投稿」モードを追加する。リクエストに有効な投稿 ID が
 *     無い場合(`post` パラメータ無し、または `post=new`)、ブート設定は
 *     postId 0 と isNew フラグを報告し、エディタは空の状態で始まり、最初の
 *     保存は既存行の UPDATE ではなく b2posts への新規行 INSERT を行う。
 *
 * @package wordpress-0.71-gold
 */

// EN: Decide between "edit existing post" and "new post" mode. The `post`
//     parameter is cast to int (it is echoed into a JS literal / URL below);
//     a missing parameter, `post=new`, or a non-positive id all mean new post.
// JA: 「既存投稿の編集」と「新規投稿」モードを判定する。`post` パラメータは
//     整数にキャスト(下で JS リテラル / URL に出力する)。パラメータ無し・
//     `post=new`・正でない ID はいずれも新規投稿を意味する。
$post_id = isset( $_GET['post'] ) ? (int) $_GET['post'] : 0;
$is_new  = ( $post_id <= 0 );

// EN: Locate the build output. The bundle filenames are hashed by Vite, so
//     read them from the manifest the build writes.
// JA: ビルド成果物の場所を特定する。バンドルのファイル名は Vite により
//     ハッシュ化されるため、ビルドが書き出すマニフェストから読み取る。
$assets_dir   = __DIR__ . '/../assets';
$manifest_url = '../assets/.vite/manifest.json';
$manifest     = is_readable( $assets_dir . '/.vite/manifest.json' )
	? json_decode( (string) file_get_contents( $assets_dir . '/.vite/manifest.json' ), true )
	: null;

$entry  = ( is_array( $manifest ) && isset( $manifest['index.html'] ) ) ? $manifest['index.html'] : null;
$js_url = ( is_array( $entry ) && isset( $entry['file'] ) ) ? '../assets/' . $entry['file'] : null;
$css    = ( is_array( $entry ) && isset( $entry['css'] ) ) ? $entry['css'] : array();

header( 'Content-Type: text/html; charset=utf-8' );
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="icon" href="data:," />
<title>Block Editor Prototype (Issue #65) &mdash; <?php echo $is_new ? 'new post' : 'post ' . (int) $post_id; ?></title>
<?php foreach ( $css as $href ) : ?>
<link rel="stylesheet" href="../assets/<?php echo htmlspecialchars( (string) $href, ENT_QUOTES ); ?>" />
<?php endforeach; ?>
<style>
	body { margin: 0; font-family: -apple-system, system-ui, sans-serif; }
	.be-missing { padding: 2rem; max-width: 50rem; margin: 0 auto; color: #1e1e1e; }
	.be-missing code { background: #f0f0f0; padding: 0.1em 0.4em; border-radius: 3px; }
</style>
</head>
<body>
<?php if ( null === $js_url ) : ?>
<div class="be-missing">
	<h1>Block editor bundle not built</h1>
	<p>EN: The prototype bundle was not found. Build it first:</p>
	<pre><code>cd tools/block-editor
npm install
npm run build</code></pre>
	<p>The build writes to <code>src/block-editor/assets/</code>, which this
	page then loads. See <code>tools/block-editor/README.md</code>.</p>
	<hr />
	<p>JA: 試作バンドルが見つかりません。先にビルドしてください
	(上のコマンド)。ビルドは <code>src/block-editor/assets/</code> へ
	出力され、本ページがそれを読み込みます。詳細は
	<code>tools/block-editor/README.md</code> を参照。</p>
</div>
<?php else : ?>
<div id="block-editor-root"></div>
<script>
	// EN: Configuration handed to the bundled editor. The endpoints are
	//     relative to this page (src/block-editor/api/).
	// JA: バンドル済みエディタへ渡す設定。エンドポイントは本ページ
	//     (src/block-editor/api/)からの相対パスである。
	window.BLOCK_EDITOR_PROTOTYPE = {
		postId: <?php echo (int) $post_id; ?>,
		isNew: <?php echo $is_new ? 'true' : 'false'; ?>,
		loadEndpoint: 'load.php',
		saveEndpoint: 'save.php',
		frontEndUrl: '../../index.php?p=<?php echo (int) $post_id; ?>',
		adminUrl: '../../wp-admin/b2edit.php'
	};
</script>
<script type="module" src="<?php echo htmlspecialchars( (string) $js_url, ENT_QUOTES ); ?>"></script>
<?php endif; ?>
</body>
</html>
