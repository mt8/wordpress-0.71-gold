/*
 * EN: Filesystem path resolution for 071-env.
 *
 *     071-env operates the repository's Docker Compose environment. It must
 *     resolve the repository root from its own location -- not from the
 *     caller's current working directory -- so it works regardless of where
 *     it is invoked from.
 *
 *     This module lives at tools/env/src/paths.mjs, so the repository root is
 *     the parent of `tools/` (three directories up from this file).
 *
 * JA: 071-env のためのファイルシステムパス解決。
 *
 *     071-env はリポジトリの Docker Compose 環境を操作する。呼び出し元の
 *     カレントディレクトリではなく、自身の位置からリポジトリルートを解決
 *     しなければならない。これにより、どこから起動されても動作する。
 *
 *     本モジュールは tools/env/src/paths.mjs に置かれるため、リポジトリ
 *     ルートは `tools/` の親 (本ファイルから 3 つ上のディレクトリ) である。
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// EN: This file is tools/env/src/paths.mjs. `tools/env/` is one level up, the
//     repo root is three levels up.
// JA: 本ファイルは tools/env/src/paths.mjs。`tools/env/` は 1 つ上、
//     リポジトリルートは 3 つ上である。
const here = dirname( fileURLToPath( import.meta.url ) );

/** EN: The 071-env package directory (`tools/env/`). JA: 071-env パッケージディレクトリ (`tools/env/`)。 */
export const envDir = dirname( here );

/** EN: The repository root. JA: リポジトリルート。 */
export const repoRoot = dirname( dirname( envDir ) );

/** EN: The repository root docker-compose.yml. JA: リポジトリ直下の docker-compose.yml。 */
export const baseComposeFile = join( repoRoot, 'docker-compose.yml' );

/**
 * EN: The 071-env Compose override file. It bind-mounts `tools/cli/` into the
 *     `web` container; see docs/071-tooling.md section 4.3.
 * JA: 071-env の Compose オーバーライドファイル。`tools/cli/` を `web`
 *     コンテナへバインドマウントする。docs/071-tooling.md セクション 4.3 を参照。
 */
export const overrideComposeFile = join( envDir, 'docker-compose.071.yml' );

/**
 * EN: The runtime Compose override 071-env generates from the `mappings`
 *     field of `.071-env.json`. It lives at the repository root (so Compose
 *     resolves relative host paths against the root) and is git-ignored. It
 *     exists only when `mappings` has at least one entry.
 * JA: 071-env が `.071-env.json` の `mappings` フィールドから生成する実行時
 *     Compose オーバーライド。リポジトリルートに置かれ (Compose が相対の
 *     ホストパスをルートから解決するため)、git 管理外である。`mappings` に
 *     1 つ以上のエントリがあるときだけ存在する。
 */
export const mappingsOverrideFile = join( repoRoot, 'docker-compose.071-mappings.yml' );
