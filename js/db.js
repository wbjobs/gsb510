/* IndexedDB 持久化层：布局保存 / 恢复，含降级与异常上报 */
(function (global) {
  'use strict';

  const DB_NAME = 'dashboard-layout';
  const DB_VERSION = 1;
  const STORE = 'layout';
  const LAYOUT_KEY = 'current';

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in global)) {
        reject(new Error('当前浏览器不支持 IndexedDB'));
        return;
      }
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('IndexedDB 打开失败'));
      req.onblocked = () => reject(new Error('IndexedDB 被其他页面占用，请关闭后重试'));
    });
    // 打开失败后允许下次重试
    dbPromise.catch(() => { dbPromise = null; });
    return dbPromise;
  }

  function tx(mode, fn) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(STORE, mode);
      const store = t.objectStore(STORE);
      const result = fn(store);
      t.oncomplete = () => resolve(result && result._value);
      t.onerror = () => reject(t.error || new Error('IndexedDB 事务失败'));
      t.onabort = () => reject(t.error || new Error('IndexedDB 事务被中止'));
    }));
  }

  const db = {
    /** 保存布局（整体覆盖写入） */
    saveLayout(layout) {
      return tx('readwrite', (store) => {
        store.put(JSON.parse(JSON.stringify(layout)), LAYOUT_KEY);
      });
    },

    /** 读取布局；无数据时返回 null */
    loadLayout() {
      return open().then((db) => new Promise((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly')
          .objectStore(STORE)
          .get(LAYOUT_KEY);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error || new Error('读取布局失败'));
      }));
    },

    /** 清空布局 */
    clearLayout() {
      return tx('readwrite', (store) => {
        store.delete(LAYOUT_KEY);
      });
    },
  };

  global.DashDB = db;
})(window);
