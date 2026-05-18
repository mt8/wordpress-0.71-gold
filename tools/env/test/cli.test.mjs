/*
 * Unit tests for tools/env/src/cli.mjs -- argument and command parsing.
 *     Run with Node's built-in test runner: `node --test`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { parseArgs, isKnownCommand, helpText, COMMANDS } from '../src/cli.mjs';

test( 'parseArgs: no arguments requests help', () => {
	const result = parseArgs( [] );
	assert.equal( result.command, null );
	assert.deepEqual( result.args, [] );
	assert.equal( result.help, true );
	assert.equal( result.debug, false );
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
	assert.equal( result.debug, false );
} );

test( 'parseArgs: --debug before the command sets debug and is stripped', () => {
	const result = parseArgs( [ '--debug', 'start' ] );
	assert.equal( result.command, 'start' );
	assert.deepEqual( result.args, [] );
	assert.equal( result.debug, true );
} );

test( 'parseArgs: --verbose is accepted as an alias of --debug', () => {
	const result = parseArgs( [ '--verbose', 'status' ] );
	assert.equal( result.command, 'status' );
	assert.equal( result.debug, true );
} );

test( 'parseArgs: --debug after the command sets debug and is stripped', () => {
	const result = parseArgs( [ 'start', '--debug' ] );
	assert.equal( result.command, 'start' );
	assert.deepEqual( result.args, [] );
	assert.equal( result.debug, true );
} );

test( 'parseArgs: --debug inside `run` args is forwarded, not consumed', () => {
	// `071-env run php --debug` should forward `--debug` to the command.
	const result = parseArgs( [ 'run', 'php', '--debug' ] );
	assert.equal( result.command, 'run' );
	assert.deepEqual( result.args, [ 'php', '--debug' ] );
	assert.equal( result.debug, false );
} );

test( 'parseArgs: a leading --debug before `run` still sets debug', () => {
	const result = parseArgs( [ '--debug', 'run', 'php', '-v' ] );
	assert.equal( result.command, 'run' );
	assert.deepEqual( result.args, [ 'php', '-v' ] );
	assert.equal( result.debug, true );
} );

test( 'parseArgs: a command keeps its trailing arguments in order', () => {
	const result = parseArgs( [ 'run', 'cli', 'post', 'list' ] );
	assert.equal( result.command, 'run' );
	assert.deepEqual( result.args, [ 'cli', 'post', 'list' ] );
	assert.equal( result.help, false );
} );

test( 'parseArgs: --help after a command is passed through, not consumed', () => {
	// `071-env run cli --help` should forward `--help` to 071-cli.
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

test( 'helpText: documents the --debug flag', () => {
	const text = helpText();
	assert.match( text, /--debug/ );
	assert.match( text, /--verbose/ );
} );
