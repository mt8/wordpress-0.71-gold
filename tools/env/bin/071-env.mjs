#!/usr/bin/env node
/*
 * 071-env Node entry point.
 *
 *     071-env is a wp-env-style environment manager for WordPress 0.71-gold.
 *     It wraps the repository's existing Docker Compose environment -- it does
 *     not replace it. See docs/071-tooling.md section 4.
 *
 *     This file is a thin wrapper: it delegates to `main` (src/main.mjs) and
 *     exits with the resulting code. All real logic lives under src/.
 */

import { main } from '../src/main.mjs';

main( process.argv.slice( 2 ) )
	.then( ( code ) => {
		process.exit( code );
	} )
	.catch( ( err ) => {
		process.stderr.write( `071-env: unexpected error: ${ err && err.message ? err.message : err }\n` );
		process.exit( 1 );
	} );
