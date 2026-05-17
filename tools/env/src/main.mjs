/*
 * 071-env command dispatcher.
 *
 *     Ties the pure modules together: parse argv (cli.mjs), load the merged
 *     configuration (config.mjs), derive the Compose environment variables
 *     (env-vars.mjs) and the runtime `mappings` override (mappings.mjs), build
 *     the `docker` argv (compose.mjs), prompt for destructive actions
 *     (prompt.mjs), run lifecycle scripts (lifecycle.mjs), and run `docker`
 *     (docker.mjs). bin/071-env.mjs is a thin wrapper around `main`.
 */

import { parseArgs, isKnownCommand, helpText, COMMANDS } from './cli.mjs';
import { buildComposeArgs } from './compose.mjs';
import { confirm } from './prompt.mjs';
import { runDocker } from './docker.mjs';
import { loadConfig } from './config.mjs';
import { deriveEnv } from './env-vars.mjs';
import { writeMappingsOverride } from './mappings.mjs';
import { runLifecycleScript, lifecycleCommand } from './lifecycle.mjs';

/**
 * Run 071-env for a given raw argv. Returns the process exit code instead
 *     of calling process.exit, so it is straightforward to test.
 * @param {string[]} argv Raw argv, excluding `node` and the script path.
 * @returns {Promise<number>} the exit code.
 */
export async function main( argv ) {
	const { command, args, help } = parseArgs( argv );

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

	let dockerArgs;
	try {
		dockerArgs = buildComposeArgs( command, args, extraFiles );
	} catch ( err ) {
		process.stderr.write( `071-env: ${ err.message }\n` );
		return 1;
	}

	// Pass WP_PORT / DB_PORT / PHP_VERSION so docker-compose.yml's variable
	//     substitution picks up the configured values.
	const code = runDocker( dockerArgs, deriveEnv( config ) );

	// `afterStart` runs only after a successful `start`, so the hook can
	//     rely on the containers being up.
	if ( command === 'start' && code === 0 && lifecycleCommand( config, 'afterStart' ) !== null ) {
		return runLifecycleScript( config, 'afterStart' );
	}

	return code;
}

export { COMMANDS };
