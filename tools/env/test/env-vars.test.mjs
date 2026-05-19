/*
 * Unit tests for tools/env/src/env-vars.mjs -- deriving the Compose environment
 *     variables (WP_PORT / DB_PORT / PHP_VERSION, and DB_NAME / DB_USER /
 *     DB_PASSWORD from wpConfig) from a config.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveEnv, ENV_VARS, DB_ENV_KEYS } from '../src/env-vars.mjs';
import { defaultConfig } from '../src/config.mjs';

test( 'ENV_VARS: maps the three config fields to Compose variable names', () => {
	assert.equal( ENV_VARS.port, 'WP_PORT' );
	assert.equal( ENV_VARS.dbPort, 'DB_PORT' );
	assert.equal( ENV_VARS.phpVersion, 'PHP_VERSION' );
} );

test( 'deriveEnv: the defaults derive 8080 / 3306 / 8.3', () => {
	const env = deriveEnv( defaultConfig() );
	assert.equal( env.WP_PORT, '8080' );
	assert.equal( env.DB_PORT, '3306' );
	assert.equal( env.PHP_VERSION, '8.3' );
} );

test( 'deriveEnv: custom values pass through', () => {
	const env = deriveEnv( { port: 9000, dbPort: 3399, phpVersion: '8.2' } );
	assert.equal( env.WP_PORT, '9000' );
	assert.equal( env.DB_PORT, '3399' );
	assert.equal( env.PHP_VERSION, '8.2' );
} );

test( 'deriveEnv: numeric ports are stringified (Compose substitutes strings)', () => {
	const env = deriveEnv( { port: 9000, dbPort: 3399, phpVersion: '8.3' } );
	assert.equal( typeof env.WP_PORT, 'string' );
	assert.equal( typeof env.DB_PORT, 'string' );
} );

test( 'deriveEnv: with no wpConfig DB keys, returns exactly the three Compose variables', () => {
	assert.deepEqual( Object.keys( deriveEnv( defaultConfig() ) ).sort(), [
		'DB_PORT',
		'PHP_VERSION',
		'WP_PORT',
	] );
} );

test( 'DB_ENV_KEYS: the wpConfig keys that also configure the container', () => {
	assert.deepEqual( DB_ENV_KEYS, [ 'DB_NAME', 'DB_USER', 'DB_PASSWORD' ] );
} );

test( 'deriveEnv: a wpConfig DB_NAME is passed through to the container', () => {
	const env = deriveEnv( {
		...defaultConfig(),
		wpConfig: { DB_NAME: 'mt8' },
	} );
	assert.equal( env.DB_NAME, 'mt8' );
} );

test( 'deriveEnv: all three database keys pass through when set', () => {
	const env = deriveEnv( {
		...defaultConfig(),
		wpConfig: { DB_NAME: 'mt8', DB_USER: 'mt8user', DB_PASSWORD: 'secret' },
	} );
	assert.equal( env.DB_NAME, 'mt8' );
	assert.equal( env.DB_USER, 'mt8user' );
	assert.equal( env.DB_PASSWORD, 'secret' );
} );

test( 'deriveEnv: non-database wpConfig keys are not turned into env vars', () => {
	const env = deriveEnv( {
		...defaultConfig(),
		wpConfig: { blogname: 'my weblog', DB_NAME: 'mt8' },
	} );
	assert.equal( env.DB_NAME, 'mt8' );
	assert.equal( 'blogname' in env, false );
	assert.deepEqual( Object.keys( env ).sort(), [
		'DB_NAME',
		'DB_PORT',
		'PHP_VERSION',
		'WP_PORT',
	] );
} );
