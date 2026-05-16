<?php
$title = 'Options';

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

$b2varstoreset = array( 'action', 'standalone' );
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

	case 'update':
		$standalone = 1;
		include './b2header.php';

		// EN: CSRF check -- reject a forged request to change blog options.
		// JA: CSRF チェック -- ブログオプション変更リクエストの偽造を拒否する。
		b2_csrf_check( 'options-update' );

		$newposts_per_page  = addslashes( $_POST['newposts_per_page'] );
		$newwhat_to_show    = addslashes( $_POST['newwhat_to_show'] );
		$newarchive_mode    = addslashes( $_POST['newarchive_mode'] );
		$newtime_difference = addslashes( $_POST['newtime_difference'] );
		//no longer use this? $newautobr=addslashes($_POST["newautobr"]);
		$newautobr      = 0;
		$newtime_format = addslashes( $_POST['newtime_format'] );
		$newdate_format = addslashes( $_POST['newdate_format'] );

		$query  = "UPDATE $tablesettings SET posts_per_page=$newposts_per_page, what_to_show='$newwhat_to_show', archive_mode='$newarchive_mode', time_difference=$newtime_difference, AutoBR=$newautobr, time_format='$newtime_format', date_format='$newdate_format' WHERE ID = 1";
		$result = mysqli_query( $wpdb->dbh, $query );
		if ( false == $result ) {
			$oops = "<b>ERROR</b>: couldn't update the options... please contact the <a href=\"mailto:$admin_email\">webmaster</a> !<br />$query<br />" . mysqli_errno( $wpdb->dbh ) . ': ' . mysqli_error( $wpdb->dbh );
			die( $oops );
		}

		header( 'Location: b2options.php' );

		break;

	default:
		$standalone = 0;
		include './b2header.php';
		if ( $user_level <= 3 ) {
			die( "You have no right to edit the options for this blog.<br>Ask for a promotion to your <a href=\"mailto:$admin_email\">blog admin</a> :)" );
		}
		?>
	
			<form name="form" action="b2options.php" method="post">
			<input type="hidden" name="action" value="update" />
			<?php
			// EN: CSRF token for the options-update submit (verified in b2options.php).
			// JA: オプション更新の送信用 CSRF トークン(b2options.php で検証)。
			b2_csrf_field( 'options-update' );
			?>
	
<div class="wrap">
			
	<table width="550" cellpadding="5" cellspacing="0">
	<tr height="40"> 
		<td width="150" height="40">Show:</td>
		<td width="350"><input type="text" name="newposts_per_page" value="<?php echo get_settings( 'posts_per_page' ); ?>" size="3"> 
		<select name="newwhat_to_show">
			<option value="days" 
			<?php
				$i = $what_to_show;
			if ( 'days' == $i ) {
				echo ' selected';
			}
			?>
				>days</option>
			<option value="posts" 
			<?php
			if ( 'posts' == $i ) {
				echo ' selected';
			}
			?>
				>posts</option>
			<option value="paged" 
			<?php
			if ( 'paged' == $i ) {
				echo ' selected';
			}
			?>
				>posts paged</option>
		</select> </td>
	</tr>
	<tr height="40"> 
		<td height="40">Archive mode:</td>
		<td><select name="newarchive_mode">
				<?php $i = $archive_mode; ?>
			<option value="daily"
			<?php
			if ( 'daily' == $i ) {
				echo ' selected';
			}
			?>
				>daily</option>
			<option value="weekly"
			<?php
			if ( 'weekly' == $i ) {
				echo ' selected';
			}
			?>
				>weekly</option>
			<option value="monthly"
			<?php
			if ( 'monthly' == $i ) {
				echo ' selected';
			}
			?>
				>monthly</option>
			<option value="postbypost"
			<?php
			if ( 'postbypost' == $i ) {
				echo ' selected';
			}
			?>
				>post by post</option>
		</select> </tr>
	<tr height="40"> 
		<td height="40">Time difference:</td>
		<td><input type="text" name="newtime_difference" value="<?php echo $time_difference; ?>" size="2"> 
		<i> if you're not on the timezone of your server</i> </td>
	</tr>
	<tr height="40"> 
		<td height="40">Date format:</td>
		<td><input type="text" name="newdate_format" value="<?php echo $date_format; ?>" size="10"> 
		<i> (<a href="#dateformat">note</a>)</i> </td>
	</tr>
	<tr height="40"> 
		<td height="40">Time format:</td>
		<td><input type="text" name="newtime_format" value="<?php echo $time_format; ?>" size="10"> 
		<i> (<a href="#dateformat">note</a>)</i> </td>
	</tr>
	<tr height="40"> 
		<td height="40">&nbsp;</td>
		<td> <input type="submit" name="submit" value="Update" class="search"> </td>
	</tr>
	</table>

</div>
	
		</form>

<div class="wrap">
<h2 id="dateformat">
About Date & Time formats:
</h2>
<p> You can format the date & time in many ways, using the PHP syntax.<br />
	As quoted from the PHP manual, here are the letters you can use:<br />
</p>
<blockquote>
		The following characters are recognized in the format string:<br />
		a - "am" or "pm"<br />
		A - "AM" or "PM"<br />
		B - Swatch Internet time<br />
		d - day of the month, 2 digits with leading zeros; i.e. "01" to "31"<br />
		D - day of the week, textual, 3 letters; i.e. "Fri"<br />
		F - month, textual, long; i.e. "January"<br />
		g - hour, 12-hour format without leading zeros; i.e. "1" to "12"<br />
		G - hour, 24-hour format without leading zeros; i.e. "0" to "23"<br />
		h - hour, 12-hour format; i.e. "01" to "12"<br />
		H - hour, 24-hour format; i.e. "00" to "23"<br />
		i - minutes; i.e. "00" to "59"<br />
		I (capital i) - "1" if Daylight Savings Time, "0" otherwise.<br />
		j - day of the month without leading zeros; i.e. "1" to "31"<br />
		l (lowercase 'L') - day of the week, textual, long; i.e. "Friday"<br />
		L - boolean for whether it is a leap year; i.e. "0" or "1"<br />
		m - month; i.e. "01" to "12"<br />
		M - month, textual, 3 letters; i.e. "Jan"<br />
		n - month without leading zeros; i.e. "1" to "12"<br />
		r - RFC 822 formatted date; i.e. "Thu, 21 Dec 2000 16:01:07 +0200" (added in PHP 4.0.4)<br />
		s - seconds; i.e. "00" to "59"<br />
		S - English ordinal suffix, textual, 2 characters; i.e. "th", "nd"<br />
		t - number of days in the given month; i.e. "28" to "31"<br />
		T - Timezone setting of this machine; i.e. "MDT"<br />
		U - seconds since the epoch<br />
		w - day of the week, numeric, i.e. "0" (Sunday) to "6" (Saturday)<br />
		Y - year, 4 digits; i.e. "1999"<br />
		y - year, 2 digits; i.e. "99"<br />
		z - day of the year; i.e. "0" to "365"<br />
		Z - timezone offset in seconds (i.e. "-43200" to "43200"). The offset for timezones west of UTC is always negative, and for those east of UTC is always positive.<br />
		<br />
		Unrecognized characters in the format string will be printed as-is.
		</blockquote>
		
<p>For more information and examples, check the PHP manual on <a href="http://www.php.net/manual/en/function.date.php">this 
	page</a>.</p>
	</div>
		<?php

		break;
}

require 'b2footer.php' ?>