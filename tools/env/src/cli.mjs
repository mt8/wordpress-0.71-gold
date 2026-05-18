/*
 * Command-line parsing and help text for 071-env.
 *
 *     This module holds the pure parsing logic -- it turns a raw argv into a
 *     recognised command plus its positional arguments, and produces the help
 *     text. It performs no I/O and spawns no processes, so it is fully
 *     unit-testable.
 */

/**
 * The subcommands 071-env recognises, mapped to a one-line description.
 */
export const COMMANDS = {
	start: 'Build and start the environment (docker compose up -d --build)',
	stop: 'Stop the environment without removing it (docker compose stop)',
	destroy: 'Stop and remove the environment AND its database volume (docker compose down -v)',
	status: 'Show the status of the environment (docker compose ps)',
	logs: 'Follow the environment logs (docker compose logs -f [service])',
	run: 'Run a command in the web container (run cli <args> | run <command...>)',
};

/**
 * The flags that turn on verbose mode, where 071-env streams the raw
 *     underlying `docker compose` output instead of its own curated summary.
 *     Both `--debug` and `--verbose` are accepted.
 */
export const DEBUG_FLAGS = [ '--debug', '--verbose' ];

/**
 * Parse the raw argv (excluding `node` and the script path) into a
 *     structured command.
 *
 *     The result's `help` flag is set when no command is given or when
 *     `-h` / `--help` appears before the command -- `071-env`, `071-env -h`
 *     and `071-env --help` all show usage. A `--help` *after* a command (for
 *     example `071-env run cli --help`) is left in `args` so it can be passed
 *     through to the underlying tool.
 *
 *     `--debug` / `--verbose` before the command (`071-env --debug start`)
 *     sets the `debug` flag and is stripped from the result. The same flag
 *     directly after the command (`071-env start --debug`) is also honoured
 *     and stripped. A `--debug` deeper in a `run` argument list is left in
 *     place so it can be forwarded to the underlying tool.
 *
 * @param {string[]} argv Raw argument vector, excluding node and script path.
 * @returns {{ command: string|null, args: string[], help: boolean,
 *             debug: boolean }}
 */
export function parseArgs( argv ) {
	// Strip a leading --debug / --verbose flag; remember it was present.
	let debug = false;
	const rest = [];
	let stripping = true;
	for ( const arg of argv ) {
		if ( stripping && DEBUG_FLAGS.includes( arg ) ) {
			debug = true;
			continue;
		}
		// Stop stripping once a non-flag token (the command) is seen.
		stripping = false;
		rest.push( arg );
	}

	// No arguments left -> show help.
	if ( rest.length === 0 ) {
		return { command: null, args: [], help: true, debug };
	}

	const first = rest[ 0 ];

	// A help flag before any command -> show help.
	if ( first === '-h' || first === '--help' || first === 'help' ) {
		return { command: null, args: [], help: true, debug };
	}

	const args = rest.slice( 1 );

	// Honour a --debug / --verbose flag placed directly after the command
	//     (`071-env start --debug`). For `run`, the flag is left in place so
	//     it can be forwarded to the underlying tool.
	if ( first !== 'run' ) {
		for ( let i = args.length - 1; i >= 0; i-- ) {
			if ( DEBUG_FLAGS.includes( args[ i ] ) ) {
				debug = true;
				args.splice( i, 1 );
			}
		}
	}

	return {
		command: first,
		args,
		help: false,
		debug,
	};
}

/**
 * Report whether a string is a recognised 071-env subcommand.
 * @param {string|null} command The candidate command.
 * @returns {boolean}
 */
export function isKnownCommand( command ) {
	return command !== null && Object.prototype.hasOwnProperty.call( COMMANDS, command );
}

/**
 * Build the usage / help text.
 * @returns {string} the help text (no trailing newline).
 */
export function helpText() {
	const lines = [
		'071-env -- wp-env-style environment manager for WordPress 0.71-gold',
		'',
		'Usage:',
		'  071-env [--debug] <command> [arguments]',
		'',
		'Commands:',
	];

	for ( const [ name, description ] of Object.entries( COMMANDS ) ) {
		lines.push( `  ${ name.padEnd( 9 ) } ${ description }` );
	}

	lines.push(
		'',
		'Options:',
		'  --debug, --verbose            Show the full underlying `docker compose` output',
		'',
		'Examples:',
		'  071-env start                 Build and start the containers',
		'  071-env --debug start         Start, showing the full Docker build output',
		'  071-env run cli post list     Run `071 post list` inside the web container',
		'  071-env run php -v            Run an arbitrary command in the web container',
		'  071-env logs web              Follow the web service logs',
		'  071-env destroy               Tear down the environment (prompts first)',
	);

	return lines.join( '\n' );
}
