<?php
	// ==================================================================
	//  Author: Justin Vincent (justin@visunet.ie)
	//  Web:    http://php.justinvincent.com
	//  Name:   ezSQL
	//  Desc:   Class to make it very easy to deal with mySQL database connections.
	//  WordPress is using this class to make the code cleaner and faster.
	//  We highly recommend it.
	//  We have modified the HTML it returns slightly.

	define( 'EZSQL_VERSION', '1.21' );
	// EN: The 3rd argument (case-insensitive constants) was removed in PHP 8.0
	//     and now emits an E_WARNING; these constants are used case-sensitively.
	// JA: 第3引数(大文字小文字を区別しない定数)は PHP 8.0 で廃止され E_WARNING を
	//     出す。これらの定数は大文字小文字を区別して使用している。
	define( 'OBJECT', 'OBJECT' );
	define( 'ARRAY_A', 'ARRAY_A' );
	define( 'ARRAY_N', 'ARRAY_N' );

	//  The Main Class, renamed to avoid conflicts.

class wpdb {

	public $debug_called;
	public $vardump_called;
	public $show_errors = true;
	// EN: Declared so PHP 8.2 does not warn about dynamic property creation.
	// JA: PHP 8.2 の動的プロパティ生成の警告を避けるため宣言する。
	public $dbh;
	public $result;
	public $last_query;
	public $last_result;
	public $col_info;
	public $num_rows;
	public $rows_affected;
	public $insert_id;
	public $func_call;

	// ==================================================================
	//  DB Constructor - connects to the server and selects a database

	// EN: Old-style constructors (method name == class name) are no longer
	//     recognized as constructors in PHP 8.0; renamed to __construct().
	// JA: 旧式コンストラクタ(メソッド名 == クラス名)は PHP 8.0 でコンスト
	//     ラクタとして認識されないため __construct() に改名。
	public function __construct( $dbuser, $dbpassword, $dbname, $dbhost ) {
		// EN: PHP 8.1+ makes mysqli throw exceptions on error by default;
		//     this class expects the classic false-return style, so disable it.
		// JA: PHP 8.1+ は mysqli を既定でエラー時に例外送出にする。本クラスは
		//     従来の false 返却を前提とするため無効化する。
		if ( function_exists( 'mysqli_report' ) ) {
			mysqli_report( MYSQLI_REPORT_OFF );
		}

		$this->dbh = @mysqli_connect( $dbhost, $dbuser, $dbpassword );

		if ( ! $this->dbh ) {
			$this->print_error(
				"<ol id='error'>
				<li><strong>Error establishing a database connection!</strong></li>
				<li>Are you sure you have the correct user/password?</li>
				<li>Are you sure that you have typed the correct hostname?</li>
				<li>Are you sure that the database server is running?</li>
				</ol>"
			);
		} else {
			// EN: WordPress 0.71-era SQL relies on the permissive sql_mode of
			//     2003-era MySQL; MySQL 8 defaults to STRICT. Reset it.
			// JA: WordPress 0.71 当時の SQL は当時の MySQL の寛容な sql_mode に
			//     依存する。MySQL 8 は既定で STRICT のためリセットする。
			@mysqli_query( $this->dbh, "SET SESSION sql_mode=''" );
		}

		$this->select( $dbname );
	}

	// ==================================================================
	//  Select a DB (if another one needs to be selected)

	public function select( $db ) {
		if ( ! ( $this->dbh instanceof mysqli ) || ! @mysqli_select_db( $this->dbh, $db ) ) {
			$this->print_error(
				"<ol id='error'>
				<li><strong>Error selecting database <u>$db</u>!</strong></li>
				<li>Are you sure it exists?</li>
				<li>Are you sure there is a valid database connection?</li>
				</ol>"
			);
		}
	}

	// ====================================================================
	//  Format a string correctly for safe insert under all PHP conditions

	public function escape( $str ) {
		return ( $this->dbh instanceof mysqli )
			? mysqli_real_escape_string( $this->dbh, stripslashes( $str ) )
			: addslashes( stripslashes( $str ) );
	}

	// ==================================================================
	//  Print SQL/DB error.

	public function print_error( $str = '' ) {

		// All errors go to the global error array $EZSQL_ERROR..
		global $EZSQL_ERROR;

		// If no special error string then use mysql default..
		if ( ! $str ) {
			$str = ( $this->dbh instanceof mysqli ) ? mysqli_error( $this->dbh ) : (string) mysqli_connect_error();
		}

		// Log this error to the global array..
		$EZSQL_ERROR[] = array(
			'query'     => $this->last_query,
			'error_str' => $str,
		);

		// Is error output turned on or not..
		if ( $this->show_errors ) {
			// If there is an error then take note of it
			print "<ol id='error'>
				<li><strong>SQL/DB Error --</strong></li>
				<li>[<font color=000077>$str</font>]</li>
				</ol>";
		} else {
			return false;
		}
	}

	// ==================================================================
	//  Turn error handling on or off..

	public function show_errors() {
		$this->show_errors = true;
	}

	public function hide_errors() {
		$this->show_errors = false;
	}

	// ==================================================================
	//  Kill cached query results

	public function flush() {

		// Get rid of these
		$this->last_result = null;
		$this->col_info    = null;
		$this->last_query  = null;
	}

	// ==================================================================
	//  Basic Query - see docs for more detail

	public function query( $query ) {

		// Flush cached values..
		$this->flush();

		// Log how the function was called
		$this->func_call = "\$db->query(\"$query\")";

		// Keep track of the last query for debug..
		$this->last_query = $query;

		// Perform the query via the mysqli_query function..
		$this->result = mysqli_query( $this->dbh, $query );

		// If there was an insert, delete or update see how many rows were affected
		// (Also, If there there was an insert take note of the insert_id
		$query_type = array( 'insert', 'delete', 'update', 'replace' );

		// loop through the above array
		foreach ( $query_type as $word ) {
			// This is true if the query starts with insert, delete or update
			if ( preg_match( "/^\\s*$word /i", $query ) ) {
				$this->rows_affected = mysqli_affected_rows( $this->dbh );

				// This gets the insert ID
				if ( 'insert' == $word || 'replace' == $word ) {
					$this->insert_id = mysqli_insert_id( $this->dbh );
				}

				$this->result = false;
			}
		}

		if ( mysqli_error( $this->dbh ) ) {

			// If there is an error then take note of it..
			$this->print_error();

		} else {

			// EN: A SELECT yields a mysqli_result; a successful non-SELECT
			//     (CREATE/etc.) yields bool true. Only fetch from a result
			//     set -- mysqli_num_fields(true) would be a TypeError.
			// JA: SELECT は mysqli_result を返し、SELECT 以外(CREATE 等)の
			//     成功は bool true を返す。結果セットのときだけ取得する。
			//     mysqli_num_fields(true) は TypeError になるため。
			if ( $this->result instanceof mysqli_result ) {

				// =======================================================
				// Take note of column info

				$i = 0;
				while ( $i < @mysqli_num_fields( $this->result ) ) {
					$this->col_info[ $i ] = @mysqli_fetch_field( $this->result );
					++$i;
				}

				// =======================================================
				// Store Query Results

				$i = 0;
				while ( $row = @mysqli_fetch_object( $this->result ) ) {

					// Store relults as an objects within main array
					$this->last_result[ $i ] = $row;

					++$i;
				}

				// Log number of rows the query returned
				$this->num_rows = $i;

				@mysqli_free_result( $this->result );

				// If there were results then return true for $db->query
				if ( $i ) {
					return true;
				} else {
					return false;
				}
			} else {
				// Update insert etc. was good..
				return true;
			}
		}
	}

	// ==================================================================
	//  Get one variable from the DB - see docs for more detail

	public function get_var( $query = null, $x = 0, $y = 0 ) {

		// Log how the function was called
		$this->func_call = "\$db->get_var(\"$query\",$x,$y)";

		// If there is a query then perform it if not then use cached results..
		if ( $query ) {
			$this->query( $query );
		}

		// Extract var out of cached results based x,y vals
		if ( $this->last_result[ $y ] ) {
			$values = array_values( get_object_vars( $this->last_result[ $y ] ) );
		}

		// If there is a value return it else return null
		return ( isset( $values[ $x ] ) && '' !== $values[ $x ] ) ? $values[ $x ] : null;
	}

	// ==================================================================
	//  Get one row from the DB - see docs for more detail

	public function get_row( $query = null, $output = OBJECT, $y = 0 ) {

		// Log how the function was called
		$this->func_call = "\$db->get_row(\"$query\",$output,$y)";

		// If there is a query then perform it if not then use cached results..
		if ( $query ) {
			$this->query( $query );
		}

		if ( OBJECT == $output ) {
			// If the output is an object then return object using the row offset..
			return isset( $this->last_result[ $y ] ) ? $this->last_result[ $y ] : null;
		} elseif ( ARRAY_A == $output ) {
			// If the output is an associative array then return row as such..
			return isset( $this->last_result[ $y ] ) ? get_object_vars( $this->last_result[ $y ] ) : null;
		} elseif ( ARRAY_N == $output ) {
			// If the output is an numerical array then return row as such..
			return isset( $this->last_result[ $y ] ) ? array_values( get_object_vars( $this->last_result[ $y ] ) ) : null;
		} else {
			// If invalid output type was specified..
			$this->print_error( ' $db->get_row(string query, output type, int offset) -- Output type must be one of: OBJECT, ARRAY_A, ARRAY_N' );
		}
	}

	// ==================================================================
	//  Function to get 1 column from the cached result set based in X index
	// se docs for usage and info

	public function get_col( $query = null, $x = 0 ) {

		// If there is a query then perform it if not then use cached results..
		if ( $query ) {
			$this->query( $query );
		}

		// Extract the column values
		for ( $i = 0; $i < count( $this->last_result ); $i++ ) {
			$new_array[ $i ] = $this->get_var( null, $x, $i );
		}

		return $new_array;
	}

	// ==================================================================
	// Return the the query as a result set - see docs for more details

	public function get_results( $query = null, $output = OBJECT ) {

		// Log how the function was called
		$this->func_call = "\$db->get_results(\"$query\", $output)";

		// If there is a query then perform it if not then use cached results..
		if ( $query ) {
			$this->query( $query );
		}

		// Send back array of objects. Each row is an object
		if ( OBJECT == $output ) {
			return $this->last_result;
		} elseif ( ARRAY_A == $output || ARRAY_N == $output ) {
			if ( $this->last_result ) {
				$i = 0;
				foreach ( $this->last_result as $row ) {

					$new_array[ $i ] = get_object_vars( $row );

					if ( ARRAY_N == $output ) {
						$new_array[ $i ] = array_values( $new_array[ $i ] );
					}

					++$i;
				}

				return $new_array;
			} else {
				return null;
			}
		}
	}


	// ==================================================================
	// Function to get column meta data info pertaining to the last query
	// see docs for more info and usage

	public function get_col_info( $info_type = 'name', $col_offset = -1 ) {

		if ( $this->col_info ) {
			if ( -1 == $col_offset ) {
				$i = 0;
				foreach ( $this->col_info as $col ) {
					$new_array[ $i ] = $col->{$info_type};
					++$i;
				}
				return $new_array;
			} else {
				return $this->col_info[ $col_offset ]->{$info_type};
			}
		}
	}
}

$wpdb = new wpdb( DB_USER, DB_PASSWORD, DB_NAME, DB_HOST );
