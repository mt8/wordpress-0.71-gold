<?php
$title = 'Post / Edit';
/* <Edit> */

function add_magic_quotes( $array ) {
	foreach ( $array as $k => $v ) {
		if ( is_array( $v ) ) {
			$array[ $k ] = add_magic_quotes( $v );
		} else {
			$array[ $k ] = addslashes( $v );
		}
	}
	return $array;
}

$_GET    = add_magic_quotes( $_GET );
$_POST   = add_magic_quotes( $_POST );
$_COOKIE = add_magic_quotes( $_COOKIE );

$b2varstoreset = array( 'action', 'safe_mode', 'withcomments', 'c', 'posts', 'poststart', 'postend', 'content', 'edited_post_title', 'comment_error', 'profile', 'trackback_url', 'excerpt' );
// EN: Issue #37 hardening. Replace the variable-variable ($$b2var)
//     register_globals-style assignment with an explicit $GLOBALS[$b2var]
//     write. The name list is a fixed whitelist and this loop runs at global
//     scope, so the two forms are exactly equivalent; $GLOBALS makes the
//     intent (populate known globals from $_GET/$_POST) explicit.
// JA: Issue #37 の堅牢化。可変変数($$b2var)による register_globals 風の
//     代入を、明示的な $GLOBALS[$b2var] への書き込みに置き換える。名前リスト
//     は固定のホワイトリストで、本ループはグローバルスコープで動くため両者は
//     完全に等価。$GLOBALS により意図(既知のグローバル変数を $_GET/$_POST
//     から設定する)が明確になる。
for ( $i = 0; $i < count( $b2varstoreset ); $i += 1 ) {
	$b2var = $b2varstoreset[ $i ];
	if ( ! isset( $GLOBALS[ $b2var ] ) ) {
		if ( empty( $_POST[ "$b2var" ] ) ) {
			if ( empty( $_GET[ "$b2var" ] ) ) {
				$GLOBALS[ $b2var ] = '';
			} else {
				$GLOBALS[ $b2var ] = $_GET[ "$b2var" ];
			}
		} else {
			$GLOBALS[ $b2var ] = $_POST[ "$b2var" ];
		}
	}
}

switch ( $action ) {

	case 'post':
		$standalone = 1;
		require_once 'b2header.php';

		// EN: CSRF check -- reject a forged request to create a post.
		// JA: CSRF チェック -- 投稿作成リクエストの偽造を拒否する。
		b2_csrf_check( 'post' );

		$content        = balanceTags( $_POST['content'] );
		$content        = format_to_post( $content );
		$excerpt        = balanceTags( $_POST['excerpt'] );
		$excerpt        = format_to_post( $excerpt );
		$post_title     = addslashes( $_POST['post_title'] );
		$post_category  = intval( $_POST['post_category'] );
		$post_status    = $_POST['post_status'];
		$comment_status = $_POST['comment_status'];
		$ping_status    = $_POST['ping_status'];
		$post_password  = addslashes( $_POST['post_password'] );

		if ( 0 == $user_level ) {
			die( "Cheatin' uh ?" );
		}

		if ( ( $user_level > 4 ) && ( ! empty( $_POST['edit_date'] ) ) ) {
			$aa  = $_POST['aa'];
			$mm  = $_POST['mm'];
			$jj  = $_POST['jj'];
			$hh  = $_POST['hh'];
			$mn  = $_POST['mn'];
			$ss  = $_POST['ss'];
			$jj  = ( $jj > 31 ) ? 31 : $jj;
			$hh  = ( $hh > 23 ) ? $hh - 24 : $hh;
			$mn  = ( $mn > 59 ) ? $mn - 60 : $mn;
			$ss  = ( $ss > 59 ) ? $ss - 60 : $ss;
			$now = "$aa-$mm-$jj $hh:$mn:$ss";
		} else {
			$now = date( 'Y-m-d H:i:s', ( time() + ( $time_difference * 3600 ) ) );
		}

		$query  = "INSERT INTO $tableposts (ID, post_author, post_date, post_content, post_title, post_category, post_excerpt,  post_status, comment_status, ping_status, post_password) VALUES ('0','$user_ID','$now','$content','$post_title','$post_category','$excerpt', '$post_status', '$comment_status', '$ping_status', '$post_password')";
		$result = $wpdb->query( $query );

		$post_ID = $wpdb->get_var( "SELECT ID FROM $tableposts ORDER BY ID DESC LIMIT 1" );

		if ( isset( $sleep_after_edit ) && $sleep_after_edit > 0 ) {
				sleep( $sleep_after_edit );
		}

		if ( ! empty( $_POST['mode'] ) ) {
			switch ( $_POST['mode'] ) {
				case 'bookmarklet':
					$location = 'b2bookmarklet.php?a=b';
					break;
				case 'sidebar':
					$location = 'b2sidebar.php?a=b';
					break;
				default:
					$location = 'b2edit.php';
					break;
			}
		} else {
			$location = 'b2edit.php';
		}
		header( "Location: $location" );
		exit();
		break;

	case 'edit':
		$standalone = 0;
		require_once 'b2header.php';

		// EN: Cast the post id to int -- it is used unquoted in SQL (WHERE ID=$post).
		// JA: 投稿 ID を整数にキャスト -- SQL でクォート無し(WHERE ID=$post)で使われる。
		$post = (int) $_GET['post'];
		if ( $user_level > 0 ) {
			$postdata   = get_postdata( $post ) or die( 'Oops, no post with this ID. <a href="b2edit.php">Go back</a> !' );
			$authordata = get_userdata( $postdata['Author_ID'] );
			// EN: Ownership check -- a user may edit a post only if they are
			//     its author, or their level is strictly higher than the
			//     author's. The post's real author comes from the loaded
			//     post row, never from a request value.
			// JA: 所有者チェック -- 投稿を編集できるのはその投稿の作者本人、
			//     または作者よりレベルが厳密に高いユーザーのみ。投稿の真の
			//     作者は読み込んだ投稿行から取得し、リクエスト値は使わない。
			if ( ( $postdata['Author_ID'] != $user_ID ) && ( $user_level <= $authordata->user_level ) ) {
				die( 'You don&#8217;t have the right to edit <strong>' . $authordata[1] . '</strong>&#8217;s posts.' );
			}

			$content           = $postdata['Content'];
			$content           = format_to_edit( $content );
			$excerpt           = $postdata['Excerpt'];
			$excerpt           = format_to_edit( $excerpt );
			$edited_post_title = format_to_edit( $postdata['Title'] );
			$post_status       = $postdata['post_status'];
			$comment_status    = $postdata['comment_status'];
			$ping_status       = $postdata['ping_status'];
			$post_password     = $postdata['post_password'];

			include 'b2edit.form.php';
		} else {
			?>
			<p>Since you're a newcomer, you'll have to wait for an admin to raise your level to 1,
			in order to be authorized to post.<br />
			You can also <a href="mailto:<?php echo $admin_email; ?>?subject=b2-promotion">e-mail the admin</a>
			to ask for a promotion.<br />
			When you're promoted, just reload this page and you'll be able to blog. :)
			</p>
			<?php
		}
		break;

	case 'editpost':
		$standalone = 1;
		require_once './b2header.php';

		// EN: CSRF check -- reject a forged request to edit a post.
		// JA: CSRF チェック -- 投稿編集リクエストの偽造を拒否する。
		b2_csrf_check( 'editpost' );

		if ( 0 == $user_level ) {
			die( "Cheatin' uh ?" );
		}

		if ( ! isset( $blog_ID ) ) {
			$blog_ID = 1;
		}
		// EN: Cast the post id to int -- it is used unquoted in SQL (WHERE ID = $post_ID).
		// JA: 投稿 ID を整数にキャスト -- SQL でクォート無し(WHERE ID = $post_ID)で使われる。
		$post_ID = (int) $_POST['post_ID'];

		// EN: Ownership check -- load the real post row and verify the user
		//     may edit it: they must be its author, or their level strictly
		//     higher than the author's. The author comes from the stored
		//     post, never from a request value.
		// JA: 所有者チェック -- 実際の投稿行を読み込み、編集権限を検証する。
		//     その投稿の作者本人、または作者よりレベルが厳密に高いユーザー
		//     であること。作者は保存済み投稿から取得し、リクエスト値は
		//     使わない。
		$postdata = get_postdata( $post_ID ) or die( 'Oops, no post with this ID. <a href="b2edit.php">Go back</a> !' );
		$authordata = get_userdata( $postdata['Author_ID'] );
	if ( ( $postdata['Author_ID'] != $user_ID ) && ( $user_level <= $authordata->user_level ) ) {
		die( 'You don&#8217;t have the right to edit <strong>' . $authordata[1] . '</strong>&#8217;s posts.' );
	}

		$post_category = intval( $_POST['post_category'] );
		// EN: Issue #60 -- the edit form (b2edit.form.php) never renders a
		//     'post_autobr' field, so reading $_POST['post_autobr'] directly
		//     raised an "Undefined array key" warning under PHP 8.3. Default
		//     it to 0 with a guard, matching the migration's hardening style.
		// JA: Issue #60 -- 編集フォーム(b2edit.form.php)は 'post_autobr'
		//     フィールドを出力しないため、$_POST['post_autobr'] を直接読むと
		//     PHP 8.3 で "Undefined array key" 警告が出ていた。ガードで 0 を
		//     既定値とし、移行作業の堅牢化スタイルに合わせる。
		$post_autobr    = isset( $_POST['post_autobr'] ) ? intval( $_POST['post_autobr'] ) : 0;
		$content        = balanceTags( $_POST['content'] );
		$content        = format_to_post( $content );
		$excerpt        = balanceTags( $_POST['excerpt'] );
		$excerpt        = format_to_post( $excerpt );
		$post_title     = addslashes( $_POST['post_title'] );
		$post_status    = $_POST['post_status'];
		$prev_status    = $_POST['prev_status'];
		$comment_status = $_POST['comment_status'];
		$ping_status    = $_POST['ping_status'];
		$post_password  = addslashes( $_POST['post_password'] );

	if ( ( $user_level > 4 ) && ( ! empty( $_POST['edit_date'] ) ) ) {
		$aa        = $_POST['aa'];
		$mm        = $_POST['mm'];
		$jj        = $_POST['jj'];
		$hh        = $_POST['hh'];
		$mn        = $_POST['mn'];
		$ss        = $_POST['ss'];
		$jj        = ( $jj > 31 ) ? 31 : $jj;
		$hh        = ( $hh > 23 ) ? $hh - 24 : $hh;
		$mn        = ( $mn > 59 ) ? $mn - 60 : $mn;
		$ss        = ( $ss > 59 ) ? $ss - 60 : $ss;
		$datemodif = ", post_date=\"$aa-$mm-$jj $hh:$mn:$ss\"";
	} else {
		$datemodif = '';
	}

		$query  = "UPDATE $tableposts SET post_content='$content', post_excerpt='$excerpt', post_title='$post_title', post_category='$post_category'" . $datemodif . ", post_status='$post_status', comment_status='$comment_status', ping_status='$ping_status', post_password='$post_password' WHERE ID = $post_ID";
		$result = $wpdb->query( $query );

	if ( isset( $sleep_after_edit ) && $sleep_after_edit > 0 ) {
		sleep( $sleep_after_edit );
	}

		$location = 'Location: b2edit.php';
		header( $location );
		break;

	case 'delete':
		$standalone = 1;
		require_once './b2header.php';

		// EN: CSRF check -- reject a forged GET request to delete a post.
		// JA: CSRF チェック -- 投稿削除の GET リクエストの偽造を拒否する。
		b2_csrf_check( 'delete-post' );

		if ( 0 == $user_level ) {
			die( "Cheatin' uh ?" );
		}

		// EN: Cast the post id to int -- it is used unquoted in SQL (WHERE ID=$post).
		// JA: 投稿 ID を整数にキャスト -- SQL でクォート無し(WHERE ID=$post)で使われる。
		$post     = (int) $_GET['post'];
		$postdata = get_postdata( $post ) or die( 'Oops, no post with this ID. <a href="b2edit.php">Go back</a> !' );
		$authordata = get_userdata( $postdata['Author_ID'] );

		// EN: Ownership check -- a user may delete a post only if they are
		//     its author, or their level is strictly higher than the
		//     author's. The post's real author comes from the loaded post
		//     row, never from a request value.
		// JA: 所有者チェック -- 投稿を削除できるのはその投稿の作者本人、
		//     または作者よりレベルが厳密に高いユーザーのみ。投稿の真の
		//     作者は読み込んだ投稿行から取得し、リクエスト値は使わない。
	if ( ( $postdata['Author_ID'] != $user_ID ) && ( $user_level <= $authordata->user_level ) ) {
		die( "You don't have the right to delete <b>" . $authordata[1] . "</b>'s posts." );
	}

		$query  = "DELETE FROM $tableposts WHERE ID=$post";
		$result = $wpdb->query( $query );
	if ( ! $result ) {
		die( "Error in deleting... contact the <a href=\"mailto:$admin_email\">webmaster</a>..." );
	}

	if ( isset( $sleep_after_edit ) && $sleep_after_edit > 0 ) {
		sleep( $sleep_after_edit );
	}

		header( 'Location: b2edit.php' );

		break;

	default:
		$standalone = 0;
		require_once './b2header.php';

		if ( $user_level > 0 ) {
			if ( ( ! $withcomments ) && ( ! $c ) ) {

				$action = 'post';
				get_currentuserinfo();
				$drafts = $wpdb->get_results( "SELECT ID, post_title FROM $tableposts WHERE post_status = 'draft' AND post_author = $user_ID" );
				if ( $drafts ) {
					?>
					<div class="wrap">
					<p><strong>Your Drafts:</strong>
					<?php
					$i = 0;
					foreach ( $drafts as $draft ) {
						if ( 0 != $i ) {
							echo ', ';
						}
						echo "<a href='b2edit.php?action=edit&amp;post=$draft->ID' title='Edit this draft'>$draft->post_title</a>";
						++$i;
					}
					?>
					.</p>
					</div>
					<?php
				}
				// EN: Issue #96 -- entry point to create a new post in the
				//     experimental block editor. editor.php with no `post`
				//     parameter starts in new-post mode and INSERTs a fresh
				//     b2posts row on the first save.
				// JA: Issue #96 -- 実験的ブロックエディタで新規投稿を作成する
				//     動線。`post` パラメータ無しの editor.php は新規投稿
				//     モードで始まり、最初の保存で b2posts へ新規行を
				//     INSERT する。
				?>
				<div class="wrap">
				<p><a href="../block-editor/api/editor.php">Write a new post in the block editor</a></p>
				</div>
				<?php
				include 'b2edit.form.php';
				echo '<br /><br />';

			}
		} else {


			?>
<div class="wrap">
			<p>Since you're a newcomer, you'll have to wait for an admin to raise your level to 1, in order to be authorized to post.<br />You can also <a href="mailto:<?php echo $admin_email; ?>?subject=b2-promotion">e-mail the admin</a> to ask for a promotion.<br />When you're promoted, just reload this page and you'll be able to blog. :)</p>
</div>
			<?php

		}

		include 'b2edit.showposts.php';
		break;
} // end switch
/* </Edit> */
require 'b2footer.php';
?>