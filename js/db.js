// IndexedDB 持久化封装：布局按断点存储，写操作防抖合并。
const DB_NAME = 'gridboard';
const DB_VERSION = 1;
const STORE = 'layouts';
const LAYOUT_KEY = 'dashboard-v1';

let dbPromise = null;
let memoryFallback = null; // IndexedDB 不可用时的内存降级

function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('当前浏览器不支持 IndexedDB'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // 其他标签页升级版本时主动关闭，避免阻塞
      db.onversionchange = () => db.close();
      resolve(db);
    };
    req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
    req.onblocked = () => reject(new Error('数据库被其他标签页阻塞'));
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const result = fn(store);
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error || new Error('数据库事务失败'));
    t.onabort = () => reject(t.error || new Error('数据库事务中止'));
  });
}

export async function loadLayout() {
  try {
    const db = await openDB();
    return await tx(db, 'readonly', (store) => {
      return new Promise((resolve, reject) => {
        const req = store.get(LAYOUT_KEY);
        req.onsuccess = () => resolve(req.result ?? null);
        req.onerror = () => reject(req.error);
      });
    });
  } catch (err) {
    console.warn('[GridBoard] 读取失败，使用内存降级:', err);
    return memoryFallback;
  }
}

let saveTimer = null;
let pendingData = null;
let onErrorCallback = null;

export function onSaveError(cb) {
  onErrorCallback = cb;
}

async function flushSave() {
  const data = pendingData;
  pendingData = null;
  try {
    const db = await openDB();
    await tx(db, 'readwrite', (store) => store.put(data, LAYOUT_KEY));
  } catch (err) {
    console.warn('[GridBoard] 保存失败:', err);
    memoryFallback = data; // 至少保留在内存中
    if (onErrorCallback) {
      const quota = err && err.name === 'QuotaExceededError';
      onErrorCallback(quota ? '存储空间不足，布局仅保存在内存中' : '布局保存失败，已降级为内存存储');
    }
  }
}

// 防抖保存：拖拽过程中频繁调用只合并为一次写库
export function saveLayout(data, { debounce = 300 } = {}) {
  pendingData = data;
  memoryFallback = data;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, debounce);
}

export async function clearLayout() {
  pendingData = null;
  memoryFallback = null;
  if (saveTimer) clearTimeout(saveTimer);
  try {
    const db = await openDB();
    await tx(db, 'readwrite', (store) => store.delete(LAYOUT_KEY));
  } catch (err) {
    console.warn('[GridBoard] 清除失败:', err);
  }
}
