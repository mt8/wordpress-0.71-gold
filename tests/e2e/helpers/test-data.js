// @ts-check
const { execFileSync } = require( 'node:child_process' );

/**
 * Test-data helpers for the WordPress 0.71-gold E2E suite.
 *
 * These helpers are deliberately NON-DESTRUCTIVE. Every row they create
 * carries an identifiable marker (the `E2E_MARKER` prefix in the title /
 * name), and teardown deletes ONLY the rows that carry that marker. The
 * developer's existing posts and categories are never touched.
 *
 * Seeding is done via SQL (`docker compose ... exec -T db mysql ...`)
 * because direct SQL is the most reliable way to put the small shared b2
 * database into a known state, independent of the legacy admin UI.
 *
 */

// Marker prefix that identifies every row created by this suite.
const E2E_MARKER = 'E2E:';

const path = require( 'node:path' );

// This helper is at tests/e2e/helpers/; the repo root is three levels up.
const REPO_ROOT = path.resolve( __dirname, '..', '..', '..' );

// The Compose file lives in tools/env/. Its in-file relative paths are
// repo-root-relative, so `docker compose` is given `--project-directory`
// pointing at the repo root -- matching how 071-env invokes Compose.
const COMPOSE_FILE = path.join( REPO_ROOT, 'tools', 'env', 'docker-compose.yml' );

// Pin the Compose project name so the helper always targets the same
// running containers, no matter which directory (or git worktree) the
// suite is invoked from. `docker compose` otherwise derives the project
// name from the working directory, which would point at a different,
// non-running project. Overridable via E2E_COMPOSE_PROJECT.
const COMPOSE_PROJECT =
	process.env.E2E_COMPOSE_PROJECT || 'wordpress-071-gold';

/**
 * Run a SQL statement against the `b2` database inside the Docker `db`
 * service and return stdout. Throws if Docker / MySQL is unreachable.
 *
 * @param {string} sql SQL statement to execute.
 * @return {string} stdout from the mysql client.
 */
function runSql( sql ) {
	const out = execFileSync(
		'docker',
		[
			'compose',
			'--project-directory',
			REPO_ROOT,
			'-p',
			COMPOSE_PROJECT,
			'-f',
			COMPOSE_FILE,
			'exec',
			'-T',
			'db',
			'mysql',
			'-uuser',
			'-ppass',
			'--silent',
			'--skip-column-names',
			'b2',
			'-e',
			sql,
		],
		{ encoding: 'utf8' }
	);
	return out.trim();
}

/**
 * Escape a string for safe inclusion inside single quotes in a SQL literal.
 *
 * @param {string} value Raw value.
 * @return {string} Escaped value.
 */
function sqlEscape( value ) {
	return String( value ).replace( /\\/g, '\\\\' ).replace( /'/g, "\\'" );
}

/**
 * Delete every post and category created by this suite (rows whose title /
 * name starts with the E2E marker). Safe to call repeatedly; it only ever
 * removes E2E-marked rows, so the developer's content is preserved.
 */
function cleanupE2EData() {
	const like = `${ E2E_MARKER }%`;
	runSql( `DELETE FROM b2posts WHERE post_title LIKE '${ sqlEscape( like ) }'` );
	// Reassign any post still pointing at an E2E category back to the
	// default category (1) before removing the categories, mirroring what
	// b2categories.php does on a category delete.
	runSql(
		`UPDATE b2posts SET post_category = 1 WHERE post_category IN ` +
			`(SELECT cat_ID FROM b2categories WHERE cat_name LIKE '${ sqlEscape( like ) }')`
	);
	runSql(
		`DELETE FROM b2categories WHERE cat_name LIKE '${ sqlEscape( like ) }' AND cat_ID <> 1`
	);
}

/**
 * Seed one category. Returns its cat_ID.
 *
 * @param {string} name Category name (the E2E marker is prefixed automatically).
 * @return {number} cat_ID of the seeded category.
 */
function seedCategory( name ) {
	const fullName = `${ E2E_MARKER } ${ name }`;
	// INSERT and SELECT LAST_INSERT_ID() must share one MySQL session --
	// LAST_INSERT_ID() is session-scoped, so they are run in a single
	// `mysql -e` invocation.
	const id = runSql(
		`INSERT INTO b2categories (cat_ID, cat_name) VALUES (0, '${ sqlEscape( fullName ) }'); ` +
			'SELECT LAST_INSERT_ID();'
	);
	return parseInt( id, 10 );
}

/**
 * Seed one published post. Returns its post ID.
 *
 * @param {Object} [options] Post fields.
 * @param {string} [options.title] Post title (E2E marker prefixed automatically).
 * @param {string} [options.content] Post body HTML.
 * @param {number} [options.category] Category ID.
 * @param {string} [options.date] post_date as 'YYYY-MM-DD HH:MM:SS'.
 * @return {number} ID of the seeded post.
 */
function seedPost( options = {} ) {
	const title = `${ E2E_MARKER } ${ options.title || 'Seeded Post' }`;
	const content = options.content || 'Seeded by the E2E suite.';
	const category = options.category || 1;
	const date = options.date || isoNow();
	// INSERT and SELECT LAST_INSERT_ID() must share one MySQL session --
	// LAST_INSERT_ID() is session-scoped, so they are run in a single
	// `mysql -e` invocation.
	const id = runSql(
		'INSERT INTO b2posts ' +
			'(ID, post_author, post_date, post_content, post_title, post_category, ' +
			'post_excerpt, post_status, comment_status, ping_status, post_password) ' +
			`VALUES (0, 1, '${ sqlEscape( date ) }', '${ sqlEscape( content ) }', ` +
			`'${ sqlEscape( title ) }', ${ parseInt( String( category ), 10 ) }, '', ` +
			"'publish', 'closed', 'closed', ''); SELECT LAST_INSERT_ID();"
	);
	return parseInt( id, 10 );
}

/**
 * Return the current local time as a MySQL DATETIME string.
 *
 * @return {string} 'YYYY-MM-DD HH:MM:SS'.
 */
function isoNow() {
	const d = new Date();
	const p = ( n ) => String( n ).padStart( 2, '0' );
	return (
		`${ d.getFullYear() }-${ p( d.getMonth() + 1 ) }-${ p( d.getDate() ) } ` +
		`${ p( d.getHours() ) }:${ p( d.getMinutes() ) }:${ p( d.getSeconds() ) }`
	);
}

/**
 * Look up a post ID by its (marker-prefixed) title. Returns null if absent.
 *
 * @param {string} title Post title WITHOUT the marker prefix.
 * @return {number|null} Post ID or null.
 */
function findPostIdByTitle( title ) {
	const full = `${ E2E_MARKER } ${ title }`;
	const out = runSql(
		`SELECT ID FROM b2posts WHERE post_title = '${ sqlEscape( full ) }' LIMIT 1`
	);
	return out ? parseInt( out, 10 ) : null;
}

/**
 * Look up a category ID by its (marker-prefixed) name. Returns null if absent.
 *
 * @param {string} name Category name WITHOUT the marker prefix.
 * @return {number|null} Category ID or null.
 */
function findCategoryIdByName( name ) {
	const full = `${ E2E_MARKER } ${ name }`;
	const out = runSql(
		`SELECT cat_ID FROM b2categories WHERE cat_name = '${ sqlEscape( full ) }' LIMIT 1`
	);
	return out ? parseInt( out, 10 ) : null;
}

module.exports = {
	E2E_MARKER,
	runSql,
	cleanupE2EData,
	seedCategory,
	seedPost,
	findPostIdByTitle,
	findCategoryIdByName,
};
