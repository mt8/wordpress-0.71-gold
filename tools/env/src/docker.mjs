/*
 * Docker process execution for 071-env.
 *
 *     This module is the impure boundary: it spawns the `docker` binary with
 *     an argument vector built by compose.mjs. The argv construction is kept
 *     in compose.mjs so it stays unit-testable; this module only runs it.
 *
 *     Two run modes are supported. `runDocker` inherits stdio so the user
 *     sees Compose's output directly -- used for `logs`, `run`, and any
 *     command in `--debug` mode. `runDockerCaptured` buffers stdout / stderr
 *     instead, so 071-env can hide a noisy build behind its own curated
 *     summary while still surfacing the buffered output on failure.
 */

import { spawnSync } from 'node:child_process';
import { repoRoot } from './paths.mjs';

/**
 * Translate a `spawnSync` failure (the `docker` binary itself could not be
 *     run) into a clear 071-env error message on stderr. Shared by both run
 *     modes so the diagnostics stay consistent.
 * @param {Error} error The `spawnSync` result error.
 * @returns {void}
 */
function reportSpawnError( error ) {
	if ( error.code === 'ENOENT' ) {
		process.stderr.write(
			'071-env: could not find the `docker` binary. Install Docker and ' +
				'ensure it is on PATH.\n'
		);
	} else {
		process.stderr.write( `071-env: failed to run docker: ${ error.message }\n` );
	}
}

/**
 * Run `docker` with the given argument vector, inheriting stdio so the
 *     user sees Compose's output directly. The child runs with the repository
 *     root as its working directory; combined with the `--project-directory`
 *     argument compose.mjs adds, the relative paths inside the Compose files
 *     (`./src`, `./tools/cli`) resolve correctly regardless of the caller's
 *     own cwd.
 *
 *     `extraEnv` is merged onto the inherited environment before the child is
 *     spawned. 071-env uses it to pass `WP_PORT` / `DB_PORT` / `PHP_VERSION`,
 *     which `docker-compose.yml` reads through variable substitution. Because
 *     each of those also has a `:-default` in the Compose file, omitting them
 *     (a plain `docker compose up`) still works.
 *
 *     This streaming mode is used for `logs` and `run` (inherently raw
 *     streams) and for every command in `--debug` mode.
 *
 * @param {string[]} args The argument vector for the `docker` binary.
 * @param {Record<string,string>} extraEnv Variables merged onto the env.
 * @returns {number} the `docker` process exit code (1 if it could not start).
 */
export function runDocker( args, extraEnv = {} ) {
	const result = spawnSync( 'docker', args, {
		stdio: 'inherit',
		cwd: repoRoot,
		env: { ...process.env, ...extraEnv },
	} );

	if ( result.error ) {
		reportSpawnError( result.error );
		return 1;
	}

	return result.status === null ? 1 : result.status;
}

/**
 * Run `docker` with the given argument vector, capturing stdout and
 *     stderr instead of streaming them. Used for commands whose raw Compose
 *     output 071-env replaces with its own curated summary (`start`, `stop`,
 *     `destroy`, `status`) when not in `--debug` mode.
 *
 *     The captured output is returned so the caller can decide what to do:
 *     hide it on success, or surface it on failure. The exit code follows the
 *     same convention as `runDocker` (1 when the binary could not start).
 *
 * @param {string[]} args The argument vector for the `docker` binary.
 * @param {Record<string,string>} extraEnv Variables merged onto the env.
 * @returns {{ code: number, stdout: string, stderr: string }}
 */
export function runDockerCaptured( args, extraEnv = {} ) {
	const result = spawnSync( 'docker', args, {
		stdio: [ 'inherit', 'pipe', 'pipe' ],
		cwd: repoRoot,
		env: { ...process.env, ...extraEnv },
		encoding: 'utf8',
	} );

	if ( result.error ) {
		reportSpawnError( result.error );
		return { code: 1, stdout: '', stderr: '' };
	}

	return {
		code: result.status === null ? 1 : result.status,
		stdout: result.stdout || '',
		stderr: result.stderr || '',
	};
}
