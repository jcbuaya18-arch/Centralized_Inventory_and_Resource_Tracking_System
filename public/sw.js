// Centralized Inventory and Resource Tracking System of LGU Tibiao Service Worker
const CACHE_NAME = 'lgu-tibiao-inventory-v2';
const ASSETS = [
  '/',
  '/index.html',
  '/index.css',
  '/tibiaoLogo.jpg',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap',
  'https://cdn.tailwindcss.com'
];

// Open the same IndexedDB as the application
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('lgu_tibiao_offline_db', 1);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('cached_inventory')) {
        db.createObjectStore('cached_inventory', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('offline_queue')) {
        db.createObjectStore('offline_queue', { keyPath: 'id' });
      }
    };
    request.onsuccess = (event) => {
      resolve(event.target.result);
    };
    request.onerror = (event) => {
      reject(event.target.error);
    };
  });
}

function saveCache(key, data) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('cached_inventory', 'readwrite');
      const store = transaction.objectStore('cached_inventory');
      store.put({ id: key, data: data, updatedAt: Date.now() });
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

function getCache(key) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('cached_inventory', 'readonly');
      const store = transaction.objectStore('cached_inventory');
      const request = store.get(key);
      request.onsuccess = () => resolve(request.result ? request.result.data : null);
      request.onerror = () => reject(request.error);
    });
  });
}

function addToQueue(item) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_queue', 'readwrite');
      const store = transaction.objectStore('offline_queue');
      store.put(item);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

function deleteFromQueue(id) {
  return openDB().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('offline_queue', 'readwrite');
      const store = transaction.objectStore('offline_queue');
      store.delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

// Installs cache shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Pre-caching static assets');
      return cache.addAll(ASSETS).catch((err) => {
        console.error('[Service Worker] Error installing public assets:', err);
      });
    })
  );
  self.skipWaiting();
});

// Cleans old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[Service Worker] Expiring old cache storage:', key);
            return caches.delete(key);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Intercepts messages from client to store inventory cache or manage queues
self.addEventListener('message', (event) => {
  if (!event.data) return;
  const { type, payload } = event.data;

  if (type === 'CACHE_INVENTORY') {
    saveCache('raw_items', payload.rawItems)
      .then(() => saveCache('master_assets', payload.masterAssets))
      .then(() => {
        console.log('[Service Worker] Cached raw_items and master_assets successfully.');
      })
      .catch((err) => console.error('[Service Worker] Error caching data in IndexedDB:', err));
  }

  if (type === 'QUEUE_TRANSACTION') {
    addToQueue(payload)
      .then(() => {
        console.log('[Service Worker] Transaction queued offline:', payload.id);
        // Notify all clients of updated queue
        self.clients.matchAll().then((clients) => {
          clients.forEach((client) => {
            client.postMessage({ type: 'QUEUE_UPDATED', payload });
          });
        });
      })
      .catch((err) => console.error('[Service Worker] Error queuing transaction in IndexedDB:', err));
  }

  if (type === 'SYNC_COMPLETE') {
    deleteFromQueue(payload.id)
      .then(() => {
        console.log('[Service Worker] Cleared synced transaction from queue:', payload.id);
      })
      .catch((err) => console.error('[Service Worker] Error deleting transaction from queue:', err));
  }
});

// Uses Stale-While-Revalidate pattern or offline fallback
self.addEventListener('fetch', (event) => {
  // If the app is requesting the local offline inventory endpoint, intercept and serve from IndexedDB
  if (event.request.url.includes('/api/offline-inventory')) {
    event.respondWith(
      Promise.all([getCache('raw_items'), getCache('master_assets')])
        .then(([rawItems, masterAssets]) => {
          const responseData = {
            rawItems: rawItems || [],
            masterAssets: masterAssets || []
          };
          return new Response(JSON.stringify(responseData), {
            headers: { 'Content-Type': 'application/json' }
          });
        })
        .catch((err) => {
          return new Response(JSON.stringify({ error: err.message, rawItems: [], masterAssets: [] }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
          });
        })
    );
    return;
  }

  // Only handle standard GET requests and avoid firebase-firestore calls or third-party auth updates
  if (
    event.request.method !== 'GET' || 
    event.request.url.includes('/firestore.googleapis.com/') || 
    event.request.url.includes('identitytoolkit.googleapis.com') ||
    event.request.url.includes('/api/') || 
    event.request.url.includes('googleapis') ||
    event.request.url.includes('firebase')
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request).then((networkResponse) => {
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch((err) => {
        console.warn('[Service Worker] Offline fetch fallback:', err);
        return cachedResponse;
      });

      return cachedResponse || fetchPromise;
    })
  );
});
