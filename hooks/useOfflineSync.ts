import React, { useState, useEffect, useCallback } from 'react';
import { getOfflineQueue, deleteOfflineQueue } from '../offlineDb';
import { InventoryItem } from '../types';

export interface UseOfflineSyncReturn {
  isOnline: boolean;
  showSyncSuccess: boolean;
  isSyncing: boolean;
}

export function useOfflineSync(
  handleAddItemFirestore: (newItem: Partial<InventoryItem>) => Promise<string | undefined>,
  addSystemLog: (action: string, module: string) => Promise<void>,
  setQueuedTransactions: React.Dispatch<React.SetStateAction<any[]>>
): UseOfflineSyncReturn {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [showSyncSuccess, setShowSyncSuccess] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const syncOfflineTransactions = useCallback(async (queueToSync?: any[]) => {
    if (isSyncing) return;
    setIsSyncing(true);

    const queue = queueToSync || await getOfflineQueue();
    if (queue.length === 0) {
      setIsSyncing(false);
      return;
    }

    addSystemLog(`Connection Detected: Synchronizing ${queue.length} offline transaction(s) with Cloud Ledger...`, 'System');

    let successfulCount = 0;

    for (const tx of queue) {
      try {
        console.log('[Offline Sync] Processing item:', tx.id, tx.data);
        await handleAddItemFirestore(tx.data);
        await deleteOfflineQueue(tx.id);

        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({
            type: 'SYNC_COMPLETE',
            payload: { id: tx.id }
          });
        }

        successfulCount++;
      } catch (err) {
        console.error('[Offline Sync] Failed to synchronize transaction:', tx.id, err);
      }
    }

    const remainingQueue = await getOfflineQueue();
    setQueuedTransactions(remainingQueue);

    if (successfulCount > 0) {
      addSystemLog(`System Population: Restored connectivity. Synchronized ${successfulCount} transaction(s) successfully.`, 'System');
      setShowSyncSuccess(true);
      setTimeout(() => setShowSyncSuccess(false), 5000);
    }

    setIsSyncing(false);
  }, [isSyncing, handleAddItemFirestore, addSystemLog, setQueuedTransactions]);

  useEffect(() => {
    const handleOnline = async () => {
      setIsOnline(true);
      const q = await getOfflineQueue();
      if (q.length > 0) {
        await syncOfflineTransactions(q);
      } else {
        setShowSyncSuccess(true);
        const timer = setTimeout(() => setShowSyncSuccess(false), 5000);
        return () => clearTimeout(timer);
      }
    };

    const handleOffline = () => {
      setIsOnline(false);
      setShowSyncSuccess(false);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    const loadQueue = async () => {
      const q = await getOfflineQueue();
      setQueuedTransactions(q);
      if (navigator.onLine && q.length > 0) {
        await syncOfflineTransactions(q);
      }
    };
    loadQueue();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return { isOnline, showSyncSuccess, isSyncing };
}
