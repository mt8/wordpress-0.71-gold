<?php
	// ==================================================================
	//  071-now SQLite-backed wp-db.php (Issue #108 feasibility spike).
	//
	//  This file is a drop-in replacement for src/b2-include/wp-db.php.
	//  It is applied ONLY to the in-browser copy of WordPress 0.71 -- it
	//  is overlaid onto the php-wasm virtual filesystem at build time and
	//  never touches src/ on disk. The Docker / MySQL setup is untouched.
	//
	//  WordPress 0.71's wp-db.php (ezSQL) talks to MySQL via mysqli, and
	//  there is no MySQL server in a browser. Approach (A) of design
	//  section 5.2 is taken here: a 0.71-specific wpdb whose $wpdb runs
	//  against SQLite (PDO + pdo_sqlite, both compiled into php-wasm).
	//
	//  Approach (B), a userland mysqli shim, was rejected: php-wasm
	//  compiles the mysqli extension in, so the procedural mysqli_*
	//  functions cannot be redeclared in userland (fatal "Cannot
	//  redeclare"). Replacing this one file is the clean route.
	//
	//  The public surface of the wpdb class is kept identical to the
	//  original ezSQL class (query / get_var / get_row / get_col /
	//  get_results / escape / the public properties), so the rest of
	//  WordPress 0.71 -- b2config.php, blog.header.php, the b2-include
	//  function files -- runs unchanged against it.
	// ==================================================================

	define( 'EZSQL_VERSION', '1.21-sqlite' );
	define( 'OBJECT', 'OBJECT' );
	define( 'ARRAY_A', 'ARRAY_A' );
	define( 'ARRAY_N', 'ARRAY_N' );

	// EN: The MySQL -> SQLite translator, shared with the database seed.
	require_once __DIR__ . '/071-now-sql-translator.php';

/**
 * SQLite-backed reimplementation of WordPress 0.71's ezSQL wpdb class.
 *
 * Keeps the original public API so the rest of WordPress 0.71 is
 * unchanged. Internally it runs PDO against an on-disk SQLite database
 * inside the php-wasm virtual filesystem.
 */
class wpdb {

	public $show_errors = true;
	public $last_query;
	public $last_result;
	public $col_info;
	public $num_rows;
	public $rows_affected;
	public $insert_id;
	public $func_call;

	// EN: The PDO handle. Named "dbh" because a few 0.71 call sites read
	//     $wpdb->dbh directly (get_lastpostdate, dropdown_cats); those
	//     paths are not on the front page but the property is kept so a
	//     reference still resolves.
	public $dbh;

	/**
	 * Open (and lazily create) the SQLite database.
	 *
	 * The constructor signature matches the original ezSQL class
	 * (b2config.php instantiates it as
	 * new wpdb(DB_USER, DB_PASSWORD, DB_NAME, DB_HOST)), but only the
	 * database name is meaningful here -- it selects the SQLite file.
	 *
	 * @param string $dbuser     Unused (kept for signature parity).
	 * @param string $dbpassword Unused (kept for signature parity).
	 * @param string $dbname     SQLite database file basename.
	 * @param string $dbhost     Unused (kept for signature parity).
	 */
	public function __construct( $dbuser, $dbpassword, $dbname, $dbhost ) {
		// EN: WP071_DB_PATH is defined by the 071-now boot shim; fall
		//     back to a temp path so the class is still usable standalone.
		$path = defined( 'WP071_DB_PATH' ) ? WP071_DB_PATH : ( sys_get_temp_dir() . '/071-now.sqlite' );

		try {
			$this->dbh = new PDO( 'sqlite:' . $path );
			$this->dbh->setAttribute( PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION );
			$this->dbh->exec( 'PRAGMA foreign_keys = ON' );
		} catch ( Exception $e ) {
			$this->print_error( 'SQLite connection failed: ' . $e->getMessage() );
		}
	}

	/**
	 * Selecting a database is a no-op for the single-file SQLite backend.
	 *
	 * @param string $db Ignored.
	 */
	public function select( $db ) {
		// Intentionally empty: one SQLite file is the whole database.
	}

	/**
	 * Escape a string for safe interpolation into SQL.
	 *
	 * 0.71 builds SQL by string interpolation, so the class still has to
	 * offer escape(). SQLite escapes a single quote by doubling it.
	 *
	 * @param string $str Raw string.
	 * @return string Escaped string.
	 */
	public function escape( $str ) {
		return str_replace( "'", "''", stripslashes( (string) $str ) );
	}

	/**
	 * Record / print an SQL error.
	 *
	 * @param string $str Error message.
	 * @return false|void
	 */
	public function print_error( $str = '' ) {
		global $EZSQL_ERROR;
		$EZSQL_ERROR[] = array(
			'query'     => $this->last_query,
			'error_str' => $str,
		);
		if ( $this->show_errors ) {
			print "<ol id='error'>
				<li><strong>SQL/DB Error --</strong></li>
				<li>[<font color=000077>" . htmlspecialchars( (string) $str ) . "</font>]</li>
				</ol>";
			return;
		}
		return false;
	}

	/**
	 * Enable error output.
	 */
	public function show_errors() {
		$this->show_errors = true;
	}

	/**
	 * Disable error output.
	 */
	public function hide_errors() {
		$this->show_errors = false;
	}

	/**
	 * Drop the cached result set of the previous query.
	 */
	public function flush() {
		$this->last_result = null;
		$this->col_info    = null;
		$this->last_query  = null;
	}

	/**
	 * Run a query against SQLite.
	 *
	 * SELECT results are cached in $this->last_result as an array of
	 * stdClass rows -- exactly the shape the original mysqli-based class
	 * produced, so get_var / get_row / get_results need no change.
	 *
	 * @param string $query MySQL-dialect SQL emitted by WordPress 0.71.
	 * @return bool True when a SELECT returned rows or a write succeeded.
	 */
	public function query( $query ) {
		$this->flush();
		$this->func_call  = "\$db->query(\"$query\")";
		$this->last_query = $query;

		if ( ! ( $this->dbh instanceof PDO ) ) {
			return false;
		}

		$sql = WP071_SqlTranslator::translate( $query );

		$is_write = (bool) preg_match( '/^\s*(insert|update|delete|replace|create|drop|alter)\b/i', $sql );

		try {
			if ( $is_write ) {
				$this->rows_affected = $this->dbh->exec( $sql );
				if ( preg_match( '/^\s*(insert|replace)\b/i', $sql ) ) {
					$this->insert_id = (int) $this->dbh->lastInsertId();
				}
				return true;
			}

			$stmt = $this->dbh->query( $sql );
			$rows = $stmt->fetchAll( PDO::FETCH_OBJ );

			$this->last_result = array();
			foreach ( $rows as $i => $row ) {
				$this->last_result[ $i ] = $row;
			}
			$this->num_rows = count( $rows );

			// EN: Column metadata, in the {name: ...} shape get_col_info
			//     expects. Best-effort: PDO exposes it per column index.
			$this->col_info = array();
			$cols           = $stmt->columnCount();
			for ( $c = 0; $c < $cols; $c++ ) {
				$meta       = @$stmt->getColumnMeta( $c );
				$info       = new stdClass();
				$info->name = isset( $meta['name'] ) ? $meta['name'] : (string) $c;
				$this->col_info[ $c ] = $info;
			}

			return $this->num_rows > 0;
		} catch ( Exception $e ) {
			$this->print_error( $e->getMessage() . ' -- translated SQL: ' . $sql );
			return false;
		}
	}

	/**
	 * Fetch a single scalar value from the result set.
	 *
	 * @param string|null $query Optional query to run first.
	 * @param int         $x     Column offset.
	 * @param int         $y     Row offset.
	 * @return mixed|null
	 */
	public function get_var( $query = null, $x = 0, $y = 0 ) {
		$this->func_call = "\$db->get_var(\"$query\",$x,$y)";
		if ( $query ) {
			$this->query( $query );
		}
		$values = array();
		if ( isset( $this->last_result[ $y ] ) ) {
			$values = array_values( get_object_vars( $this->last_result[ $y ] ) );
		}
		return ( isset( $values[ $x ] ) && '' !== $values[ $x ] ) ? $values[ $x ] : null;
	}

	/**
	 * Fetch a single row from the result set.
	 *
	 * @param string|null $query  Optional query to run first.
	 * @param string      $output OBJECT, ARRAY_A or ARRAY_N.
	 * @param int         $y      Row offset.
	 * @return mixed|null
	 */
	public function get_row( $query = null, $output = OBJECT, $y = 0 ) {
		$this->func_call = "\$db->get_row(\"$query\",$output,$y)";
		if ( $query ) {
			$this->query( $query );
		}
		if ( OBJECT == $output ) {
			return isset( $this->last_result[ $y ] ) ? $this->last_result[ $y ] : null;
		} elseif ( ARRAY_A == $output ) {
			return isset( $this->last_result[ $y ] ) ? get_object_vars( $this->last_result[ $y ] ) : null;
		} elseif ( ARRAY_N == $output ) {
			return isset( $this->last_result[ $y ] ) ? array_values( get_object_vars( $this->last_result[ $y ] ) ) : null;
		}
		$this->print_error( ' $db->get_row(string query, output type, int offset) -- Output type must be one of: OBJECT, ARRAY_A, ARRAY_N' );
	}

	/**
	 * Fetch one column of the result set.
	 *
	 * @param string|null $query Optional query to run first.
	 * @param int         $x     Column offset.
	 * @return array
	 */
	public function get_col( $query = null, $x = 0 ) {
		if ( $query ) {
			$this->query( $query );
		}
		$new_array = array();
		$count     = is_array( $this->last_result ) ? count( $this->last_result ) : 0;
		for ( $i = 0; $i < $count; $i++ ) {
			$new_array[ $i ] = $this->get_var( null, $x, $i );
		}
		return $new_array;
	}

	/**
	 * Fetch the whole result set.
	 *
	 * @param string|null $query  Optional query to run first.
	 * @param string      $output OBJECT, ARRAY_A or ARRAY_N.
	 * @return array|null
	 */
	public function get_results( $query = null, $output = OBJECT ) {
		$this->func_call = "\$db->get_results(\"$query\", $output)";
		if ( $query ) {
			$this->query( $query );
		}
		if ( OBJECT == $output ) {
			return $this->last_result;
		} elseif ( ARRAY_A == $output || ARRAY_N == $output ) {
			if ( $this->last_result ) {
				$new_array = array();
				$i         = 0;
				foreach ( $this->last_result as $row ) {
					$new_array[ $i ] = get_object_vars( $row );
					if ( ARRAY_N == $output ) {
						$new_array[ $i ] = array_values( $new_array[ $i ] );
					}
					++$i;
				}
				return $new_array;
			}
			return null;
		}
	}

	/**
	 * Return column metadata for the last query.
	 *
	 * @param string $info_type  Metadata field name.
	 * @param int    $col_offset Column index, or -1 for all.
	 * @return mixed
	 */
	public function get_col_info( $info_type = 'name', $col_offset = -1 ) {
		if ( $this->col_info ) {
			if ( -1 == $col_offset ) {
				$new_array = array();
				$i         = 0;
				foreach ( $this->col_info as $col ) {
					$new_array[ $i ] = $col->{$info_type};
					++$i;
				}
				return $new_array;
			}
			return $this->col_info[ $col_offset ]->{$info_type};
		}
	}
}

$wpdb = new wpdb( DB_USER, DB_PASSWORD, DB_NAME, DB_HOST );
