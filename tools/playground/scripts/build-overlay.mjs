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
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';

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

// EN: Build the block-editor app so its bundle lands in the overlay.
//
//     The block editor (src/block-editor/) is a custom @wordpress/
//     block-editor app over a thin WordPress 0.71 JSON backend. Its
//     React app, src/block-editor/app/, is a self-contained package
//     with its own package.json and package-lock.json -- deliberately
//     not a repo-root workspace -- and `npm run build` there writes the
//     bundle and the Vite manifest to src/block-editor/assets/, a
//     git-ignored build artifact. src/block-editor/api/editor.php reads
//     that manifest to serve the editor; without the bundle it shows a
//     "Block editor bundle not built" fallback.
//
//     The playground overlay is a snapshot of src/, so the block editor
//     works in the playground only if src/block-editor/assets/ exists
//     when the snapshot is taken. This builds the app here, before the
//     snapshot below, so the overlay always carries a fresh bundle. The
//     build writes only into src/block-editor/assets/ (git-ignored); src/
//     itself is otherwise untouched, exactly as the overlay contract
//     requires.
// JA: ブロックエディタアプリをビルドし、そのバンドルをオーバーレイへ
//     入れる。
//
//     ブロックエディタ(src/block-editor/)は、薄い WordPress 0.71 の
//     JSON バックエンド上のカスタム @wordpress/block-editor アプリで
//     ある。その React アプリ src/block-editor/app/ は独自の
//     package.json と package-lock.json を持つ自己完結したパッケージ
//     であり(意図的にリポジトリルートのワークスペースにしていない)、
//     そこで `npm run build` するとバンドルと Vite マニフェストが
//     src/block-editor/assets/(git 管理外のビルド成果物)へ書き出される。
//     src/block-editor/api/editor.php はそのマニフェストを読んでエディタ
//     を配信する。バンドルが無いと「Block editor bundle not built」
//     フォールバックを表示する。
//
//     playground のオーバーレイは src/ のスナップショットなので、
//     スナップショット取得時に src/block-editor/assets/ が存在して
//     初めてブロックエディタが playground で動く。スナップショットの前に
//     ここでアプリをビルドし、オーバーレイが常に新しいバンドルを持つ
//     ようにする。ビルドは src/block-editor/assets/(git 管理外)にのみ
//     書き込み、src/ 自体はそれ以外変更しない。
const blockEditorAppDir = join( srcDir, 'block-editor', 'app' );
const blockEditorAssetsDir = join( srcDir, 'block-editor', 'assets' );

/**
 * EN: Run a command in a directory, inheriting stdio, and exit the build
 *     on failure.
 * JA: ディレクトリ内でコマンドを実行し、stdio を継承し、失敗時はビルドを
 *     終了する。
 *
 * @param {string}   command The executable to run.
 * @param {string[]} args    Its arguments.
 * @param {string}   cwd     The working directory.
 * @param {string}   label   A human-readable label for the error message.
 */
function run( command, args, cwd, label ) {
	const result = spawnSync( command, args, {
		cwd,
		stdio: 'inherit',
		// EN: npm is a .cmd shim on Windows; a shell run resolves it.
		shell: process.platform === 'win32',
	} );
	if ( result.status !== 0 ) {
		console.error( `[071-now] ${ label } failed` );
		process.exit( 1 );
	}
}

if ( ! existsSync( join( blockEditorAppDir, 'node_modules' ) ) ) {
	console.log( '[071-now] installing block-editor app dependencies…' );
	run( 'npm', [ 'install' ], blockEditorAppDir, 'block-editor npm install' );
}

console.log( '[071-now] building the block-editor app…' );
run( 'npm', [ 'run', 'build' ], blockEditorAppDir, 'block-editor npm run build' );

if ( ! existsSync( join( blockEditorAssetsDir, '.vite', 'manifest.json' ) ) ) {
	console.error(
		'[071-now] block-editor build produced no manifest at ' +
			'src/block-editor/assets/.vite/manifest.json'
	);
	process.exit( 1 );
}

// EN: Fresh snapshot of the WordPress 0.71 source.
//
//     The block editor's build inputs are excluded from the snapshot:
//     src/block-editor/app/ holds the React source, its node_modules
//     (~450 MB) and the Vite config -- build inputs the in-browser blog
//     never serves. Only src/block-editor/assets/, the build OUTPUT
//     produced just above, belongs in the overlay (editor.php loads it).
//     Skipping app/ keeps the overlay -- and the import.meta.glob bundle
//     that inlines wp/ into the playground app -- from ballooning by
//     hundreds of megabytes of dependency trees.
// JA: WordPress 0.71 ソースの新規スナップショット。
//
//     ブロックエディタのビルド入力はスナップショットから除外する。
//     src/block-editor/app/ は React ソース・その node_modules(約 450 MB)
//     ・Vite 設定 -- ブラウザ内ブログが配信しないビルド入力 -- を持つ。
//     オーバーレイに属するのは直前にビルドした出力 src/block-editor/
//     assets/ だけ(editor.php がそれを読み込む)。app/ を飛ばすことで、
//     オーバーレイ(と wp/ を playground アプリへインライン化する
//     import.meta.glob バンドル)が依存ツリーで肥大化するのを防ぐ。
const blockEditorAppMarker =
	join( srcDir, 'block-editor', 'app' ) + sep;
rmSync( wpDir, { recursive: true, force: true } );
mkdirSync( wpDir, { recursive: true } );
cpSync( srcDir, wpDir, {
	recursive: true,
	filter: ( source ) =>
		source !== join( srcDir, 'block-editor', 'app' ) &&
		! source.startsWith( blockEditorAppMarker ),
} );

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
//     front-end stylesheet at block-editor/assets/block-library.css, and
//     src/block-editor/api/editor.php loads the block-editor bundle from
//     block-editor/assets/. Both files are build artifacts of the
//     block-editor app, produced by the `npm run build` run above into
//     src/block-editor/assets/ and carried into the overlay by the
//     snapshot. Earlier 071-now builds wrote an empty block-library.css
//     placeholder here because the block editor was a later step; now the
//     real bundle is in place, so only assert it -- a missing file would
//     mean the block-editor build silently produced nothing.
// JA: WordPress 0.71 のフロントページ(src/index.php)は
//     block-editor/assets/block-library.css にブロックライブラリの
//     フロント用スタイルシートを link し、src/block-editor/api/editor.php
//     は block-editor/assets/ からブロックエディタバンドルを読み込む。
//     どちらも上の `npm run build` が src/block-editor/assets/ へ生成し、
//     スナップショットがオーバーレイへ運んだビルド成果物である。以前の
//     071-now ビルドはブロックエディタが後工程だったため空の
//     block-library.css プレースホルダをここに書いていたが、今は実
//     バンドルが揃っているので存在確認のみ行う。
const blockLibraryCss = join(
	wpDir,
	'block-editor',
	'assets',
	'block-library.css'
);
const blockEditorManifest = join(
	wpDir,
	'block-editor',
	'assets',
	'.vite',
	'manifest.json'
);
for ( const required of [ blockLibraryCss, blockEditorManifest ] ) {
	if ( ! existsSync( required ) ) {
		console.error(
			`[071-now] block-editor asset missing from the overlay: ${ required }`
		);
		process.exit( 1 );
	}
}

// EN: Relocate the Vite manifest out of the dot-directory and point the
//     overlay's editor.php at the new location.
//
//     Vite writes its build manifest to block-editor/assets/.vite/
//     manifest.json, and src/block-editor/api/editor.php reads it from
//     there. But the playground writes the whole wp/ tree into the
//     php-wasm filesystem via an import.meta.glob of wp/ in
//     src/wp-files.js, and Vite's import.meta.glob does NOT match files
//     inside a dot-directory -- so .vite/manifest.json would never reach
//     the in-browser blog and editor.php would fall back to its "bundle
//     not built" page even though the bundle is right there.
//
//     The manifest is copied to a sibling non-dot path
//     (block-editor/assets/vite-manifest.json), which the glob does pick
//     up, and the overlay's editor.php is rewritten to read that path.
//     This is the same overlay-only patching as the mysqli rewrite
//     above: the change touches tools/playground/wp/ only -- src/ and the
//     block editor's own assets/ are left exactly as built.
// JA: Vite マニフェストをドットディレクトリの外へ移し、オーバーレイの
//     editor.php をその新しい場所に向ける。
//
//     Vite はビルドマニフェストを block-editor/assets/.vite/
//     manifest.json へ書き、src/block-editor/api/editor.php はそこから
//     読む。しかし playground は wp/ ツリー全体を src/wp-files.js の
//     wp/ に対する import.meta.glob で php-wasm ファイルシステムへ書き、
//     Vite の import.meta.glob はドットディレクトリ内のファイルに一致
//     しない。よって .vite/manifest.json はブラウザ内ブログへ届かず、
//     バンドルが揃っていても editor.php は「bundle not built」へ
//     フォールバックしてしまう。
//
//     マニフェストを非ドットの兄弟パス
//     (block-editor/assets/vite-manifest.json)へコピーし、グロブが
//     拾えるようにし、オーバーレイの editor.php をそのパスを読むよう
//     書き換える。これは上の mysqli 書き換えと同じオーバーレイ限定の
//     パッチであり、tools/playground/wp/ のみを変更する。
const flatManifest = join(
	wpDir,
	'block-editor',
	'assets',
	'vite-manifest.json'
);
copyFileSync( blockEditorManifest, flatManifest );

const editorPhpPath = join( wpDir, 'block-editor', 'api', 'editor.php' );
const editorPhp = readFileSync( editorPhpPath, 'utf8' );
const patchedEditorPhp = editorPhp.replaceAll(
	'/.vite/manifest.json',
	'/vite-manifest.json'
);
if ( patchedEditorPhp === editorPhp ) {
	console.error(
		'[071-now] editor.php had no .vite/manifest.json reference to rewrite'
	);
	process.exit( 1 );
}
writeFileSync( editorPhpPath, patchedEditorPhp );

console.log( '[071-now] overlay built at tools/playground/wp/' );
console.log( '[071-now]   b2-include/wp-db.php                   <- SQLite-backed wpdb' );
console.log( '[071-now]   b2-include/071-now-sql-translator.php  <- MySQL->SQLite translator' );
console.log( '[071-now]   b2-include/071-now-seed.php            <- database seed' );
console.log( '[071-now]   b2-include/071-now-boot.php            <- auto_prepend boot shim' );
console.log( '[071-now]   b2-include/071-now-mysqli-compat.php   <- mysqli compat helpers' );
console.log(
	`[071-now]   ${ mysqliRewriteTargets.length } files rewritten      <- direct mysqli_*( $wpdb->dbh ) call sites`
);
console.log( '[071-now]   block-editor/assets/                   <- built block-editor bundle + Vite manifest' );
console.log( '[071-now]   block-editor/api/editor.php            <- manifest path rewritten off the .vite/ dot-directory' );
