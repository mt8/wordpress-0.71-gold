/*
 * Unit tests for tools/env/src/config.mjs -- config defaults, deep-merge,
 *     validation, and the two-file load (`.071-env.json` +
 *     `.071-env.override.json`). The filesystem-touching `loadConfig` is
 *     exercised against a temporary directory so the tests stay hermetic.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	defaultConfig,
	deepMerge,
	validateConfig,
	mergeConfigs,
	loadConfig,
	CONFIG_FILE,
	OVERRIDE_FILE,
	LIFECYCLE_HOOKS,
} from '../src/config.mjs';

test( 'defaultConfig: reproduces PR #110 behaviour (8080/3306, PHP 8.3)', () => {
	const config = defaultConfig();
	assert.equal( config.port, 8080 );
	assert.equal( config.dbPort, 3306 );
	assert.equal( config.phpVersion, '8.3' );
	assert.deepEqual( config.mappings, {} );
	assert.deepEqual( config.lifecycleScripts, {} );
} );

test( 'defaultConfig: returns a fresh object each call (no shared state)', () => {
	const a = defaultConfig();
	a.mappings.x = '/tmp';
	assert.deepEqual( defaultConfig().mappings, {} );
} );

test( 'deepMerge: scalars from source replace those in target', () => {
	const merged = deepMerge( { port: 8080, dbPort: 3306 }, { port: 9000 } );
	assert.equal( merged.port, 9000 );
	assert.equal( merged.dbPort, 3306 );
} );

test( 'deepMerge: nested objects merge key by key', () => {
	const merged = deepMerge(
		{ mappings: { '/a': '/host/a' } },
		{ mappings: { '/b': '/host/b' } }
	);
	assert.deepEqual( merged.mappings, { '/a': '/host/a', '/b': '/host/b' } );
} );

test( 'deepMerge: a nested key in source overrides the same key in target', () => {
	const merged = deepMerge(
		{ mappings: { '/a': '/old' } },
		{ mappings: { '/a': '/new' } }
	);
	assert.deepEqual( merged.mappings, { '/a': '/new' } );
} );

test( 'deepMerge: does not mutate either input', () => {
	const target = { mappings: { '/a': '/host/a' } };
	const source = { mappings: { '/b': '/host/b' } };
	deepMerge( target, source );
	assert.deepEqual( target, { mappings: { '/a': '/host/a' } } );
	assert.deepEqual( source, { mappings: { '/b': '/host/b' } } );
} );

test( 'validateConfig: an empty object is valid', () => {
	assert.doesNotThrow( () => validateConfig( {} ) );
} );

test( 'validateConfig: a full, well-formed config is valid', () => {
	assert.doesNotThrow( () =>
		validateConfig( {
			port: 9000,
			dbPort: 3307,
			phpVersion: '8.2',
			mappings: { '/var/www/html/wp-content/themes/x': './themes/x' },
			lifecycleScripts: { afterStart: 'echo hi', beforeDestroy: 'echo bye' },
		} )
	);
} );

test( 'validateConfig: an unknown top-level key is rejected', () => {
	assert.throws( () => validateConfig( { bogus: true } ), /unknown key 'bogus'/ );
} );

test( 'validateConfig: the top level must be an object', () => {
	assert.throws( () => validateConfig( [] ), /must be a JSON object/ );
	assert.throws( () => validateConfig( 'x' ), /must be a JSON object/ );
	assert.throws( () => validateConfig( null ), /must be a JSON object/ );
} );

test( 'validateConfig: port must be an integer in 1..65535', () => {
	assert.throws( () => validateConfig( { port: 'x' } ), /'port' must be an integer/ );
	assert.throws( () => validateConfig( { port: 0 } ), /'port' must be an integer/ );
	assert.throws( () => validateConfig( { port: 70000 } ), /'port' must be an integer/ );
	assert.throws( () => validateConfig( { port: 8080.5 } ), /'port' must be an integer/ );
	assert.doesNotThrow( () => validateConfig( { port: 8080 } ) );
} );

test( 'validateConfig: dbPort is validated the same way as port', () => {
	assert.throws( () => validateConfig( { dbPort: -1 } ), /'dbPort' must be an integer/ );
	assert.doesNotThrow( () => validateConfig( { dbPort: 3307 } ) );
} );

test( 'validateConfig: phpVersion must be a non-empty string', () => {
	assert.throws( () => validateConfig( { phpVersion: 8.3 } ), /'phpVersion' must be a non-empty string/ );
	assert.throws( () => validateConfig( { phpVersion: '' } ), /'phpVersion' must be a non-empty string/ );
	assert.doesNotThrow( () => validateConfig( { phpVersion: '8.3' } ) );
} );

test( 'validateConfig: mappings must be a string-valued object', () => {
	assert.throws( () => validateConfig( { mappings: [] } ), /'mappings' must be a JSON object/ );
	assert.throws( () => validateConfig( { mappings: { '/a': 5 } } ), /'mappings.\/a' must be a string/ );
	assert.doesNotThrow( () => validateConfig( { mappings: { '/a': './a' } } ) );
} );

test( 'validateConfig: lifecycleScripts values must be strings', () => {
	assert.throws(
		() => validateConfig( { lifecycleScripts: { afterStart: 5 } } ),
		/'lifecycleScripts.afterStart' must be a string/
	);
} );

test( 'validateConfig: an unknown lifecycle hook is rejected', () => {
	assert.throws(
		() => validateConfig( { lifecycleScripts: { afterTeatime: 'echo' } } ),
		/unknown lifecycle hook 'afterTeatime'/
	);
} );

test( 'validateConfig: afterStart and beforeDestroy are accepted hooks', () => {
	for ( const hook of LIFECYCLE_HOOKS ) {
		assert.doesNotThrow( () => validateConfig( { lifecycleScripts: { [ hook ]: 'echo' } } ) );
	}
} );

test( 'validateConfig: the error message names the source file', () => {
	assert.throws(
		() => validateConfig( { bogus: 1 }, OVERRIDE_FILE ),
		new RegExp( OVERRIDE_FILE.replace( '.', '\\.' ) )
	);
} );

test( 'mergeConfigs: with no layers returns the plain defaults', () => {
	assert.deepEqual( mergeConfigs( [] ), defaultConfig() );
} );

test( 'mergeConfigs: a project layer overrides the defaults', () => {
	const config = mergeConfigs( [ { data: { port: 9000 }, source: CONFIG_FILE } ] );
	assert.equal( config.port, 9000 );
	assert.equal( config.dbPort, 3306 );
} );

test( 'mergeConfigs: a later (override) layer wins over an earlier one', () => {
	const config = mergeConfigs( [
		{ data: { port: 9000, dbPort: 3307 }, source: CONFIG_FILE },
		{ data: { port: 9100 }, source: OVERRIDE_FILE },
	] );
	assert.equal( config.port, 9100 );
	assert.equal( config.dbPort, 3307 );
} );

test( 'mergeConfigs: mappings deep-merge across layers', () => {
	const config = mergeConfigs( [
		{ data: { mappings: { '/a': './a' } }, source: CONFIG_FILE },
		{ data: { mappings: { '/b': './b' } }, source: OVERRIDE_FILE },
	] );
	assert.deepEqual( config.mappings, { '/a': './a', '/b': './b' } );
} );

test( 'mergeConfigs: an invalid layer throws', () => {
	assert.throws(
		() => mergeConfigs( [ { data: { bogus: 1 }, source: CONFIG_FILE } ] ),
		/unknown key/
	);
} );

/**
 * Run `fn` with a throwaway temp directory; the directory is removed
 *     afterwards. Used to exercise `loadConfig` hermetically.
 * @param {(dir: string) => void} fn The body, given the temp directory.
 */
function withTempDir( fn ) {
	const dir = mkdtempSync( join( tmpdir(), '071-env-config-' ) );
	try {
		fn( dir );
	} finally {
		rmSync( dir, { recursive: true, force: true } );
	}
}

test( 'loadConfig: with no config files returns the built-in defaults', () => {
	withTempDir( ( dir ) => {
		assert.deepEqual( loadConfig( dir ), defaultConfig() );
	} );
} );

test( 'loadConfig: reads .071-env.json when present', () => {
	withTempDir( ( dir ) => {
		writeFileSync( join( dir, CONFIG_FILE ), JSON.stringify( { port: 9000 } ) );
		const config = loadConfig( dir );
		assert.equal( config.port, 9000 );
		assert.equal( config.dbPort, 3306 );
	} );
} );

test( 'loadConfig: .071-env.override.json deep-merges on top of .071-env.json', () => {
	withTempDir( ( dir ) => {
		writeFileSync(
			join( dir, CONFIG_FILE ),
			JSON.stringify( { port: 9000, dbPort: 3307, mappings: { '/a': './a' } } )
		);
		writeFileSync(
			join( dir, OVERRIDE_FILE ),
			JSON.stringify( { port: 9100, mappings: { '/b': './b' } } )
		);
		const config = loadConfig( dir );
		assert.equal( config.port, 9100 );
		assert.equal( config.dbPort, 3307 );
		assert.deepEqual( config.mappings, { '/a': './a', '/b': './b' } );
	} );
} );

test( 'loadConfig: an override file alone (no base file) still applies', () => {
	withTempDir( ( dir ) => {
		writeFileSync( join( dir, OVERRIDE_FILE ), JSON.stringify( { port: 9100 } ) );
		assert.equal( loadConfig( dir ).port, 9100 );
	} );
} );

test( 'loadConfig: malformed JSON throws a clear error', () => {
	withTempDir( ( dir ) => {
		writeFileSync( join( dir, CONFIG_FILE ), '{ not json' );
		assert.throws( () => loadConfig( dir ), /invalid JSON/ );
	} );
} );

test( 'loadConfig: an invalid key in the config file throws', () => {
	withTempDir( ( dir ) => {
		writeFileSync( join( dir, CONFIG_FILE ), JSON.stringify( { bogus: true } ) );
		assert.throws( () => loadConfig( dir ), /unknown key 'bogus'/ );
	} );
} );
