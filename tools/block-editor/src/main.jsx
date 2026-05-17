/**
 * Entry point for the WordPress 0.71 custom block-editor prototype
 *     (Issue #65). Registers the core static blocks, then mounts the editor
 *     component into #block-editor-root.
 */
import { createRoot } from '@wordpress/element';
import { registerCoreBlocks } from '@wordpress/block-library';
import { setFreeformContentHandlerName } from '@wordpress/blocks';
// Importing @wordpress/format-library registers the core RichText formats
//     (bold, italic, link, ...) as a side effect, so they appear in the block
//     toolbar when editing text.
import '@wordpress/format-library';

// Stylesheets for the bundled @wordpress/* UI. Vite collects them into
//     the build's CSS, which editor.php links from the manifest.
import '@wordpress/components/build-style/style.css';
import '@wordpress/block-editor/build-style/style.css';
import '@wordpress/block-editor/build-style/content.css';
import '@wordpress/block-library/build-style/style.css';
import '@wordpress/block-library/build-style/editor.css';
// The 0.71 theme stylesheet (src/layout2b.css), the same one src/index.php
//     loads on the front end. The editor is non-iframed, so importing it here
//     applies it to the editor canvas -- the editor and the front end then
//     share both layout2b.css and the block-library CSS, so authored content
//     looks the same in the editor preview and on the published page
//     (Issue #94).
import '../../../src/layout2b.css';

import { Editor } from './Editor.jsx';
import './app.css';

// The core static blocks (paragraph, heading, list, image, quote, ...)
//     register themselves client-side -- no server-side register_block_type()
//     is needed, which is exactly why this works on WordPress 0.71.
registerCoreBlocks();

// Route non-block ("freeform") content -- a classic b2edit.php post that has
//     no <!-- wp:* --> delimiters -- to the Custom HTML block (core/html,
//     already registered by registerCoreBlocks above). Without a freeform
//     handler, parse() falls through to core/missing and renders such a post
//     body as an unsupported block with an empty name (Issue #164).
setFreeformContentHandlerName( 'core/html' );

// Configuration comes from the boot page (editor.php). When the bundle is
//     opened directly by Vite dev, fall back to sensible defaults.
const config = window.BLOCK_EDITOR_PROTOTYPE || {
	postId: 1,
	loadEndpoint: '/src/block-editor/api/load.php',
	saveEndpoint: '/src/block-editor/api/save.php',
	frontEndUrl: '/src/index.php?p=1',
};

const container = document.getElementById( 'block-editor-root' );
const root = createRoot( container );
root.render( <Editor config={ config } /> );
