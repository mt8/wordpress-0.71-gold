/*
 * Friendly, wp-env-style terminal output for 071-env.
 *
 *     071-env wraps `docker compose`, whose raw output is a wall of build and
 *     container noise. This module turns the result of each curated command
 *     into a concise, readable message -- in the spirit of wp-env, which
 *     prints a short summary instead of the underlying Docker output.
 *
 *     Every function here is pure: it takes plain data (a resolved config, an
 *     exit code, the captured Docker output) and returns a string. It performs
 *     no I/O and spawns nothing, so it is fully unit-testable. main.mjs is the
 *     only place these strings are written to a stream.
 */

/**
 * The path, relative to the site root, of the WordPress 0.71 admin area.
 *     WordPress 0.71 (b2/cafelog) serves its admin pages from `wp-admin/`
 *     (the entry point is `wp-admin/index.php`).
 */
export const ADMIN_PATH = '/wp-admin/';

/**
 * Build the `http://localhost:<port>` site URL for a resolved config.
 * @param {{ port: number }} config The merged, validated configuration.
 * @returns {string} the WordPress 0.71 site URL.
 */
export function siteUrl( config ) {
	return `http://localhost:${ config.port }`;
}

/**
 * Build the WordPress 0.71 admin URL for a resolved config.
 * @param {{ port: number }} config The merged, validated configuration.
 * @returns {string} the admin URL.
 */
export function adminUrl( config ) {
	return `${ siteUrl( config ) }${ ADMIN_PATH }`;
}

/**
 * Build the one-line progress message shown while a curated command runs.
 *     Hidden in `--debug` mode, where the raw Docker output is streamed
 *     instead.
 * @param {string} command The 071-env subcommand.
 * @returns {string|null} the progress line, or null when there is none.
 */
export function progressMessage( command ) {
	switch ( command ) {
		case 'start':
			return '071-env: starting the WordPress 0.71 environment (this may take a while on the first run)...';
		case 'stop':
			return '071-env: stopping the WordPress 0.71 environment...';
		case 'destroy':
			return '071-env: destroying the WordPress 0.71 environment...';
		case 'status':
			return null;
		default:
			return null;
	}
}

/**
 * Build the wp-env-style success summary printed after `071-env start`.
 *     It lists the WordPress 0.71 URL, the admin URL and the MySQL host
 *     port -- the few facts a developer needs, instead of the Docker build
 *     log.
 * @param {{ port: number, dbPort: number }} config The resolved configuration.
 * @returns {string} the multi-line summary (no trailing newline).
 */
export function startSummary( config ) {
	return [
		'',
		'WordPress 0.71 environment started.',
		'',
		`  WordPress: ${ siteUrl( config ) }`,
		`  Admin:     ${ adminUrl( config ) }`,
		`  MySQL:     localhost:${ config.dbPort }`,
		'',
	].join( '\n' );
}

/**
 * Build the one-line success message for a curated command other than
 *     `start` (which has its own multi-line summary).
 * @param {string} command The 071-env subcommand.
 * @returns {string|null} the success line, or null when there is none.
 */
export function successMessage( command ) {
	switch ( command ) {
		case 'stop':
			return '071-env: environment stopped. Run `071-env start` to bring it back up.';
		case 'destroy':
			return '071-env: environment destroyed; the database volume was removed.';
		default:
			return null;
	}
}

/**
 * Build the curated `071-env status` output from the captured `docker
 *     compose ps -a` text. The Compose table is kept (it is already readable)
 *     but framed with a short header; when no container exists a clear hint
 *     replaces the bare empty table, and the URLs are shown only while the
 *     stack is actually running.
 * @param {string} psOutput The captured stdout of `docker compose ps -a`.
 * @param {{ port: number, dbPort: number }} config The resolved configuration.
 * @returns {string} the curated status text (no trailing newline).
 */
export function statusReport( psOutput, config ) {
	const trimmed = psOutput.trim();
	const lines = trimmed === '' ? [] : trimmed.split( '\n' );

	// `docker compose ps -a` prints only a header row when no container
	//     exists -- the environment was never started, or was destroyed.
	if ( lines.length <= 1 ) {
		return [
			'071-env: the WordPress 0.71 environment does not exist.',
			'Run `071-env start` to build and start it.',
		].join( '\n' );
	}

	// A container row whose STATUS begins with `Up` means it is running.
	//     If no row is `Up`, the stack exists but is stopped.
	const containerRows = lines.slice( 1 );
	const running = containerRows.some( ( row ) => /\bUp\b/.test( row ) );

	const report = [
		'071-env: WordPress 0.71 environment status',
		'',
		trimmed,
		'',
	];

	if ( running ) {
		report.push(
			`  WordPress: ${ siteUrl( config ) }`,
			`  Admin:     ${ adminUrl( config ) }`,
			`  MySQL:     localhost:${ config.dbPort }`
		);
	} else {
		report.push( '071-env: the environment is stopped. Run `071-env start` to bring it back up.' );
	}

	return report.join( '\n' );
}

/**
 * Build the failure message for a curated command. The captured Docker
 *     output is always appended so the user can diagnose the problem --
 *     071-env never swallows an error.
 * @param {string} command The 071-env subcommand that failed.
 * @param {{ stdout: string, stderr: string }} captured The captured output.
 * @returns {string} the failure text (no trailing newline).
 */
export function failureMessage( command, captured ) {
	const parts = [ `071-env: \`${ command }\` failed. Underlying docker compose output:`, '' ];
	const body = `${ captured.stdout || '' }${ captured.stderr || '' }`.trimEnd();
	parts.push( body === '' ? '(docker produced no output)' : body );
	return parts.join( '\n' );
}
