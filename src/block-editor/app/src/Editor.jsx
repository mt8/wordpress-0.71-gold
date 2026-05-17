/**
 * EN: The custom block editor component for the WordPress 0.71 block editor.
 *     It mounts @wordpress/block-editor's BlockEditorProvider with the full
 *     editing chrome added in Issue #79:
 *       - a per-block toolbar (the floating toolbar rendered by BlockTools),
 *       - a Document Overview panel (ListView, the block outline),
 *       - a settings sidebar with a Post panel (post_status + post_category)
 *         and a Block panel (block attributes via BlockInspector).
 *     It loads a 0.71 post via the load.php JSON endpoint, parses its
 *     post_content into a block tree, and saves the serialized block markup
 *     plus the status / category back through save.php.
 * JA: WordPress 0.71 ブロックエディタのカスタムコンポーネント。
 *     @wordpress/block-editor の BlockEditorProvider をマウントし、
 *     Issue #79 で追加した完全な編集 UI を備える:
 *       - 各ブロックツールバー(BlockTools が描画するフローティングツールバー)、
 *       - ドキュメント概観パネル(ListView、ブロックアウトライン)、
 *       - 設定サイドバー(Post パネル = post_status + post_category、
 *         Block パネル = BlockInspector によるブロック属性)。
 *     load.php JSON エンドポイント経由で 0.71 の投稿を読み込み、その
 *     post_content をブロックツリーへ解析し、シリアライズしたブロック
 *     マークアップとステータス / カテゴリーを save.php で保存し戻す。
 */
import { useState, useEffect, useCallback } from '@wordpress/element';
import { parse, serialize } from '@wordpress/blocks';
import {
	BlockEditorProvider,
	BlockList,
	BlockTools,
	BlockInspector,
	BlockBreadcrumb,
	WritingFlow,
	ObserveTyping,
	// EN: ListView is exported under the __experimental name in this
	//     @wordpress/block-editor version (15.19.0).
	// JA: この @wordpress/block-editor 版(15.19.0)では ListView は
	//     __experimental 名で公開されている。
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
} from '@wordpress/components';
import { ShortcutProvider } from '@wordpress/keyboard-shortcuts';

/**
 * EN: Settings handed to BlockEditorProvider.
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
 * JA: BlockEditorProvider へ渡す設定。
 *
 *     ブロックのツールバー / インスペクタにある文字組み・色・余白などの
 *     操作子は、エディタの「設定」によって出し分けられる。`useSettings()`
 *     はそれらを `settings.__experimentalFeatures`(本物の WordPress では
 *     theme.json から供給される)から読み取る。settings を渡さないと
 *     ブロックエディタストアは素の既定値のままで `typography.textAlign` が
 *     undefined となり、段落ブロックのテキスト配置ツールバー操作子が
 *     描画されない。
 *
 *     このスタンドアロンエディタには theme.json が無いため、相当する機能
 *     フラグをここで直接与える。`appearanceTools` は一般的な外観操作子を
 *     有効化し、`typography.textAlign` が段落の「テキストを揃える」操作子を
 *     フローティングツールバーへ出す鍵となる。
 */
const EDITOR_SETTINGS = {
	// EN: hasFixedToolbar=false keeps the floating per-block toolbar.
	// JA: hasFixedToolbar=false でフローティングの各ブロックツールバーを保つ。
	hasFixedToolbar: false,
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
 * EN: The post-status options offered by 0.71's own editor (b2edit.form.php).
 * JA: 0.71 自身のエディタ(b2edit.form.php)が提供する投稿ステータス選択肢。
 */
const STATUS_OPTIONS = [
	{ value: 'publish', label: 'Publish' },
	{ value: 'draft', label: 'Draft' },
	{ value: 'private', label: 'Private' },
];

/**
 * EN: An editor instance bound to one WordPress 0.71 post.
 * JA: 1 つの WordPress 0.71 投稿に紐づくエディタインスタンス。
 *
 * @param {Object} props        Component props.
 * @param {Object} props.config Boot config from editor.php.
 */
export function Editor( { config } ) {
	const [ blocks, setBlocks ] = useState( [] );
	const [ title, setTitle ] = useState( '' );
	const [ status, setStatus ] = useState( 'loading' );
	const [ message, setMessage ] = useState( '' );

	// EN: Post settings surfaced in the sidebar's Post panel.
	// JA: サイドバーの Post パネルに表示する投稿設定。
	const [ postStatus, setPostStatus ] = useState( 'publish' );
	const [ postCategory, setPostCategory ] = useState( 0 );
	const [ categories, setCategories ] = useState( [] );

	// EN: Toggle for the Document Overview (list-view) panel.
	// JA: ドキュメント概観(リストビュー)パネルの表示切り替え。
	const [ showOverview, setShowOverview ] = useState( true );

	// EN: Load the post once on mount.
	// JA: マウント時に一度だけ投稿を読み込む。
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
				// EN: parse() turns block-markup (or plain HTML) into blocks.
				//     A legacy 0.71 post with no <!-- wp:* --> delimiters is
				//     parsed as a single classic ("freeform") block.
				// JA: parse() はブロックマークアップ(または素の HTML)を
				//     ブロックへ変換する。<!-- wp:* --> 区切りの無いレガシーな
				//     0.71 投稿は 1 つのクラシック(freeform)ブロックになる。
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
		// EN: serialize() produces the <!-- wp:* --> block markup that gets
		//     stored verbatim in 0.71's post_content column.
		// JA: serialize() は <!-- wp:* --> のブロックマークアップを生成し、
		//     それが 0.71 の post_content カラムへそのまま保存される。
		const content = serialize( blocks );
		fetch( config.saveEndpoint, {
			method: 'POST',
			credentials: 'include',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify( {
				post: config.postId,
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
			.then( () => {
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
		config.postId,
	] );

	if ( status === 'loading' ) {
		return (
			<div className="be-state">
				Loading post #{ config.postId }&hellip;
			</div>
		);
	}

	// EN: Category options for the Post panel selector. SelectControl needs
	//     string values, so cat_ID is stringified here and parsed back on
	//     change.
	// JA: Post パネルのセレクタ用カテゴリー選択肢。SelectControl は文字列値
	//     を要するため cat_ID を文字列化し、変更時に数値へ戻す。
	const categoryOptions = categories.map( ( cat ) => ( {
		value: String( cat.id ),
		label: `${ cat.name } (#${ cat.id })`,
	} ) );

	return (
		<div className="be-app">
			<header className="be-toolbar">
				<div className="be-toolbar-left">
					<a className="be-link" href={ config.adminUrl }>
						← Back to wp-admin
					</a>
					<span className="be-badge">WordPress 0.71</span>
					<Button
						size="compact"
						icon="menu"
						label="Document Overview"
						showTooltip
						variant={ showOverview ? 'primary' : 'secondary' }
						onClick={ () =>
							setShowOverview( ( prev ) => ! prev )
						}
						aria-pressed={ showOverview }
					/>
				</div>
				<div className="be-toolbar-right">
					<a
						className="be-link"
						href={ config.frontEndUrl }
						target="_blank"
						rel="noreferrer"
					>
						View on 0.71 front end
					</a>
					<Button
						variant="primary"
						onClick={ onSave }
						isBusy={ status === 'saving' }
						disabled={ status === 'saving' }
					>
						{ status === 'saving'
							? 'Saving…'
							: 'Save to WordPress 0.71' }
					</Button>
				</div>
			</header>

			{ message && (
				<div className="be-notice">
					<Notice
						status={ status === 'error' ? 'error' : 'success' }
						isDismissible={ false }
					>
						{ message }
					</Notice>
				</div>
			) }

			<input
				className="be-title"
				type="text"
				value={ title }
				placeholder="Post title"
				onChange={ ( e ) => setTitle( e.target.value ) }
			/>

			<ShortcutProvider>
				<SlotFillProvider>
					<BlockEditorProvider
						value={ blocks }
						onInput={ setBlocks }
						onChange={ setBlocks }
						settings={ EDITOR_SETTINGS }
					>
						<div className="be-body">
							{ showOverview && (
								<aside className="be-overview">
									<Panel header="Document Overview">
										<PanelBody>
											{ /* EN: ListView is the block outline / list view.
											     JA: ListView はブロックのアウトライン / リストビュー。 */ }
											<ListView />
										</PanelBody>
									</Panel>
								</aside>
							) }

							<div className="be-canvas">
								{ /* EN: BlockTools renders the floating per-block
								       toolbar (bold, alignment, ...) above the
								       selected block; it needs Popover.Slot.
								     JA: BlockTools が選択ブロックの上にフローティング
								       の各ブロックツールバー(太字・配置など)を
								       描画する。Popover.Slot が必要。 */ }
								<BlockTools>
									<WritingFlow>
										<ObserveTyping>
											<BlockList />
										</ObserveTyping>
									</WritingFlow>
								</BlockTools>
								<div className="be-breadcrumb">
									<BlockBreadcrumb />
								</div>
							</div>

							<aside className="be-sidebar">
								{ /* EN: Post panel -- post_status and the
								       single post_category of 0.71.
								     JA: Post パネル -- 0.71 の post_status と
								       単一の post_category。 */ }
								<Panel>
									<PanelBody
										title="Post"
										initialOpen={ true }
									>
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
											value={ String(
												postCategory
											) }
											options={
												categoryOptions.length
													? categoryOptions
													: [
															{
																value: '0',
																label: 'General (#0)',
															},
													  ]
											}
											onChange={ ( value ) =>
												setPostCategory(
													Number( value )
												)
											}
											__nextHasNoMarginBottom
										/>
									</PanelBody>
									{ /* EN: Block panel -- attributes of the
									       selected block via BlockInspector.
									     JA: Block パネル -- 選択ブロックの
									       属性を BlockInspector で表示。 */ }
									<PanelBody
										title="Block"
										initialOpen={ true }
									>
										<BlockInspector />
									</PanelBody>
								</Panel>
							</aside>
						</div>

						{ /* EN: Popover.Slot must be rendered for block
						       toolbars, dropdowns and inspector controls
						       (which render into popovers) to appear.
						     JA: ブロックツールバー・ドロップダウン・
						       インスペクタ操作(ポップオーバーへ描画される)
						       を表示するには Popover.Slot の描画が必須。 */ }
						<Popover.Slot />
					</BlockEditorProvider>
				</SlotFillProvider>
			</ShortcutProvider>
		</div>
	);
}
