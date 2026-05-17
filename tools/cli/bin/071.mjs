#!/usr/bin/env node
/*
 * EN: 071-cli Node entry point.
 *
 *     This is a thin shim. 071-cli reads and writes WordPress 0.71's data
 *     through 0.71's own PHP database layer, so all real work is done by the
 *     PHP CLI at php/071-cli.php. This shim only:
 *       1. locates a `php` binary,
 *       2. spawns `php php/071-cli.php <args>` with inherited stdio,
 *       3. exits with the PHP process's exit code.
 *
 *     It exists so the tool installs and runs like any other npm package
 *     (`npx 071-cli ...`, or a linked `071` command), as described in
 *     docs/071-tooling.md section 3.2.
 *
 * JA: 071-cli の Node エントリポイント。
 *
 *     これは薄いシムである。071-cli は 0.71 自身の PHP データベース層を
 *     通じて WordPress 0.71 のデータを読み書きするため、実処理はすべて
 *     php/071-cli.php の PHP CLI が行う。本シムは以下のみを行う:
 *       1. `php` バイナリを探す、
 *       2. stdio を継承して `php php/071-cli.php <args>` を起動する、
 *       3. PHP プロセスの終了コードで終了する。
 *
 *     docs/071-tooling.md セクション 3.2 のとおり、本ツールが他の npm
 *     パッケージと同様にインストール・実行できるようにするために存在する。
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { delimiter } from 'node:path';

const here = dirname( fileURLToPath( import.meta.url ) );
const phpCli = join( here, '..', 'php', '071-cli.php' );

/**
 * EN: Locate a PHP binary. Honours the PHP environment variable, then probes
 *     PATH for the usual candidate names.
 * JA: PHP バイナリを探す。PHP 環境変数を優先し、次に PATH 上の通常の候補名を
 *     探索する。
 *
 * @returns {string} the resolved PHP executable name or path.
 */
function locatePhp() {
	if ( process.env.PHP && process.env.PHP.trim() !== '' ) {
		return process.env.PHP.trim();
	}

	const candidates = [ 'php', 'php8.3', 'php8' ];
	const pathDirs = ( process.env.PATH || '' ).split( delimiter );
	const exeSuffixes = process.platform === 'win32' ? [ '.exe', '.bat', '.cmd', '' ] : [ '' ];

	for ( const candidate of candidates ) {
		for ( const dir of pathDirs ) {
			for ( const suffix of exeSuffixes ) {
				if ( dir && existsSync( join( dir, candidate + suffix ) ) ) {
					return candidate;
				}
			}
		}
	}

	// EN: Fall back to a bare `php`; spawnSync reports ENOENT if it is missing.
	// JA: 素の `php` にフォールバックする。欠如時は spawnSync が ENOENT を報告。
	return 'php';
}

const php = locatePhp();
const result = spawnSync( php, [ phpCli, ...process.argv.slice( 2 ) ], {
	stdio: 'inherit',
} );

if ( result.error ) {
	if ( result.error.code === 'ENOENT' ) {
		process.stderr.write(
			'071-cli: could not find a PHP binary. Install PHP 8.3, or set the ' +
				'PHP environment variable to its path.\n'
		);
	} else {
		process.stderr.write( `071-cli: failed to run PHP: ${ result.error.message }\n` );
	}
	process.exit( 1 );
}

process.exit( result.status === null ? 1 : result.status );
