#!/usr/bin/env node
/*
 * 071-now Node entry point.
 *
 *     071-now is a wp-now-style one-command launcher for the
 *     browser-based WordPress 0.71 playground. `npx 071-now` builds the
 *     071-now overlay, starts the playground's Vite server, opens the
 *     default browser at the playground URL and prints that URL --
 *     mirroring `npx @wp-now/wp-now start` (Issue #171).
 *
 *     This is a thin launcher. The real work is done by the playground's
 *     existing pieces:
 *       1. scripts/build-overlay.mjs builds the overlay (it snapshots
 *          src/ and builds the block editor, and already skips the
 *          block-editor build when the bundle is current),
 *       2. Vite's programmatic API serves the playground; vite.config.js
 *          already sets the COOP / COEP cross-origin-isolation headers on
 *          both `server` and `preview`, so the launcher only starts Vite.
 *
 *     The playground package directory is resolved from this script's own
 *     location, so `npx 071-now` works regardless of the caller's cwd --
 *     exactly like `npx 071` and `npx 071-env`.
 */

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// This file is tools/playground/bin/071-now.mjs, so the playground
//     package is one level up.
const here = dirname( fileURLToPath( import.meta.url ) );
const playgroundDir = join( here, '..' );

const HELP = `071-now -- one-command launcher for the WordPress 0.71 playground.

Usage:
  npx 071-now [start] [--port <port>]

Commands:
  start            Launch the playground (the default; bare \`071-now\`
                   does the same).

Options:
  --port <port>    Serve on the given port instead of Vite's default.
  -h, --help       Show this help.

\`071-now\` builds the 071-now overlay, starts the playground's Vite
server, opens the default browser at the playground URL and prints it.
`;

/**
 * Parse the launcher's arguments. Accepts a bare invocation, an optional
 *     `start` subcommand alias, `-h` / `--help`, and an optional
 *     `--port <port>` (or `--port=<port>`).
 * @param {string[]} argv The arguments after the node script path.
 * @return {{ help: boolean, port: number|undefined }} The parsed options.
 */
function parseArgs( argv ) {
	let help = false;
	let port;

	for ( let i = 0; i < argv.length; i++ ) {
		const arg = argv[ i ];
		if ( arg === '-h' || arg === '--help' ) {
			help = true;
		} else if ( arg === 'start' ) {
			// `start` is accepted as a wp-now-style alias of the bare
			//     invocation; it carries no extra behaviour.
			continue;
		} else if ( arg === '--port' ) {
			port = Number( argv[ ++i ] );
		} else if ( arg.startsWith( '--port=' ) ) {
			port = Number( arg.slice( '--port='.length ) );
		} else {
			process.stderr.write( `071-now: unknown argument: ${ arg }\n\n` );
			process.stdout.write( HELP );
			process.exit( 1 );
		}
	}

	if ( port !== undefined && ( ! Number.isInteger( port ) || port <= 0 ) ) {
		process.stderr.write( '071-now: --port expects a positive integer.\n' );
		process.exit( 1 );
	}

	return { help, port };
}

/**
 * Build the 071-now overlay by running scripts/build-overlay.mjs in the
 *     playground package. Exits the launcher if the build fails.
 */
function buildOverlay() {
	process.stdout.write( '071-now: building the overlay…\n' );
	const result = spawnSync(
		process.execPath,
		[ join( playgroundDir, 'scripts', 'build-overlay.mjs' ) ],
		{ cwd: playgroundDir, stdio: 'inherit' }
	);
	if ( result.error ) {
		process.stderr.write(
			`071-now: failed to build the overlay: ${ result.error.message }\n`
		);
		process.exit( 1 );
	}
	if ( result.status !== 0 ) {
		process.stderr.write( '071-now: overlay build failed.\n' );
		process.exit( result.status === null ? 1 : result.status );
	}
}

/**
 * Open a URL in the default browser, best-effort. A failure here is not
 *     fatal -- the launcher still prints the URL to open by hand.
 * @param {string} url The URL to open.
 */
function openBrowser( url ) {
	const opener =
		process.platform === 'darwin'
			? { command: 'open', args: [ url ] }
			: process.platform === 'win32'
				? { command: 'cmd', args: [ '/c', 'start', '', url ] }
				: { command: 'xdg-open', args: [ url ] };

	const result = spawnSync( opener.command, opener.args, {
		stdio: 'ignore',
	} );
	if ( result.error ) {
		process.stderr.write(
			`071-now: could not open a browser automatically (${ result.error.message }); open the URL above by hand.\n`
		);
	}
}

/**
 * Build the overlay, start the playground's Vite server, open the
 *     default browser at the playground URL and print it.
 * @param {number|undefined} port An optional port override.
 */
async function start( port ) {
	buildOverlay();

	process.stdout.write( '071-now: starting the playground server…\n' );

	// Vite is a dependency of the playground package; import it from
	//     there so the launcher resolves the same Vite the `dev` script
	//     uses, regardless of the caller's cwd.
	const { createServer } = await import( 'vite' );
	const server = await createServer( {
		root: playgroundDir,
		configFile: join( playgroundDir, 'vite.config.js' ),
		server: port !== undefined ? { port, strictPort: true } : {},
	} );
	await server.listen();

	const url = server.resolvedUrls?.local?.[ 0 ];
	if ( ! url ) {
		process.stderr.write(
			'071-now: the playground server started but reported no URL.\n'
		);
		process.exit( 1 );
	}

	process.stdout.write( `\n071-now: playground running at ${ url }\n` );
	process.stdout.write( '071-now: press Ctrl+C to stop.\n\n' );
	openBrowser( url );
}

const { help, port } = parseArgs( process.argv.slice( 2 ) );

if ( help ) {
	process.stdout.write( HELP );
	process.exit( 0 );
}

start( port ).catch( ( err ) => {
	process.stderr.write(
		`071-now: failed to start the playground: ${ err && err.message ? err.message : err }\n`
	);
	process.exit( 1 );
} );
