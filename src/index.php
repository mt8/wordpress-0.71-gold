<?php /* Don't remove this line, it calls the b2 function files ! */ $blog = 1;
require_once 'blog.header.php';
require $abspath . 'wp-links/links.php';
?>
<!DOCTYPE html>
<html lang="<?php echo $rss_language; ?>">

<head>
	<meta charset="UTF-8" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<title><?php bloginfo( 'name' ); ?><?php single_post_title( ' :: ' ); ?><?php single_cat_title( ' :: ' ); ?><?php single_month_title( ' :: ' ); ?></title>

	<meta name="generator" content="WordPress 0.71-gold" /> <!-- Issue #37 dropped the version for a live install; this site is published statically (no running PHP or database), so the 0.71-gold edition is named deliberately (Issue #218). -->

	<style type="text/css" media="screen">
		@import url( <?php echo $siteurl; ?>/layout2b.css );
	</style>

	<?php /* Block-library front-end CSS (Issue #94) so layout blocks (columns, group, ...) stored in post_content render consistently with the block editor. */ ?>
	<link rel="stylesheet" type="text/css" media="screen" href="<?php echo $siteurl; ?>/block-editor/assets/block-library.css" />

	<?php /* Preset colour CSS (Issue #181) -- the has-*-color classes and --wp--preset--color--* properties -- so a preset colour picked in the block editor renders on the front end, not only as a custom inline colour. */ ?>
	<link rel="stylesheet" type="text/css" media="screen" href="<?php echo $siteurl; ?>/block-editor/assets/block-presets.css" />

	<link rel="stylesheet" type="text/css" media="print" href="<?php echo $siteurl; ?>/print.css" />
	<link rel="alternate" type="text/xml" title="RSS" href="<?php bloginfo( 'rss2_url' ); ?>" />
</head>

<body>
<h1 id="header"><a href="<?php echo $siteurl; ?>" title="<?php bloginfo( 'name' ); ?>"><?php bloginfo( 'name' ); ?></a></h1>

<div id="content">

<?php
if ( $posts ) {
	foreach ( $posts as $post ) {
		start_b2();
		?>
			<?php the_date( '', '<h2>', '</h2>' ); ?>

<h3 class="storytitle">
	<a href="<?php permalink_link(); ?>" rel="bookmark"><?php the_title(); ?></a> 
	<span class="meta"><a href="?cat=<?php the_category_ID(); ?>" title="Category: <?php the_category(); ?>">[<?php the_category(); ?>]</a> &#8212; <?php the_author(); ?> @ <?php the_time(); ?>
	</span>
</h3>

<div class="storycontent">
			<?php the_content(); ?>
</div>

<div class="feedback">
			<?php link_pages( '<br />Pages: ', '<br />', 'number' ); ?>
</div>

		<?php
	}
} // end foreach, end if any posts
?>

</div>

<p class="credit"><?php timer_stop( 1 ); ?> <cite>Powered by <a href="http://wordpress.org"><strong>WordPress</strong></a></cite></p>


<div id="menu">

<ul>
<li>Links:
	<ul>
		<?php get_links( -1, '<li>', '</li>', '', 0, '_updated', 0, 0, -1, -1 ); ?>
	</ul>
</li>
<li>Categories:
	<ul>
	<?php list_cats( 0, 'All', 'name' ); ?>
	</ul>
</li>
<li>Archives:
	<ul>
	<?php get_archives( 'monthly' ); ?>
	</ul>
</li>
<li>Other:
	<ul>
		<li><a href="b2login.php">login</a></li>
	</ul>
</li>
<li>Meta:
	<ul>
		<li><a href="b2rss2.php">RSS 2.0</a></li>
		<li><a href="http://validator.w3.org/check/referer" title="This page validates as XHTML 1.0 Transitional">Valid <abbr title="eXtensible HyperText Markup Language">XHTML</abbr></a></li>
		<li><a href="http://wordpress.org" title="Powered by WordPress, personal publishing platform">WP</a></li>
	</ul>
</li>
</ul>

</div>


</body>
</html>
