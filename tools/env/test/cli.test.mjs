/*
 * EN: Unit tests for tools/env/src/cli.mjs -- argument and command parsing.
 *     Run with Node's built-in test runner: `node --test`.
 * JA: tools/env/src/cli.mjs の単体テスト -- 引数とコマンドの解析。
 *     Node 組み込みのテストランナーで実行する: `node --test`。
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs, isKnownCommand, helpText, COMMANDS } from '../src/cli.mjs';

test( 'parseArgs: no arguments requests help', () => {
	const result = parseArgs( [] );
	assert.equal( result.command, null );
	assert.deepEqual( result.args, [] );
	assert.equal( result.help, true );
} );

test( 'parseArgs: -h / --help / help before a command request help', () => {
	for ( const flag of [ '-h', '--help', 'help' ] ) {
		const result = parseArgs( [ flag ] );
		assert.equal( result.help, true, `${ flag } should request help` );
		assert.equal( result.command, null );
	}
} );

test( 'parseArgs: a bare command parses with no args', () => {
	const result = parseArgs( [ 'start' ] );
	assert.equal( result.command, 'start' );
	assert.deepEqual( result.args, [] );
	assert.equal( result.help, false );
} );

test( 'parseArgs: a command keeps its trailing arguments in order', () => {
	const result = parseArgs( [ 'run', 'cli', 'post', 'list' ] );
	assert.equal( result.command, 'run' );
	assert.deepEqual( result.args, [ 'cli', 'post', 'list' ] );
	assert.equal( result.help, false );
} );

test( 'parseArgs: --help after a command is passed through, not consumed', () => {
	// EN: `071-env run cli --help` should forward `--help` to 071-cli.
	// JA: `071-env run cli --help` は `--help` を 071-cli へ転送するべき。
	const result = parseArgs( [ 'run', 'cli', '--help' ] );
	assert.equal( result.command, 'run' );
	assert.deepEqual( result.args, [ 'cli', '--help' ] );
	assert.equal( result.help, false );
} );

test( 'parseArgs: an unknown command is returned verbatim (not help)', () => {
	const result = parseArgs( [ 'frobnicate' ] );
	assert.equal( result.command, 'frobnicate' );
	assert.equal( result.help, false );
} );

test( 'isKnownCommand: recognises every documented command', () => {
	for ( const name of Object.keys( COMMANDS ) ) {
		assert.equal( isKnownCommand( name ), true, `${ name } should be known` );
	}
} );

test( 'isKnownCommand: rejects unknown commands and null', () => {
	assert.equal( isKnownCommand( 'frobnicate' ), false );
	assert.equal( isKnownCommand( '' ), false );
	assert.equal( isKnownCommand( null ), false );
} );

test( 'COMMANDS: exposes the seven documented subcommands', () => {
	assert.deepEqual( Object.keys( COMMANDS ).sort(), [
		'destroy',
		'logs',
		'run',
		'start',
		'status',
		'stop',
	].sort() );
} );

test( 'helpText: mentions usage and every command', () => {
	const text = helpText();
	assert.match( text, /Usage:/ );
	for ( const name of Object.keys( COMMANDS ) ) {
		assert.match( text, new RegExp( name ), `help text should mention ${ name }` );
	}
} );
