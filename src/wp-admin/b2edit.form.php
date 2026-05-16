<div class="wrap">
<?php

function selected( $selected, $current ) {
	if ( $selected == $current ) {
		echo ' selected="selected"';
	}
}

// EN: defaults for a brand-new post so the form does not read undefined
//     variables; the 'edit' case overrides them from the stored post.
// JA: 新規投稿でフォームが未定義変数を読まないための既定値。
//     'edit' の場合は保存済み投稿の値で上書きされる。
if ( ! isset( $post_status ) ) {
	$post_status = 'publish';
}
if ( ! isset( $comment_status ) ) {
	$comment_status = 'open';
}
if ( ! isset( $ping_status ) ) {
	$ping_status = 'open';
}
if ( ! isset( $post_password ) ) {
	$post_password = '';
}
if ( ! isset( $form_prevstatus ) ) {
	$form_prevstatus = '';
}

switch ( $action ) {
	case 'post':
		$submitbutton_text = 'Blog this!';
		$toprow_title      = 'New Post';
		$form_action       = 'post';
		$form_extra        = '';
		$colspan           = 3;
		break;
	case 'edit':
		$submitbutton_text = 'Edit this!';
		$toprow_title      = 'Editing Post #' . $postdata['ID'];
		$form_action       = 'editpost';
		$form_extra        = "' />\n<input type='hidden' name='post_ID' value='$post";
		$colspan           = 2;
		$form_prevstatus   = '<input type="hidden" name="prev_status" value="' . $post_status . '" />';
		break;
}

?>

<form name="post" action="b2edit.php" method="POST">
<input type="hidden" name="user_ID" value="<?php echo $user_ID; ?>" />
<input type="hidden" name="action" value='<?php echo $form_action . $form_extra; ?>' />
<?php
// EN: CSRF token scoped to the action this form submits ('post' /
//     'editpost'); verified by b2_csrf_check() in b2edit.php.
// JA: このフォームが送信するアクション('post' / 'editpost')に限定した
//     CSRF トークン。b2edit.php の b2_csrf_check() で検証する。
b2_csrf_field( $form_action );
?>

<table>
		<tr> 
		<td width="210"> <label for="title">Title:</label> <br /> <input type="text" name="post_title" size="25" tabindex="1" style="width: 190px;" value="<?php echo $edited_post_title; ?>" id="title" /> 
		</td>
		<td> <label for="category">Category :</label> <br /> 
			<?php dropdown_categories(); ?>
		</td>
		<td><label for="post_status">Post Status:</label><br />
		  
		<select name="post_status" id="post_status">
		<option value="publish"<?php selected( $post_status, 'publish' ); ?>>Publish</option>
			<option value="draft"<?php selected( $post_status, 'draft' ); ?>>Draft</option>
			<option value="private"<?php selected( $post_status, 'private' ); ?>>Private</option>
			</select> </td>
		<td><label for="comment_status">Comments:</label><br />
		  
		<select name="comment_status" id="comment_status">
		<option value="open"<?php selected( $comment_status, 'open' ); ?>>Open</option>
			<option value="closed"<?php selected( $comment_status, 'closed' ); ?>>Closed</option>
			</select> </td>
		<td><label for="ping_status">Pings:</label><br />
		  
		<select name="ping_status" id="ping_status">
		<option value="open"<?php selected( $ping_status, 'open' ); ?>>Open</option>
			<option value="closed"<?php selected( $ping_status, 'open' ); ?>>Closed</option>
			</select></td>
		<td><label for="post_password">Post Password:</label>
		<br />
			<input name="post_password" type="text" id="post_password" value="<?php echo $post_password; ?>" /> </td>
		</tr>
	</table>

<?php
echo '<label for="excerpt">Excerpt:</label>';
?>
<p><textarea rows="3" cols="40" style="width:100%" name="excerpt" tabindex="4" wrap="virtual" id="excerpt"><?php echo $excerpt; ?></textarea></p>

<table width="100%">
	<tr>
		<td>
<?php
echo '<label for="content">Post:</label>';
?>
		</td>
		<td align="right">
<?php
if ( $use_quicktags ) {
	include 'b2quicktags.php';
}
?>
		</td>
	</tr>
</table>
<textarea rows="9" cols="40" style="width:100%" name="content" tabindex="4" wrap="virtual" id="content"><?php echo $content; ?></textarea><br />

<?php echo $form_prevstatus; ?>

<p><input type="submit" name="submit" value="<?php echo $submitbutton_text; ?>" class="search" style="font-weight: bold;" tabindex="5" /></p>


<?php if ( ( $use_fileupload ) && ( $user_level >= $fileupload_minlevel ) && ( ( preg_match( '~ ' . $user_login . ' ~', $fileupload_allowedusers ) ) || ( trim( $fileupload_allowedusers ) == '' ) ) ) { ?>
<input type="button" value="upload a file/image" onclick="launchupload();" class="search"  tabindex="10" />
	<?php
}

// if the level is 5+, allow user to edit the timestamp - not on 'new post' screen though
// if (($user_level > 4) && ($action != "post"))
if ( $user_level > 4 ) {
	touch_time( ( $action == 'edit' ) );
}
// EN: Append the CSRF token to the delete link (verified by b2edit.php).
// JA: 削除リンクに CSRF トークンを付与する(b2edit.php で検証)。
if ( 'edit' == $action ) {
	echo "
<p><a href='b2edit.php?action=delete&amp;post=$post&amp;_b2csrf=" . b2_csrf_token( 'delete-post' ) . "' onclick=\"return confirm('You are about to delete this post \'" . $edited_post_title . "\'\\n  \'Cancel\' to stop, \'OK\' to delete.')\">Delete this post</a></p>";
}
?>
</form>
</div>