/*
 * Docker Compose argv construction for 071-env.
 *
 *     071-env wraps the repository's existing Docker Compose environment. It
 *     never replaces tools/env/docker-compose.yml; it layers
 *     tools/env/docker-compose.071.yml on top so the 071-cli package is
 *     reachable inside the `web` container (see docs/071-tooling.md
 *     section 4.3).
 *
 *     The functions here are pure: they take the parsed command and return the
 *     argument vector that would be passed to `docker`. They do not spawn
 *     anything -- that is run.mjs's job -- which keeps the argv construction
 *     unit-testable without Docker.
 */

import { baseComposeFile, overrideComposeFile, repoRoot } from './paths.mjs';

/**
 * The path to the 071-cli PHP entry point as seen *inside* the `web`
 *     container. tools/env/docker-compose.071.yml bind-mounts the repo's
 *     `tools/cli/` directory at /opt/071-cli, so the CLI script is at this
 *     fixed path.
 */
export const CLI_PHP_IN_CONTAINER = '/opt/071-cli/php/071-cli.php';

/**
 * The WordPress 0.71 install path inside the `web` container.
 *     tools/env/docker-compose.yml mounts `./src` as the Apache document root
 *     at /var/www/html, so 071-cli is pointed there with `--path`.
 */
export const WP_PATH_IN_CONTAINER = '/var/www/html';

/**
 * The Compose service that runs Apache + PHP 8.3. `run` commands exec in
 *     this service.
 */
export const WEB_SERVICE = 'web';

/**
 * The `--project-directory` argument that pins Compose's project
 *     directory to the repository root. The Compose files live in tools/env/
 *     but their in-file relative paths (`./src`, `./tools/cli`, the build
 *     context `.`, and the runtime mappings override's host paths) are
 *     repository-root-relative. Compose otherwise resolves them against the
 *     first `-f` file's directory (tools/env/), so this argument is what
 *     keeps every path resolving correctly.
 */
export const projectDirArgs = [ '--project-directory', repoRoot ];

/**
 * The leading arguments common to every `docker` invocation 071-env makes:
 *     the `compose` subcommand, the `--project-directory` pin, then the
 *     Compose files. Passing the base file and the cli/ override on every
 *     call is what makes the `cli/` bind mount take effect.
 *
 *     `extraFiles` carries any additional override files appended in order
 *     after the cli/ override -- in practice the runtime `mappings` override
 *     when `.071-env.json` configures extra bind mounts. Compose appends
 *     `volumes` cleanly across `-f` files, so the extra mounts add on without
 *     disturbing the existing ones.
 *
 * @param {string[]} extraFiles Additional Compose override file paths.
 * @returns {string[]} the shared `docker` argument prefix.
 */
export function composePrefix( extraFiles = [] ) {
	const prefix = [
		'compose',
		...projectDirArgs,
		'-f',
		baseComposeFile,
		'-f',
		overrideComposeFile,
	];
	for ( const file of extraFiles ) {
		prefix.push( '-f', file );
	}
	return prefix;
}

/**
 * Build the full `docker` argv for a 071-env subcommand.
 *
 *     `run` is special: `run cli <args>` execs the 071-cli PHP CLI inside the
 *     `web` container, and `run <command...>` execs an arbitrary command.
 *     Everything else maps directly onto a `docker compose` subcommand.
 *
 * @param {string} command The 071-env subcommand (start/stop/destroy/...).
 * @param {string[]} args  The positional arguments after the subcommand.
 * @param {string[]} extraFiles Additional Compose override file paths.
 * @returns {string[]} the argument vector to pass to the `docker` binary.
 * @throws {Error} if the command is not recognised.
 */
export function buildComposeArgs( command, args = [], extraFiles = [] ) {
	const prefix = composePrefix( extraFiles );

	switch ( command ) {
		case 'start':
			// Build images if needed, then start detached.
			return [ ...prefix, 'up', '-d', '--build' ];

		case 'stop':
			return [ ...prefix, 'stop' ];

		case 'destroy':
			// `-v` removes named volumes -- including the database volume.
			//     The confirmation prompt is enforced by the caller, not here.
			return [ ...prefix, 'down', '-v' ];

		case 'status':
			// `-a` includes stopped containers, so `071-env status` can tell
			//     a stopped stack apart from one that was never created.
			return [ ...prefix, 'ps', '-a' ];

		case 'logs': {
			// Follow logs; an optional service name narrows the output.
			const logsArgs = [ ...prefix, 'logs', '-f' ];
			if ( args.length > 0 ) {
				logsArgs.push( ...args );
			}
			return logsArgs;
		}

		case 'run':
			return buildRunArgs( args, extraFiles );

		default:
			throw new Error( `Unknown command: ${ command }` );
	}
}

/**
 * Build the `docker` argv for `071-env run ...`.
 *
 *     `run cli <args>`        -> exec the 071-cli PHP CLI in the `web`
 *                                container, with `--path` already pointing at
 *                                the in-container WordPress install. Inside
 *                                the container the DB host `db` resolves, so
 *                                no `--dbhost` is needed.
 *     `run <command...>`      -> exec an arbitrary command in the `web`
 *                                container.
 *
 * @param {string[]} args The arguments after `run`.
 * @param {string[]} extraFiles Additional Compose override file paths.
 * @returns {string[]} the argument vector to pass to the `docker` binary.
 * @throws {Error} if no command is given to run.
 */
export function buildRunArgs( args, extraFiles = [] ) {
	if ( args.length === 0 ) {
		throw new Error( 'run: a command is required (try `run cli post list`)' );
	}

	const prefix = composePrefix( extraFiles );

	if ( args[ 0 ] === 'cli' ) {
		// `run cli <cli-args>` -> php /opt/071-cli/php/071-cli.php <cli-args>
		//     --path=/var/www/html. The `--path` flag is appended so 071-cli
		//     finds the WordPress 0.71 source mounted in the container.
		const cliArgs = args.slice( 1 );
		return [
			...prefix,
			'exec',
			WEB_SERVICE,
			'php',
			CLI_PHP_IN_CONTAINER,
			...cliArgs,
			`--path=${ WP_PATH_IN_CONTAINER }`,
		];
	}

	// `run <command...>` -> exec the command verbatim in the `web` service.
	return [ ...prefix, 'exec', WEB_SERVICE, ...args ];
}
