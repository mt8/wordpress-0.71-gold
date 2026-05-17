// 071-now SQLite database persistence (Issue #122, full build 4/6).
//
//     The 071-now playground keeps WordPress 0.71's content in a single
//     in-browser SQLite file inside the php-wasm virtual filesystem. That
//     filesystem is discarded when the tab closes, so without this module
//     a post or category created through the admin is lost on reload --
//     the boot shim re-seeds a fresh database for every php-wasm instance.
//
//     This module persists that one SQLite file in the browser so the
//     blog's content survives a reload / tab close, the way WordPress
//     Playground persists its filesystem:
//
//       - OPFS (the Origin Private File System) is used when available.
//         It is the modern, synchronous-capable browser storage for
//         exactly this -- an opaque per-origin file store.
//       - IndexedDB is the fallback for browsers without OPFS. The same
//         database bytes are stored as a single Blob under a fixed key.
//
//     The store holds the raw bytes of the SQLite file. src/main.js loads
//     them into the php-wasm VFS before the first request (so the boot
//     shim sees an existing database and skips seeding) and writes them
//     back after every request that changes the database.

// Stable identifiers for the persisted database. The OPFS file name
//     and the IndexedDB database / store / key names never change, so a
//     returning visitor finds the same persisted database.
const OPFS_FILE_NAME = '071-now.sqlite';
const IDB_NAME = '071-now-persistence';
const IDB_STORE = 'database';
const IDB_KEY = 'sqlite';

// A throwaway file name the OPFS runtime probe writes and deletes.
//     Distinct from OPFS_FILE_NAME so the probe never disturbs a real
//     persisted database.
const OPFS_PROBE_FILE_NAME = '071-now-opfs-probe';

/**
 * Whether the Origin Private File System API looks present in this
 * browser.
 *
 * `navigator.storage.getDirectory` is the OPFS entry point, but its mere
 * presence is not enough: Safari exposes `getDirectory` yet does not
 * implement `FileSystemFileHandle.prototype.createWritable()` on the main
 * thread (its OPFS write path is the worker-only synchronous access
 * handle). `opfsSave()` writes through `createWritable()`, so OPFS is
 * only usable here when that method exists too.
 *
 * This is a fast synchronous gate only -- API presence does not prove
 * OPFS actually works (some engines expose the API but fail at the first
 * `getDirectory()` call). `opfsUsable()` confirms it with a real probe;
 * `selectBackend()` runs that before the layer commits to OPFS.
 *
 * Kept identical to the copy in src/media-persistence.js so the database
 * and media layers always pick the same backend.
 *
 * @return {boolean} True when the OPFS API surface is present.
 */
function hasOpfs() {
	return (
		typeof navigator !== 'undefined' &&
		!! navigator.storage &&
		typeof navigator.storage.getDirectory === 'function' &&
		typeof FileSystemFileHandle !== 'undefined' &&
		typeof FileSystemFileHandle.prototype.createWritable === 'function'
	);
}

/**
 * Whether OPFS actually works here, confirmed by a real round-trip.
 *
 * Feature detection (`hasOpfs()`) is necessary but not sufficient: an
 * engine can expose the whole OPFS API and still fail at the first
 * `getDirectory()` call -- WebKit does exactly this in some contexts,
 * throwing `UnknownError`. So this opens the OPFS root, creates a
 * throwaway file, writes to it through `createWritable()` and removes it.
 * Any failure means OPFS is not usable and the layer must fall back to
 * IndexedDB.
 *
 * Kept identical to the copy in src/media-persistence.js so the database
 * and media layers always pick the same backend.
 *
 * @return {Promise<boolean>} True when an OPFS write round-trip succeeds.
 */
async function opfsUsable() {
	if ( ! hasOpfs() ) {
		return false;
	}
	try {
		const root = await navigator.storage.getDirectory();
		const handle = await root.getFileHandle( OPFS_PROBE_FILE_NAME, {
			create: true,
		} );
		const writable = await handle.createWritable();
		try {
			await writable.write( new Uint8Array( [ 0 ] ) );
		} finally {
			await writable.close();
		}
		await root.removeEntry( OPFS_PROBE_FILE_NAME );
		return true;
	} catch {
		// OPFS API present but not usable -- fall back to IndexedDB.
		return false;
	}
}

/**
 * Read the persisted SQLite database from OPFS.
 *
 * @return {Promise<Uint8Array|null>} The database bytes, or null when no
 *                                    database has been persisted yet.
 */
async function opfsLoad() {
	const root = await navigator.storage.getDirectory();
	let handle;
	try {
		// create:false -- a missing file means nothing is persisted.
		handle = await root.getFileHandle( OPFS_FILE_NAME, { create: false } );
	} catch {
		return null;
	}
	const file = await handle.getFile();
	if ( file.size === 0 ) {
		return null;
	}
	return new Uint8Array( await file.arrayBuffer() );
}

/**
 * Write the SQLite database bytes to OPFS, replacing any earlier copy.
 *
 * @param {Uint8Array} bytes The SQLite file contents.
 * @return {Promise<void>}
 */
async function opfsSave( bytes ) {
	const root = await navigator.storage.getDirectory();
	const handle = await root.getFileHandle( OPFS_FILE_NAME, { create: true } );
	const writable = await handle.createWritable();
	try {
		await writable.write( bytes );
	} finally {
		await writable.close();
	}
}

/**
 * Remove the persisted database file from OPFS.
 *
 * @return {Promise<void>}
 */
async function opfsClear() {
	const root = await navigator.storage.getDirectory();
	try {
		await root.removeEntry( OPFS_FILE_NAME );
	} catch {
		// Already absent -- nothing to clear.
	}
}

/**
 * Open (creating on first use) the IndexedDB fallback database.
 *
 * @return {Promise<IDBDatabase>}
 */
function idbOpen() {
	return new Promise( ( resolve, reject ) => {
		const request = indexedDB.open( IDB_NAME, 1 );
		request.onupgradeneeded = () => {
			request.result.createObjectStore( IDB_STORE );
		};
		request.onsuccess = () => resolve( request.result );
		request.onerror = () => reject( request.error );
	} );
}

/**
 * Run one IndexedDB request inside a transaction and resolve its result.
 *
 * @param {'readonly'|'readwrite'}        mode    Transaction mode.
 * @param {(store: IDBObjectStore) => IDBRequest} run The store operation.
 * @return {Promise<*>} The request result.
 */
async function idbRun( mode, run ) {
	const db = await idbOpen();
	try {
		return await new Promise( ( resolve, reject ) => {
			const tx = db.transaction( IDB_STORE, mode );
			const request = run( tx.objectStore( IDB_STORE ) );
			request.onsuccess = () => resolve( request.result );
			request.onerror = () => reject( request.error );
		} );
	} finally {
		db.close();
	}
}

/**
 * Read the persisted SQLite database from IndexedDB.
 *
 * @return {Promise<Uint8Array|null>} The database bytes, or null when no
 *                                    database has been persisted yet.
 */
async function idbLoad() {
	const stored = await idbRun( 'readonly', ( store ) => store.get( IDB_KEY ) );
	if ( ! stored ) {
		return null;
	}
	// idbSave stores a Uint8Array (see toStorableBytes). A Blob is
	//     still handled so a database persisted by an earlier build --
	//     which stored a Blob -- is read back without loss.
	const buffer =
		stored instanceof Blob ? await stored.arrayBuffer() : stored;
	const bytes = new Uint8Array( buffer );
	return bytes.length > 0 ? bytes : null;
}

/**
 * Copy bytes into a standalone Uint8Array safe to store in IndexedDB.
 *
 * Two browser constraints shape this:
 *
 *   - The php-wasm heap is a SharedArrayBuffer when PHP runs threaded, so
 *     `php.readFileAsBuffer()` can hand back a SharedArrayBuffer-backed
 *     view. The structured clone IndexedDB performs cannot clone a
 *     SharedArrayBuffer (`DataCloneError`), so the bytes must be copied
 *     into a non-shared ArrayBuffer first. `new Uint8Array( bytes )`
 *     copies element-wise into a fresh, non-shared buffer.
 *   - WebKit's IndexedDB cannot store a Blob in a cross-origin-isolated
 *     page -- `store.put()` of any Blob throws `UnknownError: Error
 *     preparing Blob/File data to be stored in object store`, even when
 *     the Blob is backed by a non-shared buffer. Chromium tolerates a
 *     Blob, which is why the playground stored one until Safari / WebKit
 *     exposed the gap (Issue #130). A plain Uint8Array stores fine in
 *     both engines, so the value put into the store is the typed array
 *     itself, not a Blob.
 *
 * @param {Uint8Array} bytes The (possibly SharedArrayBuffer-backed) data.
 * @return {Uint8Array} A standalone, non-shared copy of the bytes.
 */
function toStorableBytes( bytes ) {
	return new Uint8Array( bytes );
}

/**
 * Write the SQLite database bytes to IndexedDB, replacing any earlier
 * copy.
 *
 * @param {Uint8Array} bytes The SQLite file contents.
 * @return {Promise<void>}
 */
async function idbSave( bytes ) {
	// Store a standalone Uint8Array -- see toStorableBytes: WebKit's
	//     IndexedDB cannot store a Blob in a cross-origin-isolated page,
	//     and the php-wasm heap the bytes come from may be a
	//     SharedArrayBuffer.
	const storable = toStorableBytes( bytes );
	await idbRun( 'readwrite', ( store ) => store.put( storable, IDB_KEY ) );
}

/**
 * Remove the persisted database from IndexedDB.
 *
 * @return {Promise<void>}
 */
async function idbClear() {
	await idbRun( 'readwrite', ( store ) => store.delete( IDB_KEY ) );
}

/**
 * Persistence handle for the in-browser SQLite database.
 *
 * One instance is created at boot. It picks OPFS or the IndexedDB
 * fallback once and routes load / save / clear to the chosen backend, so
 * the rest of the app does not care which store is in use.
 */
export class DatabasePersistence {

	/**
	 * Start with a provisional backend. `selectBackend()` confirms it
	 * with a real OPFS probe before the layer is used.
	 */
	constructor() {
		/**
		 * The backend in use, 'opfs' or 'indexeddb'. Read by the app for
		 * the status line and by the verifier. Provisional until
		 * `selectBackend()` resolves -- it may downgrade 'opfs' to
		 * 'indexeddb' when the OPFS probe fails.
		 *
		 * @type {'opfs'|'indexeddb'}
		 */
		this.backend = hasOpfs() ? 'opfs' : 'indexeddb';
	}

	/**
	 * Confirm the storage backend with a real OPFS round-trip.
	 *
	 * The constructor picks 'opfs' on API presence alone, which is not
	 * enough: an engine can expose OPFS yet fail at the first call (see
	 * `opfsUsable()`). This runs that probe once and downgrades to
	 * IndexedDB when OPFS does not actually work. The app awaits it once,
	 * before the first load / save, so `save()` -- unlike `load()` it has
	 * no failure fallback -- never reaches an unusable OPFS backend.
	 *
	 * @return {Promise<'opfs'|'indexeddb'>} The confirmed backend.
	 */
	async selectBackend() {
		if ( this.backend === 'opfs' && ! ( await opfsUsable() ) ) {
			this.backend = 'indexeddb';
		}
		return this.backend;
	}

	/**
	 * Load the persisted SQLite database, if one exists.
	 *
	 * @return {Promise<Uint8Array|null>} The database bytes, or null when
	 *                                    nothing has been persisted yet
	 *                                    (a first run, or after a reset).
	 */
	async load() {
		try {
			return this.backend === 'opfs'
				? await opfsLoad()
				: await idbLoad();
		} catch {
			// A storage read failure is treated as "nothing
			//     persisted" so the playground still boots -- it just
			//     falls back to a fresh seeded database.
			return null;
		}
	}

	/**
	 * Persist the SQLite database bytes.
	 *
	 * @param {Uint8Array} bytes The current SQLite file contents.
	 * @return {Promise<void>}
	 */
	async save( bytes ) {
		if ( this.backend === 'opfs' ) {
			await opfsSave( bytes );
		} else {
			await idbSave( bytes );
		}
	}

	/**
	 * Clear the persisted database, returning the store to its empty
	 * (first-run) state. The next boot then re-seeds a fresh database.
	 *
	 * @return {Promise<void>}
	 */
	async clear() {
		if ( this.backend === 'opfs' ) {
			await opfsClear();
		} else {
			await idbClear();
		}
	}
}
