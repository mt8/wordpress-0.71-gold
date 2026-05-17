// EN: 071-now SQLite database persistence (Issue #122, full build 4/6).
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
// JA: 071-now SQLite データベースの永続化(Issue #122、フル実装 4/6)。
//
//     071-now playground は WordPress 0.71 の内容を php-wasm 仮想ファイル
//     システム上の単一の SQLite ファイルに保持する。そのファイルシステムは
//     タブを閉じると失われるため、本モジュールが無いと管理画面から作成した
//     投稿やカテゴリーはリロードで失われる(起動シムが php-wasm インスタンス
//     ごとに新しいデータベースを再シードする)。
//
//     本モジュールはその SQLite ファイルをブラウザ内に永続化し、ブログの
//     内容がリロード / タブを閉じても残るようにする(WordPress Playground が
//     ファイルシステムを永続化するのと同じ考え方):
//
//       - OPFS(Origin Private File System)が使える場合はそれを使う。
//       - OPFS の無いブラウザでは IndexedDB をフォールバックに使う。
//
//     ストアは SQLite ファイルの生バイト列を保持する。src/main.js が最初の
//     リクエスト前にそれを php-wasm VFS へ読み込み(起動シムが既存データ
//     ベースを検出しシードを省く)、データベースを変更したリクエストの後に
//     書き戻す。

// EN: Stable identifiers for the persisted database. The OPFS file name
//     and the IndexedDB database / store / key names never change, so a
//     returning visitor finds the same persisted database.
const OPFS_FILE_NAME = '071-now.sqlite';
const IDB_NAME = '071-now-persistence';
const IDB_STORE = 'database';
const IDB_KEY = 'sqlite';

/**
 * Whether the Origin Private File System is usable in this browser.
 *
 * `navigator.storage.getDirectory` is the OPFS entry point, but its mere
 * presence is not enough: Safari exposes `getDirectory` yet does not
 * implement `FileSystemFileHandle.prototype.createWritable()` on the main
 * thread (its OPFS write path is the worker-only synchronous access
 * handle). `opfsSave()` writes through `createWritable()`, so OPFS is
 * only usable here when that method exists too. When it is absent the
 * layer falls back to IndexedDB -- which Safari supports.
 *
 * Kept identical to the copy in src/media-persistence.js so the database
 * and media layers always pick the same backend.
 *
 * @return {boolean} True when OPFS is available and writable here.
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
 * Read the persisted SQLite database from OPFS.
 *
 * @return {Promise<Uint8Array|null>} The database bytes, or null when no
 *                                    database has been persisted yet.
 */
async function opfsLoad() {
	const root = await navigator.storage.getDirectory();
	let handle;
	try {
		// EN: create:false -- a missing file means nothing is persisted.
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
		// EN: Already absent -- nothing to clear.
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
	// EN: The bytes are stored as a Blob; turn it back into a Uint8Array.
	const buffer =
		stored instanceof Blob ? await stored.arrayBuffer() : stored;
	const bytes = new Uint8Array( buffer );
	return bytes.length > 0 ? bytes : null;
}

/**
 * Write the SQLite database bytes to IndexedDB, replacing any earlier
 * copy.
 *
 * @param {Uint8Array} bytes The SQLite file contents.
 * @return {Promise<void>}
 */
async function idbSave( bytes ) {
	// EN: Store a Blob so the bytes are copied out of the (possibly
	//     SharedArrayBuffer-backed) php-wasm heap before the transaction.
	const blob = new Blob( [ bytes ] );
	await idbRun( 'readwrite', ( store ) => store.put( blob, IDB_KEY ) );
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
	 * Pick the storage backend. OPFS is preferred; IndexedDB is the
	 * fallback for browsers without it.
	 */
	constructor() {
		/**
		 * The chosen backend, 'opfs' or 'indexeddb'. Read by the app for
		 * the status line and by the verifier.
		 *
		 * @type {'opfs'|'indexeddb'}
		 */
		this.backend = hasOpfs() ? 'opfs' : 'indexeddb';
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
			// EN: A storage read failure is treated as "nothing
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
