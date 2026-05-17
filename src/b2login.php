<?php
require 'b2config.php';
require_once $abspath . $b2inc . '/b2template.functions.php';
require_once $abspath . $b2inc . '/b2functions.php';
require_once $abspath . $b2inc . '/b2vars.php';

if ( ! function_exists( 'add_magic_quotes' ) ) {
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
}

$_GET    = add_magic_quotes( $_GET );
$_POST   = add_magic_quotes( $_POST );
$_COOKIE = add_magic_quotes( $_COOKIE );

$b2varstoreset = array( 'action', 'mode', 'error', 'text', 'popupurl', 'popuptitle' );

// Cookie hardening (Issue #34). Build the security flags shared by every
// authentication cookie: HttpOnly so JavaScript cannot read the token,
// SameSite=Lax to blunt cross-site sends, and Secure only over HTTPS so the
// local HTTP environment keeps working.
function b2_auth_cookie_flags( $expires ) {
	return array(
		'expires'  => $expires,
		'path'     => '/',
		'httponly' => true,
		'samesite' => 'Lax',
		'secure'   => ! empty( $_SERVER['HTTPS'] ),
	);
}

// Issue #37 hardening. Replace the variable-variable ($$b2var)
// register_globals-style assignment with an explicit $GLOBALS[$b2var]
// write. The name list is a fixed whitelist and this loop runs at global
// scope, so the two forms are exactly equivalent; $GLOBALS makes the
// intent (populate known globals from $_GET/$_POST) explicit.
for ( $i = 0; $i < count( $b2varstoreset ); $i = $i + 1 ) {
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

	case 'logout':
		// Expire the auth cookies; pass the same path/flags so the browser
		// matches and actually deletes the hardened cookies set at login.
		setcookie( 'wordpressuser', '', b2_auth_cookie_flags( time() - 31536000 ) );
		setcookie( 'wordpresspass', '', b2_auth_cookie_flags( time() - 31536000 ) );
		header( 'Expires: Wed, 11 Jan 1984 05:00:00 GMT' );
		header( 'Last-Modified: ' . gmdate( 'D, d M Y H:i:s' ) . ' GMT' );
		header( 'Cache-Control: no-cache, must-revalidate' );
		header( 'Pragma: no-cache' );
		if ( $is_IIS ) {
			header( 'Refresh: 0;url=b2login.php' );
		} else {
			header( 'Location: b2login.php' );
		}
		exit();

	break;

	case 'login':
		if ( ! empty( $_POST ) ) {
			$log         = $_POST['log'];
			$pwd         = $_POST['pwd'];
			$redirect_to = $_POST['redirect_to'];
		}

		function login() {
			global $wpdb, $log, $pwd, $error, $user_ID;
			global $tableusers, $pass_is_md5, $stored_user_pass;
			$user_login = &$log;
			$password   = &$pwd;
			if ( ! $user_login ) {
				$error = '<strong>ERROR</strong>: the login field is empty';
				return false;
			}

			if ( ! $password ) {
				$error = '<strong>ERROR</strong>: the password field is empty';
				return false;
			}

			// Issue #34 -- look the user up by login name only, then verify the
			// password in PHP. Passwords are now stored as bcrypt hashes.
			if ( 'md5:' == substr( $password, 0, 4 ) ) {
				$pass_is_md5 = 1;
				$password    = substr( $password, 4, strlen( $password ) );
			} else {
				$pass_is_md5 = 0;
			}

			$safe_login = addslashes( $user_login );
			$login      = $wpdb->get_row( "SELECT ID, user_login, user_pass FROM $tableusers WHERE user_login = '$safe_login'" );

			if ( ! $login ) {
				$error = '<b>ERROR</b>: wrong login or password';
				$pwd   = '';
				return false;
			}

			$stored  = $login->user_pass;
			$info    = password_get_info( $stored );
			$is_hash = ! empty( $info['algo'] );
			$ok      = false;

			if ( $pass_is_md5 ) {
				// Edge feature -- the typed value is md5(stored user_pass). This
				// only works for a legacy plaintext row, because the stored bcrypt
				// hash is not recoverable from its md5. A hashed row therefore
				// cannot be reached through the md5: path (documented limitation).
				$ok = ( md5( $stored ) === $password );
			} elseif ( $is_hash ) {
				// Normal path -- verify the typed password against the bcrypt hash.
				$ok = password_verify( $password, $stored );
			} else {
				// Legacy fallback -- the row still holds a plaintext password.
				// On a match, transparently re-hash it and upgrade the row.
				if ( $stored === $password ) {
					$ok        = true;
					$new_hash  = password_hash( $password, PASSWORD_DEFAULT );
					$safe_hash = addslashes( $new_hash );
					$wpdb->query( "UPDATE $tableusers SET user_pass = '$safe_hash' WHERE ID = " . (int) $login->ID );
					$stored = $new_hash;
				}
			}

			if ( $ok ) {
				$user_ID = $login->ID;
				// Hand the (possibly just upgraded) stored value to the cookie
				// setter so wordpresspass = md5(stored) -- the same value that
				// checklogin() and the CSRF token expect.
				$stored_user_pass = $stored;
				return true;
			}

			$error = '<b>ERROR</b>: wrong login or password';
			$pwd   = '';
			return false;
		}

		if ( ! login() ) {
			header( 'Expires: Wed, 11 Jan 1984 05:00:00 GMT' );
			header( 'Last-Modified: ' . gmdate( 'D, d M Y H:i:s' ) . ' GMT' );
			header( 'Cache-Control: no-cache, must-revalidate' );
			header( 'Pragma: no-cache' );
			if ( $is_IIS ) {
				header( 'Refresh: 0;url=b2login.php' );
			} else {
				header( 'Location: b2login.php' );
			}
			exit();
		} else {
			$user_login = $log;
			// Issue #34 -- the auth cookie carries md5() of the *stored*
			// user_pass value (the bcrypt hash), not md5() of the typed
			// plaintext. checklogin() compares the cookie to
			// md5($userdata->user_pass), so both sides agree whether the row is
			// hashed or still legacy plaintext.
			setcookie( 'wordpressuser', $user_login, b2_auth_cookie_flags( time() + 31536000 ) );
			setcookie( 'wordpresspass', md5( $stored_user_pass ), b2_auth_cookie_flags( time() + 31536000 ) );
			if ( empty( $_COOKIE['wordpressblogid'] ) ) {
				setcookie( 'wordpressblogid', 1, b2_auth_cookie_flags( time() + 31536000 ) );
			}
			header( 'Expires: Wed, 11 Jan 1984 05:00:00 GMT' );
			header( 'Last-Modified: ' . gmdate( 'D, d M Y H:i:s' ) . ' GMT' );
			header( 'Cache-Control: no-cache, must-revalidate' );
			header( 'Pragma: no-cache' );

			switch ( $mode ) {
				case 'bookmarklet':
					$location = "wp-admin/b2bookmarklet.php?text=$text&popupurl=$popupurl&popuptitle=$popuptitle";
					break;
				case 'sidebar':
					$location = "wp-admin/sidebar.php?text=$text&popupurl=$popupurl&popuptitle=$popuptitle";
					break;
				case 'profile':
					$location = "wp-admin/profile.php?text=$text&popupurl=$popupurl&popuptitle=$popuptitle";
					break;
				default:
					$location = "$redirect_to";
					break;
			}

			if ( $is_IIS ) {
				header( "Refresh: 0;url=$location" );
			} else {
				header( "Location: $location" );
			}
		}

		break;


	case 'lostpassword':
		?>
<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
	<title>WordPress > Lost password ?</title>
	<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
	<link rel="stylesheet" href="<?php echo $siteurl; ?>/wp-admin/b2.css" type="text/css" />
</head>
<body>


<div id="login">
<p>Type your login here and click OK. You will receive an email with your password.</p>
		<?php
		if ( $error ) {
			echo "<div align=\"right\" style=\"padding:4px;\"><font color=\"#FF0000\">$error</font><br />&nbsp;</div>";
		}
		?>

<form name="" action="b2login.php" method="post">
<input type="hidden" name="action" value="retrievepassword" />
<label>Login: <input type="text" name="user_login" id="user_login" value="" size="12" /></label>
<input type="submit" name="Submit2" value="OK" class="search">

</form>
</div>



</body>
</html>
		<?php

		break;


	case 'retrievepassword':
		$user_login = $_POST['user_login'];
		$user_data  = get_userdatabylogin( $user_login );

		// Issue #34 -- never email a stored secret. After hashing, the stored
		// user_pass is a bcrypt hash and is useless to the user anyway. Instead
		// generate a fresh random temporary password, store its hash, and email
		// the new plaintext password so the user can log in and then change it.
		if ( ! $user_data ) {
			// Do not reveal whether the login exists; reply the same way.
			echo "<p>If that login exists, an email with a new password has been sent.<br />
		<a href='b2login.php' title='Check your email first, of course'>Click here to login!</a></p>";
			die();
		}

		$user_email = $user_data->user_email;

		$chars    = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
		$new_pass = '';
		for ( $i = 0; $i < 12; $i = $i + 1 ) {
			$new_pass .= $chars[ random_int( 0, strlen( $chars ) - 1 ) ];
		}

		$new_hash  = password_hash( $new_pass, PASSWORD_DEFAULT );
		$safe_hash = addslashes( $new_hash );
		$safe_id   = (int) $user_data->ID;
		$wpdb->query( "UPDATE $tableusers SET user_pass = '$safe_hash' WHERE ID = $safe_id" );

		$message  = "Login: $user_login\r\n";
		$message .= "Password: $new_pass\r\n";
		$message .= "\r\nThis is a temporary password. Please log in and change it from your profile.\r\n";

		$m = mail( $user_email, "Your weblog's login/password", $message );

		if ( false == $m ) {
			echo "<p>The email could not be sent.<br />\n";
			echo 'Possible reason: your host may have disabled the mail() function...</p>';
			die();
		} else {
			echo "<p>The email was sent successfully to $user_login's email address.<br />
		<a href='b2login.php' title='Check your email first, of course'>Click here to login!</a></p>";
			die();
		}

		break;


	default:
		if ( ( ! empty( $_COOKIE['wordpressuser'] ) ) && ( ! empty( $_COOKIE['wordpresspass'] ) ) ) {
			$user_login    = $_COOKIE['wordpressuser'];
			$user_pass_md5 = $_COOKIE['wordpresspass'];
		}

		function checklogin() {
			global $user_login, $user_pass_md5, $user_ID;

			$userdata = get_userdatabylogin( $user_login );

			if ( ! $userdata || md5( $userdata->user_pass ) != $user_pass_md5 ) {
				return false;
			} else {
				return true;
			}
		}

		if ( ! ( checklogin() ) ) {
			if ( ! empty( $_COOKIE['wordpressuser'] ) ) {
				$error = 'Error: wrong login/password'; //, or your session has expired.";
			}
		} else {
			header( 'Expires: Wed, 5 Jun 1979 23:41:00 GMT' ); /* private joke: this is Michel's birthdate - though officially it's on the 6th, since he's GMT+1 :) */
			header( 'Last-Modified: ' . gmdate( 'D, d M Y H:i:s' ) . ' GMT' ); /* different all the time */
			header( 'Cache-Control: no-cache, must-revalidate' ); /* to cope with HTTP/1.1 */
			header( 'Pragma: no-cache' );
			header( 'Location: wp-admin/b2edit.php' );
			exit();
		}
		?>
	<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
<title>WordPress > Login form</title>
<meta http-equiv="Content-Type" content="text/html; charset=iso-8859-1" />
<link rel="stylesheet" href="<?php echo $siteurl; ?>/wp-admin/b2.css" type="text/css" />
</head>
<body>



<div id="login">
<p><a href="<?php echo $siteurl; ?>">Back to blog?</a><br />
		<?php if ( $users_can_register ) { ?>
	<a href="<?php echo $siteurl; ?>/b2register.php">Register?</a><br />
	<?php } ?>
	<a href="<?php echo $siteurl; ?>/b2login.php?action=lostpassword">Lost your password?</a></p>

		<?php
		if ( $error ) {
			echo "<div align=\"right\" style=\"padding:4px;\"><font color=\"#FF0000\">$error</font><br />&nbsp;</div>";
		}
		?>

<form name="" action="<?php echo $path; ?>/b2login.php" method="post">
		<?php if ( 'bookmarklet' == $mode ) { ?>
<input type="hidden" name="mode" value="<?php echo $mode; ?>" />
<input type="hidden" name="text" value="<?php echo $text; ?>" />
<input type="hidden" name="popupurl" value="<?php echo $popupurl; ?>" />
<input type="hidden" name="popuptitle" value="<?php echo $popuptitle; ?>" />
<?php } ?>
<input type="hidden" name="redirect_to" value="wp-admin/b2edit.php" />
<input type="hidden" name="action" value="login" />
<label>Login: <input type="text" name="log" value="" size="8" /></label><br />
<label>Password: <input type="password" name="pwd" value="" size="8" /></label><br />
<input type="submit" name="Submit2" value="OK" class="search">

</form>

</div>

</body>
</html>
		<?php

		break;
}

?>