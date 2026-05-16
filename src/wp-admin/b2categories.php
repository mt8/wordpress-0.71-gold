<?php
$title = 'Categories';
/* <Categories> */

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

$b2varstoreset = array( 'action', 'standalone', 'cat' );
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

	case 'addcat':
		$standalone = 1;
		require_once 'b2header.php';

		// EN: CSRF check -- reject a forged request to add a category.
		// JA: CSRF チェック -- カテゴリ追加リクエストの偽造を拒否する。
		b2_csrf_check( 'addcat' );

		if ( $user_level < 3 ) {
			die( 'Cheatin&#8217; uh?' );
		}

		$cat_name = addslashes( $_POST['cat_name'] );

		$query  = "INSERT INTO $tablecategories (cat_ID,cat_name) VALUES ('0', '$cat_name')";
		$result = mysqli_query( $wpdb->dbh, $query ) or die( "Couldn't add category <b>$cat_name</b>" );

	header( 'Location: b2categories.php' );

	break;

	case 'Delete':
		$standalone = 1;
		require_once 'b2header.php';

		// EN: CSRF check -- reject a forged request to delete a category.
		// JA: CSRF チェック -- カテゴリ削除リクエストの偽造を拒否する。
		b2_csrf_check( 'catop' );

		$cat_ID   = intval( $_POST['cat_ID'] );
		$cat_name = get_catname( $cat_ID );
		$cat_name = addslashes( $cat_name );

		if ( 1 == $cat_ID ) {
			die( "Can't delete the <strong>$cat_name</strong> category: this is the default one" );
		}

		if ( $user_level < 3 ) {
			die( 'Cheatin&#8217; uh?' );
		}

		$query  = "DELETE FROM $tablecategories WHERE cat_ID = $cat_ID";
		$result = mysqli_query( $wpdb->dbh, $query ) or die( "Couldn't delete category <b>$cat_name</b>" . mysqli_error( $wpdb->dbh ) );

	$query  = "UPDATE $tableposts SET post_category='1' WHERE post_category='$cat_ID'";
	$result = mysqli_query( $wpdb->dbh, $query ) or die( "Couldn't reset category on posts where category was <b>$cat_name</b>" );

	header( 'Location: b2categories.php' );

	break;

	case 'Rename':
		require_once 'b2header.php';

		// EN: CSRF check -- reject a forged request to open the rename form.
		// JA: CSRF チェック -- 名称変更フォーム表示リクエストの偽造を拒否する。
		b2_csrf_check( 'catop' );

		$cat_name = get_catname( $_POST['cat_ID'] );
		$cat_name = addslashes( $cat_name );
		?>

<div class="wrap">
	<p><strong>Old</strong> name: <?php echo $cat_name; ?></p>
	<p>
	<form name="renamecat" action="b2categories.php" method="post">
		<strong>New</strong> name:<br />
		<input type="hidden" name="action" value="editedcat" />
		<?php
		// EN: CSRF token for the category rename submit (verified in b2categories.php).
		// JA: カテゴリ名称変更の送信用 CSRF トークン(b2categories.php で検証)。
		b2_csrf_field( 'editedcat' );
		?>
		<input type="hidden" name="cat_ID" value="<?php echo htmlspecialchars( $_POST['cat_ID'] ); ?>" />
		<input type="text" name="cat_name" value="<?php echo $cat_name; ?>" /><br />
		<input type="submit" name="submit" value="Edit it !" class="search" />
	</form>
</div>

		<?php

		break;

	case 'editedcat':
		$standalone = 1;
		require_once 'b2header.php';

		// EN: CSRF check -- reject a forged request to rename a category.
		// JA: CSRF チェック -- カテゴリ名称変更リクエストの偽造を拒否する。
		b2_csrf_check( 'editedcat' );

		if ( $user_level < 3 ) {
			die( 'Cheatin&#8217; uh?' );
		}

		$cat_name = addslashes( $_POST['cat_name'] );
		// EN: Cast the category id to int -- it is used unquoted in SQL
		//     (WHERE cat_ID = $cat_ID); addslashes() does not protect it.
		// JA: カテゴリ ID を整数にキャスト -- SQL でクォート無し
		//     (WHERE cat_ID = $cat_ID)で使われ、addslashes() では保護できない。
		$cat_ID = (int) $_POST['cat_ID'];

		$query  = "UPDATE $tablecategories SET cat_name='$cat_name' WHERE cat_ID = $cat_ID";
		$result = mysqli_query( $wpdb->dbh, $query ) or die( "Couldn't edit category <b>$cat_name</b>: " . mysqli_error( $wpdb->dbh ) );

	header( 'Location: b2categories.php' );

	break;

	default:
		$standalone = 0;
		require_once 'b2header.php';
		if ( $user_level < 3 ) {
			die( "You have no right to edit the categories for this blog.<br />Ask for a promotion to your <a href='mailto:$admin_email'>blog admin</a>. :)" );
		}
		?>

<div class="wrap">
	<form name="cats" method="post">
		<?php
		// EN: CSRF token for the Delete / Rename submit buttons of this form.
		// JA: このフォームの Delete / Rename ボタン用 CSRF トークン。
		b2_csrf_field( 'catop' );
		?>
	<h3><label for="cat_ID">Edit a category:</label></h3>
	<p>
		<?php
		$categories = $wpdb->get_results( "SELECT * FROM $tablecategories ORDER BY cat_ID" );
		echo "<select name='cat_ID' id='cat_ID'>\n";
		foreach ( $categories as $category ) {
			echo "\t<option value='$category->cat_ID'";
			if ( $category->cat_ID == $cat ) {
				echo ' selected="selected"';
			}
			echo '>' . $category->cat_ID . ': ' . $category->cat_name . "</option>\n";
		}
		echo "</select>\n";
		?>
	</p>
	<p>
	<input type="submit" name="action" value="Delete" class="search" />
	<input type="submit" name="action" value="Rename" class="search" /></p>
	</form>
	
	
	<form name="addcat" action="b2categories.php" method="post">
	<h3><label>Add a category:
	<input type="text" name="cat_name" /></label><input type="hidden" name="action" value="addcat" />
		<?php
		// EN: CSRF token for the add-category submit (verified in b2categories.php).
		// JA: カテゴリ追加の送信用 CSRF トークン(b2categories.php で検証)。
		b2_csrf_field( 'addcat' );
		?>
	</h3>
	<input type="submit" name="submit" value="Add it!" class="search" />
	</form>
</div>



<div class="wrap"> 
	<p><strong>Note:</strong><br />
	Deleting a category does not delete posts from that category, it will just 
	set them back to the default category <strong><?php echo get_catname( 1 ); ?></strong>. 
	</p>
</div>

		<?php
		break;
}

/* </Categories> */
require 'b2footer.php';
?>