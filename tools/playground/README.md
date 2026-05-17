# 071-now

Browser-based WordPress 0.71 — wp-now / WordPress Playground in spirit
(umbrella Issue #104, Phase 3, design `docs/071-tooling.md` section 5).

This package runs WordPress 0.71 entirely in the browser — PHP compiled
to WebAssembly via `@php-wasm/web`, reading posts from an in-browser
SQLite database. No MySQL server, no web server.

It is deployed to GitHub Pages at
<https://mt8.github.io/wordpress-0.71-gold/>, so anyone can launch it
from a link (Issue #128); see [Deployment](#deployment) below.

It began as the **feasibility spike** of Issue #108 (a proof of concept
that rendered the front page) and was then grown into a usable
browser-based blog over six steps. Step 1 of that full build (Issue
#116) serves the blog through a **service worker** so it has its CSS
and is navigable. Step 2 (Issue #118) trims the php-wasm bundle to PHP
8.3 only. Step 3 (Issue #120) makes the **WordPress 0.71 admin** work —
the admin opens already logged in, and a post can be created, edited
and a category managed through it, with the change reflected on the
front page. Step 4 (Issue #122) **persists the SQLite database** in the
browser, so content created through the admin survives a page reload /
tab close. Step 5 (Issue #124) makes **image upload** work — an image
uploaded through the classic admin's `b2upload.php` is stored in the
php-wasm VFS, served on the blog, and persisted so it survives a reload
too. Step 6 (Issue #126) is the **final polish**: a fresh playground
opens on a small seeded demo blog, a loading splash covers the php-wasm
boot, and the host page frames the playground and links back to the
repository.

The spike's findings, including the chosen database approach and the
remaining work for the full `071-now` build, are in
`docs/071-now-spike.md`; the build's six-step phasing is recorded in
`docs/071-tooling.md` section 5.

## How it works

1. `scripts/build-overlay.mjs` snapshots `src/` (WordPress 0.71) into
   `tools/playground/wp/` and overlays the 071-now SQLite database layer
   onto that copy. **`src/` itself is never modified** — the overlay only
   touches the generated, git-ignored `tools/playground/wp/` directory.
2. Vite bundles the browser app and the WordPress 0.71 tree.
3. At boot the app registers the request-routing service worker
   (`public/sw.js`), boots `@php-wasm/web`, writes the WordPress 0.71
   tree into the php-wasm virtual filesystem, and registers the 071-now
   boot shim as `auto_prepend_file`.
4. The boot shim seeds a SQLite database with one published post and an
   admin user, auto-logs-in that admin, and `chdir()`s to the requested
   script's directory; the SQLite-backed `wpdb` (`db/wp-db.php`) serves
   WordPress 0.71's queries.
5. The app points the iframe at a real scoped same-origin path
   (`/scope:<id>/index.php`). The service worker intercepts that
   navigation and every asset request and link click inside the iframe,
   forwards each one to the app page (which owns the php-wasm request
   handler), and turns the php-wasm response into a `Response`. The blog
   therefore loads its own CSS and is fully navigable.

## The service worker

`public/sw.js` is a single service worker doing two jobs (Issue #116,
#128).

### Request routing

WordPress 0.71's front page emits absolute asset URLs and internal
links against `$siteurl`. The spike rendered the front-page HTML into a
`blob:` URL iframe, so those requests never reached php-wasm and the
page was unstyled and not navigable.

The worker fixes this the way WordPress Playground does. The blog is
served under a single scope path segment (`<base>scope:<id>/...`):
`src/main.js` rewrites the in-VFS copy of `b2config.php` so `$siteurl`
points at that scoped path, hence every URL the blog emits is
same-origin and scoped. The service worker intercepts exactly those
scoped requests and forwards them to the controlling page (which owns
the php-wasm request handler). `src/` and the on-disk overlay are
untouched — only the in-memory php-wasm copy of `b2config.php` is
rewritten.

### Cross-origin isolation

php-wasm runs PHP threads on `SharedArrayBuffer`, which a browser
exposes only to a cross-origin-isolated page — one served with the
`Cross-Origin-Opener-Policy: same-origin` /
`Cross-Origin-Embedder-Policy: require-corp` headers. The Vite dev /
preview server sets them (`vite.config.js`), but GitHub Pages cannot
set custom HTTP headers. So the same service worker adds them: every
request that is *not* a scoped blog request — the host document, the
bundled JS, the `.wasm`/`.data` runtime assets — is fetched from the
network and re-served with the COOP/COEP (and a `Cross-Origin-Resource-
Policy`) headers attached. This is the `coi-serviceworker` technique,
folded into the one existing worker rather than a second registration.

On the first visit the host document is fetched before the worker
controls the page, so it carries no COOP/COEP and the page is not yet
isolated. `src/main.js` reloads once (guarded by a `sessionStorage`
flag) so the reload's document request goes through the now-controlling
worker; the reloaded page is cross-origin-isolated. On the local dev /
preview server the headers are already present, so no reload happens.

## Trimming the php-wasm bundle to PHP 8.3

`@php-wasm/web` depends on one package per PHP version it supports
(`@php-wasm/web-5-2` … `@php-wasm/web-8-5`), and its
`getPHPLoaderModule` / `getIntlExtensionPath` functions are a `switch`
whose every case is a static `await import('@php-wasm/web-<v>')`.
Rollup resolves every one of those literal-string imports at build
time, so a plain build ships all eight PHP runtimes — roughly 290 MB
of `.wasm`. 071-now boots `@php-wasm/web` with `'8.3'` only, so the
other seven cases are dead branches.

`vite.config.js` carries a `071-now-trim-php-wasm-versions` plugin that
resolves every `@php-wasm/web-<v>` package other than the PHP 8.3 one
to an inert stub module. The stub re-exports the same surface
(`getPHPLoaderModule`, `getIntlExtensionPath`, `jspi`) so the named
imports in `@php-wasm/web` still resolve, but it carries no `.wasm`
import — so Rollup never pulls those runtimes into the build. The
build then emits only the PHP 8.3 `.wasm` files (the asyncify and JSPI
flavors, selected at runtime by browser feature detection).

## The WordPress 0.71 admin

The admin (`wp-admin/`) works in the playground. Three things, named by
the spike (`docs/071-now-spike.md`), made it possible:

- **The SQL translator** (`db/sql-translator.php`) covers the admin's
  query shapes — the post / category `INSERT` / `UPDATE` / `DELETE`, the
  archive `SELECT`s. A MySQL auto-increment column treats an explicit 0
  as "assign the next id", which SQLite does not, so the translator
  drops a leading `id` column whose value is 0; and the archive queries'
  bare `YEAR(post_date)` columns are aliased back to their MySQL name so
  the admin code finds them.
- **The direct `mysqli_*` call sites.** A few 0.71 functions bypass the
  `wpdb` methods and call `mysqli_*` directly on `$wpdb->dbh`, which is
  a `PDO` here, not a `mysqli` handle. `db/mysqli-compat.php` declares
  `wp071_db_*` helpers over the SQLite `wpdb`, and `build-overlay.mjs`
  rewrites every such site in the in-browser copy to those helpers.
- **Auto-login.** 071-now is a single-user browser playground, so the
  boot shim injects the seeded admin's `wordpressuser` / `wordpresspass`
  cookies into `$_COOKIE`, and the admin opens already logged in.

`src/` is never touched — the translator extension, the `mysqli_*`
rewrite and the auto-login all live under `tools/playground/` and apply
only to the generated `tools/playground/wp/` tree.

## Persisting the SQLite database

The blog's content lives in a single in-browser SQLite file inside the
php-wasm virtual filesystem. That filesystem is discarded when the tab
closes, so on its own the playground re-seeds a fresh database for every
php-wasm instance and a post created through the admin is lost on
reload. Step 4 (Issue #122) persists that file in the browser.

`src/persistence.js` is the persistence layer. It stores the raw bytes
of the SQLite file in the browser:

- **OPFS** (the Origin Private File System) when the browser exposes
  `navigator.storage.getDirectory` — the modern per-origin file store.
- **IndexedDB** as the fallback for browsers without OPFS; the same
  bytes are stored as a single `Blob` under a fixed key.

`src/main.js` wires it in:

- **Restore before the first request.** At boot, before php-wasm serves
  anything, the persisted bytes are loaded and written to the SQLite
  path in the virtual filesystem. The boot shim's seed is gated on that
  file's existence (`db/boot.php`), so a returning visitor's database is
  found and the seed is skipped — the persisted content is what renders.
  A first visit finds nothing persisted and the boot shim seeds afresh.
- **Save after every change.** After each request the database file is
  read back and compared with the last saved snapshot; when it changed
  (a new post, an edit, a new category) the new bytes are persisted. A
  front-page view or an asset request leaves the database untouched and
  triggers no storage write.
- **Reset.** The toolbar's *Reset database* button (and
  `window.__071now.reset()`) clears the persistent store and the in-VFS
  file, then reloads. The next boot finds nothing persisted, so the boot
  shim seeds a fresh database — the playground is back to its clean
  seeded state.

`src/` is untouched: the persistence layer, the boot-time restore and
the reset all live under `tools/playground/`.

## Image upload

WordPress 0.71's classic admin has an upload page
(`wp-admin/b2upload.php`) that writes uploaded images to
`$fileupload_realpath` — `wp-content/uploads/`. Step 5 (Issue #124)
makes it work in the playground and persists the uploaded images.

- **The upload reaches php-wasm.** `b2upload.php`'s form is a
  `multipart/form-data` POST. The service worker already forwards
  non-GET requests; the multipart body is buffered as a `Uint8Array`
  and forwarded with its `content-type` header (boundary included)
  intact, so php-wasm's SAPI parses it into `$_POST` / `$_FILES` and
  `move_uploaded_file()` writes the image into the VFS — no change to
  `sw.js` is needed.
- **Uploads write inside the VFS.** `b2config.php` hard-codes
  `$fileupload_realpath` at the Docker document root
  (`/var/www/html/wp-content/uploads`), a path absent from the
  in-browser VFS. `src/main.js` rewrites it, in the in-VFS copy of
  `b2config.php` only, to `wp-content/uploads` under the document root,
  and the boot shim (`db/boot.php`) creates that directory so
  `b2upload.php`'s `realpath()` check and `move_uploaded_file()`
  succeed. `$fileupload_url` is derived from `$siteurl`, already
  rewritten to the scoped path, so an uploaded image's URL is a scoped
  same-origin path the service worker intercepts and the php-wasm
  static-file handler serves from the VFS.
- **Uploaded images persist.** `src/media-persistence.js` is the media
  counterpart of `src/persistence.js`: it stores the whole
  `wp-content/uploads/` tree as a path → bytes map, in OPFS (a
  dedicated sub-directory) or IndexedDB (one keyed map). `src/main.js`
  restores it into the VFS before the first request and saves it back
  after any request that changed the tree, exactly as it does for the
  database. The reset control clears this store alongside the database.

`src/` is never touched — the `b2config.php` rewrite, the uploads
directory creation, the media persistence layer and the reset all live
under `tools/playground/`.

## The polished playground

Step 6 (Issue #126) turns the working build into a presentable
browser-based WordPress 0.71.

- **Seed content.** `db/seed.php` builds a small demo blog rather than a
  single placeholder post: an admin user, three categories and several
  published posts spread across them, each with a distinct `post_date`
  so the front page lists them newest-first under date headings. A
  fresh playground therefore opens on a real WordPress 0.71 blog —
  showing 0.71's post, category and author rendering — and the reset
  control returns to exactly this state. The newest post keeps the title
  and body the headless verifier expects, so the seed stays in step with
  `test/verify.mjs`.
- **Loading UI.** php-wasm's boot fetches and starts the ~40 MB PHP 8.3
  WebAssembly runtime, which takes a few seconds. `index.html` shows a
  loading splash — a spinner and a short explanation — over the blank
  blog iframe meanwhile; `src/main.js` mirrors the boot phase into it
  and fades it out once the iframe has actually rendered the front page,
  so the splash is replaced by the live blog rather than by a blank
  frame.
- **Playground chrome.** `index.html` carries a slim title bar above the
  blog stating plainly what this is — WordPress 0.71 (2003), running
  entirely in the browser via WebAssembly PHP — with a link back to the
  GitHub repository, alongside the existing boot-status line and the
  reset control.

These changes live entirely in `index.html`, `src/main.js` and
`db/seed.php` under `tools/playground/`; `src/` is untouched.

## Layout

```
tools/playground/
  package.json
  index.html              host page
  vite.config.js
  public/
    sw.js                 request-routing service worker
  src/
    main.js               boots @php-wasm/web, wires the SW bridge
    persistence.js        persists the SQLite database (OPFS / IndexedDB)
    media-persistence.js  persists the uploaded-media tree (OPFS / IndexedDB)
    wp-files.js           build-time bundle of the overlaid WP 0.71 tree
  db/                     the 071-now database layer (overlaid into WP)
    wp-db.php             SQLite-backed reimplementation of 0.71's wpdb
    sql-translator.php    MySQL -> SQLite translation layer
    seed.php              builds the schema, inserts one seeded post
    boot.php              auto_prepend boot shim (seed, auto-login, chdir)
    mysqli-compat.php     mysqli compat helpers for the rewritten sites
  scripts/
    build-overlay.mjs     snapshots src/, applies the db overlay, and
                          rewrites the direct mysqli_* call sites
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

`npm run verify` confirms, in a real browser, that the WordPress 0.71
blog is served through the service worker: a loading splash covers the
php-wasm boot and is replaced by the blog, the host page frames the
playground and links to the repository, the front page renders with its
CSS and the seeded demo blog (several posts across a couple of
categories), and a visitor can click through to a post page and a
category page. It then exercises the admin — opening it logged in,
creating and editing a post and adding a category through the admin's
own forms, and confirming each change on the front page. It then checks
persistence — creating a post, reloading the page and asserting the
post is still present, then exercising the reset. Finally it checks
image upload — uploading an image through `b2upload.php`, asserting it
is stored and served from the VFS, reloading and asserting it survived,
then asserting the reset clears it — with no console errors. It also
asserts the page is cross-origin-isolated. It writes
`test/071-now-frontpage.png` and `test/071-now-admin.png`.

## Deployment

The playground is deployed to GitHub Pages at
<https://mt8.github.io/wordpress-0.71-gold/> by
`.github/workflows/playground-pages.yml` (Issue #128). The workflow runs
on a push to `main` and on manual dispatch: it builds this workspace and
publishes its `dist/` with `actions/configure-pages`,
`actions/upload-pages-artifact` and `actions/deploy-pages`.

A project page is served under the repository name, so the workflow
builds with `PLAYGROUND_BASE=/wordpress-0.71-gold/`. `vite.config.js`
reads that environment variable as the public base path (`base`), and
`src/main.js` builds the service-worker registration and the scoped
blog paths under it. Locally `build` / `dev` / `preview` / `verify`
leave `PLAYGROUND_BASE` unset and use the default `/`.

GitHub Pages cannot set custom HTTP headers, and php-wasm needs the
COOP/COEP cross-origin isolation headers for `SharedArrayBuffer`; the
service worker adds them itself, as described under
[Cross-origin isolation](#cross-origin-isolation).
