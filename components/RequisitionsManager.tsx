import React, { useState, useEffect, useMemo } from 'react';
import { AssetRequest, Office, UserRole } from '../types';
import { isAwaitingAccountingApproval, requiresAccountingReview } from '../lib/requestWorkflow';
import { db, auth, logProcurementTransaction } from '../firebase';
import { logPRSAction } from './auditUtils';
import { ReceivingTimeline } from './ReceivingTimeline';
import {
  collection,
  onSnapshot,
  query,
  orderBy,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  where,
  runTransaction,
  setDoc
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'motion/react';

// Helper functions to decrease or replenish stock in inventory_items collection upon requisition approvals
const approveAndLinkStockRecord = async (
  req: AssetRequest,
  approverName: string,
  requestUpdates: any,
  formStatus: string,
  formRemarks: string,
  timestamp: string
) => {
  try {
    const dateStr = timestamp.split('T')[0];
    const timeStr = new Date().toLocaleTimeString();

    // Prepare list of items to process
    // If the request has an items_snapshot (meaning it is a PAR/ICS report), use it.
    // Otherwise fallback to a single item built from the request's top-level properties.
    const itemsToProcess = (req.items_snapshot && req.items_snapshot.length > 0)
      ? req.items_snapshot
      : [{
        article: req.itemArticle || 'Unnamed Item',
        description: req.justification || 'No description provided.',
        propertyNumber: req.requestNumber || `PROP-${req.requestType || 'REQ'}-${Date.now()}`,
        unitOfMeasure: 'unit',
        unitValue: req.amount || 0,
        qtyPhysicalCount: Number(req.quantity) || 1,
        qtyPropertyCard: Number(req.quantity) || 1,
        category: req.category || 'Other Assets',
        office: req.office || 'Municipal Hall'
      }];

    // Read matching documents before transaction (since queries are forbidden in transactions)
    const itemsCol = collection(db, 'inventory_items');
    const existingDocsSnapshot = await getDocs(itemsCol);
    const existingDocs = existingDocsSnapshot.docs.map(d => ({
      id: d.id,
      data: d.data()
    }));

    const reportsSnapshot = await getDocs(collection(db, 'reports'));
    const existingReports = reportsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

    const expectedFormType = (req.requestType || 'PAR').toLowerCase();
    const matchedReport = existingReports.find(r =>
      r.id === req.reportId ||
      (r.reportMode === expectedFormType && (r.prsNumber === req.requestNumber || r.id === req.id))
    );

    const associatedFormType = req.requestType || 'PAR';
    const associatedFormId = matchedReport ? matchedReport.id : (req.reportId || '');
    const associatedFormNo = matchedReport
      ? (matchedReport.parNo || matchedReport.icsNo || matchedReport.id)
      : `${associatedFormType}-${req.requestNumber || 'AUTO'}`;

    let lastMatchedId = '';

    // Run transaction
    await runTransaction(db, async (transaction) => {
      // === 1. READS FIRST (ALL transaction.get calls MUST happen here) ===
      const reqRef = doc(db, 'requests', req.id);
      const reqSnap = await transaction.get(reqRef);

      const reportIdToUpdate = req.reportId || matchedReport?.id;
      let reportRef = null;
      let reportSnap = null;
      if (reportIdToUpdate) {
        reportRef = doc(db, 'reports', reportIdToUpdate);
        reportSnap = await transaction.get(reportRef);
      }

      // Pre-fetch inventory_items and stock_cards for all itemsToProcess
      const itemSnapsMap: { [id: string]: any } = {};
      const stockCardSnapsMap: { [id: string]: any } = {};

      for (const item of itemsToProcess) {
        const articleUpper = (item.article || '').trim().toUpperCase();
        const itemPropNum = (item.propertyNumber || '').trim();
        const targetOffice = req.office || 'Municipal Hall';

        const matchedWarehouse = existingDocs.find(d => {
          if (d.data.office !== 'Warehouse') return false;
          const docPropNum = (d.data.propertyNumber || '').trim();
          const docArt = (d.data.article || '').trim().toUpperCase();
          if (itemPropNum && docPropNum) return docPropNum === itemPropNum;
          return docArt === articleUpper;
        });

        const matchedOffice = existingDocs.find(d => {
          if (d.data.office !== targetOffice) return false;
          const docPropNum = (d.data.propertyNumber || '').trim();
          const docArt = (d.data.article || '').trim().toUpperCase();
          if (itemPropNum && docPropNum) return docPropNum === itemPropNum;
          return docArt === articleUpper;
        });

        if (matchedWarehouse && !itemSnapsMap[matchedWarehouse.id]) {
          const itemDocRef = doc(db, 'inventory_items', matchedWarehouse.id);
          itemSnapsMap[matchedWarehouse.id] = await transaction.get(itemDocRef);
          const stockRef = doc(db, 'stock_cards', matchedWarehouse.id);
          stockCardSnapsMap[matchedWarehouse.id] = await transaction.get(stockRef);
        }

        if (matchedOffice && !itemSnapsMap[matchedOffice.id]) {
          const itemDocRef = doc(db, 'inventory_items', matchedOffice.id);
          itemSnapsMap[matchedOffice.id] = await transaction.get(itemDocRef);
          const stockRef = doc(db, 'stock_cards', matchedOffice.id);
          stockCardSnapsMap[matchedOffice.id] = await transaction.get(stockRef);
        }
      }

      // === 2. VALIDATIONS ===
      if (!reqSnap.exists()) {
        throw new Error(`Accounting request ${req.id} does not exist in 'requests'.`);
      }
      const reqData = reqSnap.data() || {};
      if (reqData.status === 'APPROVED' && formStatus === 'APPROVED') {
        throw new Error(`Accounting request ${req.id} has already been approved.`);
      }

      if (reportRef && (!reportSnap || !reportSnap.exists())) {
        throw new Error(`Linked PAR/ICS report document ${reportIdToUpdate} not found in 'reports'.`);
      }

      // === 3. WRITES SECOND (NO MORE transaction.get calls) ===
      for (const item of itemsToProcess) {
        const articleUpper = (item.article || '').trim().toUpperCase();
        const itemPropNum = (item.propertyNumber || '').trim();
        const itemQty = Number(item.qtyPhysicalCount) || Number(item.qtyPropertyCard) || 1;
        const itemValue = Number(item.unitValue) || req.amount || 0;
        const targetOffice = req.office || 'Municipal Hall';

        const matchedWarehouse = existingDocs.find(d => {
          if (d.data.office !== 'Warehouse') return false;
          const docPropNum = (d.data.propertyNumber || '').trim();
          const docArt = (d.data.article || '').trim().toUpperCase();
          if (itemPropNum && docPropNum) return docPropNum === itemPropNum;
          return docArt === articleUpper;
        });

        const matchedOffice = existingDocs.find(d => {
          if (d.data.office !== targetOffice) return false;
          const docPropNum = (d.data.propertyNumber || '').trim();
          const docArt = (d.data.article || '').trim().toUpperCase();
          if (itemPropNum && docPropNum) return docPropNum === itemPropNum;
          return docArt === articleUpper;
        });

        // Helper function to process item creation/update inside the transaction
        const processItemForOffice = (
          matched: any,
          officeName: string,
          personAccountableName: string
        ) => {
          let itemId = '';
          let oldQty = 0;
          let newQty = itemQty;
          let currentHistory: any[] = [];
          let itemDocRef;

          if (matched) {
            itemId = matched.id;
            itemDocRef = doc(db, 'inventory_items', itemId);
            const freshDoc = itemSnapsMap[itemId];
            const data = (freshDoc && freshDoc.exists()) ? freshDoc.data() : matched.data;
            oldQty = Number(data.qtyPhysicalCount) || 0;
            newQty = oldQty + itemQty;
            currentHistory = data.history || [];
          } else {
            itemDocRef = doc(collection(db, 'inventory_items'));
            itemId = itemDocRef.id;
          }

          const rpcppe = mapCategoryToRpcppeFields(item.category || req.category || "Equipment", articleUpper);

          const updatedHistory = [
            ...currentHistory,
            {
              id: Math.random().toString(36).substr(2, 9),
              timestamp,
              user: approverName,
              action: matched
                ? `Stock card updated via Approved Accounting Request (${req.requestType}). Ref: ${req.requestNumber || req.id}. Qty Added: ${itemQty}.`
                : `Stock card created via Approved Accounting Request (${req.requestType}). Ref: ${req.requestNumber || req.id}`
            }
          ];

          const itemPayload = {
            article: articleUpper,
            description: item.description || req.justification || `Auto-created from approved ${req.requestType} request.`,
            propertyNumber: itemPropNum || (matched?.data?.propertyNumber || rpcppe.propertyNumber),
            assetCode: matched?.data?.assetCode || rpcppe.assetCode,
            usefulLife: matched?.data?.usefulLife || rpcppe.usefulLife,
            unitOfMeasure: item.unitOfMeasure || 'unit',
            unitValue: itemValue,
            qtyPropertyCard: newQty,
            qtyPhysicalCount: newQty,
            category: item.category || req.category || rpcppe.category || 'Other Assets',
            office: officeName,
            personAccountable: personAccountableName,
            assignedStaff: personAccountableName,
            remarks: `Created on ${req.requestType} approval. Ref: ${req.requestNumber || req.id}`,
            createdAt: matched?.data?.createdAt || timestamp,
            status: 'ASSIGNED',
            condition: 'New',
            classification: req.requestType || 'PAR',
            isRPCPPE: req.requestType === 'PAR',
            isMaster: true,
            history: updatedHistory,
            associatedFormType,
            associatedFormId,
            associatedFormNo
          };

          if (matched) {
            transaction.update(itemDocRef, itemPayload);
          } else {
            transaction.set(itemDocRef, itemPayload);
          }

          return { itemId, oldQty, newQty };
        };

        const targetOfficeName = targetOffice || 'Warehouse';
        const targetMatched = (targetOfficeName === 'Warehouse') ? matchedWarehouse : (matchedOffice || matchedWarehouse);
        const officeRes = processItemForOffice(targetMatched, targetOfficeName, req.requestedBy || approverName);

        lastMatchedId = officeRes.itemId;

        // Create/Update Stock Card inside transaction without additional reads
        const recordStockCardAndTransaction = (
          itemId: string,
          officeName: string,
          oldQty: number,
          newQty: number
        ) => {
          const stockCardRef = doc(db, 'stock_cards', itemId);

          transaction.set(stockCardRef, {
            itemId,
            article: articleUpper,
            description: item.description || req.justification || `Stock Card for ${articleUpper}`,
            supplier: req.requestedBy || 'N/A',
            office: officeName,
            remainingBalance: newQty,
            quantity: newQty,
            lastUpdated: timestamp
          }, { merge: true });

          const transactionDocRef = doc(collection(db, 'stock_cards', itemId, 'transactions'));
          transaction.set(transactionDocRef, {
            type: 'IN',
            quantity: itemQty,
            date: dateStr,
            timestamp,
            referenceFormId: req.requestNumber || req.id,
            supplier: req.requestedBy || 'N/A',
            beginningBalance: oldQty,
            remainingBalance: newQty,
            office: officeName,
            receivingOfficer: approverName
          });
        };

        recordStockCardAndTransaction(officeRes.itemId, targetOfficeName, officeRes.oldQty, officeRes.newQty);

        // Record stock movement (inventory transactions) inside transaction
        const recordInventoryTransactionHistory = (itemId: string, officeName: string, oldQty: number, newQty: number) => {
          const transRef = doc(collection(db, 'inventory_transactions'));
          transaction.set(transRef, {
            itemId,
            article: articleUpper,
            officeId: officeName,
            transactionType: req.requestType === 'PAR' ? 'Item Received' : 'Item Distributed',
            quantity: itemQty,
            previousBalance: oldQty,
            newBalance: newQty,
            user: approverName,
            date: dateStr,
            time: timeStr,
            timestamp,
            remarks: `Approved Accounting Request (${req.requestType}): ${req.requestNumber || req.id}`,
            reference: req.requestNumber || req.id
          });
        };

        recordInventoryTransactionHistory(officeRes.itemId, targetOfficeName, officeRes.oldQty, officeRes.newQty);

        // Record in system_logs inside transaction
        const newSysLogRef = doc(collection(db, 'system_logs'));
        transaction.set(newSysLogRef, {
          action: `Approved Accounting Request: ${req.requestType} ${req.requestNumber || req.id} auto-updated Stock Card and Warehouse/Office Inventory for ${articleUpper}`,
          module: 'Accounting Requests',
          timestamp,
          user: approverName
        });
      }

      // Update the requests document inside the transaction!
      transaction.update(reqRef, {
        ...requestUpdates,
        linkedItemId: lastMatchedId || ''
      });

      // Also update the report status in 'reports' collection inside the transaction if reportRef is defined!
      if (reportRef) {
        const reportStatusMap: any = {
          'APPROVED': 'Approved',
          'REJECTED': 'Rejected',
          'DECLINED': 'Rejected',
          'Returned for Correction': 'Returned for Revision',
          'RETURNED_FOR_REVISION': 'Returned for Revision'
        };
        const reportForwardedMap: any = {
          'APPROVED': 'Approved',
          'REJECTED': 'Rejected',
          'DECLINED': 'Rejected',
          'Returned for Correction': 'Pending',
          'RETURNED_FOR_REVISION': 'Pending'
        };
        transaction.update(reportRef, {
          status: reportStatusMap[formStatus] || formStatus,
          forwardedStatus: reportForwardedMap[formStatus] || 'Pending',
          adminRemarks: formRemarks || ''
        });
      }

      // Auto notification inside the transaction
      const notifRef = doc(collection(db, 'notifications'));
      transaction.set(notifRef, {
        recipientRole: formStatus === 'PENDING' ? 'ADMIN' : 'OFFICE_HEAD',
        recipientOffice: req.office || 'Municipal Hall',
        message: `Your request "${requestUpdates.itemArticle || req.itemArticle}" has been changed to ${formStatus} by admin. Remarks: "${formRemarks || 'None'}"`,
        timestamp,
        isRead: false,
        type: 'DECISION',
        reportId: req.id
      });
    });

    console.log(`[TRANSACTION SUCCESS] Successfully approved and synchronized PAR/ICS request ${req.id}`);
    return lastMatchedId || 'success';
  } catch (err) {
    console.error("[TRANSACTION FAIL] Error in transaction for PAR/ICS request:", err);
    throw err; // throw to be caught and alert user
  }
};

const approveShipment = approveAndLinkStockRecord;

const deductInventoryStock = async (itemArticle: string, reqOffice: string, qtyNeeded: number) => {
  try {
    const itemsCol = collection(db, 'inventory_items');
    // 1. Try Warehouse central stock first
    const articleLower = itemArticle.trim().toLowerCase();
    const warehouseQuery = query(itemsCol, where('office', '==', 'Warehouse'));
    const warehouseDocs = await getDocs(warehouseQuery);
    const matchedWarehouseDoc = warehouseDocs.docs.find(d => (d.data().article || '').trim().toLowerCase() === articleLower);

    if (matchedWarehouseDoc) {
      const itemData = matchedWarehouseDoc.data();
      const currentQty = Number(itemData.qtyPhysicalCount) || 0;
      const newQty = Math.max(0, currentQty - qtyNeeded);
      await updateDoc(doc(db, 'inventory_items', matchedWarehouseDoc.id), {
        qtyPhysicalCount: newQty,
        qtyPropertyCard: newQty
      });
      console.log(`Decreased stock for "${itemArticle}" in Warehouse. New Qty: ${newQty}`);
      return;
    }

    // 2. Try precise exact match: article and requesting office
    let q = query(
      itemsCol,
      where('article', '==', itemArticle),
      where('office', '==', reqOffice)
    );
    let snapshot = await getDocs(q);

    // 3. Try case-insensitive comparison inside requesting office
    if (snapshot.empty) {
      const officeQuery = query(itemsCol, where('office', '==', reqOffice));
      const officeDocs = await getDocs(officeQuery);
      const matchedDoc = officeDocs.docs.find(d => {
        const art = d.data().article || '';
        return art.trim().toLowerCase() === articleLower;
      });

      if (matchedDoc) {
        const itemData = matchedDoc.data();
        const currentQty = Number(itemData.qtyPhysicalCount) || 0;
        const newQty = Math.max(0, currentQty - qtyNeeded);
        await updateDoc(doc(db, 'inventory_items', matchedDoc.id), {
          qtyPhysicalCount: newQty,
          qtyPropertyCard: newQty
        });
        console.log(`Decreased stock for "${itemArticle}" in "${reqOffice}". New Qty: ${newQty}`);
        return;
      }
    } else {
      const matchedDoc = snapshot.docs[0];
      const itemData = matchedDoc.data();
      const currentQty = Number(itemData.qtyPhysicalCount) || 0;
      const newQty = Math.max(0, currentQty - qtyNeeded);
      await updateDoc(doc(db, 'inventory_items', matchedDoc.id), {
        qtyPhysicalCount: newQty,
        qtyPropertyCard: newQty
      });
      console.log(`Decreased stock (exact match) for "${itemArticle}" in "${reqOffice}". New Qty: ${newQty}`);
      return;
    }

    // 4. Try global search matching article name
    const allQuery = query(itemsCol);
    const allDocs = await getDocs(allQuery);
    const matchedDocGlobal = allDocs.docs.find(d => {
      const art = d.data().article || '';
      return art.trim().toLowerCase() === articleLower;
    });

    if (matchedDocGlobal) {
      const itemData = matchedDocGlobal.data();
      const currentQty = Number(itemData.qtyPhysicalCount) || 0;
      const newQty = Math.max(0, currentQty - qtyNeeded);
      await updateDoc(doc(db, 'inventory_items', matchedDocGlobal.id), {
        qtyPhysicalCount: newQty,
        qtyPropertyCard: newQty
      });
      console.log(`Decreased stock globally for "${itemArticle}". New Qty: ${newQty}`);
    } else {
      console.warn(`No inventory item found matching "${itemArticle}" to decrease stock.`);
    }
  } catch (err) {
    console.error("Error updating inventory quantity upon request approval:", err);
  }
};

const replenishInventoryStock = async (itemArticle: string, reqOffice: string, qtyReturned: number) => {
  try {
    const itemsCol = collection(db, 'inventory_items');
    // 1. Try precise exact match: article and office
    let q = query(
      itemsCol,
      where('article', '==', itemArticle),
      where('office', '==', reqOffice)
    );
    let snapshot = await getDocs(q);

    // 2. Try case-insensitive comparison inside same office
    if (snapshot.empty) {
      const officeQuery = query(itemsCol, where('office', '==', reqOffice));
      const officeDocs = await getDocs(officeQuery);
      const articleLower = itemArticle.trim().toLowerCase();
      const matchedDoc = officeDocs.docs.find(d => {
        const art = d.data().article || '';
        return art.trim().toLowerCase() === articleLower;
      });

      if (matchedDoc) {
        const itemData = matchedDoc.data();
        const currentQty = Number(itemData.qtyPhysicalCount) || 0;
        const newQty = currentQty + qtyReturned;
        await updateDoc(doc(db, 'inventory_items', matchedDoc.id), {
          qtyPhysicalCount: newQty,
          qtyPropertyCard: newQty
        });
        console.log(`Replenished stock for "${itemArticle}" in "${reqOffice}". New Qty: ${newQty}`);
        return;
      }
    } else {
      const matchedDoc = snapshot.docs[0];
      const itemData = matchedDoc.data();
      const currentQty = Number(itemData.qtyPhysicalCount) || 0;
      const newQty = currentQty + qtyReturned;
      await updateDoc(doc(db, 'inventory_items', matchedDoc.id), {
        qtyPhysicalCount: newQty,
        qtyPropertyCard: newQty
      });
      console.log(`Replenished stock (exact match) for "${itemArticle}" in "${reqOffice}". New Qty: ${newQty}`);
      return;
    }

    // 3. Try global search matching article name (if not found in requesting office)
    const allQuery = query(itemsCol);
    const allDocs = await getDocs(allQuery);
    const articleLower = itemArticle.trim().toLowerCase();
    const matchedDocGlobal = allDocs.docs.find(d => {
      const art = d.data().article || '';
      return art.trim().toLowerCase() === articleLower;
    });

    if (matchedDocGlobal) {
      const itemData = matchedDocGlobal.data();
      const currentQty = Number(itemData.qtyPhysicalCount) || 0;
      const newQty = currentQty + qtyReturned;
      await updateDoc(doc(db, 'inventory_items', matchedDocGlobal.id), {
        qtyPhysicalCount: newQty,
        qtyPropertyCard: newQty
      });
      console.log(`Replenished stock globally for "${itemArticle}". New Qty: ${newQty}`);
    } else {
      console.warn(`No inventory item found matching "${itemArticle}" to replenish stock.`);
    }
  } catch (err) {
    console.error("Error replenishing inventory quantity:", err);
  }
};

const mapCategoryToRpcppeFields = (categoryStr: string, itemTitle: string = '') => {
  const normalizedCat = (categoryStr || '').toLowerCase().trim();
  const normalizedTitle = (itemTitle || '').toLowerCase().trim();

  let mappedCategory = 'Other Assets';
  let assetCode = '1-07-99-990';
  let usefulLife = 5;
  let codePrefix = 'OTH';

  if (normalizedCat.includes('office') || normalizedTitle.includes('chair') || normalizedTitle.includes('desk') || normalizedTitle.includes('table')) {
    mappedCategory = 'Office Equipment';
    assetCode = '1-07-05-020';
    usefulLife = 5;
    codePrefix = 'OE';
  } else if (normalizedCat.includes('ict') || normalizedTitle.includes('computer') || normalizedTitle.includes('laptop') || normalizedTitle.includes('printer') || normalizedTitle.includes('scanner') || normalizedTitle.includes('copier')) {
    mappedCategory = 'ICT Equipment';
    assetCode = '1-07-05-030';
    usefulLife = 5;
    codePrefix = 'ICT';
  } else if (normalizedCat.includes('furniture') || normalizedCat.includes('fixtures')) {
    mappedCategory = 'Furniture & Fixtures';
    assetCode = '1-07-07-010';
    usefulLife = 10;
    codePrefix = 'FF';
  } else if (normalizedCat.includes('building')) {
    mappedCategory = 'Buildings';
    assetCode = '1-07-04-010';
    usefulLife = 30;
    codePrefix = 'BLDG';
  } else if (normalizedCat.includes('transportation') || normalizedCat.includes('vehicle') || normalizedTitle.includes('motorcycle') || normalizedTitle.includes('car') || normalizedTitle.includes('truck') || normalizedTitle.includes('van')) {
    mappedCategory = 'Transportation Equipment';
    assetCode = '1-07-06-010';
    usefulLife = 7;
    codePrefix = 'TE';
  } else if (normalizedCat.includes('machinery') || normalizedTitle.includes('machine') || normalizedCat.includes('construction') || normalizedTitle.includes('tool') || normalizedTitle.includes('generator')) {
    mappedCategory = 'Machinery';
    assetCode = '1-07-05-010';
    usefulLife = 10;
    codePrefix = 'MACH';
  }

  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const propertyNumber = `LGU-ENG-${codePrefix}-2026-${randomSuffix}`;

  return {
    category: mappedCategory,
    assetCode,
    usefulLife,
    propertyNumber
  };
};

const classifyAssetByValue = (cost: number): 'PAR' | 'ICS' => {
  return cost >= 50000 ? 'PAR' : 'ICS';
};

const syncFinancialApprovalToEngineerModule = async (pr: any, authorName: string) => {
  const timestamp = new Date().toISOString();
  const itemTitle = (pr.itemArticle || pr.title || "Equipment").trim();
  const qty = pr.quantity || 1;
  const amount = pr.amount || 0; // Total amount
  const unitCost = pr.unitCost || (qty > 0 ? (amount / qty) : amount);

  try {
    const itemsSnapshot = await getDocs(collection(db, 'inventory_items'));
    const existingItems = itemsSnapshot.docs.map(doc => ({
      docId: doc.id,
      ...doc.data()
    })) as any[];

    // Find Warehouse matching item (matches article in uppercase and office === "Warehouse")
    const matchingWarehouseItem = existingItems.find(item =>
      item.office === "Warehouse" &&
      item.article &&
      item.article.toUpperCase().trim() === itemTitle.toUpperCase().trim()
    );

    // Find Designated Office matching item (matches article in uppercase and office === pr.targetOffice)
    const targetOfficeName = pr.targetOffice || pr.office || "Municipal Engineering";
    const matchingOfficeItem = existingItems.find(item =>
      item.office === targetOfficeName &&
      item.article &&
      item.article.toUpperCase().trim() === itemTitle.toUpperCase().trim()
    );

    // Find if we have an existing PAR/ICS report
    const reportsSnapshot = await getDocs(collection(db, 'reports'));
    const existingReports = reportsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

    const isAsset = unitCost >= 50000;
    const expectedFormType = isAsset ? 'par' : 'ics';

    const matchedReport = existingReports.find(r =>
      (r.reportMode === expectedFormType) &&
      (r.prsNumber === pr.slipNumber || r.id === pr.reportId || r.slipNumber === pr.slipNumber)
    );

    const associatedFormType = isAsset ? 'PAR' : 'ICS';
    const associatedFormId = matchedReport ? matchedReport.id : '';
    const associatedFormNo = matchedReport
      ? (matchedReport.parNo || matchedReport.icsNo || matchedReport.id)
      : `${associatedFormType}-${pr.slipNumber || 'AUTO'}`;

    await runTransaction(db, async (transaction) => {
      // === 1. READS FIRST (ALL transaction.get calls MUST happen here) ===
      const prDocRef = doc(db, 'requests', pr.id);
      const prDocSnap = await transaction.get(prDocRef);

      const warehouseItemRef = matchingWarehouseItem ? doc(db, 'inventory_items', matchingWarehouseItem.docId) : null;
      const warehouseItemSnap = warehouseItemRef ? await transaction.get(warehouseItemRef) : null;

      const officeItemRef = matchingOfficeItem ? doc(db, 'inventory_items', matchingOfficeItem.docId) : null;
      const officeItemSnap = officeItemRef ? await transaction.get(officeItemRef) : null;

      // === 2. VALIDATIONS ===
      if (!prDocSnap.exists()) {
        throw new Error("Procurement Request Slip (PRS) does not exist.");
      }

      const prData = prDocSnap.data();
      if (prData.status === 'Completed' || prData.status === 'RECEIVED') {
        throw new Error("This PRS has already been completed or received.");
      }

      // === 3. WRITES SECOND (NO MORE transaction.get calls) ===
      // Update PRS document status to 'Completed' (which means received and approved)
      transaction.update(prDocRef, {
        status: 'Completed',
        receivedAt: timestamp,
        receivedBy: authorName
      });

      const dateStr = timestamp.split('T')[0];
      const timeStr = new Date().toLocaleTimeString();
      const rpcppe = mapCategoryToRpcppeFields(pr.category || "Equipment", itemTitle);

      const processInventoryItemUpdate = (
        matchingItem: any,
        itemSnap: any,
        officeName: string,
        personAccountableName: string
      ) => {
        let itemDocRef;
        let oldQty = 0;
        let currentHistory: any[] = [];

        if (matchingItem) {
          itemDocRef = doc(db, 'inventory_items', matchingItem.docId);
          const data = (itemSnap && itemSnap.exists()) ? itemSnap.data() : matchingItem;
          oldQty = Number(data.qtyPhysicalCount) || 0;
          currentHistory = data.history || [];
        } else {
          itemDocRef = doc(collection(db, 'inventory_items'));
        }

        const newQty = oldQty + qty;
        const updatedHistory = [
          ...currentHistory,
          {
            id: Math.random().toString(36).substr(2, 9),
            timestamp,
            user: authorName,
            action: matchingItem
              ? `Cargo Auto-Updated: Received ${qty} unit(s) via PRS ${pr.slipNumber || pr.id.substring(0, 8)}. Total: ${newQty}`
              : `Initial registration of physical cargo via PRS ${pr.slipNumber || pr.id.substring(0, 8)}.`
          }
        ];

        const itemPayload = {
          article: itemTitle.toUpperCase(),
          description: pr.justification || pr.details || pr.description || `Received via PRS ${pr.slipNumber || pr.id.substring(0, 8)}`,
          propertyNumber: matchingItem?.propertyNumber || rpcppe.propertyNumber,
          assetCode: matchingItem?.assetCode || rpcppe.assetCode,
          usefulLife: matchingItem?.usefulLife || rpcppe.usefulLife,
          category: matchingItem?.category || rpcppe.category || "Equipment",
          classification: classifyAssetByValue(unitCost),
          unitOfMeasure: pr.unit || "unit",
          unitValue: unitCost,
          qtyPropertyCard: newQty,
          qtyPhysicalCount: newQty,
          office: officeName,
          personAccountable: personAccountableName,
          assignedStaff: personAccountableName,
          remarks: `Delivered and verified under PRS ${pr.slipNumber || pr.id.substring(0, 8)}`,
          yearPurchased: new Date(pr.datePurchased || timestamp).getFullYear(),
          status: "AVAILABLE",
          condition: "Good",
          dateReceived: dateStr,
          createdAt: matchingItem?.createdAt || timestamp,
          history: updatedHistory,
          associatedFormType,
          associatedFormId,
          associatedFormNo
        };

        if (matchingItem) {
          transaction.update(itemDocRef, itemPayload);
        } else {
          transaction.set(itemDocRef, itemPayload);
        }

        return { itemId: itemDocRef.id, oldQty, newQty };
      };

      const targetOffice = targetOfficeName || "Warehouse";
      const targetMatched = (targetOffice === "Warehouse") ? matchingWarehouseItem : (matchingOfficeItem || matchingWarehouseItem);
      const targetSnap = (targetOffice === "Warehouse") ? warehouseItemSnap : (officeItemSnap || warehouseItemSnap);
      const officeRes = processInventoryItemUpdate(targetMatched, targetSnap, targetOffice, pr.requestedBy || authorName);

      const recordStockCardAndTransaction = (
        itemId: string,
        officeName: string,
        oldQty: number,
        newQty: number
      ) => {
        const stockCardRef = doc(db, 'stock_cards', itemId);

        transaction.set(stockCardRef, {
          itemId,
          article: itemTitle.toUpperCase(),
          description: pr.justification || pr.details || `Stock Card for ${itemTitle}`,
          supplier: pr.supplier || 'N/A',
          office: officeName,
          remainingBalance: newQty,
          quantity: newQty,
          lastUpdated: timestamp
        }, { merge: true });

        const transactionDocRef = doc(collection(db, 'stock_cards', itemId, 'transactions'));
        transaction.set(transactionDocRef, {
          type: 'IN',
          quantity: qty,
          date: dateStr,
          timestamp,
          referenceFormId: pr.slipNumber || pr.id.substring(0, 8),
          supplier: pr.supplier || 'N/A',
          beginningBalance: oldQty,
          remainingBalance: newQty,
          office: officeName,
          receivingOfficer: authorName
        });
      };

      recordStockCardAndTransaction(officeRes.itemId, targetOffice, officeRes.oldQty, officeRes.newQty);

      const recordInventoryTransactionHistory = (itemId: string, officeName: string, oldQty: number, newQty: number) => {
        const transRef = doc(collection(db, 'inventory_transactions'));
        transaction.set(transRef, {
          itemId,
          article: itemTitle.toUpperCase(),
          officeId: officeName,
          transactionType: 'Item Received',
          quantity: qty,
          previousBalance: oldQty,
          newBalance: newQty,
          user: authorName,
          date: dateStr,
          time: timeStr,
          timestamp,
          remarks: `Cargo received atomically via PRS ${pr.slipNumber || pr.id.substring(0, 8)}`,
          reference: pr.slipNumber || pr.id.substring(0, 8)
        });
      };

      recordInventoryTransactionHistory(officeRes.itemId, targetOffice, officeRes.oldQty, officeRes.newQty);

      const sysLogAccRef = doc(collection(db, 'system_logs'));
      transaction.set(sysLogAccRef, {
        timestamp,
        user: 'Municipal Engineering Office',
        action: `RECEIVED (ATOMIC): "${itemTitle}" | Qty: ${qty} | Val: ₱${amount.toLocaleString()} | Target: ${targetOfficeName} | Reference PRS: ${pr.slipNumber || pr.id.substring(0, 8)}`,
        module: 'Accounting History'
      });

      const sysLogEngRef = doc(collection(db, 'system_logs'));
      transaction.set(sysLogEngRef, {
        timestamp,
        user: authorName,
        action: `RECEIVED (ATOMIC): Received and transferred cargo for "${itemTitle}" | Qty: ${qty} | Ref: ${pr.slipNumber || pr.id.substring(0, 8)}`,
        module: 'Engineer Transaction Log'
      });

      const notifRef = doc(collection(db, 'notifications'));
      transaction.set(notifRef, {
        recipientRole: 'ACCOUNTING',
        message: `DELIVERY CONFIRMED: Item: "${itemTitle}" (Qty: ${qty}) under PRS ${pr.slipNumber || pr.id.substring(0, 8)} has been received and deposited atomically into Warehouse & ${targetOfficeName} inventory.`,
        timestamp,
        isRead: false,
        type: 'RECEIPT',
        reportId: pr.id
      });
    });

    await logProcurementTransaction({
      slipNumber: pr.slipNumber || "N/A",
      requestId: pr.id,
      itemArticle: itemTitle,
      quantity: qty,
      amount: amount || null,
      status: "Received",
      user: authorName,
      office: pr.office || "Municipal Engineering",
      details: `Physically received cargo and matched with PRS details. Atomically committed to Warehouse & ${targetOfficeName} inventory with associated ${associatedFormType} setup.`
    });

  } catch (err: any) {
    console.error("[AUTOPROC] Error syncing financial approval to Engineer module:", err);
    throw err;
  }
};

interface RequisitionsManagerProps {
  offices: Office[];
  userName: string;
  userRole?: UserRole;
  userOffice?: string;
  initialTab?: 'PAR' | 'ICS' | 'REQUISITION' | 'FINANCIAL';
  initialSearch?: string;
}

export const RequisitionsManager: React.FC<RequisitionsManagerProps> = ({ offices, userName, userRole, userOffice, initialTab, initialSearch }) => {
  // Active module tab: 'PAR' | 'ICS' | 'REQUISITION' | 'FINANCIAL'
  const [activeRequestTab, setActiveRequestTab] = useState<'PAR' | 'ICS' | 'REQUISITION' | 'FINANCIAL'>(initialTab || 'PAR');

  const [requests, setRequests] = useState<AssetRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  React.useEffect(() => {
    if (initialTab) {
      setActiveRequestTab(initialTab);
    }
  }, [initialTab]);

  React.useEffect(() => {
    if (initialSearch !== undefined) {
      setSearch(initialSearch);
    }
  }, [initialSearch]);
  const [filterOffice, setFilterOffice] = useState(userRole === UserRole.OFFICE_HEAD && userOffice ? userOffice : '');
  const [filterStatus, setFilterStatus] = useState('ALL'); // ALL, FORWARDED, PENDING, APPROVED, DECLINED/REJECTED, DISPATCHED
  const [filterPriority, setFilterPriority] = useState('ALL'); // ALL, Low, Medium, High

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showSendOfficeModal, setShowSendOfficeModal] = useState(false);
  const [showViewContentModal, setShowViewContentModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<AssetRequest | null>(null);
  const [viewingRequest, setViewingRequest] = useState<AssetRequest | null>(null);
  const [linkedApprovalReport, setLinkedApprovalReport] = useState<any>(null);
  const [destinationOffice, setDestinationOffice] = useState('');

  // Requisition Form Fields
  const [formItemArticle, setFormItemArticle] = useState('');
  const [formCategory, setFormCategory] = useState('ICT Equipment');
  const [formQuantity, setFormQuantity] = useState(1);
  const [formUnitValue, setFormUnitValue] = useState(0);
  const [formJustification, setFormJustification] = useState('');
  const [formOffice, setFormOffice] = useState('');
  const [formRequestedBy, setFormRequestedBy] = useState('');
  const [formStatus, setFormStatus] = useState<AssetRequest['status']>('PENDING');
  const [formRemarks, setFormRemarks] = useState('');

  // PAR/ICS/Accounting Request form fields
  const [formRequestNumber, setFormRequestNumber] = useState('');
  const [formAssignedAdmin, setFormAssignedAdmin] = useState('');
  const [formAttachedDocs, setFormAttachedDocs] = useState<string[]>([]);

  // Financial Form Fields
  const [financialTitle, setFinancialTitle] = useState('');
  const [financialDetails, setFinancialDetails] = useState('');
  const [financialAmount, setFinancialAmount] = useState<number | ''>('');
  const [financialPriority, setFinancialPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');

  // Inline comment states
  const [quickRemarks, setQuickRemarks] = useState<{ [key: string]: string }>({});
  const [submittingActionId, setSubmittingActionId] = useState<string | null>(null);

  const [expandedAuditIds, setExpandedAuditIds] = useState<{ [key: string]: boolean }>({});
  const [notifications, setNotifications] = useState<any[]>([]);

  const categories = [
    'ICT Equipment',
    'Furniture & Fixtures',
    'Office Equipment',
    'Transportation Equipment',
    'Safety Equipment',
    'Communication Equipment',
    'Medical Equipment',
    'Agricultural Equipment',
    'Other Assets'
  ];

  // Load real-time requests from the database 'requests' collection
  useEffect(() => {
    let q;
    if (userRole === UserRole.ADMIN || userRole === UserRole.ACCOUNTING) {
      q = query(collection(db, 'requests'), orderBy('requestedAt', 'desc'));
    } else {
      q = query(
        collection(db, 'requests'),
        where('office', '==', userOffice),
        orderBy('requestedAt', 'desc')
      );
    }
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => {
        const data = doc.data();
        // Normalize legacy records before applying tabs and filters. Older records may
        // use lowercase type values or store the article under title/details fields.
        let rType = String(data.requestType || '').trim().toUpperCase();
        if (!rType) {
          rType = data.amount !== undefined || (!data.itemArticle && data.title)
            ? 'FINANCIAL'
            : 'REQUISITION';
        }

        return {
          ...data,
          id: doc.id,
          requestType: rType,
          itemArticle: data.itemArticle || data.title || 'Untitled Financial Request',
          justification: data.justification || data.details || '',
        } as AssetRequest;
      });
      // Engineer/Admin, Supply and Mayor only see requests Accounting has already approved
      const hideAccountingStage = userRole === UserRole.ADMIN || userRole === UserRole.SUPPLY || userRole === UserRole.MAYOR;
      setRequests(hideAccountingStage ? list.filter(r => !isAwaitingAccountingApproval(r)) : list);
      setLoading(false);
    }, (error) => {
      console.error("Error listening to requests:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Notifications loader & interactive helpers
  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(list);
    }, (err) => {
      console.error("Notifications listener error:", err);
    });
    return () => unsubscribe();
  }, []);

  const dismissNotification = async (notificationId: string) => {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), { isRead: true });
    } catch (err) {
      console.error("Dismiss notification error:", err);
    }
  };

  const activeNotifications = useMemo(() => {
    return notifications.filter(n => {
      if (n.isRead) return false;
      if (userRole === UserRole.ADMIN) {
        return n.recipientRole === 'ADMIN';
      }
      if (userRole === UserRole.OFFICE_HEAD) {
        return n.recipientRole === 'OFFICE_HEAD' && n.recipientOffice === userOffice;
      }
      return false;
    });
  }, [notifications, userRole, userOffice]);

  const toggleAuditTrail = (reqId: string) => {
    setExpandedAuditIds(prev => ({ ...prev, [reqId]: !prev[reqId] }));
  };

  const handleSendToOffice = async () => {
    if (!selectedRequest || !destinationOffice) return;

    const timestamp = new Date().toISOString();
    const sourceOffice = selectedRequest.office || userOffice || 'Unassigned Office';
    const transferHistory = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp,
      action: 'Sent to Office',
      details: `${selectedRequest.requestType} ${selectedRequest.requestNumber || selectedRequest.id.substring(0, 8)} sent from ${sourceOffice} to ${destinationOffice} by ${userName}.`
    };

    try {
      await updateDoc(doc(db, 'requests', selectedRequest.id), {
        office: destinationOffice,
        originatingOffice: selectedRequest.originatingOffice || sourceOffice,
        destinationOffice,
        sentAt: timestamp,
        sentBy: userName,
        status: 'Submitted',
        history: [...(selectedRequest.history || []), transferHistory]
      });

      await addDoc(collection(db, 'notifications'), {
        recipientRole: 'OFFICE_HEAD',
        recipientOffice: destinationOffice,
        message: `${selectedRequest.requestType} ${selectedRequest.requestNumber || selectedRequest.id.substring(0, 8)} was sent to your office from ${sourceOffice}.`,
        timestamp,
        isRead: false,
        type: 'REQUEST_TRANSFER',
        reportId: selectedRequest.id
      });

      setShowSendOfficeModal(false);
      setSelectedRequest(null);
      setDestinationOffice('');
    } catch (error) {
      console.error('Error sending request to office:', error);
      alert('Error sending request to the selected office.');
    }
  };

  // Open corresponding Add modal resetting states
  const openAddHandler = () => {
    if (activeRequestTab === 'PAR' || activeRequestTab === 'ICS' || activeRequestTab === 'REQUISITION') {
      setFormItemArticle('');
      setFormCategory('ICT Equipment');
      setFormQuantity(1);
      setFormJustification('');
      setFormOffice(userRole === UserRole.OFFICE_HEAD && userOffice ? userOffice : (offices[0]?.name || 'Mayor\'s Office'));
      setFormRequestedBy(userName || '');
      setFormRequestNumber('');
      setFormStatus('PENDING');
      setFormRemarks('');
    } else {
      setFinancialTitle('');
      setFinancialDetails('');
      setFinancialAmount('');
      setFinancialPriority('Medium');
      setFormStatus('PENDING');
      setFormRemarks('');
      setFormOffice(userRole === UserRole.OFFICE_HEAD && userOffice ? userOffice : (offices[1]?.name || 'Accounting Office'));
      setFormRequestedBy(userName || 'Accountant');
    }
    setSelectedRequest(null);
    setShowAddModal(true);
  };

  // Open Edit modal populating states
  const openEditHandler = (req: AssetRequest) => {
    setSelectedRequest(req);
    setFormStatus(req.status);
    setFormRemarks(req.responseRemarks || req.adminRemarks || '');

    // Set custom PAR/ICS fields if available
    setFormRequestNumber(req.requestNumber || '');
    setFormAssignedAdmin(req.assignedAdmin || '');
    setFormAttachedDocs(req.attachedDocs || []);

    if (req.requestType === 'FINANCIAL') {
      setFinancialTitle(req.itemArticle);
      setFinancialDetails(req.justification);
      setFinancialAmount(req.amount !== undefined ? req.amount : '');
      setFinancialPriority(req.priority || 'Medium');
      setFormOffice(req.office || 'Accounting Office');
      setFormRequestedBy(req.requestedBy);
    } else {
      setFormItemArticle(req.itemArticle);
      setFormCategory(req.category || 'ICT Equipment');
      setFormQuantity(req.quantity);
      setFormUnitValue(req.unitValue || 0);
      setFormJustification(req.justification);
      setFormOffice(req.office);
      setFormRequestedBy(req.requestedBy);
    }
    setShowEditModal(true);
  };

  // Handle Add Form Submission
  const handleSaveNewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let payload: any = {};
      const isSlipRequest = activeRequestTab === 'PAR' || activeRequestTab === 'ICS';
      let itemArticleName = activeRequestTab === 'REQUISITION' || isSlipRequest ? formItemArticle : financialTitle;
      let categoryName = activeRequestTab === 'REQUISITION' || isSlipRequest ? formCategory : 'Financial Request';
      let unitVal = activeRequestTab === 'REQUISITION' || isSlipRequest ? 0 : (financialAmount ? Number(financialAmount) : 0);

      if (activeRequestTab === 'REQUISITION' || isSlipRequest) {
        if (!formItemArticle || formQuantity < 1 || !formJustification) {
          alert("Please fill in all the required fields.");
          return;
        }
      } else {
        if (!financialTitle || !financialDetails) {
          alert("Please fill in all the required fields.");
          return;
        }
      }

      // Resolve Master Asset record first
      const masterAssetsCol = collection(db, 'master_assets');
      let masterAssetId = '';
      const q = query(masterAssetsCol, where('article', '==', itemArticleName.trim().toUpperCase()));
      const snap = await getDocs(q);
      if (!snap.empty) {
        masterAssetId = snap.docs[0].id;
      } else {
        const masterDocRef = doc(masterAssetsCol);
        masterAssetId = masterDocRef.id;
        const classification = unitVal >= 50000 ? 'PAR' : 'ICS';
        const codePrefix = categoryName.toLowerCase().includes('office') ? 'OE' : (categoryName.toLowerCase().includes('ict') ? 'ICT' : 'EQ');
        const propNo = `LGU-ENG-${codePrefix}-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        await setDoc(masterDocRef, {
          propertyNumber: propNo,
          article: itemArticleName.trim().toUpperCase(),
          description: activeRequestTab === 'REQUISITION' || isSlipRequest ? formJustification : financialDetails,
          category: categoryName || 'Other Assets',
          unitOfMeasure: 'unit',
          unitValue: unitVal,
          acquisitionCost: unitVal,
          classification,
          isFixed: true,
          isFixedMaster: true
        });
      }

      // Every request not filed by Admin or Accounting starts in Accounting review
      const isOfficeHeadReq = requiresAccountingReview(userRole);

      if (activeRequestTab === 'REQUISITION' || isSlipRequest) {
        payload = {
          masterAssetId,
          requestType: isSlipRequest ? activeRequestTab : 'REQUISITION',
          itemArticle: formItemArticle,
          category: formCategory,
          quantity: Number(formQuantity),
          justification: formJustification,
          office: formOffice,
          originatingOffice: formOffice,
          recipientOffice: isOfficeHeadReq ? 'Accounting Office' : (isSlipRequest ? 'Accounting Office' : ''),
          requestNumber: formRequestNumber || `${activeRequestTab}-${new Date().getFullYear()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          requestedBy: formRequestedBy,
          requestedAt: new Date().toISOString(),
          status: isOfficeHeadReq ? 'Pending Accounting Review' : formStatus,
          responseRemarks: formRemarks || '',
          handledBy: formStatus !== 'PENDING' && !isOfficeHeadReq ? `${userName} (Admin)` : '',
          handledAt: formStatus !== 'PENDING' && !isOfficeHeadReq ? new Date().toISOString() : ''
        };
      } else {
        payload = {
          masterAssetId,
          requestType: 'FINANCIAL',
          itemArticle: financialTitle, // maps to title
          category: 'Financial Request',
          quantity: 1, // default for financial
          justification: financialDetails, // maps to details
          amount: financialAmount === '' ? undefined : Number(financialAmount),
          priority: financialPriority,
          office: formOffice || 'Accounting Department',
          requestedBy: formRequestedBy || 'Accountant',
          requestedAt: new Date().toISOString(),
          status: isOfficeHeadReq ? 'Pending Accounting Review' : (formStatus === 'REJECTED' || formStatus === 'DECLINED' ? 'REJECTED' : formStatus),
          responseRemarks: formRemarks || '',
          handledBy: formStatus !== 'PENDING' && !isOfficeHeadReq ? `${userName} (Admin)` : '',
          handledAt: formStatus !== 'PENDING' && !isOfficeHeadReq ? new Date().toISOString() : ''
        };
      }

      const timestamp = new Date().toISOString();
      const initialHistory = [{
        id: Math.random().toString(36).substr(2, 9),
        timestamp,
        action: 'Submitted',
        details: isOfficeHeadReq
          ? `Requisition "${payload.itemArticle}" submitted by ${payload.requestedBy} (${payload.office}). Status is Pending Accounting Review.`
          : `Request of "${payload.itemArticle}" initially logged by ${payload.requestedBy} (${payload.office}). Status is PENDING review.`
      }];
      payload.history = initialHistory;

      const docRef = await addDoc(collection(db, 'requests'), payload);

      if (payload.requestType === 'FINANCIAL' || payload.slipNumber) {
        await logPRSAction({
          user: userName,
          role: userRole || 'Admin',
          formType: 'PRS',
          transactionNumber: payload.slipNumber || `PR-${docRef.id.substring(0, 5).toUpperCase()}`,
          action: `CREATION & SUBMISSION: Office Head created and submitted new PRS Request "${payload.itemArticle}"`
        });
      }

      // Log action inside logs
      await addDoc(collection(db, 'system_logs'), {
        action: `Unified Requests: Logged new ${activeRequestTab.toLowerCase()} request "${payload.itemArticle}"`,
        module: 'Requests Center',
        timestamp,
        user: userName
      });

      // Notify recipient (ACCOUNTING for Office Head Requisitions, ADMIN for others)
      const targetRole = isOfficeHeadReq || payload.requestType === 'PAR' || payload.requestType === 'ICS' ? 'ACCOUNTING' : 'ADMIN';
      await addDoc(collection(db, 'notifications'), {
        recipientRole: targetRole,
        ...(targetRole === 'ACCOUNTING' ? { recipientOffice: 'Accounting Office' } : {}),
        message: isOfficeHeadReq
          ? `New Requisition "${payload.itemArticle}" submitted by ${payload.requestedBy} (${payload.office}) for Accounting Review & PAR/ICS Compilation.`
          : payload.requestType === 'PAR' || payload.requestType === 'ICS'
            ? `New ${payload.requestType} requesting slip ${payload.requestNumber} from ${payload.office} is ready for Accounting review.`
            : `New request "${payload.itemArticle}" is submitted by ${payload.requestedBy} (${payload.office}) for review.`,
        timestamp,
        isRead: false,
        type: 'SUBMISSION',
        reportId: docRef.id
      });

      setShowAddModal(false);
    } catch (err) {
      console.error("Error creating request:", err);
      alert("Failed to save request. Try again.");
    }
  };

  // Handle Edit Form Submission
  const handleEditRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;

    if (selectedRequest.requestType === 'REQUISITION' && selectedRequest.status !== 'PENDING' && formStatus === 'APPROVED') {
      if (!selectedRequest.linkedParIcsReportId) {
        alert('Approval blocked: this requisition has no linked PAR/ICS report.');
        return;
      }
      const pairedReport = await getDoc(doc(db, 'reports', selectedRequest.linkedParIcsReportId));
      if (!pairedReport.exists() || pairedReport.data().originalRequisitionId !== selectedRequest.id || !((pairedReport.data().status === 'Pending Approval' && pairedReport.data().forwardedStatus === 'Pending') || pairedReport.data().status === 'Approved')) {
        alert('Approval blocked: the linked PAR/ICS report must exist, match this requisition, and be forwarded to Engineer/Admin.');
        return;
      }
    }

    // Only allow users with the Engineer/Admin (ADMIN) role to approve or modify statuses of shipment (PAR/ICS) requests
    if (selectedRequest.requestType === 'PAR' || selectedRequest.requestType === 'ICS') {
      if (formStatus === 'APPROVED' || formStatus !== selectedRequest.status) {
        if (userRole !== UserRole.ADMIN) {
          alert("Unauthorized. Only the Engineer/Admin is authorized to evaluate or approve shipment (PAR/ICS) requests.");
          return;
        }
      }
    }

    try {
      const docRef = doc(db, 'requests', selectedRequest.id);
      const isAccountingRequisitionEdit = userRole === UserRole.ACCOUNTING && selectedRequest.requestType === 'REQUISITION' && selectedRequest.status === 'Pending Accounting Review';
      const isOfficeHeadResubmission = userRole === UserRole.OFFICE_HEAD && selectedRequest.requestType === 'REQUISITION' && ['Returned for Revision', 'RETURNED_FOR_REVISION'].includes(selectedRequest.status);
      let updates: any = {
        status: isAccountingRequisitionEdit || isOfficeHeadResubmission ? 'Pending Accounting Review' : formStatus,
        responseRemarks: formRemarks || '',
      };

      if (selectedRequest.requestType === 'PAR' || selectedRequest.requestType === 'ICS') {
        updates.itemArticle = formItemArticle;
        updates.quantity = Number(formQuantity);
        updates.justification = formJustification;
        updates.office = formOffice;
        updates.requestedBy = formRequestedBy;
        if (isAccountingRequisitionEdit) {
          updates.unitValue = Number(formUnitValue || 0);
          updates.accountingReviewedBy = userName;
          updates.accountingReviewedAt = new Date().toISOString();
        }
        updates.requestNumber = formRequestNumber;
        updates.assignedAdmin = formAssignedAdmin;
        updates.attachedDocs = formAttachedDocs;
      } else if (selectedRequest.requestType === 'FINANCIAL') {
        if (!financialTitle || !financialDetails) {
          alert("Title and details are required.");
          return;
        }
        updates.itemArticle = financialTitle;
        updates.justification = financialDetails;
        updates.amount = financialAmount === '' ? undefined : Number(financialAmount);
        updates.priority = financialPriority;
        updates.office = formOffice;
        updates.requestedBy = formRequestedBy;
      } else {
        if (!formItemArticle || formQuantity < 1 || !formJustification) {
          alert("All requisition fields must be validated.");
          return;
        }
        updates.itemArticle = formItemArticle;
        updates.category = formCategory;
        updates.quantity = Number(formQuantity);
        updates.justification = formJustification;
        updates.office = formOffice;
        updates.requestedBy = formRequestedBy;
      }

      const timestamp = new Date().toISOString();
      let currentHistory = selectedRequest.history || [];

      let actionDesc = 'Updated';
      let logDesc = `Request details for "${updates.itemArticle || selectedRequest.itemArticle}" updated by ${userName}.`;

      if (selectedRequest.status === 'RETURNED_FOR_REVISION' && formStatus === 'PENDING') {
        actionDesc = 'Re-submitted';
        logDesc = `Request was revised and re-submitted for evaluation by ${userName}.`;
      } else if (formStatus !== selectedRequest.status) {
        actionDesc = 'Status Update';
        logDesc = `Request status changed from ${selectedRequest.status} to ${formStatus} by ${userName}. Remarks: "${formRemarks || 'None'}"`;
      }
      if (isAccountingRequisitionEdit) {
        actionDesc = 'Accounting Requisition Edit';
        logDesc = `Accounting updated requisition details for "${updates.itemArticle}" (quantity ${updates.quantity}, unit value ${updates.unitValue}) by ${userName}.`;
      }

      const historyLog = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp,
        action: actionDesc,
        details: logDesc
      };

      updates.history = [...currentHistory, historyLog];

      if (isOfficeHeadResubmission) {
        updates.linkedParIcsReportId = null;
        updates.accountingReviewedBy = null;
        updates.accountingReviewedAt = null;
        updates.history = [...updates.history, { id: Math.random().toString(36).slice(2), timestamp, action: 'Resubmitted to Accounting', details: `Office Head resubmitted revised requisition to Accounting by ${userName}.` }];
      }

      if (selectedRequest.requestType === 'REQUISITION' && (formStatus === 'APPROVED' || formStatus === 'DISPATCHED') && !selectedRequest.linkedParIcsReportId) {
        alert('Approval blocked: this requisition has no linked PAR/ICS report.');
        return;
      }

      let handledViaTransaction = false;

      if (formStatus !== selectedRequest.status) {
        updates.handledBy = `${userName} (${userRole || 'Admin'})`;
        updates.handledAt = timestamp;

        if (selectedRequest.requestType === 'REQUISITION') {
          const isNowApprovedOrDispatched = (formStatus === 'APPROVED' || formStatus === 'DISPATCHED');
          const wasApprovedOrDispatched = (selectedRequest.status === 'APPROVED' || selectedRequest.status === 'DISPATCHED');
          if (isNowApprovedOrDispatched && !wasApprovedOrDispatched) {
            // Deduct stock
            await deductInventoryStock(
              updates.itemArticle || selectedRequest.itemArticle,
              updates.office || selectedRequest.office,
              updates.quantity || selectedRequest.quantity
            );
          } else if (!isNowApprovedOrDispatched && wasApprovedOrDispatched) {
            // Replenish stock
            await replenishInventoryStock(
              updates.itemArticle || selectedRequest.itemArticle,
              updates.office || selectedRequest.office,
              updates.quantity || selectedRequest.quantity
            );
          }
        } else if (selectedRequest.requestType === 'FINANCIAL') {
          const isNowApproved = (formStatus === 'APPROVED');
          const wasApproved = (selectedRequest.status === 'APPROVED');
          if (isNowApproved && !wasApproved) {
            await syncFinancialApprovalToEngineerModule(selectedRequest, userName);
          }
        } else if (selectedRequest.requestType === 'PAR' || selectedRequest.requestType === 'ICS') {
          const isNowApproved = (formStatus === 'APPROVED');
          const wasApproved = (selectedRequest.status === 'APPROVED');
          if (isNowApproved && !wasApproved) {
            await approveAndLinkStockRecord(
              selectedRequest,
              userName,
              updates,
              formStatus,
              formRemarks || 'Approved',
              timestamp
            );
            handledViaTransaction = true;
          }
        }

        if (!handledViaTransaction) {
          // Auto notification for Accounting
          if (formStatus === 'Completed' || formStatus === 'RECEIVED' || formStatus === 'APPROVED' || formStatus === 'DISTRIBUTED') {
            await addDoc(collection(db, 'notifications'), {
              recipientRole: 'ACCOUNTING',
              message: `TRANSACTION COMPLETED: Item/Request "${updates.itemArticle || selectedRequest.itemArticle}" (Qty: ${updates.quantity || selectedRequest.quantity}) under office ${selectedRequest.office} was marked as ${formStatus} and completed by Engineer/Admin (${userName}).`,
              timestamp,
              isRead: false,
              type: 'COMPLETED_TRANSACTION',
              reportId: selectedRequest.id
            });
          }

          // Auto notification for office head / admin
          await addDoc(collection(db, 'notifications'), {
            recipientRole: formStatus === 'PENDING' ? 'ADMIN' : 'OFFICE_HEAD',
            recipientOffice: selectedRequest.office,
            message: formStatus === 'PENDING'
              ? `Revised request "${updates.itemArticle || selectedRequest.itemArticle}" has been re-submitted by ${userName} for admin evaluation.`
              : `Your request "${updates.itemArticle || selectedRequest.itemArticle}" has been changed to ${formStatus} by admin. Remarks: "${formRemarks || 'None'}"`,
            timestamp,
            isRead: false,
            type: 'DECISION',
            reportId: selectedRequest.id
          });
        }
      }

      if (!handledViaTransaction) {
        await updateDoc(docRef, updates);
        if (selectedRequest.requestType === 'REQUISITION' && formStatus === 'APPROVED' && selectedRequest.linkedParIcsReportId) {
          await updateDoc(doc(db, 'reports', selectedRequest.linkedParIcsReportId), { status: 'Approved', forwardedStatus: 'Approved', adminRemarks: formRemarks || 'Approved' });
        }
        if (isOfficeHeadResubmission) {
          if (selectedRequest.linkedParIcsReportId) {
            await updateDoc(doc(db, 'reports', selectedRequest.linkedParIcsReportId), { isSuperseded: true, forwardedStatus: 'Superseded' });
          }
          await addDoc(collection(db, 'notifications'), { recipientRole: 'ACCOUNTING', recipientOffice: 'Accounting Office', message: `Revised requisition "${updates.itemArticle || selectedRequest.itemArticle}" (${updates.requestNumber || selectedRequest.requestNumber || selectedRequest.id.slice(0, 8)}) has been resubmitted for Accounting review.`, timestamp, isRead: false, type: 'SUBMISSION', reportId: selectedRequest.id });
        }

        // Synchronize with 'reports' collection if linked via reportId
        if (selectedRequest.reportId) {
          const reportRef = doc(db, 'reports', selectedRequest.reportId);
          const reportStatusMap: any = {
            'APPROVED': 'Approved',
            'REJECTED': 'Rejected',
            'DECLINED': 'Rejected',
            'Returned for Correction': 'Returned for Revision',
            'RETURNED_FOR_REVISION': 'Returned for Revision'
          };
          const reportForwardedMap: any = {
            'APPROVED': 'Approved',
            'REJECTED': 'Rejected',
            'DECLINED': 'Rejected',
            'Returned for Correction': 'Pending',
            'RETURNED_FOR_REVISION': 'Pending'
          };
          await updateDoc(reportRef, {
            status: reportStatusMap[formStatus] || formStatus,
            forwardedStatus: reportForwardedMap[formStatus] || 'Pending',
            adminRemarks: formRemarks || ''
          });
        }
      }

      await addDoc(collection(db, 'system_logs'), {
        action: isAccountingRequisitionEdit ? `Accounting edited Office Head requisition ${selectedRequest.id}: ${logDesc}` : `Unified Requests: Updated ${selectedRequest.requestType?.toLowerCase()} request ID ${selectedRequest.id}`,
        module: 'Requests Center',
        timestamp,
        user: userName
      });

      if (formStatus !== selectedRequest.status) {
        const isApproved = formStatus === 'APPROVED';
        const isRejected = formStatus === 'REJECTED' || formStatus === 'DECLINED' || formStatus === 'Returned for Correction' || formStatus === 'RETURNED_FOR_REVISION';
        const isDispatched = formStatus === 'DISPATCHED';
        const actionText = isApproved ? 'APPROVAL' : (isRejected ? 'REJECTION' : (isDispatched ? 'DISPATCH' : 'UPDATE'));

        await logPRSAction({
          user: userName,
          role: userRole || 'Admin',
          formType: selectedRequest.requestType || 'PRS',
          transactionNumber: selectedRequest.slipNumber || selectedRequest.requestNumber || `PR-${selectedRequest.id.substring(0, 5).toUpperCase()}`,
          action: `${actionText}: Request/Shipment status of "${updates.itemArticle || selectedRequest.itemArticle}" (Type: ${selectedRequest.requestType || 'PRS'}) was set to "${formStatus}" by ${userName}. Remarks: "${formRemarks || 'None'}"`
        });
      } else if (selectedRequest.requestType === 'FINANCIAL' || selectedRequest.slipNumber) {
        await logPRSAction({
          user: userName,
          role: userRole || 'Admin',
          formType: 'PRS',
          transactionNumber: selectedRequest.slipNumber || `PR-${selectedRequest.id.substring(0, 5).toUpperCase()}`,
          action: `UPDATE: PRS Slip ${selectedRequest.slipNumber || "N/A"} ("${updates.itemArticle || selectedRequest.itemArticle}") was updated by ${userName}. Remarks: "${formRemarks || 'None'}"`
        });
      }

      setShowEditModal(false);
      setSelectedRequest(null);
    } catch (err) {
      console.error(err);
      alert("Error updating the request document.");
    }
  };

  // Handle Delete Confirmation
  const handleDeleteRequest = async () => {
    if (!selectedRequest) return;
    try {
      await deleteDoc(doc(db, 'requests', selectedRequest.id));

      await addDoc(collection(db, 'system_logs'), {
        action: `Unified Requests: Permanently deleted ${selectedRequest.requestType?.toLowerCase()} request of "${selectedRequest.itemArticle}"`,
        module: 'Requests Center',
        timestamp: new Date().toISOString(),
        user: userName
      });

      setShowDeleteModal(false);
      setSelectedRequest(null);
    } catch (err) {
      console.error(err);
      alert("Error deleting request.");
    }
  };

  // Print the viewed document content as an official LGU form
  const handlePrintDocument = (req: AssetRequest) => {
    const docTitle = req.requestType === 'PAR'
      ? 'PROPERTY ACKNOWLEDGEMENT RECEIPT'
      : req.requestType === 'ICS'
        ? 'INVENTORY CUSTODIAN SLIP'
        : 'OFFICIAL REQUEST DOCUMENT';
    const docSubtitle = req.requestType === 'PAR' ? 'Annex B' : req.requestType === 'ICS' ? 'Appendix 59' : '';
    const items: any[] = req.items_snapshot && req.items_snapshot.length > 0 ? req.items_snapshot : [{
      article: req.itemArticle,
      description: req.justification || '',
      propertyNumber: req.requestNumber || req.id.substring(0, 8),
      qtyPhysicalCount: req.quantity || 1,
      unitValue: (req.amount || 0) / Math.max(1, req.quantity || 1)
    }];
    const totalAmount = items.reduce((acc, item) => {
      const qty = Number(item.qtyPhysicalCount || item.qtyPropertyCard) || 1;
      const val = Number(item.unitValue) || 0;
      return acc + qty * val;
    }, 0);

    const rowsHtml = items.map((item, idx) => {
      const qty = Number(item.qtyPhysicalCount || item.qtyPropertyCard) || 1;
      const uVal = Number(item.unitValue) || 0;
      const total = qty * uVal;
      return `
        <tr>
          <td style="border:1px solid #000;padding:6px 8px;text-align:center;font-weight:700;">${idx + 1}</td>
          <td style="border:1px solid #000;padding:6px 8px;font-weight:900;text-transform:uppercase;">${item.article || req.itemArticle || ''}</td>
          <td style="border:1px solid #000;padding:6px 8px;font-style:italic;color:#555;">${item.description || '—'}</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:center;font-family:monospace;font-size:10pt;color:#1d4ed8;">${item.propertyNumber || '—'}</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:center;font-weight:700;">${qty}</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:right;">&#8369;${uVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
          <td style="border:1px solid #000;padding:6px 8px;text-align:right;font-weight:900;">&#8369;${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
        </tr>`;
    }).join('');

    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) return;
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>${docTitle} - ${req.requestNumber || req.id.substring(0, 8)}</title>
        <style>
          @media print { @page { margin: 18mm; } body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
          body { font-family: 'Times New Roman', serif; font-size: 11pt; color: #000; margin: 0; padding: 32px; }
          .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #000; padding-bottom: 12px; }
          .header .gov { font-size: 9pt; font-weight: 700; text-transform: uppercase; color: #555; letter-spacing: 1px; }
          .header .lgu { font-size: 13pt; font-weight: 900; text-transform: uppercase; margin: 2px 0; }
          .header .doc-title { font-size: 20pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; margin: 6px 0 2px; }
          .header .doc-sub { font-size: 9pt; font-style: italic; color: #666; }
          .annex { text-align: right; font-style: italic; font-weight: 900; font-size: 11pt; color: #666; margin-bottom: 4px; }
          .meta-grid { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 12px; border: 1px dashed #bbb; padding: 14px; border-radius: 8px; margin-bottom: 20px; background: #f9f9f9; }
          .meta-item label { display: block; font-size: 7pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 2px; }
          .meta-item span { font-size: 10pt; font-weight: 900; text-transform: uppercase; }
          .meta-item .amount { color: #1d4ed8; }
          table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-bottom: 20px; }
          thead tr { background: #111; color: #fff; }
          thead th { padding: 8px 10px; text-align: left; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.5px; }
          thead th.center { text-align: center; }
          thead th.right { text-align: right; }
          tbody tr:nth-child(even) { background: #f5f5f5; }
          .total-row td { border-top: 2px solid #000; font-weight: 900; background: #eef2ff; }
          .justification { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 12px 16px; margin-bottom: 20px; }
          .justification label { display: block; font-size: 7pt; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: #2563eb; margin-bottom: 4px; }
          .justification p { font-style: italic; margin: 0; color: #333; }
          .sig-section { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 40px; padding-top: 16px; border-top: 1px solid #ccc; }
          .sig-block label { font-size: 8pt; font-weight: 700; font-style: italic; display: block; margin-bottom: 28px; }
          .sig-line { border-bottom: 1px solid #000; width: 100%; margin-bottom: 2px; min-height: 24px; }
          .sig-name { font-weight: 900; text-transform: uppercase; text-align: center; font-size: 11pt; }
          .sig-title { font-size: 8pt; text-align: center; color: #666; text-transform: uppercase; letter-spacing: 1px; }
          .no-print { display: none !important; }
        </style>
      </head>
      <body>
        <div class="annex">${docSubtitle}</div>
        <div class="header">
          <div class="gov">Republic of the Philippines &bull; Province of Antique</div>
          <div class="lgu">Municipality of Tibiao</div>
          <div class="doc-title">${docTitle}</div>
          <div class="doc-sub">${req.office || 'Accounting & Finance'} Department</div>
        </div>

        <div class="meta-grid">
          <div class="meta-item">
            <label>Requesting Office</label>
            <span>${req.office || 'N/A'}</span>
          </div>
          <div class="meta-item">
            <label>Prepared By</label>
            <span>${req.requestedBy || 'Accountant'}</span>
          </div>
          <div class="meta-item">
            <label>Document Ref No.</label>
            <span>${req.requestNumber || req.id.substring(0, 8)}</span>
          </div>
          <div class="meta-item">
            <label>Date Submitted</label>
            <span>${req.requestedAt ? new Date(req.requestedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</span>
          </div>
        </div>

        ${req.justification ? `<div class="justification"><label>Purpose &amp; Justification Details</label><p>&ldquo;${req.justification}&rdquo;</p></div>` : ''}

        <table>
          <thead>
            <tr>
              <th class="center" style="width:5%">#</th>
              <th style="width:22%">Item Article</th>
              <th style="width:25%">Description / Specifications</th>
              <th style="width:18%">Property / Inventory No.</th>
              <th class="center" style="width:7%">Qty</th>
              <th class="right" style="width:11%">Unit Value</th>
              <th class="right" style="width:12%">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="6" style="border:1px solid #000;padding:8px 10px;text-align:right;font-weight:900;font-size:10pt;">GRAND TOTAL AMOUNT:</td>
              <td style="border:1px solid #000;padding:8px 10px;text-align:right;font-weight:900;font-size:11pt;color:#1d4ed8;">&#8369;${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>

        <div class="sig-section">
          <div class="sig-block">
            <label>Prepared &amp; Submitted By:</label>
            <div class="sig-line"></div>
            <div class="sig-name">${req.requestedBy || 'Accountant'}</div>
            <div class="sig-title">Accounting &amp; Finance Department</div>
          </div>
          <div class="sig-block">
            <label>Reviewed &amp; Approved By:</label>
            <div class="sig-line"></div>
            <div class="sig-name">Engineer / GSO Administrator</div>
            <div class="sig-title">Municipal Engineering Office</div>
          </div>
        </div>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 400);
  };

  // Direct Quick Evaluation Status adjustments (Approve, Reject, or Return)
  const handleQuickDecisionWithStatus = async (req: AssetRequest, nextStatus: string) => {
    // Only allow users with the Engineer/Admin (ADMIN) role to approve or modify statuses of shipment (PAR/ICS) requests
    if (req.requestType === 'PAR' || req.requestType === 'ICS') {
      if (userRole !== UserRole.ADMIN) {
        alert("Unauthorized. Only the Engineer/Admin is authorized to evaluate or approve shipment (PAR/ICS) requests.");
        return;
      }
    }

    // Dual-document verification check for REQUISITION approval
    if (req.requestType === 'REQUISITION' && req.status !== 'PENDING' && nextStatus === 'APPROVED') {
      if (!req.linkedParIcsReportId) {
        alert("Approval Blocked: Dual-document verification required. This requisition has not been linked to a PAR/ICS report compiled by Accounting.");
        return;
      }
      try {
        const linkedReportSnap = await getDoc(doc(db, 'reports', req.linkedParIcsReportId));
        if (!linkedReportSnap.exists()) {
          alert("Approval Blocked: Linked PAR/ICS report was not found in database.");
          return;
        }
        const reportData = linkedReportSnap.data();
        if (reportData.originalRequisitionId !== req.id) {
          alert('Approval Blocked: The PAR/ICS report is not linked to this requisition.');
          return;
        }
        if (!((reportData.status === 'Pending Approval' && reportData.forwardedStatus === 'Pending') || reportData.status === 'Approved')) {
          alert(`Approval Blocked: Linked PAR/ICS report draft has status '${reportData.status}'. Accounting must forward both documents to Engineer/Admin before approval.`);
          return;
        }
      } catch (err) {
        console.error("Error checking linked PAR/ICS report:", err);
        alert("Failed to verify linked PAR/ICS report.");
        return;
      }
    }

    setSubmittingActionId(req.id);
    let finalNextStatus = nextStatus;
    if (req.requestType === 'REQUISITION' && (nextStatus === 'RETURNED_FOR_REVISION' || nextStatus === 'Returned for Correction' || nextStatus === 'DECLINED' || nextStatus === 'REJECTED')) {
      finalNextStatus = 'Returned for Revision';
    }

    const defaultRemarks =
      finalNextStatus === 'APPROVED' ? "Approved as verified under evaluation." :
        finalNextStatus === 'Returned for Revision' ? "Returned for revision. Please review comments." :
          finalNextStatus === 'Returned for Correction' ? "Returned for correction. Please review comments." :
            "Decline decision formulated.";

    const remarkValue = quickRemarks[req.id] || defaultRemarks;
    const timestamp = new Date().toISOString();

    try {
      const docRef = doc(db, 'requests', req.id);

      const historyEntry = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp,
        action:
          finalNextStatus === 'APPROVED' ? 'ApprovedByAdmin' :
            finalNextStatus === 'Returned for Revision' ? 'ReturnedForRevision' :
              finalNextStatus === 'Returned for Correction' ? 'ReturnedForCorrection' :
                'RejectedByAdmin',
        details: `Request of "${req.itemArticle}" status set to ${finalNextStatus} by ${userName}. Remarks: "${remarkValue}"`
      };

      const updatedHistory = [...(req.history || []), historyEntry];
      if (req.requestType === 'REQUISITION' && nextStatus === 'APPROVED' && !req.linkedParIcsReportId) {
        alert('Approval blocked: this requisition has no linked PAR/ICS report.');
        return;
      }

      let handledViaTransaction = false;
      let additionalUpdates: any = {};
      if (req.requestType === 'REQUISITION') {
        const isNowApprovedOrDispatched = (finalNextStatus === 'APPROVED');
        const wasApprovedOrDispatched = (req.status === 'APPROVED' || req.status === 'DISPATCHED');
        if (isNowApprovedOrDispatched && !wasApprovedOrDispatched) {
          await deductInventoryStock(req.itemArticle, req.office, req.quantity);
          if (req.linkedParIcsReportId) {
            await updateDoc(doc(db, 'reports', req.linkedParIcsReportId), {
              status: 'Approved',
              forwardedStatus: 'Approved',
              adminRemarks: remarkValue
            });
          }
        } else if (!isNowApprovedOrDispatched && wasApprovedOrDispatched) {
          await replenishInventoryStock(req.itemArticle, req.office, req.quantity);
        }
        if (finalNextStatus === 'Returned for Revision' && req.linkedParIcsReportId) {
          await updateDoc(doc(db, 'reports', req.linkedParIcsReportId), {
            status: 'Returned for Revision',
            forwardedStatus: 'Pending',
            adminRemarks: remarkValue
          });
          await addDoc(collection(db, 'notifications'), {
            recipientRole: 'OFFICE_HEAD',
            recipientOffice: req.originatingOffice || req.office,
            message: `REQUISITION RETURNED: Your requisition "${req.itemArticle}" has been returned for revision by ${userName}. Remarks: "${remarkValue}"`,
            timestamp,
            isRead: false,
            type: 'DECISION',
            reportId: req.id
          });
        }
      } else if (req.requestType === 'FINANCIAL') {
        const isNowApproved = (nextStatus === 'APPROVED');
        const wasApproved = (req.status === 'APPROVED');
        if (isNowApproved && !wasApproved) {
          await syncFinancialApprovalToEngineerModule(req, userName);
        }
      } else if (req.requestType === 'PAR' || req.requestType === 'ICS') {
        const isNowApproved = (nextStatus === 'APPROVED');
        const wasApproved = (req.status === 'APPROVED');
        if (isNowApproved && !wasApproved) {
          const reqUpdates = {
            status: nextStatus,
            responseRemarks: remarkValue,
            adminRemarks: remarkValue,
            handledBy: `${userName} (Admin)`,
            handledAt: timestamp,
            history: updatedHistory
          };
          await approveAndLinkStockRecord(
            req,
            userName,
            reqUpdates,
            nextStatus,
            remarkValue,
            timestamp
          );
          handledViaTransaction = true;
        }
      }

      if (!handledViaTransaction) {
        await updateDoc(docRef, {
          status: finalNextStatus,
          responseRemarks: remarkValue,
          adminRemarks: remarkValue, // safety duplication
          handledBy: `${userName} (Admin)`,
          handledAt: timestamp,
          history: updatedHistory,
          ...additionalUpdates
        });

        // Synchronize with 'reports' collection if linked via reportId
        if (req.reportId) {
          const reportRef = doc(db, 'reports', req.reportId);
          const reportStatusMap: any = {
            'APPROVED': 'Approved',
            'REJECTED': 'Rejected',
            'DECLINED': 'Rejected',
            'Returned for Correction': 'Returned for Revision',
            'RETURNED_FOR_REVISION': 'Returned for Revision'
          };
          const reportForwardedMap: any = {
            'APPROVED': 'Approved',
            'REJECTED': 'Rejected',
            'DECLINED': 'Rejected',
            'Returned for Correction': 'Pending',
            'RETURNED_FOR_REVISION': 'Pending'
          };
          await updateDoc(reportRef, {
            status: reportStatusMap[nextStatus] || nextStatus,
            forwardedStatus: reportForwardedMap[nextStatus] || 'Pending',
            adminRemarks: remarkValue
          });
        }
      }

      // Clear quick inputs
      setQuickRemarks(prev => {
        const copy = { ...prev };
        delete copy[req.id];
        return copy;
      });

      await addDoc(collection(db, 'system_logs'), {
        action: `Unified Requests: Quick status update to ${nextStatus} of "${req.itemArticle}" by ${userName}`,
        module: 'Requests Center',
        timestamp,
        user: userName
      });

      if (nextStatus !== req.status) {
        const isApproved = nextStatus === 'APPROVED';
        const isRejected = nextStatus === 'REJECTED' || nextStatus === 'DECLINED' || nextStatus === 'Returned for Correction' || nextStatus === 'RETURNED_FOR_REVISION';
        const isDispatched = nextStatus === 'DISPATCHED';
        const actionText = isApproved ? 'APPROVAL' : (isRejected ? 'REJECTION' : (isDispatched ? 'DISPATCH' : 'UPDATE'));

        await logPRSAction({
          user: userName,
          role: userRole || 'Admin',
          formType: req.requestType || 'PRS',
          transactionNumber: (req as any).slipNumber || (req as any).requestNumber || `PR-${req.id.substring(0, 5).toUpperCase()}`,
          action: `${actionText}: Request/Shipment status of "${req.itemArticle}" (Type: ${req.requestType || 'PRS'}) was set to "${nextStatus}" by ${userName}. Remarks: "${remarkValue || 'None'}"`
        });
      } else if (req.requestType === 'FINANCIAL' || (req as any).slipNumber) {
        await logPRSAction({
          user: userName,
          role: userRole || 'Admin',
          formType: 'PRS',
          transactionNumber: (req as any).slipNumber || `PR-${req.id.substring(0, 5).toUpperCase()}`,
          action: `UPDATE: PRS Slip ${(req as any).slipNumber || "N/A"} ("${req.itemArticle}") was updated by ${userName}. Remarks: "${remarkValue || 'None'}"`
        });
      }

      // Send in-app notification to the Office Head / requesting office
      await addDoc(collection(db, 'notifications'), {
        recipientRole: 'OFFICE_HEAD',
        recipientOffice: req.office,
        message: `Your request "${req.itemArticle}" has been ${nextStatus === 'RETURNED_FOR_REVISION' ? 'returned for revision' : nextStatus.toLowerCase()}. Details: "${remarkValue}".`,
        timestamp,
        isRead: false,
        type: 'DECISION',
        reportId: req.id
      });

      alert(`Request has been successfully set to ${nextStatus}.`);
    } catch (err) {
      console.error(err);
      alert("Failed to submit quick action.");
    } finally {
      setSubmittingActionId(null);
    }
  };

  // Dynamic Metrics Counters
  const tabRequests = requests.filter(r => String(r.requestType || '').toUpperCase() === activeRequestTab);

  const reqStats = {
    total: requests.filter(r => r.requestType === 'REQUISITION').length,
    pending: requests.filter(r => r.requestType === 'REQUISITION' && r.status === 'PENDING').length,
    forwarded: requests.filter(r => r.requestType === 'REQUISITION' && r.status === 'FORWARDED').length,
    approved: requests.filter(r => r.requestType === 'REQUISITION' && r.status === 'APPROVED').length,
  };

  const finStats = {
    total: requests.filter(r => r.requestType === 'FINANCIAL').length,
    pending: requests.filter(r => r.requestType === 'FINANCIAL' && r.status === 'PENDING').length,
    approved: requests.filter(r => r.requestType === 'FINANCIAL' && r.status === 'APPROVED').length,
    rejected: requests.filter(r => r.requestType === 'FINANCIAL' && (r.status === 'REJECTED' || r.status === 'DECLINED')).length,
    highPriority: requests.filter(r => r.requestType === 'FINANCIAL' && r.priority === 'High' && r.status === 'PENDING').length,
    totalFundingAmount: requests.filter(r => r.requestType === 'FINANCIAL' && r.amount !== undefined).reduce((acc, r) => acc + (r.amount || 0), 0)
  };

  // Searching & Filtering
  const filteredRequests = tabRequests.filter(req => {
    const matchesSearch =
      (req.itemArticle || '').toLowerCase().includes(search.toLowerCase()) ||
      (req.requestedBy || '').toLowerCase().includes(search.toLowerCase()) ||
      (req.justification || '').toLowerCase().includes(search.toLowerCase());

    const matchesOffice = filterOffice === '' || (req.office || '').toLowerCase() === filterOffice.toLowerCase();

    let matchesStatus = true;
    if (filterStatus !== 'ALL') {
      if (filterStatus === 'DECLINED' || filterStatus === 'REJECTED') {
        matchesStatus = ['DECLINED', 'REJECTED'].includes(String(req.status || '').toUpperCase());
      } else {
        matchesStatus = String(req.status || '').toUpperCase() === filterStatus.toUpperCase();
      }
    }

    let matchesPriority = true;
    if (activeRequestTab === 'FINANCIAL' && filterPriority !== 'ALL') {
      matchesPriority = req.priority === filterPriority;
    }

    return matchesSearch && matchesOffice && matchesStatus && matchesPriority;
  });

  return (
    <div className="space-y-6 pb-12">

      {/* Title Header with Unified Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-150">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-6 bg-blue-600 rounded-full block"></span>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 font-brand tracking-tight uppercase">
              Procurement Request Slips
            </h2>
          </div>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-1 ml-4">
            Unified Hub &bull; Review, Approve, and Track PAR, ICS, and Procurement Slip Submissions
          </p>
        </div>
        {userRole === UserRole.ADMIN && (
          <button
            type="button"
            onClick={openAddHandler}
            className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95"
          >
            <span>+ Request Slip</span>
          </button>
        )}
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-250 pb-4">
        {[
          { id: 'PAR', label: 'PAR Requests', count: requests.filter(r => String(r.requestType || '').toUpperCase() === 'PAR').length },
          { id: 'ICS', label: 'ICS Requests', count: requests.filter(r => String(r.requestType || '').toUpperCase() === 'ICS').length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveRequestTab(tab.id as any)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center space-x-2 ${activeRequestTab === tab.id
                ? 'bg-slate-900 text-white shadow-md scale-[1.02]'
                : 'bg-white hover:bg-gray-100 text-slate-600 border border-gray-200'
              }`}
          >
            <span>{tab.label}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${activeRequestTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-slate-700'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>


      {/* Main Listing View */}
      {loading ? (
        <div className="py-24 text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-[10px] uppercase font-black tracking-widest text-gray-400 mt-4 animate-pulse">
            Fetching unified database credentials...
          </p>
        </div>
      ) : filteredRequests.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-gray-150 rounded-[32px] p-16 text-center max-w-xl mx-auto">
          <p className="text-xs uppercase font-black text-gray-400 tracking-wider">
            No matching requests found under this category filter.
          </p>
          <p className="text-[10px] text-gray-400 font-bold uppercase mt-1.5">
            Log a new request or adjust filters in the control panel.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredRequests.map(req => {
            const badgeColors = {
              PENDING: 'bg-amber-50 text-amber-700 border-amber-200',
              FORWARDED: 'bg-indigo-50 text-indigo-700 border-indigo-200',
              APPROVED: 'bg-emerald-50 text-emerald-700 border-emerald-200',
              DECLINED: 'bg-rose-50 text-rose-700 border-rose-200',
              REJECTED: 'bg-rose-50 text-rose-700 border-rose-200',
              DISPATCHED: 'bg-blue-50 text-blue-700 border-blue-200',
              RETURNED_FOR_REVISION: 'bg-orange-50 text-orange-700 border-orange-200',
              'Draft': 'bg-gray-100 text-gray-700 border-gray-200',
              'Pending Submission': 'bg-yellow-50 text-yellow-700 border-yellow-200',
              'Submitted': 'bg-blue-50 text-blue-700 border-blue-200',
              'Pending Engineer/Admin Review': 'bg-purple-50 text-purple-700 border-purple-200',
              'Returned for Correction': 'bg-amber-100 text-amber-850 border-amber-300',
              'Resubmitted': 'bg-indigo-50 text-indigo-700 border-indigo-200',
              'Completed': 'bg-emerald-50 text-emerald-700 border-emerald-200',
              'Archived': 'bg-gray-500 text-white border-gray-650'
            };

            const statusLabel = {
              PENDING: 'Pending Check',
              FORWARDED: 'Forwarded to Admin',
              APPROVED: 'Approved',
              DECLINED: 'Declined',
              REJECTED: 'Rejected Proposal',
              DISPATCHED: 'Items Dispatched',
              RETURNED_FOR_REVISION: 'Revision Requested',
              'Draft': 'Draft',
              'Pending Submission': 'Pending Submission',
              'Submitted': 'Submitted',
              'Pending Engineer/Admin Review': 'Pending Review',
              'Returned for Correction': 'Returned for Correction',
              'Resubmitted': 'Resubmitted',
              'Completed': 'Completed',
              'Archived': 'Archived'
            };

            const isFinancial = req.requestType === 'FINANCIAL';
            const isAccounting = req.requestType === 'PAR' || req.requestType === 'ICS';

            return (
              <div
                key={req.id}
                className={`bg-white rounded-[28px] p-6 border shadow-sm flex flex-col justify-between space-y-4 hover:shadow-md transition-all duration-200 ${req.status === 'PENDING' || req.status === 'Submitted' || req.status === 'Pending Engineer/Admin Review' || req.status === 'Resubmitted' ? 'border-amber-100 hover:border-amber-200' :
                    req.status === 'APPROVED' || req.status === 'Completed' ? 'border-emerald-100 hover:border-emerald-200' :
                      req.status === 'Returned for Correction' || req.status === 'RETURNED_FOR_REVISION' ? 'border-orange-250 bg-orange-50/5 hover:border-orange-350' :
                        'border-slate-150 hover:border-slate-300'
                  }`}
              >
                <div>
                  {/* Card Header stats & priority badges */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-1.5">
                      <span className={`px-2.5 py-1 rounded-full text-[8px] font-black uppercase border ${badgeColors[req.status] || 'bg-gray-50'}`}>
                        {statusLabel[req.status] || req.status}
                      </span>

                      {isAccounting ? (
                        <span className="px-2 py-0.5 rounded-full text-[7.5px] bg-indigo-50 text-indigo-750 font-black border border-indigo-200 uppercase tracking-widest">
                          {req.requestType} REQUEST
                        </span>
                      ) : isFinancial ? (
                        <span className={`px-2 py-0.5 rounded-full text-[7.5px] font-black uppercase tracking-wider border ${req.priority === 'High' ? 'bg-red-50 text-red-650 border-red-200' :
                            req.priority === 'Medium' ? 'bg-indigo-50 text-indigo-650 border-indigo-200' :
                              'bg-slate-50 text-slate-500 border-slate-200'
                          }`}>
                          {req.priority || 'Medium'} Priority
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[7.5px] bg-slate-50 text-slate-600 font-black border border-slate-200 uppercase tracking-widest">
                          Item Requisition
                        </span>
                      )}
                    </div>

                    <span className="text-[10px] text-slate-400 font-bold uppercase">
                      {req.requestedAt ? new Date(req.requestedAt).toLocaleDateString() : ''}
                    </span>
                  </div>

                  {/* Subject Body */}
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight mt-3">
                    {isFinancial ? (
                      req.itemArticle
                    ) : (
                      `${req.quantity}x ${req.itemArticle}`
                    )}
                  </h3>

                  {/* Metadata block */}
                  <div className="mt-2 space-y-1 text-[11px] text-slate-500 font-bold uppercase tracking-wide">
                    <p>Office: <span className="text-slate-800">{req.office || 'LGU Department'}</span></p>
                    {isAccounting ? (
                      <>
                        <p>Request No: <span className="text-slate-800">{req.requestNumber || `REQ-${req.id.substring(0, 8)}`}</span></p>
                        <p>Assigned Admin: <span className="text-slate-800">{req.assignedAdmin || 'Not Assigned'}</span></p>
                        {req.attachedDocs && req.attachedDocs.length > 0 && (
                          <div className="mt-2 bg-slate-50 p-2 rounded-xl border border-slate-100">
                            <span className="text-[8px] text-gray-400 block mb-1">Attached Documents:</span>
                            <div className="flex flex-wrap gap-1.5">
                              {req.attachedDocs.map((docName, idx) => (
                                <span key={idx} className="bg-white text-slate-705 px-2.5 py-1 rounded-lg text-[9px] border border-slate-200 flex items-center space-x-1 hover:bg-slate-100 transition-colors">
                                  <span>📄</span>
                                  <span className="underline">{docName}</span>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {!isFinancial && <p>Category: <span className="text-slate-700">{req.category}</span></p>}
                        {isFinancial && req.amount !== undefined && (
                          <p>Total Capital: <span className="text-blue-600 font-black">₱{req.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></p>
                        )}
                      </>
                    )}
                    <p>Lodged by: <span className="text-slate-705">{req.requestedBy}</span></p>
                  </div>

                  {/* Reasons justifications details box */}
                  <div className="mt-3.5 p-3.5 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block mb-1">
                      {isFinancial ? 'REQUEST PROPOSAL DETAILS' : isAccounting ? 'PURPOSE / JUSTIFICATION' : 'JUSTIFICATION / COMMENTARY'}
                    </span>
                    <p className="text-slate-700 text-xs italic font-semibold leading-relaxed whitespace-pre-line">
                      "{req.justification || 'No justification details provided.'}"
                    </p>
                  </div>

                  {/* Admin review notes */}
                  {(req.responseRemarks || req.adminRemarks) && (
                    <div className="mt-3 p-3 bg-blue-50/40 rounded-xl border border-blue-100">
                      <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest block mb-0.5">Admin evaluation response remarks</span>
                      <p className="text-slate-700 text-xs font-semibold">{req.responseRemarks || req.adminRemarks}</p>
                      {req.handledBy && (
                        <p className="text-[8px] text-gray-400 font-bold uppercase mt-1">Reviewed by {req.handledBy}</p>
                      )}
                    </div>
                  )}

                  {isAccounting && req.history && req.history.length > 0 && (
                    <div className="mt-3 border border-indigo-100 rounded-xl overflow-hidden">
                      <button
                        type="button"
                        onClick={() => toggleAuditTrail(req.id)}
                        className="w-full px-3 py-2 bg-indigo-50/60 text-indigo-700 text-[8px] font-black uppercase tracking-widest flex items-center justify-between"
                      >
                        <span>PAR / ICS History ({req.history.length})</span>
                        <span>{expandedAuditIds[req.id] ? 'Hide' : 'View'}</span>
                      </button>
                      {expandedAuditIds[req.id] && (
                        <div className="p-3 space-y-2 bg-white">
                          {req.history.map((entry: any, index: number) => (
                            <div key={entry.id || index} className="border-l-2 border-indigo-200 pl-2">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-[8px] font-black uppercase text-indigo-700">{entry.action}</span>
                                <span className="text-[8px] text-slate-400">{entry.timestamp ? new Date(entry.timestamp).toLocaleString() : ''}</span>
                              </div>
                              <p className="text-[9px] text-slate-600 mt-0.5">{entry.details}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}


                </div>

                {/* Direct quick action approvals */}
                <div className="pt-3 border-t border-gray-100 flex flex-col space-y-3">

                  {/* View Document Content Button */}
                  <button
                    type="button"
                    onClick={() => {
                      setViewingRequest(req);
                      setLinkedApprovalReport(null);
                      if (req.linkedParIcsReportId) getDoc(doc(db, 'reports', req.linkedParIcsReportId)).then(s => setLinkedApprovalReport(s.exists() ? { id: s.id, ...s.data() } : null));
                      setShowViewContentModal(true);
                    }}
                    className="w-full py-2.5 bg-slate-900 hover:bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md active:scale-95 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    </svg>
                    <span>View {isAccounting ? `${req.requestType} Document` : 'Request'} Content</span>
                  </button>
                  {userRole === UserRole.ACCOUNTING && req.requestType === 'REQUISITION' && req.status === 'Pending Accounting Review' && (
                    <button onClick={() => openEditHandler(req)} className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider">Review / Edit Requisition</button>
                  )}

                  {/* Evaluation Actions form for standard requisitions only. PAR/ICS admin requests are view-only here. */}
                  {!isAccounting && (req.status === 'PENDING' || (req.requestType === 'REQUISITION' && req.status === 'Pending Engineer/Admin Review')) && (userRole === UserRole.ADMIN || userRole === UserRole.ACCOUNTING) && (
                    <div className="bg-slate-50/50 p-3 rounded-2xl border border-slate-200/80 space-y-2">
                      <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest block">Submit Evaluation Decision</span>
                      <input
                        type="text"
                        placeholder="Write evaluation reasoning remarks here..."
                        value={quickRemarks[req.id] || ''}
                        onChange={(e) => setQuickRemarks(prev => ({ ...prev, [req.id]: e.target.value }))}
                        className="w-full bg-white border border-slate-200 text-xs py-1.5 px-3 rounded-xl outline-none focus:border-blue-500 font-semibold"
                      />
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => handleQuickDecisionWithStatus(req, 'APPROVED')}
                          disabled={submittingActionId !== null || (req.requestType === 'REQUISITION' && req.status !== 'PENDING')}
                          title={req.requestType === 'REQUISITION' ? 'Open the paired approval view to verify both requisition and PAR/ICS documents.' : undefined}
                          className="py-1.5 bg-emerald-600 hover:bg-emerald-750 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shadow-sm active:scale-95"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleQuickDecisionWithStatus(req, isAccounting ? 'REJECTED' : req.requestType === 'FINANCIAL' ? 'REJECTED' : 'DECLINED')}
                          disabled={submittingActionId !== null}
                          className="py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
                        >
                          Reject
                        </button>
                        <button
                          onClick={() => handleQuickDecisionWithStatus(req, isAccounting ? 'Returned for Correction' : 'RETURNED_FOR_REVISION')}
                          disabled={submittingActionId !== null}
                          className="py-1.5 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
                        >
                          {isAccounting ? 'Return' : 'Return'}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Revise trigger if RETURNED_FOR_REVISION or Returned for Correction */}
                  {((['RETURNED_FOR_REVISION', 'Returned for Revision'].includes(req.status) && (userRole === UserRole.OFFICE_HEAD || userRole === UserRole.ADMIN)) ||
                    (isAccounting && req.status === 'Returned for Correction' && (userRole === UserRole.ACCOUNTING || userRole === UserRole.ADMIN))) && (
                      <button
                        onClick={() => {
                          setFormStatus(isAccounting ? 'Resubmitted' : 'PENDING'); // automatically resets back to pending upon resubmit edits
                          openEditHandler(req);
                        }}
                        className="w-full py-2 bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all shadow-md active:scale-95 flex items-center justify-center space-x-1.5 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 8H17" />
                        </svg>
                        <span>Revise & Re-submit Proposal</span>
                      </button>
                    )}

                  {/* Standard Operations (Edit/Delete controls) */}
                  <div className="flex items-center justify-between">
                    <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">
                      ID: {req.id.substring(0, 8)}
                    </span>

                    <div className="flex items-center space-x-2">
                      {isAccounting && (
                        <button
                          onClick={() => {
                            setSelectedRequest(req);
                            setDestinationOffice(offices.find(office => office.name !== req.office)?.name || '');
                            setShowSendOfficeModal(true);
                          }}
                          className="p-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all flex items-center space-x-1"
                          title="Send to another office"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                          </svg>
                          <span>Send</span>
                        </button>
                      )}

                      <button
                        onClick={() => {
                          setSelectedRequest(req);
                          setShowDeleteModal(true);
                        }}
                        className="p-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 hover:text-rose-700 rounded-lg text-[9px] font-black uppercase tracking-wide transition-all flex items-center space-x-1"
                        title="Delete Request"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>

                </div>
                {userRole === UserRole.OFFICE_HEAD && (
                  <button
                    type="button"
                    onClick={openAddHandler}
                    className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95"
                  >
                    New {activeRequestTab} Request
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* CREATE REQUEST MODAL */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 bg-gray-950/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] w-full max-w-lg p-6 md:p-8 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                    Log New {activeRequestTab === 'PAR' || activeRequestTab === 'ICS' ? `${activeRequestTab} Requesting Slip` : activeRequestTab === 'REQUISITION' ? 'Office Requisition' : 'Financial Clearance'}
                  </h3>
                  <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">unified entry creator</p>
                </div>
                <button
                  onClick={() => setShowAddModal(false)}
                  className="text-gray-400 hover:text-slate-900 text-xl font-black focus:outline-none"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleSaveNewRequest} className="mt-4 space-y-4">

                {activeRequestTab === 'PAR' || activeRequestTab === 'ICS' || activeRequestTab === 'REQUISITION' ? (
                  /* Requisition Fields Component */
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">{activeRequestTab === 'PAR' || activeRequestTab === 'ICS' ? 'Asset / Item Article' : 'Item Name / Article'}</label>
                      <input
                        type="text"
                        placeholder={activeRequestTab === 'PAR' || activeRequestTab === 'ICS' ? 'e.g. Kubota L5018 Tractor' : 'e.g. Acer Aspire Laptop'}
                        required
                        value={formItemArticle}
                        onChange={(e) => setFormItemArticle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3.5 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    {(activeRequestTab === 'PAR' || activeRequestTab === 'ICS') && (
                      <div className="space-y-1">
                        <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Request Number (optional)</label>
                        <input type="text" value={formRequestNumber} onChange={(e) => setFormRequestNumber(e.target.value)} placeholder={`${activeRequestTab}-${new Date().getFullYear()}-001`} className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500" />
                      </div>
                    )}

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Category</label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white"
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={formQuantity}
                        onChange={(e) => setFormQuantity(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                      />
                    </div>


                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">{activeRequestTab === 'PAR' || activeRequestTab === 'ICS' ? 'Purpose / Justification' : 'Justification Reason'}</label>
                      <textarea
                        placeholder="State clear purpose of item requisition..."
                        rows={3}
                        required
                        value={formJustification}
                        onChange={(e) => setFormJustification(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3.5 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 resize-none"
                      />
                    </div>
                  </div>
                ) : (
                  /* Financial Clearance Fields */
                  <div className="grid grid-cols-2 gap-3.5">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Request Title / Subject</label>
                      <input
                        type="text"
                        placeholder="e.g. Audit Reconciliation Budget Cleared"
                        required
                        value={financialTitle}
                        onChange={(e) => setFinancialTitle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3.5 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Required Budget (₱, optional)</label>
                      <input
                        type="number"
                        placeholder="e.g. 50000"
                        value={financialAmount}
                        onChange={(e) => setFinancialAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Priority Rating</label>
                      <select
                        value={financialPriority}
                        onChange={(e) => setFinancialPriority(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                      >
                        <option value="Low">Low Priority</option>
                        <option value="Medium">Medium Priority</option>
                        <option value="High">High / Urgent</option>
                      </select>
                    </div>

                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Proposal Description details</label>
                      <textarea
                        placeholder="Specify financial reconciliation requirements and clearances needed from mayor/administrator..."
                        rows={3}
                        required
                        value={financialDetails}
                        onChange={(e) => setFinancialDetails(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3.5 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* Common parameters */}
                <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-3">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Requesting Office</label>
                    <select
                      value={formOffice}
                      onChange={(e) => setFormOffice(e.target.value)}
                      disabled={userRole === UserRole.OFFICE_HEAD}
                      className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 focus:bg-white disabled:opacity-75 disabled:bg-slate-100"
                    >
                      {offices.map((o) => (
                        <option key={o.id} value={o.name}>{o.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Requester Name</label>
                    <input
                      type="text"
                      required
                      value={formRequestedBy}
                      onChange={(e) => setFormRequestedBy(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Initial Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                    >
                      <option value="PENDING">Pending Check</option>
                      {activeRequestTab === 'REQUISITION' && <option value="FORWARDED">Forwarded to Admin</option>}
                      {activeRequestTab !== 'PAR' && activeRequestTab !== 'ICS' && <option value="APPROVED">Approved Entry Choice</option>}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Response Feedback Notes</label>
                    <input
                      type="text"
                      placeholder="Optional feedback notes"
                      value={formRemarks}
                      onChange={(e) => setFormRemarks(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddModal(false)}
                    className="px-5 py-2.5 bg-slate-150 hover:bg-slate-200 text-slate-850 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95"
                  >
                    Save Request
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SEND REQUEST TO ANOTHER OFFICE */}
      <AnimatePresence>
        {showSendOfficeModal && selectedRequest && (
          <div className="fixed inset-0 bg-gray-950/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] w-full max-w-md p-6 md:p-8 shadow-2xl border border-gray-100"
            >
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Send {selectedRequest.requestType}</h3>
                  <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Route this request to another office</p>
                </div>
                <button onClick={() => setShowSendOfficeModal(false)} className="text-gray-400 hover:text-slate-900 text-xl font-black focus:outline-none">&times;</button>
              </div>
              <div className="mt-5 space-y-3">
                <p className="text-xs font-semibold text-slate-600">{selectedRequest.itemArticle}</p>
                <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Receiving Office</label>
                <select value={destinationOffice} onChange={(event) => setDestinationOffice(event.target.value)} className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500">
                  <option value="">Select office</option>
                  {offices.filter(office => office.name !== selectedRequest.office).map(office => <option key={office.id} value={office.name}>{office.name}</option>)}
                </select>
              </div>
              <div className="pt-5 mt-5 border-t border-gray-100 flex items-center justify-end space-x-2">
                <button type="button" onClick={() => setShowSendOfficeModal(false)} className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Cancel</button>
                <button type="button" onClick={handleSendToOffice} disabled={!destinationOffice} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95">Send Request</button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT REQUEST DETAILS MODAL */}
      <AnimatePresence>
        {showEditModal && selectedRequest && (
          <div className="fixed inset-0 bg-gray-950/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] w-full max-w-lg p-6 md:p-8 shadow-2xl border border-gray-100 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex items-center justify-between pb-4 border-b border-gray-100">
                <div>
                  <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                    Update {selectedRequest.requestType === 'FINANCIAL' ? 'Financial' : 'Requisition'} Request Details
                  </h3>
                  <p className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Admin evaluator sheet</p>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-gray-400 hover:text-slate-900 text-xl font-black focus:outline-none"
                >
                  &times;
                </button>
              </div>

              <form onSubmit={handleEditRequest} className="mt-4 space-y-4">
                {selectedRequest.requestType === 'FINANCIAL' ? (
                  /* Financial Clearance Fields */
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Request Title / Subject</label>
                      <input
                        type="text"
                        required
                        value={financialTitle}
                        onChange={(e) => setFinancialTitle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3.5 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Required Fund (₱)</label>
                      <input
                        type="number"
                        value={financialAmount}
                        onChange={(e) => setFinancialAmount(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Priority</label>
                      <select
                        value={financialPriority}
                        onChange={(e) => setFinancialPriority(e.target.value as any)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                      >
                        <option value="Low">Low Profit</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>

                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Details</label>
                      <textarea
                        rows={3}
                        required
                        value={financialDetails}
                        onChange={(e) => setFinancialDetails(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none resize-none"
                      />
                    </div>
                  </div>
                ) : (selectedRequest.requestType === 'PAR' || selectedRequest.requestType === 'ICS') ? (
                  /* PAR or ICS Fields Component */
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Request Number</label>
                      <input
                        type="text"
                        required
                        value={formRequestNumber}
                        onChange={(e) => setFormRequestNumber(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Assigned Engineer/Admin</label>
                      <input
                        type="text"
                        value={formAssignedAdmin}
                        onChange={(e) => setFormAssignedAdmin(e.target.value)}
                        placeholder="e.g. Engr. Dela Cruz"
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Item Article / Description</label>
                      <input
                        type="text"
                        required
                        value={formItemArticle}
                        onChange={(e) => setFormItemArticle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3.5 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={formQuantity}
                        onChange={(e) => setFormQuantity(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none focus:border-blue-500"
                      />
                    </div>
                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Justification / Remarks</label>
                      <textarea
                        rows={3}
                        required
                        value={formJustification}
                        onChange={(e) => setFormJustification(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3.5 rounded-xl text-xs font-semibold outline-none focus:border-blue-500 resize-none"
                      />
                    </div>
                  </div>
                ) : (
                  /* Requisition Fields Component */
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Item Article</label>
                      <input
                        type="text"
                        required
                        value={formItemArticle}
                        onChange={(e) => setFormItemArticle(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3.5 rounded-xl text-xs font-semibold outline-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Category</label>
                      <select
                        value={formCategory}
                        onChange={(e) => setFormCategory(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none"
                      >
                        {categories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Quantity</label>
                      <input
                        type="number"
                        min={1}
                        required
                        value={formQuantity}
                        onChange={(e) => setFormQuantity(Number(e.target.value))}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3 rounded-xl text-xs font-semibold outline-none"
                      />
                    </div>

                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Reason Justification</label>
                      <textarea
                        rows={3}
                        required
                        value={formJustification}
                        onChange={(e) => setFormJustification(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 py-2.5 px-3.5 rounded-xl text-xs font-semibold outline-none resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* Common updates */}
                <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-slate-100">
                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Office</label>
                    <select
                      value={formOffice}
                      onChange={(e) => setFormOffice(e.target.value)}
                      disabled={userRole === UserRole.OFFICE_HEAD}
                      className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl text-xs font-semibold outline-none disabled:opacity-75 disabled:bg-slate-100"
                    >
                      {offices.map((o) => (
                        <option key={o.id} value={o.name}>{o.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Requester</label>
                    <input
                      type="text"
                      required
                      value={formRequestedBy}
                      onChange={(e) => setFormRequestedBy(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-250 py-2 px-3 rounded-xl text-xs font-semibold outline-none font-sans"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Decision Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl text-xs font-semibold outline-none text-slate-650 font-black uppercase tracking-wider"
                    >
                      {(selectedRequest.requestType === 'PAR' || selectedRequest.requestType === 'ICS') ? (
                        <>
                          <option value="Draft">Draft</option>
                          <option value="Pending Submission">Pending Submission</option>
                          <option value="Submitted">Submitted</option>
                          <option value="Pending Engineer/Admin Review">Pending Review</option>
                          <option value="Returned for Correction">Returned for Correction</option>
                          <option value="Resubmitted">Resubmitted</option>
                          {userRole === UserRole.ADMIN && (
                            <>
                              <option value="APPROVED">Approved</option>
                              <option value="Completed">Completed</option>
                              <option value="Archived">Archived</option>
                            </>
                          )}
                          <option value="REJECTED">Rejected</option>
                        </>
                      ) : (
                        <>
                          <option value="PENDING">Pending Check</option>
                          <option value="APPROVED">Approved clearance</option>
                          <option value="REJECTED">Rejected Proposal</option>
                          <option value="DECLINED">Declined requisition</option>
                          <option value="RETURNED_FOR_REVISION">Returned for Revision</option>
                          {selectedRequest.requestType === 'REQUISITION' && (
                            <>
                              {userRole !== UserRole.OFFICE_HEAD && <option value="FORWARDED">Forwarded to Administrator</option>}
                              <option value="DISPATCHED">Dispatched items</option>
                            </>
                          )}
                        </>
                      )}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">Response feedback notes</label>
                    <input
                      type="text"
                      placeholder="Comment notes inline"
                      value={formRemarks}
                      onChange={(e) => setFormRemarks(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 py-2 px-3 rounded-xl text-xs font-semibold outline-none text-slate-900"
                    />
                  </div>
                </div>

                <div className="pt-4 border-t border-gray-100 flex items-center justify-end space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-5 py-2.5 bg-slate-150 hover:bg-slate-200 text-slate-850 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95"
                  >
                    Update Request Document
                  </button>
                </div>

              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DELETE DIALOG */}
      <AnimatePresence>
        {showDeleteModal && selectedRequest && (
          <div className="fixed inset-0 bg-gray-950/55 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-[32px] w-full max-w-md p-6 md:p-8 shadow-2xl border border-gray-100 text-center space-y-6"
            >
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto text-2xl font-black">
                !
              </div>

              <div className="space-y-2">
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  Delete Request Permanent?
                </h3>
                <p className="text-xs text-gray-400 font-bold uppercase leading-relaxed max-w-xs mx-auto">
                  Are you absolutely sure you want to delete this log?
                  <span className="block text-slate-850 font-black mt-1.5 text-sm">"{selectedRequest.itemArticle}"</span>
                  This operation is IRREVERSIBLE.
                </p>
              </div>

              <div className="flex items-center justify-center space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDeleteModal(false)}
                  className="px-6 py-3 bg-slate-150 hover:bg-slate-200 text-slate-850 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Keep Request
                </button>
                <button
                  type="button"
                  onClick={handleDeleteRequest}
                  className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95"
                >
                  Confirm Delete
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* VIEW CONTENT MODAL */}
      <AnimatePresence>
        {showViewContentModal && viewingRequest && (
          <div className="fixed inset-0 bg-gray-950/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              className="bg-white rounded-[32px] w-full max-w-7xl p-6 md:p-8 shadow-2xl border border-gray-100 space-y-6 my-8 max-h-[90vh] overflow-y-auto font-sans"
            >
              {/* Header */}
              <div className="flex items-start justify-between border-b border-gray-150 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="w-2.5 h-6 bg-blue-600 rounded-full block"></span>
                    <h2 className="text-xl md:text-2xl font-black text-slate-900 font-brand tracking-tight uppercase">
                      {viewingRequest.requestType === 'PAR'
                        ? 'PROPERTY ACKNOWLEDGEMENT RECEIPT (PAR)'
                        : viewingRequest.requestType === 'ICS'
                          ? 'INVENTORY CUSTODIAN SLIP (ICS)'
                          : 'OFFICIAL REQUEST DOCUMENT'}
                    </h2>
                  </div>
                  <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-1 ml-4">
                    Detailed Document Content Snapshot &bull; Ref No: {viewingRequest.requestNumber || viewingRequest.id.substring(0, 8)}
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  {/* Print Button */}
                  <button
                    type="button"
                    onClick={() => handlePrintDocument(viewingRequest)}
                    className="flex items-center space-x-2 px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-sm cursor-pointer"
                  >
                    <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-3a2 2 0 00-2-2H9a2 2 0 00-2 2v3a2 2 0 002 2zm5-17h2m-6 0h-2" />
                    </svg>
                    <span>Print Form</span>
                  </button>
                  {/* Close Button */}
                  <button
                    type="button"
                    onClick={() => setShowViewContentModal(false)}
                    className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-2xl transition-colors cursor-pointer"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>

              {/* Metadata Summary Banner */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-150">
                <div>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Requesting Office</span>
                  <span className="text-xs font-black text-slate-850 uppercase">{viewingRequest.office || 'N/A'}</span>
                </div>
                <div>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Lodged / Prepared By</span>
                  <span className="text-xs font-black text-slate-850 uppercase">{viewingRequest.requestedBy || 'Accountant'}</span>
                </div>
                <div>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Total Capital Amount</span>
                  <span className="text-xs font-black text-blue-700">
                    ₱{(viewingRequest.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Current Status</span>
                  <span className="inline-block px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider bg-indigo-50 text-indigo-700 border border-indigo-200 mt-0.5">
                    {viewingRequest.status}
                  </span>
                </div>
              </div>

              {userRole === UserRole.ADMIN && viewingRequest.requestType === 'REQUISITION' && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <section className="border border-slate-200 rounded-2xl p-4"><h3 className="text-xs font-black uppercase text-slate-800 mb-2">Original Requisition</h3><p className="text-xs font-bold">{viewingRequest.quantity} × {viewingRequest.itemArticle}</p><p className="text-xs text-slate-600 mt-1">{viewingRequest.justification}</p><p className="text-[10px] text-slate-500 mt-2">Office: {viewingRequest.office} · Unit value: ₱{Number(viewingRequest.unitValue || 0).toLocaleString()}</p></section>
                  <section className="border border-indigo-200 bg-indigo-50/40 rounded-2xl p-4"><h3 className="text-xs font-black uppercase text-indigo-800 mb-2">Linked PAR / ICS Report</h3>{linkedApprovalReport ? <><p className="text-xs font-bold">{linkedApprovalReport.report_type} · {linkedApprovalReport.parNo || linkedApprovalReport.icsNo || linkedApprovalReport.id}</p><p className="text-[10px] text-slate-600 mt-1">Status: {linkedApprovalReport.status} · Items: {linkedApprovalReport.items_snapshot?.length || 0}</p><ul className="mt-2 text-[10px] space-y-1">{(linkedApprovalReport.items_snapshot || []).map((item: any, i: number) => <li key={i}>{item.article} · Qty {item.qtyPropertyCard || item.quantity || 1} · ₱{Number(item.unitValue || 0).toLocaleString()}</li>)}</ul></> : <p className="text-xs text-rose-700">{viewingRequest.linkedParIcsReportId ? 'Linked report missing or loading.' : 'No linked report. Accounting must generate and forward PAR/ICS before approval.'}</p>}</section>
                </div>
              )}

              {/* Justification / Purpose */}
              {viewingRequest.justification && (
                <div className="p-4 bg-blue-50/40 rounded-2xl border border-blue-100/80">
                  <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest block mb-1">
                    Purpose & Justification Details
                  </span>
                  <p className="text-slate-700 text-xs font-medium italic leading-relaxed">
                    "{viewingRequest.justification}"
                  </p>
                </div>
              )}

              {/* Content Items Table */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wider">
                    Document Items Breakdown ({viewingRequest.items_snapshot?.length || 1} Items)
                  </h3>
                  <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest">
                    Submitted Items Snapshot
                  </span>
                </div>

                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-900 text-white uppercase text-[9px] font-black tracking-wider">
                        <th className="p-3 w-12 text-center">#</th>
                        <th className="p-3">Item Article</th>
                        <th className="p-3">Description / Specs</th>
                        <th className="p-3">Property / Inventory No.</th>
                        <th className="p-3 text-center">Qty</th>
                        <th className="p-3 text-right">Unit Value</th>
                        <th className="p-3 text-right">Total Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-150 font-medium text-slate-700">
                      {viewingRequest.items_snapshot && viewingRequest.items_snapshot.length > 0 ? (
                        viewingRequest.items_snapshot.map((item: any, idx: number) => {
                          const qty = Number(item.qtyPhysicalCount || item.qtyPropertyCard) || 1;
                          const uVal = Number(item.unitValue) || 0;
                          const total = qty * uVal;
                          return (
                            <tr key={idx} className="hover:bg-slate-50">
                              <td className="p-3 text-center font-bold text-slate-400">{idx + 1}</td>
                              <td className="p-3 font-black uppercase text-slate-900">{item.article || viewingRequest.itemArticle}</td>
                              <td className="p-3 italic text-slate-600">{item.description || 'No specs provided'}</td>
                              <td className="p-3 font-mono text-[11px] font-bold text-blue-700">{item.propertyNumber || viewingRequest.requestNumber || 'N/A'}</td>
                              <td className="p-3 text-center font-bold text-slate-900">{qty}</td>
                              <td className="p-3 text-right">₱{uVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td className="p-3 text-right font-black text-slate-900">₱{total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr className="hover:bg-slate-50">
                          <td className="p-3 text-center font-bold text-slate-400">1</td>
                          <td className="p-3 font-black uppercase text-slate-900">{viewingRequest.itemArticle}</td>
                          <td className="p-3 italic text-slate-600">{viewingRequest.justification || 'Standard Request Item'}</td>
                          <td className="p-3 font-mono text-[11px] font-bold text-blue-700">{viewingRequest.requestNumber || viewingRequest.id.substring(0, 8)}</td>
                          <td className="p-3 text-center font-bold text-slate-900">{viewingRequest.quantity || 1}</td>
                          <td className="p-3 text-right">₱{((viewingRequest.amount || 0) / Math.max(1, viewingRequest.quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="p-3 text-right font-black text-slate-900">₱{(viewingRequest.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Modal Evaluation Action Controls */}
              {userRole === UserRole.ADMIN && (
                <div className="pt-4 border-t border-slate-150 space-y-3">
                  <span className="text-[9px] font-black text-slate-500 uppercase tracking-widest block">
                    Admin Evaluation & Decision Controls
                  </span>
                  <input
                    type="text"
                    placeholder="Enter evaluation notes or reason..."
                    value={quickRemarks[viewingRequest.id] || ''}
                    onChange={(e) => setQuickRemarks(prev => ({ ...prev, [viewingRequest.id]: e.target.value }))}
                    className="w-full bg-slate-50 border border-slate-200 text-xs p-3 rounded-xl outline-none focus:border-blue-500 font-semibold"
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={async () => {
                          await handleQuickDecisionWithStatus(viewingRequest, 'APPROVED');
                          setShowViewContentModal(false);
                        }}
                        disabled={submittingActionId !== null || (viewingRequest.requestType === 'REQUISITION' && viewingRequest.status !== 'PENDING' && (!viewingRequest.linkedParIcsReportId || !linkedApprovalReport || linkedApprovalReport.originalRequisitionId !== viewingRequest.id || !((linkedApprovalReport.status === 'Pending Approval' && linkedApprovalReport.forwardedStatus === 'Pending') || linkedApprovalReport.status === 'Approved')))}
                        className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider shadow-sm transition-all active:scale-95 cursor-pointer"
                      >
                        Approve Document
                      </button>
                      {viewingRequest.requestType === 'REQUISITION' && viewingRequest.status !== 'PENDING' && (!viewingRequest.linkedParIcsReportId || !linkedApprovalReport || linkedApprovalReport.originalRequisitionId !== viewingRequest.id || !((linkedApprovalReport.status === 'Pending Approval' && linkedApprovalReport.forwardedStatus === 'Pending') || linkedApprovalReport.status === 'Approved')) && <span className="text-[10px] text-rose-700">Approve disabled: the linked PAR/ICS must exist, match this requisition, and be forwarded by Accounting.</span>}
                      <button
                        onClick={async () => {
                          await handleQuickDecisionWithStatus(viewingRequest, 'REJECTED');
                          setShowViewContentModal(false);
                        }}
                        disabled={submittingActionId !== null}
                        className="px-5 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                      >
                        Reject
                      </button>
                      <button
                        onClick={async () => {
                          await handleQuickDecisionWithStatus(viewingRequest, 'Returned for Correction');
                          setShowViewContentModal(false);
                        }}
                        disabled={submittingActionId !== null}
                        className="px-5 py-2.5 bg-orange-50 hover:bg-orange-100 text-orange-600 border border-orange-200 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
                      >
                        Return for Correction
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowViewContentModal(false)}
                      className="px-5 py-2.5 bg-slate-150 hover:bg-slate-200 text-slate-800 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                    >
                      Close Content View
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
};
