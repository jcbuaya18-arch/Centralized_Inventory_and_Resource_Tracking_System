// IndexedDB Offline Management for LGU Tibiao Inventory System

export const openOfflineDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lgu_tibiao_offline_db', 1);
    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('cached_inventory')) {
        db.createObjectStore('cached_inventory', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline_queue')) {
        db.createObjectStore('offline_queue', { keyPath: 'id' });
      }
    };
    request.onsuccess = (event: any) => {
      resolve(event.target.result);
    };
    request.onerror = (event: any) => {
      reject(event.target.error);
    };
  });
};

export const getOfflineQueue = async (): Promise<any[]> => {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_queue', 'readonly');
      const store = transaction.objectStore('offline_queue');
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error('[Offline DB] Error reading offline queue:', err);
    return [];
  }
};

export const addOfflineQueue = async (item: any): Promise<void> => {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_queue', 'readwrite');
      const store = transaction.objectStore('offline_queue');
      store.put(item);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error('[Offline DB] Error adding to offline queue:', err);
  }
};

export const deleteOfflineQueue = async (id: string): Promise<void> => {
  try {
    const db = await openOfflineDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_queue', 'readwrite');
      const store = transaction.objectStore('offline_queue');
      store.delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  } catch (err) {
    console.error('[Offline DB] Error deleting from offline queue:', err);
  }
};

export const getCachedOfflineInventory = async (): Promise<{ rawItems: any[]; masterAssets: any[] }> => {
  try {
    const db = await openOfflineDB();
    const getCachedKey = (key: string): Promise<any[]> => {
      return new Promise((resolve) => {
        const transaction = db.transaction('cached_inventory', 'readonly');
        const store = transaction.objectStore('cached_inventory');
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result ? request.result.data : []);
        request.onerror = () => resolve([]);
      });
    };

    const rawItems = await getCachedKey('raw_items');
    const masterAssets = await getCachedKey('master_assets');
    return { rawItems, masterAssets };
  } catch (err) {
    console.error('[Offline DB] Error reading cached inventory:', err);
    return { rawItems: [], masterAssets: [] };
  }
};
