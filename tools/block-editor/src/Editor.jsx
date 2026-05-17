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
import { useState, useEffect, useCallback } from '@wordpress/element';
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

/**
 * Settings handed to BlockEditorProvider.
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
 */
const EDITOR_SETTINGS = {
	// hasFixedToolbar=false keeps the floating per-block toolbar.
	hasFixedToolbar: false,
	// mediaUpload is the integration seam @wordpress/block-editor uses for
	//     uploads. The Image / Gallery / Cover blocks call it instead of
	//     hard-coding the REST API (WordPress 0.71 has none). Each file is
	//     POSTed as multipart/form-data to the api/upload.php JSON endpoint --
	//     a sibling of load.php / save.php, so it is reached at the relative
	//     URL 'upload.php' just like editor.php's loadEndpoint / saveEndpoint
	//     defaults. The endpoint replies { id, url, alt }; onFileChange is
	//     called with the resulting media objects so the Image block's upload
	//     button works. credentials:'include' carries 0.71's auth cookies.
	mediaUpload( { filesList, allowedTypes, onFileChange, onError } ) {
		const files = Array.from( filesList || [] );
		if ( files.length === 0 ) {
			return;
		}

		// Optional client-side type pre-filter. allowedTypes is a list of
		//     MIME types or top-level types (e.g. 'image'); the server still
		//     enforces its own allow-list, this is only for a fast UX reject.
		const typeAllowed = ( file ) => {
			if ( ! allowedTypes || allowedTypes.length === 0 ) {
				return true;
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
							throw new Error(
								data && data.error
									? data.error
									: `upload failed: HTTP ${ res.status }`
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
				if ( onError ) {
					onError( {
						code: 'MIME_TYPE_NOT_ALLOWED_FOR_USER',
						file,
						message: `${ file.name }: file type not allowed.`,
					} );
				}
				return;
			}
			uploadOne( file )
				.then( ( media ) => {
					if ( onFileChange ) {
						onFileChange( [ media ] );
					}
				} )
				.catch( ( err ) => {
					if ( onError ) {
						onError( {
							code: 'GENERAL',
							file,
							message: String( err.message || err ),
						} );
					}
				} );
		} );
	},
	__experimentalFeatures: {
		appearanceTools: true,
		typography: {
			textAlign: true,
			fontStyle: true,
			fontWeight: true,
			lineHeight: true,
			textDecoration: true,
		},
		color: {
			text: true,
			background: true,
			link: true,
		},
		spacing: {
			margin: true,
			padding: true,
		},
	},
};

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
				//     A legacy 0.71 post with no <!-- wp:* --> delimiters is
				//     parsed as a single classic ("freeform") block.
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
					settings={ EDITOR_SETTINGS }
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
