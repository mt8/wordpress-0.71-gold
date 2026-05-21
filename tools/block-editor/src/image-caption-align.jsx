/**
 * Caption text-alignment toolbar for the core/image block (Issue #263).
 *
 *     The core image block ships an alignment control for the figure as
 *     a whole (left / center / right / wide / full), but the figcaption
 *     inside the figure has no toolbar option for its own text-align --
 *     the caption is always whatever the theme renders by default. On
 *     the 0.71 theme a small image picked as "align left" floats the
 *     figure into a narrow `display: table` box, so a multi-line caption
 *     wraps in a thin column on the left side, with no way to centre it.
 *
 *     This module adds a small block-filter extension: a `captionAlign`
 *     attribute, an AlignmentControl in the image block's toolbar that
 *     only appears when the block carries a caption, and a
 *     `has-caption-align-<value>` class on the saved figure that the
 *     stylesheet (front end + editor canvas) turns into a `text-align`
 *     on the figcaption. The extension is gated on the block name so it
 *     doesn't bleed into other blocks.
 */

import { addFilter } from '@wordpress/hooks';
import { createHigherOrderComponent } from '@wordpress/compose';
import { Fragment } from '@wordpress/element';
import {
	BlockControls,
	AlignmentControl,
} from '@wordpress/block-editor';
// Tiny className joiner -- avoids pulling in clsx as a transitive dep
//     just to glue two strings together. Empty / undefined parts are
//     dropped so a missing `props.className` does not leave a leading
//     space in the final string.
function joinClass( ...parts ) {
	return parts.filter( Boolean ).join( ' ' );
}

const BLOCK_NAME = 'core/image';
const ATTRIBUTE = 'captionAlign';

/**
 * Declare the `captionAlign` attribute on the core/image block.
 *
 *     The attribute is a plain string ('' | 'left' | 'center' | 'right')
 *     so a deserialised block round-trips cleanly. The default is the
 *     empty string -- meaning "no override, render whatever the theme
 *     decides" -- so a legacy post written before this extension still
 *     reads as if the control was never touched.
 *
 * @param {Object} settings The block settings.
 * @param {string} name     The block name.
 * @return {Object} Settings with the captionAlign attribute appended.
 */
function addCaptionAlignAttribute( settings, name ) {
	if ( name !== BLOCK_NAME ) {
		return settings;
	}
	return {
		...settings,
		attributes: {
			...settings.attributes,
			[ ATTRIBUTE ]: {
				type: 'string',
				default: '',
			},
		},
	};
}

addFilter(
	'blocks.registerBlockType',
	'wp071/image-caption-align-attr',
	addCaptionAlignAttribute
);

/**
 * Wrap the image block's edit component with a caption-alignment control.
 *
 *     The AlignmentControl is rendered into the block's toolbar via the
 *     BlockControls slot. It is hidden when the block has no caption
 *     yet, so the toolbar does not gain a meaningless control on an
 *     uncaptioned image (matching how core hides format buttons when
 *     they cannot apply).
 *
 * @param {Function} BlockEdit The wrapped edit component.
 * @return {Function} The wrapper.
 */
const withCaptionAlignControl = createHigherOrderComponent(
	( BlockEdit ) =>
		function CaptionAlignWrapper( props ) {
			if ( props.name !== BLOCK_NAME ) {
				return <BlockEdit { ...props } />;
			}

			const { attributes, setAttributes } = props;
			const hasCaption =
				typeof attributes.caption === 'string'
					? attributes.caption.length > 0
					: !! attributes.caption;

			return (
				<Fragment>
					<BlockEdit { ...props } />
					{ hasCaption && (
						<BlockControls group="block">
							<AlignmentControl
								label="Caption text alignment"
								value={
									attributes[ ATTRIBUTE ] || undefined
								}
								onChange={ ( nextAlign ) =>
									setAttributes( {
										[ ATTRIBUTE ]: nextAlign || '',
									} )
								}
							/>
						</BlockControls>
					) }
				</Fragment>
			);
		},
	'withCaptionAlignControl'
);

addFilter(
	'editor.BlockEdit',
	'wp071/image-caption-align-control',
	withCaptionAlignControl
);

/**
 * Return the className suffix for a `captionAlign` value.
 *
 *     The empty string maps to no className so an untouched block stays
 *     a byte-for-byte match with its pre-extension serialisation; an
 *     unknown value also returns the empty string defensively (a future
 *     value should not bleed into the front-end class list as garbage).
 *
 * @param {string} value The captionAlign attribute.
 * @return {string} `has-caption-align-<value>` or ''.
 */
function captionAlignClassName( value ) {
	if ( value === 'left' || value === 'center' || value === 'right' ) {
		return `has-caption-align-${ value }`;
	}
	return '';
}

/**
 * Add the caption-align className to the saved block markup.
 *
 *     The class lands on the wrapper element the image block's save()
 *     produces (the `<figure>`), so the front-end stylesheet can target
 *     `.wp-block-image.has-caption-align-<value> figcaption`.
 *
 * @param {Object} props      Existing save props (className, ...).
 * @param {Object} blockType  The block type settings.
 * @param {Object} attributes The block attributes.
 * @return {Object} Props, with the className appended when needed.
 */
function addSaveClassName( props, blockType, attributes ) {
	if ( blockType.name !== BLOCK_NAME ) {
		return props;
	}
	const extra = captionAlignClassName( attributes[ ATTRIBUTE ] );
	if ( ! extra ) {
		return props;
	}
	return { ...props, className: joinClass( props.className, extra ) };
}

addFilter(
	'blocks.getSaveContent.extraProps',
	'wp071/image-caption-align-save',
	addSaveClassName
);

/**
 * Mirror the caption-align className onto the editor's block wrapper.
 *
 *     `blocks.getSaveContent.extraProps` only touches the saved markup,
 *     so without this filter the editor canvas would render the image
 *     without the caption-align class until the post was reloaded. The
 *     `editor.BlockListBlock` filter wraps each rendered block in the
 *     editor canvas; adding the same suffix to its wrapperProps keeps
 *     the editor preview in step with the front end.
 *
 * @param {Function} BlockListBlock The wrapped editor block component.
 * @return {Function} The wrapper.
 */
const withEditorClassName = createHigherOrderComponent(
	( BlockListBlock ) =>
		function CaptionAlignEditorWrapper( props ) {
			if ( props.name !== BLOCK_NAME ) {
				return <BlockListBlock { ...props } />;
			}
			const extra = captionAlignClassName(
				props.attributes?.[ ATTRIBUTE ]
			);
			if ( ! extra ) {
				return <BlockListBlock { ...props } />;
			}
			const className = joinClass( props.className, extra );
			return <BlockListBlock { ...props } className={ className } />;
		},
	'withCaptionAlignEditorClassName'
);

addFilter(
	'editor.BlockListBlock',
	'wp071/image-caption-align-editor-class',
	withEditorClassName
);
