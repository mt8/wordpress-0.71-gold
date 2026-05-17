<?php
// ==================================================================
//  071-now mysqli compat helpers (Issue #120, full build 3/6).
//
//  WordPress 0.71's wpdb methods cover almost every query, but a
//  handful of functions bypass them and call mysqli_query() directly
//  on $wpdb->dbh, then walk the result with mysqli_fetch_object() /
//  mysqli_fetch_array() / mysqli_fetch_row() / mysqli_num_rows(), and
//  read errors with mysqli_error( $wpdb->dbh ).
//
//  Under the 071-now SQLite-backed wpdb, $wpdb->dbh is a PDO -- not a
//  mysqli handle -- so those procedural mysqli_* built-ins would fatal.
//  The mysqli extension is compiled into php-wasm, so the built-in
//  functions cannot be redeclared in userland (the spike confirmed the
//  fatal "Cannot redeclare"). 071-now therefore rewrites those direct
//  call sites instead: the overlay builder (scripts/build-overlay.mjs)
//  replaces, in the in-browser copy of each affected file only:
//
//    mysqli_query( $wpdb->dbh, X )  ->  wp071_db_query( X )
//    mysqli_fetch_object( R )       ->  wp071_db_fetch_object( R )
//    mysqli_fetch_array( R )        ->  wp071_db_fetch_array( R )
//    mysqli_fetch_row( R )          ->  wp071_db_fetch_row( R )
//    mysqli_num_rows( R )           ->  wp071_db_num_rows( R )
//    mysqli_error( $wpdb->dbh )     ->  wp071_db_error()
//
//  These helpers route through the SQLite wpdb's db_query() / db_error()
//  and the WP071_DbResult cursor it returns, so the rewritten code keeps
//  its original shape and behaviour. src/ is never touched -- the
//  rewrite applies only to the generated tools/playground/wp/ tree.
// ==================================================================

if ( ! function_exists( 'wp071_db_query' ) ) {

	/**
	 * Run a query in place of mysqli_query( $wpdb->dbh, $sql ).
	 *
	 * @param string $sql MySQL-dialect SQL emitted by WordPress 0.71.
	 * @return WP071_DbResult|bool A cursor for a SELECT, true for a
	 *                             successful write, false on failure.
	 */
	function wp071_db_query( $sql ) {
		global $wpdb;
		return $wpdb->db_query( $sql );
	}

	/**
	 * Fetch the next row as an object, in place of mysqli_fetch_object().
	 *
	 * @param WP071_DbResult|mixed $result The db_query() result.
	 * @return object|false
	 */
	function wp071_db_fetch_object( $result ) {
		return ( $result instanceof WP071_DbResult ) ? $result->fetch_object() : false;
	}

	/**
	 * Fetch the next row as an array, in place of mysqli_fetch_array().
	 *
	 * @param WP071_DbResult|mixed $result The db_query() result.
	 * @return array|false
	 */
	function wp071_db_fetch_array( $result ) {
		return ( $result instanceof WP071_DbResult ) ? $result->fetch_array() : false;
	}

	/**
	 * Fetch the next row numerically, in place of mysqli_fetch_row().
	 *
	 * @param WP071_DbResult|mixed $result The db_query() result.
	 * @return array|false
	 */
	function wp071_db_fetch_row( $result ) {
		return ( $result instanceof WP071_DbResult ) ? $result->fetch_row() : false;
	}

	/**
	 * Count the rows in a result, in place of mysqli_num_rows().
	 *
	 * @param WP071_DbResult|mixed $result The db_query() result.
	 * @return int
	 */
	function wp071_db_num_rows( $result ) {
		return ( $result instanceof WP071_DbResult ) ? $result->num_rows() : 0;
	}

	/**
	 * The last query error, in place of mysqli_error( $wpdb->dbh ).
	 *
	 * @return string
	 */
	function wp071_db_error() {
		global $wpdb;
		return $wpdb->db_error();
	}
}
