<?php
// ==================================================================
//  071-now MySQL -> SQLite translator (Issue #108 feasibility spike).
//
//  WordPress 0.71's SQL surface is deliberately tiny -- a handful of
//  tables and simple queries, far smaller than modern WordPress. That
//  is what makes 071-now realistic (design section 5.2). This file
//  translates that small surface from the MySQL dialect 0.71 emits to
//  the SQLite dialect php-wasm can run.
//
//  It is shared by the 071-now wp-db.php (runtime queries) and seed.php
//  (schema DDL), so the schema and the live queries go through exactly
//  one translation path.
//
//  The translator is intentionally narrow: it covers only the
//  constructs WordPress 0.71 actually produces, not the whole of MySQL.
// ==================================================================

if ( ! class_exists( 'WP071_SqlTranslator' ) ) {

	/**
	 * Translate the small SQL surface of WordPress 0.71 to SQLite.
	 */
	class WP071_SqlTranslator {

		/**
		 * Translate a CREATE TABLE / INSERT / SELECT / UPDATE statement.
		 *
		 * @param string $sql MySQL-dialect SQL.
		 * @return string SQLite-dialect SQL.
		 */
		public static function translate( $sql ) {
			$out = trim( $sql );

			if ( preg_match( '/^\s*CREATE\s+TABLE/i', $out ) ) {
				return self::translate_create_table( $out );
			}

			return self::translate_dml( $out );
		}

		/**
		 * Translate a CREATE TABLE statement (wp-install.php schema DDL).
		 *
		 * 0.71's column types -- int(N), tinyint(N), varchar(N), text,
		 * datetime, enum(...) -- and the "auto_increment" / "PRIMARY KEY"
		 * idioms are rewritten to their SQLite equivalents.
		 *
		 * @param string $sql A MySQL CREATE TABLE statement.
		 * @return string SQLite CREATE TABLE statement.
		 */
		private static function translate_create_table( $sql ) {
			// EN: An auto-increment integer primary key. SQLite makes a
			//     column an alias of ROWID only for exactly "INTEGER
			//     PRIMARY KEY", so the per-column form is collapsed to
			//     that and the table-level "PRIMARY KEY (col)" dropped.
			$pk_column = null;
			if ( preg_match( '/(\w+)\s+[^,]*\bauto_increment\b/i', $sql, $m ) ) {
				$pk_column = $m[1];
			} elseif ( preg_match( '/PRIMARY\s+KEY\s*\(\s*`?(\w+)`?\s*\)/i', $sql, $m ) ) {
				$pk_column = $m[1];
			}

			// EN: Drop MySQL KEY / UNIQUE KEY index lines -- SQLite
			//     declares indexes separately and 0.71 never relies on
			//     them at query time on the front page.
			$sql = preg_replace( '/,\s*UNIQUE\s+KEY\s*[^,)]*\([^)]*\)/i', '', $sql );
			$sql = preg_replace( '/,\s*KEY\s+\w+\s*\([^)]*\)/i', '', $sql );

			// EN: Drop the table-level PRIMARY KEY clause; it is folded
			//     into the column definition below.
			$sql = preg_replace( '/,\s*PRIMARY\s+KEY\s*\([^)]*\)/i', '', $sql );

			// EN: enum('a','b',...) -> TEXT. SQLite has no ENUM type.
			$sql = preg_replace( '/\benum\s*\([^)]*\)/i', 'TEXT', $sql );

			// EN: Sized integer / char types -> SQLite storage classes.
			$sql = preg_replace( '/\b(tiny|small|medium|big)?int\s*\(\s*\d+\s*\)(\s+unsigned)?/i', 'INTEGER', $sql );
			$sql = preg_replace( '/\b(tiny|small|medium|big)?int\b(\s+unsigned)?/i', 'INTEGER', $sql );
			$sql = preg_replace( '/\bvarchar\s*\(\s*\d+\s*\)/i', 'TEXT', $sql );
			$sql = preg_replace( '/\btinytext\b/i', 'TEXT', $sql );
			$sql = preg_replace( '/\bdatetime\b/i', 'TEXT', $sql );

			// EN: Make the primary-key column the ROWID alias and drop
			//     the now-meaningless auto_increment keyword everywhere.
			if ( null !== $pk_column ) {
				$sql = preg_replace(
					'/\b' . preg_quote( $pk_column, '/' ) . '\s+INTEGER[^,]*/i',
					$pk_column . ' INTEGER PRIMARY KEY AUTOINCREMENT',
					$sql,
					1
				);
			}
			$sql = preg_replace( '/\s*\bauto_increment\b/i', '', $sql );

			return $sql;
		}

		/**
		 * Translate a SELECT / INSERT / UPDATE / DELETE statement.
		 *
		 * @param string $sql MySQL-dialect DML.
		 * @return string SQLite-dialect DML.
		 */
		private static function translate_dml( $sql ) {
			// EN: 0.71 quotes string literals with double quotes in
			//     places (post_status = "publish" in blog.header.php).
			//     SQLite reads "..." as an identifier first, so convert a
			//     double-quoted literal with no embedded quote to a
			//     single-quoted literal.
			$sql = preg_replace_callback(
				'/"([^"\\\\]*)"/',
				function ( $m ) {
					return "'" . str_replace( "'", "''", $m[1] ) . "'";
				},
				$sql
			);

			// EN: MySQL date-part functions used by the archive queries
			//     (b2template.functions.php get_archives) and the feed.
			//     SQLite has strftime() instead.
			$sql = preg_replace( "/\bYEAR\s*\(\s*([^()]+?)\s*\)/i", "CAST(strftime('%Y', $1) AS INTEGER)", $sql );
			$sql = preg_replace( "/\bMONTH\s*\(\s*([^()]+?)\s*\)/i", "CAST(strftime('%m', $1) AS INTEGER)", $sql );
			$sql = preg_replace( "/\bDAYOFMONTH\s*\(\s*([^()]+?)\s*\)/i", "CAST(strftime('%d', $1) AS INTEGER)", $sql );
			$sql = preg_replace( "/\bHOUR\s*\(\s*([^()]+?)\s*\)/i", "CAST(strftime('%H', $1) AS INTEGER)", $sql );
			$sql = preg_replace( "/\bMINUTE\s*\(\s*([^()]+?)\s*\)/i", "CAST(strftime('%M', $1) AS INTEGER)", $sql );
			$sql = preg_replace( "/\bSECOND\s*\(\s*([^()]+?)\s*\)/i", "CAST(strftime('%S', $1) AS INTEGER)", $sql );
			// EN: MySQL WEEK(date,mode) / WEEK(date) -> strftime('%W').
			$sql = preg_replace( "/\bWEEK\s*\(\s*([^(),]+?)\s*(?:,\s*\d+\s*)?\)/i", "CAST(strftime('%W', $1) AS INTEGER)", $sql );

			// EN: DATE_FORMAT(col, '%Y-%m-%d') -> strftime with the same
			//     codes; 0.71 only uses %Y %m %d %h %i in DATE_FORMAT.
			$sql = preg_replace_callback(
				"/\bDATE_FORMAT\s*\(\s*([^(),]+?)\s*,\s*'([^']*)'\s*\)/i",
				function ( $m ) {
					return "strftime('" . $m[2] . "', " . $m[1] . ')';
				},
				$sql
			);

			// EN: rand() -> SQLite random() for the random-order links.
			$sql = preg_replace( '/\brand\s*\(\s*\)/i', 'random()', $sql );

			return $sql;
		}
	}
}
