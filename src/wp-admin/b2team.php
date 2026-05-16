<?php
$title = 'Team management';
/* <Team> */
	
$b2varstoreset = array('action','standalone','redirect','profile');
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
for ($i=0; $i<count($b2varstoreset); $i += 1) {
	$b2var = $b2varstoreset[$i];
	if (!isset($GLOBALS[$b2var])) {
		if (empty($_POST["$b2var"])) {
			if (empty($_GET["$b2var"])) {
				$GLOBALS[$b2var] = '';
			} else {
				$GLOBALS[$b2var] = $_GET["$b2var"];
			}
		} else {
			$GLOBALS[$b2var] = $_POST["$b2var"];
		}
	}
}

switch ($action) {
	
case 'promote':

	$standalone = 1;
	require_once('b2header.php');

	// EN: CSRF check -- reject a forged GET request to change a user level.
	// JA: CSRF チェック -- ユーザーレベル変更の GET リクエストの偽造を拒否する。
	b2_csrf_check('promote-user');

	// EN: Minimum-level gate -- the promote/demote links are only shown to
	//     level >= 2 users in the UI; enforce the same here so a low-level
	//     user cannot bypass it by crafting the URL directly.
	// JA: 最低レベルゲート -- 昇格/降格リンクは UI 上 level >= 2 のユーザー
	//     にのみ表示される。URL を直接組み立てる回避を防ぐため同条件を
	//     ここでも強制する。
	if ($user_level < 2) {
		die('You are not allowed to change user levels.');
	}

	if (empty($_GET["prom"])) {
		header('Location: b2team.php');
	}

	// EN: Cast the user id to int -- it is used unquoted in SQL (WHERE ID = $id).
	// JA: ユーザー ID を整数にキャスト -- SQL でクォート無し(WHERE ID = $id)で使われる。
	$id = (int) $_GET["id"];
	$prom = $_GET["prom"];

	$user_data = get_userdata($id);
	$usertopromote_level = $user_data->user_level;

	if ($user_level <= $usertopromote_level) {
		die('Can&#8217;t change the level of a user whose level is higher than yours.');
	}

	if ('up' == $prom) {
		$sql="UPDATE $tableusers SET user_level=user_level+1 WHERE ID = $id";
	} elseif ('down' == $prom) {
		$sql="UPDATE $tableusers SET user_level=user_level-1 WHERE ID = $id";
	}
	$result = $wpdb->query($sql);

	header('Location: b2team.php');

break;

case 'delete':

	$standalone = 1;
	require_once('b2header.php');

	// EN: CSRF check -- reject a forged GET request to delete a user.
	// JA: CSRF チェック -- ユーザー削除の GET リクエストの偽造を拒否する。
	b2_csrf_check('delete-user');

	// EN: Minimum-level gate -- the delete link is only shown to level > 3
	//     users in the UI; enforce the same here so a low-level user cannot
	//     bypass it by crafting the URL directly.
	// JA: 最低レベルゲート -- 削除リンクは UI 上 level > 3 のユーザーにのみ
	//     表示される。URL を直接組み立てる回避を防ぐため同条件を
	//     ここでも強制する。
	if ($user_level <= 3) {
		die('You are not allowed to delete users.');
	}

	// EN: Cast the user id to int -- it is used unquoted in SQL
	//     (WHERE ID = $id / WHERE post_author = $id).
	// JA: ユーザー ID を整数にキャスト -- SQL でクォート無し
	//     (WHERE ID = $id / WHERE post_author = $id)で使われる。
	$id = (int) $_GET["id"];

	if (!$id) {
		header('Location: b2team.php');
	}

	$user_data = get_userdata($id);
	$usertodelete_level = $user_data->user_level;

	if ($user_level <= $usertodelete_level)
		die('Can&#8217;t delete a user whose level is higher than yours.');

	$sql = "DELETE FROM $tableusers WHERE ID = $id";
	$result = $wpdb->query($sql) or die("Couldn&#8217;t delete user #$id.");

	$sql = "DELETE FROM $tableposts WHERE post_author = $id";
	$result = $wpdb->query($sql) or die("Couldn&#8217;t delete user #$id&#8217;s posts.");

	header('Location: b2team.php');

break;

default:
	
	$standalone = 0;
	include ('b2header.php');
	?>

<div class="wrap"><p>Click on a user&#8217;s login name to see his complete profile.<br />
	To edit your profile, click on your login name.</p>
</div>

<div class="wrap">
	<h3>Active users</h3>
	<table cellpadding="5" cellspacing="0">
	<tr>
	<th>ID</th>
	<th>Nickname</th>
	<th>Name</th>
	<th>E-mail</th>
	<th>URL</th>
	<th>Level</th>
	<?php if ($user_level > 3) { ?>
	<th>Login</th>
	<?php } ?>
	</tr>
	<?php
	$users = $wpdb->get_results("SELECT ID FROM $tableusers WHERE user_level>0 ORDER BY ID");
	foreach ($users as $user) {
		$user_data = get_userdata($user->ID);
		echo "<tr>\n<!--".$user_data->user_login."-->\n";
		$email = $user_data->user_email;
		$url = $user_data->user_url;
		$bg1 = ($user_data->user_login == $user_login) ? "style=\"background-image: url('../b2-img/b2button.gif');\"" : "bgcolor=\"#dddddd\"";
		$bg2 = ($user_data->user_login == $user_login) ? "style=\"background-image: url('../b2-img/b2button.gif');\"" : "bgcolor=\"#eeeeee\"";
		echo "<td $bg1>".$user_data->ID."</td>\n";
		echo "<td $bg2><b><a href=\"javascript:profile(".$user_data->ID.")\">".$user_data->user_nickname."</a></b></td>\n";
		echo "<td $bg1>".$user_data->user_firstname."&nbsp;".$user_data->user_lastname."</td>\n";
		echo "<td $bg2>&nbsp;<a href=\"mailto:$email\" title=\"e-mail: $email\"><img src='../b2-img/email.gif' border=\"0\" alt=\"e-mail: $email\" /></a>&nbsp;</td>";
		echo "<td $bg1>&nbsp;";
		if (($user_data->user_url != "http://") and ($user_data->user_url != ""))
			echo "<a href=\"$url\" target=\"_blank\" title=\"website: $url\"><img src=\"../b2-img/url.gif\" border=\"0\" alt=\"website: $url\" /></a>&nbsp;";
		echo "</td>\n";
		echo "<td $bg2>".$user_data->user_level;
		// EN: Append the CSRF token to the promote/demote links (verified by b2team.php).
		// JA: 昇格/降格リンクに CSRF トークンを付与する(b2team.php で検証)。
		if (($user_level >= 2) and ($user_level > ($user_data->user_level + 1)))
			echo " <a href=\"b2team.php?action=promote&id=".$user_data->ID."&prom=up&_b2csrf=".b2_csrf_token('promote-user')."\">+</a> ";
		if (($user_level >= 2) and ($user_level > $user_data->user_level) and ($user_data->user_level > 0))
			echo " <a href=\"b2team.php?action=promote&id=".$user_data->ID."&prom=down&_b2csrf=".b2_csrf_token('promote-user')."\">-</a> ";
		echo "</td>\n";
		if ($user_level > 3) {
			echo "<td $bg1>".$user_data->user_login."</td>\n";
		}
		echo "</tr>\n";
	}
	
	?>
	
	</table>

</div>

<?php
	$users = $wpdb->get_results("SELECT * FROM $tableusers WHERE user_level=0 ORDER BY ID");
	if ($users) {
?>
<div class="wrap">
	<h3>Inactive users (level 0)</h3>
	<table cellpadding="5" cellspacing="0">
	<tr>
	<td>ID</td>
	<td>Nickname</td>
	<td>Name</td>
	<td>E-mail</td>
	<td>URL</td>
	<td>Level</td>
	<?php if ($user_level > 3) { ?>
	<td>Login</td>
	<?php } ?>
	</tr>
	<?php
	foreach ($users as $user) {
		$user_data = get_userdata($user->ID);
		echo "<tr>\n<!--".$user_data->user_login."-->\n";
		$email = $user_data->user_email;
		$url = $user_data->user_url;
		$bg1 = ($user_data->user_login == $user_login) ? "style=\"background-image: url('../b2-img/b2button.gif');\"" : "bgcolor=\"#dddddd\"";
		$bg2 = ($user_data->user_login == $user_login) ? "style=\"background-image: url('../b2-img/b2button.gif');\"" : "bgcolor=\"#eeeeee\"";
		echo "<td $bg1>".$user_data->ID."</td>\n";
		echo "<td $bg2><b><a href=\"javascript:profile(".$user_data->ID.")\">".$user_data->user_nickname."</a></b></td>\n";
		echo "<td $bg1>".$user_data->user_firstname."&nbsp;".$user_data->user_lastname."</td>\n";
		echo "<td $bg1>&nbsp;<a href=\"mailto:".antispambot($email)."\" title=\"e-mail: ".antispambot($email)."\"><img src=\"../b2-img/email.gif\" border=\"0\" alt=\"e-mail: ".antispambot($email)."\" /></a>&nbsp;</td>";
		echo "<td $bg2>&nbsp;";
		if (($user_data->user_url != "http://") and ($user_data->user_url != ""))
			echo "<a href=\"$url\" target=\"_blank\" title=\"website: $url\"><img src=\"../b2-img/url.gif\" border=\"0\" alt=\"website: $url\" /></a>&nbsp;";
		echo "</td>\n";
		echo "<td $bg1>".$user_data->user_level;
		// EN: Append the CSRF token to the promote/delete links (verified by b2team.php).
		// JA: 昇格/削除リンクに CSRF トークンを付与する(b2team.php で検証)。
		if ($user_level >= 2)
			echo " <a href=\"b2team.php?action=promote&id=".$user_data->ID."&prom=up&_b2csrf=".b2_csrf_token('promote-user')."\">+</a> ";
		if ($user_level >= 3)
			echo " <a href=\"b2team.php?action=delete&id=".$user_data->ID."&_b2csrf=".b2_csrf_token('delete-user')."\" style=\"color:red;font-weight:bold;\">X</a> ";
		echo "</td>\n";
		if ($user_level > 3) {
			echo "<td $bg2>".$user_data->user_login."</td>\n";
		}
		echo "</tr>\n";
	}
	
	?>
	
	</table>
</div>

	<?php 
	}
	if ($user_level >= 3) { ?>
<div class="wrap"> 
  <p>To delete a user, bring his level to zero, then click on the red X.<br />
    <strong>Warning:</strong> deleting a user also deletes all posts made by this user. 
  </p>
</div>
	<?php
}

break;
}
	
/* </Team> */
include('b2footer.php');
?>