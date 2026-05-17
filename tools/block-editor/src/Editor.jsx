/**
 * EN: The custom block editor component for the WordPress 0.71 block editor.
 *     It mounts @wordpress/block-editor's BlockEditorProvider with the full
 *     editing chrome added in Issue #79:
 *       - a per-block toolbar (the floating toolbar rendered by BlockTools),
 *       - a Document Overview panel (ListView, the block outline),
 *       - a settings sidebar with a Post tab (post_status + post_category)
 *         and a Block tab (block attributes via BlockInspector).
 *     It loads a 0.71 post via the load.php JSON endpoint, parses its
 *     post_content into a block tree, and saves the serialized block markup
 *     plus the status / category back through save.php.
 * JA: WordPress 0.71 ブロックエディタのカスタムコンポーネント。
 *     @wordpress/block-editor の BlockEditorProvider をマウントし、
 *     Issue #79 で追加した完全な編集 UI を備える:
 *       - 各ブロックツールバー(BlockTools が描画するフローティングツールバー)、
 *       - ドキュメント概観パネル(ListView、ブロックアウトライン)、
 *       - 設定サイドバー(Post タブ = post_status + post_category、
 *         Block タブ = BlockInspector によるブロック属性)。
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
	Inserter,
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
	TabPanel,
	Icon,
} from '@wordpress/components';
import { blockDefault, listView, page, plus, wordpress } from '@wordpress/icons';
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
	// EN: mediaUpload is the integration seam @wordpress/block-editor uses for
	//     uploads. The Image / Gallery / Cover blocks call it instead of
	//     hard-coding the REST API (WordPress 0.71 has none). Each file is
	//     POSTed as multipart/form-data to the api/upload.php JSON endpoint --
	//     a sibling of load.php / save.php, so it is reached at the relative
	//     URL 'upload.php' just like editor.php's loadEndpoint / saveEndpoint
	//     defaults. The endpoint replies { id, url, alt }; onFileChange is
	//     called with the resulting media objects so the Image block's upload
	//     button works. credentials:'include' carries 0.71's auth cookies.
	// JA: mediaUpload は @wordpress/block-editor がアップロードに用いる統合点。
	//     画像 / ギャラリー / カバーブロックは REST API をハードコードせず
	//     (WordPress 0.71 には無い)これを呼ぶ。各ファイルを
	//     multipart/form-data として api/upload.php の JSON エンドポイントへ
	//     POST する -- load.php / save.php と並ぶため、editor.php の
	//     loadEndpoint / saveEndpoint の既定と同じく相対 URL 'upload.php' で
	//     到達する。エンドポイントは { id, url, alt } を返し、得たメディア
	//     オブジェクトで onFileChange を呼ぶことで画像ブロックの
	//     アップロードボタンが機能する。credentials:'include' が 0.71 の
	//     認証クッキーを運ぶ。
	mediaUpload( { filesList, allowedTypes, onFileChange, onError } ) {
		const files = Array.from( filesList || [] );
		if ( files.length === 0 ) {
			return;
		}

		// EN: Optional client-side type pre-filter. allowedTypes is a list of
		//     MIME types or top-level types (e.g. 'image'); the server still
		//     enforces its own allow-list, this is only for a fast UX reject.
		// JA: 任意のクライアント側タイプ事前フィルタ。allowedTypes は MIME
		//     タイプまたは最上位タイプ(例 'image')の一覧。サーバーは独自の
		//     許可リストを引き続き強制し、これは素早い UX 拒否のためだけ。
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

	// EN: The post id this editor is bound to. It starts from the boot config
	//     (0 in Issue #96's new-post mode) and is adopted from save.php's
	//     response after the first INSERT, so later saves UPDATE the same row.
	// JA: このエディタが紐づく投稿 ID。ブート設定から開始し(Issue #96 の
	//     新規投稿モードでは 0)、最初の INSERT 後に save.php の応答から採用
	//     する。以降の保存は同じ行を UPDATE する。
	const [ postId, setPostId ] = useState( config.postId );

	// EN: True until the new post has been saved once and adopted an id.
	// JA: 新規投稿が一度保存され id を採用するまで true。
	const isNew = postId <= 0;

	// EN: Post settings surfaced in the sidebar's Post panel.
	// JA: サイドバーの Post パネルに表示する投稿設定。
	const [ postStatus, setPostStatus ] = useState( 'publish' );
	const [ postCategory, setPostCategory ] = useState( 0 );
	const [ categories, setCategories ] = useState( [] );

	// EN: Toggle for the Document Overview (list-view) panel. It starts off,
	//     matching the modern WordPress editor where the list view is hidden
	//     until the user opens it from the header.
	// JA: ドキュメント概観(リストビュー)パネルの表示切り替え。最新の
	//     WordPress エディタに合わせ初期値はオフで、ユーザーがヘッダーから
	//     開くまでリストビューは隠れている。
	const [ showOverview, setShowOverview ] = useState( false );

	// EN: Load the post once on mount. In Issue #96's new-post mode config.postId
	//     is 0, and load.php answers with an empty post shape (blank title /
	//     content, draft status) plus the category list, so the same code path
	//     starts the editor empty without a special case here.
	// JA: マウント時に一度だけ投稿を読み込む。Issue #96 の新規投稿モードでは
	//     config.postId は 0 で、load.php は空の投稿の形(空のタイトル /
	//     コンテンツ・draft ステータス)とカテゴリー一覧を返すため、ここに
	//     特別な分岐を設けずに同じ経路でエディタを空の状態で始められる。
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
				// EN: postId is 0 for a not-yet-saved new post; save.php
				//     reads that as the INSERT path.
				// JA: 未保存の新規投稿では postId は 0。save.php はそれを
				//     INSERT 経路として読む。
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
				// EN: Adopt the id returned by save.php. For a new post this
				//     is the freshly INSERTed row's id, so every later save
				//     UPDATEs that same post instead of inserting again.
				// JA: save.php が返す id を採用する。新規投稿ではこれが
				//     たった今 INSERT した行の id であり、以降の保存は同じ
				//     投稿を UPDATE し、再 INSERT しない。
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

	// EN: Front-end URL for the "View on 0.71 front end" link. The boot config
	//     URL embeds config.postId, which is 0 for a new post; once the post
	//     has been saved and an id adopted, rebuild the URL for that id.
	// JA: 「View on 0.71 front end」リンク用のフロントエンド URL。ブート設定の
	//     URL は config.postId を埋め込んでおり、新規投稿では 0。投稿が保存
	//     され id を採用したら、その id で URL を組み立て直す。
	const frontEndUrl = isNew
		? config.frontEndUrl
		: `../../index.php?p=${ postId }`;

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
		// EN: ShortcutProvider / SlotFillProvider / BlockEditorProvider wrap
		//     the whole .be-app -- header included -- so header controls have
		//     the block editor store. The header's Inserter ("+" button)
		//     needs that store, and so does BlockBreadcrumb at the bottom.
		// JA: ShortcutProvider / SlotFillProvider / BlockEditorProvider が
		//     .be-app 全体(ヘッダー含む)を包むため、ヘッダーの操作子が
		//     ブロックエディタストアを得られる。ヘッダーの Inserter(「+」
		//     ボタン)も下部の BlockBreadcrumb もそのストアを必要とする。
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
								{ /* EN: The WordPress logo button -- the black
								       W square at the top-left of the modern
								       editor -- navigates back to wp-admin.
								     JA: WordPress ロゴボタン -- 最新エディタ
								       左上の黒い W の四角 -- は wp-admin へ
								       戻る。 */ }
								<Button
									className="be-wp-logo"
									icon={ wordpress }
									iconSize={ 36 }
									label="Back to wp-admin"
									showTooltip
									href={ config.adminUrl }
								/>
								{ /* EN: The "+" block inserter. Inserter's
								       renderToggle replaces its default toggle
								       with a clean "+" icon button; the
								       inserter panel opens in a Popover.
								     JA: 「+」ブロックインサーター。Inserter の
								       renderToggle が既定のトグルを素の「+」
								       アイコンボタンへ置き換える。インサー
								       ターパネルは Popover で開く。 */ }
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
								{ /* EN: The hamburger / list-view button
								       toggles the Document Overview panel.
								     JA: ハンバーガー / リストビューボタンが
								       Document Overview パネルを切り替える。 */ }
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
								{ /* EN: A new post has no front-end URL until it is saved
								       and an id is adopted; hide the link until then.
								     JA: 新規投稿は保存して id を採用するまでフロントエンド
								       URL を持たない。それまではリンクを隠す。 */ }
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
											{ /* EN: ListView is the block outline / list view.
											     JA: ListView はブロックのアウトライン / リストビュー。 */ }
											<ListView />
										</PanelBody>
									</Panel>
								</aside>
							) }

							<div className="be-canvas">
								{ /* EN: The post title sits at the top of the
								       content column, the width of the canvas
								       -- above the writing flow, not spanning
								       the Document Overview / settings columns.
								     JA: 投稿タイトルはコンテンツカラムの上部、
								       キャンバスの幅に置かれる -- writing flow
								       の上で、Document Overview / 設定カラムに
								       はまたがらない。 */ }
								<input
									className="be-title"
									type="text"
									value={ title }
									placeholder="Post title"
									onChange={ ( e ) =>
										setTitle( e.target.value )
									}
								/>
								{ /* EN: BlockTools renders the floating per-block
								       toolbar (bold, alignment, ...) above the
								       selected block; it needs Popover.Slot.
								     JA: BlockTools が選択ブロックの上にフローティング
								       の各ブロックツールバー(太字・配置など)を
								       描画する。Popover.Slot が必要。 */ }
								<BlockTools className="be-block-tools">
									<WritingFlow>
										<ObserveTyping>
											<BlockList />
										</ObserveTyping>
									</WritingFlow>
								</BlockTools>
							</div>

							<aside className="be-sidebar">
								{ /* EN: The settings sidebar as tabs, like modern WordPress
								       -- a Post tab (the 0.71 post_status and single
								       post_category) and a Block tab (BlockInspector).
								       Full height, with no collapse control (Issue #152).
								     JA: 設定サイドバーを最新の WordPress のようにタブ化する
								       -- Post タブ(0.71 の post_status と単一の
								       post_category)と Block タブ(BlockInspector)。
								       全高、開閉トグルなし(Issue #152)。 */ }
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

						{ /* EN: BlockBreadcrumb sits after .be-body as a
						       full-width bar pinned at the bottom of the
						       editor. It stays inside BlockEditorProvider
						       because BlockBreadcrumb needs the store.
						     JA: BlockBreadcrumb は .be-body の後に、エディタ
						       下部に固定された全幅バーとして置かれる。
						       BlockBreadcrumb はストアを必要とするため
						       BlockEditorProvider の内側のまま。 */ }
						<div className="be-breadcrumb">
							<BlockBreadcrumb />
						</div>

						{ /* EN: Popover.Slot must be rendered for block
						       toolbars, dropdowns, the inserter panel and
						       inspector controls (which render into popovers)
						       to appear.
						     JA: ブロックツールバー・ドロップダウン・インサー
						       ターパネル・インスペクタ操作(ポップオーバーへ
						       描画される)を表示するには Popover.Slot の描画が
						       必須。 */ }
						<Popover.Slot />
					</div>
				</BlockEditorProvider>
			</SlotFillProvider>
		</ShortcutProvider>
	);
}
