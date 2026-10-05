import React, { useState, useEffect } from 'react';
import Reports from './Reports';
import { ProcurementTransactionHistory } from './ProcurementTransactionHistory';
import { ReceivingTimeline } from './ReceivingTimeline';
import { SupplierShipmentModal } from './SupplierShipmentModal';
import { InventoryItem, Office, AssetRequest, SystemLog, UserProfile } from '../types';
import { db, logProcurementTransaction, logPRSAction } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  where, 
  addDoc, 
  doc, 
  setDoc,
  getDocs,
  orderBy,
  updateDoc,
  runTransaction
} from 'firebase/firestore';

export const classifyAssetByValue = (cost: number): 'PAR' | 'ICS' => {
  return (cost || 0) >= 50000 ? 'PAR' : 'ICS';
};

export const isAccountableAsset = (item: { article?: string; category?: string; unitValue?: number }): boolean => {
  const art = (item.article || "").toLowerCase();
  const cat = (item.category || "").toLowerCase();
  
  if (
    cat.includes("supplies") ||
    cat.includes("consumable") ||
    art.includes("paper") ||
    art.includes("pen") ||
    art.includes("ink") ||
    art.includes("folder") ||
    art.includes("pencil") ||
    art.includes("marker") ||
    art.includes("staple") ||
    art.includes("envelope") ||
    art.includes("notebook") ||
    art.includes("battery") ||
    art.includes("tape") ||
    art.includes("soap") ||
    art.includes("disinfectant") ||
    art.includes("mask") ||
    art.includes("gloves")
  ) {
    return false;
  }

  if (
    art.includes("computer") ||
    art.includes("laptop") ||
    art.includes("printer") ||
    art.includes("vehicle") ||
    art.includes("car") ||
    art.includes("motorcycle") ||
    art.includes("aircon") ||
    art.includes("air conditioner") ||
    art.includes("chair") ||
    art.includes("table") ||
    art.includes("desk") ||
    art.includes("cabinet") ||
    art.includes("furniture") ||
    art.includes("cubicle") ||
    cat.includes("equipment") ||
    cat.includes("fixtures") ||
    cat.includes("machinery") ||
    cat.includes("vehicle") ||
    cat.includes("building") ||
    (item.unitValue !== undefined && item.unitValue >= 15000)
  ) {
    return true;
  }

  return (item.unitValue || 0) >= 15000;
};

export const mapCategoryToRpcppeFields = (categoryStr: string, itemTitle: string = '') => {
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

import { NotificationBell } from './NotificationBell';

export const OFFICE_HEAD_OFFICES = [
  "Office of the Municipal Mayor",
  "Office of the Municipal Vice Mayor",
  "Sangguniang Bayan Office",
  "Municipal Administrator's Office",
  "Municipal Accounting Office",
  "Municipal Budget Office",
  "Municipal Treasurer's Office",
  "Municipal Assessor's Office",
  "Municipal Planning and Development Coordinator (MPDC) Office",
  "Municipal Engineer's Office",
  "Municipal Agriculture Office (MAO)",
  "Municipal Health Office (MHO)",
  "Municipal Social Welfare and Development Office (MSWDO)",
  "Municipal Civil Registrar Office (LCR)",
  "Human Resource Management Office (HRMO)",
  "General Services Office (GSO)",
  "Municipal Environment and Natural Resources Office (MENRO)",
  "Municipal Disaster Risk Reduction and Management Office (MDRRMO)",
  "Business Permits and Licensing Office (BPLO)",
  "Municipal Legal Office",
  "Municipal Information Office",
  "Local Youth Development Office (LYDO)",
  "Office of the Senior Citizens Affairs (OSCA)",
  "Persons with Disability Affairs Office (PDAO)",
  "Municipal Tourism Office",
  "Bids and Awards Committee (BAC) Office",
  "Municipal Economic Enterprise Office",
  "Local Government Operations Office (MLGOO)",
  "Commission on Audit (COA) – Resident Auditor (if assigned)"
];

interface OfficeHeadDashboardProps {
  items: InventoryItem[];
  offices: Office[];
  onLogout: () => void;
  userEmail: string;
  userOffice: string;
  userName: string;
  reportsInitialTab?: 'generator' | 'archive' | 'transfers';
  activeTabOverride?: string | null;
  onResetOverride?: () => void;
  user: UserProfile;
  setView?: (view: any) => void;
  onNotificationActionClick?: (notification: any) => void;
}

const OfficeHeadDashboard: React.FC<OfficeHeadDashboardProps> = ({ 
  items, 
  offices, 
  onLogout, 
  userEmail, 
  userOffice,
  userName,
  reportsInitialTab,
  activeTabOverride,
  onResetOverride,
  user,
  setView,
  onNotificationActionClick,
}) => {
  // Office selection state (Free access for all offices)
  const [selectedOffice, setSelectedOffice] = useState<string>(() => {
    return localStorage.getItem('office_head_selected_office') || userOffice || 'All Offices';
  });

  const [activeTab, setActiveTab] = useState<'requisitions' | 'inventory' | 'scanner' | 'reports' | 'cargo' | 'procurement_history'>('requisitions');

  useEffect(() => {
    if (activeTabOverride) {
      if (activeTabOverride === 'reports') {
        setActiveTab('reports');
      }
      if (onResetOverride) {
        onResetOverride();
      }
    }
  }, [activeTabOverride, onResetOverride]);
  
  // Requisitions state
  const [assetRequests, setAssetRequests] = useState<AssetRequest[]>([]);
  const [catalogItems, setCatalogItems] = useState<InventoryItem[]>([]);
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [loadingReqs, setLoadingReqs] = useState(true);
  
  // Cargo receipts & Transaction logs states
  const [actPRs, setActPRs] = useState<any[]>([]);
  const [loadingPRs, setLoadingPRs] = useState(true);
  const [engineerLogs, setEngineerLogs] = useState<any[]>([]);
  const [procurementTransactions, setProcurementTransactions] = useState<any[]>([]);
  const [receivingPRId, setReceivingPRId] = useState<string | null>(null);
  const [rejectingPRId, setRejectingPRId] = useState<string | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');

  // Keep the Office Head ledger scoped, but make catalog autofill cover every
  // active inventory record registered by Admin.
  useEffect(() => {
    let latestItems: any[] = [];
    let latestMasters: any[] = [];

    const publishCatalog = () => {
      const masterById = new Map(latestMasters.map(master => [master.id, master]));
      setCatalogItems(latestItems.map(item => ({
        ...(masterById.get(item.masterAssetId) || {}),
        ...item,
        id: item.id,
      })).filter(item => !item.isArchived) as InventoryItem[]);
    };

    const unsubscribeItems = onSnapshot(collection(db, 'inventory_items'), snapshot => {
      latestItems = snapshot.docs.map(itemDoc => ({ id: itemDoc.id, ...itemDoc.data() }));
      publishCatalog();
    }, error => console.error('Office Head catalog inventory error:', error));

    const unsubscribeMasters = onSnapshot(collection(db, 'master_assets'), snapshot => {
      latestMasters = snapshot.docs.map(masterDoc => ({ id: masterDoc.id, ...masterDoc.data() }));
      publishCatalog();
    }, error => console.error('Office Head catalog master inventory error:', error));

    return () => {
      unsubscribeItems();
      unsubscribeMasters();
    };
  }, []);

  const activeCatalogItems = Array.from(new Map(
    [...items, ...catalogItems]
      .filter(item => !item.isArchived)
      .map(item => [item.id, item])
  ).values());

  // Distribution Allocation States
  const [distributingId, setDistributingId] = useState<string | null>(null);
  const [distOffice, setDistOffice] = useState<string>('');
  const [distQty, setDistQty] = useState<number>(1);
  const [distDate, setDistDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [distRemarks, setDistRemarks] = useState<string>('');
  const [distLoading, setDistLoading] = useState<boolean>(false);

  // Warranty notifications states for Office Head
  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotifications(fetched);
    }, (err) => {
      console.error("Error loading notifications in OfficeHeadDashboard:", err);
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

  const activeWarrantyNotifs = notifications.filter(n => {
    return !n.isRead && n.type === 'WARRANTY_ALERT' && n.recipientRole === 'OFFICE_HEAD' && n.recipientOffice === userOffice;
  });

  useEffect(() => {
    if (!userOffice.toLowerCase().includes("engineering")) return;

    // Fetch all PR Slips from requests collection
    const q = query(collection(db, 'requests'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter((r: any) => {
          const reqType = (r.requestType || '').toUpperCase();
          const rMode = (r.reportMode || '').toLowerCase();
          return reqType !== 'PAR' && reqType !== 'ICS' && rMode !== 'par' && rMode !== 'ics';
        });
      setActPRs(fetched);
      setLoadingPRs(false);
    }, (err) => {
      console.error("Failed to load PRs for Engineer Cargo Desk:", err);
      setLoadingPRs(false);
    });

    return () => unsubscribe();
  }, [userOffice]);

  useEffect(() => {
    if (!userOffice.toLowerCase().includes("engineering")) return;

    // Fetch logs to build the Engineer's Transaction Log
    const q = query(
      collection(db, 'system_logs'),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).filter((log: any) => 
        (log.user === userName) || 
        (log.action && log.action.toLowerCase().includes('engineer')) ||
        (log.module && log.module.toLowerCase().includes('engineer')) ||
        (log.module && log.module.toLowerCase().includes('cargo'))
      );
      setEngineerLogs(fetched);
    }, (error) => {
      console.error("Failed to load system logs in OfficeHeadDashboard:", error);
    });
    return () => unsubscribe();
  }, [userOffice, userName]);

  useEffect(() => {
    if (!userOffice.toLowerCase().includes("engineering")) return;

    const q1 = query(
      collection(db, 'procurement_transactions'),
      orderBy('timestamp', 'desc')
    );

    let unsub1 = () => {};

    try {
      unsub1 = onSnapshot(q1, (snap) => {
        const list1 = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        setProcurementTransactions(list1);
      }, (error) => {
        console.error("Error fetching procurement transactions:", error);
      });
    } catch (e) {
      console.error(e);
    }

    return () => {
      unsub1();
    };
  }, [userOffice]);

  const handleApproveSlip = async (pr: any) => {
    const timestamp = new Date().toISOString();
    const itemTitle = pr.itemArticle || pr.title || "Equipment";
    const qty = pr.quantity || 1;
    const amount = pr.amount || 0;
    const slipNo = pr.slipNumber || "N/A";
    const unitMeasure = pr.unit || "pcs";
    const equipmentCat = pr.category || pr.equipmentType || "Equipment";

    try {
      // 1. Update request status to APPROVED
      await updateDoc(doc(db, 'requests', pr.id), {
        status: 'APPROVED',
        approvedAt: timestamp,
        approvedBy: userName
      });

      await logProcurementTransaction({
        slipNumber: slipNo,
        requestId: pr.id,
        itemArticle: itemTitle,
        quantity: qty,
        amount: amount || null,
        status: "Approved",
        user: userName,
        office: userOffice || "Municipal Engineering",
        details: `Municipal Engineer approved and certified PRS details. Ready for physical receiving or dispatch.`
      });

      await logPRSAction({
        user: userName,
        role: 'OFFICE_HEAD',
        formType: 'PRS',
        transactionNumber: slipNo,
        timestamp,
        action: `APPROVAL: Municipal Engineer approved and certified PRS Slip ${slipNo} ("${itemTitle}")`,
        module: "Procurement Audit"
      });

      // 2. Notify Accounting immediately
      await addDoc(collection(db, 'notifications'), {
        recipientRole: 'ACCOUNTING',
        message: `REQUEST APPROVED: Procurement Slip ${slipNo} for "${itemTitle}" (Qty: ${qty} ${unitMeasure}) was APPROVED by Municipal Engineer (${userName}). Items have been automatically committed to Engineering Inventory & RPCPPE.`,
        timestamp,
        isRead: false,
        type: 'SLIP_APPROVAL',
        reportId: pr.id
      });

      // 3. Store transaction in Accounting Transaction History Log
      await addDoc(collection(db, 'system_logs'), {
        timestamp,
        user: 'Municipal Engineering Office',
        action: `APPROVED: "${itemTitle}" | Qty: ${qty} | Val: ₱${amount.toLocaleString()} | Slip: ${slipNo} | Office: Municipal Engineering | Req: ${pr.requestedBy} | Status: Approved & Recorded to RPCPPE automatically.`,
        module: 'Accounting History'
      });

      // 4. Store transaction in Engineer Transaction History Log
      await addDoc(collection(db, 'system_logs'), {
        timestamp,
        user: userName,
        action: `APPROVED: Approved procurement slip ${slipNo} for "${itemTitle}" | Qty: ${qty} | Val: ₱${amount.toLocaleString()} | Requester: ${pr.requestedBy} | Status: Approved & Registered into RPCPPE`,
        module: 'Engineer Transaction Log'
      });

      // 5. AUTOMATICALLY ADD/UPDATE INVENTORIES, RPCPPE AND QUANTITIES
      const itemsSnapshot = await getDocs(collection(db, 'inventory_items'));
      const existingItems = itemsSnapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      })) as any[];

      const isAsset = isAccountableAsset({ article: itemTitle, category: equipmentCat, unitValue: amount });

      let matchingItem = null;
      if (!isAsset) {
        matchingItem = existingItems.find(item => 
          item.office === "Municipal Engineering" && 
          item.article && 
          item.article.toLowerCase().trim() === itemTitle.toLowerCase().trim() &&
          (item.unitOfMeasure || "unit").toLowerCase().trim() === (unitMeasure || "unit").toLowerCase().trim()
        );
      }

      const rpcppe = mapCategoryToRpcppeFields(equipmentCat, itemTitle);
      const dateStr = timestamp.split('T')[0];
      const timeStr = new Date().toLocaleTimeString();

      if (matchingItem) {
        const oldQtyPhysical = Number(matchingItem.qtyPhysicalCount) || 0;
        const newQtyProperty = (Number(matchingItem.qtyPropertyCard) || 0) + qty;
        const newQtyPhysical = oldQtyPhysical + qty;
        const updates: any = {
          qtyPropertyCard: newQtyProperty,
          qtyPhysicalCount: newQtyPhysical,
          remarks: `Auto-incremented qty of Approved Slip ${slipNo} on ${dateStr} by Engineer ${userName}`,
          history: [
            ...(matchingItem.history || []),
            {
              id: Math.random().toString(36).substr(2, 9),
              timestamp,
              user: userName,
              action: `Approved Slip Auto-Update: incremented by ${qty} ${unitMeasure}. Current: ${newQtyPhysical}`
            }
          ]
        };
        if (!matchingItem.assetCode) updates.assetCode = rpcppe.assetCode;
        if (!matchingItem.usefulLife) updates.usefulLife = rpcppe.usefulLife;
        if (!matchingItem.category || matchingItem.category === 'Equipment' || matchingItem.category === 'Other Assets') {
          updates.category = rpcppe.category;
        }
        await updateDoc(doc(db, 'inventory_items', matchingItem.docId), updates);

        // Record inventory transaction
        await addDoc(collection(db, 'inventory_transactions'), {
          itemId: matchingItem.docId,
          article: matchingItem.article || itemTitle,
          officeId: "Municipal Engineering",
          transactionType: 'Item Received',
          quantity: qty,
          previousBalance: oldQtyPhysical,
          newBalance: newQtyPhysical,
          user: userName,
          date: dateStr,
          time: timeStr,
          timestamp,
          remarks: `Incremental stock replenishment from Approved Slip ${slipNo}`,
          reference: slipNo
        });
      } else {
        const itemData = {
          article: itemTitle.toUpperCase(),
          description: pr.justification || pr.details || pr.description || `Procured under Slip ${slipNo} from Accounting Office.`,
          propertyNumber: rpcppe.propertyNumber,
          assetCode: rpcppe.assetCode,
          usefulLife: rpcppe.usefulLife,
          category: rpcppe.category,
          unitOfMeasure: unitMeasure,
          unitValue: amount,
          qtyPropertyCard: qty,
          qtyPhysicalCount: qty,
          office: "Municipal Engineering",
          personAccountable: userName.toUpperCase(),
          assignedStaff: userName.toUpperCase(),
          remarks: `Recorded automatically on Engineer Cargo approval. Slip No: ${slipNo}`,
          yearPurchased: new Date().getFullYear(),
          status: "AVAILABLE",
          condition: "Good" as any,
          dateReceived: dateStr,
          createdAt: timestamp,
          classification: classifyAssetByValue(amount),
          history: [{ 
            id: Math.random().toString(36).substr(2, 9), 
            timestamp, 
            user: userName, 
            action: `RPCPPE Registered automatically with Code ${rpcppe.assetCode} and Life ${rpcppe.usefulLife} yrs on Slip ${slipNo} approval.` 
          }]
        };

        const docRef = await addDoc(collection(db, 'inventory_items'), itemData);

        // Record inventory transaction
        await addDoc(collection(db, 'inventory_transactions'), {
          itemId: docRef.id,
          article: itemData.article,
          officeId: "Municipal Engineering",
          transactionType: 'Item Received',
          quantity: qty,
          previousBalance: 0,
          newBalance: qty,
          user: userName,
          date: dateStr,
          time: timeStr,
          timestamp,
          remarks: `Initial inventory registration from Approved Slip ${slipNo}`,
          reference: slipNo
        });
      }

      alert(`Success! Slip ${slipNo} ("${itemTitle}") has been APPROVED. Items are automatically registered to your Inventory (RPCPPE) and quantities updated.`);
    } catch (err) {
      console.error("Approve slip failure:", err);
      alert("Error: Critical failure approving accountant slip.");
    }
  };

  const handleRejectSlip = async (pr: any, reason: string, actionType: 'Rejected' | 'Returned' = 'Rejected') => {
    if (!reason.trim()) {
      alert("Please provide remarks or a reason.");
      return;
    }
    const timestamp = new Date().toISOString();
    const itemTitle = pr.itemArticle || pr.title || "Equipment";
    const qty = pr.quantity || 1;
    const amount = pr.amount || 0;

    try {
      // 1. Update request status, save rejection reason
      await updateDoc(doc(db, 'requests', pr.id), {
        status: actionType,
        rejectionReason: reason,
        adminRemarks: reason,
        rejectedAt: timestamp,
        rejectedBy: userName
      });

      await logProcurementTransaction({
        slipNumber: pr.slipNumber || "N/A",
        requestId: pr.id,
        itemArticle: itemTitle,
        quantity: qty,
        amount: amount || null,
        status: "Declined",
        user: userName,
        office: userOffice || "Municipal Engineering",
        details: `Municipal Engineer flagged PRS as "${actionType.toUpperCase()}". Reason/Remarks: "${reason}"`
      });

      await logPRSAction({
        user: userName,
        role: 'OFFICE_HEAD',
        formType: 'PRS',
        transactionNumber: pr.slipNumber || "N/A",
        timestamp,
        action: `REJECTION: Municipal Engineer flagged PRS Slip ${pr.slipNumber || "N/A"} ("${itemTitle}") as "${actionType.toUpperCase()}". Reason/Remarks: "${reason}"`,
        module: "Procurement Audit"
      });

      // 2. Notify Accounting immediately
      await addDoc(collection(db, 'notifications'), {
        recipientRole: 'ACCOUNTING',
        message: `DELIVERY STATUS UPDATE: PRS "${itemTitle}" was set to ${actionType.toUpperCase()} by Municipal Engineer (${userName}). Reason: ${reason}`,
        timestamp,
        isRead: false,
        type: 'REJECTION',
        reportId: pr.id
      });

      // 3. Store transaction in Accounting Transaction History Log
      await addDoc(collection(db, 'system_logs'), {
        timestamp,
        user: 'Municipal Engineering Office',
        action: `${actionType.toUpperCase()}: "${itemTitle}" | Qty: ${qty} | Val: ₱${amount.toLocaleString()} | Office: Municipal Engineering | Req: ${pr.requestedBy} | Status: ${actionType} | Reason: ${reason}`,
        module: 'Accounting History'
      });

      // 4. Store transaction in Engineer Transaction History Log
      await addDoc(collection(db, 'system_logs'), {
        timestamp,
        user: userName,
        action: `${actionType.toUpperCase()}: Flagged procurement slip for "${itemTitle}" as ${actionType} | Qty: ${qty} | Val: ₱${amount.toLocaleString()} | Reason: ${reason}`,
        module: 'Engineer Transaction Log'
      });

      setRejectingPRId(null);
      setRejectionReasonInput('');
      alert(`Status saved! "${itemTitle}" has been marked as ${actionType}.`);
    } catch (err) {
      console.error("Reject slip failure:", err);
      alert("Error: Critical failure rejecting accountant slip.");
    }
  };

  const handleReceiveCargoItem = async (pr: any) => {
    setReceivingPRId(pr.id);
    const timestamp = new Date().toISOString();
    const itemTitle = (pr.itemArticle || pr.title || "Equipment").trim();
    const qty = pr.quantity || 1;
    const amount = pr.amount || 0; // Total amount
    const unitCost = pr.unitCost || (qty > 0 ? (amount / qty) : amount);
    const prsNumber = pr.slipNumber || pr.requestNumber || pr.id;

    try {
      // Query existing inventory items first to check for duplicates
      const itemsSnapshot = await getDocs(collection(db, 'inventory_items'));
      const existingItems = itemsSnapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      })) as any[];

      // Query existing master assets
      const masterSnapshot = await getDocs(collection(db, 'master_assets'));
      const existingMasters = masterSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      // Query existing RPCPPE records
      const rpcppeSnapshot = await getDocs(collection(db, 'rpcppes'));
      const existingRpcppes = rpcppeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      // Find Warehouse matching item (matches article in uppercase and office === "Warehouse")
      const matchingWarehouseItem = existingItems.find(item => 
        item.office === "Warehouse" && 
        item.article && 
        item.article.toUpperCase().trim() === itemTitle.toUpperCase().trim()
      );

      // Find Designated Office matching item (matches article in uppercase and office === pr.targetOffice)
      const targetOfficeName = pr.targetOffice || "Municipal Engineering";
      const matchingOfficeItem = existingItems.find(item => 
        item.office === targetOfficeName && 
        item.article && 
        item.article.toUpperCase().trim() === itemTitle.toUpperCase().trim()
      );

      // Find if we have an existing reports to prevent duplicate report sheets
      const reportsSnapshot = await getDocs(collection(db, 'reports'));
      const existingReports = reportsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      
      const isAsset = unitCost >= 50000;
      
      const matchedRpcppeReport = existingReports.find(r => 
        (r.reportMode === 'appendix73') && 
        (r.prsNumber === prsNumber || r.id === pr.reportId || r.prsNumber === pr.id)
      );

      const matchedParReport = existingReports.find(r => 
        (r.reportMode === 'par') && 
        (r.prsNumber === prsNumber || r.id === pr.reportId || r.prsNumber === pr.id)
      );

      const matchedIcsReport = existingReports.find(r => 
        (r.reportMode === 'ics') && 
        (r.prsNumber === prsNumber || r.id === pr.reportId || r.prsNumber === pr.id)
      );

      const associatedFormType = isAsset ? 'PAR' : 'ICS';
      const associatedFormNo = isAsset 
        ? (matchedParReport ? (matchedParReport.parNo || matchedParReport.id) : `PAR-${prsNumber}`)
        : (matchedIcsReport ? (matchedIcsReport.icsNo || matchedIcsReport.id) : `ICS-${prsNumber}`);
      const associatedFormId = isAsset
        ? (matchedParReport ? matchedParReport.id : '')
        : (matchedIcsReport ? matchedIcsReport.id : '');

      // Run Transaction to perform atomic updates
      await runTransaction(db, async (transaction) => {
        // === 1. READS FIRST (ALL transaction.get calls MUST happen here) ===
        const prDocRef = doc(db, 'requests', pr.id);
        const prDocSnap = await transaction.get(prDocRef);

        const warehouseItemRef = matchingWarehouseItem ? doc(db, 'inventory_items', matchingWarehouseItem.docId) : null;
        const warehouseItemSnap = warehouseItemRef ? await transaction.get(warehouseItemRef) : null;

        const officeItemRef = matchingOfficeItem ? doc(db, 'inventory_items', matchingOfficeItem.docId) : null;
        const officeItemSnap = officeItemRef ? await transaction.get(officeItemRef) : null;

        // === 2. VALIDATION ===
        if (!prDocSnap.exists()) {
          throw new Error("Procurement Request Slip (PRS) does not exist in the database.");
        }
        
        const prData = prDocSnap.data();
        if (prData.status === 'Completed' || prData.status === 'RECEIVED') {
          throw new Error("This PRS has already been completed or received.");
        }

        // === 3. WRITES SECOND (NO MORE transaction.get calls) ===
        // Update PRS document status to 'Completed'
        transaction.update(prDocRef, {
          status: 'Completed',
          receivedAt: timestamp,
          receivedBy: userName
        });

        const dateStr = timestamp.split('T')[0];
        const timeStr = new Date().toLocaleTimeString();
        const rpcppe = mapCategoryToRpcppeFields("Equipment", itemTitle);

        // Action A: Create/Update Master Asset Record first inside transaction
        let masterAssetId = pr.masterAssetId || prData.masterAssetId || "";
        let masterAssetDocRef;
        let finalPropertyNumber = "";

        let matchedMaster = existingMasters.find(m => 
          (masterAssetId && m.id === masterAssetId) ||
          (m.propertyNumber && m.propertyNumber.toLowerCase().trim() === rpcppe.propertyNumber.toLowerCase().trim()) ||
          (m.article && m.article.toUpperCase().trim() === itemTitle.toUpperCase().trim())
        );

        if (matchedMaster) {
          masterAssetDocRef = doc(db, 'master_assets', matchedMaster.id);
          masterAssetId = matchedMaster.id;
          finalPropertyNumber = matchedMaster.propertyNumber || rpcppe.propertyNumber;
        } else {
          masterAssetDocRef = doc(collection(db, 'master_assets'));
          masterAssetId = masterAssetDocRef.id;
          finalPropertyNumber = rpcppe.propertyNumber;
        }

        const masterAssetPayload = {
          propertyNumber: finalPropertyNumber,
          article: itemTitle.toUpperCase(),
          description: pr.justification || pr.details || pr.description || `Received via PRS ${prsNumber}`,
          category: pr.category || rpcppe.category || "Equipment",
          brand: pr.brand || '',
          modelNumber: pr.modelNumber || '',
          serialNumber: pr.serialNumber || '',
          unitOfMeasure: pr.unit || 'unit',
          unitValue: unitCost,
          acquisitionCost: unitCost * qty,
          acquisitionDate: dateStr,
          expirationDate: pr.expirationDate || prData.expirationDate || '',
          supplier: pr.supplier || '',
          usefulLife: rpcppe.usefulLife || 5,
          assetCode: rpcppe.assetCode || '',
          classification: isAsset ? 'PAR' : 'ICS',
          isFixed: true,
          isFixedMaster: true
        };

        if (matchedMaster) {
          transaction.update(masterAssetDocRef, masterAssetPayload);
        } else {
          transaction.set(masterAssetDocRef, masterAssetPayload);
        }

        // Function to create/update inventory item inside transaction
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
            const freshData = itemSnap && itemSnap.exists() ? itemSnap.data() : matchingItem;
            oldQty = Number(freshData.qtyPhysicalCount) || 0;
            currentHistory = freshData.history || [];
          } else {
            itemDocRef = doc(collection(db, 'inventory_items'));
          }

          const newQty = oldQty + qty;
          const updatedHistory = [
            ...currentHistory,
            {
              id: Math.random().toString(36).substr(2, 9),
              timestamp,
              user: userName,
              action: matchingItem 
                ? `Cargo Auto-Updated: Received ${qty} unit(s) via PRS ${prsNumber}. Total: ${newQty}` 
                : `Initial registration of physical cargo via PRS ${prsNumber}.`
            }
          ];

          const itemPayload = {
            masterAssetId,
            article: itemTitle.toUpperCase(),
            description: pr.justification || pr.details || pr.description || `Received via PRS ${prsNumber}`,
            propertyNumber: finalPropertyNumber,
            assetCode: rpcppe.assetCode,
            usefulLife: rpcppe.usefulLife,
            category: pr.category || rpcppe.category || "Equipment",
            classification: classifyAssetByValue(unitCost),
            unitOfMeasure: pr.unit || "unit",
            unitValue: unitCost,
            qtyPropertyCard: newQty,
            qtyPhysicalCount: newQty,
            office: officeName,
            personAccountable: personAccountableName,
            assignedStaff: personAccountableName,
            remarks: `Delivered and verified under PRS ${prsNumber}`,
            yearPurchased: new Date(pr.datePurchased || timestamp).getFullYear(),
            status: "AVAILABLE",
            condition: pr.condition === 'Expired' || (pr.expirationDate && new Date(`${pr.expirationDate}T00:00:00`).getTime() <= new Date(new Date().setHours(0,0,0,0)).getTime()) ? 'Expired' : 'Good',
            expirationDate: pr.expirationDate || prData.expirationDate || '',
            dateReceived: dateStr,
            createdAt: matchingItem?.createdAt || timestamp,
            history: updatedHistory,
            associatedFormType,
            associatedFormId,
            associatedFormNo,
            acquisitionCost: unitCost * newQty,
          };

          if (matchingItem) {
            transaction.update(itemDocRef, itemPayload);
          } else {
            transaction.set(itemDocRef, itemPayload);
          }

          return { itemId: itemDocRef.id, oldQty, newQty, propNo: finalPropertyNumber };
        };

        const targetOffice = targetOfficeName || "Warehouse";
        const targetMatched = (targetOffice === "Warehouse") ? matchingWarehouseItem : (matchingOfficeItem || matchingWarehouseItem);
        const targetSnap = (targetOffice === "Warehouse") ? warehouseItemSnap : (officeItemSnap || warehouseItemSnap);
        const officeRes = processInventoryItemUpdate(targetMatched, targetSnap, targetOffice, pr.requestedBy || userName);

        // Helper to record stock card & transaction sub-collection
        const recordStockCardAndTransaction = (
          itemId: string, 
          officeName: string, 
          oldQty: number, 
          newQty: number
        ) => {
          const stockCardRef = doc(db, 'stock_cards', itemId);
          const transactionNumber = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;

          // We will update the main stock card doc summary
          transaction.set(stockCardRef, {
            itemId,
            article: itemTitle.toUpperCase(),
            description: pr.justification || pr.details || `Stock Card for ${itemTitle}`,
            supplier: pr.supplier || 'N/A',
            office: officeName,
            remainingBalance: newQty,
            quantity: newQty,
            currentStock: newQty,
            lastUpdated: timestamp,
            prsNumber: prsNumber,
            dateReceived: dateStr,
            receivingOfficer: userName,
          }, { merge: true });

          // Write sub-collection transaction
          const transactionDocRef = doc(collection(db, 'stock_cards', itemId, 'transactions'));
          transaction.set(transactionDocRef, {
            id: transactionNumber,
            transactionNumber: transactionNumber,
            prsNumber: prsNumber,
            type: 'IN',
            quantity: qty,
            quantityReceived: qty,
            quantityIssued: 0,
            date: dateStr,
            dateReceived: dateStr,
            timestamp,
            referenceFormId: prsNumber,
            supplier: pr.supplier || 'N/A',
            beginningBalance: oldQty,
            remainingBalance: newQty,
            currentStock: newQty,
            office: officeName,
            officeAssignment: officeName,
            receivingOfficer: userName
          });
        };

        // Action D: Update/Create Stock Cards
        recordStockCardAndTransaction(officeRes.itemId, targetOffice, officeRes.oldQty, officeRes.newQty);

        // Action E: Create/Update Receiving History record
        const recHistoryRef = doc(collection(db, 'receiving_history'));
        const txnNum = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;
        transaction.set(recHistoryRef, {
          transactionNumber: txnNum,
          prsNumber: prsNumber,
          supplier: pr.supplier || 'N/A',
          office: targetOfficeName,
          dateReceived: dateStr,
          receivedBy: userName,
          quantity: qty,
          remarks: pr.justification || pr.details || `Cargo received atomically via PRS ${prsNumber}`,
          timestamp: timestamp
        });

        // Helper to create or update corresponding report sheets in reports collection
        const handleReportUpdateInTxn = (
          mode: string, 
          reportTypeLabel: string, 
          matchedReportObj: any, 
          formClassification: string
        ) => {
          let reportDocRef;
          let reportPayload;

          if (matchedReportObj) {
            reportDocRef = doc(db, 'reports', matchedReportObj.id);
            const currentItems = matchedReportObj.items_snapshot || [];
            const existingItemIndex = currentItems.findIndex((i: any) => i.article === itemTitle.toUpperCase());
            let updatedItems = [...currentItems];
            if (existingItemIndex > -1) {
              updatedItems[existingItemIndex].qtyPropertyCard = (updatedItems[existingItemIndex].qtyPropertyCard || 0) + qty;
              updatedItems[existingItemIndex].qtyPhysicalCount = (updatedItems[existingItemIndex].qtyPhysicalCount || 0) + qty;
              updatedItems[existingItemIndex].remarks = `Auto-updated on receiving cargo under PRS ${prsNumber}`;
              updatedItems[existingItemIndex].masterAssetId = masterAssetId;
            } else {
              updatedItems.push({
                tempId: Math.random().toString(36).substr(2, 9),
                masterAssetId: masterAssetId,
                article: itemTitle.toUpperCase(),
                description: pr.justification || pr.details || `Received via PRS ${prsNumber}`,
                propertyNumber: finalPropertyNumber,
                unitOfMeasure: pr.unit || "unit",
                unitValue: unitCost,
                qtyPropertyCard: qty,
                qtyPhysicalCount: qty,
                remarks: `Delivered and verified under PRS ${prsNumber}`,
                condition: 'Good',
                classification: formClassification
              });
            }
            const newTotalValue = updatedItems.reduce((sum: number, item: any) => sum + ((item.unitValue || 0) * (item.qtyPhysicalCount || 0)), 0);
            reportPayload = {
              items_snapshot: updatedItems,
              item_count: updatedItems.length,
              total_value: newTotalValue,
              history: [
                ...(matchedReportObj.history || []),
                {
                  id: Math.random().toString(36).substr(2, 9),
                  timestamp,
                  action: 'Auto-Updated',
                  details: `${mode.toUpperCase()} automatically updated with additional cargo for PRS ${prsNumber}.`
                }
              ]
            };
            transaction.update(reportDocRef, reportPayload);
          } else {
            reportDocRef = doc(collection(db, 'reports'));
            reportPayload = {
              report_type: reportTypeLabel,
              fund_cluster: '01',
              report_date: dateStr,
              accountable_person: pr.requestedBy || userName,
              accountable_position: 'Office Head / Engineer',
              accountability_date: dateStr,
              committee_chair: 'Committee Chair',
              head_of_agency: 'Municipal Mayor',
              head_position: 'Municipal Mayor',
              coa_rep: 'COA Representative',
              total_value: amount,
              item_count: 1,
              items_snapshot: [
                {
                  tempId: Math.random().toString(36).substr(2, 9),
                  masterAssetId: masterAssetId,
                  article: itemTitle.toUpperCase(),
                  description: pr.justification || pr.details || `Received via PRS ${prsNumber}`,
                  propertyNumber: finalPropertyNumber,
                  unitOfMeasure: pr.unit || "unit",
                  unitValue: unitCost,
                  qtyPropertyCard: qty,
                  qtyPhysicalCount: qty,
                  remarks: `Delivered and verified under PRS ${prsNumber}`,
                  condition: 'Good',
                  classification: formClassification
                }
              ],
              status: 'Approved',
              history: [
                {
                  id: Math.random().toString(36).substr(2, 9),
                  timestamp,
                  action: 'Auto-Created',
                  details: `${mode.toUpperCase()} automatically compiled and approved on receiving cargo for PRS ${prsNumber}.`
                }
              ],
              reportMode: mode,
              prsNumber: prsNumber,
              created_at: timestamp
            };
            transaction.set(reportDocRef, reportPayload);
          }
        };

        // Action F: Automatically compile/update reports based on unit cost threshold
        if (isAsset) {
          // 1. RPCPPE report (Appendix 73)
          handleReportUpdateInTxn('appendix73', 'PROPERTY, PLANT AND EQUIPMENT', matchedRpcppeReport, 'PAR');
          // 2. Property Acknowledgement Receipt (PAR)
          handleReportUpdateInTxn('par', 'PROPERTY ACKNOWLEDGEMENT RECEIPT', matchedParReport, 'PAR');

          // 3. Write/update RPCPPE record inside rpcppes collection to maintain total database integrity
          let matchedRpcppe = existingRpcppes.find(r => 
            r.inventoryItemId === officeRes.itemId || 
            r.propertyNumber === officeRes.propNo
          );

          let rpcppeDocRef;
          if (matchedRpcppe) {
            rpcppeDocRef = doc(db, 'rpcppes', matchedRpcppe.id);
          } else {
            rpcppeDocRef = doc(collection(db, 'rpcppes'));
          }

          const rpcppePayload = {
            inventoryItemId: officeRes.itemId,
            masterAssetId: masterAssetId,
            propertyNumber: officeRes.propNo,
            article: itemTitle.toUpperCase(),
            description: pr.justification || pr.details || pr.description || `Received via PRS ${prsNumber}`,
            category: pr.category || rpcppe.category || "Equipment",
            unitValue: unitCost,
            qtyPropertyCard: officeRes.newQty,
            qtyPhysicalCount: officeRes.newQty,
            office: targetOfficeName,
            personAccountable: (pr.requestedBy || userName).toUpperCase(),
            status: "AVAILABLE",
            condition: "Brand New",
            assetCode: rpcppe.assetCode || '',
            usefulLife: rpcppe.usefulLife || 5,
            createdAt: matchedRpcppe ? (matchedRpcppe.createdAt || timestamp) : timestamp,
            updatedAt: timestamp
          };

          if (matchedRpcppe) {
            transaction.update(rpcppeDocRef, rpcppePayload);
          } else {
            transaction.set(rpcppeDocRef, rpcppePayload);
          }
        } else {
          // 4. Inventory Custodian Slip (ICS)
          handleReportUpdateInTxn('ics', 'INVENTORY CUSTODIAN SLIP', matchedIcsReport, 'ICS');
        }

        // Record standard inventory transactions for history
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
            user: userName,
            date: dateStr,
            time: timeStr,
            timestamp,
            remarks: `Cargo received atomically via PRS ${prsNumber}`,
            reference: prsNumber
          });
        };

        recordInventoryTransactionHistory(officeRes.itemId, targetOffice, officeRes.oldQty, officeRes.newQty);

        // Record System Logs & Notifications inside the transaction to keep it atomic!
        const sysLogAccRef = doc(collection(db, 'system_logs'));
        transaction.set(sysLogAccRef, {
          timestamp,
          user: 'Municipal Engineering Office',
          action: `RECEIVED (ATOMIC): "${itemTitle}" | Qty: ${qty} | Val: ₱${amount.toLocaleString()} | Target: ${targetOfficeName} | Reference PRS: ${prsNumber}`,
          module: 'Accounting History'
        });

        const sysLogEngRef = doc(collection(db, 'system_logs'));
        transaction.set(sysLogEngRef, {
          timestamp,
          user: userName,
          action: `RECEIVED (ATOMIC): Received and transferred cargo for "${itemTitle}" | Qty: ${qty} | Ref: ${prsNumber}`,
          module: 'Engineer Transaction Log'
        });

        const notifRef = doc(collection(db, 'notifications'));
        transaction.set(notifRef, {
          recipientRole: 'ACCOUNTING',
          message: `DELIVERY CONFIRMED: Item: "${itemTitle}" (Qty: ${qty}) under PRS ${prsNumber} has been received and deposited atomically into Warehouse & ${targetOfficeName} inventory, compiling associated reports.`,
          timestamp,
          isRead: false,
          type: 'RECEIPT',
          reportId: pr.id
        });
      });

      // Log to procurement transactions history
      await logProcurementTransaction({
        slipNumber: prsNumber,
        requestId: pr.id,
        itemArticle: itemTitle,
        quantity: qty,
        amount: amount || null,
        status: "Received",
        user: userName,
        office: userOffice || "Municipal Engineering",
        details: `Physically received cargo and matched with PRS details. Atomically committed to Warehouse & ${targetOfficeName} inventory with associated ${associatedFormType} setup.`
      });

      alert(`Success! "${itemTitle}" has been received atomically. 
Deposited ${qty} unit(s) into:
1. Warehouse Inventory & Stock Card
2. ${targetOfficeName} Inventory & Stock Card
All reports (RPCPPE, ${associatedFormType}) have been generated/updated and linked successfully!`);

    } catch (err: any) {
      console.error("Atomic transaction receipt failure:", err);
      alert(`Transaction Failed: ${err.message || 'Critical failure during atomic receiving.'}`);
    } finally {
      setReceivingPRId(null);
    }
  };

  const handleDistributeCargoItem = async (pr: any) => {
    if (!distOffice) {
      alert("Please select a target destination office.");
      return;
    }
    const allocateQty = Number(distQty);
    if (!allocateQty || allocateQty <= 0) {
      alert("Please enter a valid positive quantity to distribute.");
      return;
    }
    const remainingQty = pr.quantity - (pr.distributedQty || 0);
    if (allocateQty > remainingQty) {
      alert(`Cannot distribute ${allocateQty} units. Only ${remainingQty} units remain in this physical cargo slip.`);
      return;
    }

    setDistLoading(true);
    const timestamp = new Date().toISOString();
    const itemTitle = pr.itemArticle || pr.title || "Equipment";
    const amount = pr.amount || 0;
    const slipNo = pr.slipNumber || "N/A";

    try {
      // 1. Calculate new distributed quantities & update status
      const newDistributedQty = (pr.distributedQty || 0) + allocateQty;
      const isFullyDistributed = newDistributedQty === pr.quantity;
      const newStatus = isFullyDistributed ? 'DISTRIBUTED' : 'RECEIVED';

      const distributionEntry = {
        office: distOffice,
        quantity: allocateQty,
        date: distDate,
        remarks: distRemarks || "Standard allocation distribution"
      };
      
      const updatedDistributions = [...(pr.distributions || []), distributionEntry];

      // Update requests document with transactional allocation details
      await updateDoc(doc(db, 'requests', pr.id), {
        distributedQty: newDistributedQty,
        status: newStatus,
        distributions: updatedDistributions
      });

      await logProcurementTransaction({
        slipNumber: pr.slipNumber || "N/A",
        requestId: pr.id,
        itemArticle: itemTitle,
        quantity: allocateQty,
        amount: pr.amount || null,
        status: "Distributed",
        user: userName,
        office: userOffice || "Municipal Engineering",
        details: `Allocated ${allocateQty} unit(s) of "${itemTitle}" to target office: "${distOffice}". ${distRemarks ? `Remarks: "${distRemarks}"` : ''}`
      });

      // 2. Query target inventory items for target office to increment stock or register anew
      const itemsSnapshot = await getDocs(collection(db, 'inventory_items'));
      const existingItems = itemsSnapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      })) as any[];

      const isAsset = isAccountableAsset({ article: itemTitle, category: "Equipment", unitValue: amount });

      let targetMatchingItem = null;
      if (!isAsset) {
        targetMatchingItem = existingItems.find(item => 
          item.office && item.office.toLowerCase().trim() === distOffice.toLowerCase().trim() && 
          item.article && item.article.toLowerCase().trim() === itemTitle.toLowerCase().trim() &&
          (item.unitOfMeasure || "unit").toLowerCase().trim() === (pr.unit || "pcs").toLowerCase().trim()
        );
      }

      const dateStr = timestamp.split('T')[0];
      const timeStr = new Date().toLocaleTimeString();

      let finalTargetItemId = "";

      if (targetMatchingItem) {
        const oldQtyPhysical = Number(targetMatchingItem.qtyPhysicalCount) || 0;
        const newQtyProperty = (Number(targetMatchingItem.qtyPropertyCard) || 0) + allocateQty;
        const newQtyPhysical = oldQtyPhysical + allocateQty;
        const updates: any = {
          qtyPropertyCard: newQtyProperty,
          qtyPhysicalCount: newQtyPhysical,
          classification: classifyAssetByValue(amount),
          remarks: `Stock dynamically allocated from Supplier Cargo by Engineer. Reference Slip: ${slipNo} on ${dateStr}`,
          history: [
            ...(targetMatchingItem.history || []),
            {
              id: Math.random().toString(36).substr(2, 9),
              timestamp,
              user: userName,
              action: `Cargo Allocation from Slip ${slipNo}: incremented physical count by ${allocateQty} units by Engineer.`
            }
          ]
        };
        await updateDoc(doc(db, 'inventory_items', targetMatchingItem.docId), updates);
        finalTargetItemId = targetMatchingItem.docId;

        // Record inventory transaction for target office
        await addDoc(collection(db, 'inventory_transactions'), {
          itemId: targetMatchingItem.docId,
          article: targetMatchingItem.article || itemTitle,
          officeId: distOffice,
          transactionType: 'Item Distributed',
          quantity: allocateQty,
          previousBalance: oldQtyPhysical,
          newBalance: newQtyPhysical,
          user: userName,
          date: dateStr,
          time: timeStr,
          timestamp,
          remarks: `Allocated from Engineer Cargo Desk: Slip ${slipNo}`,
          reference: slipNo
        });
      } else {
        const rpcppe = mapCategoryToRpcppeFields("Equipment", itemTitle);
        const itemData = {
          article: itemTitle.toUpperCase(),
          description: pr.justification || pr.details || `Distributed by Municipal Engineer. Original PRS: ${slipNo}.`,
          propertyNumber: rpcppe.propertyNumber,
          assetCode: rpcppe.assetCode,
          usefulLife: rpcppe.usefulLife,
          category: rpcppe.category,
          classification: classifyAssetByValue(amount),
          unitOfMeasure: pr.unit || "pcs",
          unitValue: amount,
          qtyPropertyCard: allocateQty,
          qtyPhysicalCount: allocateQty,
          office: distOffice,
          personAccountable: "TBD",
          assignedStaff: "TBD",
          remarks: `Distributed from Engineer Cargo Desk. Reference Slip: ${slipNo}`,
          yearPurchased: new Date().getFullYear(),
          status: "AVAILABLE" as any,
          condition: "Brand New" as any,
          dateReceived: distDate,
          createdAt: timestamp,
          history: [{ 
            id: Math.random().toString(36).substr(2, 9), 
            timestamp, 
            user: userName, 
            action: `Registered dynamically via Engineer Allocation distribution of ${allocateQty} units on Slip ${slipNo}.` 
          }]
        };

        const docRef = await addDoc(collection(db, 'inventory_items'), itemData);
        finalTargetItemId = docRef.id;

        // Record inventory transaction for target office
        await addDoc(collection(db, 'inventory_transactions'), {
          itemId: docRef.id,
          article: itemData.article,
          officeId: distOffice,
          transactionType: 'Item Distributed',
          quantity: allocateQty,
          previousBalance: 0,
          newBalance: allocateQty,
          user: userName,
          date: dateStr,
          time: timeStr,
          timestamp,
          remarks: `Initial allocation distribution from Engineer Cargo Desk: Slip ${slipNo}`,
          reference: slipNo
        });
      }

      // 3. Deduct from Municipal Engineering's custody since stock is physically dispatched
      const engMatchingItem = existingItems.find(item => 
        item.office === "Municipal Engineering" && 
        item.article && item.article.toLowerCase().trim() === itemTitle.toLowerCase().trim()
      );

      if (engMatchingItem) {
        const currentQtyProp = Number(engMatchingItem.qtyPropertyCard) || 0;
        const currentQtyPhys = Number(engMatchingItem.qtyPhysicalCount) || 0;
        
        const newEngQtyProp = Math.max(0, currentQtyProp - allocateQty);
        const newEngQtyPhys = Math.max(0, currentQtyPhys - allocateQty);

        await updateDoc(doc(db, 'inventory_items', engMatchingItem.docId), {
          qtyPropertyCard: newEngQtyProp,
          qtyPhysicalCount: newEngQtyPhys,
          remarks: `Transient stock updated after distribution allocation of ${allocateQty} units to ${distOffice}.`,
          history: [
            ...(engMatchingItem.history || []),
            {
              id: Math.random().toString(36).substr(2, 9),
              timestamp,
              user: userName,
              action: `Cargo Dispatched: distributed ${allocateQty} units to ${distOffice}. Remaining transient custody: ${newEngQtyPhys}`
            }
          ]
        });

        // Record inventory transaction (OUT) for Municipal Engineering GSO Desk
        await addDoc(collection(db, 'inventory_transactions'), {
          itemId: engMatchingItem.docId,
          article: engMatchingItem.article || itemTitle,
          officeId: "Municipal Engineering",
          transactionType: 'Item Issued',
          quantity: allocateQty,
          previousBalance: currentQtyPhys,
          newBalance: newEngQtyPhys,
          user: userName,
          date: dateStr,
          time: timeStr,
          timestamp,
          remarks: `Dispatched to target office: ${distOffice}`,
          reference: slipNo
        });
      }

      // 4. Record system logs
      await addDoc(collection(db, 'system_logs'), {
        timestamp,
        user: userName,
        action: `DISTRIBUTED: Allocated ${allocateQty}x "${itemTitle}" from cargo slip ${slipNo} to target office: ${distOffice}`,
        module: 'Engineer Transaction Log'
      });

      await addDoc(collection(db, 'system_logs'), {
        timestamp,
        user: 'Municipal Engineering Office',
        action: `DISTRIBUTED: Allocated ${allocateQty}x "${itemTitle}" from cargo slip ${slipNo} to target office: ${distOffice}`,
        module: 'Accounting History'
      });

      // 5. Send notification to Accountant
      await addDoc(collection(db, 'notifications'), {
        recipientRole: 'ACCOUNTING',
        message: `CARGO DISPATCHED: Engineer distributed ${allocateQty} unit(s) of "${itemTitle}" to ${distOffice}.`,
        timestamp,
        isRead: false,
        type: 'DISTRIBUTION',
        reportId: pr.id
      });

      alert(`Success! Distributed ${allocateQty} unit(s) to ${distOffice}. Remaining inventories and history logs updated.`);
      
      // Clear forms
      setDistributingId(null);
      setDistOffice('');
      setDistQty(1);
      setDistRemarks('');
    } catch (err) {
      console.error("Distribution execution failed:", err);
      alert("Error executing distribution transaction.");
    } finally {
      setDistLoading(false);
    }
  };
  
  // Accounting-style PR Form states
  const [prSlipNumber, setPrSlipNumber] = useState(() => "PR-" + Math.floor(100000 + Math.random() * 900000));
  const [prItemArticle, setPrItemArticle] = useState('');
  const [prCategory, setPrCategory] = useState('Office Equipment');
  const [prCondition, setPrCondition] = useState<'Good' | 'Damaged' | 'Brand New' | 'Fair' | 'Under Repair' | 'Poor' | 'Condemned'>('Good');
  const [prUnit, setPrUnit] = useState('pcs');
  const [prQuantity, setPrQuantity] = useState<number | ''>(1);
  const [prUnitCost, setPrUnitCost] = useState<number | ''>('');
  const [prAmount, setPrAmount] = useState<number | ''>('');
  const [prSupplier, setPrSupplier] = useState('');
  const [prFundingSource, setPrFundingSource] = useState('General Fund');
  const [prPoNumber, setPrPoNumber] = useState('');
  const [prInvoiceNumber, setPrInvoiceNumber] = useState('');
  const [prDatePurchased, setPrDatePurchased] = useState(new Date().toISOString().split('T')[0]);
  const [prExpectedDeliveryDate, setPrExpectedDeliveryDate] = useState('');
  const [prExpirationDate, setPrExpirationDate] = useState('');
  const [prRequestedPerson, setPrRequestedPerson] = useState(userName || '');
  const [prJustification, setPrJustification] = useState('');
  const [prPriority, setPrPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [prTargetOffice, setPrTargetOffice] = useState(
    userOffice && userOffice !== 'All Offices' ? userOffice : 'Municipal Engineering'
  );
  const [submitting, setSubmitting] = useState(false);

  const targetDepartmentOptions = Array.from(new Set([
    ...offices.map(office => office.name).filter(Boolean),
    'Municipal Engineering',
    "Mayor's Office",
    'Accounting Office',
    'General Services Office (GSO)',
    'MDRRMO',
    'MSWDO',
    'Municipal Agriculture',
    'Municipal Health Office',
    'Treasury Office',
    'Budget Office',
    'MPDO',
  ]));

  // Auto-fill catalog search state
  const [prAssetSearchQuery, setPrAssetSearchQuery] = useState('');
  const [prShowAssetDropdown, setPrShowAssetDropdown] = useState(false);

  useEffect(() => {
    if (prQuantity && prUnitCost !== '') {
      setPrAmount(Number(prQuantity) * Number(prUnitCost));
    } else {
      setPrAmount('');
    }
  }, [prQuantity, prUnitCost]);

  // QR Simulator state
  const [scannedCode, setScannedCode] = useState('');
  const [scannedItem, setScannedItem] = useState<InventoryItem | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanResultText, setScanResultText] = useState('');

  // 1. Subscribe to requests (All Offices or specific selected office)
  useEffect(() => {
    let qr;
    if (!selectedOffice || selectedOffice === 'All Offices') {
      qr = query(
        collection(db, 'requests'), 
        orderBy('requestedAt', 'desc')
      );
    } else {
      qr = query(
        collection(db, 'requests'), 
        where('office', '==', selectedOffice),
        orderBy('requestedAt', 'desc')
      );
    }
    const unsubscribe = onSnapshot(qr, (snap) => {
      const fetched = snap.docs
        .map(doc => ({
          id: doc.id,
          ...doc.data()
        }))
        .filter((r: any) => {
          const reqType = (r.requestType || '').toUpperCase();
          const rMode = (r.reportMode || '').toLowerCase();
          return reqType !== 'PAR' && reqType !== 'ICS' && rMode !== 'par' && rMode !== 'ics';
        }) as AssetRequest[];
      setAssetRequests(fetched);
      setLoadingReqs(false);
    }, (err) => {
      console.error("Office Requisitions Error:", err);
      setLoadingReqs(false);
    });

    return () => unsubscribe();
  }, [selectedOffice]);

  // Scoped Inventory items (All items if 'All Offices' or filtered by selected office)
  const scopedItems = (!selectedOffice || selectedOffice === 'All Offices')
    ? items
    : items.filter(item => (item.office || '').toLowerCase() === selectedOffice.toLowerCase());

  // Handle lodging a new asset requisition request (Accounting-Style PR)
  const handleSubmitRequisition = async (e: React.FormEvent) => {
    e.preventDefault();
    // The form asks for one total Amount, so the request is recorded as 1 unit at that amount
    const quantity = Number(prQuantity) || 1;
    if (!prDatePurchased || !prSlipNumber.trim() || !prItemArticle.trim() || prUnitCost === '') {
      alert("Please fill in the Date, PR No., Description, and Amount.");
      return;
    }

    setSubmitting(true);
    try {
      const finalSlipNumber = prSlipNumber.trim().toUpperCase();
      const computedAmount = quantity * Number(prUnitCost || 0);

      // Resolve Master Asset record first or create one if missing
      const masterAssetsCol = collection(db, 'master_assets');
      let masterAssetId = '';
      const qMaster = query(masterAssetsCol, where('article', '==', prItemArticle.trim().toUpperCase()));
      const snapMaster = await getDocs(qMaster);
      const isDamagedReq = prCondition === 'Damaged' || prCondition === 'Under Repair' || prCondition === 'Poor' || prCondition === 'Condemned';
      const addedDamaged = isDamagedReq ? quantity : 0;

      if (!snapMaster.empty) {
        masterAssetId = snapMaster.docs[0].id;
        const masterData = snapMaster.docs[0].data();
        await updateDoc(doc(db, 'master_assets', masterAssetId), {
          condition: isDamagedReq ? prCondition : (masterData.condition || prCondition),
          qtyDamaged: Number(masterData.qtyDamaged || 0) + addedDamaged
        });
      } else {
        const masterDocRef = doc(masterAssetsCol);
        masterAssetId = masterDocRef.id;
        const cost = Number(prUnitCost) || 0;
        const classification = cost >= 50000 ? 'PAR' : 'ICS';
        const codePrefix = prCategory.toLowerCase().includes('office') ? 'OE' : (prCategory.toLowerCase().includes('ict') ? 'ICT' : 'EQ');
        const propNo = `LGU-${codePrefix}-2026-${Math.floor(1000 + Math.random() * 9000)}`;
        await setDoc(masterDocRef, {
          propertyNumber: propNo,
          article: prItemArticle.trim().toUpperCase(),
          description: prJustification || `Standard ${prCategory}`,
          category: prCategory || 'Other Assets',
          unitOfMeasure: prUnit || 'pcs',
          unitValue: cost,
          acquisitionCost: computedAmount,
          classification,
          condition: prCondition,
          qtyDamaged: addedDamaged,
          qtyPhysicalCount: quantity,
          qtyPropertyCard: quantity,
          isFixed: true,
          isFixedMaster: true,
          supplier: prSupplier.trim() || '',
          purchaseOrderNumber: prPoNumber || '',
          fundingSource: prFundingSource || 'General Fund',
          acquisitionDate: prDatePurchased || '',
          expirationDate: prExpirationDate || '',
          yearPurchased: prDatePurchased ? new Date(prDatePurchased).getFullYear() : new Date().getFullYear()
        });
      }

      const requestingOffice = userOffice || 'Municipal Hall';
      const targetOffice = prTargetOffice || requestingOffice;

      const payload = {
        masterAssetId,
        slipNumber: finalSlipNumber,
        itemArticle: prItemArticle.trim(),
        category: prCategory,
        equipmentType: prCategory,
        condition: prCondition,
        quantity,
        unit: prUnit,
        unitCost: Number(prUnitCost),
        amount: computedAmount,
        supplier: prSupplier.trim(),
        poNumber: prPoNumber || '',
        invoiceNumber: prInvoiceNumber || '',
        expectedDeliveryDate: prExpectedDeliveryDate || new Date().toISOString().split('T')[0],
        expirationDate: prExpirationDate || '',
        datePurchased: prDatePurchased || new Date().toISOString().split('T')[0],
        fundingSource: prFundingSource || 'General Fund',
        requestedBy: (prRequestedPerson.trim() || userName || 'Office Head'),
        justification: prJustification.trim() || "Purchase Request",
        priority: prPriority,
        status: "Pending Accounting Review",
        office: requestingOffice,
        targetOffice,
        targetOfficeHead: (prRequestedPerson.trim() || userName || 'Office Head'),
        preparedBy: userName,
        requestedAt: new Date().toISOString(),
        requestType: 'FINANCIAL'
      };

      const prDocRef = await addDoc(collection(db, "requests"), payload);

      // Log in procurement_transactions
      await logProcurementTransaction({
        slipNumber: finalSlipNumber,
        requestId: prDocRef.id,
        itemArticle: prItemArticle.trim(),
        quantity,
        amount: computedAmount,
        status: "Pending Accounting Review",
        user: userName,
        office: requestingOffice,
        details: `Purchase Request (PR #${finalSlipNumber}) created by ${requestingOffice} (${prRequestedPerson}) for "${prItemArticle.trim()}" (${prQuantity} ${prUnit} @ ₱${prUnitCost}/unit). Sent to Accounting for review. Destination department: ${targetOffice}.`
      });

      // Log in PRS Audit
      await logPRSAction({
        user: userName,
        role: 'OFFICE_HEAD',
        formType: 'PRS',
        transactionNumber: finalSlipNumber,
        timestamp: new Date().toISOString(),
        action: `CREATION & SUBMISSION: ${requestingOffice} submitted PR #${finalSlipNumber} for destination department ${targetOffice} ("${prItemArticle.trim()}") with status "Pending Accounting Review"`,
        module: "Procurement Audit"
      });

      // Notify Accounting for review first (three-tier workflow)
      const notificationSourceLabel = requestingOffice === 'MDRRMO' ? 'Office Head' : requestingOffice;
      await addDoc(collection(db, "notifications"), {
        recipientRole: 'ACCOUNTING',
        recipientOffice: 'Accounting Office',
        message: `NEW PR FOR REVIEW: ${notificationSourceLabel} (${prRequestedPerson}) submitted Purchase Request #${finalSlipNumber} for "${prItemArticle.trim()}" (Qty: ${prQuantity} ${prUnit}, Destination: ${targetOffice}). Please review and approve/reject.`,
        timestamp: new Date().toISOString(),
        isRead: false,
        type: 'NEW_REQUEST',
        reportId: prDocRef.id
      });

      // System log
      await addDoc(collection(db, "system_logs"), {
        timestamp: new Date().toISOString(),
        user: userName,
        action: `PR Submitted to Accounting for Review: Slip #${finalSlipNumber} (${prQuantity}x ${prItemArticle}) for destination department ${targetOffice}`,
        module: "Office Head Portal"
      });

      // Reset Form
      setPrItemArticle('');
      setPrCondition('Good');
      setPrJustification('');
      setPrQuantity(1);
      setPrUnit('pcs');
      setPrUnitCost('');
      setPrAmount('');
      setPrSupplier('');
      setPrPoNumber('');
      setPrInvoiceNumber('');
      setPrExpectedDeliveryDate('');
      setPrExpirationDate('');
      setPrDatePurchased(new Date().toISOString().split('T')[0]);
      setPrFundingSource('General Fund');
      setPrPriority('Medium');
      setPrSlipNumber("PR-" + Math.floor(100000 + Math.random() * 900000));
      setPrAssetSearchQuery('');
      setPrShowAssetDropdown(false);

      alert(`Purchase Request (PR #${finalSlipNumber}) submitted successfully! It has been sent to Accounting for review.`);
    } catch (err) {
      console.error("Error creating request:", err);
      alert("Failed to submit request: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setSubmitting(false);
    }
  };

  // QR Scan simulation
  const handleSimulateScan = (propertyNumber: string) => {
    setIsScanning(true);
    setScannedItem(null);
    setScanResultText('Decoding Property Security Signature...');
    
    setTimeout(() => {
      const found = items.find(i => i.propertyNumber.toUpperCase() === propertyNumber.toUpperCase());
      setIsScanning(false);
      if (found) {
        setScannedItem(found);
        setScanResultText(`Success! Property Number matches an active LGU record.`);
      } else {
        setScannedItem(null);
        setScanResultText(`Security Warning: No item found in LGU registry with property code "${propertyNumber}".`);
      }
    }, 1200);
  };

  const printingTotalValue = scopedItems.reduce((sum, item) => sum + (item.unitValue * item.qtyPhysicalCount), 0);

  return (
    <div className="gov-app min-h-screen bg-slate-50 flex font-sans text-slate-800">
      
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col no-print shrink-0 border-r border-slate-800">
        <div className="p-6 border-b border-slate-800/80">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/30 shrink-0">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] font-black leading-tight uppercase tracking-widest text-blue-400 truncate">LGU Tibiao</span>
              <span className="text-[8px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Office Head Portal</span>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1.5 mt-2 overflow-y-auto custom-scrollbar">
          <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest px-3 mb-2">Purchase Request</div>
          {[
            { id: 'requisitions', label: 'Submit Purchase Item', icon: 'M12 4v16m8-8H4' }
          ].map(tab => (
            <button
               key={tab.id}
               onClick={() => setActiveTab(tab.id as any)}
               className={`w-full flex items-center justify-between px-3 py-3 rounded-xl transition-all duration-200 ${
                 activeTab === tab.id 
                   ? 'bg-blue-600 text-white shadow-xl shadow-blue-900/40 font-black' 
                   : 'text-slate-300 hover:bg-slate-800 hover:text-white font-medium'
               }`}
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                <svg className="w-4 h-4 flex-shrink-0 opacity-80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d={tab.icon} />
                </svg>
                <span className="font-bold text-[10px] uppercase tracking-tight text-left leading-none truncate">{tab.label}</span>
              </div>
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-slate-800/60">
          <button 
            onClick={onLogout}
            className="w-full flex items-center space-x-3 px-3 py-2.5 rounded-xl text-red-400 hover:bg-red-950/20 transition-all group cursor-pointer"
          >
            <svg className="w-4 h-4 text-red-500 group-hover:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className="font-black text-[9px] uppercase tracking-widest text-left">Sign Out Session</span>
          </button>
        </div>
      </aside>

      {/* Main Panel Column */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Unified Top Header Bar */}
        <header className="bg-white border-b border-gray-100 py-4 px-8 flex flex-row items-center justify-between no-print shrink-0">
          <div>
            <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest leading-none">Purchase Request Submission Portal</span>
            <h1 className="text-md font-brand font-black text-slate-900 tracking-tight mt-0.5 uppercase">Office Head Portal</h1>
          </div>
        </header>

        {/* Scrollable Container Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-8">
            {activeTab === 'inventory' ? (
          <div className="space-y-8 animate-in duration-300">
            {/* Scoped Summary Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest">Office Asset Count</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{scopedItems.length} active items</p>
                </div>
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold">🛒</div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-[9px] font-black uppercase tracking-widest">Aggregate Custody Value</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">₱{printingTotalValue.toLocaleString()}</p>
                </div>
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">₱</div>
              </div>
              <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center justify-between bg-blue-600 text-white border-none">
                <div>
                  <p className="text-blue-200 text-[9px] font-black uppercase tracking-widest">Your Filed Requests</p>
                  <p className="text-2xl font-black mt-1">{assetRequests.length} filed</p>
                </div>
                <div className="w-12 h-12 bg-blue-500 text-white rounded-2xl flex items-center justify-center font-bold">📝</div>
              </div>
            </div>

            {assetRequests.filter(r => r.requestType === 'REQUISITION').length > 0 && (
              <section className="bg-white p-5 rounded-3xl border border-slate-100 shadow-sm space-y-3">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-800">My Requisitions</h3>
                {assetRequests.filter(r => r.requestType === 'REQUISITION').slice(0, 6).map(req => (
                  <div key={req.id} className="flex items-center justify-between gap-3 border-t border-slate-100 pt-3 text-xs">
                    <span className="font-bold text-slate-800">{req.itemArticle} · Qty {req.quantity}</span>
                    <span className={`px-2.5 py-1 rounded-full border text-[9px] font-black uppercase ${req.status === 'Pending Accounting Review' ? 'bg-amber-50 text-amber-700 border-amber-200' : req.status === 'Pending Engineer/Admin Review' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-slate-50 text-slate-600 border-slate-200'}`}>{req.status === 'Pending Accounting Review' ? 'Awaiting Accounting Review' : req.status === 'Pending Engineer/Admin Review' ? 'With Engineer for Approval' : req.status}</span>
                  </div>
                ))}
              </section>
            )}

            {/* Warranty Expiration Alerts Portal for Office Head */}
            {activeWarrantyNotifs.length > 0 && (
              <div className="bg-white p-6 rounded-[32px] border border-rose-100 shadow-sm space-y-4 animate-in duration-300">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
                    <h3 className="text-xs font-black text-rose-700 uppercase tracking-widest font-brand">Office Asset Warranty Alerts</h3>
                  </div>
                  <span className="text-[9px] font-black bg-rose-50 text-rose-700 px-2.5 py-0.5 rounded uppercase">{activeWarrantyNotifs.length} Active</span>
                </div>
                <div className="space-y-2">
                  {activeWarrantyNotifs.map(notif => (
                    <div key={notif.id} className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl flex items-center justify-between text-xs transition-all">
                      <span className="font-semibold text-rose-800">{notif.message}</span>
                      <button
                        onClick={() => dismissNotification(notif.id)}
                        className="px-2.5 py-1 bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-[8px] font-black uppercase transition-all"
                      >
                        Dismiss
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Scoped custody table or dual-column layout for Engineering */}
            <div className={`grid grid-cols-1 ${userOffice.toLowerCase().includes("engineering") ? "lg:grid-cols-3" : ""} gap-6`}>
              <div className={userOffice.toLowerCase().includes("engineering") ? "lg:col-span-2" : ""}>
                <div className="bg-white p-8 rounded-[36px] border border-slate-100 shadow-sm space-y-6 h-full">
                  <div>
                    <h3 className="font-brand font-black text-slate-900 text-lg uppercase tracking-tight">Assigned Property Ledger</h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">List of items and assets officially assigned to the care of {userOffice}</p>
                  </div>

                  {scopedItems.length === 0 ? (
                    <div className="py-20 text-center text-gray-400">
                      <p className="uppercase text-[10px] tracking-widest font-black text-gray-300">No assets listed under custody</p>
                      <p className="text-xs font-medium uppercase text-slate-400 mt-2">Use the 'Property Requests' tab to request allocations.</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            <th className="py-4">Property Code</th>
                            <th className="py-4">Item description</th>
                            <th className="py-4">category</th>
                            <th className="py-4">Accountable Person</th>
                            <th className="py-4">Classification</th>
                            <th className="py-4 text-right">Qty</th>
                            <th className="py-4 text-right">Unit Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {scopedItems.map(item => (
                            <tr key={item.id} className="border-b border-slate-50 text-xs hover:bg-slate-50/50 transition-all">
                              <td className="py-4 font-mono font-bold text-blue-600">{item.propertyNumber}</td>
                              <td className="py-4 font-black uppercase text-slate-900">{item.article}</td>
                              <td className="py-4 text-slate-500 uppercase">{item.category}</td>
                              <td className="py-4 font-medium text-slate-700">{item.personAccountable}</td>
                              <td className="py-4">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[9px] font-black uppercase">
                                  {item.classification}
                                </span>
                              </td>
                              <td className="py-4 text-right font-bold">{item.qtyPhysicalCount}</td>
                              <td className="py-4 text-right font-black text-slate-800">₱{(item.unitValue || 0).toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>

              {userOffice.toLowerCase().includes("engineering") && (
                <div className="lg:col-span-1">
                  <div className="bg-white p-6 rounded-[36px] border border-slate-100 shadow-sm space-y-6 h-full flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-brand font-black text-slate-900 text-sm uppercase tracking-tight">Recent Activity Map</h3>
                          <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Real-time resource flow status</p>
                        </div>
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                        </span>
                      </div>

                      <div className="mt-6 space-y-4">
                        {procurementTransactions
                          .filter((tx: any) => {
                            const isEngOffice = tx.office?.toLowerCase().includes('engineering');
                            const mentionsEng = tx.details?.toLowerCase().includes('engineering');
                            const isFlowStatus = ['Sent', 'Received', 'Distributed', 'Item Received', 'Item Distributed'].includes(tx.status);
                            return (isEngOffice || mentionsEng) && isFlowStatus;
                          })
                          .slice(0, 5)
                          .map((tx: any) => {
                            const getBadgeColor = (status: string) => {
                              switch (status) {
                                case 'Received': return 'bg-emerald-50 text-emerald-700 border-emerald-150';
                                case 'Distributed': return 'bg-purple-50 text-purple-700 border-purple-150';
                                case 'Approved': return 'bg-teal-50 text-teal-700 border-teal-150';
                                case 'Declined': return 'bg-rose-50 text-rose-700 border-rose-150';
                                case 'Sent': return 'bg-blue-50 text-blue-700 border-blue-150';
                                default: return 'bg-slate-50 text-slate-600 border-slate-150';
                              }
                            };

                            return (
                              <div key={tx.id} className="p-4 rounded-[22px] border border-gray-50 bg-slate-50/45 space-y-2 text-[10px] leading-relaxed transition-all hover:bg-slate-50">
                                <div className="flex items-center justify-between">
                                  <span className={`text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${getBadgeColor(tx.status)}`}>
                                    {tx.status}
                                  </span>
                                  <span className="text-[8px] font-mono text-gray-400">
                                    {tx.timestamp ? tx.timestamp.split('T')[1]?.substring(0, 5) : ''}
                                  </span>
                                </div>
                                <p className="font-extrabold text-slate-800 text-[10px] uppercase tracking-tight">{tx.itemArticle} (x{tx.quantity})</p>
                                <p className="text-[9px] text-slate-500 font-medium">{tx.details}</p>
                                <div className="flex items-center justify-between text-[8px] text-gray-400 font-bold uppercase mt-1 border-t border-slate-100/50 pt-2">
                                  <span>BY: {tx.user}</span>
                                  <span>slip: {tx.slipNumber || "N/A"}</span>
                                </div>
                              </div>
                            );
                          })}

                        {procurementTransactions.filter((tx: any) => {
                          const isEngOffice = tx.office?.toLowerCase().includes('engineering');
                          const mentionsEng = tx.details?.toLowerCase().includes('engineering');
                          const isFlowStatus = ['Sent', 'Received', 'Distributed', 'Item Received', 'Item Distributed'].includes(tx.status);
                          return (isEngOffice || mentionsEng) && isFlowStatus;
                        }).length === 0 && (
                          <div className="py-12 text-center text-gray-400 border border-dashed border-gray-100 rounded-2xl">
                            <span className="text-xl">📭</span>
                            <p className="uppercase text-[9px] tracking-widest font-black text-gray-300 mt-2">No resource flow recorded yet</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      onClick={() => setActiveTab('procurement_history')}
                      className="w-full py-3 bg-slate-900 text-white font-black text-[8px] uppercase tracking-widest rounded-2xl hover:bg-slate-850 active:scale-[0.98] transition-all cursor-pointer"
                    >
                      View Consolidated Log
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'requisitions' ? (
          <div className="max-w-3xl mx-auto animate-in">
            {/* Requisition Form (Accounting Style PR Submission) */}
            <div className="relative overflow-hidden bg-white p-6 md:p-8 rounded-[30px] border border-slate-200 shadow-[0_14px_40px_rgba(16,36,62,0.08)] space-y-6">
              <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-blue-700 via-indigo-500 to-cyan-400" />
              <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h6l4 4v12a2 2 0 01-2 2z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 3v5h5" />
                      </svg>
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-[0.18em] text-blue-700">Purchase Request</span>
                  </div>
                  <h3 className="font-brand font-black text-slate-900 text-xl uppercase tracking-tight">Submit Purchase Request</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wide mt-1">Official request for review, approval, and cargo dispatch</p>
                </div>
                <span className="shrink-0 px-3 py-1.5 bg-indigo-50 text-indigo-700 text-[9px] font-black uppercase tracking-widest rounded-lg border border-indigo-100">
                  PR #{prSlipNumber.replace('PR-', '')}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 rounded-xl border border-slate-100 bg-slate-50 p-2">
                <div className="rounded-lg bg-white px-3 py-2 shadow-sm">
                  <span className="block text-[7px] font-black uppercase tracking-widest text-slate-400">Document</span>
                  <span className="text-[9px] font-black uppercase text-slate-700">New PR Slip</span>
                </div>
                <div className="rounded-lg px-3 py-2">
                  <span className="block text-[7px] font-black uppercase tracking-widest text-slate-400">Status</span>
                  <span className="text-[9px] font-black uppercase text-amber-600">Draft</span>
                </div>
                <div className="rounded-lg px-3 py-2">
                  <span className="block text-[7px] font-black uppercase tracking-widest text-slate-400">Required Fields</span>
                  <span className="text-[9px] font-black uppercase text-slate-700">Marked *</span>
                </div>
              </div>

              {/* Quick Asset Catalog Lookup */}
              <div className="relative bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                <label className="text-[8px] font-black text-indigo-600 uppercase tracking-widest block mb-1">
                  🔍 Auto-fill from Catalog Search
                </label>
                <input
                  type="text"
                  placeholder="Search registered assets to auto-fill..."
                  value={prAssetSearchQuery}
                  onChange={(e) => {
                    setPrAssetSearchQuery(e.target.value);
                    setPrShowAssetDropdown(true);
                  }}
                  onFocus={() => setPrShowAssetDropdown(true)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-xs outline-none focus:border-indigo-500"
                />
                {prShowAssetDropdown && prAssetSearchQuery.trim().length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 max-h-48 overflow-y-auto divide-y divide-slate-100">
                    {activeCatalogItems
                      .filter(i => (i.article || '').toLowerCase().includes(prAssetSearchQuery.toLowerCase()))
                      .slice(0, 5)
                      .map(matched => (
                        <button
                          key={matched.id}
                          type="button"
                          onClick={() => {
                            setPrItemArticle(matched.article);
                            setPrCategory(matched.category || 'Office Equipment');
                            setPrUnit(matched.unitOfMeasure || 'pcs');
                            setPrUnitCost(matched.unitValue || '');
                            if (matched.supplier) setPrSupplier(matched.supplier);
                            if (matched.fundingSource) setPrFundingSource(matched.fundingSource);
                            if (matched.purchaseOrderNumber) setPrPoNumber(matched.purchaseOrderNumber);
                            if (matched.expirationDate) setPrExpirationDate(matched.expirationDate);
                            if (matched.office) {
                              setPrTargetOffice(matched.office);
                            }
                            setPrAssetSearchQuery('');
                            setPrShowAssetDropdown(false);
                          }}
                          className="w-full px-4 py-2.5 text-left hover:bg-indigo-50/50 transition-colors flex items-center justify-between"
                        >
                          <div>
                            <p className="text-[11px] font-black text-slate-800 uppercase">{matched.article}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase">{matched.category} • ₱{matched.unitValue?.toLocaleString() || 0}</p>
                          </div>
                          <span className="text-[8px] font-black text-indigo-600 uppercase bg-indigo-50 px-2 py-0.5 rounded">Select</span>
                        </button>
                      ))}
                  </div>
                )}
              </div>

              <form onSubmit={handleSubmitRequisition} className="space-y-5">
                {/* 1. Date & 2. PR No. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">
                      Date <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={prDatePurchased}
                      onChange={e => setPrDatePurchased(e.target.value)}
                      className="w-full px-3 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none rounded-xl font-bold text-xs transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">
                      PR No. <span className="text-red-500">*</span>
                    </label>
                    <input
                      required
                      placeholder="e.g. PR-2026-001"
                      value={prSlipNumber}
                      onChange={e => setPrSlipNumber(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none rounded-xl font-bold text-xs transition-all uppercase"
                    />
                  </div>
                </div>

                {/* 3. Description */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <input
                    required
                    placeholder="e.g. Executive Desk, Heavy Duty Laptop, Office Chairs"
                    value={prItemArticle}
                    onChange={e => setPrItemArticle(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none rounded-xl font-bold text-xs transition-all uppercase"
                  />
                </div>

                {/* 4. Office */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">
                    Office <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={prTargetOffice}
                    onChange={e => setPrTargetOffice(e.target.value)}
                    className="w-full px-3 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none rounded-xl font-bold text-xs transition-all"
                  >
                    {targetDepartmentOptions.map(department => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                </div>

                {/* 5. Source of Fund & 6. Amount */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">
                      Source of Fund
                    </label>
                    <input
                      placeholder="e.g. General Fund, SEF, 20% EDF"
                      value={prFundingSource}
                      onChange={e => setPrFundingSource(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none rounded-xl font-bold text-xs transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">
                      Amount (₱) <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="number"
                      min={0}
                      step="any"
                      required
                      placeholder="0.00"
                      value={prUnitCost}
                      onChange={e => setPrUnitCost(e.target.value === '' ? '' : parseFloat(e.target.value))}
                      className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none rounded-xl font-bold text-xs transition-all"
                    />
                  </div>
                </div>

                {/* 7. Remarks */}
                <div className="space-y-1.5">
                  <label className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">
                    Remarks
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Enter remarks, specifications, or justification..."
                    value={prJustification}
                    onChange={e => setPrJustification(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-indigo-500 outline-none rounded-xl font-bold text-xs transition-all resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-blue-700 hover:bg-blue-800 text-white font-black text-[10px] uppercase tracking-[0.14em] py-4 rounded-xl shadow-lg shadow-blue-200 transition-all disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer mt-3"
                >
                  {submitting ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      <span>Submitting Purchase Item...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                      </svg>
                      <span>Submit Purchase Request to Accounting</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          </div>
        ) : activeTab === 'scanner' ? (
          <div className="bg-white p-8 md:p-12 rounded-[40px] border border-slate-100 shadow-sm max-w-2xl mx-auto space-y-8 animate-in text-center">
            <div>
              <h3 className="font-brand font-black text-slate-900 text-xl uppercase tracking-tight">Property QR Scanner Simulator</h3>
              <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Simulate scanning of barcodes/labels attached to LGU physical assets</p>
            </div>

            {/* Simulated camera scanning grid */}
            <div className="w-full aspect-video md:h-56 bg-slate-900 rounded-3xl relative overflow-hidden flex items-center justify-center border-4 border-slate-800">
              {isScanning ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/80 z-20 space-y-4">
                  <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-white text-[10px] font-black uppercase tracking-widest animate-pulse">{scanResultText}</p>
                </div>
              ) : null}

              {/* Scanning visual guide lines */}
              <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-red-500 shadow-[0_0_15px_#ef4444] animate-bounce z-10"></div>
              
              <div className="w-40 h-40 border-2 border-dashed border-blue-400/50 rounded-2xl flex items-center justify-center bg-white/5">
                <svg className="w-16 h-16 text-blue-500/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h3m-3 0H9m12 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            {/* Simulated selector of property codes */}
            <div className="space-y-4 text-left max-w-md mx-auto">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Select Property Number to Scan</label>
                <div className="flex gap-2">
                  <select 
                    id="sim-scan-prop"
                    onChange={e => setScannedCode(e.target.value)}
                    value={scannedCode}
                    className="flex-1 px-4 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-xs font-bold outline-none focus:border-blue-500"
                  >
                    <option value="">-- Choose Assigned Item sticker --</option>
                    {scopedItems.map(item => (
                      <option key={item.id} value={item.propertyNumber}>{item.propertyNumber} - {item.article}</option>
                    ))}
                    <option value="PROP-INVALID-404">PROP-INVALID-404 (Incorrect Label)</option>
                  </select>
                  <button
                    onClick={() => scannedCode && handleSimulateScan(scannedCode)}
                    disabled={!scannedCode || isScanning}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-black text-[10px] uppercase tracking-widest px-8 rounded-2xl shadow-md transition-all active:scale-95 disabled:opacity-50"
                  >
                    Tap Decode
                  </button>
                </div>
              </div>

              {/* Scan Results Display */}
              {scanResultText && !isScanning && (
                <div className={`p-6 rounded-2xl border text-xs ${scannedItem ? 'bg-green-50 border-green-100 text-green-900' : 'bg-red-50 border-red-100 text-red-900'}`}>
                  <p className="font-black uppercase tracking-widest text-[9px] mb-2">Simulation Scanning Output</p>
                  <p className="font-bold">{scanResultText}</p>
                  
                  {scannedItem && (
                    <div className="mt-4 pt-4 border-t border-green-200/40 text-left space-y-2 text-slate-700">
                      <div><span className="font-black uppercase text-[8px] text-gray-500 block">nomenclature</span><span className="font-black uppercase text-sm">{scannedItem.article}</span></div>
                      <div><span className="font-black uppercase text-[8px] text-gray-500 block">Specifications</span><span className="font-semibold">{scannedItem.description || 'N/A'}</span></div>
                      <div className="grid grid-cols-2 gap-4">
                        <div><span className="font-black uppercase text-[8px] text-gray-500 block">Acquisition Valuation</span><span className="font-bold text-slate-900">₱{(scannedItem.unitValue || 0).toLocaleString()}</span></div>
                        <div><span className="font-black uppercase text-[8px] text-gray-500 block">Accountable Officer</span><span className="font-bold text-slate-900">{scannedItem.personAccountable}</span></div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : activeTab === 'cargo' ? (
          /* Cargo Receipt Desk Tab */
          <div className="space-y-8 animate-in fade-in duration-350">
            {/* Top Info Banner */}
            <div className="bg-slate-900 text-white p-8 rounded-[32px] shadow-xl border border-slate-800 relative overflow-hidden flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
              <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-12 -translate-y-12">
                <svg className="w-80 h-80 text-white" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                </svg>
              </div>
              <div className="relative z-10 flex-1">
                <span className="text-[8.5px] font-black uppercase text-indigo-400 tracking-widest block">LGU Municipal Property Transfer Desk</span>
                <h3 className="font-brand font-black text-white text-2xl uppercase tracking-tight mt-1">Engineer Cargo & Custody Desk</h3>
                <p className="text-[11px] text-slate-300 font-medium max-w-xl mt-1 leading-relaxed">
                  Review procurement requests, approve/reject splits instantly, and auto-receive completed deliveries directly into the active RPCPPE and inventory registry.
                </p>
              </div>
              <button
                onClick={() => setShowShipmentModal(true)}
                className="relative z-10 flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 shrink-0 self-start sm:self-auto cursor-pointer font-brand"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 13h6m-3-3v6m-9 1V4a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                <span>Lodge Supplier Shipment</span>
              </button>
            </div>

            {/* Main content grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
              {/* Left Column: PR Lists */}
              <div className="lg:col-span-8 bg-white border border-slate-100 p-8 rounded-[32px] shadow-sm space-y-8">
                <div>
                  <h4 className="font-brand font-black text-slate-800 text-sm uppercase tracking-tight">Supplier Cargo & Accountant Slips</h4>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase mt-0.5">Automated procurement registry synchronized directly with Accounting and Supplier flows</p>
                </div>

                {loadingPRs ? (
                  <div className="py-12 flex flex-col items-center justify-center space-y-2">
                    <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest animate-pulse">Synchronizing Cargo Logs...</span>
                  </div>
                ) : (
                  <div className="space-y-8">
                    {(() => {
                      const pendingSlips = actPRs.filter(pr => {
                        const s = (pr.status || '').toUpperCase();
                        const isDone = s === 'COMPLETED' || s === 'RECEIVED' || s === 'REJECTED' || s === 'DECLINED' || s === 'DISTRIBUTED';
                        return !isDone;
                      });
                      const receivedSlips = actPRs.filter(pr => 
                        (pr.status === 'Completed' || pr.status === 'RECEIVED' || pr.status === 'DISTRIBUTED')
                      );
                      const historySlips = actPRs.filter(pr => 
                        (pr.status === 'REJECTED' || pr.status === 'Rejected' || pr.status === 'Returned')
                      );

                      return (
                        <>
                          {/* STAGE 1: DELIVERIES IN TRANSIT & PENDING CARGO QUEUE */}
                          <div className="space-y-4">
                            <span className="text-[10px] font-black text-amber-600 uppercase tracking-widest block border-b border-amber-100 pb-2 flex items-center gap-1.5">
                              <span>📥 Stage 1: Incoming Supplier Cargo Deliveries ({pendingSlips.length})</span>
                            </span>
                            {pendingSlips.length === 0 ? (
                              <div className="p-8 text-center text-[10.5px] font-black uppercase text-gray-300 tracking-wider bg-slate-50 border border-dashed border-slate-100 rounded-2xl">
                                No incoming supplier deliveries or transit cargo queued.
                              </div>
                            ) : (
                              pendingSlips.map((pr) => (
                                <div key={pr.id} className="p-6 border border-slate-200 bg-slate-50/50 hover:bg-slate-50 rounded-2xl flex flex-col gap-4 transition-all border-l-4 border-l-amber-500 shadow-sm">
                                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                    <div className="space-y-2 max-w-md">
                                      <div className="flex items-center gap-2">
                                        <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 rounded-full text-[8px] font-black uppercase shadow-xs">
                                          In Transit / Cargo Pending
                                        </span>
                                        <span className="text-[9.5px] font-mono text-gray-400 font-extrabold block">
                                          REF: PR-{pr.id.substring(0, 5).toUpperCase()}
                                        </span>
                                      </div>
                                      <div>
                                        <span className="font-extrabold text-slate-800 text-sm block leading-none">{pr.itemArticle || pr.title}</span>
                                        <span className="text-[11px] text-gray-500 font-semibold block mt-1.5 leading-relaxed">
                                          {pr.justification || pr.details || "Cargo requisitioned for public works custody."}
                                        </span>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-4 text-[10.5px] text-slate-500">
                                        <span>Quantity: <strong className="text-slate-900">{pr.quantity || 1}</strong></span>
                                        <span>Cost: <strong className="text-emerald-700">₱{(pr.amount || 0).toLocaleString()}</strong></span>
                                        <span>Requested by: <strong className="text-slate-800">{pr.requestedBy}</strong></span>
                                      </div>
                                    </div>

                                    {/* Action buttons (only if not currently expanding rejection) */}
                                    {rejectingPRId !== pr.id && (
                                      <div className="flex items-center gap-2 mt-2 md:mt-0">
                                        <button
                                          onClick={() => handleReceiveCargoItem(pr)}
                                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[9px] uppercase tracking-wider px-4 py-2.5 rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1 cursor-pointer"
                                        >
                                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                                          </svg>
                                          Receive & Register Items
                                        </button>
                                        <button
                                          onClick={() => {
                                            setRejectingPRId(pr.id);
                                            setRejectionReasonInput('');
                                          }}
                                          className="border border-rose-200 text-rose-600 hover:bg-rose-50 font-black text-[9px] uppercase tracking-wider px-4 py-2.5 rounded-xl transition-all active:scale-95 cursor-pointer"
                                        >
                                          Refuse/Return
                                        </button>
                                      </div>
                                    )}
                                  </div>

                                  {/* INLINE REJECTION/RETURN CAPTURE */}
                                  {rejectingPRId === pr.id && (
                                    <div className="mt-2 p-4 bg-rose-50/20 border border-amber-200 rounded-xl space-y-3 animate-in slide-in-from-top-2 duration-200">
                                      <div>
                                        <label className="text-[9px] font-black text-rose-800 uppercase tracking-widest block mb-1">Remarks for Returning / Refusing Cargo Delivery</label>
                                        <textarea
                                          value={rejectionReasonInput}
                                          onChange={(e) => setRejectionReasonInput(e.target.value)}
                                          placeholder="Specify reason (e.g. incomplete specs, damaged items, incorrect pricing, incorrect quantities)..."
                                          className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-bold outline-none focus:border-amber-500 text-slate-800 placeholder-slate-400 min-h-[75px]"
                                        />
                                      </div>
                                      <div className="flex flex-wrap items-center justify-end gap-2">
                                        <button
                                          onClick={() => {
                                            setRejectingPRId(null);
                                            setRejectionReasonInput('');
                                          }}
                                          className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-black text-[9px] uppercase tracking-wider rounded-lg transition-all"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={() => handleRejectSlip(pr, rejectionReasonInput, 'Returned')}
                                          className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white font-black text-[9px] uppercase tracking-wider rounded-lg shadow-md hover:shadow-amber-500/10 transition-all flex items-center gap-1 cursor-pointer"
                                        >
                                          <span>↩ Return for Correction</span>
                                        </button>
                                        <button
                                          onClick={() => handleRejectSlip(pr, rejectionReasonInput, 'Rejected')}
                                          className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-black text-[9px] uppercase tracking-wider rounded-lg shadow-md hover:shadow-rose-600/10 transition-all flex items-center gap-1 cursor-pointer"
                                        >
                                          <span>✗ Reject Delivery</span>
                                        </button>
                                      </div>
                                    </div>
                                  )}

                                  {/* Receiving Timeline visual tracker */}
                                  <ReceivingTimeline req={pr} />
                                </div>
                              ))
                            )}
                          </div>

                          {/* STAGE 2: CUSTODY & ALLOCATION OFFICE DISTRIBUTIONS */}
                          <div className="space-y-4 pt-4 border-t border-slate-100">
                            <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block border-b border-indigo-100 pb-2">
                              🚚 Stage 2: Custody & Physical Allocations ({receivedSlips.length})
                            </span>
                            {receivedSlips.length === 0 ? (
                              <div className="p-8 text-center text-[10.5px] font-black uppercase text-gray-300 tracking-wider bg-slate-50 border border-dashed border-slate-100 rounded-2xl">
                                No physically received cargo awaiting allocation to Offices.
                              </div>
                            ) : (
                              receivedSlips.map((pr) => {
                                const remainingToAllocate = pr.quantity - (pr.distributedQty || 0);
                                const allocationPct = Math.round(((pr.distributedQty || 0) / pr.quantity) * 100);

                                return (
                                  <div key={pr.id} className="p-6 border border-slate-200 bg-white rounded-2xl flex flex-col gap-4 transition-all shadow-xs">
                                    <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                                      <div className="space-y-2 max-w-md">
                                        <div className="flex items-center gap-2">
                                          {allocationPct >= 100 ? (
                                            <span className="px-2.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-full text-[8px] font-black uppercase">
                                              Allocated & Distributed
                                            </span>
                                          ) : (
                                            <span className="px-2.5 py-0.5 bg-indigo-100 text-indigo-800 rounded-full text-[8px] font-black uppercase">
                                              In transient custody ({allocationPct}% Distributed)
                                            </span>
                                          )}
                                          <span className="text-[9.5px] font-mono text-gray-400 font-extrabold block">
                                            REF: PR-{pr.id.substring(0, 5).toUpperCase()}
                                          </span>
                                        </div>
                                        <div>
                                          <strong className="text-slate-800 text-sm block leading-none">{pr.itemArticle || pr.title}</strong>
                                          <span className="text-[11px] text-gray-500 block mt-1.5 font-semibold">
                                            Original details: {pr.justification || pr.details || "Requisitioned cargo physical items."}
                                          </span>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                                          <span>Total Received: <strong className="text-slate-800">{pr.quantity || 1}</strong></span>
                                          <span>Distributed: <strong className="text-indigo-600">{pr.distributedQty || 0}</strong></span>
                                          <span>Remaining Custody: <strong className="text-amber-600">{remainingToAllocate}</strong></span>
                                        </div>
                                      </div>

                                      {/* High contrast visual tracker bar */}
                                      <div className="flex flex-col items-end gap-1">
                                        <span className="text-[9.5px] font-black font-mono text-slate-500 uppercase">Allocation Ratio: {allocationPct}%</span>
                                        <div className="w-28 bg-slate-100 rounded-full h-2 overflow-hidden border border-slate-150">
                                          <div 
                                            className={`h-full transition-all duration-500 rounded-full ${allocationPct >= 100 ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                            style={{ width: `${allocationPct}%` }}
                                          ></div>
                                        </div>
                                      </div>
                                    </div>

                                    {/* allocations distribution history array log */}
                                    {pr.distributions && pr.distributions.length > 0 && (
                                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-2 text-[10.5px]">
                                        <span className="text-[8px] font-black uppercase text-slate-400 tracking-wider">Distribution Ledger Entries:</span>
                                        <div className="space-y-1.5">
                                          {pr.distributions.map((dst: any, idx: number) => (
                                            <div key={idx} className="flex justify-between text-slate-700 font-bold border-b border-slate-100 pb-1 last:border-0 last:pb-0">
                                              <span>📍 {dst.office}</span>
                                              <span>{dst.quantity} unit(s) dispatched ({dst.date})</span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Action or distribute entry slider form code block */}
                                    {remainingToAllocate > 0 && (
                                      <>
                                        {distributingId === pr.id ? (
                                          <div className="mt-2 p-5 border border-indigo-150 bg-indigo-50/10 rounded-2xl space-y-4 animate-in slide-in-from-top-2 duration-150">
                                            <h5 className="text-[10px] uppercase font-black text-indigo-800 tracking-wider">Allocate & Distribute Physical Stock Cargo</h5>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                              <div>
                                                <label className="text-[8.5px] font-black uppercase text-slate-400 block mb-1">Destination Office / Dept</label>
                                                <select
                                                  value={distOffice}
                                                  onChange={(e) => setDistOffice(e.target.value)}
                                                  className="w-full text-xs font-black bg-white text-slate-800 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500"
                                                >
                                                  <option value="">-- Select Office --</option>
                                                  {offices.map(o => (
                                                    <option key={o.id} value={o.name}>{o.name}</option>
                                                  ))}
                                                </select>
                                              </div>
                                              <div>
                                                <label className="text-[8.5px] font-black uppercase text-slate-400 block mb-1">Allocated Quantity (Remaining: {remainingToAllocate})</label>
                                                <input
                                                  type="number"
                                                  min="1"
                                                  max={remainingToAllocate}
                                                  value={distQty}
                                                  onChange={(e) => setDistQty(Number(e.target.value))}
                                                  className="w-full text-xs font-black bg-white text-slate-800 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500"
                                                />
                                              </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                              <div>
                                                <label className="text-[8.5px] font-black uppercase text-slate-400 block mb-1">Allocation Dispatch Date</label>
                                                <input
                                                  type="date"
                                                  value={distDate}
                                                  onChange={(e) => setDistDate(e.target.value)}
                                                  className="w-full text-xs font-black bg-white text-slate-800 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500"
                                                />
                                              </div>
                                              <div>
                                                <label className="text-[8.5px] font-black uppercase text-slate-400 block mb-1">Remarks & Custody Sign-offs</label>
                                                <input
                                                  type="text"
                                                  value={distRemarks}
                                                  onChange={(e) => setDistRemarks(e.target.value)}
                                                  placeholder="e.g. Distributed/collected manually with sign-off details..."
                                                  className="w-full text-xs font-black bg-white text-slate-800 border border-slate-200 rounded-xl p-2.5 outline-none focus:border-indigo-500"
                                                />
                                              </div>
                                            </div>
                                            <div className="flex items-center justify-end gap-2 pt-2 border-t border-indigo-100/50">
                                              <button
                                                onClick={() => setDistributingId(null)}
                                                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-[9px] uppercase tracking-wider rounded-xl transition-all"
                                              >
                                                Cancel
                                              </button>
                                              <button
                                                onClick={() => handleDistributeCargoItem(pr)}
                                                disabled={distLoading}
                                                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[9px] uppercase tracking-wider rounded-xl shadow-md flex items-center gap-1.5 transition-all"
                                              >
                                                {distLoading && <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>}
                                                Confirm Dispatch
                                              </button>
                                            </div>
                                          </div>
                                        ) : (
                                          <button
                                            onClick={() => {
                                              setDistributingId(pr.id);
                                              setDistOffice('');
                                              setDistQty(remainingToAllocate);
                                              setDistRemarks('');
                                            }}
                                            className="px-4 py-2 bg-indigo-50 hover:bg-indigo-600 hover:text-white text-indigo-700 font-black text-[9px] uppercase tracking-wider rounded-xl border border-indigo-100 transition-all cursor-pointer self-start flex items-center gap-1 shadow-sm"
                                          >
                                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
                                            </svg>
                                            Distribute Physical Stock
                                          </button>
                                        )}
                                      </>
                                    )}

                                    {/* Receiving Timeline visual tracker */}
                                    <ReceivingTimeline req={pr} />
                                  </div>
                                );
                              })
                            )}
                          </div>

                          {/* STAGE 3: RETURNED & OTHER SLIPS HISTORY */}
                          <div className="space-y-4 pt-6 border-t border-slate-100">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">
                              📋 Returned / Refused Slips History ({historySlips.length})
                            </span>
                            {historySlips.length === 0 ? (
                              <div className="p-5 text-center text-[10px] font-extrabold uppercase text-gray-300 tracking-wider">
                                No historical refused/refused procurement slips logged.
                              </div>
                            ) : (
                              <div className="space-y-3">
                                {historySlips.map((pr) => (
                                  <div key={pr.id} className={`p-5 border rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 ${
                                    pr.status === 'Returned' ? 'border-amber-100 bg-amber-50/10' : 'border-rose-100 bg-rose-50/10'
                                  }`}>
                                    <div className="min-w-0 space-y-1">
                                      <span className="font-extrabold text-slate-800 text-[12px] block truncate">{pr.itemArticle || pr.title}</span>
                                      <div className="flex flex-wrap items-center gap-3 text-[9.5px] text-gray-400 font-medium">
                                        <span>Original Qty: {pr.quantity || 1}</span>
                                        <span>•</span>
                                        <span>Est Value: ₱{(pr.amount || 0).toLocaleString()}</span>
                                      </div>
                                      {(pr.rejectionReason || pr.adminRemarks) && (
                                        <p className={`mt-2 text-[10.5px] p-2.5 rounded-lg font-extrabold border ${
                                          pr.status === 'Returned' 
                                            ? 'text-amber-800 bg-amber-50 border-amber-100/50' 
                                            : 'text-rose-700 bg-rose-50 border-rose-100/50'
                                        }`}>
                                          <strong>{pr.status === 'Returned' ? 'Return Remarks: ' : 'Refusal Reason: '}</strong>{pr.rejectionReason || pr.adminRemarks}
                                        </p>
                                      )}
                                    </div>
                                    <div className="flex items-center space-x-2 self-start md:self-auto">
                                      {pr.status === 'Returned' ? (
                                        <>
                                          <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                          </svg>
                                          <span className="text-[9px] font-black uppercase text-amber-700 tracking-wider">RETURNED TO ACCOUNTANT</span>
                                        </>
                                      ) : (
                                        <>
                                          <svg className="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                          </svg>
                                          <span className="text-[9px] font-black uppercase text-rose-700 tracking-wider">DELIVERY REFUSED</span>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>

              {/* Right Column: Engineer Transaction Log */}
              <div className="lg:col-span-4 bg-white border border-slate-100 p-8 rounded-[32px] shadow-sm space-y-6">
                <div>
                  <h4 className="font-black text-slate-900 text-xs uppercase tracking-wider">My Transaction History Log</h4>
                  <p className="text-[10px] text-gray-400 font-semibold uppercase mt-0.5">Audited history of your official receipts and movements</p>
                </div>

                <div className="space-y-3 max-h-[480px] overflow-y-auto custom-scrollbar pr-1">
                  {engineerLogs.length === 0 ? (
                    <div className="py-12 text-center text-[10px] font-black uppercase text-gray-300 tracking-wider">
                      No matching transaction logs found for your Engineering user profile.
                    </div>
                  ) : (
                    engineerLogs.map((log) => (
                      <div key={log.id} className="p-4 border border-slate-100 bg-slate-50/20 rounded-2xl space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[8.5px] font-mono text-slate-400 font-black">
                            {(() => {
                              try {
                                if (log.timestamp && typeof log.timestamp === 'string') {
                                  return new Date(log.timestamp).toLocaleString();
                                }
                                if (log.timestamp && log.timestamp.seconds) {
                                  return new Date(log.timestamp.seconds * 1000).toLocaleString();
                                }
                                return 'Recent';
                              } catch(e) {
                                return 'Recent';
                              }
                            })()}
                          </span>
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-lg text-[7.5px] font-black uppercase tracking-wider">
                            {log.module || "System Logging"}
                          </span>
                        </div>
                        <p className="text-[10.5px] text-slate-600 font-semibold leading-relaxed">
                          {log.action}
                        </p>
                        <div className="text-[8.5px] font-bold text-gray-400">
                          Actor: {log.user}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : activeTab === 'procurement_history' ? (
          <div className="animate-in fade-in duration-300">
            <ProcurementTransactionHistory userOffice={selectedOffice} />
          </div>
        ) : (
          /* Reports Tab (Interactive Official Reports Workflow) */
          <div className="animate-in fade-in duration-300">
            <Reports 
              items={items}
              userRole="OFFICE_HEAD"
              userOffice={selectedOffice}
              userName={userName}
              initialTab={reportsInitialTab}
            />
          </div>
        )}
          </div>
        </div>
      </div>

      {showShipmentModal && (
        <SupplierShipmentModal
          isOpen={showShipmentModal}
          onClose={() => setShowShipmentModal(false)}
          userRole={user.role}
          userName={user.fullName}
          offices={offices}
        />
      )}
    </div>
  );
};

export default OfficeHeadDashboard;
