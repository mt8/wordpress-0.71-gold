// @ts-check
const { execFileSync } = require( 'node:child_process' );

/**
 * EN: Test-data helpers for the WordPress 0.71-gold E2E suite.
 *
 *     These helpers are deliberately NON-DESTRUCTIVE. Every row they create
 *     carries an identifiable marker (the `E2E_MARKER` prefix in the title /
 *     name), and teardown deletes ONLY the rows that carry that marker. The
 *     developer's existing posts and categories are never touched.
 *
 *     Seeding is done via SQL (`docker compose exec -T db mysql ...`) because
 *     direct SQL is the most reliable way to put the small shared b2 database
 *     into a known state, independent of the legacy admin UI.
 *
 * JA: WordPress 0.71-gold E2E スイート用のテストデータヘルパー。
 *
 *     これらのヘルパーは意図的に「非破壊」である。作成する行はすべて識別可能な
 *     マーカー (タイトル/名前の `E2E_MARKER` 接頭辞) を持ち、後始末はその
 *     マーカーを持つ行のみを削除する。開発者の既存の投稿・カテゴリには一切
 *     触れない。
 *
 *     データ投入は SQL (`docker compose exec -T db mysql ...`) で行う。
 *     レガシーな管理 UI に依存せず、小さな共有 b2 データベースを既知の状態に
 *     置く最も確実な方法だからである。
 */

// EN: Marker prefix that identifies every row created by this suite.
// JA: 本スイートが作成した行を識別するマーカー接頭辞。
const E2E_MARKER = 'E2E:';

const path = require( 'node:path' );

// EN: docker-compose.yml lives at the repo root; helpers are two levels below.
// JA: docker-compose.yml はリポジトリ直下。ヘルパーはその 2 階層下にある。
const COMPOSE_FILE = path.resolve( __dirname, '..', '..', 'docker-compose.yml' );

// EN: Pin the Compose project name so the helper always targets the same
//     running containers, no matter which directory (or git worktree) the
//     suite is invoked from. `docker compose` otherwise derives the project
//     name from the working directory, which would point at a different,
//     non-running project. Overridable via E2E_COMPOSE_PROJECT.
// JA: Compose のプロジェクト名を固定し、スイートをどのディレクトリ (どの git
//     ワークツリー) から起動しても常に同じ稼働中コンテナを対象にする。
//     さもなくば `docker compose` は作業ディレクトリからプロジェクト名を導出し、
//     別の (稼働していない) プロジェクトを指してしまう。E2E_COMPOSE_PROJECT
//     で上書き可能。
const COMPOSE_PROJECT =
	process.env.E2E_COMPOSE_PROJECT || 'wordpress-071-gold';

/**
 * EN: Run a SQL statement against the `b2` database inside the Docker `db`
 *     service and return stdout. Throws if Docker / MySQL is unreachable.
 * JA: Docker の `db` サービス内の `b2` データベースに対し SQL を実行し、
 *     標準出力を返す。Docker / MySQL に到達できない場合は例外を投げる。
 *
 * @param {string} sql SQL statement to execute. / 実行する SQL 文。
 * @return {string} stdout from the mysql client. / mysql クライアントの標準出力。
 */
function runSql( sql ) {
	const out = execFileSync(
		'docker',
		[
			'compose',
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
 * EN: Escape a string for safe inclusion inside single quotes in a SQL literal.
 * JA: SQL リテラルのシングルクォート内に安全に入れるため文字列をエスケープする。
 *
 * @param {string} value Raw value. / 生の値。
 * @return {string} Escaped value. / エスケープ済みの値。
 */
function sqlEscape( value ) {
	return String( value ).replace( /\\/g, '\\\\' ).replace( /'/g, "\\'" );
}

/**
 * EN: Delete every post and category created by this suite (rows whose title /
 *     name starts with the E2E marker). Safe to call repeatedly; it only ever
 *     removes E2E-marked rows, so the developer's content is preserved.
 * JA: 本スイートが作成したすべての投稿・カテゴリ (タイトル/名前が E2E マーカー
 *     で始まる行) を削除する。繰り返し呼んでも安全で、E2E マーカー付きの行のみ
 *     を削除するため、開発者のコンテンツは保持される。
 */
function cleanupE2EData() {
	const like = `${ E2E_MARKER }%`;
	runSql( `DELETE FROM b2posts WHERE post_title LIKE '${ sqlEscape( like ) }'` );
	// EN: Reassign any post still pointing at an E2E category back to the
	//     default category (1) before removing the categories, mirroring what
	//     b2categories.php does on a category delete.
	// JA: カテゴリ削除前に、E2E カテゴリを指す投稿を既定カテゴリ (1) へ戻す。
	//     b2categories.php のカテゴリ削除時の挙動に合わせる。
	runSql(
		`UPDATE b2posts SET post_category = 1 WHERE post_category IN ` +
			`(SELECT cat_ID FROM b2categories WHERE cat_name LIKE '${ sqlEscape( like ) }')`
	);
	runSql(
		`DELETE FROM b2categories WHERE cat_name LIKE '${ sqlEscape( like ) }' AND cat_ID <> 1`
	);
}

/**
 * EN: Seed one category. Returns its cat_ID.
 * JA: カテゴリを 1 件投入し、その cat_ID を返す。
 *
 * @param {string} name Category name (the E2E marker is prefixed automatically).
 *                       / カテゴリ名 (E2E マーカーは自動付与)。
 * @return {number} cat_ID of the seeded category. / 投入したカテゴリの cat_ID。
 */
function seedCategory( name ) {
	const fullName = `${ E2E_MARKER } ${ name }`;
	// EN: INSERT and SELECT LAST_INSERT_ID() must share one MySQL session --
	//     LAST_INSERT_ID() is session-scoped, so they are run in a single
	//     `mysql -e` invocation.
	// JA: INSERT と SELECT LAST_INSERT_ID() は同一 MySQL セッションで実行する
	//     必要がある。LAST_INSERT_ID() はセッションスコープのため、1 回の
	//     `mysql -e` 呼び出しにまとめる。
	const id = runSql(
		`INSERT INTO b2categories (cat_ID, cat_name) VALUES (0, '${ sqlEscape( fullName ) }'); ` +
			'SELECT LAST_INSERT_ID();'
	);
	return parseInt( id, 10 );
}

/**
 * EN: Seed one published post. Returns its post ID.
 * JA: 公開済みの投稿を 1 件投入し、その投稿 ID を返す。
 *
 * @param {Object} [options] Post fields. / 投稿のフィールド。
 * @param {string} [options.title] Post title (E2E marker prefixed automatically).
 *                                  / 投稿タイトル (E2E マーカーは自動付与)。
 * @param {string} [options.content] Post body HTML. / 投稿本文 HTML。
 * @param {number} [options.category] Category ID. / カテゴリ ID。
 * @param {string} [options.date] post_date as 'YYYY-MM-DD HH:MM:SS'.
 *                                 / 'YYYY-MM-DD HH:MM:SS' 形式の post_date。
 * @return {number} ID of the seeded post. / 投入した投稿の ID。
 */
function seedPost( options = {} ) {
	const title = `${ E2E_MARKER } ${ options.title || 'Seeded Post' }`;
	const content = options.content || 'Seeded by the E2E suite.';
	const category = options.category || 1;
	const date = options.date || isoNow();
	// EN: INSERT and SELECT LAST_INSERT_ID() must share one MySQL session --
	//     LAST_INSERT_ID() is session-scoped, so they are run in a single
	//     `mysql -e` invocation.
	// JA: INSERT と SELECT LAST_INSERT_ID() は同一 MySQL セッションで実行する
	//     必要がある。LAST_INSERT_ID() はセッションスコープのため、1 回の
	//     `mysql -e` 呼び出しにまとめる。
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
 * EN: Return the current local time as a MySQL DATETIME string.
 * JA: 現在のローカル時刻を MySQL の DATETIME 文字列で返す。
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
 * EN: Look up a post ID by its (marker-prefixed) title. Returns null if absent.
 * JA: (マーカー付き) タイトルから投稿 ID を引く。無ければ null を返す。
 *
 * @param {string} title Post title WITHOUT the marker prefix.
 *                        / マーカー接頭辞を含まない投稿タイトル。
 * @return {number|null} Post ID or null. / 投稿 ID または null。
 */
function findPostIdByTitle( title ) {
	const full = `${ E2E_MARKER } ${ title }`;
	const out = runSql(
		`SELECT ID FROM b2posts WHERE post_title = '${ sqlEscape( full ) }' LIMIT 1`
	);
	return out ? parseInt( out, 10 ) : null;
}

/**
 * EN: Look up a category ID by its (marker-prefixed) name. Returns null if absent.
 * JA: (マーカー付き) 名前からカテゴリ ID を引く。無ければ null を返す。
 *
 * @param {string} name Category name WITHOUT the marker prefix.
 *                       / マーカー接頭辞を含まないカテゴリ名。
 * @return {number|null} Category ID or null. / カテゴリ ID または null。
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
