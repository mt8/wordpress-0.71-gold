// EN: Vite build config for the WordPress 0.71 custom block-editor prototype
//     (Issue #65). It bundles React and every @wordpress/* package the editor
//     uses INTO a single standalone module, so the boot page (editor.php)
//     needs no separate WordPress JavaScript runtime. The build output is
//     written into src/block-editor-assets/, which the Docker blog serves.
// JA: WordPress 0.71 カスタムブロックエディタ試作(Issue #65)向けの Vite
//     ビルド設定。React とエディタが使う全 @wordpress/* パッケージを 1 つの
//     スタンドアロンモジュールへバンドルするため、起動ページ(editor.php)
//     は別の WordPress JavaScript ランタイムを必要としない。ビルド成果物は
//     Docker のブログが配信する src/block-editor-assets/ へ書き出す。
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig( {
	plugins: [ react() ],
	define: {
		// EN: @wordpress/* packages branch on process.env.NODE_ENV; provide it.
		// JA: @wordpress/* は process.env.NODE_ENV で分岐するため供給する。
		'process.env.NODE_ENV': JSON.stringify( 'production' ),
		// EN: A few @wordpress/* modules reference a bare `global`.
		// JA: 一部の @wordpress/* モジュールは裸の `global` を参照する。
		global: 'globalThis',
	},
	build: {
		// EN: Emit into src/ so the Docker-served blog can load the bundle.
		// JA: Docker が配信するブログがバンドルを読めるよう src/ へ出力する。
		outDir: fileURLToPath( new URL( '../src/block-editor-assets', import.meta.url ) ),
		emptyOutDir: true,
		// EN: editor.php reads this manifest to find the hashed bundle name.
		// JA: editor.php はこのマニフェストからハッシュ付きバンドル名を得る。
		manifest: true,
		rollupOptions: {
			input: fileURLToPath( new URL( './index.html', import.meta.url ) ),
		},
		// EN: The @wordpress/* bundle is large; silence the size warning.
		// JA: @wordpress/* のバンドルは大きい。サイズ警告を抑制する。
		chunkSizeWarningLimit: 4096,
	},
} );
