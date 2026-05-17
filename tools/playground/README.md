# 071-now

Browser-based WordPress 0.71 — wp-now / WordPress Playground in spirit
(umbrella Issue #104, Phase 3, design `docs/071-tooling.md` section 5).

This package is the **feasibility spike** of Issue #108: a proof of
concept that runs WordPress 0.71 entirely in the browser — PHP compiled
to WebAssembly via `@php-wasm/web`, reading posts from an in-browser
SQLite database. No MySQL server, no web server.

The spike's findings, including the chosen database approach and the
remaining work for a full `071-now` build, are in
`docs/071-now-spike.md`.

## How it works

1. `scripts/build-overlay.mjs` snapshots `src/` (WordPress 0.71) into
   `playground/wp/` and overlays the 071-now SQLite database layer onto
   that copy. **`src/` itself is never modified** — the overlay only
   touches the generated, git-ignored `playground/wp/` directory.
2. Vite bundles the browser app and the WordPress 0.71 tree.
3. At boot the app writes the tree into the php-wasm virtual filesystem,
   registers the 071-now boot shim as `auto_prepend_file`, and issues an
   HTTP request for `/index.php`.
4. The boot shim seeds a SQLite database with one published post; the
   SQLite-backed `wpdb` (`db/wp-db.php`) serves WordPress 0.71's queries.

## Layout

```
playground/
  package.json
  index.html              host page
  vite.config.js
  src/
    main.js               boots @php-wasm/web, renders the front page
    wp-files.js           build-time bundle of the overlaid WP 0.71 tree
  db/                     the 071-now database layer (overlaid into WP)
    wp-db.php             SQLite-backed reimplementation of 0.71's wpdb
    sql-translator.php    MySQL -> SQLite translation layer
    seed.php              builds the schema, inserts one seeded post
    boot.php              auto_prepend boot shim
  scripts/
    build-overlay.mjs     snapshots src/ + applies the db overlay
  test/
    verify.mjs            headless-Chromium verification
  wp/                     generated overlay (git-ignored)
```

## Commands

```
npm run build      build the overlay and the Vite bundle
npm run dev        Vite dev server
npm run preview    serve the production build
npm run verify     build, serve, and verify in headless Chromium
```

`npm run verify` is the spike's success check: it confirms the
WordPress 0.71 front page renders in a real browser with the seeded post
visible, and writes `test/071-now-frontpage.png`.
