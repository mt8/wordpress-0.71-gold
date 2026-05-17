/*
 * Filesystem path resolution for 071-env.
 *
 *     071-env operates the repository's Docker Compose environment. It must
 *     resolve the repository root from its own location -- not from the
 *     caller's current working directory -- so it works regardless of where
 *     it is invoked from.
 *
 *     This module lives at tools/env/src/paths.mjs, so the repository root is
 *     the parent of `tools/` (three directories up from this file).
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// This file is tools/env/src/paths.mjs. `tools/env/` is one level up, the
//     repo root is three levels up.
const here = dirname( fileURLToPath( import.meta.url ) );

/** The 071-env package directory (`tools/env/`). */
export const envDir = dirname( here );

/** The repository root. */
export const repoRoot = dirname( dirname( envDir ) );

/**
 * The base Compose file, tools/env/docker-compose.yml. Its in-file
 *     relative paths are repository-root-relative, so 071-env runs Compose
 *     with `--project-directory` pointing at the repository root (see
 *     projectDirArgs in compose.mjs).
 */
export const baseComposeFile = join( envDir, 'docker-compose.yml' );

/**
 * The 071-env Compose override file. It bind-mounts `tools/cli/` into the
 *     `web` container; see docs/071-tooling.md section 4.3.
 */
export const overrideComposeFile = join( envDir, 'docker-compose.071.yml' );

/**
 * The runtime Compose override 071-env generates from the `mappings`
 *     field of `.071-env.json`. It lives at the repository root (so Compose
 *     resolves relative host paths against the root) and is git-ignored. It
 *     exists only when `mappings` has at least one entry.
 */
export const mappingsOverrideFile = join( repoRoot, 'docker-compose.071-mappings.yml' );
