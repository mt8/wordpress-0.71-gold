</div>
<?php
if ( '1' == $debug ) {
	echo "<p>$querycount queries - " . number_format( timer_stop(), 3 ) . ' seconds';
}
?>
<div align="center" style="width: 100%" class="tabletoprow"><strong><a href="http://wordpress.org">WordPress</a></strong> <?php echo $b2_version; ?> <a href="http://wordpress.org/support/">Support Forums</a></div>

</body>
</html>