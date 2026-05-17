<?php
/**
 * Block-editor prototype -- SAVE a post's content.
 *
 * Issue #65 experimental prototype. Accepts a JSON body
 * { "post": ID, "content": "<!-- wp:* --> ...", "title": "..." } and
 * writes the block markup into WordPress 0.71's existing post_content
 * column. Because the `<!-- wp:* -->` delimiters are HTML comments, the
 * 0.71 front end keeps rendering the post normally. Usage: POST save.php
 *
 * Issue #79 also accepts "status" (publish / draft / private) and
 * "category" (a single cat_ID), persisting them to post_status and
 * post_category so the editor's settings sidebar round-trips.
 *
 * Issue #96 adds a "new post" path: when the request carries no existing
 * post id (post 0, the new-post mode), this endpoint INSERTs a fresh
 * b2posts row -- mirroring WordPress 0.71's own `case 'post'` handler in
 * wp-admin/b2edit.php -- and responds with the new id so the editor adopts
 * it; subsequent saves then UPDATE the same post.
 *     { "post": ID, "content": "<!-- wp:* --> ...", "title": "..." } を受け取り、
 *     ブロックマークアップを WordPress 0.71 の既存 post_content カラムへ
 *     書き込む。`<!-- wp:* -->` 区切りは HTML コメントなので、0.71 の
 *     フロントエンドは投稿を通常どおり描画し続ける。使い方: POST save.php
 *
 *     Issue #79 では "status"(publish
 *     (単一の cat_ID)も受け取り、post_status
 *     エディタの設定サイドバーが往復できるようにする。
 *
 *     Issue #96 で「新規投稿」の経路を追加する。リクエストに既存の投稿 ID が
 *     無い場合(post 0、新規投稿モード)、本エンドポイントは b2posts へ新規行を
 *     INSERT し(WordPress 0.71 自身の wp-admin/b2edit.php の `case 'post'`
 *     ハンドラに倣う)、エディタが採用できるよう新しい id を応答する。以降の
 *     保存は同じ投稿を UPDATE する。
 *
 * @package wordpress-0.71-gold
 */

require_once __DIR__ . '/bootstrap.php';

$current_user = be_require_login();

if ( 'POST' !== ( isset( $_SERVER['REQUEST_METHOD'] ) ? $_SERVER['REQUEST_METHOD'] : '' ) ) {
	be_json( 405, array( 'error' => 'method_not_allowed' ) );
}

// The editor sends a JSON request body, not a classic form POST.
$raw  = file_get_contents( 'php://input' );
$data = json_decode( $raw, true );

if ( ! is_array( $data ) ) {
	be_json( 400, array( 'error' => 'invalid_json' ) );
}

// Cast the post id / category to int -- they are used unquoted in SQL
// (Issue #31 style). The category is a single cat_ID: WordPress 0.71
// posts belong to exactly one category (b2posts.post_category). A
// non-positive post id selects the Issue #96 new-post (INSERT) path.
$post_id  = isset( $data['post'] ) ? (int) $data['post'] : 0;
$is_new   = ( $post_id <= 0 );
$content  = isset( $data['content'] ) ? (string) $data['content'] : '';
$title    = isset( $data['title'] ) ? (string) $data['title'] : '';
$category = isset( $data['category'] ) ? (int) $data['category'] : 0;

// post_status is a fixed enumeration in 0.71's post editor (b2edit.form.php
// offers exactly publish / draft / private). Reject anything else rather
// than write an unknown value into the column.
$allowed_statuses = array( 'publish', 'draft', 'private' );
$status           = isset( $data['status'] ) ? (string) $data['status'] : 'publish';

if ( ! in_array( $status, $allowed_statuses, true ) ) {
	be_json( 400, array( 'error' => 'invalid_status' ) );
}

// For an existing post, verify it exists and that the user may edit it.
// For a new post there is no row yet; the only gate is being able to
// post at all -- mirrors b2edit.php's `case 'post'`, which rejects
// user_level 0 ("Cheatin' uh ?"). The new row's author is the logged-in
// user, so no ownership comparison is needed.
if ( $is_new ) {
	if ( (int) $current_user->user_level < 1 ) {
		be_json( 403, array( 'error' => 'forbidden' ) );
	}
} else {
	$post = get_postdata( $post_id );

	if ( ! $post ) {
		be_json( 404, array( 'error' => 'post_not_found' ) );
	}

	// Ownership check -- mirrors b2edit.php's 'editpost' rule: a user may
	// edit a post only if they are its author, or their level is strictly
	// higher than the author's. The author comes from the stored post row.
	$author = get_userdata( (int) $post['Author_ID'] );

	if ( (int) $post['Author_ID'] !== (int) $current_user->ID
		&& (int) $current_user->user_level <= (int) $author->user_level ) {
		be_json( 403, array( 'error' => 'forbidden' ) );
	}
}

// The chosen category must exist in b2categories. cat_ID is cast to int,
// so the lookup is safe; rejecting an unknown id keeps post_category
// referentially sane. COUNT(*) always returns exactly one row, so 0.71's
// get_var() has no undefined-offset edge case for a no-match query.
$category_count = (int) $wpdb->get_var( "SELECT COUNT(*) FROM $tablecategories WHERE cat_ID = $category" );

if ( $category_count < 1 ) {
	be_json( 400, array( 'error' => 'invalid_category' ) );
}

// Escape for SQL the same way 0.71 does -- wpdb::escape() wraps
// mysqli_real_escape_string(). No autobr / format_to_post() here: block
// markup must be stored verbatim, byte-for-byte, or parse() breaks.
// status is from a validated whitelist and category is (int)-cast.
$escaped_content = $wpdb->escape( $content );
$escaped_title   = $wpdb->escape( $title );
$escaped_status  = $wpdb->escape( $status );

if ( $is_new ) {
	// New-post path -- INSERT a fresh b2posts row, mirroring the columns
	// set by 0.71's own `case 'post'` handler in wp-admin/b2edit.php:
	// post_author is the logged-in user, post_date is "now" adjusted by
	// the blog's time_difference setting, and comment_status / ping_status
	// / post_password / post_excerpt take 0.71's defaults. post_author is
	// (int)-cast and post_date is a code-generated timestamp, so both are
	// safe to interpolate unquoted; the text columns are escaped above.
	$author_id       = (int) $current_user->ID;
	$time_difference = (int) get_settings( 'time_difference' );
	$now             = gmdate( 'Y-m-d H:i:s', time() + ( $time_difference * 3600 ) );

	$query = "INSERT INTO $tableposts (post_author, post_date, post_content, post_title, post_category, post_excerpt, post_status, comment_status, ping_status, post_password) VALUES ($author_id, '$now', '$escaped_content', '$escaped_title', $category, '', '$escaped_status', 'open', 'open', '')";

	$result = $wpdb->query( $query );

	if ( false === $result ) {
		be_json( 500, array( 'error' => 'db_error' ) );
	}

	// Adopt the auto-increment id of the row just inserted. b2edit.php
	// reads it the same way (ORDER BY ID DESC LIMIT 1) rather than using
	// the connection's insert id.
	$post_id = (int) $wpdb->get_var( "SELECT ID FROM $tableposts ORDER BY ID DESC LIMIT 1" );
} else {
	$query = "UPDATE $tableposts SET post_content = '$escaped_content', post_title = '$escaped_title', post_status = '$escaped_status', post_category = $category WHERE ID = $post_id";

	$result = $wpdb->query( $query );

	if ( false === $result ) {
		be_json( 500, array( 'error' => 'db_error' ) );
	}
}

be_json(
	200,
	array(
		'ok'       => true,
		'id'       => $post_id,
		'isNew'    => $is_new,
		'content'  => $content,
		'title'    => $title,
		'status'   => $status,
		'category' => $category,
	)
);
