import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { InventoryItem, Office, UserProfile, UserRole } from '../types';
import { db } from '../firebase';
import {
  collection, addDoc, deleteDoc, doc, updateDoc, getDocs, query, where, setDoc
} from 'firebase/firestore';
import { getOfflineQueue, addOfflineQueue, deleteOfflineQueue } from '../offlineDb';
import { handleFirestoreError, OperationType } from '../lib/errors';

export interface UseInventoryActionsReturn {
  items: InventoryItem[];
  rawItems: any[];
  masterAssets: any[];
  queuedTransactions: any[];
  setQueuedTransactions: React.Dispatch<React.SetStateAction<any[]>>;
  setRawItems: React.Dispatch<React.SetStateAction<any[]>>;
  setMasterAssets: React.Dispatch<React.SetStateAction<any[]>>;
  handleAddItem: (newItem: Partial<InventoryItem>) => Promise<string | undefined>;
  handleRemoveItem: (id: string) => Promise<void>;
  handleUpdateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  handleAddItemFirestore: (newItem: Partial<InventoryItem>) => Promise<string | undefined>;
  addSystemLog: (action: string, module: string) => Promise<void>;
}

export function useInventoryActions(
  isAuthenticated: boolean,
  userProfile: UserProfile,
  offices: Office[],
  rawItems: any[],
  masterAssets: any[],
  setRawItems: React.Dispatch<React.SetStateAction<any[]>>,
  setMasterAssets: React.Dispatch<React.SetStateAction<any[]>>,
  addSystemLog: (action: string, module: string) => Promise<void>,
): UseInventoryActionsReturn {
  const [queuedTransactions, setQueuedTransactions] = useState<any[]>([]);
  const hasAutoArchivedRef = useRef<Set<string>>(new Set());

  const items = useMemo(() => {
    const masterMap = new Map<string, any>();
    masterAssets.forEach(ma => { masterMap.set(ma.id, ma); });

    const joined = rawItems.map(raw => {
      const master = masterMap.get(raw.masterAssetId);
      if (!master) return { ...raw, id: raw.id };
      return { ...master, ...raw, id: raw.id };
    });

    const withOfflinePending = [...joined];
    queuedTransactions.forEach(q => {
      withOfflinePending.push({
        id: q.id, isOfflinePending: true, masterAssetId: 'offline-pending-master',
        article: q.data.article || 'Unknown Item',
        description: q.data.description || 'Offline recorded transaction awaiting synchronization',
        category: q.data.category || 'Other Assets',
        propertyNumber: q.data.propertyNumber || 'OFFLINE-QUEUE',
        unitOfMeasure: q.data.unitOfMeasure || 'unit',
        unitValue: q.data.unitValue || q.data.acquisitionCost || 0,
        acquisitionCost: q.data.acquisitionCost || q.data.unitValue || 0,
        qtyPropertyCard: q.data.qtyPropertyCard || 0,
        qtyPhysicalCount: q.data.qtyPhysicalCount || 1,
        office: q.data.office || 'Municipal Hall',
        personAccountable: q.data.personAccountable || 'Offline User',
        remarks: q.data.remarks || 'Queued Offline',
        status: q.data.status || 'AVAILABLE',
        condition: q.data.condition || 'New',
        serialNumber: q.data.serialNumber || '',
        modelNumber: q.data.modelNumber || '',
        createdAt: q.timestamp,
        history: q.data.history || []
      });
    });

    return [...withOfflinePending].sort((a: any, b: any) => {
      const timeA = a.createdAt || '';
      const timeB = b.createdAt || '';
      if (timeA && timeB) return timeA.localeCompare(timeB);
      if (timeA) return 1;
      if (timeB) return -1;
      return (a.article || '').localeCompare(b.article || '');
    });
  }, [rawItems, masterAssets, queuedTransactions]);

  // ── Automatic Expiration Notifications & Archiving ──
  const isItemExpired = (item: InventoryItem): boolean => {
    if (item.condition === 'Expired') return true;
    if (!item.expirationDate) return false;
    try {
      const expDate = new Date(item.expirationDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      return expDate.getTime() <= today.getTime();
    } catch { return false; }
  };

  useEffect(() => {
    if (!isAuthenticated || userProfile.role !== UserRole.ADMIN || items.length === 0) return;

    const itemsToArchive = items.filter(item => {
      if (item.isArchived) return false;
      if (hasAutoArchivedRef.current.has(item.id)) return false;
      return isItemExpired(item);
    });

    const runAutoArchive = async () => {
      for (const item of items) {
        if (item.isArchived) continue;
        try {
          const timestamp = new Date().toISOString();
          const isExpired = isItemExpired(item);
          if (!isExpired) {
            if (item.expirationDate) {
              const expirationDate = new Date(`${item.expirationDate}T00:00:00`);
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const threshold = new Date(today);
              threshold.setDate(threshold.getDate() + 30);
              if (expirationDate >= today && expirationDate <= threshold) {
                await setDoc(doc(db, 'notifications', `expiry-${item.id}-${item.expirationDate}`), {
                  recipientRole: 'ADMIN',
                  message: `Asset "${item.article}" in ${item.office || 'Unassigned Office'} will expire on ${item.expirationDate}.`,
                  timestamp,
                  isRead: false,
                  type: 'EXPIRATION_WARNING',
                  inventoryItemId: item.id
                }, { merge: true });
              }
            }
            continue;
          }

          const reason: 'EXPIRED' = 'EXPIRED';

          await setDoc(doc(db, 'notifications', `expiry-expired-${item.id}-${item.expirationDate}`), {
            recipientRole: 'ADMIN',
            message: `Asset "${item.article}" in ${item.office || 'Unassigned Office'} expired on ${item.expirationDate} and was automatically archived.`,
            timestamp,
            isRead: false,
            type: 'EXPIRATION_EXPIRED',
            inventoryItemId: item.id
          }, { merge: true });

          hasAutoArchivedRef.current.add(item.id);

          await handleUpdateItem(item.id, {
            isArchived: true,
            archivedAt: timestamp,
            archivedBy: 'SYSTEM (Auto-Archive)',
            archiveReason: reason,
            status: 'RETIRED',
            condition: 'Expired',
            history: [...(item.history || []), {
              id: Math.random().toString(36).substr(2, 9),
              timestamp, user: 'SYSTEM (Auto-Archive)',
              action: 'AUTOMATIC ARCHIVE', field: 'Archive Status',
              oldValue: item.status || 'ACTIVE', newValue: reason,
            }],
          });

          addSystemLog(
            `AUTOMATIC ARCHIVE — ${reason}: "${item.article}" (${item.propertyNumber || 'N/A'}) — Condition: ${item.condition || 'N/A'}, Expiration: ${item.expirationDate || 'N/A'}`,
            'Inventory'
          );
        } catch (err) {
          console.error(`[Auto-Archive] Failed to archive item ${item.id}:`, err);
        }
      }
    };

    if (itemsToArchive.length > 0 || items.some(item => item.expirationDate)) runAutoArchive();
  }, [items, isAuthenticated, userProfile.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const getOrCreateMasterAsset = useCallback(async (itemData: any): Promise<string> => {
    const propertyNumber = itemData.propertyNumber || `LGU-${(itemData.category || "Equipment").substring(0, 3).toUpperCase()}-2026-${Math.floor(1000 + Math.random() * 9000)}`;
    const serialNumber = itemData.serialNumber || '';
    const article = (itemData.article || 'Unknown Item').trim().toUpperCase();

    const masterAssetsCol = collection(db, 'master_assets');
    const qProp = query(masterAssetsCol, where('propertyNumber', '==', propertyNumber));
    const snapProp = await getDocs(qProp);
    if (!snapProp.empty) return snapProp.docs[0].id;

    if (serialNumber) {
      const qSerial = query(masterAssetsCol, where('serialNumber', '==', serialNumber));
      const snapSerial = await getDocs(qSerial);
      if (!snapSerial.empty) return snapSerial.docs[0].id;
    }

    const qArticle = query(masterAssetsCol, where('article', '==', article));
    const snapArticle = await getDocs(qArticle);
    if (!snapArticle.empty) return snapArticle.docs[0].id;

    const masterDocRef = doc(masterAssetsCol);
    const cost = itemData.acquisitionCost || itemData.unitValue || 0;
    const classification = cost >= 50000 ? 'PAR' : 'ICS';

    await setDoc(masterDocRef, {
      propertyNumber, article,
      description: itemData.description || `Standard ${itemData.category || 'Asset'}`,
      category: itemData.category || 'Other Assets',
      brand: itemData.brand || '', modelNumber: itemData.modelNumber || '',
      serialNumber, unitOfMeasure: itemData.unitOfMeasure || 'unit',
      unitValue: itemData.unitValue || cost, acquisitionCost: itemData.acquisitionCost || cost,
      acquisitionDate: itemData.acquisitionDate || itemData.dateReceived || '',
      supplier: itemData.supplier || '', warrantyExpiration: itemData.warrantyExpiration || '',
      expirationDate: itemData.expirationDate || '',
      usefulLife: itemData.usefulLife || 5, assetCode: itemData.assetCode || '',
      classification, isFixed: itemData.isFixed || false, isFixedMaster: itemData.isFixedMaster || false,
    });

    return masterDocRef.id;
  }, []);

  const handleAddItemFirestore = useCallback(async (newItem: Partial<InventoryItem>) => {
    const targetOffice = newItem.office || offices[0]?.name || 'Municipal Hall';
    const targetCondition = newItem.condition || 'New';
    const masterAssetId = await getOrCreateMasterAsset(newItem);

    const matchedItem = items.find(item =>
      item.masterAssetId === masterAssetId &&
      item.office && item.office.toLowerCase().trim() === targetOffice.toLowerCase().trim() &&
      (item.condition || 'New').toLowerCase().trim() === targetCondition.toLowerCase().trim()
    );

    const timestamp = new Date().toISOString();
    const dateStr = timestamp.split('T')[0];
    const timeStr = new Date().toLocaleTimeString();

    if (matchedItem) {
      const oldQtyPhys = Number(matchedItem.qtyPhysicalCount) || 0;
      const newQty = Number(newItem.qtyPhysicalCount) || 1;
      const newQtyPhys = oldQtyPhys + newQty;
      const newQtyProp = (Number(matchedItem.qtyPropertyCard) || 0) + newQty;

      try {
        await updateDoc(doc(db, 'inventory_items', matchedItem.id), {
          qtyPhysicalCount: newQtyPhys, qtyPropertyCard: newQtyProp,
          expirationDate: newItem.expirationDate || matchedItem.expirationDate || '',
          condition: newItem.condition || matchedItem.condition || 'Good',
          history: [...(matchedItem.history || []), {
            id: Math.random().toString(36).substr(2, 9),
            timestamp, user: userProfile.fullName,
            action: `Stock Receipt: Added ${newQty} units. Remarks: Duplicate item prevented, stock incremented.`
          }]
        });
        addSystemLog(`Stock Merged: ${newItem.article || 'Asset'} (added ${newQty} units)`, 'Inventory');

        await addDoc(collection(db, 'inventory_transactions'), {
          itemId: matchedItem.id, article: newItem.article || 'Asset',
          officeId: targetOffice, transactionType: 'Item Received',
          quantity: newQty, previousBalance: oldQtyPhys, newBalance: newQtyPhys,
          user: userProfile.fullName, date: dateStr, time: timeStr, timestamp,
          remarks: `Incremental stock replenishment (automatic merge)`, reference: 'MANUAL-ADD'
        });

        return matchedItem.id;
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, 'inventory_items');
      }
    } else {
      const itemData = {
        masterAssetId,
        qtyPropertyCard: newItem.qtyPropertyCard || 0,
        qtyPhysicalCount: newItem.qtyPhysicalCount || 1,
        office: targetOffice,
        personAccountable: newItem.personAccountable || userProfile.fullName,
        remarks: newItem.remarks || 'Added via Cloud Sync',
        history: newItem.history || [{
          id: Math.random().toString(36).substr(2, 9),
          timestamp, user: userProfile.fullName, action: 'Initial Entry'
        }],
        imageUrls: newItem.imageUrls || [],
        createdAt: newItem.createdAt || timestamp,
        assignedStaff: newItem.assignedStaff || '',
        status: newItem.status || 'AVAILABLE',
        condition: targetCondition,
        expirationDate: newItem.expirationDate || '',
        dateAssigned: newItem.dateAssigned || '',
        dateReceived: newItem.dateReceived || dateStr,
      };

      try {
        const docRef = await addDoc(collection(db, 'inventory_items'), itemData);
        addSystemLog(`Cloud Persistence: ${newItem.article || 'Asset'}`, 'Inventory');

        await addDoc(collection(db, 'inventory_transactions'), {
          itemId: docRef.id, article: newItem.article || 'Asset',
          officeId: targetOffice, transactionType: 'Item Received',
          quantity: itemData.qtyPhysicalCount, previousBalance: 0,
          newBalance: itemData.qtyPhysicalCount,
          user: userProfile.fullName, date: dateStr, time: timeStr, timestamp,
          remarks: `Initial inventory registration`, reference: 'MANUAL-ADD'
        });

        return docRef.id;
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'inventory_items');
      }
    }
  }, [items, offices, userProfile.fullName, getOrCreateMasterAsset, addSystemLog]);

  const handleAddItem = useCallback(async (newItem: Partial<InventoryItem>) => {
    if (!navigator.onLine) {
      const txId = `offline-pending-${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date().toISOString();
      const payload = { id: txId, timestamp, data: newItem };

      await addOfflineQueue(payload);
      const q = await getOfflineQueue();
      setQueuedTransactions(q);

      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
          type: 'QUEUE_TRANSACTION', payload
        });
      }

      addSystemLog(`Offline Mode: Transaction queued locally (${newItem.article || 'Asset'})`, 'Inventory');
      alert(`Connection Offline: Your receiving transaction for "${newItem.article || 'Asset'}" has been queued locally. It will automatically synchronize with the Cloud Ledger once connection is restored.`);
      return txId;
    } else {
      return handleAddItemFirestore(newItem);
    }
  }, [handleAddItemFirestore, addSystemLog]);

  const handleRemoveItem = useCallback(async (id: string) => {
    const targetItem = items.find(item => item.id === id);
    if (userProfile.role !== UserRole.ADMIN) {
      alert("Unauthorized Access: Only administrators can delete inventory records.");
      return;
    }
    const imageUrlsToDelete = targetItem?.imageUrls || [];
    try {
      await deleteDoc(doc(db, 'inventory_items', id));

      const rpcppeSnapshot = await getDocs(query(
        collection(db, 'rpcppes'),
        where('inventoryItemId', '==', id),
      ));
      await Promise.all(rpcppeSnapshot.docs.map((rpcppeDoc) => deleteDoc(rpcppeDoc.ref)));

      await deleteDoc(doc(db, 'stock_cards', id));

      if (targetItem?.masterAssetId) {
        const remainingInventorySnapshot = await getDocs(query(
          collection(db, 'inventory_items'),
          where('masterAssetId', '==', targetItem.masterAssetId),
        ));
        if (remainingInventorySnapshot.empty) {
          await deleteDoc(doc(db, 'master_assets', targetItem.masterAssetId));
        }
      }

      addSystemLog('Asset Record Purged', 'Inventory');
      if (imageUrlsToDelete.length > 0) {
        try {
          await fetch('/api/delete-inventory-images', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paths: imageUrlsToDelete,
              user: userProfile.fullName,
              userRole: userProfile.role,
              userOffice: userProfile.office,
              inventoryId: id
            })
          });
        } catch (imgErr) {
          console.error("Failed to clean up image files on server:", imgErr);
        }
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `inventory_items/${id}`);
    }
  }, [items, userProfile, addSystemLog]);

  const handleUpdateItem = useCallback(async (id: string, updates: Partial<InventoryItem>) => {
    const targetItem = items.find(item => item.id === id);
    if (targetItem && ((targetItem as any).isFixed || (targetItem as any).isFixedMaster) && userProfile.role !== UserRole.ADMIN) {
      alert("This is a protected system master data record. Only authorized administrators (ADMIN) can edit it.");
      return;
    }
    try {
      const cleanUpdates: any = {};
      const masterUpdates: any = {};

      const masterFields = [
        'article', 'description', 'propertyNumber', 'category', 'brand', 'modelNumber',
        'serialNumber', 'unitOfMeasure', 'unitValue', 'acquisitionCost', 'acquisitionDate',
        'supplier', 'warrantyExpiration', 'expirationDate', 'usefulLife', 'assetCode', 'classification', 'isFixed', 'isFixedMaster'
      ];

      Object.entries(updates).forEach(([key, val]) => {
        if (val !== undefined && key !== 'id') {
          if (masterFields.includes(key)) {
            masterUpdates[key] = val;
          } else {
            cleanUpdates[key] = val;
          }
        }
      });

      const masterId = targetItem?.masterAssetId;
      if (masterId && Object.keys(masterUpdates).length > 0) {
        if (masterUpdates.acquisitionCost !== undefined || masterUpdates.unitValue !== undefined) {
          const costValue = masterUpdates.acquisitionCost !== undefined ? masterUpdates.acquisitionCost : masterUpdates.unitValue;
          masterUpdates.classification = (costValue || 0) >= 50000 ? 'PAR' : 'ICS';
        }
        await updateDoc(doc(db, 'master_assets', masterId), masterUpdates);
      }

      if (Object.keys(cleanUpdates).length > 0) {
        await updateDoc(doc(db, 'inventory_items', id), cleanUpdates);
      }

      const updatedArticle = masterUpdates.article || targetItem?.article || id;
      addSystemLog(`Asset Record Updated: ${updatedArticle}`, 'Inventory');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `inventory_items/${id}`);
    }
  }, [items, userProfile.role, addSystemLog]);

  return {
    items, rawItems, masterAssets, queuedTransactions,
    setQueuedTransactions, setRawItems, setMasterAssets,
    handleAddItem, handleRemoveItem, handleUpdateItem,
    handleAddItemFirestore, addSystemLog,
  };
}


