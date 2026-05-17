/*
 * EN: Filesystem path resolution for 071-env.
 *
 *     071-env operates the repository's Docker Compose environment. It must
 *     resolve the repository root from its own location -- not from the
 *     caller's current working directory -- so it works regardless of where
 *     it is invoked from.
 *
 *     This module lives at env/src/paths.mjs, so the repository root is the
 *     parent of `env/` (two directories up from this file).
 *
 * JA: 071-env のためのファイルシステムパス解決。
 *
 *     071-env はリポジトリの Docker Compose 環境を操作する。呼び出し元の
 *     カレントディレクトリではなく、自身の位置からリポジトリルートを解決
 *     しなければならない。これにより、どこから起動されても動作する。
 *
 *     本モジュールは env/src/paths.mjs に置かれるため、リポジトリルートは
 *     `env/` の親 (本ファイルから 2 つ上のディレクトリ) である。
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// EN: This file is env/src/paths.mjs. `env/` is one level up, the repo root
//     is two levels up.
// JA: 本ファイルは env/src/paths.mjs。`env/` は 1 つ上、リポジトリルートは
//     2 つ上である。
const here = dirname( fileURLToPath( import.meta.url ) );

/** EN: The 071-env package directory (`env/`). JA: 071-env パッケージディレクトリ (`env/`)。 */
export const envDir = dirname( here );

/** EN: The repository root. JA: リポジトリルート。 */
export const repoRoot = dirname( envDir );

/** EN: The repository root docker-compose.yml. JA: リポジトリ直下の docker-compose.yml。 */
export const baseComposeFile = join( repoRoot, 'docker-compose.yml' );

/**
 * EN: The 071-env Compose override file. It bind-mounts `cli/` into the `web`
 *     container; see docs/071-tooling.md section 4.3.
 * JA: 071-env の Compose オーバーライドファイル。`cli/` を `web` コンテナへ
 *     バインドマウントする。docs/071-tooling.md セクション 4.3 を参照。
 */
export const overrideComposeFile = join( envDir, 'docker-compose.071.yml' );
