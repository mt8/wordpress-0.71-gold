<div class="wrap">
<?php

require_once '../b2config.php';

if ( empty( $showposts ) ) {
	if ( $posts_per_page ) {
		$showposts = $posts_per_page;
	} else {
		$showposts      = 10;
		$posts_per_page = $showposts;
	}
}

if ( ( ! empty( $poststart ) ) && ( ! empty( $postend ) ) && ( $poststart == $postend ) ) {
	$p         = $poststart;
	$poststart = 0;
	$postend   = 0;
}

if ( ! $poststart ) {
	$poststart = 0;
	$postend   = $showposts;
}

$nextXstart = $postend;
$nextXend   = $postend + $showposts;

$previousXstart = ( $poststart - $showposts );
$previousXend   = $poststart;
if ( $previousXstart < 0 ) {
	$previousXstart = 0;
	$previousXend   = $showposts;
}

?>

<table width="100%">
	<tr>
	<td valign="top" width="200">
		Show posts:
	</td>
	<td>
		<table cellpadding="0" cellspacing="0" border="0">
		<tr>
			<td colspan="2" align="center"><!-- show next/previous X posts -->
			<form name="previousXposts" method="get" action="">
<?php
if ( $previousXstart > 0 ) {
	?>
				<input type="hidden" name="poststart" value="<?php echo $previousXstart; ?>" />
				<input type="hidden" name="postend" value="<?php echo $previousXend; ?>" />
				<input type="submit" name="submitprevious" class="search" value="< <?php echo $showposts; ?>" />
	<?php
}
?>
			</form>
			</td>
			<td>
			<form name="nextXposts" method="get" action="">
				<input type="hidden" name="poststart" value="<?php echo $nextXstart; ?>" />
				<input type="hidden" name="postend" value="<?php echo $nextXend; ?>" />
				<input type="submit" name="submitnext" class="search" value="<?php echo $showposts; ?> >" />
			</form>
			</td>
		</tr>
		</table>
	</td>
	</tr>
	<tr>
	<td valign="top" width="200"><!-- show X first/last posts -->
		<form name="showXfirstlastposts" method="get" action="">
		<input type="text" name="posts" value="<?php echo $showposts; ?>" style="width:40px;" /?>
<?php
if ( ! isset( $order ) ) {
	$order = 'DESC';
}
$besp_selected = '';
$i             = $order;
if ( $i == 'DESC' ) {
	$besp_selected = "selected='selected'";
}
?>
		<select name="order">
			<option value="DESC" <?php echo $besp_selected; ?>>last posts</option>
<?php
$besp_selected = '';
if ( $i == 'ASC' ) {
	$besp_selected = "selected='selected'";
}
?>
			<option value="ASC" <?php echo $besp_selected; ?>>first posts</option>
		</select>&nbsp;
		<input type="submit" name="submitfirstlast" class="search" value="OK" />
		</form>
	</td>
	<td valign="top"><!-- show post X to post X -->
		<form name="showXfirstlastposts" method="get" action="">
		<input type="text" name="poststart" value="<?php echo $poststart; ?>" style="width:40px;" /?>&nbsp;to&nbsp;<input type="text" name="postend" value="<?php echo $postend; ?>" style="width:40px;" /?>&nbsp;
		<select name="order">
<?php
$besp_selected = '';
$i             = $order;
if ( $i == 'DESC' ) {
	$besp_selected = "selected='selected'";
}
?>
			<option value="DESC" "<?php echo $besp_selected; ?>">from the end</option>
<?php
$besp_selected = '';
if ( $i == 'ASC' ) {
	$besp_selected = "selected='selected'";
}
?>
<option value="ASC" "<?php echo $besp_selected; ?>">from the start</option>
		</select>&nbsp;
		<input type="submit" name="submitXtoX" class="search" value="OK" />
		</form>
	</td>
	</tr>
</table>
</div>

<div class="wrap">
<table width="100%">
	<td valign="top" width="33%">
		<form name="searchform" action="b2edit.php" method="get">
			<input type="hidden" name="a" value="s" />
			<input onfocus="this.value='';" onblur="if (this.value=='') {this.value='search...';}" type="text" name="s" value="search..." size="7" style="width: 100px;" />
			<input type="submit" name="submit" value="search" class="search" />
		</form>
	</td>
<td valign="top" width="33%" align="center">
	<form name="viewcat" action="b2edit.php" method="get">
		<select name="cat" style="width:140px;">
		<option value="all">All Categories</option>
		<?php
		$categories = $wpdb->get_results( "SELECT * FROM $tablecategories" );
		++$querycount;
		$width = ( $mode == 'sidebar' ) ? '100%' : '170px';
		foreach ( $categories as $category ) {
			echo '<option value="' . $category->cat_ID . '"';
			if ( isset( $postdata['Category'] ) && $category->cat_ID == $postdata['Category'] ) {
				echo " selected='selected'";
			}
			echo '>' . $category->cat_name . '</option>';
		}
		?>
		</select>
		<input type="submit" name="submit" value="View" class="search" />
	</form>
</td>
<td valign="top" width="33%" align="right">
<form name="viewarc" action="b2edit.php" method="get">
	<?php

	if ( $archive_mode == 'monthly' ) {
		echo '<select name="m" style="width:120px;">';
		$arc_sql = "SELECT DISTINCT YEAR(post_date), MONTH(post_date) FROM $tableposts ORDER BY post_date DESC";
		++$querycount;
		$arc_result = mysqli_query( $wpdb->dbh, $arc_sql );
		if ( ! $arc_result ) {
			// EN: Information-disclosure fix (Issue #37). The original code echoed
			//     the full SQL plus mysqli_error() to the page; keep the technical
			//     detail in the server log only and show a generic message.
			// JA: 情報漏洩の修正(Issue #37)。元のコードは SQL 全文と mysqli_error()
			//     をページに出力していた。技術的詳細はサーバログのみに残し、汎用
			//     メッセージを表示する。
			error_log( 'b2edit.showposts.php SQL error: ' . mysqli_error( $wpdb->dbh ) . ' -- query: ' . $arc_sql );
			die( 'A database error occurred.' );
		}
		while ( $arc_row = mysqli_fetch_array( $arc_result ) ) {
			$arc_year  = $arc_row['YEAR(post_date)'];
			$arc_month = $arc_row['MONTH(post_date)'];
			echo "<option value=\"$arc_year" . zeroise( $arc_month, 2 ) . '">';
			echo $month[ zeroise( $arc_month, 2 ) ] . " $arc_year";
			echo "</option>\n";
		}
	} elseif ( $archive_mode == 'daily' ) {
		echo '<select name="d" style="width:120px;">';
		$archive_day_date_format = 'Y/m/d';
		$arc_sql                 = "SELECT DISTINCT YEAR(post_date), MONTH(post_date), DAYOFMONTH(post_date) FROM $tableposts ORDER BY post_date DESC";
		++$querycount;
		$arc_result = mysqli_query( $wpdb->dbh, $arc_sql );
		if ( ! $arc_result ) {
			// EN: Information-disclosure fix (Issue #37). The original code echoed
			//     the full SQL plus mysqli_error() to the page; keep the technical
			//     detail in the server log only and show a generic message.
			// JA: 情報漏洩の修正(Issue #37)。元のコードは SQL 全文と mysqli_error()
			//     をページに出力していた。技術的詳細はサーバログのみに残し、汎用
			//     メッセージを表示する。
			error_log( 'b2edit.showposts.php SQL error: ' . mysqli_error( $wpdb->dbh ) . ' -- query: ' . $arc_sql );
			die( 'A database error occurred.' );
		}
		while ( $arc_row = mysqli_fetch_array( $arc_result ) ) {
			$arc_year       = $arc_row['YEAR(post_date)'];
			$arc_month      = $arc_row['MONTH(post_date)'];
			$arc_dayofmonth = $arc_row['DAYOFMONTH(post_date)'];
			echo "<option value=\"$arc_year" . zeroise( $arc_month, 2 ) . zeroise( $arc_dayofmonth, 2 ) . '">';
			echo mysql2date( $archive_day_date_format, $arc_year . zeroise( $arc_month, 2 ) . zeroise( $arc_dayofmonth, 2 ) . ' 00:00:00' );
			echo "</option>\n";
		}
	} elseif ( $archive_mode == 'weekly' ) {
		echo '<select name="w" style="width:120px;">';
		if ( ! isset( $start_of_week ) ) {
			$start_of_week = 1;
		}
		$archive_week_start_date_format = 'Y/m/d';
		$archive_week_end_date_format   = 'Y/m/d';
		$archive_week_separator         = ' - ';
		$arc_sql                        = "SELECT DISTINCT YEAR(post_date), MONTH(post_date), DAYOFMONTH(post_date), WEEK(post_date) FROM $tableposts ORDER BY post_date DESC";
		++$querycount;
		$arc_result = mysqli_query( $wpdb->dbh, $arc_sql );
		if ( ! $arc_result ) {
			// EN: Information-disclosure fix (Issue #37). The original code echoed
			//     the full SQL plus mysqli_error() to the page; keep the technical
			//     detail in the server log only and show a generic message.
			// JA: 情報漏洩の修正(Issue #37)。元のコードは SQL 全文と mysqli_error()
			//     をページに出力していた。技術的詳細はサーバログのみに残し、汎用
			//     メッセージを表示する。
			error_log( 'b2edit.showposts.php SQL error: ' . mysqli_error( $wpdb->dbh ) . ' -- query: ' . $arc_sql );
			die( 'A database error occurred.' );
		}
		$arc_w_last = '';
		while ( $arc_row = mysqli_fetch_array( $arc_result ) ) {
			$arc_year = $arc_row['YEAR(post_date)'];
			$arc_w    = $arc_row['WEEK(post_date)'];
			if ( $arc_w != $arc_w_last ) {
				$arc_w_last     = $arc_w;
				$arc_ymd        = $arc_year . '-' . zeroise( $arc_row['MONTH(post_date)'], 2 ) . '-' . zeroise( $arc_row['DAYOFMONTH(post_date)'], 2 );
				$arc_week       = get_weekstartend( $arc_ymd, $start_of_week );
				$arc_week_start = date( $archive_week_start_date_format, $arc_week['start'] );
				$arc_week_end   = date( $archive_week_end_date_format, $arc_week['end'] );
				echo "<option value=\"$arc_w\">";
				echo $arc_week_start . $archive_week_separator . $arc_week_end;
				echo "</option>\n";
			}
		}
	} elseif ( $archive_mode == 'postbypost' ) {
		echo '<input type="hidden" name="more" value="1" />';
		echo '<select name="p" style="width:120px;">';
		$requestarc = " SELECT ID,post_date,post_title FROM $tableposts ORDER BY post_date DESC";
		++$querycount;
		$resultarc = mysqli_query( $wpdb->dbh, $requestarc );
		while ( $row = mysqli_fetch_object( $resultarc ) ) {
			if ( $row->post_date != '0000-00-00 00:00:00' ) {
				echo '<option value="' . $row->ID . '">';
				if ( strip_tags( $row->post_title ) ) {
					echo strip_tags( stripslashes( $row->post_title ) );
				} else {
					echo $row->ID;
				}
				echo "</option>\n";
			}
		}
	}

	echo '</select>';
	?>
	<input type="submit" name="submit" value="View" class="search" />
</form>
</td>

</table>

	<?php
	// these lines are b2's "motor", do not alter nor remove them
	require $abspath . 'blog.header.php';

	foreach ( $posts as $post ) {
		$posts_per_page = 10;
		start_b2();
		?>
			<p>
				<strong><?php the_time( 'Y/m/d @ H:i:s' ); ?></strong> [
				<?php
				if ( ( $user_level > $authordata->user_level ) or ( $user_login == $authordata->user_login ) ) {
					echo " - <a href='b2edit.php?action=edit&amp;post=$id";
					if ( $m ) {
						echo "&m=$m";
					}
					echo "'>Edit</a>";
					// EN: Append the CSRF token to the delete link (verified by b2edit.php).
					// JA: 削除リンクに CSRF トークンを付与する(b2edit.php で検証)。
					echo " - <a href='b2edit.php?action=delete&amp;post=$id&amp;_b2csrf=" . b2_csrf_token( 'delete-post' ) . "' onclick=\"return confirm('You are about to delete this post \'" . $post->post_title . "\'\\n  \'Cancel\' to stop, \'OK\' to delete.')\">Delete</a> ";
				}
				if ( 'private' == $post->post_status ) {
					echo ' - <strong>Private</strong>';
				}
				?>
				]
				<br />
				<font color="#999999"><b><a href="<?php permalink_single( $siteurl . '/' . $blogfilename ); ?>" title="permalink"><?php the_title(); ?></a></b> by <b><?php the_author(); ?> (<a href="javascript:profile(<?php the_author_ID(); ?>)"><?php the_author_nickname(); ?></a>)</b>, in <b><?php the_category(); ?></b></font><br />
				<?php permalink_anchor(); ?>
				<?php
				the_content();
				?>
			</p>
			<br />

		<?php

	} // end b2 loop
	?>

</div>

<div class="wrap">
<table width="100%">
	<tr>
	<td valign="top" width="200">Show posts:</td>
	<td>
		<table cellpadding="0" cellspacing="0" border="0">
		<tr>
			<td colspan="2" align="center"><!-- show next/previous X posts -->
			<form name="previousXposts" method="get">
			<?php
			if ( $previousXstart > -1 ) {
				?>
				<input type="hidden" name="poststart" value="<?php echo $previousXstart; ?>" />
				<input type="hidden" name="postend" value="<?php echo $previousXend; ?>" />
				<input type="submit" name="submitprevious" class="search" value="< Previous <?php echo $showposts; ?>" />
				<?php
			}
			?>
			</form>
			</td>
			<td>
			<form name="nextXposts" method="get">
				<input type="hidden" name="poststart" value="<?php echo $nextXstart; ?>" />
				<input type="hidden" name="postend" value="<?php echo $nextXend; ?>" />
				<input type="submit" name="submitnext" class="search" value="Next <?php echo $showposts; ?> >" />
			</form>
			</td>
		</tr>
		</table>
	</td>
	</tr>
	<tr>
	<td valign="top" width="200"><!-- show X first/last posts -->
		<form name="showXfirstlastposts" method="get">
		<input type="text" name="posts" value="<?php echo $showposts; ?>" style="width:40px;" /?>
		<select name="order">&nbsp;<option value="DESC" 
		<?php
		$i = $order;
		if ( $i == 'DESC' ) {
			echo ' selected';
		}
		?>
		>last posts</option>
<option value="ASC" 
<?php
if ( $i == 'ASC' ) {
	echo ' selected';
}
?>
>first posts</option>
		</select>&nbsp;<input type="submit" name="submitfirstlast" class="search" value="OK" />
		</form>
	</td>
	<td valign="top"><!-- show post X to post X -->
		<form name="showXfirstlastposts" method="get">
		<input type="text" name="poststart" value="<?php echo $poststart; ?>" style="width:40px;" /?>&nbsp;to&nbsp;<input type="text" name="postend" value="<?php echo $postend; ?>" style="width:40px;" /?>&nbsp;<select name="order">
			<option value="DESC" 
			<?php
			$i = $order;
			if ( $i == 'DESC' ) {
				echo ' selected';
			}
			?>
			>from the end</option>
<option value="ASC" 
<?php
if ( $i == 'ASC' ) {
	echo ' selected';
}
?>
>from the start</option>
			</select>&nbsp;<input type="submit" name="submitXtoX" class="search" value="OK" />
		</form>
		</td>
	</tr>
	</table>
</div>