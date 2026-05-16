/**
 * EN: The custom block editor component for the WordPress 0.71 prototype
 *     (Issue #65). It mounts @wordpress/block-editor's BlockEditorProvider
 *     with BlockTools / BlockList / BlockInspector, loads a 0.71 post via the
 *     load.php JSON endpoint, parses its post_content into a block tree, and
 *     saves the serialized block markup back through save.php.
 * JA: WordPress 0.71 試作(Issue #65)のカスタムブロックエディタ
 *     コンポーネント。@wordpress/block-editor の BlockEditorProvider を
 *     BlockTools / BlockList / BlockInspector とともにマウントし、load.php
 *     JSON エンドポイント経由で 0.71 の投稿を読み込み、その post_content を
 *     ブロックツリーへ解析し、シリアライズしたブロックマークアップを
 *     save.php で保存し戻す。
 */
import { useState, useEffect, useCallback } from '@wordpress/element';
import { parse, serialize } from '@wordpress/blocks';
import {
	BlockEditorProvider,
	BlockList,
	BlockTools,
	BlockInspector,
	WritingFlow,
	ObserveTyping,
} from '@wordpress/block-editor';
import {
	Popover,
	SlotFillProvider,
	Button,
	Notice,
} from '@wordpress/components';
import { ShortcutProvider } from '@wordpress/keyboard-shortcuts';

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
				setMessage( 'Saved. / 保存しました。' );
			} )
			.catch( ( err ) => {
				setStatus( 'error' );
				setMessage( String( err.message || err ) );
			} );
	}, [ blocks, title, config.saveEndpoint, config.postId ] );

	if ( status === 'loading' ) {
		return (
			<div className="be-state">
				Loading post #{ config.postId }&hellip; / 投稿
				#{ config.postId } を読み込み中&hellip;
			</div>
		);
	}

	return (
		<div className="be-app">
			<header className="be-toolbar">
				<div className="be-toolbar-left">
					<strong>Block Editor Prototype</strong>
					<span className="be-badge">Issue #65 / experimental</span>
				</div>
				<div className="be-toolbar-right">
					<a
						className="be-link"
						href={ config.frontEndUrl }
						target="_blank"
						rel="noreferrer"
					>
						View on 0.71 front end / 0.71 で表示
					</a>
					<Button
						variant="primary"
						onClick={ onSave }
						isBusy={ status === 'saving' }
						disabled={ status === 'saving' }
					>
						{ status === 'saving'
							? 'Saving… / 保存中…'
							: 'Save to WordPress 0.71 / 0.71 に保存' }
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
				placeholder="Post title / 投稿タイトル"
				onChange={ ( e ) => setTitle( e.target.value ) }
			/>

			<ShortcutProvider>
				<SlotFillProvider>
					<BlockEditorProvider
						value={ blocks }
						onInput={ setBlocks }
						onChange={ setBlocks }
						settings={ {
							hasFixedToolbar: true,
						} }
					>
						<div className="be-body">
							<div className="be-canvas">
								<BlockTools>
									<WritingFlow>
										<ObserveTyping>
											<BlockList />
										</ObserveTyping>
									</WritingFlow>
								</BlockTools>
							</div>
							<aside className="be-sidebar">
								<BlockInspector />
							</aside>
						</div>
						<Popover.Slot />
					</BlockEditorProvider>
				</SlotFillProvider>
			</ShortcutProvider>
		</div>
	);
}
