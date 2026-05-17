/*
 * EN: Configuration loading, validation and deep-merge for 071-env.
 *
 *     071-env reads an optional `.071-env.json` at the repository root and an
 *     optional, git-ignored `.071-env.override.json` deep-merged on top of it
 *     -- the analogue of wp-env's `.wp-env.json` / `.wp-env.override.json`.
 *     When neither file exists 071-env falls back to built-in defaults, so the
 *     environment works with no configuration at all.
 *
 *     This module is mostly pure: `defaultConfig`, `validateConfig`,
 *     `deepMerge` and `mergeConfigs` perform no I/O and are fully unit
 *     testable. Only `loadConfig` touches the filesystem -- it is the impure
 *     boundary kept deliberately thin.
 *
 * JA: 071-env のための設定の読み込み・検証・ディープマージ。
 *
 *     071-env はリポジトリルートの任意の `.071-env.json` と、その上に
 *     ディープマージされる任意かつ git 管理外の `.071-env.override.json` を
 *     読む -- wp-env の `.wp-env.json` / `.wp-env.override.json` の相当物で
 *     ある。どちらのファイルも無い場合、071-env は組み込みの既定値に
 *     フォールバックするため、環境は設定無しでも動作する。
 *
 *     本モジュールはおおむね純粋である: `defaultConfig`・`validateConfig`・
 *     `deepMerge`・`mergeConfigs` は I/O を行わず完全に単体テスト可能。
 *     ファイルシステムに触れるのは `loadConfig` のみで、これは意図的に薄く
 *     保った非純粋な境界である。
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { repoRoot } from './paths.mjs';

/**
 * EN: The committed project config file, read first.
 * JA: 最初に読まれる、コミットされるプロジェクト設定ファイル。
 */
export const CONFIG_FILE = '.071-env.json';

/**
 * EN: The optional, git-ignored local override file, deep-merged on top.
 * JA: 上にディープマージされる、任意かつ git 管理外のローカル上書きファイル。
 */
export const OVERRIDE_FILE = '.071-env.override.json';

/**
 * EN: The lifecycle hook names 071-env recognises. `afterStart` runs after a
 *     successful `start`; `beforeDestroy` runs before `destroy` proceeds.
 * JA: 071-env が認識するライフサイクルフック名。`afterStart` は `start`
 *     成功後に、`beforeDestroy` は `destroy` の実行前に走る。
 */
export const LIFECYCLE_HOOKS = [ 'afterStart', 'beforeDestroy' ];

/**
 * EN: Build a fresh default configuration. These defaults reproduce PR #110's
 *     behaviour exactly, so `071-env` works with no config file present.
 * JA: 新しい既定設定を構築する。この既定値は PR #110 の挙動を正確に再現し、
 *     設定ファイルが無くても `071-env` が動作するようにする。
 *
 * @returns {{ port: number, dbPort: number, phpVersion: string,
 *             mappings: Record<string,string>,
 *             lifecycleScripts: Record<string,string> }}
 */
export function defaultConfig() {
	return {
		port: 8080,
		dbPort: 3306,
		phpVersion: '8.3',
		mappings: {},
		lifecycleScripts: {},
	};
}

/**
 * EN: Recursively deep-merge `source` onto `target`, returning a new object.
 *     Plain objects are merged key by key; any other value (number, string,
 *     array) from `source` replaces the value in `target`. Neither input is
 *     mutated. This is the merge wp-env uses to layer the override file.
 * JA: `source` を `target` へ再帰的にディープマージし、新しいオブジェクトを
 *     返す。プレーンオブジェクトはキーごとにマージし、それ以外の値 (数値・
 *     文字列・配列) は `source` の値が `target` の値を置き換える。どちらの
 *     入力も変更しない。これは wp-env が上書きファイルを重ねるのに使う
 *     マージである。
 *
 * @param {object} target The base object.
 * @param {object} source The object merged on top.
 * @returns {object} a new merged object.
 */
export function deepMerge( target, source ) {
	const result = { ...target };

	for ( const [ key, value ] of Object.entries( source ) ) {
		if ( isPlainObject( value ) && isPlainObject( result[ key ] ) ) {
			result[ key ] = deepMerge( result[ key ], value );
		} else {
			result[ key ] = value;
		}
	}

	return result;
}

/**
 * EN: Report whether a value is a plain object (not an array, not null).
 * JA: 値がプレーンオブジェクト (配列でも null でもない) かどうかを返す。
 *
 * @param {*} value The value to test.
 * @returns {boolean}
 */
function isPlainObject( value ) {
	return typeof value === 'object' && value !== null && ! Array.isArray( value );
}

/**
 * EN: Validate a parsed config object. Throws an Error with a clear message
 *     on an unknown key or a wrong type. The argument is the raw object read
 *     from a JSON file -- every field is optional, but anything present must
 *     be of the right shape.
 * JA: 解析済みの設定オブジェクトを検証する。未知のキーや誤った型では明確な
 *     メッセージとともに Error を投げる。引数は JSON ファイルから読まれた
 *     生のオブジェクトであり、各フィールドは任意だが、存在するものは正しい
 *     形でなければならない。
 *
 * @param {object} raw    The parsed JSON object.
 * @param {string} source A label for error messages (the file name).
 * @returns {object} the validated object (returned unchanged).
 * @throws {Error} on an unknown key or a type error.
 */
export function validateConfig( raw, source = CONFIG_FILE ) {
	if ( ! isPlainObject( raw ) ) {
		throw new Error( `${ source }: the top level must be a JSON object.` );
	}

	const known = Object.keys( defaultConfig() );
	for ( const key of Object.keys( raw ) ) {
		if ( ! known.includes( key ) ) {
			throw new Error(
				`${ source }: unknown key '${ key }'. ` +
					`Allowed keys: ${ known.join( ', ' ) }.`
			);
		}
	}

	if ( 'port' in raw ) {
		assertPort( raw.port, 'port', source );
	}
	if ( 'dbPort' in raw ) {
		assertPort( raw.dbPort, 'dbPort', source );
	}
	if ( 'phpVersion' in raw ) {
		if ( typeof raw.phpVersion !== 'string' || raw.phpVersion.trim() === '' ) {
			throw new Error( `${ source }: 'phpVersion' must be a non-empty string (e.g. "8.3").` );
		}
	}
	if ( 'mappings' in raw ) {
		assertStringMap( raw.mappings, 'mappings', source );
	}
	if ( 'lifecycleScripts' in raw ) {
		assertStringMap( raw.lifecycleScripts, 'lifecycleScripts', source );
		for ( const hook of Object.keys( raw.lifecycleScripts ) ) {
			if ( ! LIFECYCLE_HOOKS.includes( hook ) ) {
				throw new Error(
					`${ source }: unknown lifecycle hook '${ hook }'. ` +
						`Supported hooks: ${ LIFECYCLE_HOOKS.join( ', ' ) }.`
				);
			}
		}
	}

	return raw;
}

/**
 * EN: Assert a value is a valid TCP host port (an integer in 1..65535).
 * JA: 値が有効な TCP ホストポート (1..65535 の整数) であることを表明する。
 *
 * @param {*} value      The value to check.
 * @param {string} field The field name, for the error message.
 * @param {string} source The file name, for the error message.
 * @throws {Error} when the value is not a valid port.
 */
function assertPort( value, field, source ) {
	if ( typeof value !== 'number' || ! Number.isInteger( value ) || value < 1 || value > 65535 ) {
		throw new Error( `${ source }: '${ field }' must be an integer between 1 and 65535.` );
	}
}

/**
 * EN: Assert a value is a plain object whose every value is a string.
 * JA: 値がプレーンオブジェクトで、その全値が文字列であることを表明する。
 *
 * @param {*} value      The value to check.
 * @param {string} field The field name, for the error message.
 * @param {string} source The file name, for the error message.
 * @throws {Error} when the value is not a string-valued object.
 */
function assertStringMap( value, field, source ) {
	if ( ! isPlainObject( value ) ) {
		throw new Error( `${ source }: '${ field }' must be a JSON object.` );
	}
	for ( const [ key, entry ] of Object.entries( value ) ) {
		if ( typeof entry !== 'string' ) {
			throw new Error( `${ source }: '${ field }.${ key }' must be a string.` );
		}
	}
}

/**
 * EN: Merge an ordered list of partial config objects onto the defaults.
 *     Each object is validated, then deep-merged in order, so a later object
 *     (the override file) wins over an earlier one (the project file).
 * JA: 部分設定オブジェクトの順序付きリストを既定値の上にマージする。各
 *     オブジェクトを検証してから順にディープマージするため、後のオブジェクト
 *     (上書きファイル) が前のもの (プロジェクトファイル) に優先する。
 *
 * @param {Array<{ data: object, source: string }>} layers Validated layers.
 * @returns {object} the fully merged, validated configuration.
 */
export function mergeConfigs( layers ) {
	let config = defaultConfig();
	for ( const layer of layers ) {
		validateConfig( layer.data, layer.source );
		config = deepMerge( config, layer.data );
	}
	return config;
}

/**
 * EN: Read and parse one JSON config file. Returns `null` when the file does
 *     not exist (an absent file is not an error -- 071-env then uses defaults).
 *     A present-but-malformed file throws.
 * JA: 1 つの JSON 設定ファイルを読み解析する。ファイルが存在しない場合は
 *     `null` を返す (ファイルの欠如はエラーではない -- 071-env は既定値を
 *     使う)。存在するが不正なファイルは例外を投げる。
 *
 * @param {string} filePath Absolute path to the config file.
 * @param {string} label    The file name, for error messages.
 * @returns {object|null} the parsed object, or null when absent.
 * @throws {Error} when the file exists but is not valid JSON.
 */
export function readConfigFile( filePath, label ) {
	if ( ! existsSync( filePath ) ) {
		return null;
	}

	let text;
	try {
		text = readFileSync( filePath, 'utf8' );
	} catch ( err ) {
		throw new Error( `${ label }: could not read the file: ${ err.message }` );
	}

	try {
		return JSON.parse( text );
	} catch ( err ) {
		throw new Error( `${ label }: invalid JSON: ${ err.message }` );
	}
}

/**
 * EN: Load the effective 071-env configuration: built-in defaults, with
 *     `.071-env.json` deep-merged on top, then `.071-env.override.json`
 *     deep-merged on top of that. Either file may be absent. The result is
 *     fully validated.
 * JA: 実効的な 071-env 設定を読み込む: 組み込みの既定値の上に
 *     `.071-env.json` をディープマージし、さらにその上に
 *     `.071-env.override.json` をディープマージする。どちらのファイルも
 *     省略可能。結果は完全に検証される。
 *
 * @param {string} root The repository root (defaults to the resolved root).
 * @returns {object} the merged, validated configuration.
 * @throws {Error} on a malformed or invalid config file.
 */
export function loadConfig( root = repoRoot ) {
	const layers = [];

	const base = readConfigFile( join( root, CONFIG_FILE ), CONFIG_FILE );
	if ( base !== null ) {
		layers.push( { data: base, source: CONFIG_FILE } );
	}

	const override = readConfigFile( join( root, OVERRIDE_FILE ), OVERRIDE_FILE );
	if ( override !== null ) {
		layers.push( { data: override, source: OVERRIDE_FILE } );
	}

	return mergeConfigs( layers );
}
