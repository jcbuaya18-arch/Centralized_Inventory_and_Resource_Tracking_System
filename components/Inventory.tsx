import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  InventoryItem,
  Office,
  HistoryEntry,
  UserRole,
  ReceivingRequest,
  AssetRequest,
} from "../types";
import { storage, db, auth } from "../firebase";
import { mapCategoryToRpcppeFields } from "./OfficeHeadDashboard";
import { InventoryTransferReport } from "./InventoryTransferReport";
import { CsvImportModal } from "./CsvImportModal";
import { SupplierShipmentModal } from "./SupplierShipmentModal";
import {
  ref,
  uploadBytes,
  getDownloadURL,
  deleteObject,
} from "firebase/storage";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  runTransaction,
  getDocs,
  where,
} from "firebase/firestore";
import { QRCodeSVG } from "qrcode.react";
import { handleFirestoreError, OperationType } from "../lib/errors";
import { compressImageToBase64 } from "../lib/images";
import DepartmentFormsWorkspace, { DepartmentDocType } from "./DepartmentFormsWorkspace";

export const classifyAssetByValue = (cost: number): "PAR" | "ICS" => {
  return (cost || 0) >= 50000 ? "PAR" : "ICS";
};

interface InventoryProps {
  items: InventoryItem[];
  setItems: React.Dispatch<React.SetStateAction<InventoryItem[]>>;
  offices: Office[];
  officeFilter: string;
  setOfficeFilter: (office: string) => void;
  userRole: UserRole;
  onAddItem: (item: Partial<InventoryItem>) => Promise<string | undefined>;
  onRemoveItem: (id: string) => Promise<void>;
  onUpdateItem: (id: string, updates: Partial<InventoryItem>) => Promise<void>;
  userName: string;
  userOffice?: string;
  userPosition?: string;
  initialSubTab?: "items" | "receiving" | "requisitions" | "transfers";
  officeTab?: "stock_card" | "par" | "ics";
  setOfficeTab?: (tab: "stock_card" | "par" | "ics") => void;
}

const CATEGORIES = [
  "Office Equipment",
  "Furniture & Fixtures",
  "ICT Equipment",
  "Buildings",
  "Machinery",
  "Transportation Equipment",
  "Other Assets",
];

const isExpiredInventoryItem = (item: InventoryItem): boolean => {
  if (item.condition === "Expired") return true;
  if (!item.expirationDate) return false;
  try {
    const expDate = new Date(item.expirationDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return expDate.getTime() <= today.getTime();
  } catch {
    return false;
  }
};

const isItemExpiringSoon = (item: InventoryItem, daysThreshold = 30): boolean => {
  if (!item.expirationDate || item.isArchived) return false;
  try {
    const expDate = new Date(item.expirationDate + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const threshold = new Date(today);
    threshold.setDate(threshold.getDate() + daysThreshold);
    return expDate.getTime() >= today.getTime() && expDate.getTime() <= threshold.getTime();
  } catch {
    return false;
  }
};

const normalizeInventoryMatchValue = (value: unknown): string =>
  String(value ?? "").trim().toLowerCase();

const isOfficeAwareDuplicateInventoryItem = (
  candidate: Partial<InventoryItem>,
  existing: InventoryItem,
  ignoreId?: string,
): boolean => {
  if (ignoreId && existing.id === ignoreId) return false;

  const candidateArticle = normalizeInventoryMatchValue(candidate.article);
  const candidateOffice = normalizeInventoryMatchValue(candidate.office);
  const existingArticle = normalizeInventoryMatchValue(existing.article);
  const existingOffice = normalizeInventoryMatchValue(existing.office);

  if (!candidateArticle || !existingArticle) return false;

  if (!candidateOffice && !existingOffice) {
    return candidateArticle === existingArticle;
  }

  return candidateArticle === existingArticle && candidateOffice === existingOffice;
};

const getDeptShortCode = (deptNameStr: string): string => {
  const norm = (deptNameStr || "").toLowerCase().trim();
  if (norm.includes("accounting")) return "ACC";
  if (norm.includes("agriculture") || norm.includes("agri")) return "AGR";
  if (norm.includes("engineering")) return "ENG";
  if (norm.includes("mdrrmo")) return "MDR";
  if (norm.includes("treasurer") || norm.includes("treasury")) return "MTO";
  if (norm.includes("mayor")) return "MAYOR";
  if (norm.includes("health") || norm.includes("rhm") || norm.includes("rhp")) return "MHO";
  if (norm.includes("gso") || norm.includes("supply")) return "GSO";
  return "ADM";
};

const EditableCell: React.FC<{
  value: any;
  onSave: (val: any) => void;
  type?: string;
  isNumeric?: boolean;
}> = ({ value, onSave, type = "text", isNumeric = false }) => {
  const [editing, setEditing] = useState(false);
  const [temp, setTemp] = useState(value);

  useEffect(() => {
    setTemp(value);
  }, [value]);

  if (editing) {
    return (
      <input
        type={type}
        className="border border-blue-500 rounded px-1.5 py-0.5 text-xs text-black font-sans uppercase min-w-[80px] w-full bg-white select-text outline-none focus:ring-1 focus:ring-blue-600 no-print"
        value={temp !== undefined ? temp : ""}
        onChange={e => setTemp(e.target.value)}
        onBlur={() => {
          setEditing(false);
          const finalVal = isNumeric ? (parseFloat(temp) || 0) : temp;
          onSave(finalVal);
        }}
        onKeyDown={e => {
          if (e.key === "Enter") {
            setEditing(false);
            const finalVal = isNumeric ? (parseFloat(temp) || 0) : temp;
            onSave(finalVal);
          }
          if (e.key === "Escape") {
            setEditing(false);
            setTemp(value);
          }
        }}
        onClick={e => e.stopPropagation()}
        autoFocus
      />
    );
  }

  return (
    <div
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      className="cursor-pointer hover:bg-yellow-50 px-1 py-0.5 rounded transition-all italic text-slate-800 border border-transparent hover:border-yellow-200 select-text font-serif leading-tight text-center truncate min-h-[1.5rem] flex items-center justify-center"
      title="Click to edit value"
    >
      {value !== undefined && value !== "" ? (
        isNumeric ? `₱${Number(value).toLocaleString(undefined, {minimumFractionDigits: 2})}` : value
      ) : (
        <span className="text-gray-300 font-normal">--</span>
      )}
    </div>
  );
};

const Inventory: React.FC<InventoryProps> = ({
  items,
  setItems,
  offices,
  officeFilter,
  setOfficeFilter,
  userRole,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  userName,
  userOffice,
  userPosition,
  initialSubTab = "items",
  officeTab: officeTabProp,
  setOfficeTab: setOfficeTabProp,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [officeTabState, setOfficeTabState] = useState<'stock_card' | 'par' | 'ics'>('stock_card');
  const officeTab = officeTabProp !== undefined ? officeTabProp : officeTabState;
  const setOfficeTab = setOfficeTabProp !== undefined ? setOfficeTabProp : setOfficeTabState;
  const [officeAssetSearch, setOfficeAssetSearch] = useState('');
  // PAR / ICS department workspace, shown on the Accounting & Finance office page
  const [deptDocType, setDeptDocType] = useState<DepartmentDocType | null>(null);
  const isAccountingOffice = /accounting/i.test(officeFilter || '');
  useEffect(() => { setDeptDocType(null); }, [officeFilter]);
  const [activeSubTab, setActiveSubTab] = useState<
    "items" | "receiving" | "requisitions" | "transfers"
  >(initialSubTab);
  const [cargoDepartmentFilter, setCargoDepartmentFilter] = useState('');

  // --- Photo Gallery Lightbox State ---
  const [galleryImages, setGalleryImages] = useState<string[] | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number>(0);
  const [galleryTitle, setGalleryTitle] = useState<string>("");

  // --- Enhanced Stock Card Module Hooks ---
  const [selectedStockCardItemId, setSelectedStockCardItemId] = useState<string | null>(null);
  const [newMovementType, setNewMovementType] = useState<'IN' | 'OUT'>('IN');
  const [newMovementDate, setNewMovementDate] = useState(new Date().toISOString().split('T')[0]);
  const [newMovementRef, setNewMovementRef] = useState('');
  const [newMovementQty, setNewMovementQty] = useState(1);
  const [newMovementPersonnel, setNewMovementPersonnel] = useState('');
  const [newMovementRemarks, setNewMovementRemarks] = useState('');
  const [isLodgeMovementOpen, setIsLodgeMovementOpen] = useState(false);
  const [movementSubmitting, setMovementSubmitting] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'inventory_transactions'), orderBy('timestamp', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const txs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTransactions(txs);
    }, (error) => {
      console.error('Error loading inventory transactions:', error);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    setActiveSubTab(initialSubTab);
  }, [initialSubTab]);
  const [receivingRequests, setReceivingRequests] = useState<
    ReceivingRequest[]
  >([]);
  const [assetRequests, setAssetRequests] = useState<AssetRequest[]>([]);
  const [remarksInput, setRemarksInput] = useState<{ [key: string]: string }>(
    {},
  );

  // New Shipment State
  const [shipmentArticle, setShipmentArticle] = useState("");
  const [shipmentQty, setShipmentQty] = useState(1);
  const [shipmentVal, setShipmentVal] = useState(0);
  const [shipmentSupplier, setShipmentSupplier] = useState("");
  const [shipmentOffice, setShipmentOffice] = useState(offices[0]?.name || "");
  const [shipmentCategory, setShipmentCategory] = useState(CATEGORIES[0]);
  const [shipmentDesc, setShipmentDesc] = useState("");
  const [shipmentSerialNumber, setShipmentSerialNumber] = useState("");
  const [shipmentModelNumber, setShipmentModelNumber] = useState("");
  const [submittingShipment, setSubmittingShipment] = useState(false);
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [receivingItem, setReceivingItem] = useState<ReceivingRequest | null>(
    null,
  );
  const [receivingCustodian, setReceivingCustodian] = useState("");

  useEffect(() => {
    if (receivingItem) {
      // Use the office head associated with the requesting office if available, or the requestedBy person
      const officeHeadMap: Record<string, string> = {
        "Municipal Engineering": "Engr. J. Santos",
        "Municipal Engineering Office": "Engr. J. Santos",
        "Mayor's Office": "Mayor Gil B. Bandoja",
        "Accounting Office": "Jocelyn Manzan",
        "Accounting & Finance": "Jocelyn Manzan",
        "Health & Nutrition": "Dr. Juan Dela Cruz",
        "Assessor's Office": "Atty. Clara Maria",
      };
      const officeName = receivingItem.office || (receivingItem as any).targetOffice || "";
      const defaultCustodian = (receivingItem as any).personAccountable || (receivingItem as any).requestedBy || (receivingItem as any).targetOfficeHead || (receivingItem as any).officeHead || officeHeadMap[officeName] || "Office Head";
      setReceivingCustodian(defaultCustodian);
    } else {
      setReceivingCustodian("");
    }
  }, [receivingItem]);

  useEffect(() => {
    const q = query(
      collection(db, "receiving_requests"),
      orderBy("deliveryDate", "desc"),
    );
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as ReceivingRequest[];
        setReceivingRequests(fetched);
      },
      (err) => {
        console.error("Receiving Subscriber error:", err);
      },
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "requests"), orderBy("requestedAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const fetched = snapshot.docs.map((doc) => ({
          id: doc.id,
          ...doc.data(),
        })) as AssetRequest[];
        setAssetRequests(fetched);
      },
      (err) => {
        console.error("Requests Subscriber error:", err);
      },
    );
    return () => unsubscribe();
  }, []);

  // Engineer/Admin view & edit of a purchase request on the Receiving & Inspection page
  const [editingPurchase, setEditingPurchase] = useState<{
    id: string;
    datePurchased: string;
    slipNumber: string;
    itemArticle: string;
    office: string;
    fundingSource: string;
    amount: number | string;
    justification: string;
  } | null>(null);
  const [savingPurchase, setSavingPurchase] = useState(false);

  const openPurchaseEditor = (requestId: string) => {
    const raw: any = assetRequests.find((r) => r.id === requestId);
    if (!raw) return;
    const quantity = Number(raw.quantity) || 1;
    const amount = raw.amount ?? (Number(raw.unitCost ?? raw.unitValue) || 0) * quantity;
    setEditingPurchase({
      id: raw.id,
      datePurchased: raw.datePurchased || (raw.requestedAt || "").substring(0, 10),
      slipNumber: raw.slipNumber || raw.requestNumber || "",
      itemArticle: raw.itemArticle || raw.title || "",
      office: raw.targetOffice || raw.office || "",
      fundingSource: raw.fundingSource || "General Fund",
      amount,
      justification: raw.justification || raw.details || "",
    });
  };

  const handleSavePurchaseEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPurchase) return;
    const raw: any = assetRequests.find((r) => r.id === editingPurchase.id);
    if (!raw) return;

    const amount = Number(editingPurchase.amount) || 0;
    const quantity = Number(raw.quantity) || 1;
    const unitCost = amount / quantity;
    const timestamp = new Date().toISOString();

    setSavingPurchase(true);
    try {
      await updateDoc(doc(db, "requests", editingPurchase.id), {
        datePurchased: editingPurchase.datePurchased,
        slipNumber: editingPurchase.slipNumber.trim().toUpperCase(),
        itemArticle: editingPurchase.itemArticle.trim(),
        targetOffice: editingPurchase.office,
        fundingSource: editingPurchase.fundingSource.trim(),
        amount,
        unitCost,
        unitValue: unitCost,
        justification: editingPurchase.justification.trim(),
        history: [
          ...(raw.history || []),
          {
            id: Math.random().toString(36).substr(2, 9),
            timestamp,
            action: "Edited by Engineer/Admin",
            details: `Purchase request details updated by ${userName} on the Receiving & Inspection page.`,
          },
        ],
      });

      await addDoc(collection(db, "system_logs"), {
        timestamp,
        user: userName,
        action: `Edited purchase request ${editingPurchase.slipNumber || editingPurchase.id} ("${editingPurchase.itemArticle}") before receiving`,
        module: "Inventory Module",
      });

      setEditingPurchase(null);
    } catch (err) {
      console.error("Failed to update purchase request:", err);
      alert("Failed to save changes to the purchase request.");
    } finally {
      setSavingPurchase(false);
    }
  };

  const handleLodgeShipment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shipmentArticle || !shipmentSupplier) {
      alert("Please enter the item name and supplier name.");
      return;
    }
    setSubmittingShipment(true);
    try {
      await addDoc(collection(db, "receiving_requests"), {
        itemArticle: shipmentArticle.toUpperCase(),
        description: shipmentDesc || "Lodged Supplier Cargo",
        category: shipmentCategory,
        quantity: Math.max(1, Number(shipmentQty)),
        unitValue: Math.max(0, Number(shipmentVal)),
        supplier: shipmentSupplier.toUpperCase(),
        office: shipmentOffice,
        deliveryDate: new Date().toISOString(),
        status: "PENDING",
        requestedBy: userName,
      });

      await addDoc(collection(db, "system_logs"), {
        timestamp: new Date().toISOString(),
        user: userName,
        action: `Lodged Shipment for Executive Approval: ${shipmentQty}x ${shipmentArticle}`,
        module: "Inventory Module",
      });

      alert(
        "Supplier Shipment successfully sent to LGU Mayor for executive authorization!",
      );
      setShowShipmentModal(false);
      // Reset form
      setShipmentArticle("");
      setShipmentQty(1);
      setShipmentVal(0);
      setShipmentSupplier("");
      setShipmentDesc("");
      setShipmentSerialNumber("");
      setShipmentModelNumber("");
    } catch (err) {
      console.error(err);
      alert("Failed to lodge supplier shipment.");
    } finally {
      setSubmittingShipment(false);
    }
  };

  const handleApproveReceivingRequest = async (request: ReceivingRequest, remarks: string) => {
    try {
      const docRef = doc(db, 'receiving_requests', request.id);
      await updateDoc(docRef, {
        status: 'APPROVED',
        approvedBy: userName,
        approvedAt: new Date().toISOString(),
        mayorRemarks: remarks || 'Approved by Engineer/Admin'
      });

      await addDoc(collection(db, 'system_logs'), {
        timestamp: new Date().toISOString(),
        user: userName,
        action: `Shipment Approved by Engineer/Admin: ${request.quantity}x ${request.itemArticle} for ${request.office}`,
        module: 'Inventory Module'
      });

      alert("Shipment approved successfully. It is now ready to be received.");
    } catch (err) {
      console.error(err);
      alert("Failed to approve shipment.");
    }
  };

  const handleRejectReceivingRequest = async (request: ReceivingRequest, remarks: string) => {
    try {
      const docRef = doc(db, 'receiving_requests', request.id);
      await updateDoc(docRef, {
        status: 'REJECTED',
        approvedBy: userName,
        approvedAt: new Date().toISOString(),
        mayorRemarks: remarks
      });

      await addDoc(collection(db, 'system_logs'), {
        timestamp: new Date().toISOString(),
        user: userName,
        action: `Shipment REJECTED by Engineer/Admin: ${request.quantity}x ${request.itemArticle} for ${request.office}. Reason: ${remarks}`,
        module: 'Inventory Module'
      });

      alert("Shipment rejected successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to reject shipment.");
    }
  };

  const handleReturnReceivingRequest = async (request: ReceivingRequest, remarks: string) => {
    try {
      const docRef = doc(db, 'receiving_requests', request.id);
      await updateDoc(docRef, {
        status: 'FORWARDED',
        approvedBy: userName,
        approvedAt: new Date().toISOString(),
        mayorRemarks: remarks
      });

      await addDoc(collection(db, 'system_logs'), {
        timestamp: new Date().toISOString(),
        user: userName,
        action: `Shipment Returned for Correction by Engineer/Admin: ${request.quantity}x ${request.itemArticle} for ${request.office}. Remarks: ${remarks}`,
        module: 'Inventory Module'
      });

      alert("Shipment successfully returned for correction.");
    } catch (err) {
      console.error(err);
      alert("Failed to return shipment.");
    }
  };

  const handleFinalizeReceiving = async (request: any) => {
    if (!receivingCustodian) {
      alert("Please provide the name of the Person Responsible.");
      return;
    }

    // Role check for Engineer/Admin permissions
    if (userRole !== "ADMIN" && userRole !== "SUPPLY") {
      alert("Unauthorized Access: Only Administrators or Property Custodians are authorized to receive cargo.");
      return;
    }

    const timestamp = new Date().toISOString();
    const itemTitle = (request.itemArticle || request.title || "Equipment").trim();
    const qty = request.quantity || 1;
    const unitCost = request.unitCost !== undefined ? request.unitCost : (request.unitValue || 0);
    const amount = qty * unitCost;
    const isPRS = request.isPRS || request.requestType === "FINANCIAL" || !!request.slipNumber;
    const prsNumber = request.slipNumber || request.requestNumber || `PRS-${request.id.substring(0, 8).toUpperCase()}`;
    const targetOfficeName = request.targetOffice || request.office || "Municipal Engineering";
    const normalizeMatchValue = (value: unknown) => String(value || '').trim().toLowerCase();
    const normalizedItemTitle = normalizeMatchValue(itemTitle);
    const normalizedTargetOffice = normalizeMatchValue(targetOfficeName);

    try {
      // Query existing inventory items first to check for duplicates
      const itemsSnapshot = await getDocs(collection(db, 'inventory_items'));
      const existingItems = itemsSnapshot.docs.map(doc => ({
        docId: doc.id,
        ...doc.data()
      })) as any[];

      // Find LGU Master matching item
      let matchingMasterItem = existingItems.find(item => 
        (item.office === "LGU Master" || item.isFixedMaster === true) && 
        item.article && 
        normalizeMatchValue(item.article) === normalizedItemTitle
      );

      // Find Warehouse matching item
      let matchingOfficeItem = existingItems.find(item => 
        normalizeMatchValue(item.office) === normalizedTargetOffice &&
        item.article &&
        normalizeMatchValue(item.article) === normalizedItemTitle
      );
      let matchingWarehouseItem = existingItems.find(item =>
        normalizeMatchValue(item.office) === "warehouse" && item.article &&
        normalizeMatchValue(item.article) === normalizedItemTitle
      );

      // Find if we have an existing reports to prevent duplicate report sheets
      const reportsSnapshot = await getDocs(collection(db, 'reports'));
      const existingReports = reportsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      // Query existing master assets
      const masterSnapshot = await getDocs(collection(db, 'master_assets'));
      const existingMasters = masterSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];

      const canonicalMaster = existingMasters.find(master =>
        master.article && master.article.toUpperCase().trim() === itemTitle.toUpperCase().trim()
      );
      if (canonicalMaster) {
        matchingMasterItem = matchingMasterItem || existingItems.find(item => item.masterAssetId === canonicalMaster.id);
        matchingWarehouseItem = existingItems.find(item =>
          item.masterAssetId === canonicalMaster.id &&
          normalizeMatchValue(item.office) === 'warehouse'
        );
        matchingOfficeItem = existingItems.find(item =>
          item.masterAssetId === canonicalMaster.id &&
          normalizeMatchValue(item.office) === normalizedTargetOffice
        );
      }

      // Query existing rpcppes
      const rpcppeSnapshot = await getDocs(collection(db, 'rpcppes'));
      const existingRpcppes = rpcppeSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
      
      const isAsset = unitCost >= 50000;

      // Purchase requests for the same office received on the same (local) day share the same
      // Office Reports (one row per purchase request) and the same Procurement Request Slips documents
      const groupDate = new Date().toLocaleDateString('en-CA');
      const groupKeyFor = (formType: string) => `${formType}|${normalizedTargetOffice}|${groupDate}`;
      const findOfficeReport = (mode: string) =>
        existingReports.find(r => r.reportMode === mode && r.receivingGroupKey === groupKeyFor(mode)) ||
        existingReports.find(r =>
          r.reportMode === mode && !r.receivingGroupKey &&
          (r.prsNumber === prsNumber || r.id === request.id || r.prsNumber === request.id)
        );

      const matchedRpcppeReport = findOfficeReport('appendix73');

      const matchedParReport = findOfficeReport('par');

      const matchedIcsReport = findOfficeReport('ics');

      const matchedRrspReport = findOfficeReport('rrsp');

      const matchedSpcReport = findOfficeReport('spc');

      const matchedSplcReport = findOfficeReport('splc');

      const associatedFormType = isAsset ? 'PAR' : 'ICS';
      const associatedFormNo = isAsset 
        ? (matchedParReport ? (matchedParReport.parNo || matchedParReport.id) : `PAR-${prsNumber}`)
        : (matchedIcsReport ? (matchedIcsReport.icsNo || matchedIcsReport.id) : `ICS-${prsNumber}`);
      const associatedFormId = isAsset
        ? (matchedParReport ? matchedParReport.id : '')
        : (matchedIcsReport ? matchedIcsReport.id : '');

      // PAR/ICS slip auto-generated when this purchase request was submitted, if any
      const linkedSlipSnap = await getDocs(query(collection(db, 'requests'), where('originalRequisitionId', '==', request.id)));
      const linkedSlipDoc = linkedSlipSnap.docs.find(d => ['PAR', 'ICS'].includes(String(d.data().requestType || '').toUpperCase()));
      const linkedSlipRequest = linkedSlipDoc ? { id: linkedSlipDoc.id, ...linkedSlipDoc.data() } as any : null;

      // Purchase requests for the same office received on the same (local) day share one PAR/ICS, AIR and RIS
      const groupKeys = [groupKeyFor(associatedFormType), groupKeyFor('AIR'), groupKeyFor('RIS')];
      const groupSnap = await getDocs(query(collection(db, 'requests'), where('receivingGroupKey', 'in', groupKeys)));
      const groupDocIds: Record<string, string> = {};
      groupSnap.docs.forEach(d => { groupDocIds[d.data().receivingGroupKey] = d.id; });

      let registeredPropNo = "";

      // Run Transaction to perform atomic updates
      await runTransaction(db, async (transaction) => {
        // === 1. READS FIRST (ALL transaction.get calls MUST happen here) ===
        // Fetch request document
        const requestRef = isPRS 
          ? doc(db, "requests", request.id)
          : doc(db, "receiving_requests", request.id);

        const reqDocSnap = await transaction.get(requestRef);

        // Fetch matching inventory items up front
        const masterItemRef = matchingMasterItem ? doc(db, 'inventory_items', matchingMasterItem.docId) : null;
        const masterItemSnap = masterItemRef ? await transaction.get(masterItemRef) : null;

        const warehouseItemRef = matchingWarehouseItem ? doc(db, 'inventory_items', matchingWarehouseItem.docId) : null;
        const warehouseItemSnap = warehouseItemRef ? await transaction.get(warehouseItemRef) : null;

        const officeItemRef = matchingOfficeItem ? doc(db, 'inventory_items', matchingOfficeItem.docId) : null;
        const officeItemSnap = officeItemRef ? await transaction.get(officeItemRef) : null;

        // Fetch matching stock cards up front
        const masterStockRef = masterItemRef ? doc(db, 'stock_cards', masterItemRef.id) : null;
        const masterStockSnap = masterStockRef ? await transaction.get(masterStockRef) : null;

        const warehouseStockRef = warehouseItemRef ? doc(db, 'stock_cards', warehouseItemRef.id) : null;
        const warehouseStockSnap = warehouseStockRef ? await transaction.get(warehouseStockRef) : null;

        const officeStockRef = officeItemRef ? doc(db, 'stock_cards', officeItemRef.id) : null;
        const officeStockSnap = officeStockRef ? await transaction.get(officeStockRef) : null;

        // Pre-fetch reports up front
        const reportSnapsMap: { [id: string]: any } = {};
        const reportsToFetch = [
          matchedRpcppeReport,
          matchedParReport,
          matchedIcsReport,
          matchedRrspReport,
          matchedSpcReport,
          matchedSplcReport
        ].filter(Boolean);

        for (const rObj of reportsToFetch) {
          if (rObj && rObj.id && !reportSnapsMap[rObj.id]) {
            const rRef = doc(db, 'reports', rObj.id);
            const rSnap = await transaction.get(rRef);
            if (rSnap.exists()) {
              reportSnapsMap[rObj.id] = rSnap.data();
            }
          }
        }

        // Today's grouped PAR/ICS, AIR and RIS for this office, if they already exist
        const groupDocs: Record<string, { ref: any; data: any } | null> = {};
        for (const key of groupKeys) {
          const id = groupDocIds[key];
          if (!id) { groupDocs[key] = null; continue; }
          const ref = doc(db, 'requests', id);
          const snap = await transaction.get(ref);
          groupDocs[key] = snap.exists() ? { ref, data: snap.data() } : null;
        }

        // === 2. VALIDATION ===
        if (!reqDocSnap.exists()) {
          throw new Error("Request does not exist in the database.");
        }
        
        const reqData = reqDocSnap.data();
        const currentStatus = (reqData.status || "").toUpperCase().trim();
        const hasExistingRegisteredItem = Boolean(matchingMasterItem || matchingOfficeItem || matchingWarehouseItem);

        // Duplicate Prevention check: allow re-sync for a shipment whose item is already registered,
        // but still block a true duplicate receive when the request is already processed and no item exists.
        if ((currentStatus === 'COMPLETED' || currentStatus === 'RECEIVED') && !hasExistingRegisteredItem) {
          throw new Error("Shipment has already been received.");
        }

        // Validate that shipment is approved or pending delivery. The two review statuses come
        // from the retired Accounting approval step; requests left in them can be received now.
        const allowedStatuses = ["APPROVED", "PENDING DELIVERY", "PENDING_RECEIVING", "APPROVED FOR DELIVERY", "PENDING", "COMPLETED", "RECEIVED", "PENDING ACCOUNTING REVIEW", "PENDING ENGINEER/ADMIN REVIEW"];
        if (!allowedStatuses.includes(currentStatus) && !hasExistingRegisteredItem) {
          throw new Error(`This shipment cannot be received because its status is: ${reqData.status}`);
        }

        // === 3. WRITES SECOND (NO MORE transaction.get calls beyond this point) ===
        // Update Request status to Completed / RECEIVED
        transaction.update(requestRef, {
          status: isPRS ? "Completed" : "RECEIVED",
          receivedAt: timestamp,
          receivedBy: userName,
          actualReceivingDate: timestamp,
          actualReceivingUser: userName
        });

        const dateStr = timestamp.split('T')[0];
        const timeStr = new Date().toLocaleTimeString();
        const rpcppe = mapCategoryToRpcppeFields("Equipment", itemTitle);

        // Action A0: Create/Update Master Asset Record first inside transaction
        let masterAssetId = request.masterAssetId || reqData.masterAssetId || "";
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
          description: request.description || request.justification || request.details || `Received via Approved Supplier Cargo under PRS ${prsNumber}`,
          category: request.category || rpcppe.category || "Equipment",
          brand: request.brand || '',
          modelNumber: request.modelNumber || '',
          serialNumber: request.serialNumber || '',
          unitOfMeasure: 'unit',
          unitValue: unitCost,
          acquisitionCost: unitCost * qty,
          acquisitionDate: dateStr,
          supplier: request.supplier || '',
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

        // Function to create/update inventory item inside transaction using pre-fetched snaps
        const processInventoryItemUpdate = (
          matchingItem: any, 
          itemSnap: any,
          officeName: string, 
          personAccountableName: string,
          isMasterFlag: boolean = false
        ) => {
          let itemDocRef;
          let oldQty = 0;
          let currentHistory: any[] = [];
          let freshItemData: any = itemSnap && itemSnap.exists() ? itemSnap.data() : null;

          if (matchingItem) {
            itemDocRef = doc(db, 'inventory_items', matchingItem.docId);
            if (freshItemData) {
              oldQty = Number(freshItemData.qtyPhysicalCount) || 0;
              currentHistory = freshItemData.history || [];
            } else {
              oldQty = Number(matchingItem.qtyPhysicalCount) || 0;
              currentHistory = matchingItem.history || [];
            }
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
              action: (matchingItem || freshItemData)
                ? `Cargo Auto-Updated: Received ${qty} unit(s) via PRS ${prsNumber}. Total: ${newQty}` 
                : `Initial registration of physical cargo via PRS ${prsNumber}.`
            }
          ];

          // Generate brand new unique Property Number if it doesn't exist
          const propNo = freshItemData?.propertyNumber || matchingItem?.propertyNumber || finalPropertyNumber;

          const itemPayload: any = {
            masterAssetId,
            article: itemTitle.toUpperCase(),
            description: request.description || request.justification || request.details || `Received via Approved Supplier Cargo under PRS ${prsNumber}`,
            propertyNumber: propNo,
            assetCode: freshItemData?.assetCode || matchingItem?.assetCode || rpcppe.assetCode,
            usefulLife: freshItemData?.usefulLife || matchingItem?.usefulLife || rpcppe.usefulLife,
            category: freshItemData?.category || matchingItem?.category || request.category || rpcppe.category || "Equipment",
            classification: classifyAssetByValue(unitCost),
            unitOfMeasure: "unit",
            unitValue: unitCost,
            qtyPropertyCard: newQty,
            qtyPhysicalCount: newQty,
            office: officeName,
            personAccountable: personAccountableName.toUpperCase(),
            assignedStaff: personAccountableName.toUpperCase(),
            remarks: `Delivered and verified under PRS ${prsNumber}`,
            yearPurchased: new Date().getFullYear(),
            status: "AVAILABLE",
            condition: "Good",
            dateReceived: dateStr,
            updatedAt: timestamp,
            lastReceivedAt: timestamp,
            createdAt: freshItemData?.createdAt || matchingItem?.createdAt || timestamp,
            history: updatedHistory,
            associatedFormType,
            associatedFormId,
            associatedFormNo,
            acquisitionCost: unitCost * newQty,
          };

          if (isMasterFlag) {
            itemPayload.isFixedMaster = true;
            itemPayload.isFixed = true;
          }

          if (matchingItem || freshItemData) {
            transaction.update(itemDocRef, itemPayload);
          } else {
            transaction.set(itemDocRef, itemPayload);
          }

          return { itemId: itemDocRef.id, oldQty, newQty, propNo };
        };

        // Deposit into Designated Target Office Inventory (defaults to Warehouse if unassigned)
        const officeRes = processInventoryItemUpdate(matchingOfficeItem, officeItemSnap, targetOfficeName, receivingCustodian, false);
        registeredPropNo = officeRes.propNo;

        // Helper to record stock card & transaction sub-collection using pre-fetched snaps
        const recordStockCardAndTransaction = (
          itemId: string, 
          stockSnap: any,
          officeName: string, 
          oldQty: number, 
          newQty: number
        ) => {
          const stockCardRef = doc(db, 'stock_cards', itemId);
          const transactionNumber = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;

          const existingStockCard = stockSnap && stockSnap.exists() ? stockSnap.data() : null;

          // Update main stock card doc summary
          transaction.set(stockCardRef, {
            itemId,
            article: itemTitle.toUpperCase(),
            description: existingStockCard?.description || request.description || `Stock Card for ${itemTitle}`,
            supplier: request.supplier || 'N/A',
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
            supplier: request.supplier || 'N/A',
            beginningBalance: oldQty,
            remainingBalance: newQty,
            currentStock: newQty,
            office: officeName,
            officeAssignment: officeName,
            receivingOfficer: userName,
            unitCost: unitCost,
            totalCost: amount,
            user: userName
          });
        };

        // Action D: Update/Create Stock Card for Target Office
        recordStockCardAndTransaction(officeRes.itemId, officeStockSnap, targetOfficeName, officeRes.oldQty, officeRes.newQty);

        // Action E: Create/Update Receiving History record
        const recHistoryRef = doc(collection(db, 'receiving_history'));
        const txnNum = `TXN-${Math.floor(100000 + Math.random() * 900000)}`;
        transaction.set(recHistoryRef, {
          transactionNumber: txnNum,
          prsNumber: prsNumber,
          supplier: request.supplier || 'N/A',
          office: targetOfficeName,
          dateReceived: dateStr,
          receivedBy: userName,
          quantity: qty,
          remarks: request.description || `Cargo received atomically via PRS ${prsNumber}`,
          timestamp: timestamp
        });

        // Helper to create or update corresponding report sheets in reports collection using pre-fetched snaps
        const handleReportUpdateInTxn = (
          mode: string, 
          reportTypeLabel: string, 
          matchedReportObj: any, 
          formClassification: string
        ) => {
          let reportDocRef;
          let reportPayload: any;
          let freshReportData: any = matchedReportObj && reportSnapsMap[matchedReportObj.id] ? reportSnapsMap[matchedReportObj.id] : null;

          if (freshReportData || matchedReportObj) {
            const finalReportData = freshReportData || matchedReportObj;
            reportDocRef = doc(db, 'reports', matchedReportObj.id);
            const currentItems = finalReportData.items_snapshot || [];
            // One row per purchase request; receiving the same request again refreshes its row
            const existingItemIndex = currentItems.findIndex((i: any) => i.requestId === request.id);
            let updatedItems = [...currentItems];
            if (existingItemIndex > -1) {
              updatedItems[existingItemIndex] = {
                ...updatedItems[existingItemIndex],
                qtyPropertyCard: qty,
                qtyPhysicalCount: qty,
                unitValue: unitCost,
                propertyNumber: officeRes.propNo,
                remarks: `Auto-updated on receiving cargo under PRS ${prsNumber}`,
                masterAssetId,
              };
            } else {
              updatedItems.push({
                tempId: Math.random().toString(36).substr(2, 9),
                requestId: request.id,
                datePurchased: request.datePurchased || '',
                masterAssetId,
                article: itemTitle.toUpperCase(),
                description: request.description || request.justification || request.details || `Received via PRS ${prsNumber}`,
                propertyNumber: officeRes.propNo,
                unitOfMeasure: "unit",
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
                ...(finalReportData.history || []),
                {
                  id: Math.random().toString(36).substr(2, 9),
                  timestamp,
                  action: 'Auto-Updated',
                  details: `${mode.toUpperCase()} automatically updated with additional cargo for PRS ${prsNumber}.`
                }
              ]
            };

            if (mode === 'par' && !finalReportData.parNo) reportPayload.parNo = `PAR-${prsNumber}`;
            if (mode === 'ics' && !finalReportData.icsNo) reportPayload.icsNo = `ICS-${prsNumber}`;
            if (mode === 'rrsp' && !finalReportData.rrspNo) {
              reportPayload.rrspNo = `RRSP-${prsNumber}`;
              reportPayload.rrspDate = dateStr;
            }
            if (mode === 'spc' && !finalReportData.spcStockNo) {
              reportPayload.spcStockNo = `ST-${prsNumber}`;
              reportPayload.spcUnitCost = unitCost;
            }
            if (mode === 'splc' && !finalReportData.splcStockNo) {
              reportPayload.splcStockNo = `ST-${prsNumber}`;
              reportPayload.splcUnitCost = unitCost;
            }

            transaction.update(reportDocRef, reportPayload);
          } else {
            reportDocRef = doc(collection(db, 'reports'));
            reportPayload = {
              report_type: reportTypeLabel,
              fund_cluster: '01',
              report_date: dateStr,
              accountable_person: receivingCustodian.toUpperCase(),
              accountable_position: 'Accountable Officer',
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
                  requestId: request.id,
                  datePurchased: request.datePurchased || '',
                  masterAssetId,
                  article: itemTitle.toUpperCase(),
                  description: request.description || request.justification || request.details || `Received via PRS ${prsNumber}`,
                  propertyNumber: officeRes.propNo,
                  unitOfMeasure: "unit",
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
              receivingGroupKey: groupKeyFor(mode),
              receivingOffice: targetOfficeName,
              created_at: timestamp
            };

            if (mode === 'par') {
              reportPayload.parNo = `PAR-${prsNumber}`;
              reportPayload.parDate = dateStr;
            } else if (mode === 'ics') {
              reportPayload.icsNo = `ICS-${prsNumber}`;
              reportPayload.icsDate = dateStr;
            } else if (mode === 'rrsp') {
              reportPayload.rrspNo = `RRSP-${prsNumber}`;
              reportPayload.rrspDate = dateStr;
            } else if (mode === 'spc') {
              reportPayload.spcStockNo = `ST-${prsNumber}`;
              reportPayload.spcUnitCost = unitCost;
              reportPayload.spcReorderLevel = '50';
              reportPayload.spcNotedBy = 'MARIA S. REYES';
            } else if (mode === 'splc') {
              reportPayload.splcStockNo = `ST-${prsNumber}`;
              reportPayload.splcUnitCost = unitCost;
              reportPayload.splcAccountCode = '5020301040';
              reportPayload.splcApprovedBy = 'Accounting Office';
            }

            transaction.set(reportDocRef, reportPayload);
          }
          return reportDocRef.id;
        };

        // --- Revision 3: Automatic RPCPPE & Master Asset Update ---
        if (isAsset) {
          // Find if an RPCPPE record already exists for this inventory item or property number to prevent duplicate entries
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
            inventoryItemId: officeRes.itemId, // Reference to existing Inventory Record
            masterAssetId: masterAssetId, // Reference to existing Master Asset Record
            propertyNumber: officeRes.propNo,
            article: itemTitle.toUpperCase(),
            description: request.description || request.justification || request.details || `Received via Approved Supplier Cargo under PRS ${prsNumber}`,
            category: request.category || rpcppe.category || "Equipment",
            unitValue: unitCost,
            qtyPropertyCard: officeRes.newQty,
            qtyPhysicalCount: officeRes.newQty,
            office: targetOfficeName,
            personAccountable: receivingCustodian.toUpperCase(),
            status: "AVAILABLE",
            condition: "Good",
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
        }

        // Action F: Automatically compile/update reports
        // 1. RPCPPE report (Appendix 73)
        await handleReportUpdateInTxn('appendix73', 'PROPERTY, PLANT AND EQUIPMENT', matchedRpcppeReport, isAsset ? 'PAR' : 'ICS');

        // 2. Office Reports (PAR or ICS based on asset threshold)
        const officeFormReportId = isAsset
          // Property Acknowledgement Receipt (PAR)
          ? handleReportUpdateInTxn('par', 'PROPERTY ACKNOWLEDGEMENT RECEIPT', matchedParReport, 'PAR')
          // Inventory Custodian Slip (ICS)
          : handleReportUpdateInTxn('ics', 'INVENTORY CUSTODIAN SLIP', matchedIcsReport, 'ICS');

        // 2b-2d. PAR/ICS slip, Acceptance and Inspection Report (AIR) and Requisition and Issue Slip (RIS)
        // on the Procurement Request Slips page. Each purchase request is one row; requests for the same
        // office received on the same day are added to the same documents.
        const formRow = {
          id: officeRes.itemId,
          requestId: request.id,
          article: itemTitle.toUpperCase(),
          description: request.description || request.justification || request.details || '',
          propertyNumber: officeRes.propNo,
          unitValue: unitCost,
          qtyPhysicalCount: qty,
          qtyPropertyCard: qty,
          unitOfMeasure: request.unit || 'pcs',
          dateReceived: groupDate,
          datePurchased: request.datePurchased || '',
          personAccountable: receivingCustodian.toUpperCase(),
        };
        const newHistoryEntry = (action: string, details: string) => ({
          id: Math.random().toString(36).substr(2, 9),
          timestamp,
          action,
          details,
        });

        // Adds this purchase request as a row to today's grouped document, or creates the document
        const addRowToGroupedForm = (formType: string, newDocFields: any, historyEntry: any, extraUpdates: any = {}) => {
          const key = groupKeyFor(formType);
          const existing = groupDocs[key];
          if (existing) {
            const rows = [...(existing.data.items_snapshot || []).filter((row: any) => row.requestId !== request.id), formRow];
            const requestIds = Array.from(new Set([...(existing.data.purchaseRequestIds || []), request.id]));
            transaction.update(existing.ref, {
              ...extraUpdates,
              items_snapshot: rows,
              purchaseRequestIds: requestIds,
              itemArticle: rows.length > 1 ? `${rows[0].article} + ${rows.length - 1} more` : rows[0].article,
              quantity: rows.reduce((sum: number, row: any) => sum + (Number(row.qtyPhysicalCount) || 0), 0),
              amount: rows.reduce((sum: number, row: any) => sum + (Number(row.qtyPhysicalCount) || 0) * (Number(row.unitValue) || 0), 0),
              history: [...(existing.data.history || []), historyEntry],
              updatedAt: timestamp,
            });
            return;
          }
          transaction.set(doc(collection(db, 'requests')), {
            ...newDocFields,
            ...extraUpdates,
            receivingGroupKey: key,
            purchaseRequestIds: [request.id],
            itemArticle: formRow.article,
            category: request.category || rpcppe.category || 'Equipment',
            office: targetOfficeName,
            originatingOffice: request.office || targetOfficeName,
            quantity: qty,
            amount,
            unitCost,
            items_snapshot: [formRow],
            requestedAt: timestamp,
            history: [historyEntry],
          });
        };

        // PAR/ICS slip. Items are already registered, so it is recorded as APPROVED
        // (approving it again would add the stock twice).
        addRowToGroupedForm(associatedFormType, {
          requestType: associatedFormType,
          requestNumber: `${associatedFormType}-${groupDate.slice(0, 4)}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          masterAssetId,
          targetOffice: targetOfficeName,
          requestedBy: receivingCustodian.toUpperCase(),
          assignedAdmin: 'Engineer / GSO Admin',
          justification: `${associatedFormType} for items received by ${targetOfficeName} on ${groupDate}.`,
          reportId: officeFormReportId,
          originalRequisitionId: request.id,
        }, newHistoryEntry('Received & Registered', `"${itemTitle}" (Qty: ${qty}) received and registered by ${userName} under Property No. ${officeRes.propNo}, accountable: ${receivingCustodian.toUpperCase()}.`), {
          status: 'APPROVED',
          handledBy: `${userName} (Admin)`,
          handledAt: timestamp,
          responseRemarks: `Items received and registered on ${groupDate}.`,
          receivedAt: timestamp,
          receivedBy: userName,
        });
        // The pending slip made when this purchase request was submitted is now covered by the grouped slip
        if (linkedSlipRequest) {
          transaction.delete(doc(db, 'requests', linkedSlipRequest.id));
        }

        // Acceptance and Inspection Report (AIR)
        addRowToGroupedForm('AIR', {
          requestType: 'AIR',
          requestNumber: `AIR-${groupDate.slice(0, 4)}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          status: 'Completed',
          supplier: request.supplier && request.supplier !== 'N/A' ? request.supplier : '',
          poNumber: request.poNumber || '',
          invoiceNumber: request.invoiceNumber || '',
          justification: `Items received by ${targetOfficeName} on ${groupDate}.`,
          dateReceived: groupDate,
          dateInspected: groupDate,
          acceptanceStatus: 'Complete',
          datePurchased: request.datePurchased || '',
          propertyOfficer: receivingCustodian.toUpperCase(),
          propertyOfficerPosition: '',
          inspectionOfficer: userName,
          inspectionOfficerPosition: userPosition || '',
          requestedBy: userName,
          handledBy: `${userName} (Admin)`,
          handledAt: timestamp,
          originalRequisitionId: request.id,
          // Not stored as reportId: the Reports page syncs every request whose reportId matches a PAR/ICS report
          linkedFormReportId: officeFormReportId,
        }, newHistoryEntry('Inspected & Accepted', `"${itemTitle}" (Qty: ${qty}) inspected by ${userName} and accepted as complete. Property Officer: ${receivingCustodian.toUpperCase()}.`));

        // Requisition and Issue Slip (RIS)
        addRowToGroupedForm('RIS', {
          requestType: 'RIS',
          requestNumber: `RIS-${groupDate.slice(0, 4)}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
          status: 'Completed',
          division: '',
          responsibilityCenterCode: '',
          saiNumber: '',
          risDate: groupDate,
          justification: `Items issued to ${targetOfficeName} on ${groupDate}.`,
          requestedByName: request.requestedBy || request.targetOfficeHead || '',
          requestedByPosition: '',
          approvedByName: '',
          approvedByPosition: 'Municipal Mayor',
          issuedByName: userName,
          issuedByPosition: userPosition || '',
          receivedByName: receivingCustodian.toUpperCase(),
          receivedByPosition: '',
          requestedBy: userName,
          handledBy: `${userName} (Admin)`,
          handledAt: timestamp,
          originalRequisitionId: request.id,
          // Not stored as reportId: the Reports page syncs every request whose reportId matches a PAR/ICS report
          linkedFormReportId: officeFormReportId,
        }, newHistoryEntry('Issued', `"${itemTitle}" (Qty: ${qty}) issued by ${userName} to ${targetOfficeName}, received by ${receivingCustodian.toUpperCase()}.`));

        // 3. Receiving Report (rrsp) - Always updated for all items
        await handleReportUpdateInTxn('rrsp', 'RECEIVING REPORT FOR SUPPLIES & PROPERTY', matchedRrspReport, isAsset ? 'PAR' : 'ICS');

        // 4. Inventory Reports (spc)
        await handleReportUpdateInTxn('spc', 'SUPPLIES PROPERTY CARD', matchedSpcReport, isAsset ? 'PAR' : 'ICS');

        // 5. Stock Reports (splc)
        await handleReportUpdateInTxn('splc', 'SUPPLIES LEDGER CARD', matchedSplcReport, isAsset ? 'PAR' : 'ICS');

        // Record standard inventory transactions for history across three layers
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

        recordInventoryTransactionHistory(officeRes.itemId, targetOfficeName, officeRes.oldQty, officeRes.newQty);

        // Record 5 distinct history logs into system_logs inside transaction
        const actionsToLog = [
          { actionName: "Shipment received", logText: `Supplier cargo under PRS ${prsNumber} marked as RECEIVED.` },
          { actionName: "Inventory updated", logText: `Master, Warehouse, and ${targetOfficeName} inventory accounts automatically incremented.` },
          { actionName: "Stock card updated", logText: `Ledger stock card transactions generated for item: "${itemTitle}".` },
          { actionName: "RPCPPE updated", logText: `Automated inventory reports compiling asset thresholds synchronized.` },
          { actionName: "Database updated", logText: `System physical count registers updated atomically.` }
        ];

        actionsToLog.forEach(itemLog => {
          const sysLogRef = doc(collection(db, 'system_logs'));
          transaction.set(sysLogRef, {
            user: userName,
            office: targetOfficeName,
            date: dateStr,
            time: timeStr,
            action: itemLog.actionName,
            reference: prsNumber,
            status: "Success",
            timestamp,
            module: "Inventory Module",
            details: itemLog.logText
          });
        });

        // Set up notifications for both Accounting and Engineer/Admin
        const notifAccountingRef = doc(collection(db, 'notifications'));
        transaction.set(notifAccountingRef, {
          recipientRole: 'ACCOUNTING',
          message: `Shipment successfully received and registered: Item "${itemTitle}" (Qty: ${qty}) under PRS ${prsNumber}.`,
          timestamp,
          isRead: false,
          type: 'RECEIPT',
          reportId: request.id
        });

        const notifAdminRef = doc(collection(db, 'notifications'));
        transaction.set(notifAdminRef, {
          recipientRole: 'ADMIN',
          message: `Inventory successfully updated: Item "${itemTitle}" (Qty: ${qty}) added to Warehouse and ${targetOfficeName} inventories.`,
          timestamp,
          isRead: false,
          type: 'INVENTORY_UPDATE',
          reportId: request.id
        });

        // Write to access logs as audit trail
        const auditLogRef = doc(collection(db, 'access_logs'));
        transaction.set(auditLogRef, {
          userId: userName,
          user: userName,
          role: userRole,
          department: targetOfficeName,
          ip: "Cloud Node",
          device: navigator.userAgent || "Web Browser",
          timestamp,
          status: "Success",
          action: `Supplier Cargo Received & Registered: ${qty}x ${itemTitle} under PRS ${prsNumber}`,
          previousStatus: request.status || "APPROVED",
          newStatus: isPRS ? "Completed" : "RECEIVED"
        });
      });

      alert(
        `Success! "${itemTitle}" registered and automated reports (RPCPPE, ${associatedFormType}) compiled successfully under Property Number: ${registeredPropNo}. The ${associatedFormType} slip, the Acceptance and Inspection Report and the Requisition and Issue Slip are on the Procurement Request Slips page.`,
      );
      setReceivingItem(null);
      setReceivingCustodian("");
    } catch (err: any) {
      console.error(err);
      alert(`Failed to receive supplier shipment: ${err.message}`);
    }
  };

  const handleApproveAssetRequest = async (
    req: AssetRequest,
    remarks: string,
  ) => {
    try {
      const docRef = doc(db, "requests", req.id);
      await updateDoc(docRef, {
        status: "APPROVED",
        responseRemarks:
          remarks || "Approved and allocation cleared by GSO Admin.",
        handledBy: `${userName} (Admin)`,
        handledAt: new Date().toISOString(),
      });

      await addDoc(collection(db, "system_logs"), {
        timestamp: new Date().toISOString(),
        user: userName,
        action: `Asset Request APPROVED by Admin: ${req.quantity}x ${req.itemArticle} for ${req.office}`,
        module: "Accounting Requests",
      });

      alert("Request approved successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to approve request.");
    }
  };

  const handleForwardAssetRequest = async (
    req: AssetRequest,
    remarks: string,
  ) => {
    try {
      const docRef = doc(db, "requests", req.id);
      await updateDoc(docRef, {
        status: "FORWARDED",
        responseRemarks:
          remarks || "Certified & forwarded to Admin for approval.",
        handledBy: `${userName} (Supply)`,
        handledAt: new Date().toISOString(),
      });

      await addDoc(collection(db, "system_logs"), {
        timestamp: new Date().toISOString(),
        user: userName,
        action: `Asset Request FORWARDED to Admin: ${req.quantity}x ${req.itemArticle} for ${req.office}`,
        module: "Accounting Requests",
      });

      alert("Request forwarded to GSO Admin successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to forward request.");
    }
  };

  const handleDeclineAssetRequest = async (
    req: AssetRequest,
    remarks: string,
  ) => {
    try {
      const docRef = doc(db, "requests", req.id);
      await updateDoc(docRef, {
        status: "DECLINED",
        responseRemarks: remarks || "Declined/Withheld.",
        handledBy: `${userName} (${userRole === "ADMIN" ? "Admin" : "Supply"})`,
        handledAt: new Date().toISOString(),
      });

      await addDoc(collection(db, "system_logs"), {
        timestamp: new Date().toISOString(),
        user: userName,
        action: `Asset Request DECLINED: ${req.quantity}x ${req.itemArticle} for ${req.office}`,
        module: "Accounting Requests",
      });

      alert("Request returned / withheld successfully.");
    } catch (err) {
      console.error(err);
      alert("Failed to decline request.");
    }
  };
  const [yearFilter, setYearFilter] = useState("");
  const [archiveReasonFilter, setArchiveReasonFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [archiveQuantity, setArchiveQuantity] = useState(1);
  const [archiveCause, setArchiveCause] = useState('Damaged');
  const [damageArchiveItem, setDamageArchiveItem] = useState<InventoryItem | null>(null);
  const [damageArchiveQuantity, setDamageArchiveQuantity] = useState('1');
  const [damageArchiveSubmitting, setDamageArchiveSubmitting] = useState(false);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | "bulk" | null>(
    null,
  );
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [detailItem, setDetailItem] = useState<InventoryItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showQRModal, setShowQRModal] = useState<InventoryItem | "bulk" | null>(
    null,
  );
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  // Borrowing and Returning flows
  const [borrowModalItem, setBorrowModalItem] = useState<InventoryItem | null>(null);
  const [borrowerName, setBorrowerName] = useState("");

  const handleBorrowItem = async () => {
    if (!borrowModalItem || !borrowerName.trim()) return;
    const timestamp = new Date().toISOString();
    try {
      await onUpdateItem(borrowModalItem.id, {
        status: "BORROWED",
        borrowerName: borrowerName.trim(),
        borrowedDate: timestamp
      });

      await addDoc(collection(db, "system_logs"), {
        timestamp,
        user: userName,
        action: `Lent Asset item "${borrowModalItem.article}" to borrower: ${borrowerName.trim()}`,
        module: "Inventory Module"
      });

      alert(`Success! Item "${borrowModalItem.article}" is now marked as BORROWED to ${borrowerName.trim()}.`);
      setBorrowModalItem(null);
      setBorrowerName("");
    } catch (err) {
      console.error("Borrow error:", err);
      alert("Failed to mark item as borrowed.");
    }
  };

  const handleReturnItem = async (item: InventoryItem) => {
    const timestamp = new Date().toISOString();
    const prevBorrower = item.borrowerName || "Unknown Borrower";
    try {
      await onUpdateItem(item.id, {
        status: "AVAILABLE",
        borrowerName: "",
        borrowedDate: ""
      });

      await addDoc(collection(db, "system_logs"), {
        timestamp,
        user: userName,
        action: `Received Returned Asset: "${item.article}" returned by ${prevBorrower}. Back in active inventory.`,
        module: "Inventory Module"
      });

      alert(`Success! Returned item "${item.article}" is now back in the available inventory.`);
    } catch (err) {
      console.error("Return error:", err);
      alert("Failed to record return.");
    }
  };

  const handleBulkOfficeTransfer = async (targetOffice: string) => {
    if (selectedIds.size === 0 || !targetOffice) return;
    const timestamp = new Date().toISOString();
    try {
      setIsDeleting(true);
      for (const id of selectedIds) {
        const itemObj = items.find(i => i.id === id);
        const oldOffice = itemObj?.office || "Unknown Office";
        await onUpdateItem(id, { office: targetOffice });
        await addDoc(collection(db, "system_logs"), {
          timestamp,
          user: userName,
          action: `Bulk target office transfer on item "${itemObj?.article || id}" from ${oldOffice} to: ${targetOffice}`,
          module: "Inventory Module"
        });
      }
      alert(`Success! Successfully transferred ${selectedIds.size} items to office: "${targetOffice}".`);
      setSelectedIds(new Set());
    } catch (err) {
      console.error("[Bulk Transfer Error]:", err);
      alert("Failed to transfer bulk office items.");
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownloadSingleQR = (item: InventoryItem) => {
    const svgElement = document.getElementById(`inventory-qr-${item.id}`) as unknown as SVGElement | null;
    if (!svgElement) {
      alert("Could not load QR code graphic element on screen.");
      return;
    }

    try {
      const svgString = new XMLSerializer().serializeToString(svgElement);
      const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const URLObj = window.URL || (window as any).webkitURL;
      const blobURL = URLObj.createObjectURL(svgBlob);
      const image = new Image();
      
      image.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const context = canvas.getContext('2d');
        if (context) {
          context.fillStyle = '#FFFFFF';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          
          const pngURL = canvas.toDataURL('image/png');
          const downloadLink = document.createElement('a');
          downloadLink.href = pngURL;
          downloadLink.download = `LGU_TIBIAO_QR_${item.propertyNumber}.png`;
          document.body.appendChild(downloadLink);
          downloadLink.click();
          document.body.removeChild(downloadLink);
        }
        URLObj.revokeObjectURL(blobURL);
      };
      
      image.src = blobURL;
    } catch (err) {
      console.error("QR Code Download Error:", err);
      alert("Export failed.");
    }
  };

  const handleDownloadAllQRs = (itemsToDownload: InventoryItem[]) => {
    if (itemsToDownload.length === 0) return;
    itemsToDownload.forEach((item, index) => {
      setTimeout(() => {
        handleDownloadSingleQR(item);
      }, index * 250);
    });
  };

  // Rapid entry state
  const [showRapidEntry, setShowRapidEntry] = useState(false);
  const [rapidItem, setRapidItem] = useState({
    article: "",
    propNo: "",
    value: "",
    category: CATEGORIES[0],
    office: "",
    condition: "Good" as 'Good' | 'Damaged' | 'Expired',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const emptyItem: Partial<InventoryItem> = {
    article: "",
    description: "",
    propertyNumber: "",
    assetCode: "",
    unitOfMeasure: "unit",
    unitValue: 0,
    qtyPropertyCard: 0,
    qtyPhysicalCount: 0,
    reorderPoint: 0,
    category: CATEGORIES[0],
    office: offices[0]?.name || "",
    remarks: "",
    imageUrls: [],
    yearPurchased: new Date().getFullYear(),
    personAccountable: "",
    assignedStaff: "",
    status: "AVAILABLE",
    condition: "Good",
    serialNumber: "",
    modelNumber: "",
    dateAssigned: "",
    dateReceived: "",
    warrantyExpiration: "",
    expirationDate: "",
    supplier: "",
    acquisitionMethod: "",
    purchaseOrderNumber: "",
    fundingSource: "",
  };

  const [formItem, setFormItem] = useState<Partial<InventoryItem>>(emptyItem);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadFilesSize, setUploadFilesSize] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [showArchivedItems, setShowArchivedItems] = useState(false);

  const handleArchiveItem = async (item: InventoryItem, reason?: 'EXPIRED' | 'DAMAGED' | 'MANUAL', quantityOverride?: number) => {
    if (userRole !== UserRole.ADMIN) {
      alert("Unauthorized: Only administrators can archive inventory items.");
      return;
    }
    if (item.isArchived) return;
    const archiveReason: 'EXPIRED' | 'DAMAGED' | 'MANUAL' = reason || 'DAMAGED';
    const currentQuantity = Math.max(0, Number(item.qtyPhysicalCount) || 0);
    if (currentQuantity < 1) {
      alert('This inventory record has no active quantity available to archive.');
      return;
    }

    if (quantityOverride === undefined) {
      setDamageArchiveItem(item);
      setDamageArchiveQuantity('1');
      return;
    }
    const quantityToArchive = Math.floor(quantityOverride);
    if (quantityToArchive < 1 || quantityToArchive > currentQuantity) {
      alert(`Enter an archive quantity from 1 to ${currentQuantity}.`);
      return;
    }
    const timestamp = new Date().toISOString();
    const archiveHistory = [...(item.history || []), {
        id: Math.random().toString(36).substr(2, 9),
        timestamp,
        user: userName,
        action: `Archived ${quantityToArchive} unit(s) as DAMAGED`,
        field: "Archive Status",
        oldValue: item.status || "ACTIVE",
        newValue: archiveReason,
      }];
    const remainingQuantity = currentQuantity - quantityToArchive;

    if (remainingQuantity === 0) {
      await onUpdateItem(item.id, {
        isArchived: true,
        archivedAt: timestamp,
        archivedBy: userName,
        archiveReason,
        status: "RETIRED",
        condition: "Damaged",
        history: archiveHistory,
      });
    } else {
      const { id: omittedId, ...archivedItem } = item;
      await addDoc(collection(db, 'inventory_items'), {
        ...archivedItem,
        qtyPhysicalCount: quantityToArchive,
        qtyPropertyCard: Math.min(Number(item.qtyPropertyCard) || currentQuantity, quantityToArchive),
        isArchived: true,
        archivedAt: timestamp,
        archivedBy: userName,
        archiveReason,
        status: "RETIRED",
        condition: "Damaged",
        history: archiveHistory,
      });
      await onUpdateItem(item.id, {
        qtyPhysicalCount: remainingQuantity,
        qtyPropertyCard: Math.max(0, (Number(item.qtyPropertyCard) || currentQuantity) - quantityToArchive),
        condition: item.condition,
        history: [
          ...(item.history || []),
          {
            id: Math.random().toString(36).substr(2, 9),
            timestamp,
            user: userName,
            action: `Reduced active quantity by ${quantityToArchive} unit(s) after DAMAGED archive`,
            field: 'Quantity',
            oldValue: currentQuantity,
            newValue: remainingQuantity,
          },
        ],
      });
    }

    await addDoc(collection(db, "system_logs"), {
      timestamp,
      user: userName,
      action: `Archived ${quantityToArchive} damaged unit(s) of asset: ${item.article} (${item.propertyNumber || ""}); ${remainingQuantity} unit(s) remain active`,
      module: "Inventory Module",
    });
  };

  const handleArchiveFromUpdate = async () => {
    if (userRole !== UserRole.ADMIN || !editingId) return;

    const item = items.find((inventoryItem) => inventoryItem.id === editingId);
    if (!item || item.isArchived) return;

    const editedItem = {
      ...item,
      condition: formItem.condition || item.condition,
      expirationDate: formItem.expirationDate || item.expirationDate,
    } as InventoryItem;
    const currentQuantity = Number(item.qtyPhysicalCount) || 0;
    const quantityToArchive = Math.floor(Number(archiveQuantity));
    if (editedItem.condition !== 'Damaged' && !isExpiredInventoryItem(editedItem)) {
      alert('Only damaged or expired items can be archived.');
      return;
    }
    if (quantityToArchive < 1 || quantityToArchive > currentQuantity) {
      alert(`Enter an archive quantity from 1 to ${currentQuantity}.`);
      return;
    }
    if (!archiveCause.trim()) {
      alert('Please provide the cause for archiving this quantity.');
      return;
    }
    if (!confirm(`Archive ${quantityToArchive} unit(s) of "${item.article}"?`)) return;

    const timestamp = new Date().toISOString();
    const archiveReason: 'EXPIRED' | 'DAMAGED' = isExpiredInventoryItem(editedItem) ? 'EXPIRED' : 'DAMAGED';
    const remainingQuantity = currentQuantity - quantityToArchive;
    const archiveHistory = [...(item.history || []), {
      id: Math.random().toString(36).substr(2, 9),
      timestamp,
      user: userName,
      action: `Archived ${quantityToArchive} unit(s) from active inventory`,
      field: 'Archive Cause',
      oldValue: currentQuantity,
      newValue: `${archiveReason}: ${archiveCause.trim()}`,
    }];

    try {
      if (remainingQuantity === 0) {
        await onUpdateItem(item.id, {
          isArchived: true,
          archivedAt: timestamp,
          archivedBy: userName,
          archiveReason,
          status: 'RETIRED',
          condition: editedItem.condition,
          history: archiveHistory,
          remarks: `${item.remarks || ''} Archive cause: ${archiveCause.trim()}`.trim(),
        });
      } else {
        const { id: omittedId, ...archivedItem } = editedItem;
        await addDoc(collection(db, 'inventory_items'), {
          ...archivedItem,
          qtyPhysicalCount: quantityToArchive,
          qtyPropertyCard: Math.min(Number(item.qtyPropertyCard) || currentQuantity, quantityToArchive),
          isArchived: true,
          archivedAt: timestamp,
          archivedBy: userName,
          archiveReason,
          status: 'RETIRED',
          remarks: `${item.remarks || ''} Archive cause: ${archiveCause.trim()}`.trim(),
          history: archiveHistory,
        });
        await onUpdateItem(item.id, {
          qtyPhysicalCount: remainingQuantity,
          qtyPropertyCard: Math.max(0, (Number(item.qtyPropertyCard) || currentQuantity) - quantityToArchive),
          condition: editedItem.condition,
          history: [...(item.history || []), {
            id: Math.random().toString(36).substr(2, 9),
            timestamp,
            user: userName,
            action: `Reduced active quantity by ${quantityToArchive} unit(s) for archive`,
            field: 'Quantity',
            oldValue: currentQuantity,
            newValue: remainingQuantity,
          }],
        });
      }

      await addDoc(collection(db, 'system_logs'), {
        timestamp,
        user: userName,
        action: `Archived ${quantityToArchive} unit(s) of ${item.article}: ${archiveCause.trim()}`,
        module: 'Inventory Module',
      });
      setShowModal(false);
      setEditingId(null);
    } catch (error) {
      console.error('Partial archive failed:', error);
      alert('Failed to archive the selected quantity.');
    }
  };

  // Live Camera Photo Verification States
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const stopCameraStream = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setCameraActive(false);
  };

  const startCamera = async () => {
    if ((formItem.imageUrls || []).length >= 3) {
      alert("A maximum of 3 images can be attached per physical asset.");
      return;
    }
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      setCameraStream(stream);
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 100);
    } catch (err: any) {
      console.error("Camera stream initialization failed:", err);
      setCameraError(
        "Could not access camera. Please check permissions or use standard camera upload below."
      );
      setCameraActive(false);
    }
  };

  const captureCameraPhoto = () => {
    if (!videoRef.current) return;
    if ((formItem.imageUrls || []).length >= 3) {
      alert("A maximum of 3 images can be attached per physical asset.");
      stopCameraStream();
      return;
    }
    try {
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        const currentUrls = [...(formItem.imageUrls || [])];
        currentUrls.push(dataUrl);
        setFormItem({ ...formItem, imageUrls: currentUrls });
        stopCameraStream();
      }
    } catch (err) {
      console.error("Failed to capture image:", err);
      alert("Failed to capture photo from video stream.");
    }
  };

  useEffect(() => {
    if (!showModal) {
      stopCameraStream();
    }
  }, [showModal]);

  useEffect(() => {
    if (cameraActive && cameraStream && videoRef.current) {
      videoRef.current.srcObject = cameraStream;
    }
  }, [cameraActive, cameraStream]);

  // Filter items by archive state, office, year, and search
  const filteredItems = items.filter((item) => {
    if (Boolean(item.isArchived) !== showArchivedItems) return false;
    const matchesSearch =
      (item.article || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.propertyNumber || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.category || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.assignedStaff &&
        item.assignedStaff.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.personAccountable &&
        item.personAccountable
          .toLowerCase()
          .includes(searchTerm.toLowerCase())) ||
      (item.condition &&
        item.condition.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.assetCode &&
        item.assetCode.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.archiveReason &&
        item.archiveReason.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesOffice = officeFilter ? item.office === officeFilter : true;
    const matchesYear = yearFilter
      ? String(item.yearPurchased) === yearFilter
      : true;
    const matchesArchiveReason = archiveReasonFilter
      ? item.archiveReason === archiveReasonFilter
      : true;
    return (
      matchesSearch && matchesOffice && matchesYear && matchesArchiveReason
    );
  }).sort((firstItem, secondItem) => {
    const getLatestActivity = (item: InventoryItem) => Math.max(
      Date.parse((item as any).lastReceivedAt || '') || 0,
      Date.parse((item as any).updatedAt || '') || 0,
      Date.parse(item.dateReceived || '') || 0,
      Date.parse(item.createdAt || '') || 0,
    );

    return getLatestActivity(secondItem) - getLatestActivity(firstItem);
  });

  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const openAddModal = () => {
    if (userRole === UserRole.STAFF || userRole === UserRole.ACCOUNTING) {
      alert(
        "Unauthorized: Guest/Staff/Accounting roles are restricted from adding assets.",
      );
      return;
    }
    setIsEditMode(false);
    setEditingId(null);
    setFormItem(emptyItem);
    setShowModal(true);
  };

  const openEditModal = (item: InventoryItem) => {
    if (userRole === UserRole.STAFF || userRole === UserRole.ACCOUNTING) {
      alert(
        "Unauthorized: Guest/Staff/Accounting roles are restricted from editing assets.",
      );
      return;
    }
    setIsEditMode(true);
    setEditingId(item.id);
    setArchiveQuantity(1);
    setArchiveCause(item.condition === 'Damaged' ? 'Damaged' : 'Other');
    setFormItem({ ...item });
    setShowModal(true);
  };

  const handleRapidSave = async () => {
    if (!rapidItem.article) return;
    const newItem: Partial<InventoryItem> = {
      article: rapidItem.article.toUpperCase(),
      description: "Rapidly added via system interface.",
      propertyNumber: rapidItem.propNo.toUpperCase(),
      unitOfMeasure: "unit",
      unitValue: Number(rapidItem.value) || 0,
      qtyPropertyCard: 0,
      qtyPhysicalCount: 1,
      category: rapidItem.category,
      office: rapidItem.office || officeFilter || offices[0]?.name || "Municipal Hall",
      remarks: "Rapid Entry",
      yearPurchased: new Date().getFullYear(),
      personAccountable: "TBD",
      assignedStaff: "TBD",
      status: "AVAILABLE",
      condition: rapidItem.condition || "Brand New",
      classification: (Number(rapidItem.value) || 0) >= 50000 ? 'PAR' : 'ICS',
    };

    const officeAwareDup = items.find((item) =>
      isOfficeAwareDuplicateInventoryItem(newItem, item),
    );
    if (officeAwareDup) {
      alert(
        `Validation Error: Asset "${newItem.article}" already exists in office "${newItem.office || "Unassigned"}". Please register the same item separately per office location.`,
      );
      return;
    }

    // Check duplicate property number in Rapid save
    const rapidPropNoDup = newItem.propertyNumber?.trim()
      ? items.find(
          (item) =>
            (item.propertyNumber || "").toLowerCase() ===
            newItem.propertyNumber?.trim().toLowerCase(),
        )
      : null;
    if (rapidPropNoDup) {
      alert(
        `Validation Error: Property Number "${newItem.propertyNumber}" is already assigned to asset "${rapidPropNoDup.article}". Please provide a unique Property ID Number.`,
      );
      return;
    }

    await onAddItem(newItem);
    setRapidItem({
      article: "",
      propNo: "",
      value: "",
      category: CATEGORIES[0],
      office: "",
      condition: "Good",
    });

    // Auditing
    await addDoc(collection(db, "system_logs"), {
      timestamp: new Date().toISOString(),
      user: userName,
      action: `Created Asset ${newItem.article} via Rapid Entry`,
      module: "Inventory Module",
    });
  };

  const handleSaveItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (uploading) return;


    const timestamp = new Date().toISOString();

    if (!isEditMode) {
      const officeAwareDup = items.find((item) =>
        isOfficeAwareDuplicateInventoryItem(formItem, item),
      );
      if (officeAwareDup) {
        alert(
          `Validation Error: Asset "${formItem.article || "Unnamed Item"}" already exists in office "${formItem.office || "Unassigned"}". Please register the same item separately per office location.`,
        );
        return;
      }
    }

    // Check duplicate property number
    const propNoDup = formItem.propertyNumber?.trim()
      ? items.find(
          (item) =>
            (item.propertyNumber || "").toLowerCase() ===
              formItem.propertyNumber?.trim().toLowerCase() &&
            (!isEditMode || item.id !== editingId),
        )
      : null;
    if (propNoDup) {
      alert(
        `Validation Error: Property Number "${formItem.propertyNumber}" is already assigned to asset "${propNoDup.article}". Please provide a unique Property ID Number.`,
      );
      return;
    }

    // Check duplicate asset code
    if (formItem.assetCode?.trim()) {
      const assetCodeDup = items.find(
        (item) =>
          item.assetCode?.toLowerCase() ===
            formItem.assetCode?.trim().toLowerCase() &&
          (!isEditMode || item.id !== editingId),
      );
      if (assetCodeDup) {
        alert(
          `Validation Error: Asset Code "${formItem.assetCode}" is already assigned to asset "${assetCodeDup.article}". Please provide a unique Asset Code.`,
        );
        return;
      }
    }

    if (isEditMode && editingId) {
      const currentItem = items.find((i) => i.id === editingId);
      if (!currentItem) return;

      const historyEntry: HistoryEntry = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp,
        user: userName,
        action: "Record Modified",
      };

      let previousHolder =
        currentItem.assignedStaff || currentItem.personAccountable || "None";
      let transferHistoryList = [...(currentItem.transferHistory || [])];

      if (
        currentItem.assignedStaff !== formItem.assignedStaff ||
        currentItem.personAccountable !== formItem.personAccountable
      ) {
        const transferEntry: HistoryEntry = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp,
          user: userName,
          action: "Asset Assignment",
          field: "Assigned Personnel",
          oldValue: previousHolder,
          newValue:
            formItem.assignedStaff || formItem.personAccountable || "TBD",
        };
        transferHistoryList.push(transferEntry);
      }

      const { id: omittedId, ...formFields } = formItem;
      const updates: Partial<InventoryItem> = {
        ...formFields,
        previousHolder,
        transferHistory: transferHistoryList,
        history: [...(currentItem.history || []), historyEntry],
      };

      const cleanedUpdates: any = {};
      Object.entries(updates).forEach(([key, val]) => {
        if (val !== undefined && key !== 'id') {
          cleanedUpdates[key] = val;
        }
      });

      await onUpdateItem(editingId, cleanedUpdates);

      // Auto-archive if expiration date is now in the past
      if (formItem.expirationDate && !currentItem.isArchived) {
        try {
          const expDate = new Date(formItem.expirationDate + 'T00:00:00');
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          if (expDate.getTime() < today.getTime()) {
            await onUpdateItem(editingId, {
              isArchived: true,
              archivedAt: timestamp,
              archivedBy: userName,
              archiveReason: 'EXPIRED',
              status: 'RETIRED',
              history: [...(currentItem.history || []), {
                id: Math.random().toString(36).substr(2, 9),
                timestamp,
                user: userName,
                action: 'AUTOMATIC ARCHIVE — ITEM EXPIRED',
                field: 'Expiration Date',
                oldValue: 'Active',
                newValue: 'EXPIRED',
              }],
            });
            await addDoc(collection(db, 'system_logs'), {
              timestamp,
              user: userName,
              action: `AUTOMATIC ARCHIVE — EXPIRED: "${formItem.article}" (${formItem.propertyNumber || ''}) — Expiration: ${formItem.expirationDate}`,
              module: 'Inventory Module',
            });
          }
        } catch { /* ignore invalid date */ }
      }

      // Handle Automatic Form Logging for Accountability
      if (
        currentItem.personAccountable !== formItem.personAccountable ||
        currentItem.assignedStaff !== formItem.assignedStaff
      ) {
        await addDoc(collection(db, "forms"), {
          type: "ITR",
          itemId: editingId,
          itemArticle: formItem.article || "",
          propertyNumber: formItem.propertyNumber || "",
          userId: "auth-user",
          userName: formItem.assignedStaff || "Unassigned",
          office: formItem.office || "",
          department: "Property Unit",
          quantity: formItem.qtyPhysicalCount || 1,
          dateCreated: timestamp,
          status: "Approved",
          remarks: `Auto generated transfer registry. Responsibility moved from ${currentItem.personAccountable || "None"} to ${formItem.personAccountable || "None"}.`,
        });
      }

      await addDoc(collection(db, "system_logs"), {
        timestamp,
        user: userName,
        action: `Modified details of Asset: ${formItem.article || ""} (${formItem.propertyNumber || ""})`,
        module: "Inventory Module",
      });
    } else {
      const costValue = formItem.acquisitionCost !== undefined ? formItem.acquisitionCost : (formItem.unitValue !== undefined ? formItem.unitValue : 0);
      const isPar = (costValue || 0) >= 50000;
      const classification = isPar ? "PAR" : "ICS";
      formItem.classification = classification;

      const addedId = await onAddItem(formItem);
      if (addedId) {
        // Auto generated receipt/slip on Creation based on cost classification!
        await addDoc(collection(db, "forms"), {
          type: classification,
          itemId: addedId,
          itemArticle: formItem.article,
          propertyNumber: formItem.propertyNumber,
          userId: "auth-user",
          userName:
            formItem.assignedStaff || formItem.personAccountable || "Pending",
          office: formItem.office,
          department: "Property Unit",
          quantity: formItem.qtyPhysicalCount || 1,
          dateCreated: timestamp,
          status: "Finalized",
          remarks: `Legacy record auto ${classification.toLowerCase()} slip/receipt initialized on registration.`,
        });

        await addDoc(collection(db, "system_logs"), {
          timestamp,
          user: userName,
          action: `Registered New Asset Nomenclature: ${formItem.article}`,
          module: "Inventory Module",
        });
      }
    }
    setShowModal(false);
    setFormItem(emptyItem);
  };

  const uploadImagesToServer = async (filesList: FileList | File[]) => {
    const currentLength = (formItem.imageUrls || []).length;
    if (currentLength >= 3) {
      setUploadError("A maximum of 3 images can be attached per physical asset.");
      return;
    }

    const allowedNewCount = 3 - currentLength;
    const filesToUpload = Array.from(filesList).slice(0, allowedNewCount);

    if (filesList.length > allowedNewCount) {
      setUploadError(`Only up to 3 images are allowed. The remaining files were skipped.`);
    }

    const allowedExts = [".jpg", ".jpeg", ".png", ".webp"];
    const allowedMimes = ["image/jpeg", "image/png", "image/webp"];
    let totalSize = 0;

    for (const file of filesToUpload) {
      const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
      if (!allowedExts.includes(ext) || !allowedMimes.includes(file.type)) {
        setUploadError(`Unsupported format for "${file.name}". Only JPG, JPEG, PNG, WEBP are allowed.`);
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setUploadError(`"${file.name}" exceeds the maximum allowed size of 5 MB.`);
        return;
      }
      totalSize += file.size;
    }

    setUploading(true);
    setUploadProgress(0);
    setUploadError(null);
    setUploadFilesSize((totalSize / (1024 * 1024)).toFixed(2) + " MB");

    const formData = new FormData();
    filesToUpload.forEach((file) => {
      formData.append("images", file);
    });
    formData.append("uploadedBy", userName || "Unknown User");
    formData.append("userRole", userRole || "STAFF");
    formData.append("userOffice", userOffice || "Unknown Office");
    formData.append("inventoryId", editingId || "NEW_ITEM");

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/upload-inventory-images");

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const percent = Math.round((e.loaded / e.total) * 100);
        setUploadProgress(percent);
      }
    };

    xhr.onload = () => {
      setUploading(false);
      setUploadProgress(null);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          if (res.success && res.images) {
            const uploadedUrls = res.images.map((img: any) => img.image_path);
            const mergedUrls = [...(formItem.imageUrls || []), ...uploadedUrls];
            setFormItem({ ...formItem, imageUrls: mergedUrls });
            setUploadError(null);
          } else {
            setUploadError(res.error || "Upload failed.");
          }
        } catch (err) {
          setUploadError("Failed to parse upload response.");
        }
      } else {
        try {
          const res = JSON.parse(xhr.responseText);
          setUploadError(res.error || `Upload failed with status code ${xhr.status}.`);
        } catch (err) {
          setUploadError(`Upload failed with status code ${xhr.status}.`);
        }
      }
    };

    xhr.onerror = () => {
      setUploading(false);
      setUploadProgress(null);
      setUploadError("Network connection error. Upload failed.");
    };

    xhr.send(formData);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadImagesToServer(files);
    }
  };

  const removeImage = async (index: number) => {
    const url = formItem.imageUrls?.[index];
    if (!url) return;

    const newUrls = [...(formItem.imageUrls || [])];
    newUrls.splice(index, 1);
    setFormItem({ ...formItem, imageUrls: newUrls });

    try {
      await fetch("/api/delete-inventory-images", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paths: [url],
          user: userName,
          userRole,
          userOffice,
          inventoryId: editingId || "NEW_ITEM",
        }),
      });
    } catch (err) {
      console.error("Failed to delete physical file on server:", err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      uploadImagesToServer(files);
    }
  };

  const confirmDelete = async () => {
    if (userRole !== UserRole.ADMIN) {
      alert(
        "Unauthorized Access: Only Administrative Officers are cleared to discard records.",
      );
      setShowDeleteConfirm(false);
      return;
    }

    if (deleteTarget === "bulk") {
      const eligibleIds = Array.from(selectedIds).filter(id => {
        const item = items.find(i => i.id === id);
        return item && !item.isArchived;
      });

      if (eligibleIds.length === 0) {
        alert("Action Canceled: No eligible active records are available to archive.");
        setShowDeleteConfirm(false);
        return;
      }
    }

    setIsDeleting(true);
    try {
      if (deleteTarget === "bulk") {
        let archivedArticles: string[] = [];
        const timestamp = new Date().toISOString();
        const eligibleIds = Array.from(selectedIds).filter(id => {
          const item = items.find((i) => i.id === id);
          return item && !item.isArchived;
        });

        for (const id of eligibleIds) {
          const item = items.find((i) => i.id === id);
          if (!item) continue;
          archivedArticles.push(item.article);
          await onUpdateItem(id, {
            isArchived: true,
            archivedAt: timestamp,
            archivedBy: userName,
            archiveReason: 'MANUAL',
            status: 'RETIRED',
            history: [...(item.history || []), {
              id: Math.random().toString(36).substr(2, 9),
              timestamp,
              user: userName,
              action: 'Item Archived (MANUAL)',
              field: 'Archive Status',
              oldValue: item.status || 'ACTIVE',
              newValue: 'MANUAL',
            }],
          });
        }

        if (archivedArticles.length > 0) {
          await addDoc(collection(db, "system_logs"), {
            timestamp,
            user: userName,
            action: `Archived Batch Assets: [${archivedArticles.join(", ")}]`,
            module: "Inventory Module",
          });
        }

        setSelectedIds(new Set());
      } else if (deleteTarget) {
        const item = items.find((i) => i.id === deleteTarget);
        await onRemoveItem(deleteTarget);
        if (selectedIds.has(deleteTarget)) {
          const next = new Set(selectedIds);
          next.delete(deleteTarget);
          setSelectedIds(next);
        }

        await addDoc(collection(db, "system_logs"), {
          timestamp: new Date().toISOString(),
          user: userName,
          action: `Deleted Asset Record: ${item?.article || "Unknown"} (${item?.propertyNumber || ""})`,
          module: "Inventory Module",
        });
      }
    } catch (error) {
      console.error("Deletion failed:", error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
      setDeleteTarget(null);
    }
  };

  // Helper: detect if a request is a PAR/ICS accounting form (not a real cargo shipment)
  const isParOrIcsRequest = (r: any): boolean => {
    const reqType = (r.requestType || '').toUpperCase();
    const rMode = (r.reportMode || '').toLowerCase();
    const slipNo = (r.slipNumber || r.requestNumber || '').toUpperCase();
    return (
      reqType === 'PAR' || reqType === 'ICS' || reqType === 'AIR' || reqType === 'RIS' ||
      rMode === 'par' || rMode === 'ics' ||
      slipNo.startsWith('PAR-') || slipNo.startsWith('ICS-')
    );
  };

  const combinedCargo = [
    ...receivingRequests
      .filter((r) => !isParOrIcsRequest(r) && (r.status === "APPROVED" || r.status === "Approved"))
      .map((r) => ({
      ...r,
      isPRS: false,
      itemArticle: r.itemArticle || (r as any).title || (r as any).article || "Equipment",
      category: r.category || (r as any).equipmentType || "Equipment",
      quantity: r.quantity || 1,
      unitValue: r.unitCost !== undefined && r.unitCost !== 0 ? r.unitCost : (r.unitValue !== undefined && r.unitValue !== 0 ? r.unitValue : (((r as any).amount && r.quantity) ? (r as any).amount / r.quantity : 0)),
      supplier: r.supplier || "N/A",
      office: r.targetOffice || r.office || "Municipal Engineering",
      status: r.status || "Approved",
      slipNumber: r.slipNumber || (r as any).requestNumber || "",
      requestedBy: (r as any).requestedBy || (r as any).preparedBy || (r as any).targetOfficeHead || "Office Head",
      targetOfficeHead: (r as any).requestedBy || (r as any).targetOfficeHead || (r as any).officeHead || "Office Head",
      description: r.description || (r as any).justification || (r as any).details || "",
      justification: (r as any).justification || (r as any).details || r.description || "",
      condition: (r as any).condition || "N/A",
      poNumber: (r as any).poNumber || (r as any).purchaseOrderNumber || "",
      invoiceNumber: (r as any).invoiceNumber || "",
      expirationDate: (r as any).expirationDate || "",
      priority: (r as any).priority || "Medium",
      datePurchased: (r as any).datePurchased || (r as any).requestedAt?.substring(0, 10) || "",
      expectedDeliveryDate: r.expectedDeliveryDate || (r as any).deliveryDate || "",
      deliveryDate: (r as any).deliveryDate || (r as any).requestedAt || "",
    })),
    ...assetRequests
      .filter((r) => {
        if (isParOrIcsRequest(r)) return false;
        const s = (r.status || "").toUpperCase();
        const isDone = s === "COMPLETED" || s === "RECEIVED" || s === "REJECTED" || s === "DECLINED";
        return !isDone;
      })
      .map((r) => ({
      id: r.id,
      itemArticle: r.itemArticle || (r as any).title || (r as any).article || "Equipment",
      category: r.category || (r as any).equipmentType || "Equipment",
      quantity: r.quantity || 1,
      unitValue: r.unitCost !== undefined && r.unitCost !== 0 ? r.unitCost : (r.unitValue !== undefined && r.unitValue !== 0 ? r.unitValue : (((r as any).amount && r.quantity) ? (r as any).amount / r.quantity : 0)),
      supplier: r.supplier || "N/A",
      office: r.targetOffice || r.office || "Municipal Engineering",
      status: r.status || "Pending Delivery",
      isPRS: true,
      slipNumber: r.slipNumber || (r as any).requestNumber || "",
      mayorRemarks: r.justification || (r as any).details || "Purchase Request",
      targetOfficeHead: (r as any).requestedBy || (r as any).targetOfficeHead || (r as any).officeHead || (r as any).preparedBy || "Office Head",
      requestedBy: (r as any).requestedBy || (r as any).preparedBy || (r as any).targetOfficeHead || "Office Head",
      preparedBy: (r as any).preparedBy || (r as any).requestedBy || "Office Head",
      description: r.justification || (r as any).details || (r as any).description || "",
      justification: (r as any).justification || (r as any).details || (r as any).description || "",
      condition: (r as any).condition || "N/A",
      poNumber: (r as any).poNumber || (r as any).purchaseOrderNumber || "",
      invoiceNumber: (r as any).invoiceNumber || "",
      expirationDate: (r as any).expirationDate || "",
      priority: (r as any).priority || "Medium",
      datePurchased: (r as any).datePurchased || (r as any).requestedAt?.substring(0, 10) || "",
      expectedDeliveryDate: r.expectedDeliveryDate || "",
      deliveryDate: (r as any).deliveryDate || r.requestedAt || "",
      masterAssetId: r.masterAssetId || "",
      serialNumber: r.serialNumber || "",
      fundingSource: (r as any).fundingSource || "",
      personAccountable: (r as any).personAccountable || "",
      unit: (r as any).unit || "",
      amount: (r as any).amount
    }))
  ];

  const combinedCompleted = [
    ...receivingRequests
      .filter((r) => !isParOrIcsRequest(r) && (r.status === "RECEIVED" || r.status === "REJECTED"))
      .map((r) => ({
      ...r,
      isPRS: false
    })),
    ...assetRequests
      .filter((r) => {
        if (isParOrIcsRequest(r)) return false;
        const s = (r.status || "").toUpperCase();
        return s === "COMPLETED" || s === "RECEIVED";
      })
      .map((r) => ({
      id: r.id,
      itemArticle: r.itemArticle || (r as any).title || "",
      category: r.category || "Equipment",
      quantity: r.quantity || 1,
      unitValue: r.unitCost !== undefined ? r.unitCost : (r.unitValue !== undefined ? r.unitValue : 0),
      supplier: r.supplier || "N/A",
      office: r.targetOffice || r.office || "Municipal Engineering",
      status: "RECEIVED",
      isPRS: true,
      slipNumber: r.slipNumber || (r as any).requestNumber || "",
      deliveryDate: (r as any).handledAt || r.requestedAt
    }))
  ];

  const cargoDepartments = Array.from(new Set(
    combinedCargo.map((request: any) => request.targetOffice || request.office).filter(Boolean)
  ));
  const visibleCargo = cargoDepartmentFilter
    ? combinedCargo.filter((request: any) => (request.targetOffice || request.office) === cargoDepartmentFilter)
    : combinedCargo;

  if (officeFilter) {
    const officeItems = items.filter(item =>
      item.office && item.office.toLowerCase().trim() === officeFilter.toLowerCase().trim()
    );

    const filteredOfficeItems = officeItems.filter(item => {
      if (!officeAssetSearch) return true;
      const term = officeAssetSearch.toLowerCase();
      return (
        (item.article && item.article.toLowerCase().includes(term)) ||
        (item.description && item.description.toLowerCase().includes(term)) ||
        (item.propertyNumber && item.propertyNumber.toLowerCase().includes(term)) ||
        (item.personAccountable && item.personAccountable.toLowerCase().includes(term)) ||
        (item.assignedStaff && item.assignedStaff.toLowerCase().includes(term))
      );
    });

    const parItems = filteredOfficeItems.filter(item => {
      const val = item.acquisitionCost || item.unitValue || 0;
      return val >= 50000;
    });

    const icsItems = filteredOfficeItems.filter(item => {
      const val = item.acquisitionCost || item.unitValue || 0;
      return val < 50000;
    });

    return (
      <div className="bg-slate-50 min-h-screen p-4 md:p-8 select-text font-sans w-full leading-normal tracking-normal text-slate-800">
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body {
              background: white !important;
              color: black !important;
            }
            .no-print, nav, aside, button, .tab-buttons, .back-btn, header {
              display: none !important;
              height: 0 !important;
              width: 0 !important;
              overflow: hidden !important;
              visibility: hidden !important;
            }
            .print-area {
              border: none !important;
              box-shadow: none !important;
              padding: 0 !important;
              margin: 0 !important;
              width: 100% !important;
              max-width: 100% !important;
            }
          }
        ` }} />
        
        {/* Navigation & Header */}
        <div className="max-w-7xl mx-auto space-y-6 no-print">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setOfficeFilter("")}
                className="p-2.5 bg-white border border-gray-200 text-gray-700 rounded-2xl hover:bg-slate-50 shadow-xs flex items-center justify-center transition-all back-btn cursor-pointer"
                title="Go Back to Departments List"
              >
                <span className="font-bold text-lg leading-none">←</span>
              </button>
              <div>
                <span className="text-[9px] text-blue-600 font-extrabold uppercase tracking-widest block leading-none">OFFICE ASSET AND INVENTORY DESK</span>
                <div className="flex items-center gap-2 mt-1">
                  <h1 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight uppercase font-brand leading-none">
                    {officeFilter}
                  </h1>
                  {offices && offices.length > 0 && (
                    <select
                      value={officeFilter}
                      onChange={(e) => setOfficeFilter(e.target.value)}
                      className="ml-2 text-[10px] font-black uppercase tracking-wider bg-white border border-gray-200 text-slate-800 py-1 px-2.5 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer shadow-sm"
                    >
                      {offices.map((off) => (
                        <option key={off.id} value={off.name}>
                          {off.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={() => window.print()}
                className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl text-[9.5px] font-black uppercase tracking-widest inline-flex items-center space-x-3 transition-all shadow-lg shadow-blue-100 cursor-pointer"
              >
                <span>🖨️</span>
                <span>Print Official Form</span>
              </button>
            </div>
          </div>



          {/* Interior Filter */}
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <div className="relative flex-1 w-full">
              <input
                type="text"
                placeholder="Search matching office items (e.g. laptop, printer)..."
                className="w-full bg-white text-[11px] font-bold text-slate-800 placeholder-slate-400 p-3.5 pl-11 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm"
                value={officeAssetSearch}
                onChange={e => setOfficeAssetSearch(e.target.value)}
              />
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs">🔍</span>
            </div>
          </div>
        </div>

        {/* Accounting & Finance: PAR / ICS department workspace */}
        {isAccountingOffice && !deptDocType && (
          <div className="max-w-7xl mx-auto mt-6">
            <DepartmentFormsWorkspace office={officeFilter} items={items} userName={userName} docType={deptDocType} setDocType={setDeptDocType} />
          </div>
        )}

        {/* Printable Form Content Area */}
        <div className="max-w-7xl mx-auto mt-6 bg-white border border-gray-150 p-6 md:p-12 shadow-sm rounded-[32px] print-area">
          {isAccountingOffice && deptDocType ? (
            <DepartmentFormsWorkspace office={officeFilter} items={items} userName={userName} docType={deptDocType} setDocType={setDeptDocType} />
          ) : (() => {
            const activeStockCardItem = filteredOfficeItems.find(item => item.id === selectedStockCardItemId) || filteredOfficeItems[0] || null;
            
            // Local parsing function for ledger entries
            const parseMovementsForSelected = (item: InventoryItem) => {
              const movements: any[] = [];
              const baseDate = item.dateReceived || item.acquisitionDate || (item.createdAt ? item.createdAt.split('T')[0] : "");
              
              // Seed a baseline registry entry
              movements.push({
                id: 'baseline-' + item.id,
                date: baseDate || "N/A",
                reference: item.propertyNumber || "REGISTRY-INIT",
                type: 'IN',
                qty: item.qtyPropertyCard || 1,
                personnel: "Initial Procurement",
                remarks: item.remarks || "Initial asset inventory registry baseline."
              });

              // Add unique movements from real transactions collection
              const itemTxs = transactions.filter((tx: any) => 
                tx.itemId === item.id || 
                (tx.article && tx.article.toLowerCase().trim() === (item.article || "").toLowerCase().trim() && 
                 tx.officeId && tx.officeId.toLowerCase().trim() === (item.office || "").toLowerCase().trim())
              );

              itemTxs.forEach((tx: any) => {
                movements.push({
                  id: tx.id,
                  date: tx.date || (tx.timestamp ? tx.timestamp.split('T')[0] : ""),
                  reference: tx.reference || "N/A",
                  type: tx.transactionType === 'Item Received' || tx.transactionType === 'Item Returned' ? 'IN' : 'OUT',
                  qty: tx.quantity || 0,
                  personnel: tx.user || "Staff",
                  remarks: tx.remarks || ""
                });
              });

              if (item.history && Array.isArray(item.history)) {
                item.history.forEach(h => {
                  const action = h.action || "";
                  let parsedMove: any = null;

                  // Parse stock receipt patterns
                  if (action.includes("Stock Receipt:")) {
                    let qty = 1;
                    const qtyMatch = action.match(/Added\s+(\d+)\s+units/i) || action.match(/Added\s+(\d+)\s+unit/i);
                    if (qtyMatch) qty = parseInt(qtyMatch[1], 10);

                    let ref = "N/A";
                    const refMatch = action.match(/Ref:\s*([^.]+)/i);
                    if (refMatch) ref = refMatch[1].trim();

                    let date = "";
                    const dateMatch = action.match(/Date Received:\s*([^.]+)/i);
                    if (dateMatch) date = dateMatch[1].trim();

                    let remarks = "";
                    const remarksMatch = action.match(/Remarks:\s*(.*)/i);
                    if (remarksMatch) remarks = remarksMatch[1].trim();

                    parsedMove = {
                      id: h.id,
                      date: date || (h.timestamp ? h.timestamp.split('T')[0] : "TBD"),
                      reference: ref,
                      type: 'IN',
                      qty,
                      personnel: "GSO Supply",
                      remarks: remarks || "Incremental stock replenishment"
                    };
                  }
                  // Parse stock distribution patterns
                  else if (action.includes("Stock Distribution:")) {
                    let qty = 1;
                    const qtyMatch = action.match(/Issued\s+(\d+)\s+units/i) || action.match(/Issued\s+(\d+)\s+unit/i);
                    if (qtyMatch) qty = Math.min(qty, parseInt(qtyMatch[1], 10));

                    let ref = "N/A";
                    const refMatch = action.match(/Ref:\s*([^.]+)/i);
                    if (refMatch) ref = refMatch[1].trim();

                    let date = "";
                    const dateMatch = action.match(/Date Distributed:\s*([^.]+)/i);
                    if (dateMatch) date = dateMatch[1].trim();

                    let personnel = "Staff";
                    const personnelMatch = action.match(/Issued\s+\d+\s+units?\s+to\s+([^.]+)/i);
                    if (personnelMatch) personnel = personnelMatch[1].trim();

                    let remarks = "";
                    const remarksMatch = action.match(/Remarks:\s*(.*)/i);
                    if (remarksMatch) remarks = remarksMatch[1].trim();

                    parsedMove = {
                      id: h.id,
                      date: date || (h.timestamp ? h.timestamp.split('T')[0] : "TBD"),
                      reference: ref,
                      type: 'OUT',
                      qty,
                      personnel,
                      remarks: remarks || "Staff Allocation"
                    };
                  }

                  if (parsedMove) {
                    const duplicate = movements.some(m => 
                      m.id === parsedMove.id || 
                      (m.reference === parsedMove.reference && m.qty === parsedMove.qty && m.type === parsedMove.type)
                    );
                    if (!duplicate) {
                      movements.push(parsedMove);
                    }
                  }
                });
              }

              // Sort movements chronologically
              const sorted = movements.sort((a, b) => a.date.localeCompare(b.date));
              
              // Compute running balances
              let balanceTracker = 0;
              return sorted.map(m => {
                if (m.type === 'IN') {
                  balanceTracker += m.qty;
                } else {
                  balanceTracker = Math.max(0, balanceTracker - m.qty);
                }
                return { ...m, balance: balanceTracker };
              });
            };

            const movements = activeStockCardItem ? parseMovementsForSelected(activeStockCardItem) : [];
            const finalBalance = movements.length > 0 ? movements[movements.length - 1].balance : 0;

            const handleLodgeMovementSubmit = async (e: React.FormEvent) => {
              e.preventDefault();
              if (!activeStockCardItem) return;
              setMovementSubmitting(true);
              
              try {
                const timestamp = new Date().toISOString();
                const actionId = Math.random().toString(36).substr(2, 9);
                
                let actionString = "";
                let updatedQty = activeStockCardItem.qtyPhysicalCount || 0;
                let upDates: any = {};
                
                if (newMovementType === 'IN') {
                  actionString = `Stock Receipt: Added ${newMovementQty} units. Ref: ${newMovementRef || 'N/A'}. Date Received: ${newMovementDate}. Remarks: ${newMovementRemarks || 'No remarks.'}`;
                  updatedQty = (activeStockCardItem.qtyPhysicalCount || 0) + Number(newMovementQty);
                  upDates = {
                    qtyPhysicalCount: updatedQty,
                    qtyPropertyCard: (activeStockCardItem.qtyPropertyCard || 0) + Number(newMovementQty),
                    dateReceived: newMovementDate,
                    remarks: `Replenished via dynamic Stock Receipt on ${newMovementDate}. Remarks: ${newMovementRemarks}`
                  };
                } else {
                  actionString = `Stock Distribution: Issued ${newMovementQty} units to ${newMovementPersonnel || 'Personnel'}. Ref: ${newMovementRef || 'N/A'}. Date Distributed: ${newMovementDate}. Remarks: ${newMovementRemarks || 'No remarks.'}`;
                  updatedQty = Math.max(0, (activeStockCardItem.qtyPhysicalCount || 0) - Number(newMovementQty));
                  upDates = {
                    qtyPhysicalCount: updatedQty,
                    dateAssigned: newMovementDate,
                    assignedStaff: newMovementPersonnel,
                    remarks: `Allocated ${newMovementQty} units to ${newMovementPersonnel}. Ref: ${newMovementRef}`
                  };
                }
                
                const newHistoryEntry = {
                  id: actionId,
                  timestamp,
                  user: userName || "Supply Desk",
                  action: actionString
                };
                
                 await onUpdateItem(activeStockCardItem.id, {
                  ...upDates,
                  history: [...(activeStockCardItem.history || []), newHistoryEntry]
                });

                // Record transaction in inventory_transactions
                await addDoc(collection(db, 'inventory_transactions'), {
                  itemId: activeStockCardItem.id,
                  article: activeStockCardItem.article || "",
                  officeId: activeStockCardItem.office || "",
                  transactionType: newMovementType === 'IN' ? 'Item Received' : 'Item Distributed',
                  quantity: Number(newMovementQty),
                  previousBalance: activeStockCardItem.qtyPhysicalCount || 0,
                  newBalance: updatedQty,
                  user: userName || "Supply Desk",
                  date: newMovementDate,
                  time: new Date().toLocaleTimeString(),
                  timestamp,
                  remarks: newMovementRemarks || (newMovementType === 'IN' ? "Replenished stock" : `Allocated to ${newMovementPersonnel}`),
                  reference: newMovementRef || "N/A"
                });
                
                setIsLodgeMovementOpen(false);
                setNewMovementRef('');
                setNewMovementQty(1);
                setNewMovementPersonnel('');
                setNewMovementRemarks('');
                
                alert(`Successfully registered stock movement for "${activeStockCardItem.article}"!`);
              } catch (error) {
                console.error("Error logging stock movement:", error);
                alert("An error occurred while saving the stock movement record. Please try again.");
              } finally {
                setMovementSubmitting(false);
              }
            };

            return (
              <div className="space-y-10 font-sans">
                {/* A. SUMMARY TABLE OF ALL OFFICE ASSETS (Screen-only, hidden in print) */}
                <div className="no-print space-y-4 font-sans">
                  <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100 font-sans">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider font-sans">All Active Items Assigned to {officeFilter}</h3>
                      <p className="text-[11px] text-gray-500 font-medium font-sans font-sans">Click on any item in the table to load its Official Appendix 47 Stock Card ledger & log movements.</p>
                    </div>
                  </div>

                  <div className="overflow-hidden border border-gray-150 rounded-2xl bg-white shadow-xs font-sans">
                    <table className="w-full text-left border-collapse text-[11px] font-sans">
                      <thead>
                        <tr className="bg-slate-50 font-bold text-slate-700 uppercase tracking-wider border-b border-gray-150 text-[10px] font-sans font-sans">
                          <th className="p-3">Asset Description</th>
                          <th className="p-3">Property No.</th>
                          <th className="p-3 font-sans">Cost / Unit Value</th>
                          <th className="p-3 text-center font-sans">Date Received</th>
                          <th className="p-3 text-center font-sans">Date Distributed</th>
                          <th className="p-3 text-center font-sans">Current Stock</th>
                          <th className="p-3 text-center font-sans">Remaining Balance</th>
                          <th className="p-3 text-center font-sans">Ledger Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredOfficeItems.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="p-8 text-center text-gray-400 font-bold bg-white italic font-sans font-sans">
                              No office inventory matching criteria found.
                            </td>
                          </tr>
                        ) : (
                          filteredOfficeItems.map((item) => {
                            const isSelected = activeStockCardItem?.id === item.id;
                            
                            // Determine dates received and distributed for the line summary
                            const itemMovements = parseMovementsForSelected(item);
                            const recs = itemMovements.filter(m => m.type === 'IN');
                            const dists = itemMovements.filter(m => m.type === 'OUT');
                            const dateRec = recs.length > 0 ? recs[recs.length - 1].date : (item.dateReceived || item.acquisitionDate || "N/A");
                            const dateDist = dists.length > 0 ? dists[dists.length - 1].date : (item.dateAssigned || "N/A");
                            const itemBal = itemMovements.length > 0 ? itemMovements[itemMovements.length - 1].balance : (item.qtyPhysicalCount || 0);

                            return (
                              <tr 
                                key={item.id} 
                                className={`border-b border-gray-100 hover:bg-slate-50 transition-colors cursor-pointer font-sans ${isSelected ? 'bg-blue-50/40 border-l-4 border-l-blue-600 font-sans' : ''}`}
                                onClick={() => setSelectedStockCardItemId(item.id)}
                              >
                                <td className="p-3 font-semibold text-slate-900 font-sans">
                                  <span className="block uppercase font-bold text-slate-800 tracking-tight font-sans">{item.article}</span>
                                  <span className="block text-gray-500 font-normal mt-0.5 text-[10px] leading-relaxed max-w-[280px] truncate">{item.description}</span>
                                </td>
                                <td className="p-3 font-mono font-bold text-slate-700">{item.propertyNumber || "TBD"}</td>
                                <td className="p-3 font-mono font-bold text-indigo-900">₱{(item.acquisitionCost || item.unitValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                                <td className="p-3 text-center font-mono font-medium text-slate-650">{dateRec}</td>
                                <td className="p-3 text-center font-mono font-medium text-slate-650">
                                  {dateDist !== "N/A" ? (
                                    <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-full text-[9px] font-bold border border-purple-150">{dateDist}</span>
                                  ) : (
                                    <span className="text-gray-300 italic">Unassigned</span>
                                  )}
                                </td>
                                <td className="p-3 text-center font-bold font-mono text-emerald-800 bg-emerald-50/10">
                                  {item.qtyPropertyCard || item.qtyPhysicalCount || 1}
                                </td>
                                <td className="p-3 text-center font-bold font-mono text-blue-900 bg-blue-50/15">
                                  {itemBal}
                                </td>
                                <td className="p-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedStockCardItemId(item.id);
                                    }}
                                    className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${isSelected ? 'bg-blue-600 text-white font-sans' : 'bg-slate-100 text-slate-700 hover:bg-blue-600 hover:text-white font-sans'}`}
                                  >
                                    {isSelected ? "inspecting" : "select"}
                                  </button>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* B. LEDGER VIEWER & COA APPENDIX 47 CARD (Always Printable) */}
                {activeStockCardItem ? (
                  <div className="space-y-6 font-serif select-text mt-8 ">
                    {/* Log stock transaction floating bar (Screen-only) */}
                    <div className="no-print bg-slate-50 border border-slate-200 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 font-sans">
                      <div className="space-y-1">
                        <span className="text-[10px] font-black uppercase text-blue-700 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-150 tracking-wider">Asset Selected: {activeStockCardItem.article}</span>
                        <h4 className="text-sm font-black text-slate-900 tracking-tight">Active GSO Stock Card Ledger Controls</h4>
                        <p className="text-[10.5px] text-gray-500 font-medium">Record a new dynamic delivery receipt (IN) or dispatch assignment (OUT) for this asset to register history movements.</p>
                      </div>
                      <button
                        onClick={() => setIsLodgeMovementOpen(true)}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-xl font-bold text-xs shadow-lg shadow-blue-100 transition-all active:scale-95 flex items-center gap-2 cursor-pointer font-sans"
                      >
                        📊 Log Stock Movement (IN/OUT)
                      </button>
                    </div>

                    {/* Official General Form Heading */}
                    <div className="text-right italic font-black text-[11.5pt] text-gray-400 font-serif leading-none">Appendix 47</div>
                    
                    <div className="text-center font-bold text-[8.5pt] uppercase text-gray-400 tracking-wider font-serif">
                      MUNICIPALITY OF TIBIAO, PROVINCE OF ANTIQUE
                    </div>
                    <div className="text-center mb-8 font-serif">
                      <h1 className="font-extrabold text-[19pt] leading-none mb-1 text-black tracking-tight uppercase">STOCK CARD</h1>
                      <div className="text-[9.5pt] text-gray-500 italic mt-1 uppercase tracking-widest">{officeFilter} DEPARTMENT - LEDGER CARD</div>
                    </div>

                    {/* Asset Details Metadata Header Bar (COA style) */}
                    <div className="border border-black p-4 rounded-md mb-4 bg-slate-50/50 font-serif text-[9.5pt] grid grid-cols-1 md:grid-cols-4 gap-4">
                      <div>
                        <span className="font-bold text-gray-500 block uppercase text-[7.5pt] tracking-wider mb-0.5">Article / Name:</span>
                        <span className="font-extrabold text-slate-900 block uppercase leading-none">{activeStockCardItem.article}</span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-500 block uppercase text-[7.5pt] tracking-wider mb-0.5">Property Number:</span>
                        <span className="font-extrabold text-slate-900 font-mono block leading-none">{activeStockCardItem.propertyNumber || "N/A"}</span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-500 block uppercase text-[7.5pt] tracking-wider mb-0.5 font-serif">Asset Category:</span>
                        <span className="font-extrabold text-slate-900 block leading-none truncate">{activeStockCardItem.category}</span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-500 block uppercase text-[7.5pt] tracking-wider mb-0.5">Cost / Unit Value:</span>
                        <span className="font-extrabold text-blue-900 font-mono block leading-none">
                          ₱{(activeStockCardItem.acquisitionCost || activeStockCardItem.unitValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                    </div>

                    <div className="border border-black p-4 rounded-md mb-6 bg-slate-50/50 font-serif text-[9.5pt] grid grid-cols-1 md:grid-cols-3 gap-4 font-serif">
                      <div>
                        <span className="font-bold text-gray-500 block uppercase text-[7.5pt] tracking-wider mb-0.5">Unit of Measure:</span>
                        <span className="font-extrabold text-slate-900 block leading-none uppercase">{activeStockCardItem.unitOfMeasure || "unit"}</span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-500 block uppercase text-[7.5pt] tracking-wider mb-0.5">Date Registered (Received):</span>
                        <span className="font-extrabold text-slate-900 block leading-none">
                          {activeStockCardItem.dateReceived || activeStockCardItem.acquisitionDate || (activeStockCardItem.createdAt ? activeStockCardItem.createdAt.split('T')[0] : "N/A")}
                        </span>
                      </div>
                      <div>
                        <span className="font-bold text-gray-500 block uppercase text-[7.5pt] tracking-wider mb-0.5">Closing Stock Balance:</span>
                        <span className="font-extrabold text-slate-900 block leading-none font-mono text-[10.5pt]">{finalBalance} units remaining</span>
                      </div>
                    </div>

                    {/* Official Appendix 47 Multi-column Ledger Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse border-2 border-black text-[9.5pt] font-serif">
                        <thead>
                          <tr className="font-bold uppercase text-center bg-gray-100 text-[8pt]">
                            <th className="border-2 border-black p-2.5 w-[14%] font-serif">Transaction Date</th>
                            <th className="border-2 border-black p-2.5 w-[15%] font-serif">Reference No. (RIS / PAR / DR)</th>
                            <th className="border-2 border-black p-2.5 w-[14%] font-serif font-serif">Transaction Type</th>
                            <th className="border-2 border-black p-2.5 w-[10%] font-serif">Received Qty (IN)</th>
                            <th className="border-2 border-black p-2.5 w-[10%] font-serif">Issued Qty (OUT)</th>
                            <th className="border-2 border-black p-2.5 w-[12%] font-serif">Balance Qty</th>
                            <th className="border-2 border-black p-2.5 w-[25%] font-serif font-serif font-serif">Issued To / Description Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {movements.map((mov, idx) => {
                            return (
                              <tr key={mov.id || idx} style={{ height: '32px' }} className="hover:bg-slate-50/50">
                                <td className="border border-black p-2.5 text-center font-mono text-[8.5pt]">
                                  {mov.date}
                                </td>
                                <td className="border border-black p-2.5 text-center font-mono text-[8pt] uppercase font-serif">
                                  {mov.reference}
                                </td>
                                <td className="border border-black p-2.5 text-center tracking-wider font-bold text-[8pt]">
                                  {mov.type === 'IN' ? (
                                    <span className="text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded font-mono text-[7.5pt]">IN_RECEIPT</span>
                                  ) : (
                                    <span className="text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded font-mono text-[7.5pt]">OUT_ISSUED</span>
                                  )}
                                </td>
                                <td className="border border-black p-2.5 text-center font-mono font-semibold text-emerald-800">
                                  {mov.type === 'IN' ? mov.qty : "--"}
                                </td>
                                <td className="border border-black p-2.5 text-center font-mono font-semibold text-purple-800">
                                  {mov.type === 'OUT' ? mov.qty : "--"}
                                </td>
                                <td className="border border-black p-2.5 text-center font-mono font-black text-indigo-900 bg-slate-50/20">
                                  {mov.balance}
                                </td>
                                <td className="border border-black p-2.5 font-serif">
                                  {mov.type === 'OUT' ? (
                                    <div className="leading-tight text-[8.5pt] font-serif">
                                      <span className="font-extrabold text-slate-800 block uppercase font-serif">To: {mov.personnel || "N/A"}</span>
                                      <span className="text-[7.5pt] text-gray-500 font-sans block mt-0.5 italic">{mov.remarks}</span>
                                    </div>
                                  ) : (
                                    <div className="leading-tight text-[8.5pt] font-serif">
                                      <span className="font-extrabold text-slate-800 block uppercase font-serif font-serif">{mov.personnel || "GSO Supply"}</span>
                                      <span className="text-[7.5pt] text-gray-500 font-sans block mt-0.5 italic">{mov.remarks}</span>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Prepared and Verified Signatures */}
                    <div className="grid grid-cols-2 gap-12 mt-16 pt-8 border-t border-dashed border-gray-200 font-serif">
                      <div className="space-y-8 font-serif">
                        <span className="text-[8.5pt] font-bold text-gray-400 uppercase tracking-widest block font-serif">Prepared By:</span>
                        <div className="text-center w-64 border-b-2 border-black pb-1.5">
                          <span className="font-extrabold text-[12px] uppercase block">CLEMENS G. BANDOJA</span>
                          <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block mt-0.5 font-serif">Municipal GSO Supply Officer</span>
                        </div>
                      </div>
                      <div className="space-y-8 self-end flex flex-col items-end">
                        <div className="w-64 space-y-8">
                          <span className="text-[8.5pt] font-bold text-gray-400 uppercase tracking-widest block text-right font-serif">Verified By (Department Head):</span>
                          <div className="text-center border-b-2 border-black pb-1.5 w-full">
                            <span className="font-extrabold text-[12px] uppercase block font-serif">
                              {activeStockCardItem.personAccountable || "TBD"}
                            </span>
                            <span className="text-[9px] text-gray-500 font-bold uppercase tracking-wider block mt-0.5 font-serif">Responsible Head of Office</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="p-16 text-center text-gray-400 uppercase tracking-wider font-bold border border-dashed border-gray-200 rounded-3xl font-sans font-sans">
                    ⚠️ No items available in {officeFilter} to compile stock card entries. Please transfer or register items first.
                  </div>
                )}

                {/* MODAL: LOG STOCK MOVEMENT FORM (Screen-only) */}
                {isLodgeMovementOpen && activeStockCardItem && (
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-gray-900/60 backdrop-blur-sm no-print font-sans">
                    <div className="bg-white rounded-[24px] w-full max-w-lg overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200 border border-slate-100 flex flex-col">
                      <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-slate-50 font-sans">
                        <div>
                          <span className="text-[9px] text-blue-600 font-black uppercase tracking-widest font-sans">RECORD MOVEMENT TRANSACTION</span>
                          <h3 className="text-lg font-black text-slate-800 tracking-tight mt-1 font-sans">{activeStockCardItem.article}</h3>
                        </div>
                        <button 
                          onClick={() => setIsLodgeMovementOpen(false)}
                          className="w-9 h-9 bg-slate-250 hover:bg-slate-300 text-slate-650 hover:text-slate-800 rounded-full flex items-center justify-center transition-transform active:scale-95 shadow-sm font-sans font-sans"
                        >
                          ✕
                        </button>
                      </div>

                      <form onSubmit={handleLodgeMovementSubmit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto font-sans">
                        {/* IN vs OUT toggle */}
                        <div className="font-sans">
                          <span className="block text-[10px] font-extrabold text-gray-400 uppercase tracking-wider mb-2 font-sans">Movement Direction Type</span>
                          <div className="grid grid-cols-2 gap-3">
                            <button
                              type="button"
                              onClick={() => setNewMovementType('IN')}
                              className={`py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border flex items-center justify-center gap-2 ${newMovementType === 'IN' ? 'bg-emerald-50 border-emerald-500 text-emerald-800 font-black font-sans' : 'bg-white border-gray-200 text-gray-500 font-sans'}`}
                            >
                              <span>📥 Stock IN (Receipt)</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setNewMovementType('OUT')}
                              className={`py-3.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all border flex items-center justify-center gap-2 ${newMovementType === 'OUT' ? 'bg-purple-50 border-purple-500 text-purple-800 font-black font-sans' : 'bg-white border-gray-200 text-gray-500 font-sans'}`}
                            >
                              <span>📤 Stock OUT (Distribution)</span>
                            </button>
                          </div>
                        </div>

                        {/* Quantity & Date */}
                        <div className="grid grid-cols-2 gap-4 font-sans">
                          <div>
                            <label className="block text-[10px] font-extrabold uppercase text-gray-400 tracking-wider mb-1.5 ml-0.5 font-sans">Quantity Count</label>
                            <input
                              type="number"
                              required
                              min="1"
                              value={newMovementQty}
                              onChange={e => setNewMovementQty(Math.max(1, parseInt(e.target.value) || 1))}
                              className="w-full bg-slate-50 border border-gray-150 rounded-xl px-4 py-3 text-slate-800 font-bold focus:ring-4 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all text-xs"
                            />
                            {newMovementType === 'OUT' && activeStockCardItem && (
                              <span className="text-[10px] text-rose-600 font-bold mt-1 block">Maximum available: {activeStockCardItem.qtyPhysicalCount || 0} units</span>
                            )}
                          </div>
                          <div>
                            <label className="block text-[10px] font-extrabold uppercase text-gray-400 tracking-wider mb-1.5 ml-0.5 font-sans">Transaction Date</label>
                            <input
                              type="date"
                              required
                              value={newMovementDate}
                              onChange={e => setNewMovementDate(e.target.value)}
                              className="w-full bg-slate-50 border border-gray-150 rounded-xl px-4 py-3 text-slate-800 font-semibold focus:ring-4 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all text-xs focus:ring-blue-50"
                            />
                          </div>
                        </div>

                        {/* Reference Slip Number */}
                        <div className="font-sans">
                          <label className="block text-[10px] font-extrabold uppercase text-gray-400 tracking-wider mb-1.5 ml-0.5">
                            {newMovementType === 'IN' ? 'Reference Slip / DR / Invoice #' : 'Distribution Slip / RIS / PAR #'}
                          </label>
                          <input
                            type="text"
                            required
                            placeholder={newMovementType === 'IN' ? "e.g. DR-40912" : "e.g. PAR-2026-004"}
                            value={newMovementRef}
                            onChange={e => setNewMovementRef(e.target.value)}
                            className="w-full bg-slate-50 border border-gray-150 rounded-xl px-4 py-3 text-slate-800 font-bold placeholder-slate-400 focus:ring-4 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all text-xs"
                          />
                        </div>

                        {/* OUT only - Distributed Personnel */}
                        {newMovementType === 'OUT' && (
                          <div className="font-sans">
                            <label className="block text-[10px] font-extrabold uppercase text-gray-400 tracking-wider mb-1.5 ml-0.5">Distributed To (End-user Personnel Name)</label>
                            <input
                              type="text"
                              required={newMovementType === 'OUT'}
                              placeholder="e.g. Maria G. Santos (LGU Staff)"
                              value={newMovementPersonnel}
                              onChange={e => setNewMovementPersonnel(e.target.value)}
                              className="w-full bg-slate-50 border border-gray-150 rounded-xl px-4 py-3 text-slate-800 font-bold placeholder-slate-400 focus:ring-4 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all text-xs"
                            />
                          </div>
                        )}

                        {/* Remarks */}
                        <div className="font-sans">
                          <label className="block text-[10px] font-extrabold uppercase text-gray-400 tracking-wider mb-1.5 ml-0.5">Remarks & Audit Notes</label>
                          <textarea
                            rows={3}
                            placeholder="Provide details about the transfer, condition, warranty, or official receipt signatures..."
                            value={newMovementRemarks}
                            onChange={e => setNewMovementRemarks(e.target.value)}
                            className="w-full bg-slate-50 border border-gray-150 rounded-xl p-4 text-slate-800 font-semibold placeholder-slate-400 focus:ring-4 focus:ring-blue-50 focus:border-blue-600 outline-none transition-all text-xs"
                          />
                        </div>

                        {/* Actions */}
                        <div className="flex gap-3 pt-4 border-t border-slate-100 font-sans">
                          <button
                            type="button"
                            onClick={() => setIsLodgeMovementOpen(false)}
                            className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-600 py-3 rounded-xl text-xs font-bold transition-all active:scale-95"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={movementSubmitting || (newMovementType === 'OUT' && newMovementQty > (activeStockCardItem.qtyPhysicalCount || 0))}
                            className="flex-[2] bg-blue-600 text-white hover:bg-blue-700 py-3 rounded-xl text-xs font-bold transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-blue-100"
                          >
                            {movementSubmitting ? "Processing..." : "Commit Transaction"}
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}


        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-[32px] md:rounded-[40px] border border-gray-100 shadow-sm overflow-hidden relative min-h-[500px] flex flex-col">
      {/* Selection Toolbar */}
      {selectedIds.size > 0 && (
        <div className="absolute top-0 left-0 right-0 z-20 bg-gray-900 text-white p-4 md:p-5 flex items-center justify-between animate-in slide-in-from-top duration-300">
          <div className="flex items-center space-x-4 md:space-x-6">
            <span className="text-[9px] md:text-xs font-black uppercase tracking-[0.1em]">
              {selectedIds.size} Selected
            </span>
            <div className="h-6 w-px bg-white/10 hidden sm:block"></div>
            <button
              onClick={() => {
                setShowQRModal("bulk");
              }}
              className="px-3 md:px-4 py-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 border border-blue-50/20 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all"
            >
              Generate QR Labels
            </button>

            {userRole === UserRole.ADMIN && (
              <>
                <div className="h-6 w-px bg-white/10 hidden sm:block"></div>
                <button
                  onClick={() => {
                    setDeleteTarget("bulk");
                    setShowDeleteConfirm(true);
                  }}
                  className="px-3 md:px-4 py-2 bg-red-600/20 hover:bg-red-600/40 text-red-400 border border-red-500/20 rounded-xl text-[9px] md:text-[10px] font-black uppercase tracking-widest transition-all"
                >
                  Archive Batch
                </button>
              </>
            )}



            {/* Mass Office Transfer */}
            <div className="h-6 w-px bg-white/10 hidden sm:block"></div>
            <div className="flex items-center space-x-2">
              <span className="text-[8px] font-black uppercase text-gray-400 hidden lg:inline">Office Transfer:</span>
              <select
                onChange={(e) => {
                  if (e.target.value) {
                    handleBulkOfficeTransfer(e.target.value);
                    e.target.value = "";
                  }
                }}
                className="bg-gray-800 text-white text-[9px] font-black uppercase tracking-wider rounded-xl p-2 border border-white/10 outline-none cursor-pointer max-w-[130px]"
              >
                <option value="">-- Issue Custody --</option>
                {offices.map((off) => (
                  <option key={off.id} value={off.name}>
                    {off.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-[9px] md:text-[10px] font-black uppercase tracking-[0.1em] text-white/60 hover:text-white"
          >
            Deselect All
          </button>
        </div>
      )}



      {activeSubTab === "items" ? (
        <>
          {/* Main Header / Filters controls */}
          <div className="p-4 md:p-8 border-b border-gray-50 flex flex-col xl:flex-row xl:items-center justify-between gap-4 md:gap-6">
            <div className="min-w-0 flex flex-col md:flex-row md:items-center justify-between gap-4 w-full">
              <div>
                <h2 className="text-lg md:text-xl font-black text-gray-900 font-brand uppercase tracking-tight">
                  {showArchivedItems ? "Archived Asset Register" : "Active Asset Register"}
                </h2>
                <p className="text-[9px] md:text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                  Admin Unified Municipal Inventory Ledger
                </p>
              </div>

            </div>

            <div className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-2 sm:gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <svg
                  className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder="Search Article, Property ID, Staff..."
                  className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-transparent focus:border-blue-200 outline-none rounded-2xl text-[10px] font-bold uppercase tracking-widest transition-all"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>


              <select
                value={yearFilter}
                onChange={(e) => setYearFilter(e.target.value)}
                className="bg-gray-50 border border-transparent rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none text-gray-500 focus:border-blue-200"
              >
                <option value="">Purchase Year</option>
                {Array.from(
                  new Set(
                    items.map((item) => String(item.yearPurchased || "")),
                  ),
                )
                  .filter(Boolean)
                  .sort()
                  .map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
              </select>

              {showArchivedItems && (
                <select
                  value={archiveReasonFilter}
                  onChange={(e) => setArchiveReasonFilter(e.target.value)}
                  className="bg-gray-50 border border-transparent rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-widest outline-none text-gray-500 focus:border-blue-200"
                >
                  <option value="">ALL</option>
                  <option value="EXPIRED">Expired</option>
                  <option value="DAMAGED">Damaged</option>
                </select>
              )}

              {(searchTerm || yearFilter || archiveReasonFilter) && (
                <button
                  onClick={() => {
                    setSearchTerm("");
                    setYearFilter("");
                    setArchiveReasonFilter("");
                  }}
                  className="px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all bg-red-50 text-red-500 hover:bg-red-100 border border-red-100"
                >
                  Clear Filters
                </button>
              )}

              <button
                onClick={() => setShowArchivedItems(!showArchivedItems)}
                className={`px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${showArchivedItems ? "bg-amber-500 text-white shadow-lg shadow-amber-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
                title={showArchivedItems ? "Show active items" : "Show archived items"}
              >
                {showArchivedItems ? "Active Items" : "Archive"}
              </button>
              <button
                onClick={() => setShowRapidEntry(!showRapidEntry)}
                className={`px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all ${showRapidEntry ? "bg-blue-600 text-white shadow-lg shadow-blue-100" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}
              >
                Rapid Row
              </button>
              {userRole !== UserRole.STAFF && userRole !== UserRole.ACCOUNTING && (
                <button
                  onClick={() => setShowCsvImport(true)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 text-center flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  <span>Import CSV</span>
                </button>
              )}
            </div>
          </div>

          <div className="flex-1 overflow-x-auto scrollbar-hide">
            <table className="w-full text-left text-[10px] font-bold min-w-[850px]">
              <thead>
                <tr className="bg-gray-50/50 text-gray-400 font-black uppercase tracking-[0.1em] border-b border-gray-100">
                  <th className="px-4 md:px-8 py-4 w-10">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded border-gray-300"
                      checked={
                        filteredItems.length > 0 &&
                        selectedIds.size === filteredItems.length
                      }
                      onChange={toggleSelectAll}
                    />
                  </th>
                  <th className="px-2 py-4">Item Name</th>
                  <th className="px-4 py-4">Equipment Type</th>
                  <th className="px-4 py-4">Person Responsible</th>
                  <th className="px-4 py-4">Department</th>
                  <th className="px-4 py-4 text-center">Qty</th>
                  <th className="px-4 py-4 text-right">Operation (Ops)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {showRapidEntry && (
                  <tr className="bg-blue-50/30 animate-in slide-in-from-top duration-300">
                    <td className="px-4 md:px-8 py-4 flex items-center justify-center">
                      <div className="w-4 h-4 bg-blue-600 rounded-full animate-pulse"></div>
                    </td>
                    <td className="px-2 py-4">
                      <div className="flex gap-2">
                        <input
                          value={rapidItem.article}
                          onChange={(e) =>
                            setRapidItem({
                              ...rapidItem,
                              article: e.target.value,
                            })
                          }
                          className="flex-1 bg-white border border-blue-200 rounded-lg px-2 py-1 uppercase text-[10px]"
                          placeholder="ARTICLE"
                        />
                        <input
                          value={rapidItem.propNo}
                          onChange={(e) =>
                            setRapidItem({
                              ...rapidItem,
                              propNo: e.target.value,
                            })
                          }
                          className="flex-1 bg-white border border-blue-200 rounded-lg px-2 py-1 uppercase text-[10px]"
                          placeholder="PROPERTY NO"
                        />
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <select
                        value={rapidItem.category}
                        onChange={(e) =>
                          setRapidItem({
                            ...rapidItem,
                            category: e.target.value,
                          })
                        }
                        className="bg-white border border-blue-200 rounded-lg px-2 py-1 text-[10px]"
                      >
                        {CATEGORIES.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4">-</td>
                    <td className="px-4 py-4">
                      <select
                        value={rapidItem.office || ""}
                        onChange={(e) =>
                          setRapidItem({
                            ...rapidItem,
                            office: e.target.value,
                          })
                        }
                        className="bg-white border border-blue-200 rounded-lg px-2 py-1 text-[10px] w-full"
                      >
                        <option value="">Default Office</option>
                        {offices.map((o) => (
                          <option key={o.id} value={o.name}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-4 text-center">-</td>
                    <td className="px-4 py-4 text-right space-x-2">
                      <button
                        onClick={() => setShowRapidEntry(false)}
                        className="bg-gray-200 text-gray-500 px-4 py-1 rounded-lg text-[9px] font-black uppercase hover:bg-gray-300 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleRapidSave}
                        className="bg-blue-600 text-white px-4 py-1 rounded-lg text-[9px] font-black uppercase hover:bg-blue-700 transition-all shadow-md shadow-blue-100 font-black"
                      >
                        Submit
                      </button>
                    </td>
                  </tr>
                )}

                {filteredItems.length > 0 ? (
                  <AnimatePresence>
                    {filteredItems.map((item) => (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -6 }}
                        transition={{ duration: 0.15, ease: "easeInOut" }}
                        className={`hover:bg-blue-50/30 hover:shadow-md hover:scale-[1.003] transition-all duration-200 group cursor-pointer ${selectedIds.has(item.id) ? "bg-blue-50/40" : ""}`}
                      >
                      <td className="px-4 md:px-8 py-4">
                        <input
                          type="checkbox"
                          className="w-4 h-4 rounded border-gray-300"
                          checked={selectedIds.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                        />
                      </td>
                      <td className="px-2 py-4">
                        <div className="min-w-0">
                          <div className="flex items-center space-x-1.5 flex-wrap gap-y-1">
                            <span className="text-gray-900 font-black uppercase tracking-tight text-[11px] truncate max-w-[200px]">
                              {item.article}
                            </span>
                            {item.isArchived && (
                              <span className="bg-red-100 text-red-700 text-[6.5px] px-1.5 py-0.5 rounded-full font-black border border-red-200 tracking-wider uppercase">
                                {item.archiveReason === 'EXPIRED' ? 'EXPIRED' : 'DAMAGED'}
                              </span>
                            )}
                            {isExpiredInventoryItem(item) && !item.isArchived && (
                              <span className="bg-red-100 text-red-600 text-[6.5px] px-1.5 py-0.5 rounded-full font-black border border-red-200 tracking-wider uppercase animate-pulse">
                                EXPIRED
                              </span>
                            )}
                            {isItemExpiringSoon(item) && !item.isArchived && (
                              <span className="bg-amber-100 text-amber-700 text-[6.5px] px-1.5 py-0.5 rounded-full font-black border border-amber-200 tracking-wider uppercase">
                                EXPIRING SOON
                              </span>
                            )}
                            {item.condition === 'Damaged' && !item.isArchived && (
                              <span className="bg-orange-100 text-orange-700 text-[6.5px] px-1.5 py-0.5 rounded-full font-black border border-orange-200 tracking-wider uppercase">
                                DAMAGED
                              </span>
                            )}
                            {item.isOfflinePending && (
                              <span className="bg-amber-100 text-amber-800 text-[6.5px] px-1.5 py-0.5 rounded-full font-black animate-pulse border border-amber-300 tracking-wider uppercase">
                                Offline Pending
                              </span>
                            )}
                          </div>
                          <div className="text-[8px] text-gray-400 font-mono tracking-tighter mt-0.5 truncate max-w-[200px]">
                            {item.propertyNumber}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-2 py-0.5 rounded-lg border border-blue-100 uppercase tracking-widest">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs font-bold text-gray-600 leading-snug">
                        <div>
                          Rec:{" "}
                          <span className="font-extrabold uppercase text-gray-900">
                            {item.personAccountable || "Pending"}
                          </span>
                        </div>
                        <div className="text-[8px] opacity-75">
                          Assignee: {item.assignedStaff || "Unassigned"}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <span className="text-[9px] font-extrabold text-blue-700 bg-blue-50/60 border border-blue-100 px-2 py-1 rounded-md uppercase tracking-tight">
                          {item.office || "General/Unassigned"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-center">
                        <span className="font-extrabold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md text-xs shadow-xs border border-slate-200">
                          {item.qtyPhysicalCount || 1}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right space-x-2 md:space-x-4">

                        <button
                          onClick={() => setShowQRModal(item)}
                          className="text-gray-300 hover:text-emerald-600 transition-colors"
                          title="Generate QR Code"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2.5"
                              d="M12 4v1m0 11v1m4-12h1m-1 4h1m-1 4h1m-1 4h1m-7 4h1m-1-4h1m-1-4h1m-1-4h1m-1-4h1M4 12V4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm0 16v-4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zm16 0v-4a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => setDetailItem(item)}
                          className="text-gray-300 hover:text-blue-600 transition-colors"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2.5"
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2.5"
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => openEditModal(item)}
                          disabled={userRole === UserRole.STAFF || userRole === UserRole.ACCOUNTING}
                          className={`text-gray-300 hover:text-yellow-600 transition-colors ${userRole === UserRole.STAFF || userRole === UserRole.ACCOUNTING ? "opacity-30 cursor-not-allowed" : ""}`}
                          title="Edit Item"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2.5"
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                            />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleArchiveItem(item, 'DAMAGED')}
                          disabled={userRole !== UserRole.ADMIN || item.isArchived}
                          className={`transition-colors ${userRole === UserRole.ADMIN && !item.isArchived ? "text-gray-300 hover:text-amber-600" : "text-gray-200 opacity-40 cursor-not-allowed"}`}
                          title={item.isArchived ? "Archived" : "Mark damaged and archive quantity"}
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M3 7h18M5 7l1 13h12l1-13M9 7V4h6v3" />
                          </svg>
                        </button>
                        <button
                          onClick={() => {
                            setDeleteTarget(item.id);
                            setShowDeleteConfirm(true);
                          }}
                          disabled={
                            userRole === UserRole.STAFF ||
                            userRole === UserRole.ACCOUNTING
                          }
                          className={`text-gray-300 hover:text-red-600 transition-colors ${userRole === UserRole.STAFF || userRole === UserRole.ACCOUNTING ? "opacity-30 cursor-not-allowed" : ""}`}
                          title="Delete Item"
                        >
                          <svg
                            className="w-4 h-4"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2.5"
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </td>
                    </motion.tr>
                  ))}
                  </AnimatePresence>
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-8 py-20 text-center text-gray-300 font-black uppercase tracking-[0.2em]"
                    >
                      No Records Found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : activeSubTab === "receiving" ? (
        <div className="p-6 md:p-10 flex-grow flex flex-col space-y-8 bg-slate-50">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
                Supplier Shipment Cargo Desk
              </h3>
              <p className="text-[10px] text-gray-500 uppercase font-bold tracking-widest mt-1">
                Admin Standard Operating Procurement Pipeline
              </p>
            </div>
            <button
              onClick={() => setShowShipmentModal(true)}
              className="flex items-center space-x-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-200/60 active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" />
              </svg>
              <span>Lodge New Cargo</span>
            </button>
          </div>

          <div className="w-full">
            {/* Approved Cargo Ready to Receive */}
            <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-4 w-full">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div>
                  <h4 className="font-brand font-black text-xs uppercase text-emerald-600 tracking-wider">
                    Approved Cargo Ready to Receive & Verify
                  </h4>
                  <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-1">
                    Receive into the selected destination department inventory
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={cargoDepartmentFilter}
                    onChange={(event) => setCargoDepartmentFilter(event.target.value)}
                    className="max-w-[180px] bg-slate-50 border border-slate-200 text-slate-700 px-2.5 py-2 rounded-lg text-[9px] font-black uppercase tracking-wider outline-none focus:border-emerald-500"
                    aria-label="Filter cargo by destination department"
                  >
                    <option value="">All Departments</option>
                    {cargoDepartments.map(department => (
                      <option key={department} value={department}>{department}</option>
                    ))}
                  </select>
                  <span className="text-[9px] font-black bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full uppercase whitespace-nowrap">
                    {visibleCargo.length} Ready
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[550px] overflow-y-auto scrollbar-hide">
                {visibleCargo.length > 0 ? (
                  visibleCargo.map((req) => (
                    <div
                      key={req.id}
                      className="p-4 bg-emerald-50/40 rounded-2xl border border-emerald-100/40 flex flex-col justify-between space-y-3 font-brand"
                    >
                      <div>
                        <div className="flex justify-between items-start">
                          <h5 className="font-brand font-black text-xs text-emerald-955 uppercase tracking-tight">
                            {req.itemArticle}
                          </h5>
                          <span className={`text-[8px] font-brand font-black uppercase tracking-widest px-2.5 py-0.5 rounded-full ${req.status === 'Completed' ? 'bg-green-150 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}>
                            {req.status || 'Pending'}
                          </span>
                        </div>

                        {(req as any).isPRS ? (
                          /* Office Head purchase request: same fields as the Office Head form */
                          <div className="mt-3 grid grid-cols-2 gap-2 bg-white/60 p-3 rounded-xl border border-emerald-100/30 text-[9px] font-mono leading-relaxed">
                            <div>
                              <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Date</span>
                              <span className="text-emerald-900 font-bold">{(req as any).datePurchased || "N/A"}</span>
                            </div>
                            <div>
                              <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">PR No.</span>
                              <span className="text-emerald-900 font-bold">{req.slipNumber || "Not yet assigned"}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Description</span>
                              <span className="text-emerald-900 font-bold uppercase">{req.itemArticle || "N/A"}</span>
                            </div>
                            <div>
                              <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Office</span>
                              <span className="text-emerald-900 font-bold">{req.office || "N/A"}</span>
                            </div>
                            <div>
                              <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Source of Fund</span>
                              <span className="text-emerald-900 font-bold">{(req as any).fundingSource || "N/A"}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Person Accountable</span>
                              <span className="text-emerald-900 font-bold uppercase">{(req as any).personAccountable || "N/A"}</span>
                            </div>
                            <div className="col-span-2 bg-emerald-50/70 p-1.5 rounded-lg border border-emerald-100 flex items-center justify-between mt-0.5">
                              <span className="text-gray-500 font-sans font-extrabold uppercase text-[8px] tracking-wider">Amount:</span>
                              <span className="text-indigo-700 font-black text-xs">₱{Number((req as any).amount ?? (req.unitValue || 0) * (req.quantity || 1)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                            <div className="col-span-2">
                              <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Remarks</span>
                              <span className="text-emerald-955 font-bold font-sans">{(req as any).justification || "None"}</span>
                            </div>
                          </div>
                        ) : (
                        <div className="mt-3 grid grid-cols-2 gap-2 bg-white/60 p-3 rounded-xl border border-emerald-100/30 text-[9px] font-mono leading-relaxed">
                          <div>
                            <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Procurement No</span>
                            <span className="text-emerald-900 font-bold">{req.slipNumber || ((req as any).isPRS ? "Not yet assigned" : "N/A")}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Office Name</span>
                            <span className="text-emerald-900 font-bold">{req.office || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Office Head / Buyer</span>
                            <span className="text-emerald-900 font-bold">{(req as any).requestedBy || (req as any).targetOfficeHead || (req as any).officeHead || "Office Head"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Supplier</span>
                            <span className="text-emerald-900 font-bold">{req.supplier || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Date Purchased</span>
                            <span className="text-emerald-900 font-bold">{(req as any).datePurchased || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Expected Delivery</span>
                            <span className="text-emerald-900 font-bold">{(req as any).expectedDeliveryDate || "Pending Delivery"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Category</span>
                            <span className="text-emerald-900 font-bold">{req.category || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Item Expiry</span>
                            <span className="text-emerald-900 font-bold">{(req as any).expirationDate || "N/A"}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">PO / Invoice</span>
                            <span className="text-emerald-900 font-bold">{(req as any).poNumber || "N/A"} / {(req as any).invoiceNumber || "N/A"}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Specifications / Justification</span>
                            <span className="text-emerald-955 font-bold font-sans capitalize">{(req as any).justification || (req as any).description || (req as any).details || "No specification details provided."}</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Quantity</span>
                            <span className="text-emerald-900 font-bold">{req.quantity} units</span>
                          </div>
                          <div>
                            <span className="text-gray-400 block font-sans font-extrabold uppercase text-[7px] tracking-wider">Item Price (Unit Cost)</span>
                            <span className="text-emerald-900 font-bold">₱{Number(req.unitValue || 0).toLocaleString()}</span>
                          </div>
                          <div className="col-span-2 bg-emerald-50/70 p-1.5 rounded-lg border border-emerald-100 flex items-center justify-between mt-0.5">
                            <span className="text-gray-500 font-sans font-extrabold uppercase text-[8px] tracking-wider">Total Amount:</span>
                            <span className="text-indigo-700 font-black text-xs">₱{Number((req.unitValue || 0) * (req.quantity || 1)).toLocaleString()}</span>
                          </div>
                        </div>
                        )}

                        {!(req as any).isPRS && req.mayorRemarks && (
                          <p className="text-[8.5px] text-gray-500 font-medium italic mt-2 leading-relaxed font-sans">
                            Remarks: "{req.mayorRemarks}"
                          </p>
                        )}
                      </div>
                      <div className="pt-2 border-t border-emerald-100/70 flex items-center justify-between">
                        <span className="font-brand font-black text-xs text-emerald-900">
                          ₱{(req.unitValue * req.quantity).toLocaleString()}
                        </span>
                        <div className="flex items-center gap-2">
                          {(req as any).isPRS && userRole === UserRole.ADMIN && (
                            <button
                              onClick={() => openPurchaseEditor(req.id)}
                              className="px-3 py-2.5 bg-white hover:bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all font-brand cursor-pointer"
                            >
                              View / Edit
                            </button>
                          )}
                          <button
                            onClick={() => setReceivingItem(req as ReceivingRequest)}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-lg shadow-emerald-200/50 font-brand cursor-pointer"
                          >
                            Receive & Register Items
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                    <div className="col-span-2 text-center py-16 text-gray-400 font-bold text-[9px] uppercase tracking-widest">
                    {cargoDepartmentFilter ? `No approved purchases for ${cargoDepartmentFilter}.` : 'No approved shipments ready.'}
                  </div>
                )}
              </div>

              {/* Engineer/Admin: view and edit a purchase request before receiving it */}
              {editingPurchase && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
                  <form
                    onSubmit={handleSavePurchaseEdit}
                    className="bg-white rounded-[28px] shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-4 font-brand"
                  >
                    <div className="flex items-start justify-between border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="font-black text-slate-900 text-lg uppercase tracking-tight">Purchase Request</h3>
                        <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest mt-0.5">View and edit details before receiving</p>
                      </div>
                      <button type="button" onClick={() => setEditingPurchase(null)} className="text-slate-400 hover:text-slate-700 text-xl leading-none px-2" aria-label="Close">×</button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="space-y-1.5 block">
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Date <span className="text-red-500">*</span></span>
                        <input type="date" required value={editingPurchase.datePurchased}
                          onChange={e => setEditingPurchase({ ...editingPurchase, datePurchased: e.target.value })}
                          className="w-full px-3 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 outline-none rounded-xl font-bold text-xs" />
                      </label>
                      <label className="space-y-1.5 block">
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">PR No.</span>
                        <input placeholder="Assign PR No., e.g. PR-2026-001" value={editingPurchase.slipNumber}
                          onChange={e => setEditingPurchase({ ...editingPurchase, slipNumber: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 outline-none rounded-xl font-bold text-xs uppercase" />
                      </label>
                    </div>

                    <label className="space-y-1.5 block">
                      <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Description <span className="text-red-500">*</span></span>
                      <input required value={editingPurchase.itemArticle}
                        onChange={e => setEditingPurchase({ ...editingPurchase, itemArticle: e.target.value })}
                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 outline-none rounded-xl font-bold text-xs uppercase" />
                    </label>

                    <label className="space-y-1.5 block">
                      <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Office <span className="text-red-500">*</span></span>
                      <select value={editingPurchase.office}
                        onChange={e => setEditingPurchase({ ...editingPurchase, office: e.target.value })}
                        className="w-full px-3 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 outline-none rounded-xl font-bold text-xs">
                        {Array.from(new Set([editingPurchase.office, ...offices.map(o => o.name)].filter(Boolean))).map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </label>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <label className="space-y-1.5 block">
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Source of Fund</span>
                        <input value={editingPurchase.fundingSource}
                          onChange={e => setEditingPurchase({ ...editingPurchase, fundingSource: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 outline-none rounded-xl font-bold text-xs" />
                      </label>
                      <label className="space-y-1.5 block">
                        <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Amount (₱) <span className="text-red-500">*</span></span>
                        <input type="number" min={0} step="any" required value={editingPurchase.amount}
                          onChange={e => setEditingPurchase({ ...editingPurchase, amount: e.target.value })}
                          className="w-full px-4 py-3 bg-slate-50 border border-slate-200 focus:border-emerald-500 outline-none rounded-xl font-bold text-xs" />
                      </label>
                    </div>

                    <label className="space-y-1.5 block">
                      <span className="text-[9px] font-black text-gray-600 uppercase tracking-widest ml-1">Remarks</span>
                      <textarea rows={3} value={editingPurchase.justification}
                        onChange={e => setEditingPurchase({ ...editingPurchase, justification: e.target.value })}
                        className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:border-emerald-500 outline-none rounded-xl font-bold text-xs resize-none" />
                    </label>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                      <button type="button" onClick={() => setEditingPurchase(null)}
                        className="px-5 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-50">
                        Cancel
                      </button>
                      <button type="submit" disabled={savingPurchase}
                        className="px-6 py-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-200/50">
                        {savingPurchase ? 'Saving...' : 'Save Changes'}
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </div>

            {/* 3. Historical Approved/Declined logs */}
            <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm lg:col-span-3 space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h4 className="font-brand font-black text-xs uppercase text-slate-800 tracking-wider font-brand">
                  Completed Supplier Logistics Log
                </h4>
                <span className="text-[9px] font-black text-gray-400 font-brand">
                  Archived Stream
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-[9px] uppercase font-bold text-slate-700">
                  <thead>
                    <tr className="border-b border-gray-50 text-gray-400 font-black">
                      <th className="py-2.5">Date</th>
                      <th className="py-2.5">Cargo Nomenclature</th>
                      <th className="py-2.5">Supplier</th>
                      <th className="py-2.5">Target Dept</th>
                      <th className="py-2.5 text-center">Qty</th>
                      <th className="py-2.5 text-right">Value</th>
                      <th className="py-2.5 text-right">Audit Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {combinedCompleted.length > 0 ? (
                      combinedCompleted.map((req) => (
                        <tr key={req.id}>
                          <td className="py-3 text-gray-400">
                            {req.deliveryDate?.substring(0, 10) || "N/A"}
                          </td>
                          <td className="py-3 font-black text-slate-900">
                            {req.itemArticle}
                            {req.isPRS && (
                              <span className="ml-2 text-[8px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-tight">
                                PRS: {req.slipNumber}
                              </span>
                            )}
                          </td>
                          <td className="py-3 text-gray-500">
                            {req.supplier}
                          </td>
                          <td className="py-3 text-gray-500">{req.office}</td>
                          <td className="py-3 text-center">{req.quantity}</td>
                          <td className="py-3 text-right">
                            ₱{(req.unitValue * req.quantity).toLocaleString()}
                          </td>
                          <td className="py-3 text-right">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[8px] font-black ${
                                req.status === "RECEIVED" || req.status === "Completed"
                                  ? "bg-blue-50 text-blue-600"
                                  : "bg-red-50 text-red-600"
                              }`}
                            >
                              {req.status === "RECEIVED" || req.status === "Completed"
                                ? "RECEIVED & REGISTERED"
                                : "EXECUTIVE REJECTED"}
                            </span>
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td
                          colSpan={7}
                          className="text-center py-6 text-gray-300"
                        >
                          No logs archived yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : activeSubTab === "transfers" ? (
        <div className="p-6 md:p-10 flex-grow flex flex-col space-y-8 bg-slate-50">
          <InventoryTransferReport
            items={items}
            userRole={userRole}
            userOffice={userOffice || (offices && offices.length > 0 ? offices[0].name : "General Office")}
            userName={userName}
            onUpdateItem={onUpdateItem}
          />
        </div>
      ) : (
        <div className="p-6 md:p-10 flex-grow flex flex-col space-y-8 bg-slate-50">
          <div>
            <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">
              Municipal Requests Desk
            </h3>
            <p className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mt-1">
              Review and send internal item requests for department offices
            </p>
          </div>

          <div className="grid grid-cols-1 gap-6">
            <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h4 className="font-brand font-black text-xs uppercase text-indigo-600 tracking-wider">
                  Active Accounting Requests
                </h4>
                <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-full uppercase animate-pulse">
                  {
                    assetRequests.filter(
                      (r) => r.status === "PENDING" || r.status === "FORWARDED"
                    ).length
                  }{" "}
                  Outstanding
                </span>
              </div>
              <div className="space-y-4">
                {assetRequests.length > 0 ? (
                  assetRequests.map((req) => {
                    const isPending = req.status === "PENDING";
                    const isForwarded = req.status === "FORWARDED";
                    const canHandle = isPending || isForwarded;
                    return (
                      <div
                        key={req.id}
                        className="p-5 bg-slate-50 rounded-2xl border border-slate-150 flex flex-col space-y-3 font-brand"
                      >
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 text-left">
                          <div>
                            <div className="flex items-center space-x-2">
                              <span
                                className={`px-2.5 py-0.5 rounded-full text-[8.5px] font-black uppercase ${
                                  req.status === "PENDING"
                                    ? "bg-amber-100 text-amber-700 animate-pulse"
                                    : req.status === "FORWARDED"
                                      ? "bg-indigo-100 text-indigo-750"
                                      : req.status === "APPROVED"
                                        ? "bg-emerald-100 text-emerald-800"
                                        : "bg-red-100 text-red-700"
                                }`}
                              >
                                {req.status === "PENDING"
                                  ? "Pending Allocation Pre-Audit"
                                  : req.status === "FORWARDED"
                                    ? "Forwarded to Admin"
                                    : req.status}
                              </span>
                              <span className="text-[8px] text-gray-400 font-bold">
                                {new Date(req.requestedAt).toLocaleDateString()}
                              </span>
                            </div>
                            <h5 className="font-black text-xs text-slate-900 uppercase mt-2">
                              {req.quantity}x {req.itemArticle}
                            </h5>
                            <p className="text-[10px] text-gray-500 font-bold uppercase">
                              Office: {req.office} &bull; Requested by:{" "}
                              {req.requestedBy}
                            </p>
                            <p className="text-[9.5px] text-gray-500 italic mt-1 font-semibold">
                              Justification: "{req.justification}"
                            </p>
                            {req.responseRemarks && (
                              <p className="text-[9.5px] text-indigo-600 font-bold mt-2 bg-white px-3 py-2 border border-blue-50 rounded-lg shadow-sm">
                                Logbook Remarks: {req.responseRemarks}{" "}
                                {req.handledBy && `(By: ${req.handledBy})`}
                              </p>
                            )}
                          </div>

                          {canHandle && (
                            <div className="space-y-2 bg-white p-4 rounded-xl border border-gray-150 w-full md:max-w-xs text-[10px]">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">
                                Administrative Actions
                              </span>
                              <input
                                placeholder="Audit logs remarks / note..."
                                id={`remarks-${req.id}`}
                                className="w-full bg-slate-50 border border-slate-200 py-1.5 px-3.5 rounded-lg text-xs font-semibold outline-none"
                              />
                              <div className="grid grid-cols-2 gap-2 pt-1 font-black text-[9px] uppercase tracking-widest">
                                {userRole === "ADMIN" ? (
                                  <>
                                    <button
                                      onClick={() => {
                                        const inp = document.getElementById(
                                          `remarks-${req.id}`
                                        ) as HTMLInputElement;
                                        handleDeclineAssetRequest(req, inp?.value);
                                      }}
                                      className="py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-md font-black text-center"
                                    >
                                      Reject
                                    </button>
                                    <button
                                      onClick={() => {
                                        const inp = document.getElementById(
                                          `remarks-${req.id}`
                                        ) as HTMLInputElement;
                                        handleApproveAssetRequest(req, inp?.value);
                                      }}
                                      className="py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-md font-black text-center"
                                    >
                                      Approve
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <button
                                      onClick={() => {
                                        const inp = document.getElementById(
                                          `remarks-${req.id}`
                                        ) as HTMLInputElement;
                                        handleDeclineAssetRequest(req, inp?.value);
                                      }}
                                      className="py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-center"
                                    >
                                      Decline
                                    </button>
                                    {isPending ? (
                                      <button
                                        onClick={() => {
                                          const inp = document.getElementById(
                                            `remarks-${req.id}`
                                          ) as HTMLInputElement;
                                          handleForwardAssetRequest(req, inp?.value);
                                        }}
                                        className="py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md text-center"
                                      >
                                        Forward to Admin
                                      </button>
                                    ) : (
                                      <button
                                        onClick={() => {
                                          const inp = document.getElementById(
                                            `remarks-${req.id}`
                                          ) as HTMLInputElement;
                                          handleApproveAssetRequest(req, inp?.value);
                                        }}
                                        disabled={true}
                                        className="py-2 bg-gray-300 text-gray-400 cursor-not-allowed rounded-lg shadow-md text-center"
                                        title="Only GSO Admin can approve requests"
                                      >
                                        Approve
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="text-center py-20 text-gray-400 font-bold text-[9px] uppercase tracking-widest">
                    No requests submitted.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Lodge Shipment Modal */}
      {showShipmentModal && (
        <SupplierShipmentModal
          isOpen={showShipmentModal}
          onClose={() => setShowShipmentModal(false)}
          userRole={userRole}
          userName={userName}
          offices={offices}
        />
      )}

      {/* Receive Signature Finalize Dialog */}
      {receivingItem && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] md:rounded-[40px] w-full max-w-sm p-8 space-y-6 shadow-2xl animate-in zoom-in duration-200 text-left">
            <div>
              <h4 className="font-brand font-black text-lg text-emerald-955 uppercase">
                Accept Cargo Delivery
              </h4>
              <p className="text-[9px] text-gray-400 uppercase tracking-widest font-bold mt-1">
                This registers the cargo into the active public municipal
                ledger.
              </p>
            </div>

            <div className="space-y-2.5 bg-emerald-50/30 p-4 rounded-2xl border border-emerald-100/40 text-xs font-mono">
              <div className="flex justify-between items-center border-b border-emerald-100 pb-1.5">
                <span className="text-[9px] text-gray-400 font-sans font-bold uppercase">PR Slip No:</span>
                <span className="font-black font-sans text-emerald-950 uppercase">{receivingItem.slipNumber || "N/A"}</span>
              </div>
              <p className="text-[10px] text-zinc-700 uppercase font-bold font-mono">
                Item Name:{" "}
                <span className="font-black font-sans text-emerald-900">
                  {receivingItem.itemArticle}
                </span>
              </p>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div>
                  <span className="text-gray-400 font-sans block text-[8px] uppercase font-extrabold">Item Price:</span>
                  <span className="font-black text-emerald-900 font-sans">₱{Number(receivingItem.unitValue || 0).toLocaleString()}</span>
                </div>
                <div>
                  <span className="text-gray-400 font-sans block text-[8px] uppercase font-extrabold">Quantity:</span>
                  <span className="font-black text-emerald-900 font-sans">{receivingItem.quantity} units</span>
                </div>
              </div>
              <div className="bg-emerald-100/60 p-2 rounded-lg flex justify-between items-center text-xs">
                <span className="text-[9px] font-black text-emerald-800 font-sans uppercase">Total Price:</span>
                <span className="font-black text-indigo-700 font-sans">₱{Number((receivingItem.unitValue || 0) * (receivingItem.quantity || 1)).toLocaleString()}</span>
              </div>
              <div className="space-y-1 pt-1 text-[9.5px]">
                <p className="text-zinc-700 font-sans">
                  <span className="text-gray-400 font-bold uppercase">Office Head / Buyer:</span>{" "}
                  <span className="font-black text-emerald-950 uppercase">{(receivingItem as any).requestedBy || (receivingItem as any).targetOfficeHead || "Office Head"}</span>
                </p>
                <p className="text-zinc-700 font-sans">
                  <span className="text-gray-400 font-bold uppercase">Target Office:</span>{" "}
                  <span className="font-black text-emerald-955 uppercase">{receivingItem.office}</span>
                </p>
                <p className="text-zinc-700 font-sans">
                  <span className="text-gray-400 font-bold uppercase">Date Purchased:</span>{" "}
                  <span className="font-black text-emerald-900">{(receivingItem as any).datePurchased || "N/A"}</span>
                </p>
                <p className="text-zinc-700 font-sans">
                  <span className="text-gray-400 font-bold uppercase">Expected Delivery:</span>{" "}
                  <span className="font-black text-emerald-900">{(receivingItem as any).expectedDeliveryDate || "Pending Delivery"}</span>
                </p>
                <p className="text-zinc-700 font-sans">
                  <span className="text-gray-400 font-bold uppercase">Supplier:</span>{" "}
                  <span className="font-black text-emerald-900">{receivingItem.supplier || "N/A"}</span>
                </p>
                <p className="text-zinc-700 font-sans">
                  <span className="text-gray-400 font-bold uppercase">Category:</span>{" "}
                  <span className="font-black text-emerald-900">{receivingItem.category || "N/A"}</span>
                </p>
                <p className="text-zinc-700 font-sans">
                  <span className="text-gray-400 font-bold uppercase">Item Expiry:</span>{" "}
                  <span className="font-black text-emerald-900">{(receivingItem as any).expirationDate || "N/A"}</span>
                </p>
                <p className="text-zinc-700 font-sans">
                  <span className="text-gray-400 font-bold uppercase">PO / Invoice:</span>{" "}
                  <span className="font-black text-emerald-900">{(receivingItem as any).poNumber || "N/A"} / {(receivingItem as any).invoiceNumber || "N/A"}</span>
                </p>
                <div className="border-t border-emerald-100 pt-2 text-zinc-700 font-sans">
                  <span className="text-gray-400 font-bold uppercase">Specifications / Justification:</span>
                  <p className="font-black text-emerald-900 mt-0.5">{(receivingItem as any).justification || (receivingItem as any).description || "No specification details provided."}</p>
                </div>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest font-brand">
                Assign Person Responsible / Assigned Employee
              </label>
              <input
                required
                value={receivingCustodian}
                onChange={(e) => setReceivingCustodian(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                placeholder="Full Name of Person Responsible"
              />
              <p className="text-[8px] text-gray-400 italic font-brand">
                This individual signs Property Acknowledgement Receipts (PAR) or Inventory Custodian Slips (ICS).
              </p>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setReceivingItem(null);
                  setReceivingCustodian("");
                }}
                className="flex-1 py-3.5 text-[9px] font-black uppercase text-gray-400 font-brand"
              >
                Cancel
              </button>
              <button
                onClick={() => handleFinalizeReceiving(receivingItem)}
                className="flex-1 py-3.5 bg-emerald-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-xl flex items-center justify-center font-brand cursor-pointer"
              >
                Receive & Register Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Asset Detail Modal */}
      {detailItem && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] md:rounded-[48px] w-full max-w-4xl shadow-2xl overflow-hidden animate-in zoom-in duration-300 flex flex-col max-h-[92vh]">
            <div className="p-6 md:p-10 border-b border-gray-50 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-xl md:text-2xl font-black text-gray-900 font-brand uppercase tracking-tight truncate pr-4">
                  {detailItem.article}
                </h3>
                <p className="text-[8px] md:text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1 truncate">
                  {detailItem.propertyNumber} • {detailItem.office}
                </p>
              </div>
              <button
                onClick={() => setDetailItem(null)}
                className="flex-shrink-0 p-2 md:p-3 bg-gray-50 hover:bg-gray-100 rounded-2xl transition-all"
              >
                <svg
                  className="w-5 h-5 md:w-6 md:h-6 text-gray-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 md:p-10 grid grid-cols-1 gap-6 leading-relaxed">

              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Unit Value
                    </p>
                    <span className="text-xs font-black text-gray-900">
                      ₱{detailItem.unitValue.toLocaleString()}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Year Purchased
                    </p>
                    <span className="text-xs font-black text-gray-900">
                      {detailItem.yearPurchased || "N/A"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Asset Code
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.assetCode || "N/A"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Serial / Part Number
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.serialNumber || "N/A"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Model Number
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.modelNumber || "N/A"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Unit of Measure
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.unitOfMeasure || "unit"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Accountable Officer
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.personAccountable || "Pending"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Assigned Staff / End User
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.assignedStaff || "Unassigned"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Date Assigned
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.dateAssigned || "N/A"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Date Received
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.dateReceived || "N/A"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Warranty Expiration
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.warrantyExpiration || "N/A"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black uppercase tracking-widest mb-1">
                      {isExpiredInventoryItem(detailItem) ? <span className="text-red-600">Item Expiration (EXPIRED)</span> : isItemExpiringSoon(detailItem) ? <span className="text-amber-600">Item Expiration (Expiring Soon)</span> : <span className="text-gray-400">Item Expiration Date</span>}
                    </p>
                    <span className={`text-xs font-black truncate block ${
                      isExpiredInventoryItem(detailItem) ? 'text-red-600' :
                      isItemExpiringSoon(detailItem) ? 'text-amber-600' : 'text-gray-900'
                    }`}>
                      {detailItem.expirationDate || "Not Set"}
                    </span>
                  </div>
                  {detailItem.isArchived && (
                    <div className="bg-red-50 p-3 rounded-xl border border-red-100">
                      <p className="text-[8px] font-black text-red-500 uppercase tracking-widest mb-1">
                        Archive Information
                      </p>
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-red-700">
                          Reason: {detailItem.archiveReason || 'N/A'}
                        </div>
                        <div className="text-[10px] text-red-600">
                          Archived: {detailItem.archivedAt ? new Date(detailItem.archivedAt).toLocaleDateString() : 'N/A'}
                        </div>
                        <div className="text-[10px] text-red-600">
                          By: {detailItem.archivedBy || 'N/A'}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Supplier
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.supplier || "N/A"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Acquisition Method
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.acquisitionMethod || "N/A"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      PO Number
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.purchaseOrderNumber || "N/A"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">
                      Funding Source
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.fundingSource || "N/A"}
                    </span>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-xl border border-gray-100">
                    <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest mb-1">
                      Min Reorder Level
                    </p>
                    <span className="text-xs font-black text-gray-900 truncate block">
                      {detailItem.reorderPoint !== undefined ? detailItem.reorderPoint : "Not Set"}
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">
                    Current Assignment & Status
                  </h4>
                  <div className="flex flex-wrap gap-2 pt-1">
                    <span className="px-3 py-1.5 bg-blue-600 text-white text-[9px] font-black uppercase rounded-lg border border-blue-600 shadow-sm shadow-blue-100">
                      Office: {detailItem.office || "General/Unassigned"}
                    </span>
                    <span className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg border ${
                      detailItem.isArchived ? 'bg-red-50 text-red-700 border-red-200' :
                      (detailItem.condition || '').toLowerCase() === 'damaged' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                      isExpiredInventoryItem(detailItem) ? 'bg-red-50 text-red-700 border-red-200' :
                      'bg-emerald-50 text-emerald-800 border-emerald-100'
                    }`}>
                      Status: {detailItem.isArchived ? `ARCHIVED (${detailItem.archiveReason || 'N/A'})` : detailItem.status || "AVAILABLE"}
                    </span>
                    {detailItem.condition && (
                      <span className={`px-3 py-1.5 text-[9px] font-black uppercase rounded-lg border ${
                        (detailItem.condition || '').toLowerCase() === 'damaged' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                        (detailItem.condition || '').toLowerCase() === 'condemned' ? 'bg-red-50 text-red-700 border-red-200' :
                        (detailItem.condition || '').toLowerCase() === 'expired' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-slate-50 text-slate-700 border-slate-200'
                      }`}>
                        Condition: {detailItem.condition}
                      </span>
                    )}
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">
                    Particulars
                  </h4>
                  <p className="text-xs font-bold text-gray-700 leading-relaxed">
                    {detailItem.description}
                  </p>
                </div>

                <div className="space-y-4">
                  <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">
                    Responsibility & Tracking Logs
                  </h4>
                  <div className="space-y-4 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                    {detailItem.history?.map((entry) => (
                      <div
                        key={entry.id}
                        className="relative pl-5 border-l-2 border-blue-100"
                      >
                        <div className="absolute -left-[5px] top-0 w-2 h-2 bg-blue-600 rounded-full"></div>
                        <div className="text-[8px] font-bold text-gray-400 mb-0.5">
                          {new Date(entry.timestamp).toLocaleDateString()}{" "}
                          {new Date(entry.timestamp).toLocaleTimeString()}
                        </div>
                        <div className="text-[10px] font-black text-gray-800 uppercase tracking-tight leading-none">
                          {entry.action}
                        </div>
                        <div className="text-[8px] text-blue-500 font-bold mt-1">
                          Authorized By {entry.user}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {detailItem.transferHistory &&
                  detailItem.transferHistory.length > 0 && (
                    <div className="space-y-4 mt-2">
                      <h4 className="text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100 pb-1">
                        Assignment & Handover History
                      </h4>
                      <div className="space-y-4 max-h-[120px] overflow-y-auto pr-2 custom-scrollbar">
                        {detailItem.transferHistory.map((transfer) => (
                          <div
                            key={transfer.id}
                            className="relative pl-5 border-l-2 border-amber-100"
                          >
                            <div className="absolute -left-[5px] top-0 w-2 h-2 bg-amber-500 rounded-full"></div>
                            <div className="text-[8px] font-bold text-gray-400 mb-0.5">
                              {new Date(
                                transfer.timestamp,
                              ).toLocaleDateString()}{" "}
                              {new Date(
                                transfer.timestamp,
                              ).toLocaleTimeString()}
                            </div>
                            <div className="text-[10px] font-black text-gray-800 uppercase tracking-tight leading-none">
                              {transfer.action}
                            </div>
                            <div className="text-[8px] text-amber-600 font-bold mt-1">
                              Handed Over From {transfer.oldValue || "None"} To{" "}
                              {transfer.newValue || "TBD"}
                            </div>
                            <div className="text-[8px] text-gray-400 font-mono">
                              Admin Form Entry generated automatically.
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            </div>

            <div className="p-6 md:p-8 bg-gray-50 border-t border-gray-100 flex justify-center">
              <button
                onClick={() => setDetailItem(null)}
                className="w-full sm:w-auto px-12 py-3 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-all"
              >
                Close Details
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CSV Import Modal */}
      {showCsvImport && (
        <CsvImportModal
          isOpen={showCsvImport}
          onClose={() => setShowCsvImport(false)}
          offices={offices}
          onAddItem={onAddItem}
          items={items}
          userName={userName}
        />
      )}

      {/* Form Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] md:rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col animate-in slide-in-from-bottom duration-400 max-h-[92vh]">
            <div
              className={`p-6 md:p-8 border-b border-gray-50 flex items-center justify-between ${isEditMode ? "bg-yellow-600" : "bg-blue-600"} text-white`}
            >
              <h3 className="font-brand font-black text-xl uppercase tracking-tight">
                {isEditMode ? "Update Admin Record" : "Submit New Registration"}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="p-2 bg-white/10 rounded-xl"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <form
              onSubmit={handleSaveItem}
              className="p-6 md:p-10 grid grid-cols-2 gap-4 md:gap-5 overflow-y-auto scrollbar-hide text-left leading-relaxed"
            >
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Article / Nomenclature
                </label>
                <input
                  required
                  value={formItem.article}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  onChange={(e) =>
                    setFormItem({ ...formItem, article: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Category
                </label>
                <select
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  value={formItem.category}
                  onChange={(e) =>
                    setFormItem({ ...formItem, category: e.target.value })
                  }
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Property ID Number
                </label>
                <input
                  required
                  value={formItem.propertyNumber}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  onChange={(e) =>
                    setFormItem({ ...formItem, propertyNumber: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Asset Code
                </label>
                <input
                  value={formItem.assetCode || ""}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  placeholder="LGU-xxx-xxx"
                  onChange={(e) =>
                    setFormItem({ ...formItem, assetCode: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Acquisition Unit Value (₱)
                </label>
                <input
                  type="number"
                  required
                  value={formItem.unitValue}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  onChange={(e) =>
                    setFormItem({
                      ...formItem,
                      unitValue: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Serial / Part Number
                </label>
                <input
                  value={formItem.serialNumber || ""}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  placeholder="S/N"
                  onChange={(e) =>
                    setFormItem({ ...formItem, serialNumber: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Model Number
                </label>
                <input
                  value={formItem.modelNumber || ""}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  placeholder="Model"
                  onChange={(e) =>
                    setFormItem({ ...formItem, modelNumber: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Unit of Measure
                </label>
                <input
                  value={formItem.unitOfMeasure || "unit"}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  onChange={(e) =>
                    setFormItem({ ...formItem, unitOfMeasure: e.target.value })
                  }
                />
              </div>

              {/* Advanced Required LGU Fields */}
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Year Purchased / Acquired
                </label>
                <input
                  type="number"
                  required
                  value={formItem.yearPurchased}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  onChange={(e) =>
                    setFormItem({ ...formItem, yearPurchased: e.target.value })
                  }
                />
              </div>

              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Accountable Officer
                </label>
                <input
                  required
                  value={formItem.personAccountable}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  placeholder="Responsible Officer Signature"
                  onChange={(e) =>
                    setFormItem({
                      ...formItem,
                      personAccountable: e.target.value,
                    })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Assigned Staff / End User
                </label>
                <input
                  required
                  value={formItem.assignedStaff}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  placeholder="Actual End User Name"
                  onChange={(e) =>
                    setFormItem({ ...formItem, assignedStaff: e.target.value })
                  }
                />
              </div>

              {/* Dates */}
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Date Assigned
                </label>
                <input
                  type="date"
                  value={formItem.dateAssigned || ""}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm uppercase"
                  onChange={(e) =>
                    setFormItem({ ...formItem, dateAssigned: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Date Received
                </label>
                <input
                  type="date"
                  value={formItem.dateReceived || ""}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm uppercase"
                  onChange={(e) =>
                    setFormItem({ ...formItem, dateReceived: e.target.value })
                  }
                />
              </div>

              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Item Condition
                </label>
                <select
                  value={formItem.condition || "Good"}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  onChange={(e) =>
                    setFormItem({ ...formItem, condition: e.target.value as InventoryItem["condition"] })
                  }
                >
                  {['Good', 'Damaged', 'Expired'].map((condition) => (
                    <option key={condition} value={condition}>
                      {condition}
                    </option>
                  ))}
                </select>
              </div>

              {/* Metadata Fields */}
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Warranty Expiration
                </label>
                <input
                  type="date"
                  value={formItem.warrantyExpiration || ""}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm uppercase"
                  onChange={(e) =>
                    setFormItem({
                      ...formItem,
                      warrantyExpiration: e.target.value,
                    })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Supplier
                </label>
                <input
                  value={formItem.supplier || ""}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  placeholder="Vendor Company"
                  onChange={(e) =>
                    setFormItem({ ...formItem, supplier: e.target.value })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Acquisition Method
                </label>
                <input
                  value={formItem.acquisitionMethod || ""}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  placeholder="e.g., Public Bidding"
                  onChange={(e) =>
                    setFormItem({
                      ...formItem,
                      acquisitionMethod: e.target.value,
                    })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Purchase Order (PO) Number
                </label>
                <input
                  value={formItem.purchaseOrderNumber || ""}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  placeholder="P.O. #"
                  onChange={(e) =>
                    setFormItem({
                      ...formItem,
                      purchaseOrderNumber: e.target.value,
                    })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Funding Source
                </label>
                <input
                  value={formItem.fundingSource || ""}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  placeholder="e.g., General Fund"
                  onChange={(e) =>
                    setFormItem({ ...formItem, fundingSource: e.target.value })
                  }
                />
              </div>

              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-blue-600 uppercase tracking-widest ml-2">
                  Current Assigned Office (Admin Department)
                </label>
                <select
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  value={formItem.office}
                  onChange={(e) =>
                    setFormItem({ ...formItem, office: e.target.value })
                  }
                >
                  {offices.map((o) => (
                    <option key={o.id} value={o.name}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Target Stock Physical Count
                </label>
                <input
                  type="number"
                  required
                  value={formItem.qtyPhysicalCount}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  onChange={(e) =>
                    setFormItem({
                      ...formItem,
                      qtyPhysicalCount: Number(e.target.value),
                      qtyPropertyCard: Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-amber-600 uppercase tracking-widest ml-2">
                  Minimum Reorder Level (Consumables/Supplies)
                </label>
                <input
                  type="number"
                  value={formItem.reorderPoint !== undefined ? formItem.reorderPoint : ""}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm"
                  placeholder="e.g., 5"
                  onChange={(e) =>
                    setFormItem({
                      ...formItem,
                      reorderPoint: e.target.value === "" ? undefined : Number(e.target.value),
                    })
                  }
                />
              </div>

              <div className="col-span-2 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-2">
                  Description / Technical specifications
                </label>
                <textarea
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 outline-none rounded-xl font-bold text-sm h-16 resize-none"
                  value={formItem.description}
                  onChange={(e) =>
                    setFormItem({ ...formItem, description: e.target.value })
                  }
                />
              </div>

              <div className="col-span-2 flex justify-end space-x-3 md:space-x-4 pt-4 mt-2 border-t border-gray-50">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-6 py-3 text-[10px] font-black uppercase text-gray-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-10 py-3 rounded-xl text-white text-[10px] font-black uppercase tracking-widest shadow-xl transition-all ${isEditMode ? "bg-yellow-600 hover:bg-yellow-700" : "bg-blue-600 hover:bg-blue-700"}`}
                >
                  {isEditMode ? "Update Admin Record" : "Register Asset"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}


      {/* Borrow Asset dialog Modal */}
      {borrowModalItem && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-300">
            <div className="p-6 md:p-8 bg-amber-600 text-white flex justify-between items-center">
              <div>
                <h3 className="font-brand font-black text-lg uppercase tracking-tight">Lend / Borrow Asset</h3>
                <p className="text-[9px] text-white/80 font-bold uppercase mt-1 tracking-widest leading-none">Record Borrowing Status</p>
              </div>
              <button
                onClick={() => {
                  setBorrowModalItem(null);
                  setBorrowerName("");
                }}
                className="p-2 bg-white/15 rounded-xl text-white hover:bg-white/25 transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 md:p-8 space-y-5">
              <div className="bg-amber-50 rounded-2xl p-4 text-xs space-y-1 bg-amber-50/50 border border-amber-100">
                <span className="text-[8px] font-black text-amber-700 uppercase tracking-widest block leading-none">Asset Item to Lend</span>
                <p className="text-gray-950 font-black uppercase text-sm mt-1">{borrowModalItem.article}</p>
                <p className="text-gray-500 font-mono text-[9px]">Property No: {borrowModalItem.propertyNumber || "N/A"}</p>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-amber-700 uppercase tracking-widest block ml-1">
                  Borrower / Requesting Person Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Enter complete name of the borrower"
                  className="w-full px-4 py-3 bg-gray-100 border border-transparent focus:border-amber-500 focus:bg-white outline-none rounded-xl text-xs font-bold uppercase tracking-wide transition-all"
                  value={borrowerName}
                  onChange={(e) => setBorrowerName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      handleBorrowItem();
                    }
                  }}
                />
              </div>

              <div className="flex gap-4 pt-2">
                <button
                  onClick={() => {
                    setBorrowModalItem(null);
                    setBorrowerName("");
                  }}
                  className="flex-1 py-3 border border-gray-200 text-gray-500 hover:bg-gray-50 font-black text-[10px] uppercase tracking-widest rounded-xl transition-all"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBorrowItem}
                  disabled={!borrowerName.trim()}
                  className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-black text-[10px] uppercase tracking-widest rounded-xl shadow-lg shadow-amber-600/20 transition-all"
                >
                  Confirm Lend
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Modal */}
      {showQRModal && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[130] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] md:rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300 max-h-[90vh]">
            <div className="p-6 md:p-8 border-b border-gray-50 flex items-center justify-between bg-emerald-600 text-white">
              <h3 className="font-brand font-black text-xl uppercase tracking-tight">
                QR Asset Tag Generator
              </h3>
              <button
                onClick={() => setShowQRModal(null)}
                className="p-2 bg-white/10 rounded-xl"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="3"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-10">
              <div
                id="qr-labels-container"
                className="grid grid-cols-1 sm:grid-cols-2 gap-8 justify-items-center text-black"
              >
                {(showQRModal === "bulk"
                  ? items.filter((i) => selectedIds.has(i.id))
                  : [showQRModal]
                ).map((item) => (
                  <div
                    key={item.id}
                    className="w-[280px] p-6 bg-white border-4 border-black rounded-2xl flex flex-col items-center text-black print:border-black print:m-4"
                  >
                    <img 
                      src="/tibiaoLogo.jpg" 
                      alt="Tibiao Seal" 
                      className="w-10 h-10 object-contain mb-2"
                      referrerPolicy="no-referrer"
                    />
                    <div className="text-[9px] font-black uppercase tracking-widest mb-4 text-center leading-tight">
                      Republic of the Philippines
                      <br />
                      MUNICIPALITY OF TIBIAO
                    </div>

                     <div className="p-4 bg-white border border-gray-100 rounded-xl shadow-inner mb-4">
                       <QRCodeSVG
                         id={`inventory-qr-${item.id}`}
                         value={item.propertyNumber || item.id}
                         size={140}
                         level="H"
                         includeMargin={false}
                       />
                     </div>

                    <button
                      type="button"
                      onClick={() => handleDownloadSingleQR(item)}
                      className="no-print mb-4 flex items-center gap-1 px-3 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 hover:text-gray-900 border border-gray-200 rounded-lg text-[8px] font-black uppercase tracking-widest transition-all"
                    >
                      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                      </svg>
                      Download Image
                    </button>

                    <div className="w-full text-center space-y-1">
                      <div className="text-sm font-black uppercase tracking-tight truncate px-2">
                        {item.article}
                      </div>
                      <div className="text-[10px] font-bold font-mono tracking-tighter bg-gray-900 text-white py-1 px-3 rounded-lg inline-block print:bg-black">
                        {item.propertyNumber}
                      </div>
                      <div className="text-[8px] font-black uppercase text-gray-400 mt-2">
                        {item.office} • {item.category}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-8 bg-gray-50 border-t border-gray-100 flex justify-center space-x-4">
              <button
                onClick={() => setShowQRModal(null)}
                className="px-8 py-3 bg-white border border-gray-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-all"
              >
                Close
              </button>
              
              <button
                onClick={() => {
                  const modalItemsToDownload = showQRModal === "bulk"
                    ? items.filter((i) => selectedIds.has(i.id))
                    : [showQRModal].filter(Boolean) as InventoryItem[];
                  handleDownloadAllQRs(modalItemsToDownload);
                }}
                className="px-8 py-3 bg-white border-2 border-emerald-500 text-emerald-600 hover:bg-emerald-50 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
                </svg>
                Download QRs
              </button>

              <button
                onClick={() => window.print()}
                className="px-10 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-100 transition-all flex items-center gap-2"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2.5"
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                Print Labels
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Damage and partial archive dialog */}
      {damageArchiveItem && (() => {
        const availableQuantity = Math.max(0, Number(damageArchiveItem.qtyPhysicalCount) || 0);
        const requestedQuantity = Math.max(0, Math.floor(Number(damageArchiveQuantity) || 0));
        const remainingQuantity = Math.max(0, availableQuantity - requestedQuantity);
        const isQuantityValid = requestedQuantity >= 1 && requestedQuantity <= availableQuantity;

        return (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm z-[125] flex items-center justify-center p-4 no-print">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-slate-200 animate-in zoom-in duration-200">
              <div className="bg-amber-600 px-6 py-5 text-white flex items-start justify-between">
                <div>
                  <span className="text-[9px] font-black uppercase tracking-[0.18em] text-amber-100">Asset disposition</span>
                  <h3 className="text-lg font-black uppercase tracking-tight mt-1">Mark damaged &amp; archive</h3>
                </div>
                <button
                  type="button"
                  onClick={() => setDamageArchiveItem(null)}
                  className="p-2 rounded-lg bg-white/15 hover:bg-white/25 transition-colors"
                  aria-label="Close archive dialog"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!isQuantityValid || damageArchiveSubmitting) return;
                  setDamageArchiveSubmitting(true);
                  try {
                    await handleArchiveItem(damageArchiveItem, 'DAMAGED', requestedQuantity);
                    setDamageArchiveItem(null);
                  } catch (error) {
                    console.error('Damage archive failed:', error);
                    alert('Unable to archive the damaged quantity. Please try again.');
                  } finally {
                    setDamageArchiveSubmitting(false);
                  }
                }}
                className="p-6 space-y-5"
              >
                <div className="border border-slate-200 bg-slate-50 p-4 rounded-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">Selected asset</p>
                      <h4 className="text-sm font-black uppercase text-slate-900 mt-1 truncate">{damageArchiveItem.article}</h4>
                      <p className="text-[10px] font-mono text-slate-500 mt-1 truncate">{damageArchiveItem.propertyNumber || 'No property number'}</p>
                    </div>
                    <span className="shrink-0 px-2.5 py-1 bg-white border border-slate-200 text-slate-700 text-[9px] font-black uppercase rounded-md">
                      {availableQuantity} active
                    </span>
                  </div>
                </div>

                <div>
                  <label htmlFor="damage-archive-quantity" className="block text-[10px] font-black uppercase tracking-widest text-slate-600 mb-2">
                    Quantity to archive as damaged
                  </label>
                  <div className="flex items-center gap-3">
                    <input
                      id="damage-archive-quantity"
                      type="number"
                      min="1"
                      max={availableQuantity}
                      step="1"
                      required
                      autoFocus
                      value={damageArchiveQuantity}
                      onChange={(event) => setDamageArchiveQuantity(event.target.value)}
                      className="w-28 px-4 py-3 border-2 border-slate-300 focus:border-amber-600 outline-none rounded-lg text-lg font-black text-slate-900"
                    />
                    <span className="text-xs font-bold text-slate-500">of {availableQuantity} available unit(s)</span>
                  </div>
                  {!isQuantityValid && damageArchiveQuantity !== '' && (
                    <p className="text-[10px] text-red-600 font-bold mt-2">Enter a whole number from 1 to {availableQuantity}.</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="border border-amber-200 bg-amber-50 p-3 rounded-lg">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-700">Archived damaged</p>
                    <p className="text-xl font-black text-amber-900 mt-1">{isQuantityValid ? requestedQuantity : 0}</p>
                  </div>
                  <div className="border border-emerald-200 bg-emerald-50 p-3 rounded-lg">
                    <p className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Remaining active</p>
                    <p className="text-xl font-black text-emerald-900 mt-1">{isQuantityValid ? remainingQuantity : availableQuantity}</p>
                  </div>
                </div>

                <p className="text-[10px] leading-relaxed text-slate-500 border-l-4 border-amber-500 pl-3">
                  The selected units will be recorded as <strong className="text-slate-700">DAMAGED</strong> in the archive. The active property record will be reduced automatically and the action will be added to the audit trail.
                </p>

                <div className="flex gap-3 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setDamageArchiveItem(null)}
                    disabled={damageArchiveSubmitting}
                    className="flex-1 py-3 border border-slate-300 text-slate-600 hover:bg-slate-50 rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!isQuantityValid || damageArchiveSubmitting}
                    className="flex-1 py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-black uppercase tracking-widest transition-colors disabled:bg-slate-300 disabled:cursor-not-allowed"
                  >
                    {damageArchiveSubmitting ? 'Archiving...' : 'Confirm archive'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Delete Confirmation */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-[32px] w-full max-w-xs p-8 text-center animate-in zoom-in duration-200">
            <div className="w-12 h-12 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-6 h-6"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2.5"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                />
              </svg>
            </div>              <h3 className="font-brand font-black text-lg uppercase mb-2">
              {deleteTarget === 'bulk' ? 'Archive Selected Assets?' : 'Delete Asset Record?'}
            </h3>
            <p className="text-[10px] text-gray-400 font-bold uppercase mb-6">
              {deleteTarget === 'bulk' ? 'This action will archive the selected assets from active listings.' : 'This action will permanently remove this asset from the database.'}
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="flex-1 py-3 text-[9px] font-black uppercase text-gray-400"
              >
                No
              </button>
              <button
                onClick={confirmDelete}
                disabled={isDeleting}
                className="flex-1 py-3 bg-red-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center justify-center"
              >
                {isDeleting ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  "Confirm"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lodge New Cargo Modal */}
      {showShipmentModal && (
        <div className="fixed inset-0 bg-gray-900/70 backdrop-blur-md z-[110] flex items-center justify-center p-4">
          <div className="bg-white rounded-[36px] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-300 max-h-[92vh]">
            {/* Header */}
            <div className="p-6 md:p-8 bg-emerald-600 text-white flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="font-black text-xl uppercase tracking-tight">Lodge New Cargo</h3>
                <p className="text-[9px] text-white/70 font-bold uppercase tracking-widest mt-0.5">
                  Submit Supplier Shipment for Executive Authorization
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowShipmentModal(false)}
                className="p-2.5 bg-white/15 hover:bg-white/25 rounded-2xl transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form
              onSubmit={handleLodgeShipment}
              className="p-6 md:p-8 grid grid-cols-2 gap-4 overflow-y-auto scrollbar-hide"
            >
              {/* Article / Item Name */}
              <div className="col-span-2 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Item / Article Name <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={shipmentArticle}
                  onChange={(e) => setShipmentArticle(e.target.value)}
                  placeholder="e.g. LAPTOP COMPUTER"
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-emerald-500 outline-none rounded-xl font-bold text-sm uppercase"
                />
              </div>

              {/* Category */}
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Category
                </label>
                <select
                  value={shipmentCategory}
                  onChange={(e) => setShipmentCategory(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-emerald-500 outline-none rounded-xl font-bold text-sm"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {/* Supplier */}
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Supplier / Vendor <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={shipmentSupplier}
                  onChange={(e) => setShipmentSupplier(e.target.value)}
                  placeholder="Vendor Company Name"
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-emerald-500 outline-none rounded-xl font-bold text-sm uppercase"
                />
              </div>

              {/* Quantity */}
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Quantity (Units)
                </label>
                <input
                  type="number"
                  min="1"
                  value={shipmentQty}
                  onChange={(e) => setShipmentQty(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-emerald-500 outline-none rounded-xl font-bold text-sm"
                />
              </div>

              {/* Unit Value */}
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Unit Value (₱)
                </label>
                <input
                  type="number"
                  min="0"
                  value={shipmentVal}
                  onChange={(e) => setShipmentVal(Number(e.target.value))}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-emerald-500 outline-none rounded-xl font-bold text-sm"
                />
              </div>

              {/* Target Office */}
              <div className="col-span-2 sm:col-span-1 space-y-1">
                <label className="text-[9px] font-black text-emerald-600 uppercase tracking-widest ml-1">
                  Target Office / Department
                </label>
                <select
                  value={shipmentOffice}
                  onChange={(e) => setShipmentOffice(e.target.value)}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-emerald-500 outline-none rounded-xl font-bold text-sm"
                >
                  {offices.map((o) => (
                    <option key={o.id} value={o.name}>{o.name}</option>
                  ))}
                </select>
              </div>

              {/* Total Preview */}
              <div className="col-span-2 sm:col-span-1 flex items-end">
                <div className="w-full bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-[9px] font-black text-emerald-700 uppercase tracking-widest">Total Amount</span>
                  <span className="text-sm font-black text-emerald-900">
                    ₱{Number(shipmentVal * shipmentQty).toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Description */}
              <div className="col-span-2 space-y-1">
                <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">
                  Description / Remarks
                </label>
                <textarea
                  value={shipmentDesc}
                  onChange={(e) => setShipmentDesc(e.target.value)}
                  placeholder="Item specifications, purpose, or additional remarks..."
                  rows={3}
                  className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-emerald-500 outline-none rounded-xl font-bold text-sm resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="col-span-2 flex items-center justify-end space-x-3 pt-2 border-t border-gray-50 mt-1">
                <button
                  type="button"
                  onClick={() => setShowShipmentModal(false)}
                  className="px-6 py-3 text-[10px] font-black uppercase text-gray-400 hover:text-gray-600 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingShipment}
                  className="px-10 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-200/60 transition-all flex items-center space-x-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {submittingShipment ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Lodging...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" />
                      </svg>
                      <span>Lodge for Approval</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Inventory;
