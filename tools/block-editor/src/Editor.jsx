/**
 * The custom block editor component for the WordPress 0.71 block editor.
 *     It mounts @wordpress/block-editor's BlockEditorProvider with the full
 *     editing chrome added in Issue #79:
 *       - a per-block toolbar (the floating toolbar rendered by BlockTools),
 *       - a Document Overview panel (ListView, the block outline),
 *       - a settings sidebar with a Post tab (post_status + post_category)
 *         and a Block tab (block attributes via BlockInspector).
 *     It loads a 0.71 post via the load.php JSON endpoint, parses its
 *     post_content into a block tree, and saves the serialized block markup
 *     plus the status / category back through save.php.
 */
import {
	useState,
	useEffect,
	useCallback,
	useMemo,
} from '@wordpress/element';
import { parse, serialize } from '@wordpress/blocks';
import {
	BlockEditorProvider,
	BlockList,
	BlockTools,
	BlockInspector,
	BlockBreadcrumb,
	Inserter,
	WritingFlow,
	ObserveTyping,
	// ListView is exported under the __experimental name in this
	//     @wordpress/block-editor version (15.19.0).
	__experimentalListView as ListView,
} from '@wordpress/block-editor';
import {
	Popover,
	SlotFillProvider,
	Button,
	Notice,
	SelectControl,
	Panel,
	PanelBody,
	TabPanel,
	Icon,
} from '@wordpress/components';
import { blockDefault, listView, page, plus, wordpress } from '@wordpress/icons';
import { ShortcutProvider } from '@wordpress/keyboard-shortcuts';

import {
	WP_DEFAULT_COLOR_PALETTE,
	WP_DEFAULT_GRADIENTS,
	WP_DEFAULT_FONT_SIZES,
	WP_DEFAULT_FONT_FAMILIES,
	WP_DEFAULT_SPACING_SIZES,
} from './presets.js';

// The longest edge, in pixels, an uploaded image is downscaled to
//     before it is sent to the server (Issue #178). A full-resolution
//     phone photo is often 12 MP or more; sending it untouched pushes a
//     many-megabyte body through the service-worker upload path and the
//     php-wasm runtime, which on iOS WebKit -- with its tighter memory
//     limits -- can stall. WordPress 0.71's theme renders images far
//     smaller than this, so capping the long edge here loses nothing
//     visible while keeping the upload well within budget. 0 would mean
//     "do not downscale"; 2048 keeps a generous editing resolution.
const MAX_IMAGE_EDGE = 2048;

// The JPEG quality (0..1) used when an image is re-encoded client-side
//     -- both the HEIC -> JPEG conversion and the downscale path
//     (Issue #178). 0.82 is visually lossless for web display while
//     keeping the encoded file small.
const JPEG_QUALITY = 0.82;

/**
 * Whether a picked file looks like a HEIC / HEIF image (Issue #178).
 *
 *     iOS cameras save photos as HEIC by default, so the iOS photo
 *     picker hands the editor a `.heic` (or `.heif`) file. WordPress
 *     0.71 cannot display HEIC, and its upload allow-list is jpg / gif /
 *     png, so a HEIC upload is rejected server-side. The file is
 *     therefore converted to JPEG in the browser before upload (see
 *     `prepareImageForUpload`). iOS Safari sometimes reports an empty
 *     `file.type` for a HEIC pick, so the file name is checked too.
 *
 * @param {File} file The picked file.
 * @return {boolean} True when the file looks like HEIC / HEIF.
 */
function isHeic( file ) {
	const type = ( file.type || '' ).toLowerCase();
	if ( type === 'image/heic' || type === 'image/heif' ) {
		return true;
	}
	return /\.(heic|heif)$/i.test( file.name || '' );
}

/**
 * Decode an image file to a bitmap, falling back to an <img> element.
 *
 *     `createImageBitmap` is the fast path, but not every engine can
 *     decode every format through it; loading the file into an <img>
 *     via an object URL is the broadly supported fallback. The result
 *     carries `width` / `height` so the caller can size a canvas.
 *
 * @param {File} file The image file to decode.
 * @return {Promise<CanvasImageSource & {width:number,height:number}>}
 *         The decoded image source.
 */
async function decodeImage( file ) {
	if ( typeof createImageBitmap === 'function' ) {
		try {
			return await createImageBitmap( file );
		} catch {
			// Fall through to the <img> decode below.
		}
	}
	const url = URL.createObjectURL( file );
	try {
		const img = new Image();
		img.decoding = 'async';
		img.src = url;
		await img.decode();
		return img;
	} finally {
		URL.revokeObjectURL( url );
	}
}

/**
 * Prepare a picked image file for upload (Issue #178).
 *
 *     Two iOS-specific problems are handled here, in the browser, before
 *     the file reaches the server:
 *
 *       - HEIC photos. iOS saves photos as HEIC, which WordPress 0.71
 *         cannot display and the upload allow-list rejects. A HEIC file
 *         is re-encoded to JPEG.
 *       - Large photos. A full-resolution phone photo is many megabytes;
 *         pushing it untouched through the upload path can exhaust
 *         memory on iOS WebKit. An image whose long edge exceeds
 *         MAX_IMAGE_EDGE is downscaled.
 *
 *     A non-image file, or an image that is already small enough and not
 *     HEIC, is returned unchanged so nothing the old path accepted is
 *     regressed. When the browser cannot decode the file (a desktop
 *     engine handed a HEIC it has no codec for) the original file is
 *     returned and the server's own validation reports a clear error --
 *     better than a silent failure.
 *
 * @param {File} file The picked file.
 * @return {Promise<File>} The file to upload -- converted / downscaled,
 *                         or the original when no change is needed.
 */
async function prepareImageForUpload( file ) {
	const looksLikeImage =
		( file.type || '' ).startsWith( 'image/' ) || isHeic( file );
	if ( ! looksLikeImage ) {
		return file;
	}

	const heic = isHeic( file );
	let source;
	try {
		source = await decodeImage( file );
	} catch {
		// The browser has no codec for this file (e.g. a desktop engine
		//     and a HEIC). Leave it to the server to reject clearly.
		return file;
	}

	const longEdge = Math.max( source.width, source.height );
	const scale =
		longEdge > MAX_IMAGE_EDGE ? MAX_IMAGE_EDGE / longEdge : 1;

	// Nothing to do -- already a small enough non-HEIC image.
	if ( ! heic && scale === 1 ) {
		return file;
	}

	const canvas = document.createElement( 'canvas' );
	canvas.width = Math.max( 1, Math.round( source.width * scale ) );
	canvas.height = Math.max( 1, Math.round( source.height * scale ) );
	const context = canvas.getContext( '2d' );
	context.drawImage( source, 0, 0, canvas.width, canvas.height );

	const blob = await new Promise( ( resolve ) =>
		canvas.toBlob( resolve, 'image/jpeg', JPEG_QUALITY )
	);
	if ( ! blob ) {
		// The canvas could not be encoded -- fall back to the original.
		return file;
	}

	// Give the converted file a .jpg name so the server allow-list
	//     (jpg / gif / png) accepts it; a HEIC keeps no usable extension.
	const baseName = ( file.name || 'image' ).replace(
		/\.(heic|heif|jpe?g|png|gif)$/i,
		''
	);
	return new File( [ blob ], `${ baseName }.jpg`, {
		type: 'image/jpeg',
		lastModified: Date.now(),
	} );
}

// Human-readable messages for the error codes api/upload.php returns,
//     so a failed upload shows a clear cause instead of a raw code or an
//     indefinite spinner (Issue #178).
const UPLOAD_ERROR_MESSAGES = {
	fileupload_disabled: 'Image upload is disabled in the blog configuration.',
	no_file: 'No image was received by the server.',
	upload_failed: 'The image could not be uploaded.',
	file_too_large: 'The image is too large to upload.',
	invalid_file_name: 'The image file name is not valid.',
	disallowed_type: 'That image type is not allowed (use JPG, PNG or GIF).',
	invalid_destination: 'The server could not store the image.',
	move_failed: 'The server could not store the image.',
	method_not_allowed: 'The upload request was rejected by the server.',
};

/**
 * Editor feature flags handed to BlockEditorProvider.
 *
 *     A block's toolbar / inspector controls for typography, colour, spacing,
 *     etc. are gated behind editor "settings" -- `useSettings()` reads them
 *     from `settings.__experimentalFeatures` (populated from theme.json in a
 *     real WordPress install). With no settings prop the block-editor store
 *     keeps its bare defaults, so `typography.textAlign` is undefined and the
 *     paragraph block's text-alignment toolbar control never renders.
 *
 *     This standalone editor has no theme.json, so the equivalent feature
 *     flags are supplied here directly. `appearanceTools` switches on the
 *     common appearance controls; `typography.textAlign` is what makes the
 *     paragraph's Align-text control appear in the floating toolbar.
 *
 *     `color.palette` (and the legacy top-level `colors`, set on
 *     `editorSettings`) supply the preset colour swatches. Without them the
 *     block Color panel and the paragraph's inline Highlight format render
 *     no palette at all.
 */
const EDITOR_FEATURES = {
	appearanceTools: true,
	typography: {
		textAlign: true,
		fontStyle: true,
		fontWeight: true,
		lineHeight: true,
		textDecoration: true,
		// Allow a custom font size alongside the presets.
		customFontSize: true,
		// `typography.fontSizes` / `fontFamilies` carry the presets the
		//     typography panel's Font size / Font controls render. With
		//     no preset list those controls do not render at all
		//     (useHasFontSizeControl / useHasFontFamilyControl). The
		//     presets go in the `theme` origin, like the colour palette.
		fontSizes: {
			theme: WP_DEFAULT_FONT_SIZES,
		},
		fontFamilies: {
			theme: WP_DEFAULT_FONT_FAMILIES,
		},
	},
	color: {
		text: true,
		background: true,
		link: true,
		// Allow the custom colour / gradient pickers alongside the
		//     presets.
		custom: true,
		customGradient: true,
		// `color.palette` / `color.gradients` must be the multi-origin
		//     object shape ({ default, theme, custom }); a bare array is
		//     read as undefined by the block editor. The presets go in
		//     the `theme` origin, which is always shown -- the `default`
		//     origin is gated behind a separate `defaultPalette` /
		//     `defaultGradients` toggle.
		palette: {
			theme: WP_DEFAULT_COLOR_PALETTE,
		},
		gradients: {
			theme: WP_DEFAULT_GRADIENTS,
		},
	},
	spacing: {
		margin: true,
		padding: true,
		// The spacing scale the margin / padding controls offer as
		//     presets. `spacing.spacingSizes` is the multi-origin object
		//     shape; without it the controls fall back to a plain
		//     numeric input.
		spacingSizes: {
			theme: WP_DEFAULT_SPACING_SIZES,
		},
	},
};

/**
 * Build the `mediaUpload` integration the block editor uses for uploads.
 *
 *     mediaUpload is the integration seam @wordpress/block-editor uses for
 *     uploads. The Image / Gallery / Cover blocks call it instead of
 *     hard-coding the REST API (WordPress 0.71 has none). Each file is
 *     POSTed as multipart/form-data to the api/upload.php JSON endpoint --
 *     a sibling of load.php / save.php, so it is reached at the relative
 *     URL 'upload.php' just like editor.php's loadEndpoint / saveEndpoint
 *     defaults. The endpoint replies { id, url, alt }; onFileChange is
 *     called with the resulting media objects so the Image block's upload
 *     button works. credentials:'include' carries 0.71's auth cookies.
 *
 *     `reportUploadError` is called with a human-readable message when an
 *     upload fails. The block-library Image block routes mediaUpload's
 *     onError into a notice store this standalone editor does not render,
 *     so without this an upload failure would vanish silently -- the
 *     Image block placeholder just sits there, which is exactly the
 *     "upload freezes" symptom Issue #178 reports. Surfacing the message
 *     in the editor's own notice banner turns that silent hang into a
 *     clear, fast error.
 *
 * @param {(message: string) => void} reportUploadError Editor-level
 *        error reporter (shows the editor's notice banner).
 * @return {(options: Object) => void} The mediaUpload function.
 */
function createMediaUpload( reportUploadError ) {
	return function mediaUpload( {
		filesList,
		allowedTypes,
		onFileChange,
		onError,
	} ) {
		const files = Array.from( filesList || [] );
		if ( files.length === 0 ) {
			return;
		}

		// Report an upload failure both to the block (so it clears its
		//     placeholder spinner) and to the editor banner (so the user
		//     actually sees the cause) -- Issue #178.
		const failUpload = ( file, message ) => {
			if ( onError ) {
				onError( { code: 'GENERAL', file, message } );
			}
			reportUploadError( message );
		};

		// Optional client-side type pre-filter. allowedTypes is a list of
		//     MIME types or top-level types (e.g. 'image'); the server still
		//     enforces its own allow-list, this is only for a fast UX reject.
		//
		//     An empty file.type is NOT treated as a rejection: iOS Safari
		//     reports an empty type for some picks -- a HEIC photo in
		//     particular -- and dropping those silently was one cause of an
		//     iPhone upload that never completes (Issue #178). A HEIC file
		//     is recognised by name and allowed through here; it is
		//     converted to JPEG before upload (see prepareImageForUpload).
		const typeAllowed = ( file ) => {
			if ( ! allowedTypes || allowedTypes.length === 0 ) {
				return true;
			}
			if ( ! file.type ) {
				// Unknown type -- let an image-by-name (e.g. iOS HEIC)
				//     through and leave the final say to the server.
				return /\.(jpe?g|png|gif|heic|heif|webp|avif)$/i.test(
					file.name || ''
				);
			}
			return allowedTypes.some( ( type ) =>
				type.includes( '/' )
					? file.type === type
					: file.type.startsWith( `${ type }/` )
			);
		};

		const uploadOne = ( file ) => {
			const body = new FormData();
			body.append( 'file', file );
			return fetch( 'upload.php', {
				method: 'POST',
				credentials: 'include',
				body,
			} )
				.then( ( res ) =>
					res.json().then( ( data ) => {
						if ( ! res.ok ) {
							// Map the endpoint's error code to a clear
							//     message; fall back to the raw code / HTTP
							//     status when it is unrecognised.
							const code = data && data.error;
							throw new Error(
								( code &&
									UPLOAD_ERROR_MESSAGES[ code ] ) ||
									code ||
									`Upload failed (HTTP ${ res.status }).`
							);
						}
						return data;
					} )
				)
				.then( ( data ) => ( {
					id: data.id,
					url: data.url,
					alt: data.alt || '',
				} ) );
		};

		files.forEach( ( file ) => {
			if ( ! typeAllowed( file ) ) {
				failUpload(
					file,
					`${ file.name }: that file type is not allowed.`
				);
				return;
			}
			// Convert HEIC to JPEG and downscale an oversized photo
			//     before upload, so an iPhone photo reaches the server in
			//     a format it accepts and a size it can handle
			//     (Issue #178).
			prepareImageForUpload( file )
				.then( ( prepared ) => uploadOne( prepared ) )
				.then( ( media ) => {
					if ( onFileChange ) {
						onFileChange( [ media ] );
					}
				} )
				.catch( ( err ) => {
					failUpload( file, String( err.message || err ) );
				} );
		} );
	};
}

/**
 * The post-status options offered by 0.71's own editor (b2edit.form.php).
 */
const STATUS_OPTIONS = [
	{ value: 'publish', label: 'Publish' },
	{ value: 'draft', label: 'Draft' },
	{ value: 'private', label: 'Private' },
];

/**
 * An editor instance bound to one WordPress 0.71 post.
 * @param {Object} props        Component props.
 * @param {Object} props.config Boot config from editor.php.
 */
export function Editor( { config } ) {
	const [ blocks, setBlocks ] = useState( [] );
	const [ title, setTitle ] = useState( '' );
	const [ status, setStatus ] = useState( 'loading' );
	const [ message, setMessage ] = useState( '' );

	// The post id this editor is bound to. It starts from the boot config
	//     (0 in Issue #96's new-post mode) and is adopted from save.php's
	//     response after the first INSERT, so later saves UPDATE the same row.
	const [ postId, setPostId ] = useState( config.postId );

	// True until the new post has been saved once and adopted an id.
	const isNew = postId <= 0;

	// Post settings surfaced in the sidebar's Post panel.
	const [ postStatus, setPostStatus ] = useState( 'publish' );
	const [ postCategory, setPostCategory ] = useState( 0 );
	const [ categories, setCategories ] = useState( [] );

	// Toggle for the Document Overview (list-view) panel. It starts off,
	//     matching the modern WordPress editor where the list view is hidden
	//     until the user opens it from the header.
	const [ showOverview, setShowOverview ] = useState( false );

	// Settings for BlockEditorProvider. The mediaUpload integration is
	//     built here -- not as a module constant -- so an upload failure
	//     can be surfaced in the editor's own notice banner (setMessage /
	//     setStatus). Without that, a failed image upload would be
	//     swallowed by the block-library notice store this editor does
	//     not render, leaving the Image block looking frozen (Issue #178).
	const editorSettings = useMemo(
		() => ( {
			// hasFixedToolbar=false keeps the floating per-block toolbar.
			hasFixedToolbar: false,
			mediaUpload: createMediaUpload( ( uploadMessage ) => {
				setStatus( 'error' );
				setMessage( `Image upload failed: ${ uploadMessage }` );
			} ),
			__experimentalFeatures: EDITOR_FEATURES,
			// The legacy top-level colour palette. The inline Highlight
			//     format (@wordpress/format-library's core/text-color)
			//     reads its swatches from `getSettings().colors`, not
			//     from __experimentalFeatures, so the same presets are
			//     supplied here too -- otherwise the Highlight popover
			//     shows no colours.
			colors: WP_DEFAULT_COLOR_PALETTE,
		} ),
		[]
	);

	// Load the post once on mount. In Issue #96's new-post mode config.postId
	//     is 0, and load.php answers with an empty post shape (blank title /
	//     content, draft status) plus the category list, so the same code path
	//     starts the editor empty without a special case here.
	useEffect( () => {
		const url = `${ config.loadEndpoint }?post=${ encodeURIComponent(
			config.postId
		) }`;
		fetch( url, { credentials: 'include' } )
			.then( ( res ) => {
				if ( ! res.ok ) {
					throw new Error( `load failed: HTTP ${ res.status }` );
				}
				return res.json();
			} )
			.then( ( data ) => {
				setTitle( data.title || '' );
				// parse() turns block-markup (or plain HTML) into blocks.
				//     A legacy 0.71 post with no <!-- wp:* --> delimiters has
				//     no block markup, so parse() routes it through the
				//     freeform content handler -- set to core/html in
				//     main.jsx -- and it opens as a Custom HTML block.
				setBlocks( parse( data.content || '' ) );
				setPostStatus( data.status || 'publish' );
				setPostCategory( Number( data.category ) || 0 );
				setCategories(
					Array.isArray( data.categories )
						? data.categories
						: []
				);
				setStatus( 'ready' );
			} )
			.catch( ( err ) => {
				setMessage( String( err.message || err ) );
				setStatus( 'error' );
			} );
	}, [ config.loadEndpoint, config.postId ] );

	const onSave = useCallback( () => {
		setStatus( 'saving' );
		setMessage( '' );
		// serialize() produces the <!-- wp:* --> block markup that gets
		//     stored verbatim in 0.71's post_content column.
		const content = serialize( blocks );
		fetch( config.saveEndpoint, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				// postId is 0 for a not-yet-saved new post; save.php
				//     reads that as the INSERT path.
				post: postId,
				title,
				content,
				status: postStatus,
				category: postCategory,
			} ),
		} )
			.then( ( res ) => {
				if ( ! res.ok ) {
					throw new Error( `save failed: HTTP ${ res.status }` );
				}
				return res.json();
			} )
			.then( ( data ) => {
				// Adopt the id returned by save.php. For a new post this
				//     is the freshly INSERTed row's id, so every later save
				//     UPDATEs that same post instead of inserting again.
				const savedId = Number( data && data.id );
				if ( savedId > 0 ) {
					setPostId( savedId );
				}
				setStatus( 'ready' );
				setMessage( 'Saved.' );
			} )
			.catch( ( err ) => {
				setStatus( 'error' );
				setMessage( String( err.message || err ) );
			} );
	}, [
		blocks,
		title,
		postStatus,
		postCategory,
		config.saveEndpoint,
		postId,
	] );

	if ( status === 'loading' ) {
		return (
			<div className="be-state">
				{ config.isNew
					? 'Starting a new post…'
					: `Loading post #${ config.postId }…` }
			</div>
		);
	}

	// Front-end URL for the "View on 0.71 front end" link. The boot config
	//     URL embeds config.postId, which is 0 for a new post; once the post
	//     has been saved and an id adopted, rebuild the URL for that id.
	const frontEndUrl = isNew
		? config.frontEndUrl
		: `../../index.php?p=${ postId }`;

	// Category options for the Post panel selector. SelectControl needs
	//     string values, so cat_ID is stringified here and parsed back on
	//     change.
	const categoryOptions = categories.map( ( cat ) => ( {
		value: String( cat.id ),
		label: `${ cat.name } (#${ cat.id })`,
	} ) );

	return (
		// ShortcutProvider / SlotFillProvider / BlockEditorProvider wrap
		//     the whole .be-app -- header included -- so header controls have
		//     the block editor store. The header's Inserter ("+" button)
		//     needs that store, and so does BlockBreadcrumb at the bottom.
		<ShortcutProvider>
			<SlotFillProvider>
				<BlockEditorProvider
					value={ blocks }
					onInput={ setBlocks }
					onChange={ setBlocks }
					settings={ editorSettings }
				>
					<div className="be-app">
						<header className="be-toolbar">
							<div className="be-toolbar-left">
								{ /* The WordPress logo button -- the black
								       W square at the top-left of the modern
								       editor -- navigates back to wp-admin. */ }
								<Button
									className="be-wp-logo"
									icon={ wordpress }
									iconSize={ 36 }
									label="Back to wp-admin"
									showTooltip
									href={ config.adminUrl }
								/>
								{ /* The "+" block inserter. Inserter's
								       renderToggle replaces its default toggle
								       with a clean "+" icon button; the
								       inserter panel opens in a Popover. */ }
								<Inserter
									position="bottom right"
									renderToggle={ ( {
										onToggle,
										disabled,
										isOpen,
									} ) => (
										<Button
											className="be-inserter-toggle"
											icon={ plus }
											label="Add block"
											showTooltip
											onClick={ onToggle }
											disabled={ disabled }
											aria-expanded={ isOpen }
											aria-haspopup="true"
										/>
									) }
								/>
								{ /* The hamburger / list-view button
								       toggles the Document Overview panel. */ }
								<Button
									className="be-overview-toggle"
									icon={ listView }
									label="Document Overview"
									showTooltip
									isPressed={ showOverview }
									onClick={ () =>
										setShowOverview(
											( prev ) => ! prev
										)
									}
									aria-pressed={ showOverview }
								/>
								<span className="be-badge">
									{ isNew
										? 'WordPress 0.71 — new post'
										: `WordPress 0.71 — post #${ postId }` }
								</span>
							</div>
							<div className="be-toolbar-right">
								{ /* A new post has no front-end URL until it is saved
								       and an id is adopted; hide the link until then. */ }
								{ ! isNew && (
									<a
										className="be-link"
										href={ frontEndUrl }
										target="_blank"
										rel="noreferrer"
									>
										View on 0.71 front end
									</a>
								) }
								<Button
									variant="primary"
									onClick={ onSave }
									isBusy={ status === 'saving' }
									disabled={ status === 'saving' }
								>
									{ status === 'saving'
										? 'Saving…'
										: isNew
											? 'Create post in WordPress 0.71'
											: 'Save to WordPress 0.71' }
								</Button>
							</div>
						</header>

						{ message && (
							<div className="be-notice">
								<Notice
									status={
										status === 'error'
											? 'error'
											: 'success'
									}
									isDismissible={ false }
								>
									{ message }
								</Notice>
							</div>
						) }

						<div className="be-body">
							{ showOverview && (
								<aside className="be-overview">
									<Panel header="Document Overview">
										<PanelBody>
											{ /* ListView is the block outline / list view. */ }
											<ListView />
										</PanelBody>
									</Panel>
								</aside>
							) }

							<div className="be-canvas">
								{ /* The post title sits at the top of the
								       content column, the width of the canvas
								       -- above the writing flow, not spanning
								       the Document Overview / settings columns. */ }
								<input
									className="be-title"
									type="text"
									value={ title }
									placeholder="Post title"
									onChange={ ( e ) =>
										setTitle( e.target.value )
									}
								/>
								{ /* BlockTools renders the floating per-block
								       toolbar (bold, alignment, ...) above the
								       selected block; it needs Popover.Slot. */ }
								<BlockTools className="be-block-tools">
									<WritingFlow>
										<ObserveTyping>
											<BlockList />
										</ObserveTyping>
									</WritingFlow>
								</BlockTools>
							</div>

							<aside className="be-sidebar">
								{ /* The settings sidebar as tabs, like modern WordPress
								       -- a Post tab (the 0.71 post_status and single
								       post_category) and a Block tab (BlockInspector).
								       Full height, with no collapse control (Issue #152). */ }
								<TabPanel
									className="be-sidebar-tabs"
									tabs={ [
										{
											name: 'post',
											title: (
												<span className="be-tab-title">
													<Icon icon={ page } size={ 20 } />
													Post
												</span>
											),
										},
										{
											name: 'block',
											title: (
												<span className="be-tab-title">
													<Icon icon={ blockDefault } size={ 20 } />
													Block
												</span>
											),
										},
									] }
								>
									{ ( tab ) =>
										tab.name === 'post' ? (
											<div className="be-tab-panel">
												<SelectControl
													__next40pxDefaultSize
													label="Status"
													value={ postStatus }
													options={ STATUS_OPTIONS }
													onChange={ setPostStatus }
													__nextHasNoMarginBottom
												/>
												<SelectControl
													__next40pxDefaultSize
													label="Category"
													value={ String( postCategory ) }
													options={
														categoryOptions.length
															? categoryOptions
															: [ { value: '0', label: 'General (#0)' } ]
													}
													onChange={ ( value ) =>
														setPostCategory( Number( value ) )
													}
													__nextHasNoMarginBottom
												/>
											</div>
										) : (
											<BlockInspector />
										)
									}
								</TabPanel>
							</aside>
						</div>

						{ /* BlockBreadcrumb sits after .be-body as a
						       full-width bar pinned at the bottom of the
						       editor. It stays inside BlockEditorProvider
						       because BlockBreadcrumb needs the store. */ }
						<div className="be-breadcrumb">
							<BlockBreadcrumb />
						</div>

						{ /* Popover.Slot must be rendered for block
						       toolbars, dropdowns, the inserter panel and
						       inspector controls (which render into popovers)
						       to appear. */ }
						<Popover.Slot />
					</div>
				</BlockEditorProvider>
			</SlotFillProvider>
		</ShortcutProvider>
	);
}
