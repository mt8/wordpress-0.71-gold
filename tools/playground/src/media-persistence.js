// EN: 071-now uploaded-media persistence (Issue #124, full build 5/6).
//
//     WordPress 0.71's classic admin has an upload page
//     (wp-admin/b2upload.php) that writes uploaded images to
//     $fileupload_realpath -- wp-content/uploads/. In the playground that
//     path is inside the php-wasm virtual filesystem, which is discarded
//     when the tab closes, so without this module an image uploaded
//     through the admin is lost on reload -- exactly as the SQLite
//     database was before Issue #122.
//
//     This module is the media counterpart of src/persistence.js. Where
//     persistence.js stores the one SQLite file, this stores the whole
//     uploaded-media tree (wp-content/uploads/, which 0.71 may fill with
//     nested files) as a path -> bytes map, in the same browser stores:
//
//       - OPFS (the Origin Private File System) when available -- the
//         media tree is mirrored into a dedicated OPFS sub-directory.
//       - IndexedDB as the fallback -- the path -> bytes map is stored
//         under a single key.
//
//     src/main.js loads the persisted media into the php-wasm VFS before
//     the first request (so an uploaded image is on disk when the blog
//     renders it) and writes it back after every request that changed the
//     uploads tree. The reset control clears this store alongside the
//     database, so a reset returns the playground to its image-free
//     seeded state.
// JA: 071-now のアップロードメディア永続化(Issue #124、フル実装 5/6)。
//
//     WordPress 0.71 の従来型管理画面にはアップロードページ
//     (wp-admin/b2upload.php)があり、アップロード画像を
//     $fileupload_realpath -- wp-content/uploads/ -- へ書き込む。playground
//     ではそのパスは php-wasm 仮想ファイルシステム上にあり、タブを閉じると
//     失われるため、本モジュールが無いと管理画面からアップロードした画像は
//     リロードで失われる(Issue #122 以前の SQLite データベースと同じ)。
//
//     本モジュールは src/persistence.js のメディア版である。persistence.js
//     が単一の SQLite ファイルを保存するのに対し、本モジュールは
//     アップロードメディアツリー全体(wp-content/uploads/)を「パス ->
//     バイト列」のマップとして、同じブラウザストアに保存する:
//
//       - OPFS が使える場合はメディアツリーを専用 OPFS サブディレクトリへ
//         複製する。
//       - OPFS の無いブラウザでは IndexedDB をフォールバックに使う。
//
//     src/main.js が最初のリクエスト前に永続メディアを php-wasm VFS へ
//     読み込み、uploads ツリーを変更したリクエストの後に書き戻す。リセット
//     操作はこのストアをデータベースと併せてクリアする。

// EN: Stable identifiers for the persisted media. The OPFS directory name
//     and the IndexedDB database / store / key names never change, so a
//     returning visitor finds the same persisted uploads tree.
const OPFS_DIR_NAME = '071-now-uploads';
const IDB_NAME = '071-now-media';
const IDB_STORE = 'uploads';
const IDB_KEY = 'tree';

// EN: A throwaway file name the OPFS runtime probe writes and deletes.
//     Distinct from OPFS_DIR_NAME so the probe never disturbs the real
//     persisted uploads tree.
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
 * Kept identical to the copy in src/persistence.js so the database and
 * media layers always pick the same backend.
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
 * Kept identical to the copy in src/persistence.js so the database and
 * media layers always pick the same backend.
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
		// EN: OPFS API present but not usable -- fall back to IndexedDB.
		return false;
	}
}

/**
 * Recursively read an OPFS directory into a path -> bytes map.
 *
 * The uploaded-media tree is flat in practice (b2upload.php writes
 * straight into wp-content/uploads/), but it is walked recursively so a
 * nested layout would still round-trip.
 *
 * @param {FileSystemDirectoryHandle} dir    The directory to read.
 * @param {string}                    prefix Path prefix for this level.
 * @param {Object<string,Uint8Array>} out    The map being filled.
 * @return {Promise<void>}
 */
async function opfsReadDir( dir, prefix, out ) {
	for await ( const [ name, handle ] of dir.entries() ) {
		const path = prefix ? `${ prefix }/${ name }` : name;
		if ( handle.kind === 'directory' ) {
			await opfsReadDir( handle, path, out );
		} else {
			const file = await handle.getFile();
			out[ path ] = new Uint8Array( await file.arrayBuffer() );
		}
	}
}

/**
 * Read the persisted uploaded-media tree from OPFS.
 *
 * @return {Promise<Object<string,Uint8Array>|null>} The path -> bytes
 *         map, or null when no media has been persisted yet.
 */
async function opfsLoad() {
	const root = await navigator.storage.getDirectory();
	let dir;
	try {
		// EN: create:false -- a missing directory means nothing is persisted.
		dir = await root.getDirectoryHandle( OPFS_DIR_NAME, { create: false } );
	} catch {
		return null;
	}
	const tree = {};
	await opfsReadDir( dir, '', tree );
	return Object.keys( tree ).length > 0 ? tree : null;
}

/**
 * Get (creating as needed) the OPFS directory handle for a nested path.
 *
 * @param {FileSystemDirectoryHandle} root The OPFS media root.
 * @param {string[]}                  segments Directory segments.
 * @return {Promise<FileSystemDirectoryHandle>} The leaf directory handle.
 */
async function opfsEnsureDir( root, segments ) {
	let dir = root;
	for ( const segment of segments ) {
		dir = await dir.getDirectoryHandle( segment, { create: true } );
	}
	return dir;
}

/**
 * Write the uploaded-media tree to OPFS, replacing any earlier copy.
 *
 * @param {Object<string,Uint8Array>} tree The path -> bytes map.
 * @return {Promise<void>}
 */
async function opfsSave( tree ) {
	const root = await navigator.storage.getDirectory();
	// EN: Replace the whole sub-tree so a file deleted in the VFS is also
	//     dropped from the persistent store.
	try {
		await root.removeEntry( OPFS_DIR_NAME, { recursive: true } );
	} catch {
		// EN: Not present yet -- nothing to remove.
	}
	const mediaRoot = await root.getDirectoryHandle( OPFS_DIR_NAME, {
		create: true,
	} );
	for ( const [ path, bytes ] of Object.entries( tree ) ) {
		const segments = path.split( '/' );
		const fileName = segments.pop();
		const dir = await opfsEnsureDir( mediaRoot, segments );
		const handle = await dir.getFileHandle( fileName, { create: true } );
		const writable = await handle.createWritable();
		try {
			await writable.write( bytes );
		} finally {
			await writable.close();
		}
	}
}

/**
 * Remove the persisted uploaded-media directory from OPFS.
 *
 * @return {Promise<void>}
 */
async function opfsClear() {
	const root = await navigator.storage.getDirectory();
	try {
		await root.removeEntry( OPFS_DIR_NAME, { recursive: true } );
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
 * @param {'readonly'|'readwrite'}                 mode Transaction mode.
 * @param {(store: IDBObjectStore) => IDBRequest}  run  The store operation.
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
 * Read the persisted uploaded-media tree from IndexedDB.
 *
 * @return {Promise<Object<string,Uint8Array>|null>} The path -> bytes
 *         map, or null when no media has been persisted yet.
 */
async function idbLoad() {
	const stored = await idbRun( 'readonly', ( store ) => store.get( IDB_KEY ) );
	if ( ! stored || typeof stored !== 'object' ) {
		return null;
	}
	// EN: idbSave stores Uint8Array values (see toStorableBytes). A Blob
	//     value is still handled so a media tree persisted by an earlier
	//     build -- which stored Blobs -- is read back without loss.
	const tree = {};
	for ( const [ path, value ] of Object.entries( stored ) ) {
		const buffer =
			value instanceof Blob ? await value.arrayBuffer() : value;
		tree[ path ] = new Uint8Array( buffer );
	}
	return Object.keys( tree ).length > 0 ? tree : null;
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
 * Kept identical to the copy in src/persistence.js.
 *
 * @param {Uint8Array} bytes The (possibly SharedArrayBuffer-backed) data.
 * @return {Uint8Array} A standalone, non-shared copy of the bytes.
 */
function toStorableBytes( bytes ) {
	return new Uint8Array( bytes );
}

/**
 * Write the uploaded-media tree to IndexedDB, replacing any earlier copy.
 *
 * @param {Object<string,Uint8Array>} tree The path -> bytes map.
 * @return {Promise<void>}
 */
async function idbSave( tree ) {
	// EN: Store each file as a standalone Uint8Array -- see
	//     toStorableBytes: WebKit's IndexedDB cannot store a Blob in a
	//     cross-origin-isolated page, and the php-wasm heap the bytes
	//     come from may be a SharedArrayBuffer.
	const stored = {};
	for ( const [ path, bytes ] of Object.entries( tree ) ) {
		stored[ path ] = toStorableBytes( bytes );
	}
	await idbRun( 'readwrite', ( store ) => store.put( stored, IDB_KEY ) );
}

/**
 * Remove the persisted uploaded-media tree from IndexedDB.
 *
 * @return {Promise<void>}
 */
async function idbClear() {
	await idbRun( 'readwrite', ( store ) => store.delete( IDB_KEY ) );
}

/**
 * Persistence handle for the in-browser uploaded-media tree.
 *
 * One instance is created at boot, alongside the DatabasePersistence
 * handle. It picks OPFS or the IndexedDB fallback once -- the same
 * decision DatabasePersistence makes -- and routes load / save / clear to
 * the chosen backend, so the rest of the app does not care which store is
 * in use.
 */
export class MediaPersistence {

	/**
	 * Start with a provisional backend. `selectBackend()` confirms it
	 * with a real OPFS probe before the layer is used.
	 */
	constructor() {
		/**
		 * The backend in use, 'opfs' or 'indexeddb'. Provisional until
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
	 * Load the persisted uploaded-media tree, if one exists.
	 *
	 * @return {Promise<Object<string,Uint8Array>|null>} The path -> bytes
	 *         map, or null when nothing has been persisted yet (a first
	 *         run, or after a reset).
	 */
	async load() {
		try {
			return this.backend === 'opfs'
				? await opfsLoad()
				: await idbLoad();
		} catch {
			// EN: A storage read failure is treated as "nothing
			//     persisted" so the playground still boots -- it just
			//     starts with no uploaded media.
			return null;
		}
	}

	/**
	 * Persist the uploaded-media tree.
	 *
	 * @param {Object<string,Uint8Array>} tree The path -> bytes map of the
	 *                                          current uploads directory.
	 * @return {Promise<void>}
	 */
	async save( tree ) {
		if ( this.backend === 'opfs' ) {
			await opfsSave( tree );
		} else {
			await idbSave( tree );
		}
	}

	/**
	 * Clear the persisted media, returning the store to its empty
	 * (first-run) state.
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
