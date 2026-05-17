// Vite build config for the WordPress 0.71 custom block-editor prototype
//     (Issue #65). It bundles React and every @wordpress/* package the editor
//     uses INTO a single standalone module, so the boot page (editor.php)
//     needs no separate WordPress JavaScript runtime. The build output is
//     written into src/block-editor/assets/, which the Docker blog serves.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

/**
 * Emit `@wordpress/block-library`'s FRONT-END stylesheet as a standalone,
 *     stably named CSS file in the build output (Issue #94).
 *
 *     The editor bundle already imports the block-library styles, so layout
 *     blocks (columns, group, ...) look right INSIDE the editor. But the
 *     WordPress 0.71 front end (src/index.php) only loads layout2b.css and has
 *     no rule for `.wp-block-columns` etc., so a Columns block stored in
 *     post_content renders as unstyled stacked divs.
 *
 *     This plugin copies `@wordpress/block-library/build-style/style.css`
 *     (the front-end stylesheet -- NOT editor.css, which is editor chrome)
 *     verbatim into the build output dir as `block-library.css`, a fixed
 *     filename. A `<link>` in src/index.php points at that file, so the front
 *     end and the exported static site render layout blocks consistently.
 *
 *     A fixed name (no content hash) is used deliberately: src/index.php is a
 *     hand-written PHP file with a hard-coded path and has no manifest lookup.
 * @return {import('vite').Plugin} The Vite plugin.
 */
function emitBlockLibraryFrontEndCss() {
	// The front-end stylesheet shipped by @wordpress/block-library.
	const source = fileURLToPath(
		new URL(
			'./node_modules/@wordpress/block-library/build-style/style.css',
			import.meta.url
		)
	);

	return {
		name: 'emit-block-library-front-end-css',
		generateBundle() {
			this.emitFile( {
				type: 'asset',
				fileName: 'block-library.css',
				source: readFileSync( source, 'utf8' ),
			} );
		},
	};
}

/**
 * Repair the Safari-only `::selection` hack that the CSS minifier breaks.
 *
 *     `@wordpress/block-editor`'s content.css hides the native text-selection
 *     highlight on the block canvas with a deliberate Safari-only CSS hack:
 *
 *         _::-webkit-full-page-media, _:future,
 *         :root .block-editor-block-list__layout::selection { background: transparent }
 *
 *     The hack works because a comma-separated selector LIST is dropped in
 *     full by any browser that cannot parse one of its selectors --
 *     `_::-webkit-full-page-media` is unknown outside Safari, so Chromium and
 *     Firefox discard the whole rule and keep painting the native highlight.
 *
 *     Vite's default (esbuild) CSS minifier "optimises" that one rule into
 *     SEPARATE rules, one selector each. The standalone
 *     `:root .block-editor-block-list__layout::selection { background:
 *     transparent }` rule is then perfectly valid in Chromium / Firefox, so
 *     it applies -- and the text-selection highlight disappears inside every
 *     paragraph block (Issue #79 bug).
 *
 *     This plugin runs after minification and rejoins the split rules back
 *     into the original comma-separated list, so the hack is Safari-only
 *     again and the highlight works in Chromium / Firefox.
 * @return {import('vite').Plugin} The Vite plugin.
 */
function repairSelectionHack() {
	// The two `:root ... ::selection` rules the minifier splits out,
	//     paired with the Safari-only guard selectors they must be rejoined
	//     with. Matching the standalone rule and prefixing the guards
	//     restores the original comma-separated list.
	const guards = '_::-webkit-full-page-media,_:future,';
	const broken = [
		':root .block-editor-block-list__layout::selection{background-color:#0000}',
		':root [data-has-multi-selection=true] .block-editor-block-list__layout::selection{background-color:#0000}',
	];

	return {
		name: 'repair-wp-selection-hack',
		generateBundle( _options, bundle ) {
			for ( const asset of Object.values( bundle ) ) {
				if ( asset.type !== 'asset' || ! asset.fileName.endsWith( '.css' ) ) {
					continue;
				}
				let css = String( asset.source );
				for ( const rule of broken ) {
					// Only rejoin a rule that is NOT already guarded.
					css = css.replaceAll( rule, ( match, offset ) => {
						const before = css.slice( Math.max( 0, offset - guards.length ), offset );
						return before.endsWith( guards ) ? match : guards + match;
					} );
				}
				asset.source = css;
			}
		},
	};
}

export default defineConfig( {
	plugins: [ react(), repairSelectionHack(), emitBlockLibraryFrontEndCss() ],
	define: {
		// @wordpress/* packages branch on process.env.NODE_ENV; provide it.
		'process.env.NODE_ENV': JSON.stringify( 'production' ),
		// A few @wordpress/* modules reference a bare `global`.
		global: 'globalThis',
	},
	build: {
		// Emit into src/block-editor/assets/ so the Docker-served blog
		//     can load the bundle. This config lives in tools/block-editor/,
		//     so the assets dir is two levels up under src/.
		outDir: fileURLToPath(
			new URL( '../../src/block-editor/assets', import.meta.url )
		),
		emptyOutDir: true,
		// editor.php reads this manifest to find the hashed bundle name.
		manifest: true,
		rollupOptions: {
			input: fileURLToPath( new URL( './index.html', import.meta.url ) ),
		},
		// The @wordpress/* bundle is large; silence the size warning.
		chunkSizeWarningLimit: 4096,
	},
} );
