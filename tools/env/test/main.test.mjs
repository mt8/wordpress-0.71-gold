/*
 * Unit tests for tools/env/src/main.mjs -- the dispatcher's non-Docker paths.
 *     `main()` only reaches `runDocker` for commands that actually operate the
 *     environment; the help and unknown-command paths return without spawning
 *     Docker and can be tested directly. stdout / stderr are captured so the
 *     tests stay quiet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { main } from '../src/main.mjs';

/**
 * Run `main` with stdout / stderr captured. Returns the exit code plus the
 *     captured streams.
 * @param {string[]} argv The argv to pass to main.
 * @returns {Promise<{ code: number, stdout: string, stderr: string }>}
 */
async function runCaptured( argv ) {
	const originalOut = process.stdout.write;
	const originalErr = process.stderr.write;
	let stdout = '';
	let stderr = '';
	process.stdout.write = ( chunk ) => {
		stdout += chunk;
		return true;
	};
	process.stderr.write = ( chunk ) => {
		stderr += chunk;
		return true;
	};
	try {
		const code = await main( argv );
		return { code, stdout, stderr };
	} finally {
		process.stdout.write = originalOut;
		process.stderr.write = originalErr;
	}
}

test( 'main: no arguments prints help and exits 0', async () => {
	const { code, stdout } = await runCaptured( [] );
	assert.equal( code, 0 );
	assert.match( stdout, /Usage:/ );
} );

test( 'main: --help prints help and exits 0', async () => {
	const { code, stdout } = await runCaptured( [ '--help' ] );
	assert.equal( code, 0 );
	assert.match( stdout, /071-env/ );
} );

test( 'main: an unknown command exits 1 and reports the command', async () => {
	const { code, stderr } = await runCaptured( [ 'frobnicate' ] );
	assert.equal( code, 1 );
	assert.match( stderr, /unknown command 'frobnicate'/ );
} );

test( 'main: `run` with no command exits 1 with a helpful error', async () => {
	const { code, stderr } = await runCaptured( [ 'run' ] );
	assert.equal( code, 1 );
	assert.match( stderr, /command is required/ );
} );
