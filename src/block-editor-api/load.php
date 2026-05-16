<?php
/**
 * Block-editor prototype -- GET a post's content.
 *
 * EN: Issue #65 experimental prototype. Returns the raw post_content of a
 *     WordPress 0.71 post as JSON, so the custom block editor can parse it
 *     into a block tree. Usage: GET load.php?post=ID
 * JA: Issue #65 の実験的試作。WordPress 0.71 の投稿の post_content を生のまま
 *     JSON で返す。カスタムブロックエディタはそれを解析してブロックツリーに
 *     する。使い方: GET load.php?post=ID
 *
 * @package wordpress-0.71-gold
 */

require_once __DIR__ . '/bootstrap.php';

be_require_login();

// EN: Cast the post id to int -- it is used unquoted in SQL. This is the
//     same hardening applied across the codebase in Issue #31.
// JA: 投稿 ID を整数にキャスト -- SQL でクォート無しで使う。Issue #31 で
//     コードベース全体に適用したのと同じ堅牢化である。
$post_id = isset( $_GET['post'] ) ? (int) $_GET['post'] : 0;

if ( $post_id <= 0 ) {
	be_json( 400, array( 'error' => 'invalid_post_id' ) );
}

$post = get_postdata( $post_id );

if ( ! $post ) {
	be_json( 404, array( 'error' => 'post_not_found' ) );
}

// EN: post_content / post_title are stored slash-escaped by 0.71's
//     format_to_post(); strip the slashes so the editor receives clean text.
// JA: post_content / post_title は 0.71 の format_to_post() によりスラッシュ
//     付きで保存される。エディタへ綺麗なテキストを渡すためスラッシュを除去。
be_json(
	200,
	array(
		'id'      => (int) $post['ID'],
		'title'   => stripslashes( (string) $post['Title'] ),
		'content' => stripslashes( (string) $post['Content'] ),
		'status'  => (string) $post['post_status'],
	)
);
