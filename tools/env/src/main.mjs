/*
 * 071-env command dispatcher.
 *
 *     Ties the pure modules together: parse argv (cli.mjs), load the merged
 *     configuration (config.mjs), derive the Compose environment variables
 *     (env-vars.mjs) and the runtime `mappings` override (mappings.mjs), build
 *     the `docker` argv (compose.mjs), prompt for destructive actions
 *     (prompt.mjs), run lifecycle scripts (lifecycle.mjs), and run `docker`
 *     (docker.mjs). bin/071-env.mjs is a thin wrapper around `main`.
 *
 *     Output is curated in the spirit of wp-env (output.mjs): `start` /
 *     `stop` / `destroy` / `status` hide the raw `docker compose` output
 *     behind a concise summary, while `logs` and `run` stay raw passthrough
 *     streams. A `--debug` / `--verbose` flag streams the full Docker output
 *     for every command, and a failure always surfaces the Docker output.
 */

import { parseArgs, isKnownCommand, helpText, COMMANDS } from './cli.mjs';
import { buildComposeArgs } from './compose.mjs';
import { confirm } from './prompt.mjs';
import { runDocker, runDockerCaptured } from './docker.mjs';
import { loadConfig } from './config.mjs';
import { deriveEnv } from './env-vars.mjs';
import { writeMappingsOverride } from './mappings.mjs';
import { writeB2Config } from './b2config.mjs';
import { runLifecycleScript, lifecycleCommand } from './lifecycle.mjs';
import {
	progressMessage,
	successMessage,
	startSummary,
	statusReport,
	failureMessage,
} from './output.mjs';

/**
 * The commands whose raw `docker compose` output 071-env replaces with its
 *     own curated summary. `logs` and `run` are deliberately absent -- they
 *     are inherently raw streams and stay passthrough.
 */
const CURATED_COMMANDS = [ 'start', 'stop', 'destroy', 'status' ];

/**
 * Run 071-env for a given raw argv. Returns the process exit code instead
 *     of calling process.exit, so it is straightforward to test.
 * @param {string[]} argv Raw argv, excluding `node` and the script path.
 * @returns {Promise<number>} the exit code.
 */
export async function main( argv ) {
	const { command, args, help, debug } = parseArgs( argv );

	if ( help ) {
		process.stdout.write( `${ helpText() }\n` );
		return 0;
	}

	if ( ! isKnownCommand( command ) ) {
		process.stderr.write( `071-env: unknown command '${ command }'.\n\n` );
		process.stderr.write( `${ helpText() }\n` );
		return 1;
	}

	// Load `.071-env.json` (+ `.071-env.override.json`) once. A malformed
	//     or invalid config aborts here with a clear message.
	let config;
	try {
		config = loadConfig();
	} catch ( err ) {
		process.stderr.write( `071-env: ${ err.message }\n` );
		return 1;
	}

	// `destroy` removes the database volume; require explicit confirmation
	//     before doing anything. Anything other than `y`/`yes` aborts.
	if ( command === 'destroy' ) {
		process.stdout.write(
			'071-env destroy will run `docker compose down -v`.\n' +
				'This permanently DELETES the database volume and all its data.\n'
		);
		const confirmed = await confirm( 'Are you sure you want to destroy the environment?' );
		if ( ! confirmed ) {
			process.stdout.write( 'Aborted. The environment was left untouched.\n' );
			return 0;
		}

		// `beforeDestroy` runs after confirmation but before Compose tears
		//     the environment down -- so the hook can still reach a live stack
		//     (for example to back the database up). A failing hook aborts the
		//     destroy.
		const beforeCode = runLifecycleScript( config, 'beforeDestroy' );
		if ( beforeCode !== 0 ) {
			process.stderr.write( '071-env: beforeDestroy script failed; aborting destroy.\n' );
			return beforeCode;
		}
	}

	// Generate (or remove) the runtime `mappings` Compose override. When
	//     `mappings` has entries the returned path is appended as an extra
	//     `-f` so the extra bind mounts take effect.
	let extraFiles = [];
	try {
		const mappingsFile = writeMappingsOverride( config.mappings );
		if ( mappingsFile !== null ) {
			extraFiles = [ mappingsFile ];
		}
	} catch ( err ) {
		process.stderr.write( `071-env: could not write the mappings override: ${ err.message }\n` );
		return 1;
	}

	// On `start`, generate src/b2config.php from src/b2config-sample.php
	//     with any `wpConfig` overrides applied. The blog source is mounted
	//     into the web container, so the file must exist before Compose
	//     brings the container up.
	if ( command === 'start' ) {
		try {
			writeB2Config( config.wpConfig );
		} catch ( err ) {
			process.stderr.write(
				`071-env: could not write src/b2config.php: ${ err.message }\n`
			);
			return 1;
		}
	}

	let dockerArgs;
	try {
		dockerArgs = buildComposeArgs( command, args, extraFiles );
	} catch ( err ) {
		process.stderr.write( `071-env: ${ err.message }\n` );
		return 1;
	}

	// Pass WP_PORT / DB_PORT / PHP_VERSION so docker-compose.yml's variable
	//     substitution picks up the configured values.
	const env = deriveEnv( config );

	// `logs` / `run` always stream the raw Compose output -- they are
	//     inherently raw streams and stay passthrough.
	if ( ! CURATED_COMMANDS.includes( command ) ) {
		return runDocker( dockerArgs, env );
	}

	// `--debug` streams the full Compose output for a curated command. On
	//     success it still appends the friendly summary -- except `status`,
	//     whose raw `ps -a` table already is the report -- so the diagnostic
	//     mode is a superset of the default one.
	if ( debug ) {
		const code = runDocker( dockerArgs, env );
		if ( code !== 0 ) {
			// The raw output already went to the terminal; just exit.
			process.stderr.write( `071-env: \`${ command }\` failed (exit ${ code }).\n` );
			return code;
		}
		if ( command !== 'status' ) {
			const summary = debugSummary( command, config );
			if ( summary !== '' ) {
				process.stdout.write( `${ summary }\n` );
			}
		}
		return finishStart( command, code, config );
	}

	// Curated command without `--debug`: hide the raw Docker output behind a
	//     concise message. The output is captured so it can still be shown if
	//     the command fails.
	const progress = progressMessage( command );
	if ( progress !== null ) {
		process.stdout.write( `${ progress }\n` );
	}

	const result = runDockerCaptured( dockerArgs, env );

	if ( result.code !== 0 ) {
		// Never swallow a failure -- surface the underlying Docker output.
		process.stderr.write( `${ failureMessage( command, result ) }\n` );
		return result.code;
	}

	process.stdout.write( `${ curatedSuccess( command, result, config ) }\n` );
	return finishStart( command, result.code, config );
}

/**
 * Build the curated success output for a command that completed cleanly,
 *     in the default (non-debug) mode.
 * @param {string} command The 071-env subcommand.
 * @param {{ stdout: string }} result The captured Docker output.
 * @param {object} config The resolved configuration.
 * @returns {string} the curated success text (no trailing newline).
 */
function curatedSuccess( command, result, config ) {
	if ( command === 'start' ) {
		return startSummary( config );
	}
	if ( command === 'status' ) {
		return statusReport( result.stdout, config );
	}
	return successMessage( command ) || '';
}

/**
 * Build the friendly summary appended after the raw Docker output in
 *     `--debug` mode. `status` is excluded by the caller (its raw `ps -a`
 *     table is already the report).
 * @param {string} command The 071-env subcommand.
 * @param {object} config The resolved configuration.
 * @returns {string} the summary text (no trailing newline).
 */
function debugSummary( command, config ) {
	if ( command === 'start' ) {
		return startSummary( config );
	}
	return successMessage( command ) || '';
}

/**
 * Run the `afterStart` lifecycle hook when `start` succeeded, then return
 *     the effective exit code. For every other command, or a failed `start`,
 *     the code passes straight through.
 *
 *     `afterStart` runs only after a successful `start`, so the hook can rely
 *     on the containers being up.
 * @param {string} command The 071-env subcommand.
 * @param {number} code    The Docker exit code.
 * @param {object} config  The resolved configuration.
 * @returns {number} the effective exit code.
 */
function finishStart( command, code, config ) {
	if ( command === 'start' && code === 0 && lifecycleCommand( config, 'afterStart' ) !== null ) {
		return runLifecycleScript( config, 'afterStart' );
	}
	return code;
}

export { COMMANDS };
