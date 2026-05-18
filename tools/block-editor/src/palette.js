/**
 * The WordPress 0.71 block editor's colour palette and the preset CSS
 *     generated from it (Issue #181).
 *
 *     This module is the single source of truth for the editor's colour
 *     presets. It is imported by Editor.jsx -- which feeds the palette to
 *     BlockEditorProvider -- and by vite.config.js, which emits the preset
 *     stylesheet into the build output. Keeping both off one array means a
 *     swatch and the colour it renders can never drift apart.
 */

/**
 * The WordPress core default colour palette -- the same twelve presets a
 *     stock WordPress install offers before any theme.json is applied.
 *
 *     A standalone @wordpress/block-editor build ships no palette: the
 *     block-editor store's preset settings come from theme.json on the
 *     server, which this core-less editor has none of. The swatches are
 *     therefore declared here and fed to the editor (see Editor.jsx).
 *
 *     Each entry's `slug` becomes a `has-<slug>-color` class on saved
 *     markup, so the slugs match WordPress core's own.
 */
export const WP_DEFAULT_COLOR_PALETTE = [
	{ name: 'Black', slug: 'black', color: '#000000' },
	{ name: 'Cyan bluish gray', slug: 'cyan-bluish-gray', color: '#abb8c3' },
	{ name: 'White', slug: 'white', color: '#ffffff' },
	{ name: 'Pale pink', slug: 'pale-pink', color: '#f78da7' },
	{ name: 'Vivid red', slug: 'vivid-red', color: '#cf2e2e' },
	{
		name: 'Luminous vivid orange',
		slug: 'luminous-vivid-orange',
		color: '#ff6900',
	},
	{
		name: 'Luminous vivid amber',
		slug: 'luminous-vivid-amber',
		color: '#fcb900',
	},
	{ name: 'Light green cyan', slug: 'light-green-cyan', color: '#7bdcb5' },
	{ name: 'Vivid green cyan', slug: 'vivid-green-cyan', color: '#00d084' },
	{ name: 'Pale cyan blue', slug: 'pale-cyan-blue', color: '#8ed1fc' },
	{ name: 'Vivid cyan blue', slug: 'vivid-cyan-blue', color: '#0693e3' },
	{ name: 'Vivid purple', slug: 'vivid-purple', color: '#9b51e0' },
];

/**
 * Build the preset colour stylesheet for the palette above.
 *
 *     When a preset colour is chosen the block editor does NOT write an
 *     inline `color: #rrggbb`. It stores the preset *slug* and adds a
 *     `has-<slug>-color` class (text colour), a
 *     `has-<slug>-background-color` class (background), or the same on a
 *     `<mark>` (the inline Highlight format). Those classes resolve to a
 *     colour only through CSS that a real WordPress install generates
 *     from theme.json. This core-less editor generates nothing, so a
 *     preset pick applied a class with no matching rule -- the colour was
 *     stored but never rendered, while a custom colour (written inline)
 *     worked. That is the Issue #181 follow-up.
 *
 *     This returns the missing stylesheet: the `--wp--preset--color--*`
 *     custom properties plus the `has-*-color` utility classes, the same
 *     shape WordPress core emits. editor.php links it for the editor
 *     canvas and src/index.php links it for the 0.71 front end, so a
 *     preset colour renders the same in the editor and on the published
 *     page.
 *
 * @return {string} The preset colour CSS.
 */
export function buildPresetColorCss() {
	const properties = WP_DEFAULT_COLOR_PALETTE.map(
		( { slug, color } ) => `\t--wp--preset--color--${ slug }: ${ color };`
	).join( '\n' );

	const classes = WP_DEFAULT_COLOR_PALETTE.map( ( { slug } ) => {
		const value = `var(--wp--preset--color--${ slug })`;
		return [
			`.has-${ slug }-color{color:${ value }!important;}`,
			`.has-${ slug }-background-color` +
				`{background-color:${ value }!important;}`,
			`.has-${ slug }-border-color` +
				`{border-color:${ value }!important;}`,
		].join( '\n' );
	} ).join( '\n' );

	return `:root{\n${ properties }\n}\n${ classes }\n`;
}
