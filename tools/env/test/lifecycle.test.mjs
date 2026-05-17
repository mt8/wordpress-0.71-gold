/*
 * Unit tests for tools/env/src/lifecycle.mjs -- lifecycle-hook lookup and
 *     dispatch. `lifecycleCommand` is pure; `runLifecycleScript` is exercised
 *     with harmless shell commands (`true`, `false`, `echo`) so it stays fast
 *     and side-effect-free. stdout / stderr are captured to keep the run
 *     quiet.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { lifecycleCommand, runLifecycleScript } from '../src/lifecycle.mjs';

test( 'lifecycleCommand: returns the configured command for a hook', () => {
	const config = { lifecycleScripts: { afterStart: 'echo started' } };
	assert.equal( lifecycleCommand( config, 'afterStart' ), 'echo started' );
} );

test( 'lifecycleCommand: an unconfigured hook returns null', () => {
	assert.equal( lifecycleCommand( { lifecycleScripts: {} }, 'afterStart' ), null );
	assert.equal( lifecycleCommand( {}, 'beforeDestroy' ), null );
	assert.equal( lifecycleCommand( { lifecycleScripts: {} }, 'beforeDestroy' ), null );
} );

test( 'lifecycleCommand: a blank command counts as unconfigured', () => {
	assert.equal( lifecycleCommand( { lifecycleScripts: { afterStart: '   ' } }, 'afterStart' ), null );
} );

test( 'lifecycleCommand: afterStart and beforeDestroy are looked up independently', () => {
	const config = {
		lifecycleScripts: { afterStart: 'echo a', beforeDestroy: 'echo b' },
	};
	assert.equal( lifecycleCommand( config, 'afterStart' ), 'echo a' );
	assert.equal( lifecycleCommand( config, 'beforeDestroy' ), 'echo b' );
} );

/**
 * Run `fn` with stdout / stderr captured, returning the captured streams.
 * @param {() => *} fn The body to run.
 * @returns {{ result: *, stdout: string, stderr: string }}
 */
function captured( fn ) {
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
		const result = fn();
		return { result, stdout, stderr };
	} finally {
		process.stdout.write = originalOut;
		process.stderr.write = originalErr;
	}
}

test( 'runLifecycleScript: an unconfigured hook is a no-op success (exit 0)', () => {
	const { result } = captured( () => runLifecycleScript( {}, 'afterStart' ) );
	assert.equal( result, 0 );
} );

test( 'runLifecycleScript: a succeeding command returns 0', () => {
	const { result } = captured( () =>
		runLifecycleScript( { lifecycleScripts: { afterStart: 'true' } }, 'afterStart' )
	);
	assert.equal( result, 0 );
} );

test( 'runLifecycleScript: a failing command returns its non-zero exit code', () => {
	const { result } = captured( () =>
		runLifecycleScript( { lifecycleScripts: { beforeDestroy: 'false' } }, 'beforeDestroy' )
	);
	assert.notEqual( result, 0 );
} );

test( 'runLifecycleScript: announces the hook and command before running', () => {
	const { stdout } = captured( () =>
		runLifecycleScript( { lifecycleScripts: { afterStart: 'echo run' } }, 'afterStart' )
	);
	assert.match( stdout, /afterStart/ );
	assert.match( stdout, /echo run/ );
} );

test( 'runLifecycleScript: the hook command actually executes (echo output appears)', () => {
	const { stdout } = captured( () =>
		runLifecycleScript(
			{ lifecycleScripts: { afterStart: 'echo lifecycle-marker' } },
			'afterStart'
		)
	);
	assert.match( stdout, /lifecycle-marker/ );
} );
