<?php
/**
 * Block-editor prototype -- GET a post's content.
 *
 * Issue #65 experimental prototype. Returns the raw post_content of a
 * WordPress 0.71 post as JSON, so the custom block editor can parse it
 * into a block tree. Usage: GET load.php?post=ID
 *
 * Issue #79 extends the response with post_status, post_category and the
 * full list of categories, so the editor's settings sidebar can offer a
 * status control and a category selector.
 *
 * Issue #96 adds a "new post" mode: when the request has no usable post id
 * (no `post` parameter, or `post=new`), this endpoint returns an empty
 * post shape (id 0, blank title / content, draft status) together with the
 * category list, so the editor can render its sidebar without loading an
 * existing row.
 *
 * Issue #220 also returns `date`, the post's `post_date` in MySQL DATETIME
 * form (`YYYY-MM-DD HH:MM:SS`), so the editor's settings sidebar can
 * surface a date picker. A new post returns the same "now" value 0.71's
 * own `case 'post'` handler computes (gmtime adjusted by the blog's
 * `time_difference` setting).
 *
 * @package wordpress-0.71-gold
 */

require_once __DIR__ . '/bootstrap.php';

be_require_login();

// Cast the post id to int -- it is used unquoted in SQL. This is the
// same hardening applied across the codebase in Issue #31. A missing
// parameter or a non-positive id (including post=new, which casts to 0)
// selects the Issue #96 "new post" mode.
$post_id = isset( $_GET['post'] ) ? (int) $_GET['post'] : 0;
$is_new  = ( $post_id <= 0 );

// The category list for the settings-sidebar selector. b2categories has
// just two columns -- cat_ID and cat_name (see wp-install.php). cat_ID 0
// ("General") is the default bucket, so it is kept in the list. Both the
// existing-post and the new-post response carry this list.
$category_rows = $wpdb->get_results( "SELECT cat_ID, cat_name FROM $tablecategories ORDER BY cat_ID ASC" );

$categories = array();
if ( is_array( $category_rows ) ) {
	foreach ( $category_rows as $row ) {
		$categories[] = array(
			'id'   => (int) $row->cat_ID,
			'name' => stripslashes( (string) $row->cat_name ),
		);
	}
}

// New-post mode -- return an empty post shape. The editor starts with no
// blocks and an empty title; the default category is the lowest cat_ID
// present (b2's seeded "General" category, normally id 1, falling back to
// 0 if the table is somehow empty). The status defaults to draft so a
// half-written new post is not published before the author intends it.
// The date is "now" adjusted by the blog's time_difference setting, the
// same value 0.71's own b2edit.php uses when no explicit date is given.
if ( $is_new ) {
	$default_category = ( ! empty( $categories ) ) ? (int) $categories[0]['id'] : 0;
	$time_difference  = (int) get_settings( 'time_difference' );
	$default_date     = gmdate( 'Y-m-d H:i:s', time() + ( $time_difference * 3600 ) );

	be_json(
		200,
		array(
			'id'         => 0,
			'title'      => '',
			'content'    => '',
			'status'     => 'draft',
			'category'   => $default_category,
			'date'       => $default_date,
			'categories' => $categories,
			'isNew'      => true,
		)
	);
}

$post = get_postdata( $post_id );

if ( ! $post ) {
	be_json( 404, array( 'error' => 'post_not_found' ) );
}

// post_content / post_title are stored slash-escaped by 0.71's
// format_to_post(); strip the slashes so the editor receives clean text.
// status / category are the post's single post_status and post_category.
// date is post_date verbatim (MySQL DATETIME, the blog's local time);
// get_postdata() exposes it under the 'Date' key.
be_json(
	200,
	array(
		'id'         => (int) $post['ID'],
		'title'      => stripslashes( (string) $post['Title'] ),
		'content'    => stripslashes( (string) $post['Content'] ),
		'status'     => (string) $post['post_status'],
		'category'   => (int) $post['Category'],
		'date'       => (string) $post['Date'],
		'categories' => $categories,
		'isNew'      => false,
	)
);
