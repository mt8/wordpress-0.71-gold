// EN: Build-time bundle of the overlaid WordPress 0.71 tree.
//
//     Vite's import.meta.glob pulls every file under tools/playground/wp/ into
//     the JavaScript bundle as raw bytes, keyed by path. The browser app
//     writes each entry into the php-wasm virtual filesystem at boot.
//     tools/playground/wp/ is produced by scripts/build-overlay.mjs: a fresh
//     snapshot of src/ with the 071-now SQLite database shim overlaid.
//     src/ itself is never touched.
// JA: オーバーレイ済み WordPress 0.71 ツリーのビルド時バンドル。
//
//     Vite の import.meta.glob が tools/playground/wp/ 配下の全ファイルを生の
//     バイト列として JavaScript バンドルへ取り込み、パスをキーにする。
//     ブラウザアプリは起動時に各エントリを php-wasm 仮想ファイルシステム
//     へ書き込む。tools/playground/wp/ は scripts/build-overlay.mjs が生成する。

// EN: `query: '?raw'` + `import: 'default'` yields the file contents as a
//     string; `eager: true` inlines them so no async import is needed at
//     boot. Binary assets (GIF/PNG under b2-img) are not needed to render
//     the front-page text, so a text glob is sufficient for the spike.
const modules = import.meta.glob( '../wp/**/*', {
	query: '?raw',
	import: 'default',
	eager: true,
} );

/**
 * EN: Map of in-VFS relative path -> file contents for the WordPress
 *     0.71 tree. Paths are relative to the document root (no leading
 *     slash), e.g. "index.php", "b2-include/wp-db.php".
 * JA: WordPress 0.71 ツリーの「VFS 内相対パス -> ファイル内容」のマップ。
 */
export const wpFiles = Object.fromEntries(
	Object.entries( modules ).map( ( [ path, contents ] ) => [
		path.replace( /^\.\.\/wp\//, '' ),
		contents,
	] )
);
