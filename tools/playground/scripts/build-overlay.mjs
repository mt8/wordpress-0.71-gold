// EN: 071-now overlay builder (Issue #108 feasibility spike).
//
//     The browser-based blog runs an in-php-wasm copy of WordPress 0.71.
//     That copy is built here: src/ is snapshotted into tools/playground/wp/,
//     then the 071-now SQLite database shim is overlaid on top.
//
//     src/ itself is NEVER modified -- per Issue #108, the real
//     WordPress 0.71 source and its MySQL / Docker setup must keep
//     working. The overlay only changes tools/playground/wp/, a generated,
//     git-ignored directory that exists solely for the in-browser copy.
//
//     The overlay is a single file: b2-include/wp-db.php is replaced by
//     tools/playground/db/wp-db.php, the SQLite-backed reimplementation.
//     The boot prepend (tools/playground/db/seed.php) is also copied in so
//     the php-wasm boot shim can run it.
// JA: 071-now のオーバーレイビルダー(Issue #108 実現可能性検証)。
//
//     ブラウザ内ブログは php-wasm 内の WordPress 0.71 のコピーを動かす。
//     そのコピーをここで作る: src/ を tools/playground/wp/ にスナップショット
//     し、071-now の SQLite データベースシムを上から重ねる。
//
//     src/ 自体は決して変更しない。Issue #108 に従い、本物の WordPress
//     0.71 ソースとその MySQL / Docker 構成は動き続けねばならない。
//     オーバーレイは生成物の(git 管理外の)tools/playground/wp/ だけを変える。
import {
	cpSync,
	rmSync,
	mkdirSync,
	copyFileSync,
	writeFileSync,
	readFileSync,
	existsSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// EN: This file is tools/playground/scripts/build-overlay.mjs, so the
//     playground package is one level up and the repo root is three.
// JA: 本ファイルは tools/playground/scripts/build-overlay.mjs であり、
//     playground パッケージは 1 つ上、リポジトリルートは 3 つ上である。
const here = dirname( fileURLToPath( import.meta.url ) );
const playgroundDir = join( here, '..' );
const repoRoot = join( playgroundDir, '..', '..' );

const srcDir = join( repoRoot, 'src' );
const wpDir = join( playgroundDir, 'wp' );
const dbDir = join( playgroundDir, 'db' );

if ( ! existsSync( srcDir ) ) {
	console.error( `[071-now] source not found: ${ srcDir }` );
	process.exit( 1 );
}

// EN: Fresh snapshot of the WordPress 0.71 source.
rmSync( wpDir, { recursive: true, force: true } );
mkdirSync( wpDir, { recursive: true } );
cpSync( srcDir, wpDir, { recursive: true } );

// EN: The 071-now database layer files, copied into b2-include/ so the
//     in-browser blog and the boot shim can reach them via the virtual
//     filesystem. wp-db.php replaces 0.71's mysqli-based file; the
//     others sit alongside it with a 071-now- prefix to avoid clashing
//     with any future 0.71 file name.
//       db source              -> in-browser path
const overlayFiles = [
	[ 'wp-db.php', 'wp-db.php' ],
	[ 'sql-translator.php', '071-now-sql-translator.php' ],
	[ 'seed.php', '071-now-seed.php' ],
	[ 'boot.php', '071-now-boot.php' ],
	[ 'mysqli-compat.php', '071-now-mysqli-compat.php' ],
];

for ( const [ from, to ] of overlayFiles ) {
	copyFileSync( join( dbDir, from ), join( wpDir, 'b2-include', to ) );
}

// EN: Resolve the direct mysqli_*( $wpdb->dbh, ... ) call sites.
//
//     A few WordPress 0.71 functions bypass the wpdb methods and call
//     the procedural mysqli_* built-ins directly on $wpdb->dbh, then
//     walk the result with mysqli_fetch_object() / mysqli_fetch_array()
//     / mysqli_fetch_row() / mysqli_num_rows() and read errors with
//     mysqli_error() / mysqli_errno(). Under the 071-now SQLite-backed
//     wpdb, $wpdb->dbh is a PDO -- not a mysqli handle -- so those calls
//     would fatal. The mysqli extension is compiled into php-wasm, so
//     the built-ins cannot be redeclared in userland; the call sites
//     are rewritten instead, to the 071-now mysqli compat helpers (see
//     tools/playground/db/mysqli-compat.php).
//
//     The rewrite runs only on the in-browser copy under
//     tools/playground/wp/; src/ is never touched. It is applied to
//     every file that issues a query on $wpdb->dbh -- enumerated from
//     0.71's source -- so no $wpdb->dbh path can fatal on the PDO
//     handle. b2register.php is deliberately absent: it opens its own
//     mysqli connection ($id), not $wpdb->dbh, and is not part of the
//     SQLite-backed blog.
// JA: 直接の mysqli_*( $wpdb->dbh, ... ) 呼び出し箇所を解消する。
//     一部の 0.71 関数は wpdb メソッドを介さず $wpdb->dbh に対して
//     手続き型 mysqli_* 組み込み関数を直接呼ぶ。SQLite ベースの wpdb
//     では $wpdb->dbh は PDO であり致命的エラーになる。組み込み関数は
//     再宣言できないため、呼び出し箇所を 071-now の mysqli 互換
//     ヘルパーへ書き換える。書き換えは tools/playground/wp/ のコピー
//     にのみ適用し、src/ には触れない。
const mysqliRewriteTargets = [
	'b2-include/b2functions.php',
	'b2-include/b2template.functions.php',
	'wp-admin/b2header.php',
	'wp-admin/b2sidebar.php',
	'wp-admin/b2edit.showposts.php',
	'wp-admin/b2categories.php',
	'wp-admin/linkcategories.php',
	'wp-admin/b2options.php',
	'wp-admin/b2profile.php',
	'wp-admin/linkmanager.php',
	'wp-admin/wp-install.php',
	'wp-admin/b2-2-wp.php',
];

/**
 * EN: Rewrite the direct mysqli_* call sites in one file's text to the
 *     071-now mysqli compat helpers.
 * JA: 1 ファイルのテキスト中の直接の mysqli_* 呼び出し箇所を 071-now の
 *     mysqli 互換ヘルパーへ書き換える。
 *
 * @param {string} php The PHP source of an affected file.
 * @return {string} The source with the mysqli_* sites rewritten.
 */
function rewriteMysqliCallSites( php ) {
	return (
		php
			// EN: mysqli_query( $wpdb->dbh, X ) -> wp071_db_query( X ).
			//     A leading @ (error suppression) is preserved. Only the
			//     "$wpdb->dbh," first argument is consumed; X and the
			//     closing paren are left intact.
			.replace(
				/(@?)mysqli_query\(\s*\$wpdb->dbh\s*,\s*/g,
				'$1wp071_db_query( '
			)
			// EN: mysqli_error() / mysqli_errno() on the connection handle
			//     -> wp071_db_error(). 0.71 passes either $wpdb->dbh or a
			//     parameter that holds it (linkmanager.php's $dbh).
			.replace(
				/mysqli_err(?:or|no)\(\s*\$[\w>-]+\s*\)/g,
				'wp071_db_error()'
			)
			// EN: The result-walking built-ins -> the cursor helpers. In
			//     these files every such call walks a $wpdb->dbh result.
			.replace( /mysqli_fetch_object\(/g, 'wp071_db_fetch_object(' )
			.replace( /mysqli_fetch_array\(/g, 'wp071_db_fetch_array(' )
			.replace( /mysqli_fetch_row\(/g, 'wp071_db_fetch_row(' )
			.replace( /mysqli_num_rows\(/g, 'wp071_db_num_rows(' )
	);
}

for ( const relativePath of mysqliRewriteTargets ) {
	const filePath = join( wpDir, relativePath );
	if ( ! existsSync( filePath ) ) {
		console.error( `[071-now] mysqli rewrite target missing: ${ relativePath }` );
		process.exit( 1 );
	}
	const original = readFileSync( filePath, 'utf8' );
	const rewritten = rewriteMysqliCallSites( original );
	if ( rewritten !== original ) {
		writeFileSync( filePath, rewritten );
	}
	// EN: A target that still mentions mysqli_ on $wpdb->dbh would fatal
	//     in php-wasm; fail the build so a regression is caught here.
	if ( /mysqli_\w+\(\s*\$wpdb->dbh/.test( rewritten ) ) {
		console.error(
			`[071-now] unrewritten mysqli_*( $wpdb->dbh ) call in ${ relativePath }`
		);
		process.exit( 1 );
	}
}

// EN: WordPress 0.71's front page (src/index.php) links the block-library
//     front-end stylesheet at block-editor/assets/block-library.css. That
//     file is a build artifact of the block-editor sub-project
//     (src/block-editor/app/, Issue #94) and is absent from a plain
//     checkout. Once the in-browser blog is served through the service
//     worker (Issue #116) that <link> becomes a real same-origin request,
//     so a missing file would surface as a 404 console error. The block
//     editor is a later 071-now step; the seeded post is plain text and
//     uses no layout blocks, so an empty placeholder is enough to keep the
//     stylesheet reference resolvable. The placeholder lives only in the
//     generated overlay -- src/ is untouched.
const blockLibraryCss = join(
	wpDir,
	'block-editor',
	'assets',
	'block-library.css'
);
if ( ! existsSync( blockLibraryCss ) ) {
	mkdirSync( dirname( blockLibraryCss ), { recursive: true } );
	writeFileSync(
		blockLibraryCss,
		'/* 071-now placeholder: the block-library front-end stylesheet is\n' +
			'   produced by the block-editor build (a later 071-now step). The\n' +
			'   seeded post uses no layout blocks, so this file is empty. */\n'
	);
}

console.log( '[071-now] overlay built at tools/playground/wp/' );
console.log( '[071-now]   b2-include/wp-db.php                   <- SQLite-backed wpdb' );
console.log( '[071-now]   b2-include/071-now-sql-translator.php  <- MySQL->SQLite translator' );
console.log( '[071-now]   b2-include/071-now-seed.php            <- database seed' );
console.log( '[071-now]   b2-include/071-now-boot.php            <- auto_prepend boot shim' );
console.log( '[071-now]   b2-include/071-now-mysqli-compat.php   <- mysqli compat helpers' );
console.log(
	`[071-now]   ${ mysqliRewriteTargets.length } files rewritten      <- direct mysqli_*( $wpdb->dbh ) call sites`
);
console.log( '[071-now]   block-editor/assets/block-library.css  <- placeholder (block editor is a later step)' );
