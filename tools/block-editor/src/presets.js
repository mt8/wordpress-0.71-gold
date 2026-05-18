/**
 * The WordPress 0.71 block editor's preset settings and the CSS generated
 *     from them (Issues #181 and #183).
 *
 *     A standalone @wordpress/block-editor build ships no presets: in a
 *     real WordPress install the colour palette, gradients, font sizes,
 *     font families and spacing scale all come from theme.json on the
 *     server, which this core-less editor has none of. They are declared
 *     here -- the single source of truth -- and consumed two ways:
 *
 *       - Editor.jsx feeds the arrays to BlockEditorProvider, so the
 *         matching controls render (each is gated on its preset list);
 *       - vite.config.js calls buildPresetCss(), which emits the
 *         stylesheet that makes a chosen preset actually render.
 *
 *     Keeping both off these arrays means a preset shown in a control and
 *     the value it renders to can never drift apart.
 */

/**
 * The WordPress core default colour palette -- the same twelve presets a
 *     stock WordPress install offers before any theme.json is applied.
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
 * The WordPress core default gradient presets.
 *
 *     A gradient pick is stored as a `has-<slug>-gradient-background`
 *     class; the blocks that support a gradient background (Group, Cover,
 *     Buttons, ...) read these.
 */
export const WP_DEFAULT_GRADIENTS = [
	{
		name: 'Vivid cyan blue to vivid purple',
		slug: 'vivid-cyan-blue-to-vivid-purple',
		gradient:
			'linear-gradient(135deg,rgba(6,147,227,1) 0%,rgb(155,81,224) 100%)',
	},
	{
		name: 'Light green cyan to vivid green cyan',
		slug: 'light-green-cyan-to-vivid-green-cyan',
		gradient:
			'linear-gradient(135deg,rgb(122,220,180) 0%,rgb(0,208,130) 100%)',
	},
	{
		name: 'Luminous vivid amber to luminous vivid orange',
		slug: 'luminous-vivid-amber-to-luminous-vivid-orange',
		gradient:
			'linear-gradient(135deg,rgba(252,185,0,1) 0%,rgba(255,105,0,1) 100%)',
	},
	{
		name: 'Luminous vivid orange to vivid red',
		slug: 'luminous-vivid-orange-to-vivid-red',
		gradient:
			'linear-gradient(135deg,rgba(255,105,0,1) 0%,rgb(207,46,46) 100%)',
	},
	{
		name: 'Very light gray to cyan bluish gray',
		slug: 'very-light-gray-to-cyan-bluish-gray',
		gradient:
			'linear-gradient(135deg,rgb(238,238,238) 0%,rgb(169,184,195) 100%)',
	},
	{
		name: 'Cool to warm spectrum',
		slug: 'cool-to-warm-spectrum',
		gradient:
			'linear-gradient(135deg,rgb(74,234,220) 0%,rgb(151,120,209) 20%,' +
			'rgb(207,42,186) 40%,rgb(238,44,130) 60%,rgb(251,105,98) 80%,' +
			'rgb(254,248,76) 100%)',
	},
	{
		name: 'Blush light purple',
		slug: 'blush-light-purple',
		gradient:
			'linear-gradient(135deg,rgb(255,206,236) 0%,rgb(152,150,240) 100%)',
	},
	{
		name: 'Blush bordeaux',
		slug: 'blush-bordeaux',
		gradient:
			'linear-gradient(135deg,rgb(254,205,165) 0%,rgb(254,45,45) 50%,' +
			'rgb(107,0,62) 100%)',
	},
	{
		name: 'Luminous dusk',
		slug: 'luminous-dusk',
		gradient:
			'linear-gradient(135deg,rgb(255,203,112) 0%,rgb(199,81,192) 50%,' +
			'rgb(65,88,208) 100%)',
	},
	{
		name: 'Pale ocean',
		slug: 'pale-ocean',
		gradient:
			'linear-gradient(135deg,rgb(255,245,203) 0%,rgb(182,227,212) 50%,' +
			'rgb(51,167,181) 100%)',
	},
	{
		name: 'Electric grass',
		slug: 'electric-grass',
		gradient:
			'linear-gradient(135deg,rgb(202,248,128) 0%,rgb(113,206,126) 100%)',
	},
	{
		name: 'Midnight',
		slug: 'midnight',
		gradient:
			'linear-gradient(135deg,rgb(2,3,129) 0%,rgb(40,116,252) 100%)',
	},
];

/**
 * The font-size presets -- WordPress core's classic pixel sizes.
 *
 *     The modern WordPress default sizes are `rem` / `clamp()` based; the
 *     classic pixel sizes are used here instead because the WordPress
 *     0.71 theme (layout2b.css) is a fixed-width, pixel-based 2003 design.
 *     A preset pick is stored as a `has-<slug>-font-size` class.
 */
export const WP_DEFAULT_FONT_SIZES = [
	{ name: 'Small', slug: 'small', size: '13px' },
	{ name: 'Normal', slug: 'normal', size: '16px' },
	{ name: 'Medium', slug: 'medium', size: '20px' },
	{ name: 'Large', slug: 'large', size: '36px' },
	{ name: 'Huge', slug: 'huge', size: '42px' },
];

/**
 * The font-family presets -- a small set fitting a 2003-era blog.
 *
 *     "Serif" is the WordPress 0.71 theme's own body stack (layout2b.css),
 *     so it is the natural default; "Sans-serif" and "Monospace" are
 *     period-appropriate alternatives. A pick is stored as a
 *     `has-<slug>-font-family` class.
 */
export const WP_DEFAULT_FONT_FAMILIES = [
	{
		name: 'Serif',
		slug: 'serif',
		fontFamily: 'Georgia, "Times New Roman", Times, serif',
	},
	{
		name: 'Sans-serif',
		slug: 'sans-serif',
		fontFamily: 'Verdana, Arial, Helvetica, sans-serif',
	},
	{
		name: 'Monospace',
		slug: 'monospace',
		fontFamily: '"Courier New", Courier, monospace',
	},
];

/**
 * The spacing-size presets -- a pixel scale for the margin / padding
 *     controls.
 *
 *     The slug numbering (20..80) follows WordPress core's spacing-preset
 *     convention; the values are plain pixels, suiting the 0.71 theme.
 *     Unlike the others, a spacing preset is referenced inline as
 *     `var(--wp--preset--spacing--<slug>)` -- there is no utility class.
 */
export const WP_DEFAULT_SPACING_SIZES = [
	{ name: '1', slug: '20', size: '4px' },
	{ name: '2', slug: '30', size: '8px' },
	{ name: '3', slug: '40', size: '12px' },
	{ name: '4', slug: '50', size: '20px' },
	{ name: '5', slug: '60', size: '32px' },
	{ name: '6', slug: '70', size: '52px' },
	{ name: '7', slug: '80', size: '84px' },
];

/**
 * Build the preset stylesheet for every preset family above.
 *
 *     When a preset is chosen the block editor does NOT write an inline
 *     value -- it stores the preset *slug* and either applies a
 *     `has-<slug>-*` class (colour, gradient, font size, font family) or
 *     references `var(--wp--preset--*)` inline (spacing). Those resolve to
 *     a value only through CSS a real WordPress install generates from
 *     theme.json. This core-less editor generates none, so a preset pick
 *     was stored but never rendered.
 *
 *     This returns the missing stylesheet, the shape WordPress core
 *     emits: the `--wp--preset--*` custom properties plus the `has-*`
 *     utility classes. editor.php links it for the editor canvas and
 *     src/index.php links it for the 0.71 front end, so a preset renders
 *     the same in the editor and on the published page.
 *
 * @return {string} The preset CSS.
 */
export function buildPresetCss() {
	const root = [];
	const rules = [];

	// Declare one `--wp--preset--<infix>--<slug>` custom property and
	//     return the `var()` that references it.
	const declare = ( infix, slug, value ) => {
		root.push( `\t--wp--preset--${ infix }--${ slug }: ${ value };` );
		return `var(--wp--preset--${ infix }--${ slug })`;
	};

	// Colours -- text / background / border utility classes.
	for ( const { slug, color } of WP_DEFAULT_COLOR_PALETTE ) {
		const value = declare( 'color', slug, color );
		rules.push(
			`.has-${ slug }-color{color:${ value }!important;}`,
			`.has-${ slug }-background-color` +
				`{background-color:${ value }!important;}`,
			`.has-${ slug }-border-color` +
				`{border-color:${ value }!important;}`
		);
	}

	// Gradients -- the background utility class.
	for ( const { slug, gradient } of WP_DEFAULT_GRADIENTS ) {
		const value = declare( 'gradient', slug, gradient );
		rules.push(
			`.has-${ slug }-gradient-background` +
				`{background:${ value }!important;}`
		);
	}

	// Font sizes.
	for ( const { slug, size } of WP_DEFAULT_FONT_SIZES ) {
		const value = declare( 'font-size', slug, size );
		rules.push(
			`.has-${ slug }-font-size{font-size:${ value }!important;}`
		);
	}

	// Font families.
	for ( const { slug, fontFamily } of WP_DEFAULT_FONT_FAMILIES ) {
		const value = declare( 'font-family', slug, fontFamily );
		rules.push(
			`.has-${ slug }-font-family` +
				`{font-family:${ value }!important;}`
		);
	}

	// Spacing sizes -- the block editor references a spacing preset
	//     inline as `var(--wp--preset--spacing--<slug>)`, so only the
	//     custom properties are needed; there is no utility class.
	for ( const { slug, size } of WP_DEFAULT_SPACING_SIZES ) {
		declare( 'spacing', slug, size );
	}

	return `:root{\n${ root.join( '\n' ) }\n}\n${ rules.join( '\n' ) }\n`;
}
