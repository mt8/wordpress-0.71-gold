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
			// An auto-increment integer primary key. SQLite makes a
			//     column an alias of ROWID only for exactly "INTEGER
			//     PRIMARY KEY", so the per-column form is collapsed to
			//     that and the table-level "PRIMARY KEY (col)" dropped.
			//     A column definition starts right after "(" or a ",", so
			//     the auto_increment column's name is the first word after
			//     the delimiter that opens the definition containing it --
			//     anchoring on the delimiter avoids capturing an earlier
			//     word such as the "CREATE" keyword.
			$pk_column = null;
			if ( preg_match( '/[(,]\s*`?(\w+)`?\s+[^,]*\bauto_increment\b/i', $sql, $m ) ) {
				$pk_column = $m[1];
			} elseif ( preg_match( '/PRIMARY\s+KEY\s*\(\s*`?(\w+)`?\s*\)/i', $sql, $m ) ) {
				$pk_column = $m[1];
			}

			// Drop MySQL KEY / UNIQUE KEY index lines -- SQLite
			//     declares indexes separately and 0.71 never relies on
			//     them at query time on the front page.
			$sql = preg_replace( '/,\s*UNIQUE\s+KEY\s*[^,)]*\([^)]*\)/i', '', $sql );
			$sql = preg_replace( '/,\s*KEY\s+\w+\s*\([^)]*\)/i', '', $sql );

			// Drop the table-level PRIMARY KEY clause; it is folded
			//     into the column definition below.
			$sql = preg_replace( '/,\s*PRIMARY\s+KEY\s*\([^)]*\)/i', '', $sql );

			// enum('a','b',...) -> TEXT. SQLite has no ENUM type.
			$sql = preg_replace( '/\benum\s*\([^)]*\)/i', 'TEXT', $sql );

			// Sized integer / char types -> SQLite storage classes.
			$sql = preg_replace( '/\b(tiny|small|medium|big)?int\s*\(\s*\d+\s*\)(\s+unsigned)?/i', 'INTEGER', $sql );
			$sql = preg_replace( '/\b(tiny|small|medium|big)?int\b(\s+unsigned)?/i', 'INTEGER', $sql );
			$sql = preg_replace( '/\bvarchar\s*\(\s*\d+\s*\)/i', 'TEXT', $sql );
			$sql = preg_replace( '/\btinytext\b/i', 'TEXT', $sql );
			$sql = preg_replace( '/\bdatetime\b/i', 'TEXT', $sql );

			// Make the primary-key column the ROWID alias and drop
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
			// 0.71 quotes string literals with double quotes in
			//     places (post_status = "publish" in blog.header.php, the
			//     post_date in b2edit.php's editpost UPDATE). SQLite reads
			//     "..." as an identifier first, so convert a double-quoted
			//     literal with no embedded quote to a single-quoted literal.
			//
			//     This must run OUTSIDE single-quoted string literals only:
			//     a value being written can itself contain double quotes --
			//     a block-editor post body with an image block holds
			//     `<img src="...">` -- and converting those to single quotes
			//     would terminate the surrounding '...' value early and
			//     break the statement (Issue #203). apply_outside_strings()
			//     skips the '...' literals.
			$sql = self::apply_outside_strings(
				$sql,
				function ( $segment ) {
					return preg_replace_callback(
						'/"([^"\\\\]*)"/',
						function ( $m ) {
							return "'" . str_replace( "'", "''", $m[1] ) . "'";
						},
						$segment
					);
				}
			);

			// A MySQL auto_increment column treats an explicit 0 (or
			//     '0') as "assign the next id"; SQLite stores 0 verbatim
			//     into an INTEGER PRIMARY KEY, so a second such INSERT
			//     collides. The 0.71 admin INSERTs a post / category that
			//     way -- b2edit.php "INSERT INTO b2posts (ID, ...) VALUES
			//     ('0', ...)" and b2categories.php "INSERT INTO
			//     b2categories (cat_ID, cat_name) VALUES ('0', ...)".
			//     Drop the leading id column and its 0 value so the
			//     AUTOINCREMENT primary key assigns the id, matching MySQL.
			if ( preg_match( '/^\s*INSERT\b/i', $sql ) ) {
				$sql = self::strip_zero_autoincrement_id( $sql );
			}

			// The archive queries select bare date-part expressions --
			//     SELECT DISTINCT YEAR(post_date), MONTH(post_date) ... --
			//     and b2edit.showposts.php reads the result by the MySQL
			//     column name ($arc_row['YEAR(post_date)']). SQLite would
			//     name the column after the translated strftime() text, so
			//     the lookup would miss. Give every such expression an
			//     explicit alias of its MySQL spelling; the alias survives
			//     the function rewrite and keeps the column's MySQL name.
			$sql = self::alias_date_part_columns( $sql );

			// DATE_FORMAT(col, 'fmt') is rewritten before the
			//     outside-string-literals pass below. Its format argument
			//     is itself a string literal -- the links query emits
			//     DATE_FORMAT(link_updated, '%d/%m/%Y %h:%i') -- so
			//     apply_outside_strings() would split the call across a
			//     non-literal and a literal segment and the per-segment
			//     rewrite could never match the whole call. The call,
			//     literal argument included, is therefore matched here as
			//     one unit; the resulting strftime('fmt', col) literal is
			//     left for the outside-string pass to skip over.
			$sql = self::translate_date_format( $sql );

			// Rewrite the remaining date functions only outside string
			//     literals -- the alias added above is a quoted literal that
			//     itself spells "YEAR(post_date)", and the rewrite must not
			//     touch it.
			$sql = self::apply_outside_strings( $sql, array( __CLASS__, 'translate_date_functions' ) );

			// rand() -> SQLite random() for the random-order links.
			$sql = preg_replace( '/\brand\s*\(\s*\)/i', 'random()', $sql );

			return $sql;
		}

		/**
		 * Apply a transformation to the parts of an SQL string that lie
		 * outside single-quoted string literals.
		 *
		 * The date-function and rand() rewrites must not reach into a
		 * quoted literal (a post body, or the date-part column aliases
		 * added by alias_date_part_columns(), which spell "YEAR(...)").
		 * The string is split on '...' literals (SQLite escapes a quote by
		 * doubling it) and the callback runs on the non-literal segments.
		 *
		 * @param string   $sql      SQL possibly containing string literals.
		 * @param callable $callback Transformation for a non-literal segment.
		 * @return string The SQL with the callback applied outside literals.
		 */
		private static function apply_outside_strings( $sql, $callback ) {
			// Split keeping the delimiters: a '...' literal (with ''
			//     escapes) is an odd-indexed piece, code is even-indexed.
			$parts = preg_split(
				"/('(?:[^']|'')*')/",
				$sql,
				-1,
				PREG_SPLIT_DELIM_CAPTURE
			);
			$out   = '';
			foreach ( $parts as $i => $part ) {
				$out .= ( 0 === $i % 2 ) ? call_user_func( $callback, $part ) : $part;
			}
			return $out;
		}

		/**
		 * Drop a leading auto-increment id column whose value is 0.
		 *
		 * Rewrites "INSERT INTO t (id, a, b) VALUES (0, x, y)" to
		 * "INSERT INTO t (a, b) VALUES (x, y)" when the first inserted
		 * value is 0 or '0'. Only the first column/value pair is removed;
		 * any other column is untouched.
		 *
		 * @param string $sql A MySQL INSERT statement.
		 * @return string The INSERT with a zero id column dropped, if any.
		 */
		private static function strip_zero_autoincrement_id( $sql ) {
			// Match "(col1, col2, ...) VALUES (v1, v2, ...)" where v1
			//     is 0 / '0' / "0". The column list and value list are
			//     captured so the first entry of each can be dropped.
			$pattern = '/\(\s*([^()]+?)\s*\)\s*VALUES\s*\(\s*(?:\'0\'|"0"|0)\s*,\s*([^()]*)\)/i';
			return preg_replace_callback(
				$pattern,
				function ( $m ) {
					$columns = array_map( 'trim', explode( ',', $m[1] ) );
					// Drop the first column; keep the rest verbatim.
					array_shift( $columns );
					return '(' . implode( ', ', $columns ) . ') VALUES (' . $m[2] . ')';
				},
				$sql,
				1
			);
		}

		/**
		 * Alias bare date-part expressions to their MySQL column name.
		 *
		 * In a SELECT list, an unaliased YEAR(post_date) becomes a SQLite
		 * column named after the strftime() rewrite. The admin archive
		 * code (b2edit.showposts.php) reads the row by the MySQL name, so
		 * each such expression is given an explicit alias of its MySQL
		 * spelling before the function rewrite runs.
		 *
		 * @param string $sql A MySQL SELECT statement.
		 * @return string The SELECT with date-part columns aliased.
		 */
		private static function alias_date_part_columns( $sql ) {
			$functions = 'YEAR|MONTH|DAYOFMONTH|HOUR|MINUTE|SECOND|WEEK';
			// A date-part call that is immediately followed by a comma
			//     or by FROM is a SELECT-list column. One that is followed
			//     by "AS" already has an alias; one inside a WHERE / ORDER
			//     BY is followed by an operator and is left alone.
			return preg_replace_callback(
				'/\b(' . $functions . ')\s*\(\s*([^(),]+?)\s*(?:,\s*\d+\s*)?\)(?=\s*(?:,|FROM\b))/i',
				function ( $m ) {
					$expr  = $m[0];
					$alias = strtoupper( $m[1] ) . '(' . trim( $m[2] ) . ')';
					return $expr . " AS '" . $alias . "'";
				},
				$sql
			);
		}

		/**
		 * Rewrite MySQL date functions to their SQLite strftime() form.
		 *
		 * Used by the archive queries (b2edit.showposts.php,
		 * b2template.functions.php get_archives) and the post feed.
		 * DATE_FORMAT() is handled separately by translate_date_format(),
		 * which runs before the outside-string-literals split because its
		 * format argument is itself a string literal.
		 *
		 * @param string $sql MySQL-dialect SQL.
		 * @return string SQL with date functions in SQLite form.
		 */
		private static function translate_date_functions( $sql ) {
			$sql = preg_replace( "/\bYEAR\s*\(\s*([^()]+?)\s*\)/i", "CAST(strftime('%Y', $1) AS INTEGER)", $sql );
			$sql = preg_replace( "/\bMONTH\s*\(\s*([^()]+?)\s*\)/i", "CAST(strftime('%m', $1) AS INTEGER)", $sql );
			$sql = preg_replace( "/\bDAYOFMONTH\s*\(\s*([^()]+?)\s*\)/i", "CAST(strftime('%d', $1) AS INTEGER)", $sql );
			$sql = preg_replace( "/\bHOUR\s*\(\s*([^()]+?)\s*\)/i", "CAST(strftime('%H', $1) AS INTEGER)", $sql );
			$sql = preg_replace( "/\bMINUTE\s*\(\s*([^()]+?)\s*\)/i", "CAST(strftime('%M', $1) AS INTEGER)", $sql );
			$sql = preg_replace( "/\bSECOND\s*\(\s*([^()]+?)\s*\)/i", "CAST(strftime('%S', $1) AS INTEGER)", $sql );
			// MySQL WEEK(date,mode) / WEEK(date) -> strftime('%W').
			$sql = preg_replace( "/\bWEEK\s*\(\s*([^(),]+?)\s*(?:,\s*\d+\s*)?\)/i", "CAST(strftime('%W', $1) AS INTEGER)", $sql );

			return $sql;
		}

		/**
		 * Rewrite MySQL DATE_FORMAT(col, 'fmt') to SQLite strftime().
		 *
		 * The whole call -- the column expression and the string-literal
		 * format argument -- is matched as one unit. This must run before
		 * apply_outside_strings() splits the SQL on string literals: the
		 * format argument is a literal, so a per-segment rewrite would see
		 * the call broken across a non-literal and a literal segment and
		 * never match it (this is why the links query's
		 * DATE_FORMAT(link_updated, '%d/%m/%Y %h:%i') was left untranslated
		 * and SQLite raised "no such function: DATE_FORMAT"). The archive
		 * queries' YEAR()/MONTH() take no string argument, so they are
		 * unaffected and stay with translate_date_functions().
		 *
		 * SQLite's strftime() and MySQL's DATE_FORMAT() share many specifier
		 * letters but not all, so the format string is mapped, not copied
		 * verbatim -- otherwise the date would render wrong (e.g. minutes
		 * shown as the month). The 0.71 source emits only the specifiers
		 * mapped below: wp-links/links.php uses '%d/%m/%Y %h:%i' and
		 * b2template.functions.php get_archives uses '%Y-%m-%d'.
		 *
		 * @param string $sql MySQL-dialect SQL.
		 * @return string SQL with DATE_FORMAT() rewritten to strftime().
		 */
		private static function translate_date_format( $sql ) {
			return preg_replace_callback(
				"/\bDATE_FORMAT\s*\(\s*([^(),']+?)\s*,\s*'([^']*)'\s*\)/i",
				function ( $m ) {
					return "strftime('" . self::map_date_format( $m[2] ) . "', " . trim( $m[1] ) . ')';
				},
				$sql
			);
		}

		/**
		 * Map a MySQL DATE_FORMAT() format string to SQLite strftime().
		 *
		 * MySQL and SQLite spell several specifiers differently:
		 *
		 *   - MySQL %i (minutes) is %M in SQLite; MySQL %M is the month
		 *     name, so a verbatim copy would render minutes as a month.
		 *   - MySQL %h (12-hour hour) has no SQLite equivalent -- SQLite's
		 *     %H is the 24-hour hour, the closest match, and is used here.
		 *   - MySQL %s (seconds) is %S in SQLite.
		 *   - MySQL %Y %m %d (year / month / day) match SQLite letter for
		 *     letter and are passed through.
		 *
		 * A literal "%%" is preserved. Any specifier the 0.71 source does
		 * not emit is left untouched -- the table covers exactly what 0.71
		 * passes to DATE_FORMAT() ('%d/%m/%Y %h:%i' and '%Y-%m-%d').
		 *
		 * @param string $format A MySQL DATE_FORMAT() format string.
		 * @return string The equivalent SQLite strftime() format string.
		 */
		private static function map_date_format( $format ) {
			$map = array(
				'%%' => '%%',
				'%Y' => '%Y',
				'%m' => '%m',
				'%d' => '%d',
				'%H' => '%H',
				'%h' => '%H',
				'%i' => '%M',
				'%s' => '%S',
				'%j' => '%j',
				'%w' => '%w',
			);
			return preg_replace_callback(
				'/%./',
				function ( $m ) use ( $map ) {
					return isset( $map[ $m[0] ] ) ? $map[ $m[0] ] : $m[0];
				},
				$format
			);
		}
	}
}
