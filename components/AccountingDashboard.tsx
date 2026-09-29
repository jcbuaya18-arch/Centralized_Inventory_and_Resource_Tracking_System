import React, { useState, useEffect } from "react";
import { InventoryItem, Office, AssetRequest, SystemLog, UserProfile } from "../types";
import { db, logProcurementTransaction, logPRSAction } from "../firebase";
import { NotificationBell } from "./NotificationBell";
import { 
  FileText, 
  Truck, 
  Package, 
  Users, 
  AlertTriangle, 
  XCircle, 
  CheckCircle2, 
  Clock,
  Menu,
  LayoutDashboard,
  ArrowRight,
  FolderKanban,
  FileSpreadsheet,
  ShoppingCart,
  History
} from "lucide-react";
import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { ReceivingTimeline } from "./ReceivingTimeline";
import { SupplierShipmentModal } from "./SupplierShipmentModal";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from "recharts";
import Reports from "./Reports";
import { ProcurementTransactionHistory } from "./ProcurementTransactionHistory";

interface AccountingDashboardProps {
  items: InventoryItem[];
  offices: Office[];
  onLogout: () => void;
  userName: string;
  onAddItem: (item: Partial<InventoryItem>) => Promise<string>;
  onRemoveItem?: (id: string) => void;
  onUpdateItem?: (id: string, updates: Partial<InventoryItem>) => void;
  reportsInitialTab?: 'generator' | 'archive' | 'transfers';
  activeTabOverride?: string | null;
  onResetOverride?: () => void;
  user: UserProfile;
  setView?: (view: any) => void;
  onNotificationActionClick?: (notification: any) => void;
}

const COLORS = [
  "#2563EB",
  "#3B82F6",
  "#60A5FA",
  "#93C5FD",
  "#1F2937",
  "#6B7280",
];

// ReceivingTimeline interface and component are now imported from standalone file "./ReceivingTimeline"

const AccountingDashboard: React.FC<AccountingDashboardProps> = ({
  items,
  offices,
  onLogout,
  userName,
  onAddItem,
  onRemoveItem,
  onUpdateItem,
  reportsInitialTab,
  activeTabOverride,
  onResetOverride,
  user,
  setView,
  onNotificationActionClick,
}) => {
  const [activeTab, setActiveTab] = useState<
    | "dashboard"
    | "ledger"
    | "reconciliation"
    | "reports"
    | "admin_requests"
    | "outgoing_requests"
    | "procurement_history"
    | "unified_reports"
  >("dashboard");
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  useEffect(() => {
    if (activeTabOverride) {
      if (activeTabOverride === 'reports') {
        setActiveTab('unified_reports');
      } else if (activeTabOverride === 'outgoing_requests' || activeTabOverride === 'outgoing_logs') {
        setActiveTab('outgoing_requests');
      } else if (activeTabOverride === 'admin_requests' || activeTabOverride === 'requests') {
        setActiveTab('admin_requests');
      }
      if (onResetOverride) {
        onResetOverride();
      }
    }
  }, [activeTabOverride, onResetOverride]);
  const [assetRequests, setAssetRequests] = useState<AssetRequest[]>([]);
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const [loadingReqs, setLoadingReqs] = useState(true);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [isSidebarHovered, setIsSidebarHovered] = useState(false);

  const getDynamicFontClass = (num: number) => {
    const formatted = num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const len = formatted.length + 1; // including ₱ symbol
    if (len > 16) return "text-sm sm:text-base md:text-lg xl:text-xl";
    if (len > 12) return "text-base sm:text-lg md:text-xl xl:text-2xl";
    return "text-xl sm:text-2xl md:text-3xl";
  };

  // Stock Card, PAR & ICS Hub states
  const [selectedStockCardOffice, setSelectedStockCardOffice] = useState<string>("");
  const [selectedDocumentType, setSelectedDocumentType] = useState<"PAR" | "ICS" | null>(null);
  const [stockCardSearch, setStockCardSearch] = useState<string>("");
  const [stockCardSortField, setStockCardSortField] = useState<string>("article");
  const [stockCardSortOrder, setStockCardSortOrder] = useState<"asc" | "desc">("asc");
  const [stockCardPage, setStockCardPage] = useState<number>(1);

  // Local form states for current office PAR/ICS document creation
  const [formFundCluster, setFormFundCluster] = useState<string>("GENERAL FUND");
  const [formDocNo, setFormDocNo] = useState<string>("");
  const [formReceivedBy, setFormReceivedBy] = useState<string>("");
  const [formIssuedBy, setFormIssuedBy] = useState<string>("");
  const [formPreparedBy, setFormPreparedBy] = useState<string>("");
  const [formApprovedBy, setFormApprovedBy] = useState<string>("");
  const [formDateIssued, setFormDateIssued] = useState<string>("");
  const [isFormSending, setIsFormSending] = useState<boolean>(false);

  const getDeptShortCode = (deptName: string) => {
    if (!deptName) return "GEN";
    const cleanName = deptName.replace(/Department/gi, "").replace(/Office/gi, "").trim();
    const words = cleanName.split(/\s+/);
    if (words.length === 1) return words[0].substring(0, 3).toUpperCase();
    return words.map(w => w[0]).join("").toUpperCase();
  };

  useEffect(() => {
    if (selectedStockCardOffice && selectedDocumentType) {
      const short = getDeptShortCode(selectedStockCardOffice);
      const prefix = selectedDocumentType === "PAR" ? "PAR" : "ICS";
      setFormDocNo(`${prefix}-${short}-${new Date().getFullYear()}-001`);
      setFormFundCluster("GENERAL FUND");
      setFormReceivedBy("");
      setFormIssuedBy("MUNICIPAL TREASURER");
      setFormPreparedBy(userName || "Accountant");
      setFormApprovedBy("MUNICIPAL ENGINEERING");
      setFormDateIssued(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
    }
  }, [selectedStockCardOffice, selectedDocumentType, userName]);

  // Accountant Requests specific state (Procurement Request Slip (PRS))
  const [actRequests, setActRequests] = useState<any[]>([]);
  const [loadingActReqs, setLoadingActReqs] = useState(true);
  const [procurementStatusFilter, setProcurementStatusFilter] = useState<'ALL' | 'REGISTERED' | 'PENDING' | 'ACTION_NEEDED'>('ALL');
  const [newTitle, setNewTitle] = useState('');
  const [newDetails, setNewDetails] = useState('');
  const [newAmount, setNewAmount] = useState<number | ''>('');
  const [newQuantity, setNewQuantity] = useState<number>(1);
  const [newRequestedPerson, setNewRequestedPerson] = useState<string>('');
  const [newPriority, setNewPriority] = useState<'Low' | 'Medium' | 'High'>('Medium');
  const [newTargetOffice, setNewTargetOffice] = useState<string>("Municipal Engineering");
  const [newUnit, setNewUnit] = useState<string>("pcs");
  const [newEquipmentType, setNewEquipmentType] = useState<string>("Office Equipment");
  const [newCondition, setNewCondition] = useState<'Good' | 'Damaged' | 'Brand New' | 'Fair' | 'Under Repair' | 'Poor' | 'Condemned'>("Good");
  const [newSlipNumber, setNewSlipNumber] = useState<string>("");
  const [editingActReq, setEditingActReq] = useState<any | null>(null);

  const [newSupplier, setNewSupplier] = useState('');
  const [newPONumber, setNewPONumber] = useState('');
  const [newInvoiceNumber, setNewInvoiceNumber] = useState('');
  const [newUnitCost, setNewUnitCost] = useState<number | ''>('');
  const [newExpectedDeliveryDate, setNewExpectedDeliveryDate] = useState('');
  const [newDatePurchased, setNewDatePurchased] = useState(new Date().toISOString().split('T')[0]);
  const [newFundingSource, setNewFundingSource] = useState('General Fund');
  const [newTargetOfficeHead, setNewTargetOfficeHead] = useState('');
  const [newPreparedBy, setNewPreparedBy] = useState('');

  useEffect(() => {
    if (userName && !newPreparedBy) {
      setNewPreparedBy(userName);
    }
  }, [userName, newPreparedBy]);

  useEffect(() => {
    const officeHeadMap: Record<string, string> = {
      "Municipal Engineering": "Engr. J. Santos",
      "Municipal Engineering Office": "Engr. J. Santos",
      "Mayor's Office": "Mayor Gil B. Bandoja",
      "Accounting Office": "Jocelyn Manzan",
      "Accounting & Finance": "Jocelyn Manzan",
      "Health & Nutrition": "Dr. Juan Dela Cruz",
      "Assessor's Office": "Atty. Clara Maria",
    };
    if (newTargetOffice) {
      setNewTargetOfficeHead(officeHeadMap[newTargetOffice] || "Engr. J. Santos");
    }
  }, [newTargetOffice]);

  // States for automated asset lookup
  const [assetSearchQuery, setAssetSearchQuery] = useState('');
  const [showAssetDropdown, setShowAssetDropdown] = useState(false);

  useEffect(() => {
    if (!newSlipNumber) {
      setNewSlipNumber("PR-" + Math.floor(100000 + Math.random() * 900000));
    }
  }, [newSlipNumber]);

  useEffect(() => {
    if (userName && !newRequestedPerson) {
      setNewRequestedPerson(userName);
    }
  }, [userName, newRequestedPerson]);

  useEffect(() => {
    if (newQuantity && newUnitCost !== '') {
      setNewAmount(Number(newQuantity) * Number(newUnitCost));
    }
  }, [newQuantity, newUnitCost]);

  // Search & Filter state
  const [searchTerm, setSearchTerm] = useState("");
  const [officeFilter, setOfficeFilter] = useState("ALL");
  const [fundingFilter, setFundingFilter] = useState("ALL");
  const [selectedDeptCarryingFilter, setSelectedDeptCarryingFilter] = useState<string>("ALL");

  // Individual PAR & ICS Receipt Generation Modal states
  const [selectedPRForReceipt, setSelectedPRForReceipt] = useState<any | null>(null);
  const [showPRReceiptModal, setShowPRReceiptModal] = useState<boolean>(false);
  const [receiptFundCluster, setReceiptFundCluster] = useState<string>("GENERAL FUND");
  const [receiptDocNo, setReceiptDocNo] = useState<string>("");
  const [receiptReceivedBy, setReceiptReceivedBy] = useState<string>("");
  const [receiptApprovedBy, setReceiptApprovedBy] = useState<string>("");
  const [receiptIssuedBy, setReceiptIssuedBy] = useState<string>("");
  const [receiptDateIssued, setReceiptDateIssued] = useState<string>("");
  const [isSubmittingPRReceipt, setIsSubmittingPRReceipt] = useState<boolean>(false);

  const openIndividualReceiptModal = (pr: any) => {
    setSelectedPRForReceipt(pr);
    const unitCost = pr.unitCost !== undefined && pr.unitCost !== null && pr.unitCost !== ''
      ? Number(pr.unitCost)
      : ((Number(pr.amount) || 0) / (Number(pr.quantity) || 1));
    const isPAR = unitCost >= 50000;
    const docPrefix = isPAR ? "PAR" : "ICS";
    const slipNo = pr.slipNumber || pr.requestNumber || Math.floor(100000 + Math.random() * 900000);
    
    setReceiptFundCluster(pr.fundingSource || "GENERAL FUND");
    setReceiptDocNo(`${docPrefix}-${new Date().getFullYear()}-${slipNo}`);
    setReceiptReceivedBy(pr.requestedBy || pr.targetOfficeHead || "Accountable Officer");
    setReceiptApprovedBy("MUNICIPAL ENGINEER / GSO ADMIN");
    setReceiptIssuedBy(userName || "MUNICIPAL ACCOUNTANT");
    setReceiptDateIssued(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }));
    setShowPRReceiptModal(true);
  };

  const handlePrintIndividualPRReceipt = (pr: any) => {
    const unitCost = pr.unitCost !== undefined && pr.unitCost !== null && pr.unitCost !== ''
      ? Number(pr.unitCost)
      : ((Number(pr.amount) || 0) / (Number(pr.quantity) || 1));
    const isPAR = unitCost >= 50000;
    const reportTitle = isPAR ? "PROPERTY ACKNOWLEDGEMENT RECEIPT" : "INVENTORY CUSTODIAN SLIP";
    const reportSubtitle = isPAR ? "Annex B" : "Appendix 59";
    const qty = pr.quantity || 1;
    const totalAmount = pr.amount !== undefined && pr.amount !== null ? Number(pr.amount) : (unitCost * qty);
    
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow pop-ups to print the receipt.");
      return;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${reportTitle} - ${pr.itemArticle || pr.title}</title>
        <style>
          @media print {
            @page { size: portrait; margin: 0.4in; }
            body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          }
          body { font-family: 'Times New Roman', Times, serif; margin: 20px; color: #000; font-size: 10pt; line-height: 1.3; }
          .sheet-container { width: 100%; max-width: 800px; margin: 0 auto; }
          .subtitle { text-align: right; font-style: italic; font-weight: bold; font-size: 11pt; margin-bottom: 5px; color: #555; }
          .header-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
          .title-block { text-align: center; font-weight: bold; font-size: 14pt; text-transform: uppercase; margin: 10px 0; letter-spacing: 0.5px; }
          .meta-table { width: 100%; border-collapse: collapse; font-size: 10pt; margin-bottom: 12px; }
          .meta-td { padding: 4px 0; }
          .underline-span { border-bottom: 1px solid black; padding: 0 8px; font-weight: bold; }
          .data-table { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 20px; }
          .data-table th, .data-table td { border: 1px solid black; padding: 6px 8px; }
          .data-table th { background-color: #f8fafc; text-align: center; font-weight: bold; text-transform: uppercase; font-size: 9pt; }
          .sign-table { width: 100%; border-collapse: collapse; border: 1.5px solid black; margin-top: 20px; font-size: 9.5pt; page-break-inside: avoid; }
          .sign-td { width: 50%; padding: 12px; vertical-align: top; }
          .sign-line { border-bottom: 1px solid black; text-align: center; font-weight: bold; text-transform: uppercase; margin-top: 35px; margin-bottom: 2px; font-size: 10pt; }
          .sign-sub { font-size: 8pt; text-align: center; color: #374151; }
        </style>
      </head>
      <body onload="window.print()">
        <div class="sheet-container">
          <div class="subtitle">${reportSubtitle}</div>
          <table class="header-table">
            <tr>
              <td style="width: 15%; text-align: center;">
                <img src="/tibiaoLogo.jpg" style="width:70px; height:70px; object-fit:contain;" alt="Seal" />
              </td>
              <td style="width: 70%; text-align: center; line-height: 1.3;">
                <div style="font-size: 10pt; text-transform: uppercase; font-weight: bold;">Republic of the Philippines</div>
                <div style="font-size: 9.5pt; font-style: italic;">Province of Antique</div>
                <div style="font-size: 12.5pt; font-weight: bold; text-transform: uppercase;">MUNICIPALITY OF TIBIAO</div>
              </td>
              <td style="width: 15%;">&nbsp;</td>
            </tr>
          </table>

          <div class="title-block">${reportTitle}</div>

          <table class="meta-table">
            <tr>
              <td class="meta-td" style="width: 60%;">
                <strong>Entity Name:</strong> <span class="underline-span">LGU TIBIAO - ${(pr.targetOffice || "MUNICIPAL ENGINEERING").toUpperCase()}</span>
              </td>
              <td class="meta-td" style="width: 40%; text-align: right;">
                <strong>Fund Cluster:</strong> <span class="underline-span">${receiptFundCluster || "GENERAL FUND"}</span>
              </td>
            </tr>
            <tr>
              <td class="meta-td">
                <strong>Supplier:</strong> <span class="underline-span">${pr.supplier || "N/A"}</span>
              </td>
              <td class="meta-td" style="text-align: right;">
                <strong>${isPAR ? 'PAR No.' : 'ICS No.'}:</strong> <span class="underline-span" style="font-family: monospace;">${receiptDocNo}</span>
              </td>
            </tr>
          </table>

          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 8%;">Qty</th>
                <th style="width: 10%;">Unit</th>
                ${!isPAR ? '<th style="width: 12%;">Unit Cost</th><th style="width: 14%;">Total Amount</th>' : ''}
                <th style="width: 40%;">Description (Article & Specs)</th>
                <th style="width: 16%;">Property / Inv. No.</th>
                <th style="width: 14%;">${isPAR ? 'Acquisition Cost' : 'Useful Life'}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="text-align: center; font-weight: bold;">${qty}</td>
                <td style="text-align: center; text-transform: uppercase;">${pr.unit || "pcs"}</td>
                ${!isPAR ? `
                  <td style="text-align: right; font-family: monospace;">₱${unitCost.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                  <td style="text-align: right; font-family: monospace; font-weight: bold;">₱${totalAmount.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
                ` : ''}
                <td>
                  <strong style="text-transform: uppercase; font-size: 9.5pt; display: block;">${pr.itemArticle || pr.title}</strong>
                  <span style="font-size: 8.5pt; color: #374151; white-space: pre-line;">${pr.details || pr.justification || "Procurement item"}</span>
                  ${pr.poNumber ? `<br/><span style="font-size: 8pt; color: #4b5563;">PO #: ${pr.poNumber}</span>` : ''}
                  ${pr.invoiceNumber ? `<span style="font-size: 8pt; color: #4b5563;"> | Inv #: ${pr.invoiceNumber}</span>` : ''}
                </td>
                <td style="text-align: center; font-family: monospace;">${pr.slipNumber ? `PROP-${pr.slipNumber}` : 'Pending'}</td>
                <td style="text-align: ${isPAR ? 'right' : 'center'}; font-family: monospace; font-weight: bold;">
                  ${isPAR ? `₱${totalAmount.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}` : `${pr.usefulLife || 5} yrs`}
                </td>
              </tr>
            </tbody>
          </table>

          <table class="sign-table">
            <tr>
              <td class="sign-td" style="border-right: 1px solid black;">
                <div style="font-weight: bold; text-transform: uppercase; font-size: 8.5pt;">Received By:</div>
                <div class="sign-line">${receiptReceivedBy}</div>
                <div class="sign-sub">Signature over Printed Name of Accountable Officer</div>
                <div style="font-size: 8.5pt; margin-top: 10px;">Position: <strong>Department Head / Representative</strong></div>
                <div style="font-size: 8.5pt; margin-top: 4px;">Date: <strong>${receiptDateIssued}</strong></div>
              </td>
              <td class="sign-td">
                <div style="font-weight: bold; text-transform: uppercase; font-size: 8.5pt;">${isPAR ? 'Approved By:' : 'Issued By:'}</div>
                <div class="sign-line">${isPAR ? receiptApprovedBy : receiptIssuedBy}</div>
                <div class="sign-sub">Signature over Printed Name of Authorized Official</div>
                <div style="font-size: 8.5pt; margin-top: 10px;">Position: <strong>Municipal Accountant / Admin Representative</strong></div>
                <div style="font-size: 8.5pt; margin-top: 4px;">Date: <strong>${receiptDateIssued}</strong></div>
              </td>
            </tr>
          </table>
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const handleSubmitIndividualPRReceipt = async () => {
    if (!selectedPRForReceipt) return;
    setIsSubmittingPRReceipt(true);

    try {
      const pr = selectedPRForReceipt;
      const timestamp = new Date().toISOString();
      const unitCost = pr.unitCost !== undefined && pr.unitCost !== null && pr.unitCost !== ''
        ? Number(pr.unitCost)
        : ((Number(pr.amount) || 0) / (Number(pr.quantity) || 1));
      const isPAR = unitCost >= 50000;
      const docType = isPAR ? "PAR" : "ICS";
      const reportType = isPAR ? "Property Acknowledgement Receipt (PAR)" : "Inventory Custodian Slip (ICS)";
      const reportMode = isPAR ? "par" : "ics";
      const totalAmount = pr.amount !== undefined && pr.amount !== null ? Number(pr.amount) : (unitCost * (pr.quantity || 1));
      const targetDept = pr.targetOffice || "Municipal Engineering";

      const itemSnapshot = [{
        id: pr.id,
        article: pr.itemArticle || pr.title || "Equipment",
        description: pr.details || pr.justification || "",
        propertyNumber: pr.slipNumber ? `PROP-${pr.slipNumber}` : "Pending",
        unitValue: unitCost,
        qtyPhysicalCount: pr.quantity || 1,
        qtyPropertyCard: pr.quantity || 1,
        unitOfMeasure: pr.unit || "pcs",
        dateReceived: pr.datePurchased || timestamp.split('T')[0],
        personAccountable: receiptReceivedBy
      }];

      // 1. Create Report in 'reports' collection
      const reportPayload: any = {
        report_type: reportType,
        fund_cluster: receiptFundCluster || "GENERAL FUND",
        report_date: receiptDateIssued,
        accountable_person: receiptReceivedBy,
        accountable_position: "Accountable Department Officer",
        accountability_date: receiptDateIssued,
        total_value: totalAmount,
        item_count: 1,
        items_snapshot: itemSnapshot,
        status: "Pending Approval",
        reportMode: reportMode,
        submittedByOffice: targetDept,
        senderName: userName || "Accountant",
        prsNumber: pr.slipNumber || pr.id,
        forwardedStatus: "Pending",
        forwardedAt: timestamp,
        history: [
          {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: timestamp,
            action: 'Created & Submitted',
            details: `Individual ${docType} Receipt compiled from Purchase Request Slip ${pr.slipNumber || 'N/A'} by Accountant ${userName || ''}.`
          }
        ],
        created_at: serverTimestamp()
      };

      if (isPAR) {
        reportPayload.parNo = receiptDocNo;
        reportPayload.spcNotedBy = receiptApprovedBy;
        reportPayload.spcUnitCost = totalAmount;
      } else {
        reportPayload.icsNo = receiptDocNo;
        reportPayload.icsDateIssued = receiptDateIssued;
        reportPayload.icsEmployeeName = receiptReceivedBy;
        reportPayload.icsIssuedBy = receiptIssuedBy;
      }

      const reportDocRef = await addDoc(collection(db, 'reports'), reportPayload);

      // 2. Update the original Purchase Request document in 'requests'
      const prDocRef = doc(db, 'requests', pr.id);
      await updateDoc(prDocRef, {
        parIcsStatus: 'Submitted',
        parIcsType: docType,
        parIcsNumber: receiptDocNo,
        parIcsReportId: reportDocRef.id,
        status: 'Pending Engineer/Admin Review',
      });

      // 3. Create entry in 'requests' collection for PAR/ICS review if not existing
      await addDoc(collection(db, 'requests'), {
        requestType: docType,
        requestNumber: receiptDocNo,
        prsNumber: pr.slipNumber || pr.id,
        itemArticle: pr.itemArticle || pr.title || "Equipment",
        office: targetDept,
        requestedBy: userName || 'Accountant',
        assignedAdmin: 'Engineer / GSO Admin',
        amount: totalAmount,
        quantity: pr.quantity || 1,
        justification: `Individual ${docType} Receipt generated for PR Slip ${pr.slipNumber || 'N/A'}: "${pr.itemArticle || pr.title}" and submitted to Engineer/Admin.`,
        status: 'Submitted',
        reportId: reportDocRef.id,
        items_snapshot: itemSnapshot,
        requestedAt: timestamp
      });

      // 4. Notifications
      await addDoc(collection(db, 'notifications'), {
        recipientRole: 'OFFICE_HEAD',
        recipientOffice: targetDept,
        message: `INDIVIDUAL ${docType} RECEIPT SUBMITTED: Receipt ${receiptDocNo} for "${pr.itemArticle || pr.title}" (Slip: ${pr.slipNumber}) has been submitted by Accounting for your review and sign-off.`,
        timestamp: timestamp,
        isRead: false,
        type: 'NEW_REQUEST',
        reportId: reportDocRef.id
      });

      await addDoc(collection(db, 'notifications'), {
        recipientRole: 'ADMIN',
        message: `INDIVIDUAL ${docType} RECEIPT SUBMITTED: Receipt ${receiptDocNo} for "${pr.itemArticle || pr.title}" (Slip: ${pr.slipNumber}) has been submitted by Accounting for review.`,
        timestamp: timestamp,
        isRead: false,
        type: 'NEW_REQUEST',
        reportId: reportDocRef.id
      });

      // 5. System and Audit Logs
      await addDoc(collection(db, 'system_logs'), {
        timestamp: timestamp,
        user: userName || "Accountant",
        action: `Generated & submitted Individual ${docType} Receipt (${receiptDocNo}) for PR Slip ${pr.slipNumber || 'N/A'} ("${pr.itemArticle || pr.title}") to Engineer/Admin.`,
        module: "Accountant Desk"
      });

      await logPRSAction({
        user: userName,
        role: 'ACCOUNTING',
        formType: docType,
        transactionNumber: receiptDocNo,
        timestamp,
        action: `RECEIPT SUBMISSION: Accountant generated and submitted individual ${docType} receipt ${receiptDocNo} for PR Slip ${pr.slipNumber || 'N/A'} to Engineer/Admin`,
        module: "Procurement Audit"
      });

      await logProcurementTransaction({
        slipNumber: pr.slipNumber || "N/A",
        requestId: pr.id,
        itemArticle: pr.itemArticle || pr.title || "Equipment",
        quantity: pr.quantity || 1,
        amount: totalAmount,
        status: "Submitted",
        user: userName,
        office: "Accounting Office",
        details: `Generated individual ${docType} receipt ${receiptDocNo} and submitted to Engineer/Admin.`
      });

      alert(`Success! Individual ${docType} Receipt (${receiptDocNo}) has been generated and submitted to Engineer & Admin.`);
      setShowPRReceiptModal(false);
      setSelectedPRForReceipt(null);
    } catch (err) {
      console.error("Failed to submit individual PAR/ICS receipt:", err);
      alert("Error submitting receipt to Engineer/Admin.");
    } finally {
      setIsSubmittingPRReceipt(false);
    }
  };

  // Edit form states
  const [formUsefulLife, setFormUsefulLife] = useState<number>(5);
  const [formAssetCode, setFormAssetCode] = useState<string>("");
  const [formFundingSource, setFormFundingSource] =
    useState<string>("General Fund");
  const [formAcquisitionDate, setFormAcquisitionDate] = useState<string>("");
  const [formAcquisitionCost, setFormAcquisitionCost] = useState<number>(0);
  const [reconciliationNotes, setReconciliationNotes] = useState<{
    [key: string]: string;
  }>({});
  const [approvedExecutiveName, setApprovedExecutiveName] = useState<string>('GIL B. BANDOJA');
  const [approvedExecutiveTitle, setApprovedExecutiveTitle] = useState<string>('Municipal Mayor, Tibiao, Antique');

  // New Stock Card transaction and detailed modal states
  const [transactions, setTransactions] = useState<any[]>([]);
  const [selectedStockCardItem, setSelectedStockCardItem] = useState<InventoryItem | null>(null);
  const [isStockCardDetailOpen, setIsStockCardDetailOpen] = useState(false);
  const [stockCardCategoryFilter, setStockCardCategoryFilter] = useState<string>("ALL");

  // Official PAR/ICS Sheets states
  const [activeSheetsTab, setActiveSheetsTab] = useState<'PAR' | 'ICS'>('PAR');
  const [sheetSearch, setSheetSearch] = useState('');
  const [selectedSheetStatusFilter, setSelectedSheetStatusFilter] = useState('ALL');
  const [isSheetFormModalOpen, setIsSheetFormModalOpen] = useState(false);
  const [editingSheet, setEditingSheet] = useState<any | null>(null);

  // Form states for PAR/ICS sheets
  const [formSheetOffice, setFormSheetOffice] = useState('');
  const [formSheetOfficeCode, setFormSheetOfficeCode] = useState('');
  const [formSheetItemArticle, setFormSheetItemArticle] = useState('');
  const [formSheetDescription, setFormSheetDescription] = useState('');
  const [formSheetPropertyNumber, setFormSheetPropertyNumber] = useState('');
  const [formSheetQuantity, setFormSheetQuantity] = useState(1);
  const [formSheetUnitCost, setFormSheetUnitCost] = useState(0);
  const [formSheetSupplier, setFormSheetSupplier] = useState('');
  const [formSheetRequestedBy, setFormSheetRequestedBy] = useState('');
  const [formSheetReceiver, setFormSheetReceiver] = useState('');
  const [formSheetPurpose, setFormSheetPurpose] = useState('');
  const [formSheetRemarks, setFormSheetRemarks] = useState('');

  // Subscribe to inventory transactions
  useEffect(() => {
    const q = query(collection(db, "inventory_transactions"), orderBy("timestamp", "desc"));
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }));
      setTransactions(fetched);
    }, (err) => {
      console.error("Error subscribing to inventory transactions:", err);
    });
    return () => unsubscribe();
  }, []);

  // Helper to reset PAR/ICS sheets form
  const resetSheetForm = () => {
    setFormSheetItemArticle('');
    setFormSheetDescription('');
    setFormSheetPropertyNumber('');
    setFormSheetQuantity(1);
    setFormSheetUnitCost(0);
    setFormSheetSupplier('');
    setFormSheetRequestedBy(userName || '');
    setFormSheetReceiver('');
    setFormSheetPurpose('');
    setFormSheetRemarks('');
    if (offices && offices.length > 0) {
      setFormSheetOffice(offices[0].name);
      setFormSheetOfficeCode(offices[0].code);
    } else {
      setFormSheetOffice('');
      setFormSheetOfficeCode('');
    }
  };

  // Helper to change office and sync office code
  const handleSheetOfficeChange = (officeName: string) => {
    setFormSheetOffice(officeName);
    const matched = offices.find(o => o.name === officeName);
    if (matched) {
      setFormSheetOfficeCode(matched.code);
    }
  };

  // Populate form with existing sheet values on editing
  const startEditingSheet = (sheet: any) => {
    setEditingSheet(sheet);
    setFormSheetItemArticle(sheet.itemArticle || '');
    setFormSheetDescription(sheet.description || '');
    setFormSheetPropertyNumber(sheet.propertyNumber || '');
    setFormSheetQuantity(sheet.quantity || 1);
    setFormSheetUnitCost(sheet.unitValue || 0);
    setFormSheetSupplier(sheet.supplier || '');
    setFormSheetRequestedBy(sheet.requestedBy || userName || '');
    setFormSheetReceiver(sheet.receiver || '');
    setFormSheetPurpose(sheet.justification || '');
    setFormSheetRemarks(sheet.adminRemarks || '');
    setFormSheetOffice(sheet.office || '');
    setFormSheetOfficeCode(sheet.officeCode || '');
    setIsSheetFormModalOpen(true);
  };

  // Subscribing to requisition requests
  useEffect(() => {
    const q = query(collection(db, "requests"), orderBy("requestedAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        })) as AssetRequest[];
        setAssetRequests(fetched);
        setLoadingReqs(false);
      },
      (err) => {
        console.error("Accounting Requisition Subscription Error:", err);
        setLoadingReqs(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // Subscribing to Accountant Requests
  useEffect(() => {
    const q = query(collection(db, "requests"), orderBy("requestedAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const fetched = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              ...data,
            };
          })
          .filter((d: any) => d.requestType === 'FINANCIAL' || d.amount !== undefined || (!d.itemArticle && d.title))
          .map((d: any) => ({
            id: d.id,
            title: d.itemArticle || d.title || 'Untitled Financial Request',
            details: d.justification || d.details || '',
            amount: d.amount,
            quantity: d.quantity || 1,
            requestedBy: d.requestedBy || d.submittedBy || 'Accountant',
            submittedBy: d.requestedBy || 'Accountant',
            submittedAt: d.requestedAt || new Date().toISOString(),
            status: d.status === 'DECLINED' || d.status === 'REJECTED' ? 'REJECTED' : d.status,
            priority: d.priority || 'Medium',
            adminRemarks: d.responseRemarks || d.adminRemarks || '',
            handledBy: d.handledBy || '',
            handledAt: d.handledAt || '',
            slipNumber: d.slipNumber || '',
            unit: d.unit || 'pcs',
            equipmentType: d.category || d.equipmentType || 'Office Equipment',
            office: d.office || 'Accounting Office',
            targetOffice: d.targetOffice || 'Municipal Engineering',
            approvedAt: d.approvedAt || '',
            approvedBy: d.approvedBy || '',
            rejectedAt: d.rejectedAt || '',
            rejectedBy: d.rejectedBy || '',
            rejectionReason: d.rejectionReason || d.adminRemarks || ''
          }));
        setActRequests(fetched);
        setLoadingActReqs(false);
      },
      (err) => {
        console.error("Accountant Admin Requests Subscription Error:", err);
        setLoadingActReqs(false);
      },
    );

    return () => unsubscribe();
  }, []);

  // Set default form values when editing starts
  const startEditing = (item: InventoryItem) => {
    setEditingItem(item);
    setFormUsefulLife(item.usefulLife || 5);
    setFormAssetCode(item.assetCode || "");
    setFormFundingSource(item.fundingSource || "General Fund");
    setFormAcquisitionDate(
      item.acquisitionDate || new Date().toISOString().split("T")[0],
    );
    setFormAcquisitionCost(
      item.acquisitionCost || item.unitValue * item.qtyPhysicalCount,
    );
  };

  const saveAccountingDetails = async () => {
    if (!editingItem) return;
    setProcessingId(editingItem.id);
    try {
      const docRef = doc(db, "inventory_items", editingItem.id);
      const updates = {
        usefulLife: formUsefulLife,
        assetCode: formAssetCode,
        fundingSource: formFundingSource,
        acquisitionDate: formAcquisitionDate,
        acquisitionCost: formAcquisitionCost,
        unitValue: Math.round(
          formAcquisitionCost / Math.max(1, editingItem.qtyPhysicalCount),
        ),
      };

      await updateDoc(docRef, updates);

      // Track action in system logs
      await addDoc(collection(db, "system_logs"), {
        timestamp: new Date(),
        user: userName,
        action: `Valuation Ledger Calibrated: ${editingItem.article} updated with useful life ${formUsefulLife} yrs (${formFundingSource})`,
        module: "Accounting Valuation Hub",
      });

      alert(
        `Financial ledger calibrated successfully for ${editingItem.article}!`,
      );
      setEditingItem(null);
    } catch (err) {
      console.error("Accounting calibration failed:", err);
      alert("Failed to update financial figures inside state.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCertifyRequest = async (
    req: AssetRequest,
    source: string,
    note: string,
  ) => {
    setProcessingId(req.id);
    try {
      const docRef = doc(db, "requests", req.id);
      await updateDoc(docRef, {
        status: "FORWARDED",
        responseRemarks: `Pre-audited & budget certified under ${source}. Remarks: ${note || "Funding Source approved."}`,
        handledBy: `${userName} (Accounting)`,
        handledAt: new Date().toISOString(),
      });

      await logProcurementTransaction({
        slipNumber: (req as any).slipNumber || "N/A",
        requestId: req.id,
        itemArticle: req.itemArticle,
        quantity: req.quantity,
        amount: req.amount || null,
        status: "Approved",
        user: userName,
        office: "Accounting Office",
        details: `Funding Certified & Forwarded by Accountant under ${source}. Remarks: "${note || 'None'}"`
      });

      // Audit logs
      await addDoc(collection(db, "system_logs"), {
        timestamp: new Date(),
        user: userName,
        action: `Funding certified & request forwarded to Admin: ${req.quantity}x ${req.itemArticle} for ${req.office}`,
        module: "Accounting Voucher Certification",
      });

      if (req.requestType === 'FINANCIAL' || (req as any).slipNumber) {
        await logPRSAction({
          user: userName,
          role: 'ACCOUNTING',
          formType: 'PRS',
          transactionNumber: (req as any).slipNumber || "N/A",
          timestamp: new Date().toISOString(),
          action: `APPROVAL: Accountant certified funding & approved/forwarded PRS Slip ${(req as any).slipNumber || "N/A"}`,
          module: "Procurement Audit"
        });
      }

      alert(
        "Request funding certified & forwarded to GSO Admin for final approval.",
      );
    } catch (err) {
      console.error("Budget Certification failed:", err);
      alert("Failed to submit funding clearance.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleDeclineRequest = async (req: AssetRequest, note: string) => {
    if (!note) {
      alert(
        "Please enter a remark detailing why funding certification was withheld.",
      );
      return;
    }
    setProcessingId(req.id);
    try {
      const docRef = doc(db, "requests", req.id);
      await updateDoc(docRef, {
        status: "DECLINED",
        responseRemarks: `Funding withheld/withdrawn: ${note}`,
        handledBy: `${userName} (Accounting)`,
        handledAt: new Date().toISOString(),
      });

      await logProcurementTransaction({
        slipNumber: (req as any).slipNumber || "N/A",
        requestId: req.id,
        itemArticle: req.itemArticle,
        quantity: req.quantity,
        amount: req.amount || null,
        status: "Declined",
        user: userName,
        office: "Accounting Office",
        details: `Budget certification declined/withheld by Accountant. Reason: "${note}"`
      });

      await addDoc(collection(db, "system_logs"), {
        timestamp: new Date(),
        user: userName,
        action: `Funding clearance withheld: ${req.itemArticle} for ${req.office}`,
        module: "Accounting Voucher Certification",
      });

      if (req.requestType === 'FINANCIAL' || (req as any).slipNumber) {
        await logPRSAction({
          user: userName,
          role: 'ACCOUNTING',
          formType: 'PRS',
          transactionNumber: (req as any).slipNumber || "N/A",
          timestamp: new Date().toISOString(),
          action: `REJECTION: Accountant withheld funding & declined PRS Slip ${(req as any).slipNumber || "N/A"}. Reason: ${note}`,
          module: "Procurement Audit"
        });
      }

      alert("Funding withheld successfully.");
    } catch (err) {
      console.error("Decline process failed:", err);
      alert("Failed to decline request.");
    } finally {
      setProcessingId(null);
    }
  };

  const handleSendFormToAdmin = async () => {
    setIsFormSending(true);
    try {
      const timestamp = new Date().toISOString();
      const officeItems = items.filter(item => 
        item.office && item.office.toLowerCase().trim() === selectedStockCardOffice.toLowerCase().trim()
      );
      const matchedItems = officeItems.filter(item => {
        const val = item.acquisitionCost || item.unitValue || 0;
        return selectedDocumentType === "PAR" ? val >= 50000 : val < 50000;
      });

      if (matchedItems.length === 0) {
        alert(`Cannot send an empty form. No items match this category for ${selectedStockCardOffice}.`);
        setIsFormSending(false);
        return;
      }

      const totalValue = matchedItems.reduce((acc, item) => acc + (item.acquisitionCost || item.unitValue || 0) * (item.qtyPhysicalCount || 1), 0);

      // Map to report rows
      const reportRows = matchedItems.map(item => ({
        id: item.id,
        article: item.article,
        description: item.description || "",
        propertyNumber: item.propertyNumber || "",
        unitValue: item.acquisitionCost || item.unitValue || 0,
        qtyPhysicalCount: item.qtyPhysicalCount || 1,
        qtyPropertyCard: item.qtyPropertyCard || 1,
        unitOfMeasure: item.unitOfMeasure || "unit",
        dateReceived: item.dateReceived || item.acquisitionDate || "",
        personAccountable: item.personAccountable || ""
      }));

      const reportType = selectedDocumentType === "PAR" ? "Property Acknowledgement Receipt (PAR)" : "Inventory Custodian Slip (ICS)";
      const reportMode = selectedDocumentType === "PAR" ? "par" : "ics";

      const reportPayload: any = {
        report_type: reportType,
        fund_cluster: formFundCluster || "GENERAL FUND",
        report_date: formDateIssued || new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
        accountable_person: formReceivedBy || matchedItems[0]?.personAccountable || "TBD",
        accountable_position: "Department Representative",
        accountability_date: formDateIssued || new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }),
        total_value: totalValue,
        item_count: reportRows.length,
        items_snapshot: reportRows,
        status: "Pending Approval",
        reportMode: reportMode,
        submittedByOffice: selectedStockCardOffice,
        senderName: userName || "Accountant",
        forwardedStatus: "Pending",
        forwardedAt: timestamp,
        history: [
          {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: timestamp,
            action: 'Draft Created',
            details: `Official ${selectedDocumentType} form draft compiled by Accountant ${userName || ''}.`
          },
          {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: timestamp,
            action: 'Submitted',
            details: `Official ${selectedDocumentType} form submitted to Engineer/Admin by Accountant ${userName || ''} for ${selectedStockCardOffice}.`
          }
        ],
        created_at: serverTimestamp()
      };

      if (selectedDocumentType === "PAR") {
        reportPayload.spcNotedBy = formApprovedBy;
        reportPayload.spcUnitCost = totalValue;
      } else {
        reportPayload.icsNo = formDocNo;
        reportPayload.icsDateIssued = formDateIssued;
        reportPayload.icsEmployeeName = formReceivedBy || matchedItems[0]?.personAccountable || "TBD";
        reportPayload.icsIssuedBy = formIssuedBy;
      }

      const docRef = await addDoc(collection(db, 'reports'), reportPayload);

      // Create an entry in 'requests' collection so it appears in Accounting Requests in the Admin page
      await addDoc(collection(db, 'requests'), {
        requestType: selectedDocumentType,
        requestNumber: formDocNo || reportPayload.parNo || reportPayload.icsNo || `${selectedDocumentType}-${Date.now()}`,
        itemArticle: matchedItems.map(i => i.article).filter(Boolean).join(', ') || `${selectedDocumentType} Form Items`,
        office: selectedStockCardOffice,
        requestedBy: userName || 'Accountant',
        assignedAdmin: 'Engineer / GSO Admin',
        amount: totalValue,
        quantity: matchedItems.reduce((acc, item) => acc + (item.qtyPhysicalCount || 1), 0),
        justification: `Official ${selectedDocumentType} form compiled and submitted from Accounting for ${selectedStockCardOffice}.`,
        status: 'Submitted',
        reportId: docRef.id,
        items_snapshot: reportRows,
        requestedAt: timestamp,
        history: [
          {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: timestamp,
            action: 'Submitted',
            details: `Official ${selectedDocumentType} form submitted to Engineer/Admin by Accountant ${userName || ''} for ${selectedStockCardOffice}.`
          }
        ]
      });

      // Create a notification for Admin
      await addDoc(collection(db, 'notifications'), {
        recipientRole: 'ADMIN',
        message: `New Official ${selectedDocumentType} Form has been submitted for ${selectedStockCardOffice} and is awaiting review.`,
        timestamp: timestamp,
        isRead: false,
        type: 'SUBMISSION',
        reportId: docRef.id
      });

      // Log in system logs
      await addDoc(collection(db, "system_logs"), {
        timestamp: new Date(),
        user: userName || "Accountant",
        action: `Submitted official ${selectedDocumentType} form for ${selectedStockCardOffice} to Engineer/Admin for review.`,
        module: "Reporting"
      });

      alert(`Official ${selectedDocumentType} Form successfully created and sent to Engineer/Admin!`);
      setSelectedDocumentType(null);
    } catch (err) {
      console.error("Error sending form: ", err);
      alert("Failed to send form. Please verify network connection.");
    } finally {
      setIsFormSending(false);
    }
  };

  const handleSendToEngineer = async (req: any) => {
    try {
      const timestamp = new Date().toISOString();
      const docRef = doc(db, "requests", req.id);
      await updateDoc(docRef, {
        status: "Pending Delivery",
        sentToEngineerAt: timestamp,
      });

      await logProcurementTransaction({
        slipNumber: req.slipNumber || "N/A",
        requestId: req.id,
        itemArticle: req.itemArticle || req.title || "Equipment",
        quantity: req.quantity || 1,
        amount: req.amount || null,
        status: "Sent",
        user: userName,
        office: "Accounting Office",
        details: `Accountant sent PRS to Municipal Engineering Cargo Desk. Ready for receipt verification.`
      });

      // Send in-app notification for the Engineer (role OFFICE_HEAD, office Engineering)
      await addDoc(collection(db, "notifications"), {
        recipientRole: 'OFFICE_HEAD',
        recipientOffice: "Municipal Engineering",
        message: `NEW PRS SENT: Procurement Slip ${req.slipNumber || "N/A"} for "${req.itemArticle || req.title}" (Qty: ${req.quantity || 1}) has been sent by Accounting. Ready for receiving verification.`,
        timestamp,
        isRead: false,
        type: 'NEW_REQUEST',
        reportId: req.id
      });

      // Add to system logs
      await addDoc(collection(db, "system_logs"), {
        timestamp,
        user: userName,
        action: `SENT TO ENGINEER: Accountant sent PRS Slip ${req.slipNumber || "N/A"} ("${req.itemArticle || req.title}", Qty ${req.quantity}) to Municipal Engineering Cargo Desk.`,
        module: "Accountant Desk"
      });

      await logPRSAction({
        user: userName,
        role: 'ACCOUNTING',
        formType: 'PRS',
        transactionNumber: req.slipNumber || "N/A",
        timestamp,
        action: `SUBMISSION: Accountant submitted PRS Slip ${req.slipNumber || "N/A"} ("${req.itemArticle || req.title}") to Municipal Engineering Cargo Desk`,
        module: "Procurement Audit"
      });

      alert(`Success! PRS Slip ${req.slipNumber || "N/A"} containing "${req.itemArticle || req.title}" has been successfully sent to the Engineer's Cargo desk for receipt verification.`);
    } catch (err) {
      console.error("Send to engineer error:", err);
      alert("Database error sending PRS to the Engineer.");
    }
  };

  const handleApproveFromDashboard = (req: AssetRequest) => {
    const selEle = document.getElementById(
      `dashboard-fund-select-${req.id}`,
    ) as HTMLSelectElement;
    const noteEle = document.getElementById(
      `dashboard-fund-note-${req.id}`,
    ) as HTMLInputElement;
    handleCertifyRequest(
      req,
      selEle?.value || "General Fund",
      noteEle?.value || "",
    );
  };

  const handleRejectFromDashboard = (req: AssetRequest) => {
    const noteEle = document.getElementById(
      `dashboard-fund-note-${req.id}`,
    ) as HTMLInputElement;
    const rmk = noteEle?.value || "Declined due to budget constraints.";
    handleDeclineRequest(req, rmk);
  };

  // Straight-line depreciation calculation helper (LGU Standard)
  const getFinancialCalculations = (item: InventoryItem) => {
    const cost = item.acquisitionCost || item.unitValue * item.qtyPhysicalCount;
    const life = item.usefulLife || 5;
    const salvageValue = cost * 0.05; // 5% standard salvage rate for government sectors
    const depreciableCost = cost - salvageValue;
    const annualDepreciation = depreciableCost / life;

    // Date computation
    let ageInYears = 0;
    if (item.acquisitionDate) {
      const acqYear = new Date(item.acquisitionDate).getFullYear();
      const currentYear = new Date().getFullYear();
      ageInYears = Math.max(0, currentYear - acqYear);
    } else if (item.yearPurchased) {
      const currentYear = new Date().getFullYear();
      ageInYears = Math.max(0, currentYear - Number(item.yearPurchased));
    }

    const accumulatedDepreciation = Math.min(
      depreciableCost,
      annualDepreciation * ageInYears,
    );
    const carryingValue = cost - accumulatedDepreciation;

    return {
      cost,
      salvageValue,
      depreciableCost,
      annualDepreciation,
      accumulatedDepreciation,
      carryingValue,
      ageInYears: Math.min(life, ageInYears),
    };
  };

  // Filtered items logic
  const filteredItems = items.filter((item) => {
    const matchesSearch =
      item.article.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.assetCode || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.propertyNumber || "")
        .toLowerCase()
        .includes(searchTerm.toLowerCase());

    const matchesOffice =
      officeFilter === "ALL" || item.office === officeFilter;
    const matchesFunding =
      fundingFilter === "ALL" ||
      (item.fundingSource || "General Fund") === fundingFilter;

    return matchesSearch && matchesOffice && matchesFunding;
  });

  const exportToExcel = () => {
    try {
      const headers = [
        "Asset Code",
        "Article",
        "Property Number",
        "Acquisition Date",
        "Office",
        "Funding Source",
        "Acquisition Cost (PHP)",
        "Useful Life (Yrs)",
        "Salvage Value (PHP)",
        "Accumulated Depreciation (PHP)",
        "Book Value (PHP)"
      ];

      const csvRows = [headers.join(",")];

      filteredItems.forEach((item) => {
        const calcs = getFinancialCalculations(item);
        const row = [
          item.assetCode || "N/A",
          item.article.replace(/"/g, '""'),
          item.propertyNumber || "N/A",
          item.acquisitionDate || item.yearPurchased || "N/A",
          item.office.replace(/"/g, '""'),
          (item.fundingSource || "General Fund").replace(/"/g, '""'),
          calcs.cost,
          item.usefulLife || 5,
          calcs.salvageValue,
          calcs.accumulatedDepreciation,
          calcs.carryingValue
        ];
        csvRows.push(row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","));
      });

      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `LGU_Tibiao_Asset_Valuation_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export to Excel failed:", err);
      alert("Failed to export ledger to Excel.");
    }
  };

  const exportOfficeRecordsToExcel = (officeName: string, documentType: string, records: InventoryItem[]) => {
    try {
      const headers = [
        "Index",
        "Property Number",
        "Article",
        "Description",
        "Unit Value (PHP)",
        "Physical Qty",
        "Total Qty Value (PHP)",
        "Accountable Officer",
        "Classification"
      ];

      const csvRows = [headers.join(",")];

      records.forEach((item, index) => {
        const totalValue = item.unitValue * item.qtyPhysicalCount;
        const row = [
          index + 1,
          item.propertyNumber || "N/A",
          item.article.replace(/"/g, '""'),
          (item.description || "").replace(/"/g, '""'),
          item.unitValue,
          item.qtyPhysicalCount,
          totalValue,
          (item.personAccountable || "N/A").replace(/"/g, '""'),
          item.unitValue >= 15000 ? "PAR Asset" : "ICS Supply"
        ];
        csvRows.push(row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","));
      });

      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + csvRows.join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `LGU_Tibiao_${officeName.replace(/\s+/g, '_')}_${documentType}_Stock_Cards_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Export office records to Excel failed:", err);
      alert("Failed to export records to Excel.");
    }
  };

  const handleExportStockCardTxnsToCSV = (item: InventoryItem, txns: any[]) => {
    try {
      const headers = ["Date & Time", "Reference No", "Staff/User", "Action Type", "Quantity Change", "Running Balance", "Remarks"];
      const rows = txns.map(t => [
        `${t.date} ${t.time || ''}`,
        t.reference || "N/A",
        t.user || "System",
        t.transactionType,
        t.quantity,
        t.newBalance,
        (t.remarks || "").replace(/"/g, '""')
      ]);
      const csvContent = "data:text/csv;charset=utf-8,\uFEFF" 
        + [headers.join(","), ...rows.map(e => e.map(val => `"${String(val).replace(/"/g, '""')}"`).join(","))].join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Stock_Card_History_${item.article.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error("Exporting item transactions failed:", err);
      alert("Failed to export transaction history.");
    }
  };

  const handlePrintStockCardHistory = (item: InventoryItem, itemTxns: any[]) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to print.");
      return;
    }
    
    const txnRowsHtml = itemTxns.map(t => {
      const isAddition = t.transactionType.includes('Received') || (t.transactionType.includes('Adjustment') && t.quantity > 0);
      return `
        <tr style="border-bottom: 1px solid #e2e8f0; font-size: 11px;">
          <td style="padding: 10px; font-family: monospace;">${t.date} ${t.time || ''}</td>
          <td style="padding: 10px; font-weight: bold; font-family: monospace; color: #4f46e5;">${t.reference || 'N/A'}</td>
          <td style="padding: 10px; font-weight: 800; text-transform: uppercase;">${t.user || 'System'}</td>
          <td style="padding: 10px; font-weight: 800; text-align: center; color: ${isAddition ? '#10b981' : '#f43f5e'}">
            ${isAddition ? '+' : '-'}${t.quantity}
          </td>
          <td style="padding: 10px; text-align: center; font-weight: 900; background-color: #f8fafc;">${t.newBalance}</td>
          <td style="padding: 10px; color: #4b5563; font-style: italic;">${t.remarks || 'No remarks'}</td>
        </tr>
      `;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Stock Card Ledger - ${item.article}</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700;900&display=swap');
            body { font-family: 'Inter', sans-serif; color: #1e293b; padding: 40px; line-height: 1.5; }
            .header { text-align: center; margin-bottom: 30px; border-bottom: 4px double #1e293b; padding-bottom: 20px; }
            .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 30px; background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; }
            .meta-table td { padding: 12px; font-size: 11px; border: 1px solid #e2e8f0; }
            .meta-label { font-weight: bold; width: 150px; text-transform: uppercase; color: #64748b; background-color: #f1f5f9; }
            .txn-table { width: 100%; border-collapse: collapse; margin-top: 20px; border: 1px solid #e2e8f0; }
            .txn-table th { background-color: #0f172a; color: #ffffff; padding: 12px; font-size: 10px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; border: 1px solid #1e293b; text-align: left; }
            .footer { margin-top: 60px; display: flex; justify-content: space-between; font-size: 12px; }
            .sign-box { border-top: 2px solid #0f172a; width: 220px; text-align: center; margin-top: 40px; padding-top: 8px; font-weight: 900; text-transform: uppercase; letter-spacing: 0.5px; }
          </style>
        </head>
        <body onload="window.print()">
          <div class="header">
            <h1 style="margin: 0; font-size: 18px; text-transform: uppercase; letter-spacing: 1.5px; font-weight: 900;">Municipality of Tibiao</h1>
            <p style="margin: 4px 0 0 0; font-size: 10px; font-weight: 800; color: #64748b; letter-spacing: 3px; text-transform: uppercase;">Office of the Municipal Accountant</p>
            <h2 style="margin: 20px 0 0 0; font-size: 15px; letter-spacing: 4px; font-weight: 900; color: #0f172a; text-transform: uppercase;">Stock Card History Ledger</h2>
          </div>
          
          <table class="meta-table">
            <tr>
              <td class="meta-label">Stock Card ID / No:</td>
              <td style="font-weight: 900; font-family: monospace; color: #4f46e5; font-size: 12px;">${item.propertyNumber || 'N/A'}</td>
              <td class="meta-label">Office / Dept:</td>
              <td style="font-weight: 800; text-transform: uppercase;">${item.office}</td>
            </tr>
            <tr>
              <td class="meta-label">Item / Article:</td>
              <td style="font-weight: 900; font-size: 13px; text-transform: uppercase;">${item.article}</td>
              <td class="meta-label">Classification:</td>
              <td style="font-weight: 800; color: #4f46e5;">${item.unitValue >= 15000 ? 'PAR Asset (Equipment)' : 'ICS Supply (Semi-Expendable)'}</td>
            </tr>
            <tr>
              <td class="meta-label">Unit Value:</td>
              <td style="font-weight: 800; font-size: 12px;">PHP ${item.unitValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td class="meta-label">Current Balance:</td>
              <td style="font-weight: 900; font-size: 13px; color: #0f172a; background-color: #f0fdf4;">${item.qtyPhysicalCount} ${item.unitOfMeasure || 'unit'}</td>
            </tr>
            <tr>
              <td class="meta-label">Description:</td>
              <td colspan="3" style="color: #475569; font-style: italic;">"${item.description || 'No description logged.'}"</td>
            </tr>
          </table>
          
          <h3 style="font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; margin-bottom: 12px; border-bottom: 2px solid #0f172a; padding-bottom: 6px; color: #0f172a; font-weight: 900;">Audit Ledger Transaction History</h3>
          
          <table class="txn-table">
            <thead>
              <tr>
                <th style="width: 18%;">Date & Time</th>
                <th style="width: 15%;">Reference No.</th>
                <th style="width: 20%;">Staff/User</th>
                <th style="width: 12%; text-align: center;">Change Qty</th>
                <th style="width: 15%; text-align: center;">Running Balance</th>
                <th style="width: 20%;">Remarks / Audit Notes</th>
              </tr>
            </thead>
            <tbody>
              ${txnRowsHtml || '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #94a3b8; font-weight: bold; font-size: 12px;">No transactions logged for this Stock Card.</td></tr>'}
            </tbody>
          </table>
          
          <div class="footer">
            <div>
              <p style="margin: 0; font-weight: bold; color: #64748b; text-transform: uppercase; font-size: 10px; letter-spacing: 1px;">Audited By:</p>
              <div class="sign-box">${userName}</div>
              <p style="font-size: 9px; color: #64748b; margin-top: 4px; font-weight: bold; text-transform: uppercase;">Municipal Accountant Staff</p>
            </div>
            <div>
              <p style="margin: 0; font-weight: bold; color: #64748b; text-transform: uppercase; font-size: 10px; letter-spacing: 1px;">Noted By:</p>
              <div class="sign-box">GIL B. BANDOJA</div>
              <p style="font-size: 9px; color: #64748b; margin-top: 4px; font-weight: bold; text-transform: uppercase;">Municipal Mayor</p>
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Financial statistics aggregations (LGU Consolidated Overall)
  const computedScores = items.map((i) => getFinancialCalculations(i));
  const aggregateCost = computedScores.reduce(
    (sum, item) => sum + item.cost,
    0,
  );
  const aggregateAccumulatedDep = computedScores.reduce(
    (sum, item) => sum + item.accumulatedDepreciation,
    0,
  );
  const aggregateCarryingValue = computedScores.reduce(
    (sum, item) => sum + item.carryingValue,
    0,
  );
  const pendingRequestsCount = assetRequests.filter(
    (r) => r.status === "PENDING",
  ).length;
  const pendingClearances = assetRequests.filter((r) => r.status === "PENDING");

  // Accountant buying / pending delivery requests
  const pendingDeliveryRequests = actRequests.filter(
    (r) =>
      r.status === "Pending Delivery" ||
      r.status === "PENDING" ||
      r.status === "Submitted" ||
      r.status === "Pending Engineer/Admin Review"
  );
  const pendingDeliveryCount = pendingDeliveryRequests.length;
  const pendingDeliveryAmount = pendingDeliveryRequests.reduce(
    (sum, r) => sum + (Number(r.amount) || ((Number(r.quantity) || 1) * (Number(r.unitCost || r.unitValue) || 0)) || 0),
    0
  );

  // Dynamically Filtered calculations (for specific search views & statements)
  const filteredComputed = filteredItems.map((i) =>
    getFinancialCalculations(i),
  );
  const filteredCost = filteredComputed.reduce(
    (sum, item) => sum + item.cost,
    0,
  );
  const filteredAccumulatedDep = filteredComputed.reduce(
    (sum, item) => sum + item.accumulatedDepreciation,
    0,
  );
  const filteredCarryingValue = filteredComputed.reduce(
    (sum, item) => sum + item.carryingValue,
    0,
  );

  // Print function for single Property Acknowledgment Receipt (PAR)
  const handlePrintPAR = (item: InventoryItem) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow pop-ups to print the PAR form.");
      return;
    }
    const controlNo = item.propertyNumber || `PAR-${new Date().getFullYear()}-${String(item.id.substring(0, 4)).toUpperCase()}`;
    const value = item.unitValue * item.qtyPhysicalCount;
    const acqDate = item.acquisitionDate ? new Date(item.acquisitionDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : (item.yearPurchased || "N/A");
    
    // Create multiple empty grid rows to fill the sheet and simulate official spreadsheet length
    let emptyRowsHtml = "";
    for (let i = 0; i < 6; i++) {
      emptyRowsHtml += `
        <tr style="height: 25px;">
          <td style="border: 1px solid black;">&nbsp;</td>
          <td style="border: 1px solid black;">&nbsp;</td>
          <td style="border: 1px solid black;">&nbsp;</td>
          <td style="border: 1px solid black;">&nbsp;</td>
          <td style="border: 1px solid black;">&nbsp;</td>
          <td style="border: 1px solid black;">&nbsp;</td>
        </tr>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Property Acknowledgement Receipt (PAR) - ${item.article}</title>
        <style>
          @media print {
            @page {
              size: portrait;
              margin: 0.4in;
            }
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
          body {
            font-family: 'Times New Roman', Times, serif;
            margin: 20px;
            color: #000;
            background: #fff;
            line-height: 1.3;
            font-size: 10pt;
          }
          .sheet-container {
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
          }
          .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          .header-logo {
            width: 70px;
            height: 70px;
            object-fit: contain;
          }
          .title-block {
            text-align: center;
            font-weight: bold;
            font-size: 14pt;
            text-transform: uppercase;
            margin-top: 5px;
            margin-bottom: 15px;
            letter-spacing: 0.5px;
          }
          .meta-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10pt;
            margin-bottom: 12px;
          }
          .meta-td {
            padding: 4px 0;
            vertical-align: middle;
          }
          .underline-span {
            border-bottom: 1px solid black;
            padding: 0 8px;
            font-weight: bold;
          }
          .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.5pt;
            margin-bottom: 20px;
          }
          .data-table th {
            border: 1px solid black;
            padding: 6px;
            background-color: #f8fafc;
            text-align: center;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 9pt;
          }
          .data-table td {
            border: 1px solid black;
            padding: 6px 8px;
            vertical-align: middle;
          }
          .sign-table {
            width: 100%;
            border-collapse: collapse;
            border: 1.5px solid black;
            margin-top: 15px;
            font-size: 9.5pt;
            page-break-inside: avoid;
          }
          .sign-td {
            width: 50%;
            padding: 12px;
            vertical-align: top;
          }
          .sign-line {
            border-bottom: 1px solid black;
            text-align: center;
            font-weight: bold;
            text-transform: uppercase;
            margin-top: 30px;
            margin-bottom: 2px;
            min-height: 18px;
            font-size: 10pt;
          }
          .sign-sub {
            font-size: 8pt;
            text-align: center;
            color: #374151;
            margin-bottom: 12px;
          }
          .annex-label {
            text-align: right;
            font-weight: bold;
            font-style: italic;
            font-size: 9.5pt;
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="sheet-container">
          <!-- Official Government Header Block -->
          <table class="header-table">
            <tr>
              <td style="width: 15%; text-align: center; padding: 0;">
                <img src="/tibiaoLogo.jpg" class="header-logo" alt="LGU Tibiao Seal" />
              </td>
              <td style="width: 70%; text-align: center; padding: 0; line-height: 1.3;">
                <div style="font-size: 10pt; text-transform: uppercase; font-weight: bold; letter-spacing: 0.3px;">Republic of the Philippines</div>
                <div style="font-size: 9.5pt; font-style: italic; color: #374151;">Province of Antique</div>
                <div style="font-size: 12.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">MUNICIPALITY OF TIBIAO</div>
              </td>
              <td style="width: 15%; padding: 0;">&nbsp;</td>
            </tr>
          </table>

          <div class="title-block">PROPERTY ACKNOWLEDGEMENT RECEIPT</div>

          <!-- Entity & PAR Info Block -->
          <table class="meta-table">
            <tr>
              <td class="meta-td" style="width: 60%;">
                <strong>Entity Name:</strong> <span class="underline-span" style="min-width: 250px; display: inline-block;">MUNICIPALITY OF TIBIAO / ${item.office.toUpperCase()}</span>
              </td>
              <td class="meta-td" style="width: 40%; text-align: right;">
                &nbsp;
              </td>
            </tr>
            <tr>
              <td class="meta-td">
                <strong>Fund Cluster:</strong> <span class="underline-span" style="min-width: 180px; display: inline-block;">${item.fundingSource || "GENERAL FUND"}</span>
              </td>
              <td class="meta-td" style="text-align: right;">
                <strong>PAR No.:</strong> <span class="underline-span" style="min-width: 150px; display: inline-block; font-family: monospace;">${controlNo}</span>
              </td>
            </tr>
          </table>

          <!-- Grid Data Table -->
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 8%;">Quantity</th>
                <th style="width: 10%;">Unit</th>
                <th style="width: 42%;">Description</th>
                <th style="width: 16%;">Property Number</th>
                <th style="width: 12%;">Date Acquired</th>
                <th style="width: 12%;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="text-align: center; font-weight: bold;">${item.qtyPhysicalCount}</td>
                <td style="text-align: center; text-transform: uppercase;">${item.unitOfMeasure || "unit"}</td>
                <td>
                  <strong style="text-transform: uppercase; font-size: 9.5pt; display: block; margin-bottom: 2px;">${item.article}</strong>
                  <span style="font-size: 8.5pt; color: #1e293b; white-space: pre-line;">${item.description || "No specific specs logged."}</span>
                  ${item.modelNumber || item.serialNumber ? `
                    <div style="font-size: 8pt; color: #475569; margin-top: 4px; border-top: 1px dotted #ccc; padding-top: 2px;">
                      ${item.modelNumber ? `Model: ${item.modelNumber} ` : ""}
                      ${item.serialNumber ? `&bull; Serial: ${item.serialNumber}` : ""}
                    </div>
                  ` : ""}
                </td>
                <td style="font-family: monospace; font-size: 9pt; text-align: center;">${item.propertyNumber || "Pending"}</td>
                <td style="text-align: center; font-size: 9pt;">${acqDate}</td>
                <td style="text-align: right; font-weight: bold; font-family: monospace;">₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <!-- Empty spacer rows for authentic excel sheets layout -->
              ${emptyRowsHtml}
            </tbody>
          </table>

          <!-- Signatory Boxes (Side-By-Side Grid Table) -->
          <table class="sign-table">
            <tr>
              <!-- Received By -->
              <td class="sign-td" style="border-right: 1.5px solid black;">
                <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 20px;">Received by:</div>
                <div class="sign-line">${item.personAccountable || "End-User Employee"}</div>
                <div class="sign-sub">Signature over Printed Name of End User</div>
                
                <div class="sign-line" style="margin-top: 20px;">${item.assignedStaff || "Department Staff"}</div>
                <div class="sign-sub">Position / Office</div>
                
                <div class="sign-line" style="margin-top: 20px;">${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <div class="sign-sub">Date</div>
              </td>
              <!-- Issued By -->
              <td class="sign-td">
                <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 20px;">Issued by:</div>
                <div class="sign-line">CLEMENS G. BANDOJA</div>
                <div class="sign-sub">Signature over Printed Name of Supply and/or Property Custodian</div>
                
                <div class="sign-line" style="margin-top: 20px;">Supply Officer II / Property Custodian</div>
                <div class="sign-sub">Position / Office</div>
                
                <div class="sign-line" style="margin-top: 20px;">${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <div class="sign-sub">Date</div>
              </td>
            </tr>
          </table>

          <div class="annex-label">Annex B</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 600);
          };
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Print function for single Inventory Custodian Slip (ICS)
  const handlePrintICS = (item: InventoryItem) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow pop-ups to print the ICS form.");
      return;
    }
    const controlNo = `ICS-${new Date().getFullYear()}-${String(item.id.substring(0, 4)).toUpperCase()}`;
    const value = item.unitValue * item.qtyPhysicalCount;
    
    // Create multiple empty grid rows to fill the sheet and simulate official spreadsheet length
    let emptyRowsHtml = "";
    for (let i = 0; i < 6; i++) {
      emptyRowsHtml += `
        <tr style="height: 25px;">
          <td style="border: 1px solid black;">&nbsp;</td>
          <td style="border: 1px solid black;">&nbsp;</td>
          <td style="border: 1px solid black;">&nbsp;</td>
          <td style="border: 1px solid black;">&nbsp;</td>
          <td style="border: 1px solid black;">&nbsp;</td>
        </tr>
      `;
    }

    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Inventory Custodian Slip (ICS) - ${item.article}</title>
        <style>
          @media print {
            @page {
              size: portrait;
              margin: 0.4in;
            }
            body {
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
          }
          body {
            font-family: 'Times New Roman', Times, serif;
            margin: 20px;
            color: #000;
            background: #fff;
            line-height: 1.3;
            font-size: 10pt;
          }
          .sheet-container {
            width: 100%;
            max-width: 800px;
            margin: 0 auto;
          }
          .header-table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 15px;
          }
          .header-logo {
            width: 70px;
            height: 70px;
            object-fit: contain;
          }
          .title-block {
            text-align: center;
            font-weight: bold;
            font-size: 14pt;
            text-transform: uppercase;
            margin-top: 5px;
            margin-bottom: 15px;
            letter-spacing: 0.5px;
          }
          .meta-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 10pt;
            margin-bottom: 12px;
          }
          .meta-td {
            padding: 4px 0;
            vertical-align: middle;
          }
          .underline-span {
            border-bottom: 1px solid black;
            padding: 0 8px;
            font-weight: bold;
          }
          .data-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 9.5pt;
            margin-bottom: 20px;
          }
          .data-table th {
            border: 1px solid black;
            padding: 6px;
            background-color: #f8fafc;
            text-align: center;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 9pt;
          }
          .data-table td {
            border: 1px solid black;
            padding: 6px 8px;
            vertical-align: middle;
          }
          .sign-table {
            width: 100%;
            border-collapse: collapse;
            border: 1.5px solid black;
            margin-top: 15px;
            font-size: 9.5pt;
            page-break-inside: avoid;
          }
          .sign-td {
            width: 50%;
            padding: 12px;
            vertical-align: top;
          }
          .sign-line {
            border-bottom: 1px solid black;
            text-align: center;
            font-weight: bold;
            text-transform: uppercase;
            margin-top: 30px;
            margin-bottom: 2px;
            min-height: 18px;
            font-size: 10pt;
          }
          .sign-sub {
            font-size: 8pt;
            text-align: center;
            color: #374151;
            margin-bottom: 12px;
          }
          .annex-label {
            text-align: right;
            font-weight: bold;
            font-style: italic;
            font-size: 9.5pt;
            margin-top: 10px;
          }
        </style>
      </head>
      <body>
        <div class="sheet-container">
          <!-- Official Government Header Block -->
          <table class="header-table">
            <tr>
              <td style="width: 15%; text-align: center; padding: 0;">
                <img src="/tibiaoLogo.jpg" class="header-logo" alt="LGU Tibiao Seal" />
              </td>
              <td style="width: 70%; text-align: center; padding: 0; line-height: 1.3;">
                <div style="font-size: 10pt; text-transform: uppercase; font-weight: bold; letter-spacing: 0.3px;">Republic of the Philippines</div>
                <div style="font-size: 9.5pt; font-style: italic; color: #374151;">Province of Antique</div>
                <div style="font-size: 12.5pt; font-weight: bold; text-transform: uppercase; letter-spacing: 0.5px;">MUNICIPALITY OF TIBIAO</div>
              </td>
              <td style="width: 15%; padding: 0;">&nbsp;</td>
            </tr>
          </table>

          <div class="title-block">INVENTORY CUSTODIAN SLIP</div>

          <!-- Entity & ICS Info Block -->
          <table class="meta-table">
            <tr>
              <td class="meta-td" style="width: 60%;">
                <strong>Entity Name:</strong> <span class="underline-span" style="min-width: 250px; display: inline-block;">MUNICIPALITY OF TIBIAO / ${item.office.toUpperCase()}</span>
              </td>
              <td class="meta-td" style="width: 40%; text-align: right;">
                &nbsp;
              </td>
            </tr>
            <tr>
              <td class="meta-td">
                <strong>Fund Cluster:</strong> <span class="underline-span" style="min-width: 180px; display: inline-block;">${item.fundingSource || "GENERAL FUND"}</span>
              </td>
              <td class="meta-td" style="text-align: right;">
                <strong>ICS No.:</strong> <span class="underline-span" style="min-width: 150px; display: inline-block; font-family: monospace;">${controlNo}</span>
              </td>
            </tr>
          </table>

          <!-- Grid Data Table -->
          <table class="data-table">
            <thead>
              <tr>
                <th style="width: 8%;">Quantity</th>
                <th style="width: 10%;">Unit</th>
                <th style="width: 46%;">Description</th>
                <th style="width: 20%;">Inventory Item No.</th>
                <th style="width: 16%;">Estimated Useful Life</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="text-align: center; font-weight: bold;">${item.qtyPhysicalCount}</td>
                <td style="text-align: center; text-transform: uppercase;">${item.unitOfMeasure || "unit"}</td>
                <td>
                  <strong style="text-transform: uppercase; font-size: 9.5pt; display: block; margin-bottom: 2px;">${item.article}</strong>
                  <span style="font-size: 8.5pt; color: #1e293b; white-space: pre-line;">${item.description || "No specific specs logged."}</span>
                  ${item.modelNumber || item.serialNumber ? `
                    <div style="font-size: 8pt; color: #475569; margin-top: 4px; border-top: 1px dotted #ccc; padding-top: 2px;">
                      ${item.modelNumber ? `Model: ${item.modelNumber} ` : ""}
                      ${item.serialNumber ? `&bull; Serial: ${item.serialNumber}` : ""}
                    </div>
                  ` : ""}
                </td>
                <td style="font-family: monospace; font-size: 9pt; text-align: center;">${item.propertyNumber || "Pending"}</td>
                <td style="text-align: center; font-size: 9.5pt; font-weight: 500;">${item.usefulLife || "5"} Years</td>
              </tr>
              <!-- Empty spacer rows for authentic excel sheets layout -->
              ${emptyRowsHtml}
            </tbody>
          </table>

          <!-- Signatory Boxes (Side-By-Side Grid Table) -->
          <table class="sign-table">
            <tr>
              <!-- Received By -->
              <td class="sign-td" style="border-right: 1.5px solid black;">
                <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 20px;">Received by:</div>
                <div class="sign-line">${item.personAccountable || "End-User Employee"}</div>
                <div class="sign-sub">Signature over Printed Name of End User</div>
                
                <div class="sign-line" style="margin-top: 20px;">${item.assignedStaff || "Department Staff"}</div>
                <div class="sign-sub">Position / Office</div>
                
                <div class="sign-line" style="margin-top: 20px;">${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <div class="sign-sub">Date</div>
              </td>
              <!-- Issued By -->
              <td class="sign-td">
                <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 20px;">Issued by:</div>
                <div class="sign-line">CLEMENS G. BANDOJA</div>
                <div class="sign-sub">Signature over Printed Name of Supply and/or Property Custodian</div>
                
                <div class="sign-line" style="margin-top: 20px;">Supply Officer II / Property Custodian</div>
                <div class="sign-sub">Position / Office</div>
                
                <div class="sign-line" style="margin-top: 20px;">${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                <div class="sign-sub">Date</div>
              </td>
            </tr>
          </table>

          <div class="annex-label">Appendix 59</div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 600);
          };
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Printable consolidated PAR for selected Office
  const handlePrintOfficePAR = (officeName: string, deptItems: InventoryItem[]) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow pop-ups to print.");
      return;
    }
    const filteredParItems = deptItems.filter(i => i.unitValue >= 50000);
    const rowsHtml = filteredParItems.length === 0 
      ? `<tr><td colspan="8" style="text-align: center; color: #555; padding: 15px;">No active High-Value PPE / Equipment (>= ₱50,000) logged in this office.</td></tr>`
      : filteredParItems.map((item, index) => {
          const val = item.unitValue * item.qtyPhysicalCount;
          return `
            <tr>
              <td style="text-align: center;">${index + 1}</td>
              <td style="text-align: center;">${item.qtyPhysicalCount}</td>
              <td style="text-align: center;">${item.unitOfMeasure || "unit"}</td>
              <td>
                <strong style="text-transform: uppercase;">${item.article}</strong><br/>
                <span style="font-size: 8pt; color: #334155;">${item.description || "N/A"}</span>
              </td>
              <td style="font-family: monospace; text-align: center;">${item.propertyNumber || "N/A"}</td>
              <td style="text-align: center;">${item.acquisitionDate ? new Date(item.acquisitionDate).toLocaleDateString() : (item.yearPurchased || "N/A")}</td>
              <td style="text-align: right; font-family: monospace;">₱${item.unitValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td style="text-align: right; font-weight: bold; font-family: monospace;">₱${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          `;
        }).join("");

    const totalVal = filteredParItems.reduce((sum, item) => sum + (item.unitValue * item.qtyPhysicalCount), 0);
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Consolidated PAR Register - ${officeName}</title>
        <style>
          body { font-family: 'Times New Roman', Times, serif; margin: 40px; font-size: 9.5pt; line-height: 1.4; }
          .header { text-align: center; margin-bottom: 20px; }
          .title { font-size: 13pt; font-weight: bold; text-transform: uppercase; margin-top: 5px; border-bottom: 1px solid #000; padding-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid black; padding: 6px; text-align: left; }
          th { background-color: #f1f5f9; text-align: center; font-weight: bold; text-transform: uppercase; }
          .total-row { background-color: #fafafa; font-weight: bold; }
          .sign-area { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 45px; page-break-inside: avoid; }
          .line { border-bottom: 1px solid black; margin-top: 25px; text-align: center; font-weight: bold; height: 18px; text-transform: uppercase; }
          .subtext { font-size: 8pt; text-align: center; color: #475569; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="font-weight: bold; font-size: 9.5pt; text-transform: uppercase;">Republic of the Philippines</div>
          <div style="font-weight: 900; font-size: 11pt; text-transform: uppercase;">MUNICIPALITY OF TIBIAO, ANTIQUE</div>
          <div class="title">CONSOLIDATED PROPERTY ACKNOWLEDGMENT RECEIPT (PAR) REGISTER</div>
          <div style="font-weight: bold; margin-top: 8px; font-size: 10.5pt; text-transform: uppercase; color: #0f172a;">
            Office / Dept Name: ${officeName === "ALL" ? "ALL LGU OFFICES MUNICIPAL-WIDE" : officeName.toUpperCase()}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 4%;">#</th>
              <th style="width: 6%;">Qty</th>
              <th style="width: 8%;">Unit</th>
              <th style="width: 38%;">Item Article / Specification Details</th>
              <th style="width: 15%; text-align: center;">Property No.</th>
              <th style="width: 10%; text-align: center;">Acq Date</th>
              <th style="width: 9%; text-align: right;">Unit Value</th>
              <th style="width: 10%; text-align: right;">Total Cost</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="7" style="text-align: right; text-transform: uppercase;">Total Active Department Equipment Valuation:</td>
              <td style="text-align: right; font-family: monospace; font-size: 10pt;">₱${totalVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size: 8.5pt; text-align: justify; margin-top: 15px; font-style: italic;">
          This document represents the consolidated index of all Property, Plant and Equipment (PPE) carrying active PARs assigned to ${officeName === "ALL" ? "diverse offices of LGU Tibiao" : `${officeName} department`}. Verified in the fiscal valuation ledger.
        </div>
        <div class="sign-area">
          <div>
            <strong>Certified Checked Correct By:</strong>
            <div class="line">${officeName === "ALL" ? "General Services Officer" : `${officeName} Head`}</div>
            <div class="subtext">Representative Department Head / Signatory</div>
          </div>
          <div>
            <strong>Reconciled & Reissued By:</strong>
            <div class="line">${userName}</div>
            <div class="subtext">Municipal Accountant, LGU Tibiao</div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 600);
          };
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // Printable consolidated ICS for selected Office
  const handlePrintOfficeICS = (officeName: string, deptItems: InventoryItem[]) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow pop-ups to print.");
      return;
    }
    const filteredIcsItems = deptItems.filter(i => i.unitValue < 50000);
    const rowsHtml = filteredIcsItems.length === 0 
      ? `<tr><td colspan="8" style="text-align: center; color: #555; padding: 15px;">No active Semi-Expendable Supplies (< ₱50,000) logged in this office.</td></tr>`
      : filteredIcsItems.map((item, index) => {
          const val = item.unitValue * item.qtyPhysicalCount;
          return `
            <tr>
              <td style="text-align: center;">${index + 1}</td>
              <td style="text-align: center;">${item.qtyPhysicalCount}</td>
              <td style="text-align: center;">${item.unitOfMeasure || "unit"}</td>
              <td>
                <strong style="text-transform: uppercase;">${item.article}</strong><br/>
                <span style="font-size: 8pt; color: #334155;">${item.description || "N/A"}</span>
              </td>
              <td style="font-family: monospace; text-align: center;">${item.propertyNumber || "N/A"}</td>
              <td style="text-align: center;">${item.usefulLife || "5"} Years</td>
              <td style="text-align: right; font-family: monospace;">₱${item.unitValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
              <td style="text-align: right; font-weight: bold; font-family: monospace;">₱${val.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          `;
        }).join("");

    const totalVal = filteredIcsItems.reduce((sum, item) => sum + (item.unitValue * item.qtyPhysicalCount), 0);
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Consolidated ICS Register - ${officeName}</title>
        <style>
          body { font-family: 'Times New Roman', Times, serif; margin: 40px; font-size: 9.5pt; line-height: 1.4; }
          .header { text-align: center; margin-bottom: 20px; }
          .title { font-size: 13pt; font-weight: bold; text-transform: uppercase; margin-top: 5px; border-bottom: 1px solid #000; padding-bottom: 6px; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th, td { border: 1px solid black; padding: 6px; text-align: left; }
          th { background-color: #f1f5f9; text-align: center; font-weight: bold; text-transform: uppercase; }
          .total-row { background-color: #fafafa; font-weight: bold; }
          .sign-area { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 45px; page-break-inside: avoid; }
          .line { border-bottom: 1px solid black; margin-top: 25px; text-align: center; font-weight: bold; height: 18px; text-transform: uppercase; }
          .subtext { font-size: 8pt; text-align: center; color: #475569; }
        </style>
      </head>
      <body>
        <div class="header">
          <div style="font-weight: bold; font-size: 9.5pt; text-transform: uppercase;">Republic of the Philippines</div>
          <div style="font-weight: 900; font-size: 11pt; text-transform: uppercase;">MUNICIPALITY OF TIBIAO, ANTIQUE</div>
          <div class="title">CONSOLIDATED INVENTORY CUSTODIAN SLIP (ICS) REGISTER</div>
          <div style="font-weight: bold; margin-top: 8px; font-size: 10.5pt; text-transform: uppercase; color: #0f172a;">
            Office / Dept Name: ${officeName === "ALL" ? "ALL LGU OFFICES MUNICIPAL-WIDE" : officeName.toUpperCase()}
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="width: 4%;">#</th>
              <th style="width: 6%;">Qty</th>
              <th style="width: 8%;">Unit</th>
              <th style="width: 38%;">Semi-Expendable Article Details</th>
              <th style="width: 15%; text-align: center;">Inventory No.</th>
              <th style="width: 10%; text-align: center;">Useful Life</th>
              <th style="width: 9%; text-align: right;">Unit Value</th>
              <th style="width: 10%; text-align: right;">Total Cost</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
            <tr class="total-row">
              <td colspan="7" style="text-align: right; text-transform: uppercase;">Total Active Department Supplies Value:</td>
              <td style="text-align: right; font-family: monospace; font-size: 10pt;">₱${totalVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
        <div style="font-size: 8.5pt; text-align: justify; margin-top: 15px; font-style: italic;">
          This document represents the consolidated index of all semi-expendable belongings with active ICS accounts assigned to ${officeName === "ALL" ? "various departments" : `${officeName} department`}. Reconciled inside local ledgers.
        </div>
        <div class="sign-area">
          <div>
            <strong>Certified Checked Correct By:</strong>
            <div class="line">${officeName === "ALL" ? "Supplies Officer" : `${officeName} Head`}</div>
            <div class="subtext">Representative Department Head / Signatory</div>
          </div>
          <div>
            <strong>Reconciled & Reissued By:</strong>
            <div class="line">${userName}</div>
            <div class="subtext">Municipal Accountant, LGU Tibiao</div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 600);
          };
        </script>
      </body>
      </html>
    `;
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  // New, high-fidelity isolated document printing method for Carrying Ledger Statement
  const handlePrintLedger = () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow pop-ups to print the ledger statement.");
      return;
    }

    const rowsHtml = filteredItems.length === 0 
      ? `
        <tr>
          <td colspan="8" style="border: 0.5pt solid black; padding: 12px; text-align: center; color: #64748b; font-family: sans-serif; font-size: 10px; font-weight: bold; text-transform: uppercase;">
            No matching assets found under current filter constraints.
          </td>
        </tr>
      `
      : filteredItems.map((item) => {
          const calcs = getFinancialCalculations(item);
          return `
            <tr style="page-break-inside: avoid; break-inside: avoid;">
              <td style="border: 0.5pt solid black; padding: 6px 4px; font-family: monospace; font-size: 8.5pt;">
                ${item.assetCode || "N/A: Pending"}
              </td>
              <td style="border: 0.5pt solid black; padding: 6px 4px; font-size: 8.5pt; text-transform: uppercase; font-weight: bold;">
                ${item.article}
                <div style="font-size: 7.5pt; color: #64748b; font-family: sans-serif; font-weight: normal; margin-top: 2px;">
                  Prop: ${item.propertyNumber || "N/A"} &bull; ${item.office}
                </div>
              </td>
              <td style="border: 0.5pt solid black; padding: 6px 4px; font-size: 8.5pt; text-transform: uppercase;">
                ${item.fundingSource || "General Fund"}
              </td>
              <td style="border: 0.5pt solid black; padding: 6px 4px; font-size: 8.5pt; text-align: right;">
                ₱${calcs.cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td style="border: 0.5pt solid black; padding: 6px 4px; font-size: 8.5pt; text-align: center;">
                ${item.usefulLife || 5} yrs
              </td>
              <td style="border: 0.5pt solid black; padding: 6px 4px; font-size: 8.5pt; text-align: right;">
                ₱${calcs.salvageValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td style="border: 0.5pt solid black; padding: 6px 4px; font-size: 8.5pt; text-align: right; font-weight: bold; color: #b91c1c;">
                ₱${calcs.accumulatedDepreciation.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td style="border: 0.5pt solid black; padding: 6px 4px; font-size: 8.5pt; text-align: right; font-weight: bold; color: #0f172a;">
                ₱${calcs.carryingValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
            </tr>
          `;
        }).join("");

    const totalSalvage = filteredComputed.reduce((s, c) => s + c.salvageValue, 0);

    const reportScope = (officeFilter !== "ALL" || fundingFilter !== "ALL" || searchTerm)
      ? `
        <div style="display: inline-block; font-family: Arial, sans-serif; font-size: 8.5px; text-transform: uppercase; font-weight: bold; color: #4338ca; background-color: #e0e7ff; border: 1px solid #c7d2fe; padding: 4px 12px; border-radius: 4px; margin-top: 6px; letter-spacing: 0.05em;">
          REPORT SCOPE: ${officeFilter !== "ALL" ? `Office: [${officeFilter}]` : ""}
          ${fundingFilter !== "ALL" ? ` | Funding: [${fundingFilter}]` : ""}
          ${searchTerm ? ` | Keyword Query: "${searchTerm}"` : ""}
        </div>
      `
      : "";

    const totalsLabel = (officeFilter !== "ALL" || fundingFilter !== "ALL" || searchTerm)
      ? `FILTERED LEDGER SUBTOTALS (${filteredItems.length} ITEMS)`
      : "GRAND ACCREDITED LEDGER TOTALS";

    const printHTML = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>PPE Book Valuation & Depreciation Statement - LGU Tibiao</title>
        <style>
          @media print {
            @page {
              size: landscape;
              margin: 0.4in;
            }
            body {
              background: white;
              color: black;
            }
          }
          body {
            font-family: "Times New Roman", Times, serif;
            color: #0f172a;
            padding: 20px;
            max-width: 11in;
            margin: 0 auto;
          }
          .text-center { text-align: center; }
          .text-right { text-align: right; }
          .uppercase { text-transform: uppercase; }
          .font-bold { font-weight: bold; }
          .font-black { font-weight: 900; }
          
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 20px;
            table-layout: fixed;
          }
          th, td {
            border: 0.5pt solid black;
            padding: 6px 4px;
            word-wrap: break-word;
            vertical-align: middle;
          }
          th {
            background-color: #f1f5f9 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 8.5pt;
          }
          
          .signature-container {
            margin-top: 40px;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 50px;
            page-break-inside: avoid;
            break-inside: avoid;
          }
          .signature-block {
            text-align: center;
          }
          .signature-line {
            border-bottom: 1px solid black;
            padding-bottom: 2px;
            max-width: 250px;
            margin: 30px auto 4px auto;
            font-weight: bold;
            font-size: 10pt;
            text-transform: uppercase;
          }
          .signature-title {
            font-size: 8.5pt;
            color: #475569;
          }
        </style>
      </head>
      <body>
        <div class="text-center" style="margin-bottom: 20px;">
          <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;">
            <img src="/tibiaoLogo.jpg" style="width: 55px; height: 55px; object-fit: contain; margin-bottom: 4px;" />
            <div style="font-size: 8.5pt; font-weight: bold; letter-spacing: 0.05em; text-transform: uppercase;">
              Republic of the Philippines
            </div>
            <div style="font-size: 11pt; font-weight: 900; text-transform: uppercase; letter-spacing: 0.02em;">
              MUNICIPAL GOVERNMENT OF TIBIAO
            </div>
            <div style="font-size: 8.5pt; font-weight: bold; color: #475569; text-transform: uppercase;">
              Province of Antique
            </div>
            <div style="font-size: 12pt; font-weight: 900; text-transform: uppercase; margin-top: 10px; color: #010101; border-top: 1.5px solid black; padding-top: 8px;">
              OFFICIAL PPE BOOK VALUATION & DEPRECIATION STATEMENT
            </div>
            <div style="font-size: 8pt; color: #4b5563; font-style: italic; margin-top: 2px;">
              (UACS Straight-Line Method | 5% Salvage Value Rate Baseline)
            </div>
            <div style="font-size: 8.5pt; font-weight: bold; margin-top: 4px;">
              Printed Period: ${new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            ${reportScope}
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 12%;">Asset Code No.</th>
              <th style="width: 30%;">Property Description</th>
              <th style="width: 12%;">Funding Stream</th>
              <th style="width: 11%; text-align: right;">Cost (₱)</th>
              <th style="width: 7%; text-align: center;">Life (Yrs)</th>
              <th style="width: 11%; text-align: right;">Salvage Cost (₱)</th>
              <th style="width: 13%; text-align: right;">Accumulated Dep. (₱)</th>
              <th style="width: 14%; text-align: right;">Book Value (₱)</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
          <tfoot>
            <tr style="background-color: #f1f5f9; font-weight: bold; border-top: 1.5px solid black;">
              <td colspan="3" class="uppercase" style="text-align: right; font-size: 8.5pt; padding: 8px 4px;">
                ${totalsLabel}
              </td>
              <td style="text-align: right; font-size: 8.5pt; padding: 8px 4px;">
                ₱${filteredCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td style="border-right: 0.5pt solid black; border-left: 0.5pt solid black;"></td>
              <td style="text-align: right; font-size: 8.5pt; padding: 8px 4px;">
                ₱${totalSalvage.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td style="text-align: right; font-size: 8.5pt; padding: 8px 4px; color: #b91c1c;">
                ₱${filteredAccumulatedDep.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
              <td style="text-align: right; font-size: 8.5pt; padding: 8px 4px;">
                ₱${filteredCarryingValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </td>
            </tr>
          </tfoot>
        </table>

        <div class="signature-container">
          <div class="signature-block">
            <p style="font-weight: bold; color: #475569; text-transform: uppercase; text-align: left; font-size: 8.5pt; margin-bottom: 0;">
              Prepared & Certified Correct By:
            </p>
            <div class="signature-line">${userName || "CHIEF ACCOUNTANT"}</div>
            <div class="signature-title">Chief Accountant, LGU Tibiao</div>
          </div>
          <div class="signature-block">
            <p style="font-weight: bold; color: #475569; text-transform: uppercase; text-align: left; font-size: 8.5pt; margin-bottom: 0;">
              Approved Honorable Executive:
            </p>
            <div class="signature-line">${approvedExecutiveName || "GIL B. BANDOJA"}</div>
            <div class="signature-title">${approvedExecutiveTitle || "Municipal Mayor, Tibiao, Antique"}</div>
          </div>
        </div>

        <script>
          window.onload = function() {
            setTimeout(function() {
              window.focus();
              window.print();
            }, 600);
          };
        </script>
      </body>
      </html>
    `;

    printWindow.document.write(printHTML);
    printWindow.document.close();
  };

  // Inventory discrepancies check
  const discrepanciesList = items.filter(
    (item) => item.qtyPropertyCard !== item.qtyPhysicalCount,
  );

  // Reconciliation Remarks save action with robust tracking and feedback
  const saveReconciliationRemark = async (item: InventoryItem) => {
    // Falls back to existing remarks property if the specific input wasn't modified in this render
    const remarkText =
      reconciliationNotes[item.id] !== undefined
        ? reconciliationNotes[item.id]
        : item.remarks || "";
    if (!remarkText.trim()) {
      alert(
        "Please enter investigation remarks or verification notes before saving.",
      );
      return;
    }
    try {
      const docRef = doc(db, "inventory_items", item.id);
      await updateDoc(docRef, { remarks: remarkText });

      // Log action inside system logs
      await addDoc(collection(db, "system_logs"), {
        timestamp: new Date(),
        user: userName,
        action: `Inventory audit remark logged for LGU asset: ${item.article} (${item.propertyNumber})`,
        module: "Accounting Valuation Hub",
      });

      alert(`Reconciliation remarks logged successfully for ${item.article}!`);
    } catch (err) {
      console.error(err);
      alert("Failed to submit reconciliation remarks.");
    }
  };

  // Chart & Office Net Valuation computations
  const carryingValuePerDept = offices
    .map((off) => {
      const deptItems = items.filter((item) => item.office === off.name);
      const cost = deptItems.reduce((acc, current) => {
        const calcs = getFinancialCalculations(current);
        return acc + calcs.cost;
      }, 0);
      const accDep = deptItems.reduce((acc, current) => {
        const calcs = getFinancialCalculations(current);
        return acc + calcs.accumulatedDepreciation;
      }, 0);
      const carryValue = deptItems.reduce((acc, current) => {
        const calcs = getFinancialCalculations(current);
        return acc + calcs.carryingValue;
      }, 0);
      return {
        name: off.name.length > 18 ? off.name.substring(0, 18) + "..." : off.name,
        fullName: off.name,
        value: carryValue,
        cost,
        accDep,
        itemCount: deptItems.length,
      };
    })
    .filter((c) => c.value > 0 || c.itemCount > 0);

  const fundingCategories = Array.from(
    new Set(items.map((i) => i.fundingSource || "General Fund")),
  ).map((src) => {
    const matched = items.filter(
      (item) => (item.fundingSource || "General Fund") === src,
    );
    return {
      name: src,
      value: matched.reduce((acc, current) => {
        const calcs = getFinancialCalculations(current);
        return acc + calcs.carryingValue;
      }, 0),
    };
  });

  return (
    <div className="gov-app min-h-screen bg-slate-50 flex font-sans text-slate-800 relative">
      {/* Mobile Backdrop Overlay */}
      {isMobileSidebarOpen && (
        <div
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 md:hidden"
        />
      )}

      {/* Sidebar Navigation */}
      <aside 
        onMouseEnter={() => setIsSidebarHovered(true)}
        onMouseLeave={() => setIsSidebarHovered(false)}
        className={`bg-white border-r border-gray-200 z-50 transform transition-[width,transform] duration-300 ease-in-out flex flex-col no-print shrink-0 
          ${isMobileSidebarOpen ? 'fixed inset-y-0 left-0 w-72 shadow-2xl translate-x-0' : 'fixed -translate-x-full md:translate-x-0 md:relative'} 
          ${isSidebarHovered || isMobileSidebarOpen ? 'md:w-64' : 'md:w-20'} w-64 h-screen`}
      >
        <div className="p-5 border-b border-gray-100 flex items-center justify-between overflow-hidden h-22">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center">
              <img 
                src="/tibiaoLogo.jpg" 
                alt="Tibiao Seal" 
                className="w-10 h-10 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className={`flex flex-col flex-1 min-w-0 transition-opacity duration-300 ${isSidebarHovered || isMobileSidebarOpen ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden pointer-events-none'}`}>
              <span className="text-[9px] font-black text-gray-800 leading-tight uppercase tracking-tighter truncate block">
                Municipality of Tibiao
              </span>
              <span className="text-[7px] text-blue-600 font-black uppercase tracking-widest block mt-0.5">
                Accounting Desk
              </span>
            </div>
          </div>
          {isMobileSidebarOpen && (
            <button
              onClick={() => setIsMobileSidebarOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <XCircle className="w-5 h-5" />
            </button>
          )}
        </div>

        <nav className="flex-1 p-4 space-y-1.5 mt-4 overflow-y-auto custom-scrollbar overflow-x-hidden">
          <div className={`text-[9px] font-black text-slate-400 uppercase tracking-widest px-3 mb-2 transition-all duration-300 ${isSidebarHovered || isMobileSidebarOpen ? 'opacity-100 block' : 'opacity-0 h-0 overflow-hidden my-0 py-0'}`}>
            Accounting Hub
          </div>
          {([
            {
              id: "dashboard",
              label: "Executive Dashboard",
              icon: "M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z",
            },
            {
              id: "reconciliation",
              label: "Accounting Stock Cards Directory",
              icon: "M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z",
            },
            {
              id: "unified_reports",
              label: "PAR & ICS Documents",
              icon: "M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-3a2 2 0 00-2-2H9a2 2 0 00-2 2v3a2 2 0 002 2zm5-17h2m-6 0h-2",
            },
            {
              id: "ledger",
              label: "Financial Asset Valuation & Ledger",
              icon: "M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z",
            },
            {
              id: "admin_requests",
              label: "Submit Purchase Request",
              icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
            },
            {
              id: "outgoing_requests",
              label: "Outgoing Request Logs",
              icon: "M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4",
              count: actRequests.length,
            },
            {
              id: "procurement_history",
              label: "Procurement History",
              icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
            },
          ] as Array<{ id: string; label: string; icon: string; count?: number; warning?: boolean }>).map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as any);
                setIsMobileSidebarOpen(false);
              }}
              className={`w-full flex items-center transition-all duration-200 ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white shadow-xl shadow-slate-900/20 font-black"
                  : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 font-bold"
              } ${isSidebarHovered || isMobileSidebarOpen ? 'space-x-3 justify-between px-4 py-3 rounded-xl' : 'justify-center px-2 py-3 rounded-xl space-x-0'}`}
              title={!isSidebarHovered && !isMobileSidebarOpen ? tab.label : undefined}
            >
              <div className={`flex items-center ${isSidebarHovered || isMobileSidebarOpen ? 'space-x-3' : 'justify-center'}`}>
                <svg
                  className="w-4 h-4 flex-shrink-0 opacity-80"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d={tab.icon}
                  />
                </svg>
                <span className={`text-[10px] uppercase tracking-tight text-left leading-tight transition-all duration-300 ${isSidebarHovered || isMobileSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 pointer-events-none overflow-hidden'}`}>
                  {tab.label}
                </span>
              </div>
              {tab.count !== undefined && tab.count > 0 && (isSidebarHovered || isMobileSidebarOpen) && (
                <span
                  className={`text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                    tab.warning
                      ? "bg-amber-500 text-slate-950 animate-pulse"
                      : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-gray-100">
          <button
            onClick={onLogout}
            className={`w-full flex items-center rounded-xl text-red-500 hover:bg-red-50 transition-all group ${isSidebarHovered || isMobileSidebarOpen ? 'px-4 py-3 space-x-3 justify-start' : 'p-3 justify-center space-x-0'}`}
            title={!isSidebarHovered && !isMobileSidebarOpen ? "Sign Out Session" : undefined}
          >
            <svg
              className="w-4 h-4 text-red-500 group-hover:text-red-600 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            <span className={`font-black text-[9px] uppercase tracking-widest text-left transition-all duration-300 ${isSidebarHovered || isMobileSidebarOpen ? 'opacity-100 w-auto' : 'opacity-0 w-0 pointer-events-none overflow-hidden'}`}>
              Sign Out Session
            </span>
          </button>
        </div>
      </aside>

      {/* Main Panel Column */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Unified Top Header Bar */}
        <header className="bg-white border-b border-gray-100 py-4 px-6 md:px-8 flex flex-row items-center justify-between no-print shrink-0">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              className="md:hidden p-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition-colors"
              title="Toggle Navigation Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <span className="text-[8px] font-black text-slate-500 uppercase tracking-widest leading-none">
                Accounting & Financial Audit division
              </span>
              <h1 className="text-md font-brand font-black text-slate-900 tracking-tight mt-0.5 uppercase">
                Admin Asset Ledger Node
              </h1>
            </div>
          </div>
          <div className="flex items-center space-x-4">
            <NotificationBell user={user} setView={setView} onNotificationActionClick={onNotificationActionClick} />
            <div className="text-right hidden sm:block">
              <p className="text-[10px] font-bold text-gray-400 uppercase leading-none">
                Accountant Auditor Officer
              </p>
              <p className="text-xs font-black uppercase text-slate-800 mt-1">
                {userName}
              </p>
            </div>
            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs font-black text-slate-800">
              {userName.substring(0, 2).toUpperCase()}
            </div>
          </div>
        </header>

        {/* Scrollable Container Area */}
        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          <div className="max-w-7xl mx-auto space-y-8">
            {/* Executive Dashboard Tab Content */}
            {activeTab === "dashboard" && (
              <div className="space-y-8 animate-in duration-300">
                {/* Financial Highlights */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 no-print">
                  <div
                    onClick={() => setActiveTab("ledger")}
                    className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm hover:border-slate-400/50 hover:shadow-md cursor-pointer transition-all active:scale-[0.98] flex items-center justify-between gap-2 overflow-hidden group"
                  >
                    <div className="min-w-0 flex-1 pr-1">
                      <h3 className="text-gray-500 text-[9px] font-black uppercase tracking-widest group-hover:text-slate-900 transition-colors truncate">
                        AGGREGATE COST BASE
                      </h3>
                      <p 
                        className={`${getDynamicFontClass(aggregateCost)} font-black text-slate-900 font-brand mt-1 truncate`}
                        title={`₱${aggregateCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      >
                        ₱{aggregateCost.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-[8px] font-bold text-gray-400 uppercase mt-0.5 truncate">
                        Total Capital Base
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-slate-100 text-slate-800 rounded-2xl flex-shrink-0 flex items-center justify-center font-bold group-hover:bg-slate-900 group-hover:text-white transition-all">
                      ₱
                    </div>
                  </div>

                  <div
                    onClick={() => setActiveTab("unified_reports")}
                    className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm hover:border-red-400/50 hover:shadow-md cursor-pointer transition-all active:scale-[0.98] flex items-center justify-between gap-2 overflow-hidden group"
                  >
                    <div className="min-w-0 flex-1 pr-1">
                      <h3 className="text-gray-500 text-[9px] font-black uppercase tracking-widest group-hover:text-red-650 transition-colors truncate">
                        ACCUMULATED DEPRECIATION
                      </h3>
                      <p 
                        className={`${getDynamicFontClass(aggregateAccumulatedDep)} font-black text-red-650 font-brand mt-1 truncate`}
                        title={`₱${aggregateAccumulatedDep.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      >
                        ₱{aggregateAccumulatedDep.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-[8px] font-bold text-red-400 uppercase mt-0.5 truncate">
                        Straight-Line Expensed
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-red-50 text-red-650 rounded-2xl flex-shrink-0 flex items-center justify-center font-bold group-hover:bg-red-600 group-hover:text-white transition-all">
                      ↘
                    </div>
                  </div>

                  <div
                    onClick={() => setActiveTab("ledger")}
                    className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm hover:border-emerald-400/50 hover:shadow-md cursor-pointer transition-all active:scale-[0.98] flex items-center justify-between gap-2 overflow-hidden group"
                  >
                    <div className="min-w-0 flex-1 pr-1">
                      <h3 className="text-gray-500 text-[9px] font-black uppercase tracking-widest group-hover:text-emerald-750 transition-colors truncate">
                        CONSOLIDATED PPE CARRY VALUE
                      </h3>
                      <p 
                        className={`${getDynamicFontClass(aggregateCarryingValue)} font-black text-emerald-700 font-brand mt-1 truncate`}
                        title={`₱${aggregateCarryingValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      >
                        ₱{aggregateCarryingValue.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-[8px] font-bold text-emerald-600 uppercase mt-0.5 truncate">
                        Net Asset Book Value
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-700 rounded-2xl flex-shrink-0 flex items-center justify-center font-bold group-hover:bg-emerald-600 group-hover:text-white transition-all">
                      ₱
                    </div>
                  </div>

                  <div
                    onClick={() => setActiveTab("admin_requests")}
                    className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm hover:border-amber-400/50 hover:shadow-md cursor-pointer transition-all active:scale-[0.98] flex items-center justify-between gap-2 overflow-hidden group"
                  >
                    <div className="min-w-0 flex-1 pr-1">
                      <h3 className="text-gray-500 text-[9px] font-black uppercase tracking-widest group-hover:text-amber-600 transition-colors truncate">
                        PENDING DELIVERY
                      </h3>
                      <p 
                        className="text-lg sm:text-xl lg:text-2xl font-black text-amber-600 font-brand mt-1 truncate"
                        title={`${pendingDeliveryCount} items pending delivery / buying`}
                      >
                        {pendingDeliveryCount} {pendingDeliveryCount === 1 ? 'item' : 'items'}
                      </p>
                      <p className="text-[8px] font-bold text-amber-500 uppercase mt-0.5 truncate">
                        ₱{pendingDeliveryAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} In Procurement
                      </p>
                    </div>
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex-shrink-0 flex items-center justify-center font-bold group-hover:bg-amber-500 group-hover:text-white transition-all">
                      <Truck className="w-5 h-5" />
                    </div>
                  </div>
                </div>

                {/* Carrying Net Value per Office Department Section */}
                <div className="bg-white p-6 md:p-8 rounded-[36px] border border-gray-100 shadow-sm no-print space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-gray-100 pb-4">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
                        <h3 className="font-brand font-black text-slate-900 text-lg uppercase tracking-tight">
                          Carrying Net Value per Office Department
                        </h3>
                      </div>
                      <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                        Financial breakdown of net book values, cost base, and depreciation across all municipal offices
                      </p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <select
                        value={selectedDeptCarryingFilter}
                        onChange={(e) => setSelectedDeptCarryingFilter(e.target.value)}
                        className="bg-slate-50 border border-slate-200 focus:border-blue-500 font-bold text-xs py-2 px-3 rounded-xl outline-none shadow-sm cursor-pointer"
                      >
                        <option value="ALL">All Active Departments ({carryingValuePerDept.length})</option>
                        {carryingValuePerDept.map((dept) => (
                          <option key={dept.fullName} value={dept.fullName}>
                            {dept.fullName} ({dept.itemCount} {dept.itemCount === 1 ? 'record' : 'records'})
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => setActiveTab("ledger")}
                        className="text-[10px] font-black text-blue-600 hover:text-blue-700 uppercase tracking-widest flex items-center space-x-1"
                      >
                        <span>View Full Ledger</span>
                        <span>&rarr;</span>
                      </button>
                    </div>
                  </div>

                  {/* Department Net Value Breakdown Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2">
                    {carryingValuePerDept
                      .filter((dept) => selectedDeptCarryingFilter === "ALL" || dept.fullName === selectedDeptCarryingFilter)
                      .map((dept, idx) => (
                        <div 
                          key={dept.fullName || idx}
                          className="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100/80 border border-slate-200/80 transition-all space-y-3 cursor-pointer group"
                          onClick={() => {
                            setSelectedStockCardOffice(dept.fullName);
                            setActiveTab("reconciliation");
                          }}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="text-xs font-black text-slate-900 uppercase tracking-tight group-hover:text-blue-600 transition-colors">
                                {dept.fullName}
                              </h4>
                              <span className="text-[9px] text-gray-400 font-bold uppercase tracking-wider block mt-0.5">
                                {dept.itemCount} Registered Asset {dept.itemCount === 1 ? 'Record' : 'Records'}
                              </span>
                            </div>
                            <span className="text-[9px] font-black bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md uppercase tracking-wider">
                              Office
                            </span>
                          </div>

                          <div className="pt-2 border-t border-slate-200/60 grid grid-cols-2 gap-2">
                            <div>
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Net Carrying Value</span>
                              <span className="text-xs font-black text-emerald-600 font-brand block mt-0.5">
                                ₱{dept.value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                            <div className="text-right">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block">Cost Base</span>
                              <span className="text-xs font-black text-slate-800 font-brand block mt-0.5">
                                ₱{dept.cost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[9px] text-slate-500 font-bold uppercase pt-1">
                            <span>Acc. Dep: ₱{dept.accDep.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className="text-blue-600 font-black group-hover:underline">Stock Cards &rarr;</span>
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            )}

            {/* Active Tab rendering */}
            {activeTab === "ledger" ? (
              <div className="space-y-8 animate-in duration-300">
                {/* General PPE details table */}
                <div className="bg-white p-8 rounded-[36px] border border-gray-100 shadow-sm space-y-6">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-2">
                    <div>
                      <h3 className="font-brand font-black text-slate-900 text-lg uppercase tracking-tight">
                        Municipal Asset Valuation Register
                      </h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                        PPE ledger and financial adjustment center using straight-line calculations (READ-ONLY)
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 md:justify-end">
                      <button
                        onClick={exportToExcel}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-[10px] uppercase tracking-widest px-4 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span>Export Excel</span>
                      </button>
                      <button
                        onClick={handlePrintLedger}
                        className="bg-slate-900 hover:bg-slate-850 text-white font-black text-[10px] uppercase tracking-widest px-4 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-md transition-all active:scale-95 cursor-pointer"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-3a2 2 0 00-2-2H9a2 2 0 00-2 2v3a2 2 0 002 2zm5-17h2m-6 0h-2" />
                        </svg>
                        <span>Print Ledger / Save PDF</span>
                      </button>
                      <div className="bg-slate-50 px-4 py-2 rounded-xl border border-slate-100 text-right">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">
                          Active Scope
                        </span>
                        <p className="text-[11px] font-black text-indigo-600 uppercase mt-0.5">
                          {filteredItems.length} of {items.length} assets
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Search & Filter Controls Panel */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block ml-1">
                        Search Items
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Search description, code, property #..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 py-2.5 pl-9 pr-4 rounded-xl text-xs font-bold outline-none shadow-sm transition-all"
                        />
                        <svg
                          className="w-4 h-4 text-gray-400 absolute left-3 top-3.5"
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
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block ml-1">
                        Office / Department
                      </label>
                      <select
                        value={officeFilter}
                        onChange={(e) => setOfficeFilter(e.target.value)}
                        className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 py-2.5 px-3 rounded-xl text-xs font-bold outline-none shadow-sm transition-all"
                      >
                        <option value="ALL">Show All Offices</option>
                        {Array.from(
                          new Set(items.map((i) => i.office).filter(Boolean)),
                        ).map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block ml-1">
                        Funding Allocation Track
                      </label>
                      <select
                        value={fundingFilter}
                        onChange={(e) => setFundingFilter(e.target.value)}
                        className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 py-2.5 px-3 rounded-xl text-xs font-bold outline-none shadow-sm transition-all"
                      >
                        <option value="ALL">Show All Funding Streams</option>
                        {Array.from(
                          new Set(
                            items
                              .map((i) => i.fundingSource || "General Fund")
                              .filter(Boolean),
                          ),
                        ).map((f) => (
                          <option key={f} value={f}>
                            {f}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {filteredItems.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 font-bold text-xs uppercase border border-dashed border-gray-200 rounded-3xl">
                      No matching assets found under current filter constraints.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-gray-100 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                            <th className="py-4">Asset Code / No.</th>
                            <th className="py-4">Article description</th>
                            <th className="py-4">Office Dept</th>
                            <th className="py-4 text-right">Cost Cost</th>
                            <th className="py-4 text-center">Life (Yrs)</th>
                            <th className="py-4 text-right">
                              Salvage Value (5%)
                            </th>
                            <th className="py-4 text-right">
                              Accumulated Dep.
                            </th>
                            <th className="py-4 text-right">Book Value</th>
                            <th className="py-4">Funding Source</th>
                            <th className="py-4 text-center">Classification</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredItems.map((item) => {
                            const calcs = getFinancialCalculations(item);
                            return (
                              <tr
                                key={item.id}
                                className="border-b border-slate-50 hover:bg-slate-50/50 text-xs transition-all"
                              >
                                <td className="py-4 font-mono font-bold text-indigo-600">
                                  {item.assetCode || "N/A: Not Assigned"}
                                </td>
                                <td className="py-4">
                                  <span className="font-black text-slate-900 uppercase block">
                                    {item.article}
                                  </span>
                                  <span className="text-[9px] text-gray-400 font-bold block mt-0.5">
                                    Property No: {item.propertyNumber} &bull;
                                    Acq:{" "}
                                    {item.acquisitionDate || item.yearPurchased}
                                  </span>
                                </td>
                                <td className="py-4 font-bold text-slate-600 uppercase">
                                  {item.office}
                                </td>
                                <td className="py-4 text-right font-black text-slate-800">
                                  ₱
                                  {calcs.cost.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="py-4 text-center font-bold text-slate-700">
                                  {item.usefulLife || 5} yrs
                                </td>
                                <td className="py-4 text-right text-gray-500">
                                  ₱
                                  {calcs.salvageValue.toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    },
                                  )}
                                </td>
                                <td className="py-4 text-right font-bold text-red-600">
                                  ₱
                                  {calcs.accumulatedDepreciation.toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    },
                                  )}
                                </td>
                                <td className="py-4 text-right font-black text-emerald-700">
                                  ₱
                                  {calcs.carryingValue.toLocaleString(
                                    undefined,
                                    {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    },
                                  )}
                                </td>
                                <td className="py-4">
                                  <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded text-[9px] font-black uppercase">
                                    {item.fundingSource || "General Fund"}
                                  </span>
                                </td>
                                <td className="py-4 text-center">
                                  <span className={`px-2 py-1 rounded-full text-[9px] font-black uppercase border ${
                                    (item.unitValue >= 15000)
                                      ? "bg-indigo-50 text-indigo-700 border-indigo-150 font-bold"
                                      : "bg-emerald-50 text-emerald-850 border-emerald-150 font-bold"
                                  }`}>
                                    {item.unitValue >= 15000 ? "PAR (Asset)" : "ICS (Semi-Exp)"}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* Enhanced sub-total row for search/filter results */}
                  {filteredItems.length !== items.length && (
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100 font-mono text-[10.5px] text-slate-700 gap-2">
                      <div className="font-bold flex items-center space-x-2">
                        <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse"></span>
                        <span className="uppercase tracking-tight text-slate-900">
                          FILTERED REGISTER SUB-TOTALS ({filteredItems.length}{" "}
                          items)
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-6 gap-y-1 justify-end font-semibold text-right">
                        <span>
                          Aggregate Cost:{" "}
                          <strong className="text-slate-950 font-black">
                            ₱
                            {filteredCost.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </strong>
                        </span>
                        <span>
                          Depreciation:{" "}
                          <strong className="text-red-700 font-black">
                            ₱
                            {filteredAccumulatedDep.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </strong>
                        </span>
                        <span>
                          Carrying Value:{" "}
                          <strong className="text-emerald-700 font-black text-[11px]">
                            ₱
                            {filteredCarryingValue.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </strong>
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Adjustments calibration overlay modal */}
                {editingItem && (
                  <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[110] flex items-center justify-center p-6 animate-in zoom-in duration-200">
                    <div className="bg-white rounded-[40px] w-full max-w-xl shadow-2xl overflow-hidden border border-indigo-50">
                      <div className="p-8 border-b border-gray-50 bg-slate-900 text-white flex items-center justify-between">
                        <div>
                          <span className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block">
                            PPE FINANCIAL CALIBRATION
                          </span>
                          <h3 className="font-brand font-black text-xl uppercase tracking-tight mt-1">
                            Calibrate Carrying Value
                          </h3>
                        </div>
                        <button
                          onClick={() => setEditingItem(null)}
                          className="p-2.5 bg-white/10 rounded-xl hover:scale-110 transition-all text-white hover:bg-white/20"
                        >
                          <svg
                            className="w-5 h-5"
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

                      <div className="p-8 space-y-6">
                        <p className="text-gray-500 text-xs font-semibold uppercase leading-relaxed border-b border-gray-100 pb-3">
                          Configure asset accounting factors for{" "}
                          <span className="text-slate-900 font-black">
                            {editingItem.article}
                          </span>{" "}
                          ({editingItem.propertyNumber})
                        </p>

                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block ml-1">
                              Carrying Asset Code
                            </label>
                            <input
                              placeholder="e.g., LGU-PPE-01827"
                              value={formAssetCode}
                              onChange={(e) => setFormAssetCode(e.target.value)}
                              className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 py-3 px-4 rounded-xl text-xs font-bold outline-none"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block ml-1">
                              Useful Life (Years)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={30}
                              value={formUsefulLife}
                              onChange={(e) =>
                                setFormUsefulLife(parseInt(e.target.value) || 5)
                              }
                              className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 py-3 px-4 rounded-xl text-xs font-bold outline-none"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block ml-1">
                              Acquisition Cost (Total ₱)
                            </label>
                            <input
                              type="number"
                              value={formAcquisitionCost}
                              onChange={(e) =>
                                setFormAcquisitionCost(
                                  parseFloat(e.target.value) || 0,
                                )
                              }
                              className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 py-3 px-4 rounded-xl text-xs font-bold outline-none"
                            />
                          </div>

                          <div className="space-y-2">
                            <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block ml-1">
                              Acquisition Date
                            </label>
                            <input
                              type="date"
                              value={formAcquisitionDate}
                              onChange={(e) =>
                                setFormAcquisitionDate(e.target.value)
                              }
                              className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 py-3 px-4 rounded-xl text-xs font-bold outline-none"
                            />
                          </div>
                        </div>

                        <div className="space-y-2">
                          <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block ml-1">
                            Funding Program/Allocation Track
                          </label>
                          <select
                            value={formFundingSource}
                            onChange={(e) =>
                              setFormFundingSource(e.target.value)
                            }
                            className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 py-3 px-4 rounded-xl text-xs font-bold outline-none"
                          >
                            <option value="General Fund">
                              General Fund (LGU Budget)
                            </option>
                            <option value="Special Education Fund">
                              Special Education Fund (SEF)
                            </option>
                            <option value="MDRRM Emergency Fund">
                              MDRRM Disaster Relief Fund
                            </option>
                            <option value="Municipal Engineering Capital Outlay">
                              Capital Outlay (MECO)
                            </option>
                            <option value="Agriculture Sector Program Grants">
                              Agriculture Support Grants
                            </option>
                            <option value="Trust Funds">
                              Private Sector Donor Trust Fund
                            </option>
                          </select>
                        </div>

                        {/* Calculated Live values inside form */}
                        <div className="bg-slate-50 p-4 rounded-2xl border border-gray-100 text-xs flex justify-between items-baseline font-mono text-gray-500">
                          <span>Expected Carrying Value (Book Net):</span>
                          <span className="font-bold text-slate-900 text-sm">
                            ₱
                            {Math.max(
                              formAcquisitionCost * 0.05,
                              formAcquisitionCost -
                                ((formAcquisitionCost -
                                  formAcquisitionCost * 0.05) /
                                  formUsefulLife) *
                                  Math.max(
                                    0,
                                    new Date().getFullYear() -
                                      new Date(
                                        formAcquisitionDate,
                                      ).getFullYear(),
                                  ),
                            ).toLocaleString(undefined, {
                              maximumFractionDigits: 1,
                            })}
                          </span>
                        </div>
                      </div>

                      <div className="p-8 bg-slate-50 border-t border-gray-100 flex items-center justify-end space-x-3">
                        <button
                          onClick={() => setEditingItem(null)}
                          className="px-6 py-4 rounded-2xl text-[10px] font-black bg-gray-200 text-gray-800 uppercase tracking-widest"
                        >
                          Dismiss
                        </button>
                        <button
                          onClick={saveAccountingDetails}
                          disabled={!!processingId}
                          className="px-8 py-4 rounded-2xl text-[10px] font-black bg-indigo-600 hover:bg-indigo-700 text-white uppercase tracking-widest shadow-xl transition-all"
                        >
                          {processingId
                            ? "Calibrating..."
                            : "Log Financial Adjustment"}
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : activeTab === "reconciliation" ? (
              <div className="space-y-8 animate-in text-slate-800">
                {selectedStockCardOffice === "" ? (
                  // Level 1: List of Offices (Stock Cards directory)
                  <div className="space-y-8 animate-in duration-200">
                    <div className="bg-slate-900 text-white p-8 rounded-[36px] border border-slate-850 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
                      <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-12 -translate-y-12">
                        <svg className="w-96 h-96 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z" />
                        </svg>
                      </div>
                      <div className="z-10 bg-transparent flex-1">
                        <span className="text-[8px] font-black uppercase text-blue-400 tracking-widest block font-brand">LGU Tibiao Municipal Hall Directory</span>
                        <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight mt-1 font-brand">Accounting Stock Cards</h2>
                        <p className="text-xs text-slate-300 font-medium max-w-xl mt-1 leading-relaxed">
                          The Accounting Stock Card page serves as an Office Directory. Select an office below to inspect, generate, and forward official Property Acknowledgement Receipts (PAR) and Inventory Custodian Slips (ICS).
                        </p>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden p-6">
                      <div className="mb-6 border-b border-gray-50 pb-4">
                        <h2 className="text-lg font-bold text-gray-800 uppercase tracking-tight font-brand">List of All Offices</h2>
                        <p className="text-xs text-gray-500">Departments under LGU Tibiao Municipal Hall.</p>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {offices.map((office) => (
                          <div
                            key={office.id}
                            onClick={() => {
                              setSelectedStockCardOffice(office.name);
                              setSelectedDocumentType(null);
                            }}
                            className="bg-gray-50 p-6 rounded-2xl border border-gray-100 hover:border-blue-500 transition-all group relative overflow-hidden flex flex-col cursor-pointer hover:shadow-md hover:bg-slate-50/50"
                          >
                            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center text-blue-600 shadow-sm mb-4">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                              </svg>
                            </div>
                            <h3 className="font-bold text-gray-800 uppercase tracking-tight font-brand">{office.name}</h3>
                            <p className="text-xs text-gray-400 font-mono mt-1 uppercase tracking-wider">Office Code: {office.code}</p>
                            
                            <div className="mt-4 pt-4 border-t border-gray-100 flex items-center justify-between">
                              <span className="text-[9px] font-bold uppercase text-blue-600 tracking-wider font-brand">View Office Directory Ledger</span>
                              <svg className="w-4 h-4 text-blue-600 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                              </svg>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : selectedDocumentType === null ? (
                  // Level 2: Office Sub-view (Only 2 Cards: PAR, ICS)
                  <div className="space-y-8 animate-in duration-200">
                    <div className="flex items-center justify-between no-print">
                      <button
                        onClick={() => setSelectedStockCardOffice("")}
                        className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center space-x-2 shadow-sm cursor-pointer"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                        </svg>
                        <span>Back to Offices List</span>
                      </button>
                      <div className="text-right">
                        <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Active Department</span>
                        <p className="text-xs font-black text-blue-600 uppercase mt-0.5">{selectedStockCardOffice}</p>
                      </div>
                    </div>

                    <div className="bg-slate-900 text-white p-8 rounded-[36px] border border-slate-850 shadow-xl relative overflow-hidden">
                      <span className="text-[8px] font-black uppercase text-blue-400 tracking-widest block">Department Workspace</span>
                      <h2 className="text-xl md:text-2xl font-black text-white uppercase tracking-tight mt-1 font-brand">{selectedStockCardOffice}</h2>
                      <p className="text-xs text-slate-300 font-medium max-w-xl mt-1 leading-relaxed">
                        Generate official Property Acknowledgement Receipts (PAR) or Inventory Custodian Slips (ICS) for {selectedStockCardOffice}. Choose a document type below.
                      </p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      {/* PAR Card */}
                      <div className="bg-white p-8 rounded-[36px] border border-slate-100 shadow-sm flex flex-col justify-between space-y-6 group relative overflow-hidden">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                              </svg>
                            </div>
                            <span className="bg-blue-50 border border-blue-150 text-blue-700 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">
                              PAR Document
                            </span>
                          </div>
                          <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight font-brand">Property Acknowledgement Receipt (PAR)</h3>
                          <p className="text-xs text-slate-500 font-medium leading-relaxed">
                            Form for high-value equipment and assets valued at ₱50,000 or greater. Generate, inspect, and send compiled PAR forms to the Administrator.
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedDocumentType("PAR")}
                          className="w-full bg-slate-900 hover:bg-blue-600 text-white font-black text-[10px] uppercase tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
                        >
                          Open PAR Workspace
                        </button>
                      </div>

                      {/* ICS Card */}
                      <div className="bg-white p-8 rounded-[36px] border border-slate-100 shadow-sm flex flex-col justify-between space-y-6 group relative overflow-hidden">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                              </svg>
                            </div>
                            <span className="bg-emerald-50 border border-emerald-150 text-emerald-700 px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest">
                              ICS Document
                            </span>
                          </div>
                          <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight font-brand">Inventory Custodian Slip (ICS)</h3>
                          <p className="text-xs text-slate-500 font-medium leading-relaxed">
                            Form for semi-expendable assets and supplies valued under ₱50,000. Generate, inspect, and send compiled ICS forms to the Administrator.
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedDocumentType("ICS")}
                          className="w-full bg-slate-900 hover:bg-emerald-600 text-white font-black text-[10px] uppercase tracking-widest py-4 rounded-2xl transition-all shadow-md active:scale-[0.98] cursor-pointer"
                        >
                          Open ICS Workspace
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  // Level 3: Form Viewer / Compiler
                  (() => {
                    const isPAR = selectedDocumentType === "PAR";
                    const reportTitle = isPAR ? "PROPERTY ACKNOWLEDGEMENT RECEIPT" : "INVENTORY CUSTODIAN SLIP";
                    const reportSubtitle = isPAR ? "Annex B" : "Appendix 59";
                    
                    const officeItems = items.filter(item => 
                      item.office && item.office.toLowerCase().trim() === selectedStockCardOffice.toLowerCase().trim()
                    );
                    const matchedItems = officeItems.filter(item => {
                      const val = item.acquisitionCost || item.unitValue || 0;
                      return isPAR ? val >= 50000 : val < 50000;
                    });
                    const totalValue = matchedItems.reduce((acc, item) => acc + (item.acquisitionCost || item.unitValue || 0) * (item.qtyPhysicalCount || 1), 0);

                    return (
                      <div className="space-y-6 animate-in duration-200">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print border-b border-gray-100 pb-4">
                          <button
                            onClick={() => setSelectedDocumentType(null)}
                            className="px-5 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/80 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 flex items-center space-x-2 shadow-sm self-start cursor-pointer"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 19l-7-7 7-7" />
                            </svg>
                            <span>Back to {selectedStockCardOffice} Forms</span>
                          </button>

                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => window.print()}
                              className="px-5 py-2.5 bg-white text-slate-700 hover:bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-sm cursor-pointer"
                            >
                              <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-3a2 2 0 00-2-2H9a2 2 0 00-2 2v3a2 2 0 002 2zm5-17h2m-6 0h-2" />
                              </svg>
                              Print Form
                            </button>

                            <button
                              onClick={handleSendFormToAdmin}
                              disabled={isFormSending || matchedItems.length === 0}
                              className={`px-6 py-2.5 ${isPAR ? "bg-blue-600 hover:bg-blue-700" : "bg-emerald-600 hover:bg-emerald-700"} text-white rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 shadow-md cursor-pointer disabled:opacity-50`}
                            >
                              {isFormSending ? (
                                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                              ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                              )}
                              Send to Engineer/Admin
                            </button>
                          </div>
                        </div>

                        <div className="bg-white p-8 md:p-12 rounded-[36px] border border-gray-100 shadow-sm print:p-0 print:border-none print:shadow-none print:bg-transparent">
                          <div className="space-y-6 font-serif select-text">
                            <div className="text-right italic font-black text-[12pt] text-gray-400">{reportSubtitle}</div>
                            
                            <div className="text-center font-bold text-[9pt] uppercase text-gray-400 tracking-wider">
                              REPUBLIC OF THE PHILIPPINES, PROVINCE OF ANTIQUE
                            </div>
                            <div className="text-center mb-8">
                              <div className="text-[12pt] font-black text-slate-850 uppercase">MUNICIPALITY OF TIBIAO</div>
                              <h1 className="font-extrabold text-[20pt] leading-none mb-1 text-black tracking-tight uppercase mt-1">{reportTitle}</h1>
                              <div className="text-[9.5pt] text-gray-500 italic mt-1 uppercase tracking-widest">{selectedStockCardOffice} DEPARTMENT</div>
                            </div>

                            {/* Dynamic Interactive Inputs (GSO compliant) */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-2 border-dashed border-gray-200 p-6 rounded-2xl bg-slate-50/50 mb-6 text-sm no-print">
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Entity Name:</label>
                                <input
                                  type="text"
                                  value={`LGU TIBIAO - ${selectedStockCardOffice}`}
                                  disabled
                                  className="w-full bg-white border border-slate-200 p-2 rounded-xl text-xs font-bold outline-none cursor-not-allowed text-gray-400"
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">Fund Cluster:</label>
                                <input
                                  type="text"
                                  value={formFundCluster}
                                  onChange={(e) => setFormFundCluster(e.target.value)}
                                  className={`w-full bg-white border border-slate-200 ${isPAR ? 'focus:border-blue-500' : 'focus:border-emerald-500'} p-2 rounded-xl text-xs font-bold outline-none`}
                                />
                              </div>
                              <div className="space-y-1">
                                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block">{isPAR ? 'PAR Number' : 'ICS Number'}:</label>
                                <input
                                  type="text"
                                  value={formDocNo}
                                  onChange={(e) => setFormDocNo(e.target.value)}
                                  className={`w-full bg-white border border-slate-200 ${isPAR ? 'focus:border-blue-500' : 'focus:border-emerald-500'} p-2 rounded-xl text-xs font-bold outline-none`}
                                />
                              </div>
                            </div>

                            {/* Print Block */}
                            <div className="hidden print:grid grid-cols-3 gap-6 border border-black p-4 text-[9.5pt] mb-6">
                              <div><span className="font-bold">Entity Name:</span> LGU TIBIAO - {selectedStockCardOffice}</div>
                              <div><span className="font-bold">Fund Cluster:</span> {formFundCluster}</div>
                              <div><span className="font-bold">{isPAR ? 'PAR No:' : 'ICS No:'}</span> {formDocNo}</div>
                            </div>

                            {/* COA Standard Table */}
                            <div className="overflow-x-auto">
                              <table className="w-full border-collapse border-2 border-black text-[9.5pt] font-serif">
                                <thead>
                                  <tr className="font-bold uppercase text-center bg-gray-100 text-[8pt]">
                                    <th className="border-2 border-black p-2.5 w-[8%]" rowSpan={isPAR ? 1 : 2}>Qty</th>
                                    <th className="border-2 border-black p-2.5 w-[10%]" rowSpan={isPAR ? 1 : 2}>Unit</th>
                                    {!isPAR && <th className="border-2 border-black p-2.5 w-[24%]" colSpan={2}>Amount</th>}
                                    <th className="border-2 border-black p-2.5 w-[42%]" rowSpan={isPAR ? 1 : 2}>Description (Article & Specs)</th>
                                    <th className="border-2 border-black p-2.5 w-[18%]" rowSpan={isPAR ? 1 : 2}>Property/Inventory No</th>
                                    {isPAR ? (
                                      <th className="border-2 border-black p-2.5 w-[12%]">Acquisition Date</th>
                                    ) : (
                                      <th className="border-2 border-black p-2.5 w-[10%]" rowSpan={2}>Useful Life</th>
                                    )}
                                    {isPAR && <th className="border-2 border-black p-2.5 w-[12%]">Acquisition Cost</th>}
                                  </tr>
                                  {!isPAR && (
                                    <tr className="font-bold uppercase text-center bg-gray-100 text-[8pt]">
                                      <th className="border-2 border-black p-2 bg-gray-100">Unit Cost</th>
                                      <th className="border-2 border-black p-2 bg-gray-100">Total</th>
                                    </tr>
                                  )}
                                </thead>
                                <tbody>
                                  {matchedItems.length === 0 ? (
                                    <tr>
                                      <td className="border-2 border-black p-10 text-center text-gray-400 font-bold" colSpan={isPAR ? 6 : 7}>
                                        No assets match the criteria for this office.
                                      </td>
                                    </tr>
                                  ) : (
                                    matchedItems.map((item, idx) => {
                                      const qty = item.qtyPhysicalCount || 1;
                                      const cost = item.acquisitionCost || item.unitValue || 0;
                                      return (
                                        <tr key={item.id || idx} style={{ height: '32px' }}>
                                          <td className="border border-black p-2.5 text-center font-mono font-bold text-[8.5pt]">{qty}</td>
                                          <td className="border border-black p-2.5 text-center uppercase font-mono text-[8pt]">{item.unitOfMeasure || "unit"}</td>
                                          {!isPAR && (
                                            <>
                                              <td className="border border-black p-2.5 text-right font-mono">₱{cost.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                              <td className="border border-black p-2.5 text-right font-mono font-bold bg-neutral-50/50">₱{(qty * cost).toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                                            </>
                                          )}
                                          <td className="border border-black p-2.5">
                                            <span className="font-bold text-gray-900 block uppercase leading-tight">{item.article}</span>
                                            <span className="text-[8.5pt] text-gray-500 mt-1 block leading-normal whitespace-pre-wrap">
                                              {item.description}
                                              {item.serialNumber ? ` | S/N: ${item.serialNumber}` : ""}
                                              {item.modelNumber ? ` | Model: ${item.modelNumber}` : ""}
                                            </span>
                                          </td>
                                          <td className="border border-black p-2.5 text-center font-mono text-[8pt]">{item.propertyNumber || "Pending"}</td>
                                          <td className="border border-black p-2.5 text-center font-mono text-[8.5pt]">
                                            {isPAR ? (item.dateReceived || item.acquisitionDate || "TBD") : `${item.usefulLife || 5} yrs`}
                                          </td>
                                          {isPAR && (
                                            <td className="border border-black p-2.5 text-right font-mono font-extrabold text-blue-900">
                                              ₱{cost.toLocaleString(undefined, {minimumFractionDigits: 2})}
                                            </td>
                                          )}
                                        </tr>
                                      );
                                    })
                                  )}
                                </tbody>
                              </table>
                            </div>

                            {/* Signatures and Sign-offs */}
                            <div className="grid grid-cols-2 gap-12 mt-16 pt-8 border-t border-dashed border-gray-200">
                              <div className="space-y-6">
                                <span className="text-[8.5pt] font-black text-gray-400 uppercase tracking-widest block">Received By:</span>
                                <div className="space-y-4">
                                  <div className="border-b border-black pb-1.5 max-w-xs text-center no-print">
                                    <input
                                      type="text"
                                      placeholder="Enter recipient's name"
                                      value={formReceivedBy}
                                      onChange={(e) => setFormReceivedBy(e.target.value)}
                                      className="w-full bg-slate-50 border border-slate-100 p-2 rounded-xl text-xs font-bold text-center outline-none"
                                    />
                                  </div>
                                  <div className="hidden print:block border-b-2 border-black pb-1.5 max-w-xs text-center">
                                    <span className="font-extrabold uppercase text-[12px] block">
                                      {formReceivedBy || matchedItems[0]?.personAccountable || "TBD"}
                                    </span>
                                  </div>
                                  <span className="text-[8.5pt] text-gray-500 block">Signature over Printed Name</span>
                                  <span className="text-[8.5pt] text-gray-500 font-bold block uppercase tracking-wider">Accountable Officer / Representative</span>
                                  <div className="pt-4 text-xs"><span className="font-bold">Date:</span> <span className="font-mono">{formDateIssued}</span></div>
                                </div>
                              </div>

                              <div className="space-y-6">
                                <span className="text-[8.5pt] font-black text-gray-400 uppercase tracking-widest block">{isPAR ? 'Approved By:' : 'Issued By:'}</span>
                                <div className="space-y-4">
                                  <div className="border-b border-black pb-1.5 max-w-xs text-center no-print">
                                    <input
                                      type="text"
                                      placeholder={isPAR ? "Enter approver's name" : "Enter issuer's name"}
                                      value={isPAR ? formApprovedBy : formIssuedBy}
                                      onChange={(e) => isPAR ? setFormApprovedBy(e.target.value) : setFormIssuedBy(e.target.value)}
                                      className="w-full bg-slate-50 border border-slate-100 p-2 rounded-xl text-xs font-bold text-center outline-none"
                                    />
                                  </div>
                                  <div className="hidden print:block border-b-2 border-black pb-1.5 max-w-xs text-center">
                                    <span className="font-extrabold uppercase text-[12px] block">
                                      {isPAR ? formApprovedBy : formIssuedBy}
                                    </span>
                                  </div>
                                  <span className="text-[8.5pt] text-gray-500 block">Signature over Printed Name</span>
                                  <span className="text-[8.5pt] text-gray-500 font-bold block uppercase tracking-wider">GSO Head / Admin Representative</span>
                                  <div className="pt-4 text-xs"><span className="font-bold">Date:</span> <span className="font-mono">{formDateIssued}</span></div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()
                )}
              </div>
            ) : activeTab === "reports" ? (
              /* Report and statement preview Tab */
              <div className="bg-white p-8 rounded-[36px] shadow-sm border border-slate-100 space-y-8 animate-in relative print:p-0 print:border-none print:shadow-none print:bg-transparent">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-6 no-print">
                  <div>
                    <h3 className="font-brand font-black text-slate-900 text-lg uppercase tracking-tight">
                      Carrying Ledger Statement
                    </h3>
                    <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">
                      Export a COA-compliant ledger displaying detailed Straight
                      Line Depreciation
                    </p>
                  </div>
                  <button
                    onClick={handlePrintLedger}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-black text-[10px] uppercase tracking-widest px-6 py-3.5 rounded-2xl flex items-center space-x-2 shadow-lg"
                  >
                    <svg
                      className="w-4 h-4 text-slate-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-3a2 2 0 00-2-2H9a2 2 0 00-2 2v3a2 2 0 002 2zm5-17h2m-6 0h-2"
                      />
                    </svg>
                    <span>Print Ledger Statement</span>
                  </button>
                </div>

                {/* Search & Filter Controls Panel (Duplicated for high efficiency in Reports Tab too) */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-100 no-print">
                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block ml-1">
                      Search Items to Print
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Search description, code, property #..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 py-2.5 pl-9 pr-4 rounded-xl text-xs font-bold outline-none shadow-sm transition-all"
                      />
                      <svg
                        className="w-4 h-4 text-gray-400 absolute left-3 top-3.5"
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
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block ml-1">
                      Filter by Office Dept
                    </label>
                    <select
                      value={officeFilter}
                      onChange={(e) => setOfficeFilter(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 py-2.5 px-3 rounded-xl text-xs font-bold outline-none shadow-sm transition-all"
                    >
                      <option value="ALL">Show All Offices</option>
                      {Array.from(
                        new Set(items.map((i) => i.office).filter(Boolean)),
                      ).map((o) => (
                        <option key={o} value={o}>
                          {o}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[9px] font-black text-gray-500 uppercase tracking-widest block ml-1">
                      Filter by Funding Stream
                    </label>
                    <select
                      value={fundingFilter}
                      onChange={(e) => setFundingFilter(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500/50 py-2.5 px-3 rounded-xl text-xs font-bold outline-none shadow-sm transition-all"
                    >
                      <option value="ALL">Show All Funding Streams</option>
                      {Array.from(
                        new Set(
                          items
                            .map((i) => i.fundingSource || "General Fund")
                            .filter(Boolean),
                        ),
                      ).map((f) => (
                        <option key={f} value={f}>
                          {f}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Print paper layout preview */}
                <div id="report-canvas" className="p-12 bg-white border border-gray-200 rounded-[28px] max-w-5xl mx-auto shadow-inner space-y-8 print:p-0 print:border-none print:shadow-none font-serif text-slate-950">
                  <div className="text-center space-y-1 flex flex-col items-center">
                    <img 
                      src="/tibiaoLogo.jpg" 
                      alt="Tibiao Seal" 
                      className="w-14 h-14 object-contain mb-3"
                      referrerPolicy="no-referrer"
                    />
                    <p className="text-[9px] font-bold uppercase tracking-widest">
                      Republic of the Philippines
                    </p>
                    <p className="text-xs font-black uppercase">
                      MUNICIPAL GOVERNMENT OF TIBIAO
                    </p>
                    <p className="text-[9px] font-bold uppercase text-slate-500">
                      Province of Antique
                    </p>
                    <h4 className="text-base font-black uppercase tracking-tight text-slate-900 pt-3">
                      OFFICIAL PPE BOOK VALUATION & DEPRECIATION STATEMENT
                    </h4>
                    <p className="text-[9px] text-gray-400">
                      (UACS Straight-Line Method | 5% Salvage Value Rate
                      Baseline)
                    </p>
                    <p className="text-[9px] text-slate-500 font-bold">
                      Printed Period: {new Date().toLocaleDateString()}
                    </p>
                    {(officeFilter !== "ALL" ||
                      fundingFilter !== "ALL" ||
                      searchTerm) && (
                      <div className="text-[8.5px] uppercase tracking-wider text-indigo-700 font-bold font-sans pt-1 border border-indigo-100 bg-indigo-50/10 py-1 rounded inline-block px-3 mt-1">
                        REPORT SCOPE:{" "}
                        {officeFilter !== "ALL"
                          ? `Office: [${officeFilter}]`
                          : ""}
                        {fundingFilter !== "ALL"
                          ? ` | Funding: [${fundingFilter}]`
                          : ""}
                        {searchTerm ? ` | Keyword Query: "${searchTerm}"` : ""}
                      </div>
                    )}
                  </div>

                  <div className="border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-[9px] border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
                      <thead>
                        <tr className="bg-slate-50 font-bold border-b border-slate-200">
                          <th className="p-3" style={{ width: "12%" }}>Asset Code No.</th>
                          <th className="p-3" style={{ width: "30%" }}>Property Description</th>
                          <th className="p-3" style={{ width: "12%" }}>Funding Stream</th>
                          <th className="p-3 text-right" style={{ width: "11%" }}>Cost (₱)</th>
                          <th className="p-3 text-center" style={{ width: "7%" }}>Life (Yrs)</th>
                          <th className="p-3 text-right" style={{ width: "11%" }}>Salvage Cost (₱)</th>
                          <th className="p-3 text-right" style={{ width: "13%" }}>
                            Accumulated Dep. (₱)
                          </th>
                          <th className="p-3 text-right" style={{ width: "14%" }}>Book Value (₱)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredItems.length === 0 ? (
                          <tr>
                            <td
                              colSpan={8}
                              className="p-8 text-center text-gray-400 font-bold tracking-widest uppercase"
                            >
                              No matching assets found under current filter
                              constraints.
                            </td>
                          </tr>
                        ) : (
                          filteredItems.map((item) => {
                            const calcs = getFinancialCalculations(item);
                            return (
                              <tr
                                key={item.id}
                                className="border-b border-slate-100 font-medium"
                              >
                                <td className="p-3 font-mono">
                                  {item.assetCode || "N/A: Pending"}
                                </td>
                                <td className="p-3 uppercase font-bold">
                                  {item.article}
                                  <p className="text-[8px] text-gray-400 font-sans mt-0.5">
                                    Prop: {item.propertyNumber} &bull;{" "}
                                    {item.office}
                                  </p>
                                </td>
                                <td className="p-3 uppercase">
                                  {item.fundingSource || "General Fund"}
                                </td>
                                <td className="p-3 text-right">
                                  ₱
                                  {calcs.cost.toLocaleString(undefined, {
                                    minimumFractionDigits: 2,
                                  })}
                                </td>
                                <td className="p-3 text-center">
                                  {item.usefulLife || 5} yrs
                                </td>
                                <td className="p-3 text-right">
                                  ₱
                                  {calcs.salvageValue.toLocaleString(
                                    undefined,
                                    { minimumFractionDigits: 2 },
                                  )}
                                </td>
                                <td className="p-3 text-right font-bold text-red-700">
                                  ₱
                                  {calcs.accumulatedDepreciation.toLocaleString(
                                    undefined,
                                    { minimumFractionDigits: 2 },
                                  )}
                                </td>
                                <td className="p-3 text-right font-bold text-slate-900">
                                  ₱
                                  {calcs.carryingValue.toLocaleString(
                                    undefined,
                                    { minimumFractionDigits: 2 },
                                  )}
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                      <tfoot>
                        <tr className="bg-slate-100 font-bold border-t-2 border-slate-300">
                          <td colSpan={3} className="p-3 text-right uppercase">
                            {officeFilter !== "ALL" ||
                            fundingFilter !== "ALL" ||
                            searchTerm
                              ? `FILTERED LEDGER SUBTOTALS (${filteredItems.length} ITEMS)`
                              : "GRAND ACCREDITED LEDGER TOTALS"}
                          </td>
                          <td className="p-3 text-right">
                            ₱
                            {filteredCost.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td></td>
                          <td className="p-3 text-right">
                            ₱
                            {filteredComputed
                              .reduce((sum, item) => sum + item.salvageValue, 0)
                              .toLocaleString(undefined, {
                                minimumFractionDigits: 2,
                              })}
                          </td>
                          <td className="p-3 text-right text-rose-700">
                            ₱
                            {filteredAccumulatedDep.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                          <td className="p-3 text-right text-emerald-800 text-xs">
                            ₱
                            {filteredCarryingValue.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                            })}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Signatures block */}
                  <div className="grid grid-cols-2 gap-12 pt-16 text-center text-xs">
                    <div className="space-y-8">
                      <p className="font-bold text-gray-500 uppercase text-[9px]">
                        Verified Municipal Accountant:
                      </p>
                      <div>
                        <p className="font-black border-b border-slate-900 pb-1 max-w-xs mx-auto uppercase">
                          {userName}
                        </p>
                        <p className="text-[9px] text-gray-400 mt-1">
                          Chief Accountant, LGU Tibiao
                        </p>
                      </div>
                    </div>

                    <div className="space-y-8">
                      <p className="font-bold text-gray-500 uppercase text-[9px]">
                        Approved Honorable Executive:
                      </p>
                      <div>
                        {/* Interactive Input Form (No Print) */}
                        <div className="no-print space-y-1.5">
                          <input
                            type="text"
                            className="w-full bg-transparent border-b border-dashed border-slate-300 hover:border-slate-900 focus:border-slate-900 text-center font-black uppercase outline-none pb-1 max-w-xs mx-auto block text-xs"
                            value={approvedExecutiveName}
                            onChange={(e) => setApprovedExecutiveName(e.target.value.toUpperCase())}
                            placeholder="EXECUTIVE NAME"
                          />
                          <input
                            type="text"
                            className="w-full bg-transparent text-gray-400 hover:text-gray-900 focus:text-slate-900 text-center outline-none text-[9px] mt-1.5 max-w-xs mx-auto block font-semibold"
                            value={approvedExecutiveTitle}
                            onChange={(e) => setApprovedExecutiveTitle(e.target.value)}
                            placeholder="EXECUTIVE TITLE"
                          />
                        </div>

                        {/* Static High-Contrast Printable Typography Block */}
                        <div className="hidden print:block text-center pt-2">
                          <p className="font-black border-b border-slate-900 pb-1 max-w-xs mx-auto uppercase text-xs">
                            {approvedExecutiveName || "GIL B. BANDOJA"}
                          </p>
                          <p className="text-[9px] text-gray-500 font-bold mt-1.5 uppercase">
                            {approvedExecutiveTitle || "Municipal Mayor, Tibiao, Antique"}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === "admin_requests" ? (
              <div className="space-y-6 animate-in">
                {/* Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase font-brand tracking-tight">
                      Procurement Request Slip (PRS)
                    </h2>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                      Send item request slips, quantities, accountant-assigned budgets, and requesting personnel records directly to the Admin.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowShipmentModal(true)}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-100 transition-all active:scale-95 shrink-0 self-start sm:self-center cursor-pointer font-brand"
                  >
                    <Truck className="w-4 h-4" />
                    <span>Lodge Supplier Shipment</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-6">
                  {/* Form section */}
                  <div className="accounting-pr-form bg-white text-slate-900 p-6 md:p-8 rounded-[36px] border border-slate-100 shadow-sm h-fit space-y-6 max-w-3xl w-full mx-auto">
                    <div>
                      <span className="inline-block px-3 py-1 bg-indigo-50 text-indigo-700 text-[9px] font-black uppercase tracking-widest rounded-lg border border-indigo-100">
                        PR Slip #{newSlipNumber}
                      </span>
                      <h3 className="font-brand font-black text-slate-900 text-lg uppercase tracking-tight mt-3">
                        {editingActReq ? "Edit PRS Details" : "Submit Purchase Request (PR)"}
                      </h3>
                      <p className="text-[10px] text-gray-400 font-bold uppercase mt-1">Submit official PRs to Admin & Engineering for review and cargo dispatch</p>
                    </div>

                    <form 
                      onSubmit={async (e) => {
                        e.preventDefault();
                        if (!newTitle.trim() || !newRequestedPerson.trim() || !newSupplier.trim() || !newExpectedDeliveryDate.trim() || !newDatePurchased.trim() || newUnitCost === "") {
                          alert("Please complete all required fields including Supplier, Unit Cost, Expected Delivery Date, and Date Purchased.");
                          return;
                        }

                        try {
                          // Resolve Master Asset record first
                          const masterAssetsCol = collection(db, 'master_assets');
                          let masterAssetId = '';
                          const q = query(masterAssetsCol, where('article', '==', newTitle.trim().toUpperCase()));
                          const snap = await getDocs(q);
                          const isDamagedReq = newCondition === 'Damaged' || newCondition === 'Under Repair' || newCondition === 'Poor' || newCondition === 'Condemned';
                          const addedDamaged = isDamagedReq ? Number(newQuantity) : 0;

                          if (!snap.empty) {
                            masterAssetId = snap.docs[0].id;
                            const masterData = snap.docs[0].data();
                            await updateDoc(doc(db, 'master_assets', masterAssetId), {
                              condition: isDamagedReq ? newCondition : (masterData.condition || newCondition),
                              qtyDamaged: Number(masterData.qtyDamaged || 0) + addedDamaged
                            });
                          } else {
                            const masterDocRef = doc(masterAssetsCol);
                            masterAssetId = masterDocRef.id;
                            const cost = Number(newUnitCost) || 0;
                            const classification = cost >= 50000 ? 'PAR' : 'ICS';
                            const codePrefix = newEquipmentType.toLowerCase().includes('office') ? 'OE' : (newEquipmentType.toLowerCase().includes('ict') ? 'ICT' : 'EQ');
                            const propNo = `LGU-ENG-${codePrefix}-2026-${Math.floor(1000 + Math.random() * 9000)}`;
                            await setDoc(masterDocRef, {
                              propertyNumber: propNo,
                              article: newTitle.trim().toUpperCase(),
                              description: newDetails || `Standard ${newEquipmentType}`,
                              category: newEquipmentType || 'Other Assets',
                              unitOfMeasure: newUnit || 'unit',
                              unitValue: cost,
                              acquisitionCost: cost * Number(newQuantity),
                              classification,
                              condition: newCondition,
                              qtyDamaged: addedDamaged,
                              qtyPhysicalCount: Number(newQuantity),
                              qtyPropertyCard: Number(newQuantity),
                              isFixed: true,
                              isFixedMaster: true
                            });
                          }

                          // Automatically sync to inventory_items so Admin inventory ledger updates immediately
                          const itemsCol = collection(db, 'inventory_items');
                          const qItem = query(itemsCol, where('masterAssetId', '==', masterAssetId));
                          const snapItem = await getDocs(qItem);
                          if (!snapItem.empty) {
                            const itemDoc = snapItem.docs[0];
                            const itemData = itemDoc.data();
                            await updateDoc(doc(db, 'inventory_items', itemDoc.id), {
                              condition: isDamagedReq ? newCondition : (itemData.condition || newCondition),
                              qtyDamaged: Number(itemData.qtyDamaged || 0) + addedDamaged,
                              qtyPhysicalCount: Number(itemData.qtyPhysicalCount || 0) + Number(newQuantity),
                              qtyPropertyCard: Number(itemData.qtyPropertyCard || 0) + Number(newQuantity)
                            });
                          } else {
                            await addDoc(collection(db, 'inventory_items'), {
                              masterAssetId,
                              article: newTitle.trim().toUpperCase(),
                              description: newDetails || `Standard ${newEquipmentType}`,
                              category: newEquipmentType || 'Other Assets',
                              office: newTargetOffice || 'Municipal Engineering',
                              personAccountable: newRequestedPerson.trim() || 'Accountant',
                              qtyPhysicalCount: Number(newQuantity),
                              qtyPropertyCard: Number(newQuantity),
                              qtyDamaged: addedDamaged,
                              condition: newCondition,
                              status: 'AVAILABLE',
                              unitOfMeasure: newUnit || 'unit',
                              unitValue: Number(newUnitCost) || 0,
                              createdAt: new Date().toISOString()
                            });
                          }

                          if (editingActReq) {
                            // Update
                            const docRef = doc(db, "requests", editingActReq.id);
                            await updateDoc(docRef, {
                              masterAssetId,
                              itemArticle: newTitle,
                              quantity: Number(newQuantity),
                              unitCost: Number(newUnitCost),
                              amount: newAmount === "" ? null : Number(newAmount),
                              supplier: newSupplier,
                              poNumber: newPONumber || '',
                              invoiceNumber: newInvoiceNumber || '',
                              expectedDeliveryDate: newExpectedDeliveryDate,
                              datePurchased: newDatePurchased,
                              fundingSource: newFundingSource || 'General Fund',
                              requestedBy: newRequestedPerson,
                              justification: newDetails || "Procurement Request",
                              priority: newPriority,
                              targetOffice: newTargetOffice,
                              targetOfficeHead: newTargetOfficeHead || 'Engr. J. Santos',
                              preparedBy: newPreparedBy || userName,
                              unit: newUnit,
                              category: newEquipmentType,
                              equipmentType: newEquipmentType,
                              condition: newCondition,
                              requestType: 'FINANCIAL',
                              status: "Pending Delivery" // Reset status back to Pending Delivery so Engineer can receive/review it
                            });

                            // System log
                            await addDoc(collection(db, "system_logs"), {
                              timestamp: new Date().toISOString(),
                              user: userName,
                              action: `Accountant edited PRS Slip ${newSlipNumber}: "${newTitle}" (Status reset to Pending Delivery)`,
                              module: "Accountant Desk"
                            });

                            await logPRSAction({
                              user: userName,
                              role: 'ACCOUNTING',
                              formType: 'PRS',
                              transactionNumber: newSlipNumber || editingActReq.slipNumber || "N/A",
                              timestamp: new Date().toISOString(),
                              action: `SUBMISSION: Accountant edited and resubmitted PRS Slip ${newSlipNumber || editingActReq.slipNumber || "N/A"} ("${newTitle}")`,
                              module: "Procurement Audit"
                            });

                            await addDoc(collection(db, "notifications"), {
                              recipientRole: 'OFFICE_HEAD',
                              recipientOffice: newTargetOffice,
                              message: `Procurement Request Updated: "${newTitle}" (Slip: ${newSlipNumber || editingActReq.slipNumber}, Qty: ${newQuantity}) is now Pending Delivery.`,
                              timestamp: new Date().toISOString(),
                              isRead: false,
                              type: 'NEW_REQUEST',
                              reportId: editingActReq.id
                            });

                            await addDoc(collection(db, "notifications"), {
                              recipientRole: 'ADMIN',
                              message: `Procurement Request Updated: "${newTitle}" (Slip: ${newSlipNumber || editingActReq.slipNumber}, Qty: ${newQuantity}) is now Pending Delivery.`,
                              timestamp: new Date().toISOString(),
                              isRead: false,
                              type: 'NEW_REQUEST',
                              reportId: editingActReq.id
                            });

                            setEditingActReq(null);
                          } else {
                            // Create
                            const finalSlipNumber = newSlipNumber || ("PR-" + Math.floor(100000 + Math.random() * 900000));
                            const payload = {
                              masterAssetId,
                              slipNumber: finalSlipNumber,
                              itemArticle: newTitle,
                              category: newEquipmentType,
                              equipmentType: newEquipmentType,
                              condition: newCondition,
                              quantity: Number(newQuantity),
                              unit: newUnit,
                              unitCost: Number(newUnitCost),
                              amount: newAmount === "" ? null : Number(newAmount),
                              supplier: newSupplier,
                              poNumber: newPONumber || '',
                              invoiceNumber: newInvoiceNumber || '',
                              expectedDeliveryDate: newExpectedDeliveryDate,
                              datePurchased: newDatePurchased,
                              fundingSource: newFundingSource || 'General Fund',
                              requestedBy: newRequestedPerson,
                              justification: newDetails || "Procurement Request",
                              priority: newPriority,
                              status: "Pending Delivery", // Instantly Pending Delivery!
                              office: "Accounting Office",
                              targetOffice: newTargetOffice,
                              targetOfficeHead: newTargetOfficeHead || 'Engr. J. Santos',
                              preparedBy: newPreparedBy || userName,
                              requestedAt: new Date().toISOString(),
                              requestType: 'FINANCIAL'
                            };

                            const prDocRef = await addDoc(collection(db, "requests"), payload);

                            await logProcurementTransaction({
                              slipNumber: finalSlipNumber,
                              requestId: prDocRef.id,
                              itemArticle: newTitle,
                              quantity: Number(newQuantity),
                              amount: newAmount === "" ? null : Number(newAmount),
                              status: "Sent",
                              user: userName,
                              office: "Accounting Office",
                              details: `Procurement Request Slip created with status "Pending Delivery" from Supplier "${newSupplier}". Assigned target office: "${newTargetOffice}".`
                            });

                            // Send in-app notification to the targeted office head
                            await addDoc(collection(db, "notifications"), {
                              recipientRole: 'OFFICE_HEAD',
                              recipientOffice: newTargetOffice,
                              message: `New Procurement Request: "${newTitle}" (Slip: ${finalSlipNumber}, Qty: ${newQuantity}) is now Pending Delivery from Supplier "${newSupplier}".`,
                              timestamp: new Date().toISOString(),
                              isRead: false,
                              type: 'NEW_REQUEST',
                              reportId: prDocRef.id
                            });

                            await addDoc(collection(db, "notifications"), {
                              recipientRole: 'ADMIN',
                              message: `New Procurement Request: "${newTitle}" (Slip: ${finalSlipNumber}, Qty: ${newQuantity}) is now Pending Delivery from Supplier "${newSupplier}".`,
                              timestamp: new Date().toISOString(),
                              isRead: false,
                              type: 'NEW_REQUEST',
                              reportId: prDocRef.id
                            });

                            // System log
                            await addDoc(collection(db, "system_logs"), {
                              timestamp: new Date().toISOString(),
                              user: userName,
                              action: `Accountant submitted PRS Slip ${finalSlipNumber}: "${newTitle}" (Pending Delivery)`,
                              module: "Accountant Desk"
                            });

                            await logPRSAction({
                              user: userName,
                              role: 'ACCOUNTING',
                              formType: 'PRS',
                              transactionNumber: finalSlipNumber,
                              timestamp: new Date().toISOString(),
                              action: `CREATION & SUBMISSION: Accountant created and submitted PRS Slip ${finalSlipNumber} ("${newTitle}") with status "Pending Delivery"`,
                              module: "Procurement Audit"
                            });

                            const submittedPRPayload = { id: prDocRef.id, ...payload };
                            // Automatically open the Individual PAR / ICS Receipt Generator modal
                            openIndividualReceiptModal(submittedPRPayload);
                          }

                          // Reset
                          setNewTitle('');
                          setNewDetails('');
                          setNewAmount('');
                          setNewQuantity(1);
                          setNewUnit('pcs');
                          setNewEquipmentType('Office Equipment');
                          setNewRequestedPerson(userName || '');
                          setNewPriority('Medium');
                          setNewTargetOffice("Municipal Engineering");
                          setNewSlipNumber("PR-" + Math.floor(100000 + Math.random() * 900000));
                          setAssetSearchQuery('');
                          setShowAssetDropdown(false);

                          setNewSupplier('');
                          setNewPONumber('');
                          setNewInvoiceNumber('');
                          setNewUnitCost('');
                          setNewExpectedDeliveryDate('');
                          setNewDatePurchased(new Date().toISOString().split('T')[0]);
                          setNewFundingSource('General Fund');
                          setNewTargetOfficeHead('');
                          setNewPreparedBy('');
                        } catch (err) {
                          console.error("Failed to save accountant PRS:", err);
                          alert("Database saving error.");
                        }
                      }}
                      className="space-y-4 text-slate-900 text-xs font-bold"
                    >
                      {/* Interactive Selection Mechanism: Auto-fill from Catalog */}
                      <div className="relative bg-slate-50 p-3.5 rounded-2xl border border-slate-100">
                        <label className="block text-[8px] font-black uppercase tracking-widest text-indigo-600 mb-1.5 flex items-center justify-between">
                          <span>Auto-fill from Catalog Search</span>
                          {assetSearchQuery && (
                            <button
                              type="button"
                              onClick={() => {
                                setAssetSearchQuery('');
                                setShowAssetDropdown(false);
                              }}
                              className="text-[7.5px] text-rose-400 hover:underline font-bold uppercase cursor-pointer"
                            >
                              Clear Search
                            </button>
                          )}
                        </label>
                        <div className="relative z-50">
                          <input
                             type="text"
                             value={assetSearchQuery}
                             onChange={(e) => {
                               setAssetSearchQuery(e.target.value);
                               setShowAssetDropdown(true);
                             }}
                             onFocus={() => setShowAssetDropdown(true)}
                             placeholder="Search registered assets to auto-fill..."
                             className="w-full bg-white border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs font-bold leading-none outline-none transition-all text-slate-700 placeholder-slate-400 font-sans"
                          />
                        </div>

                        {/* Click-outside backdrop */}
                        {showAssetDropdown && (
                          <div 
                            className="fixed inset-0 z-40" 
                            onClick={() => setShowAssetDropdown(false)}
                          />
                        )}

                        {/* Search Results Dropdown */}
                        {showAssetDropdown && assetSearchQuery && (
                          <div className="absolute left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-xl z-50 divide-y divide-slate-100">
                            {(() => {
                              const query = assetSearchQuery.toLowerCase();
                              const filtered = (items || []).filter(item => 
                                (item.article || "").toLowerCase().includes(query) ||
                                (item.description || "").toLowerCase().includes(query) ||
                                (item.category || "").toLowerCase().includes(query) ||
                                (item.propertyNumber || "").toLowerCase().includes(query)
                              ).slice(0, 8);

                              if (filtered.length === 0) {
                                return (
                                    <div className="p-3.5 text-center text-[10px] text-slate-400">
                                    No matching registered assets found
                                  </div>
                                );
                              }

                              return filtered.map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => {
                                    setNewTitle(item.article || '');
                                    setNewUnit(item.unitOfMeasure || 'pcs');
                                    setNewDetails(item.description || '');
                                    
                                    // Set category mapping
                                    const mappedCat = (() => {
                                      const cat = (item.category || "").toLowerCase();
                                      if (cat.includes("ict") || cat.includes("computer") || cat.includes("it") || cat.includes("network") || cat.includes("tech")) {
                                        return "ICT Equipment";
                                      }
                                      if (cat.includes("transport") || cat.includes("vehicle") || cat.includes("car") || cat.includes("truck") || cat.includes("motorcycle")) {
                                        return "Transportation Equipment";
                                      }
                                      if (cat.includes("construct") || cat.includes("tool") || cat.includes("material") || cat.includes("building")) {
                                        return "Construction Materials";
                                      }
                                      if (cat.includes("office") || cat.includes("furn") || cat.includes("chair") || cat.includes("desk") || cat.includes("table")) {
                                        return "Office Equipment";
                                      }
                                      return "Other Equipment";
                                    })();
                                    setNewEquipmentType(mappedCat);
                                    
                                    // Auto populate amount
                                    if (item.unitValue) {
                                      setNewAmount(item.unitValue);
                                    } else if (item.acquisitionCost) {
                                      setNewAmount(item.acquisitionCost);
                                    }

                                    // Pre-populate target office
                                    if (item.office) {
                                      const mappedOffice = (item.office || "").toLowerCase().includes("engineer") 
                                        ? "Municipal Engineering" 
                                        : (item.office || "").toLowerCase().includes("mayor") 
                                        ? "Mayor's Office" 
                                        : "Accounting Office";
                                      setNewTargetOffice(mappedOffice);
                                    }

                                    // Set search input value and close dropdown
                                    setAssetSearchQuery(item.article || '');
                                    setShowAssetDropdown(false);
                                  }}
                                  className="w-full text-left p-3 hover:bg-indigo-600/30 transition-colors flex flex-col gap-1 focus:outline-none focus:bg-indigo-600/30"
                                >
                                  <div className="flex justify-between items-center w-full">
                                    <span className="text-[11px] font-black text-white uppercase tracking-tight truncate max-w-[70%]">
                                      {item.article}
                                    </span>
                                    <span className="text-[8px] bg-slate-800 border border-slate-700 text-indigo-300 px-1.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                                      {item.category}
                                    </span>
                                  </div>
                                  {item.description && (
                                    <span className="text-[9.5px] text-slate-400 font-normal line-clamp-1">
                                      {item.description}
                                    </span>
                                  )}
                                  <div className="flex items-center justify-between text-[8px] text-slate-500 font-mono mt-0.5">
                                    <span>No: {item.propertyNumber || 'Pending'}</span>
                                    {item.unitValue ? (
                                      <span className="text-indigo-400 font-black">₱{item.unitValue.toLocaleString()}</span>
                                    ) : null}
                                  </div>
                                </button>
                              ));
                            })()}
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                          Item Name / Article *
                        </label>
                        <input
                           type="text"
                           required
                           value={newTitle}
                           onChange={(e) => setNewTitle(e.target.value)}
                           placeholder="e.g., Heavy-Duty Desktop Computers"
                           className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold leading-none outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-800/80 transition-all text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                          Equipment Type / Category
                        </label>
                        <select
                          value={newEquipmentType}
                          onChange={(e) => setNewEquipmentType(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-750 rounded-xl px-3 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-250"
                        >
                          <option value="Office Equipment">Office Equipment</option>
                          <option value="ICT Equipment">ICT Equipment</option>
                          <option value="Transportation Equipment">Transportation Equipment</option>
                          <option value="Construction Materials">Construction Materials</option>
                          <option value="Other Equipment">Other Equipment</option>
                        </select>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                            Supplier *
                          </label>
                          <input
                            type="text"
                            required
                            value={newSupplier}
                            onChange={(e) => setNewSupplier(e.target.value)}
                            placeholder="e.g. Acme Corp"
                            className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold leading-none outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-800/80 transition-all text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                            Funding Source
                          </label>
                          <input
                            type="text"
                            value={newFundingSource}
                            onChange={(e) => setNewFundingSource(e.target.value)}
                            placeholder="e.g. General Fund"
                            className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold leading-none outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-800/80 transition-all text-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                            PO Number (Optional)
                          </label>
                          <input
                            type="text"
                            value={newPONumber}
                            onChange={(e) => setNewPONumber(e.target.value)}
                            placeholder="PO-XXXX"
                            className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold leading-none outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-800/80 transition-all text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                            Invoice Number (Optional)
                          </label>
                          <input
                            type="text"
                            value={newInvoiceNumber}
                            onChange={(e) => setNewInvoiceNumber(e.target.value)}
                            placeholder="INV-XXXX"
                            className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold leading-none outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-800/80 transition-all text-white"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                            Quantity *
                          </label>
                          <input
                            type="number"
                            required
                            min={1}
                            value={newQuantity}
                            onChange={(e) => setNewQuantity(Number(e.target.value))}
                            className="w-full bg-slate-800 border border-slate-750 rounded-xl px-3 py-3 text-xs font-bold leading-none outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-800/80 transition-all text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                            Unit Cost *
                          </label>
                          <input
                            type="number"
                            required
                            min={0}
                            value={newUnitCost}
                            onChange={(e) => setNewUnitCost(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="₱ Cost"
                            className="w-full bg-slate-800 border border-slate-750 rounded-xl px-3 py-3 text-xs font-bold leading-none outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-800/80 transition-all text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                            Total Cost (Auto)
                          </label>
                          <input
                            type="number"
                            readOnly
                            value={newAmount}
                            className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-3 text-xs font-black leading-none outline-none text-indigo-400 font-mono cursor-not-allowed"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                            Date Purchased *
                          </label>
                          <input
                            type="date"
                            required
                            value={newDatePurchased}
                            onChange={(e) => setNewDatePurchased(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold leading-none outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-800/80 transition-all text-white"
                          />
                        </div>

                        <div>
                          <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                            Expected Delivery Date *
                          </label>
                          <input
                            type="date"
                            required
                            value={newExpectedDeliveryDate}
                            onChange={(e) => setNewExpectedDeliveryDate(e.target.value)}
                            className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold leading-none outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-800/80 transition-all text-white"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                          Name of Requesting Person *
                        </label>
                        <input
                          type="text"
                          required
                          value={newRequestedPerson}
                          onChange={(e) => setNewRequestedPerson(e.target.value)}
                          placeholder="Requested By..."
                          className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold leading-none outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-800/80 transition-all text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                          Specification Details / Remarks
                        </label>
                        <textarea
                          rows={3}
                          value={newDetails}
                          onChange={(e) => setNewDetails(e.target.value)}
                          placeholder="e.g. Core i7 processor, 16GB RAM, for Municipal Treasury Office use."
                          className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold leading-normal outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-slate-800/80 transition-all text-white"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                          Request Priority
                        </label>
                        <select
                          value={newPriority}
                          onChange={(e) => setNewPriority(e.target.value as any)}
                          className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
                        >
                          <option value="Low">Low - Standard Handling</option>
                          <option value="Medium">Medium - Regular Processing</option>
                          <option value="High">High - Urgent Response Required</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                          Recipient Office / Department
                        </label>
                        <select
                          value={newTargetOffice}
                          onChange={(e) => setNewTargetOffice(e.target.value)}
                          className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
                        >
                          <option value="Municipal Engineering">Municipal Engineering Office (Engineer)</option>
                          <option value="Mayor's Office">Mayor's Office</option>
                          <option value="Accounting Office">Accounting Office</option>
                        </select>
                      </div>

                      <div className="flex gap-2 pt-2">
                        {editingActReq && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingActReq(null);
                              setNewTitle('');
                              setNewDetails('');
                              setNewAmount('');
                              setNewQuantity(1);
                              setNewRequestedPerson(userName || '');
                              setNewPriority('Medium');
                              setNewTargetOffice("Municipal Engineering");
                              setAssetSearchQuery('');
                              setShowAssetDropdown(false);
                            }}
                            className="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-300 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          type="submit"
                          className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-900/30 flex items-center justify-center space-x-2 animate-pulse"
                        >
                          <span>{editingActReq ? "Save & Send to Engineer" : "Send to Engineer"}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            ) : activeTab === "outgoing_requests" ? (
              <div className="space-y-6 animate-in">
                {/* Banner */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase font-brand tracking-tight">
                      Outgoing Request Logs
                    </h2>
                    <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">
                      Track and audit all procurement request slips sent to Admin &amp; Engineering. Monitor delivery status, approvals, and returns.
                    </p>
                  </div>
                  <button
                    onClick={() => setActiveTab('admin_requests')}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-indigo-100 transition-all active:scale-95 shrink-0 self-start sm:self-center cursor-pointer font-brand"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                    <span>New Purchase Request</span>
                  </button>
                </div>

                <div className="space-y-4">
                    {(() => {
                      const registeredCount = actRequests.filter(r => r.status === 'Completed' || r.status === 'RECEIVED' || r.status === 'DISTRIBUTED').length;
                      const pendingCount = actRequests.filter(r => r.status === 'Pending Delivery' || r.status === 'PENDING_RECEIVING').length;
                      const actionNeededCount = actRequests.filter(r => r.status === 'PENDING' || r.status === 'Returned' || r.status === 'REJECTED' || r.status === 'Rejected').length;

                      const filteredRequests = actRequests.filter(req => {
                        if (procurementStatusFilter === 'REGISTERED') {
                          return req.status === 'Completed' || req.status === 'RECEIVED' || req.status === 'DISTRIBUTED';
                        }
                        if (procurementStatusFilter === 'PENDING') {
                          return req.status === 'Pending Delivery' || req.status === 'PENDING_RECEIVING';
                        }
                        if (procurementStatusFilter === 'ACTION_NEEDED') {
                          return req.status === 'PENDING' || req.status === 'Returned' || req.status === 'REJECTED' || req.status === 'Rejected';
                        }
                        return true;
                      });

                      return (
                        <>
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2">
                            <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                              Outgoing Request Logs ({filteredRequests.length} of {actRequests.length})
                            </div>
                            <span className="text-[9px] text-indigo-600 bg-indigo-50 font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                              Interactive Tracker
                            </span>
                          </div>

                          {/* Quick visual tracker metrics - filterable */}
                          <div className="grid grid-cols-4 gap-2 bg-slate-50 p-2 rounded-[20px] border border-slate-100/80">
                            <button
                              type="button"
                              onClick={() => setProcurementStatusFilter('ALL')}
                              className={`p-2 rounded-xl text-center cursor-pointer transition-all ${
                                procurementStatusFilter === 'ALL'
                                  ? 'bg-white shadow-sm border border-slate-200 text-slate-800 font-extrabold'
                                  : 'hover:bg-white/40 text-slate-500 font-semibold'
                              }`}
                            >
                              <div className="text-[13px] font-black">{actRequests.length}</div>
                              <div className="text-[7.5px] uppercase tracking-wider block sm:inline-block">All</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setProcurementStatusFilter('REGISTERED')}
                              className={`p-2 rounded-xl text-center cursor-pointer transition-all ${
                                procurementStatusFilter === 'REGISTERED'
                                  ? 'bg-emerald-600 text-white shadow-sm font-extrabold'
                                  : 'hover:bg-white/40 text-emerald-600 font-bold bg-emerald-50/50'
                              }`}
                            >
                              <div className="text-[13px] font-black">{registeredCount}</div>
                              <div className="text-[7.5px] uppercase tracking-wider">Registered</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setProcurementStatusFilter('PENDING')}
                              className={`p-2 rounded-xl text-center cursor-pointer transition-all ${
                                procurementStatusFilter === 'PENDING'
                                  ? 'bg-amber-500 text-white shadow-sm font-extrabold'
                                  : 'hover:bg-white/40 text-amber-700 font-bold bg-amber-50/50'
                              }`}
                            >
                              <div className="text-[13px] font-black">{pendingCount}</div>
                              <div className="text-[7.5px] uppercase tracking-wider">Pending Del.</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => setProcurementStatusFilter('ACTION_NEEDED')}
                              className={`p-2 rounded-xl text-center cursor-pointer transition-all ${
                                procurementStatusFilter === 'ACTION_NEEDED'
                                  ? 'bg-indigo-600 text-white shadow-sm font-extrabold'
                                  : 'hover:bg-white/40 text-slate-600 font-bold bg-slate-100'
                              }`}
                            >
                              <div className="text-[13px] font-black">{actionNeededCount}</div>
                              <div className="text-[7.5px] uppercase tracking-wider">Drafts/Returns</div>
                            </button>
                          </div>

                          {loadingActReqs ? (
                            <div className="bg-white p-12 rounded-[28px] border border-slate-100 flex flex-col items-center justify-center">
                              <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                              <p className="mt-3 text-[9px] font-black uppercase tracking-widest text-gray-400 animate-pulse">Loading active logs...</p>
                            </div>
                          ) : filteredRequests.length === 0 ? (
                            <div className="bg-white p-12 text-center border border-dashed border-slate-200 rounded-[28px]">
                              <p className="text-gray-400 text-xs font-black uppercase tracking-widest">No matching logs found</p>
                              <p className="text-[10px] text-gray-400 uppercase tracking-widest mt-1">There are no requests matching the selected category.</p>
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {filteredRequests.map(req => (
                          <div 
                            key={req.id}
                            className={`bg-white p-6 rounded-[28px] border transition-all ${
                              req.status === 'PENDING' ? 'border-amber-100' :
                              req.status === 'APPROVED' ? 'border-emerald-100' :
                              'border-red-100'
                            }`}
                          >
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${
                                  req.status === 'PENDING' ? 'bg-slate-50 text-slate-600 border-slate-300' :
                                  (req.status === 'Pending Delivery' || req.status === 'PENDING_RECEIVING') ? 'bg-amber-50 text-amber-700 border-amber-200' :
                                  req.status === 'Returned' ? 'bg-amber-50 text-amber-800 border-amber-350 animate-pulse' :
                                  (req.status === 'Completed' || req.status === 'RECEIVED') ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-extrabold' :
                                  req.status === 'DISTRIBUTED' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' :
                                  (req.status === 'REJECTED' || req.status === 'Rejected') ? 'bg-rose-50 text-rose-700 border-rose-250 font-extrabold' :
                                  'bg-red-50 text-red-700 border-red-200'
                                }`}>
                                  {req.status === 'PENDING' ? 'PREPARED - DRAFT' : 
                                   (req.status === 'Pending Delivery' || req.status === 'PENDING_RECEIVING') ? 'SENT - PENDING DELIVERY' : 
                                   req.status === 'Returned' ? 'RETURNED FOR CORRECTION' : 
                                   req.status === 'Completed' ? 'COMPLETED (CARGO RECEIVED)' :
                                   req.status === 'RECEIVED' ? 'IN ENGINEER CARGO' : 
                                   req.status === 'DISTRIBUTED' ? 'FULLY DISTRIBUTED' : 
                                   req.status === 'REJECTED' || req.status === 'Rejected' ? 'REJECTED & RETURNED' : 
                                   req.status}
                                </span>

                                <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-wider border ${
                                  req.priority === 'High' ? 'bg-rose-50 text-rose-700 border-rose-250 font-black' :
                                  req.priority === 'Medium' ? 'bg-sky-50 text-sky-700 border-sky-200' :
                                  'bg-slate-50 text-slate-500 border-slate-200'
                                }`}>
                                  {req.priority} Priority
                                </span>

                                {req.amount !== undefined && (
                                  <span className="bg-slate-50 text-indigo-700 border border-slate-100 px-2 rounded-full text-[8.5px] font-black">
                                    ₱{req.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                  </span>
                                )}
                              </div>

                              <span className="text-[8.5px] text-slate-400 font-bold uppercase">
                                {new Date(req.submittedAt).toLocaleDateString()} at {new Date(req.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>

                            <div className="space-y-3 mt-2">
                              <div className="flex items-start justify-between">
                                <div>
                                  <span className="text-[8px] font-black text-slate-400 block uppercase tracking-widest">
                                    {req.slipNumber ? `PRS Slip ${req.slipNumber}` : 'Requested Item'} ({req.equipmentType || 'Equipment'})
                                  </span>
                                  <h4 className="text-sm font-black text-slate-900 uppercase mt-0.5">{req.title}</h4>
                                </div>
                                <div className="text-right shrink-0">
                                  <span className="text-[8px] font-black text-slate-400 block uppercase tracking-widest">Quantity</span>
                                  <span className="text-xs font-black text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg block mt-0.5">
                                    {req.quantity} {req.unit || 'pcs'}
                                  </span>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-3 rounded-2xl border border-slate-100 text-[10.5px]">
                                <div>
                                  <span className="text-[7.5px] font-black uppercase text-slate-400 tracking-widest block">Accountant Provided Budget</span>
                                  <span className="font-brand font-black text-indigo-700 mt-0.5 block">
                                    ₱{req.amount !== undefined && req.amount !== null ? Number(req.amount).toLocaleString(undefined, { minimumFractionDigits: 2 }) : "None"}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[7.5px] font-black uppercase text-slate-400 tracking-widest block">Requesting Person Name</span>
                                  <span className="font-extrabold text-slate-800 uppercase mt-0.5 block">
                                    {req.requestedBy || req.submittedBy || 'N/A'}
                                  </span>
                                </div>
                              </div>

                              {req.details && (
                                <div>
                                  <span className="text-[7.5px] font-black uppercase text-slate-400 tracking-widest block mb-0.5">Purpose / Specifications</span>
                                  <p className="text-slate-600 text-[11px] whitespace-pre-line leading-relaxed italic pr-2">
                                    "{req.details}"
                                  </p>
                                </div>
                              )}

                              {/* Receiving Timeline tracker */}


                              {/* Cargo details displayed automatically */}
                              {(req.status === 'PENDING_RECEIVING' || req.status === 'Pending Delivery') && (
                                <div className="mt-2 p-3 bg-amber-50/50 rounded-2xl border border-amber-100 text-[10.5px] text-amber-800 font-bold space-y-1">
                                  <div className="text-[8px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1">
                                    <span>⏳ SENT - PENDING DELIVERY</span>
                                  </div>
                                  <div>Sent Date: {req.sentToEngineerAt ? new Date(req.sentToEngineerAt).toLocaleDateString() : 'N/A'}</div>
                                  <div>Status: Pending physical cargo receiving & delivery verification.</div>
                                </div>
                              )}

                              {req.status === 'RECEIVED' && (
                                <div className="mt-2 p-3 bg-blue-50/50 rounded-2xl border border-blue-100 text-[10.5px] text-blue-900 font-bold space-y-1">
                                  <div className="text-[8px] font-black text-blue-600 uppercase tracking-widest flex items-center gap-1">
                                    <span>✓ RECEIVED IN CARGO BY ENGINEER</span>
                                  </div>
                                  <div>Received Date: {req.receivedAt ? new Date(req.receivedAt).toLocaleDateString() : 'N/A'}</div>
                                  <div>Verified By: {req.receivedBy || 'Municipal Engineer'}</div>
                                  <div>Allocation Remaining: {req.quantity - (req.distributedQty || 0)} out of {req.quantity} units</div>
                                </div>
                              )}

                              {req.status === 'DISTRIBUTED' && (
                                <div className="mt-2 p-3 bg-emerald-50/50 rounded-2xl border border-emerald-100 text-[10.5px] text-emerald-800 font-bold space-y-1">
                                  <div className="text-[8px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                                    <span>✓ FULLY DISTRIBUTED & COMMITTED</span>
                                  </div>
                                  <div>Received & Processed by: {req.receivedBy || 'Municipal Engineer'}</div>
                                  <div>Status: Fully allocated to requested department(s).</div>
                                </div>
                              )}

                              {req.distributions && req.distributions.length > 0 && (
                                <div className="mt-2 p-3 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] space-y-1.5">
                                  <span className="text-[7.5px] font-black uppercase text-slate-400 tracking-widest block border-b border-slate-150 pb-1">
                                    Physical Allocations Log ({req.distributedQty || 0} unit(s) distributed)
                                  </span>
                                  <div className="space-y-1 text-[9.5px]">
                                    {req.distributions.map((dist: any, idx: number) => (
                                      <div key={idx} className="flex justify-between items-center font-bold text-slate-600">
                                        <span>→ Distributed {dist.quantity} unit(s) to <strong className="text-slate-800">{dist.office}</strong></span>
                                        <span className="text-gray-400 font-mono text-[8.5px]">{new Date(dist.date).toLocaleDateString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Approval details displayed automatically */}
                              {req.status === 'APPROVED' && (
                                <div className="mt-2 p-3 bg-emerald-50 rounded-2xl border border-emerald-100 text-[10.5px] text-emerald-800 font-bold space-y-1">
                                  <div className="text-[8px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                                    <span>✓ APPROVED BY ENGINEER</span>
                                  </div>
                                  <div>Approved Date: {req.approvedAt ? new Date(req.approvedAt).toLocaleDateString() : 'N/A'}</div>
                                  <div>Approved By: {req.approvedBy || 'Municipal Engineer'}</div>
                                </div>
                              )}

                              {/* Returned details displayed automatically */}
                              {req.status === 'Returned' && (
                                <div className="mt-2 p-3 bg-amber-50 rounded-2xl border border-amber-250 text-[10.5px] text-amber-900 font-bold space-y-1">
                                  <div className="text-[8px] font-black text-amber-700 uppercase tracking-widest flex items-center gap-1">
                                    <span>⚠ RETURNED FOR CORRECTION</span>
                                  </div>
                                  <div>Returned Date: {req.rejectedAt ? new Date(req.rejectedAt).toLocaleDateString() : 'N/A'}</div>
                                  <div>Returned By: {req.rejectedBy || 'Municipal Engineer'}</div>
                                  {req.rejectionReason && (
                                    <div className="text-amber-950 italic mt-1 font-extrabold">"Remarks: {req.rejectionReason}"</div>
                                  )}
                                </div>
                              )}

                              {/* Completed details displayed automatically */}
                              {req.status === 'Completed' && (
                                <div className="mt-2 p-3 bg-emerald-50 rounded-2xl border border-emerald-150 text-[10.5px] text-emerald-800 font-bold space-y-1">
                                  <div className="text-[8px] font-black text-emerald-600 uppercase tracking-widest flex items-center gap-1">
                                    <span>✓ CARGO DELIVERED & RECEIVED SUCCESSFULLY</span>
                                  </div>
                                  <div>Received Date: {req.receivedAt ? new Date(req.receivedAt).toLocaleDateString() : 'N/A'}</div>
                                  <div>Received By: {req.receivedBy || 'Municipal Engineer'}</div>
                                  <div>Status: Officially received and deposited in Warehouse and {req.targetOffice}.</div>
                                </div>
                              )}

                              {/* Rejection details displayed automatically */}
                              {(req.status === 'REJECTED' || req.status === 'Rejected') && (
                                <div className="mt-2 p-3 bg-rose-50 rounded-2xl border border-rose-100 text-[10.5px] text-rose-800 font-bold space-y-1">
                                  <div className="text-[8px] font-black text-rose-600 uppercase tracking-widest flex items-center gap-1">
                                    <span>✗ REJECTED BY ENGINEER</span>
                                  </div>
                                  <div>Rejected Date: {req.rejectedAt ? new Date(req.rejectedAt).toLocaleDateString() : 'N/A'}</div>
                                  <div>Rejected By: {req.rejectedBy || 'Municipal Engineer'}</div>
                                  {req.rejectionReason && (
                                    <div className="text-rose-950 italic mt-1 font-extrabold">"Reason: {req.rejectionReason}"</div>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Response remarks display */}
                            {req.adminRemarks && (
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-[10px] text-slate-700 font-bold mt-3">
                                <span className="text-[8px] font-black uppercase text-slate-400 block mb-0.5">Admin Response remarks:</span>
                                <p className="italic">"{req.adminRemarks}"</p>
                              </div>
                            )}

                            {/* Action buttons bar */}
                            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 mt-4">
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => openIndividualReceiptModal(req)}
                                  className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[8.5px] font-black uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
                                >
                                  <FileText className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>Generate &amp; Submit {(req.unitCost !== undefined && req.unitCost !== null && req.unitCost !== '' ? Number(req.unitCost) : ((Number(req.amount) || 0) / (Number(req.quantity) || 1))) >= 50000 ? 'PAR (≥₱50k)' : 'ICS (<₱50k)'} Receipt</span>
                                </button>

                                {req.parIcsStatus === 'Submitted' && (
                                  <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[8px] font-black uppercase tracking-wider flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                    <span>{req.parIcsType || 'PAR/ICS'} Submitted ({req.parIcsNumber})</span>
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-2">
                                {(req.status === 'PENDING' || req.status === 'Returned' || req.status === 'REJECTED' || req.status === 'Rejected') && (
                                  <button
                                    onClick={() => handleSendToEngineer(req)}
                                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[8.5px] font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Send to Engineer
                                  </button>
                                )}
                                {(req.status === 'PENDING' || req.status === 'Pending Delivery' || req.status === 'Returned' || req.status === 'REJECTED' || req.status === 'Rejected') && (
                                  <button
                                    onClick={() => {
                                      setEditingActReq(req);
                                      setNewTitle(req.itemArticle || req.title || '');
                                      setNewDetails(req.details || req.justification || '');
                                      setNewAmount(req.amount !== undefined && req.amount !== null ? req.amount : '');
                                      setNewQuantity(req.quantity || 1);
                                      setNewRequestedPerson(req.requestedBy || req.submittedBy || userName || '');
                                      setNewPriority(req.priority || 'Medium');
                                      setNewTargetOffice(req.targetOffice || "Municipal Engineering");
                                      setNewTargetOfficeHead(req.targetOfficeHead || req.officeHead || '');
                                      setNewPreparedBy(req.preparedBy || req.userName || userName || '');
                                      setNewSlipNumber(req.slipNumber || '');
                                      setNewSupplier(req.supplier || '');
                                      setNewPONumber(req.poNumber || '');
                                      setNewInvoiceNumber(req.invoiceNumber || '');
                                      setNewUnitCost(req.unitCost !== undefined && req.unitCost !== null ? req.unitCost : '');
                                      setNewExpectedDeliveryDate(req.expectedDeliveryDate || '');
                                      setNewDatePurchased(req.datePurchased || '');
                                      setNewFundingSource(req.fundingSource || 'General Fund');
                                    }}
                                    className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[8.5px] font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Modify / Edit
                                  </button>
                                )}
                                {(req.status === 'PENDING' || req.status === 'Returned' || req.status === 'REJECTED' || req.status === 'Rejected') && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm("Are you sure you want to delete this procurement request?")) return;
                                      try {
                                        await deleteDoc(doc(db, "requests", req.id));

                                        await addDoc(collection(db, "system_logs"), {
                                          timestamp: new Date().toISOString(),
                                          user: userName,
                                          action: `Accountant deleted Procurement Request: "${req.itemArticle || req.title}"`,
                                          module: "Accountant Desk"
                                        });
                                      } catch (err) {
                                        console.error("Failed to delete request:", err);
                                        alert("Failed to delete registry document.");
                                      }
                                    }}
                                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-600 hover:text-white rounded-xl text-rose-700 text-[8.5px] font-black uppercase tracking-wider transition-all cursor-pointer"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
            </div>
          ) : activeTab === "unified_reports" ? (
              <Reports
                items={items}
                onAddItem={onAddItem}
                onRemoveItem={onRemoveItem}
                onUpdateItem={onUpdateItem}
                userRole="ACCOUNTING"
                userOffice="Accounting Office"
                userName={userName}
                initialTab={reportsInitialTab}
              />
            ) : activeTab === "procurement_history" ? (
              <ProcurementTransactionHistory />
            ) : null}

            {/* Read-Only Stock Card Transaction Ledger Modal */}
            {isStockCardDetailOpen && selectedStockCardItem && (() => {
              const itemTxns = transactions.filter(t => 
                t.itemId === selectedStockCardItem.id || 
                (t.article === selectedStockCardItem.article && t.officeId === selectedStockCardItem.office)
              );

              return (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
                  <div className="bg-white rounded-[32px] shadow-2xl border border-slate-100 max-w-4xl w-full max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 text-slate-800">
                    {/* Modal Header */}
                    <div className="bg-slate-900 text-white p-6 flex items-center justify-between">
                      <div>
                        <span className="text-[8px] font-black uppercase text-indigo-400 tracking-widest block">Admin Auditing Ledger</span>
                        <h3 className="font-brand font-black text-white text-base uppercase tracking-tight mt-0.5">
                          Stock Card History Details
                        </h3>
                      </div>
                      <button
                        onClick={() => {
                          setIsStockCardDetailOpen(false);
                          setSelectedStockCardItem(null);
                        }}
                        className="p-2 bg-slate-800 hover:bg-slate-700 rounded-full text-slate-400 hover:text-white transition-all cursor-pointer"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Meta details banner */}
                    <div className="bg-slate-50 p-6 border-b border-slate-100 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs font-bold">
                      <div>
                        <span className="text-gray-400 text-[8px] uppercase font-black block tracking-wider">Item Name</span>
                        <span className="text-slate-900 uppercase font-extrabold mt-0.5 block truncate">{selectedStockCardItem.article}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 text-[8px] uppercase font-black block tracking-wider">Stock Card ID / Prop #</span>
                        <span className="text-slate-900 font-mono mt-0.5 block">{selectedStockCardItem.propertyNumber || "Pending"}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 text-[8px] uppercase font-black block tracking-wider">Classification</span>
                        <span className="text-indigo-600 mt-0.5 block">
                          {selectedStockCardItem.unitValue >= 15000 ? "PAR Asset (Equipment)" : "ICS Supply (Semi-Expendable)"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-400 text-[8px] uppercase font-black block tracking-wider">Running Balance</span>
                        <span className="text-emerald-700 font-extrabold mt-0.5 block">{selectedStockCardItem.qtyPhysicalCount} {selectedStockCardItem.unitOfMeasure || "unit"}</span>
                      </div>
                    </div>

                    {/* Transaction history ledger content */}
                    <div className="p-6 flex-1 overflow-y-auto min-h-60 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          Audit Ledger (Transactions: {itemTxns.length})
                        </h4>
                        
                        <div className="flex items-center gap-2">
                          {/* Export modal transaction list button */}
                          <button
                            onClick={() => handleExportStockCardTxnsToCSV(selectedStockCardItem, itemTxns)}
                            className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span>Export Excel</span>
                          </button>

                          {/* Print modal stock card button */}
                          <button
                            onClick={() => handlePrintStockCardHistory(selectedStockCardItem, itemTxns)}
                            className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5 transition-all cursor-pointer shadow-sm"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-3a2 2 0 00-2-2H9a2 2 0 00-2 2v3a2 2 0 002 2zm5-17h2m-6 0h-2" />
                            </svg>
                            <span>Print Stock Card</span>
                          </button>
                        </div>
                      </div>

                      {itemTxns.length === 0 ? (
                        <div className="py-12 text-center text-[10px] font-black uppercase text-gray-300 tracking-widest border border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                          No transaction history found for this item.
                        </div>
                      ) : (
                        <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                          <table className="w-full text-left border-collapse text-[11px] font-bold text-slate-700">
                            <thead>
                              <tr className="bg-slate-50 border-b border-slate-150 text-slate-400 text-[8.5px] font-black uppercase tracking-widest">
                                <th className="py-2.5 px-4">Date & Time</th>
                                <th className="py-2.5 px-4">Reference Code</th>
                                <th className="py-2.5 px-4">Staff / User</th>
                                <th className="py-2.5 px-4 text-center">Change Qty</th>
                                <th className="py-2.5 px-4 text-center">Running Balance</th>
                                <th className="py-2.5 px-4">Remarks</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {itemTxns.map((t) => {
                                const isAddition = t.transactionType.includes("Received") || (t.transactionType.includes("Adjustment") && t.quantity > 0);
                                return (
                                  <tr key={t.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="py-2.5 px-4 text-slate-500 font-normal">
                                      {t.date} <span className="text-[10px] font-mono text-gray-400">{t.time || ""}</span>
                                    </td>
                                    <td className="py-2.5 px-4 font-mono text-indigo-600">{t.reference || "N/A"}</td>
                                    <td className="py-2.5 px-4 text-slate-900 uppercase font-extrabold">{t.user || "System"}</td>
                                    <td className={`py-2.5 px-4 text-center text-xs font-black ${isAddition ? "text-emerald-600" : "text-rose-600"}`}>
                                      {isAddition ? "+" : "-"}{t.quantity}
                                    </td>
                                    <td className="py-2.5 px-4 text-center text-xs font-black text-slate-800">{t.newBalance}</td>
                                    <td className="py-2.5 px-4 text-slate-500 font-normal italic max-w-xs truncate" title={t.remarks || ""}>
                                      {t.remarks || "No remarks logged."}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Modal Footer */}
                    <div className="bg-slate-50 p-4 border-t border-slate-100 flex items-center justify-between no-print">
                      <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wider">
                        Official Audit Logs are strictly Read-Only and tamper-proof.
                      </span>
                      <button
                        onClick={() => {
                          setIsStockCardDetailOpen(false);
                          setSelectedStockCardItem(null);
                        }}
                        className="px-5 py-2.5 bg-slate-950 hover:bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                      >
                        Close Ledger
                      </button>
                    </div>
                  </div>
                </div>
              );
            })()}
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
      {editingActReq && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 text-white w-full max-w-2xl rounded-[32px] shadow-2xl border border-slate-750 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="p-6 bg-slate-850 border-b border-slate-750 flex items-center justify-between">
              <div>
                <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400">Modify Purchase Request Slip</span>
                <h3 className="text-base font-black uppercase tracking-tight font-brand mt-0.5">
                  Slip Ref: {editingActReq.slipNumber || 'N/A'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setEditingActReq(null);
                  setNewTitle('');
                  setNewDetails('');
                  setNewAmount('');
                  setNewQuantity(1);
                  setNewRequestedPerson(userName || '');
                  setNewPriority('Medium');
                  setNewTargetOffice("Municipal Engineering");
                }}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleCreateActRequest} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar text-xs font-bold">
              <div>
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Item Name / Article *
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g., Heavy-Duty Desktop Computers"
                  className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Equipment Type / Category
                  </label>
                  <select
                    value={newEquipmentType}
                    onChange={(e) => setNewEquipmentType(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-750 rounded-xl px-3 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
                  >
                    <option value="Office Equipment">Office Equipment</option>
                    <option value="ICT Equipment">ICT Equipment</option>
                    <option value="Transportation Equipment">Transportation Equipment</option>
                    <option value="Construction Materials">Construction Materials</option>
                    <option value="Other Equipment">Other Equipment</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Supplier *
                  </label>
                  <input
                    type="text"
                    required
                    value={newSupplier}
                    onChange={(e) => setNewSupplier(e.target.value)}
                    placeholder="e.g. Acme Corp"
                    className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Quantity *
                  </label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={newQuantity}
                    onChange={(e) => setNewQuantity(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-750 rounded-xl px-3 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Unit Cost *
                  </label>
                  <input
                    type="number"
                    required
                    min={0}
                    value={newUnitCost}
                    onChange={(e) => setNewUnitCost(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="₱ Cost"
                    className="w-full bg-slate-800 border border-slate-750 rounded-xl px-3 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Total Cost (Auto)
                  </label>
                  <input
                    type="number"
                    readOnly
                    value={newAmount}
                    className="w-full bg-slate-850 border border-slate-750 rounded-xl px-3 py-3 text-xs font-black text-indigo-400 font-mono cursor-not-allowed"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Date Purchased *
                  </label>
                  <input
                    type="date"
                    required
                    value={newDatePurchased}
                    onChange={(e) => setNewDatePurchased(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Expected Delivery Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={newExpectedDeliveryDate}
                    onChange={(e) => setNewExpectedDeliveryDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Requesting Person Name *
                </label>
                <input
                  type="text"
                  required
                  value={newRequestedPerson}
                  onChange={(e) => setNewRequestedPerson(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                />
              </div>

              <div>
                <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                  Specification Details / Purpose
                </label>
                <textarea
                  rows={3}
                  value={newDetails}
                  onChange={(e) => setNewDetails(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Priority
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) => setNewPriority(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
                  >
                    <option value="Low">Low - Standard Handling</option>
                    <option value="Medium">Medium - Regular Processing</option>
                    <option value="High">High - Urgent Response Required</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1.5">
                    Recipient Office
                  </label>
                  <select
                    value={newTargetOffice}
                    onChange={(e) => setNewTargetOffice(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-750 rounded-xl px-4 py-3 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-200"
                  >
                    <option value="Municipal Engineering">Municipal Engineering Office (Engineer)</option>
                    <option value="Mayor's Office">Mayor's Office</option>
                    <option value="Accounting Office">Accounting Office</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t border-slate-750">
                <button
                  type="button"
                  onClick={() => {
                    setEditingActReq(null);
                    setNewTitle('');
                    setNewDetails('');
                    setNewAmount('');
                    setNewQuantity(1);
                    setNewRequestedPerson(userName || '');
                    setNewPriority('Medium');
                    setNewTargetOffice("Municipal Engineering");
                  }}
                  className="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-300 py-3 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white py-3 rounded-xl font-black text-[9px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-900/30 cursor-pointer"
                >
                  Save &amp; Send to Engineer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Individual PAR & ICS Receipt Generation Modal */}
      {showPRReceiptModal && selectedPRForReceipt && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200">
          <div className="max-w-4xl w-full bg-white rounded-[32px] shadow-2xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            {(() => {
              const pr = selectedPRForReceipt;
              const unitCost = pr.unitCost !== undefined && pr.unitCost !== null && pr.unitCost !== ''
                ? Number(pr.unitCost)
                : ((Number(pr.amount) || 0) / (Number(pr.quantity) || 1));
              const isPAR = unitCost >= 50000;
              const docTypeLabel = isPAR ? "PROPERTY ACKNOWLEDGEMENT RECEIPT (PAR)" : "INVENTORY CUSTODIAN SLIP (ICS)";
              const annexLabel = isPAR ? "Annex B" : "Appendix 59";
              const totalVal = pr.amount !== undefined && pr.amount !== null ? Number(pr.amount) : (unitCost * (pr.quantity || 1));

              return (
                <>
                  <div className="bg-slate-900 text-white p-6 sm:p-7 flex items-center justify-between border-b border-slate-800 shrink-0">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-black text-xs ${isPAR ? 'bg-blue-600 text-white' : 'bg-emerald-600 text-white'}`}>
                        {isPAR ? 'PAR' : 'ICS'}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black uppercase tracking-wider font-brand">{docTypeLabel}</h3>
                          <span className={`text-[8px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full ${isPAR ? 'bg-blue-500/20 text-blue-300 border border-blue-400/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/30'}`}>
                            {isPAR ? 'Asset (≥ ₱50,000)' : 'Supply / Semi-expendable (< ₱50,000)'}
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">
                          Generated for Purchase Request Slip #{pr.slipNumber || pr.requestNumber || 'N/A'} • {annexLabel}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowPRReceiptModal(false);
                        setSelectedPRForReceipt(null);
                      }}
                      className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-all cursor-pointer"
                    >
                      <XCircle className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Body - Scrollable */}
                  <div className="overflow-y-auto p-6 sm:p-8 space-y-6">
                    {/* Instructions banner */}
                    <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200/80 flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                      <div className="text-xs text-slate-700 font-medium">
                        <strong className="font-extrabold uppercase text-slate-900 block text-[11px] mb-0.5">Automated Receipt Classification</strong>
                        This purchase request for <strong className="text-indigo-700">{pr.itemArticle || pr.title}</strong> has been classified as <strong className="text-slate-900">{isPAR ? 'PAR (Property Acknowledgement Receipt)' : 'ICS (Inventory Custodian Slip)'}</strong> based on unit valuation (₱{unitCost.toLocaleString(undefined, {minimumFractionDigits: 2})}). Review metadata and click submit to send to Engineer &amp; Admin.
                      </div>
                    </div>

                    {/* Metadata Edit Form Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 bg-slate-50/50 p-5 rounded-2xl border border-slate-100 text-xs font-bold text-slate-900">
                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">
                          Fund Cluster
                        </label>
                        <input
                          type="text"
                          value={receiptFundCluster}
                          onChange={(e) => setReceiptFundCluster(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">
                          {isPAR ? 'PAR Control Number' : 'ICS Control Number'}
                        </label>
                        <input
                          type="text"
                          value={receiptDocNo}
                          onChange={(e) => setReceiptDocNo(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold font-mono text-indigo-700 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">
                          Date Issued
                        </label>
                        <input
                          type="text"
                          value={receiptDateIssued}
                          onChange={(e) => setReceiptDateIssued(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">
                          Received By (Accountable Officer)
                        </label>
                        <input
                          type="text"
                          value={receiptReceivedBy}
                          onChange={(e) => setReceiptReceivedBy(e.target.value)}
                          placeholder="Name of recipient / Dept Head"
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">
                          {isPAR ? 'Approved By (Authorized Official)' : 'Issued By (Authorized Official)'}
                        </label>
                        <input
                          type="text"
                          value={isPAR ? receiptApprovedBy : receiptIssuedBy}
                          onChange={(e) => {
                            if (isPAR) setReceiptApprovedBy(e.target.value);
                            else setReceiptIssuedBy(e.target.value);
                          }}
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 uppercase"
                        />
                      </div>

                      <div>
                        <label className="block text-[8px] font-black uppercase tracking-widest text-slate-400 mb-1">
                          Target Department
                        </label>
                        <input
                          type="text"
                          readOnly
                          value={pr.targetOffice || "Municipal Engineering"}
                          className="w-full bg-slate-100 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold uppercase text-slate-600 cursor-not-allowed"
                        />
                      </div>
                    </div>

                    {/* Official GAM Receipt Print Preview Box */}
                    <div className="bg-white border-2 border-slate-900 rounded-2xl p-6 font-serif shadow-sm space-y-4">
                      <div className="text-right italic font-bold text-[9pt] text-slate-400">{annexLabel}</div>
                      
                      <div className="text-center font-bold text-[8.5pt] uppercase text-slate-500 tracking-wider">
                        REPUBLIC OF THE PHILIPPINES • PROVINCE OF ANTIQUE • MUNICIPALITY OF TIBIAO
                      </div>

                      <div className="text-center font-bold text-sm uppercase text-slate-900 tracking-wider border-b border-slate-300 pb-2">
                        {docTypeLabel}
                      </div>

                      <div className="flex justify-between text-[9pt] font-sans">
                        <div>
                          <strong>Entity Name:</strong> LGU TIBIAO - {(pr.targetOffice || "MUNICIPAL ENGINEERING").toUpperCase()}
                        </div>
                        <div>
                          <strong>{isPAR ? 'PAR No.' : 'ICS No.'}:</strong> <span className="font-mono font-bold text-indigo-700">{receiptDocNo}</span>
                        </div>
                      </div>

                      <div className="flex justify-between text-[9pt] font-sans">
                        <div>
                          <strong>Supplier:</strong> {pr.supplier || "N/A"}
                        </div>
                        <div>
                          <strong>Fund Cluster:</strong> {receiptFundCluster}
                        </div>
                      </div>

                      {/* Item Details Table */}
                      <table className="w-full border-collapse border border-slate-900 text-[8.5pt] font-sans mt-3">
                        <thead>
                          <tr className="bg-slate-100 border-b border-slate-900">
                            <th className="border border-slate-900 p-1.5 text-center">Qty</th>
                            <th className="border border-slate-900 p-1.5 text-center">Unit</th>
                            {!isPAR && <th className="border border-slate-900 p-1.5 text-right">Unit Cost</th>}
                            {!isPAR && <th className="border border-slate-900 p-1.5 text-right">Total Amount</th>}
                            <th className="border border-slate-900 p-1.5 text-left">Description (Article &amp; Specs)</th>
                            <th className="border border-slate-900 p-1.5 text-center">Property / Inv. No.</th>
                            <th className="border border-slate-900 p-1.5 text-right">{isPAR ? 'Acquisition Cost' : 'Useful Life'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="border border-slate-900 p-2 text-center font-bold">{pr.quantity || 1}</td>
                            <td className="border border-slate-900 p-2 text-center uppercase">{pr.unit || 'pcs'}</td>
                            {!isPAR && <td className="border border-slate-900 p-2 text-right font-mono">₱{unitCost.toLocaleString(undefined, {minimumFractionDigits:2})}</td>}
                            {!isPAR && <td className="border border-slate-900 p-2 text-right font-mono font-bold">₱{totalVal.toLocaleString(undefined, {minimumFractionDigits:2})}</td>}
                            <td className="border border-slate-900 p-2">
                              <strong className="uppercase text-slate-900 block">{pr.itemArticle || pr.title}</strong>
                              <span className="text-[8pt] text-slate-600 block">{pr.details || pr.justification || "Procurement Item"}</span>
                              {pr.poNumber && <span className="text-[7.5pt] text-slate-500">PO #: {pr.poNumber} </span>}
                              {pr.invoiceNumber && <span className="text-[7.5pt] text-slate-500">| Inv #: {pr.invoiceNumber}</span>}
                            </td>
                            <td className="border border-slate-900 p-2 text-center font-mono">{pr.slipNumber ? `PROP-${pr.slipNumber}` : 'Pending'}</td>
                            <td className="border border-slate-900 p-2 text-right font-mono font-bold">
                              {isPAR ? `₱${totalVal.toLocaleString(undefined, {minimumFractionDigits:2})}` : `${pr.usefulLife || 5} yrs`}
                            </td>
                          </tr>
                        </tbody>
                      </table>

                      {/* Signatories preview block */}
                      <div className="grid grid-cols-2 border border-slate-900 text-[8.5pt] font-sans mt-4">
                        <div className="p-3 border-r border-slate-900">
                          <div className="font-bold uppercase text-[7.5pt] text-slate-500">Received By:</div>
                          <div className="border-b border-slate-900 mt-6 mb-1 text-center font-bold uppercase">{receiptReceivedBy}</div>
                          <div className="text-[7pt] text-center text-slate-500">Signature over Printed Name of Accountable Officer</div>
                          <div className="text-[7.5pt] mt-2">Date: <strong>{receiptDateIssued}</strong></div>
                        </div>

                        <div className="p-3">
                          <div className="font-bold uppercase text-[7.5pt] text-slate-500">{isPAR ? 'Approved By:' : 'Issued By:'}</div>
                          <div className="border-b border-slate-900 mt-6 mb-1 text-center font-bold uppercase">{isPAR ? receiptApprovedBy : receiptIssuedBy}</div>
                          <div className="text-[7pt] text-center text-slate-500">Signature over Printed Name of Authorized Official</div>
                          <div className="text-[7.5pt] mt-2">Date: <strong>{receiptDateIssued}</strong></div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Modal Footer / Action Bar */}
                  <div className="bg-slate-50 border-t border-slate-200 p-5 sm:p-6 flex flex-wrap items-center justify-between gap-3 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setShowPRReceiptModal(false);
                        setSelectedPRForReceipt(null);
                      }}
                      className="px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer"
                    >
                      Close / Later
                    </button>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => handlePrintIndividualPRReceipt(pr)}
                        className="px-5 py-2.5 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 shadow-sm"
                      >
                        <FileSpreadsheet className="w-4 h-4 text-slate-600" />
                        <span>Print Receipt</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleSubmitIndividualPRReceipt}
                        disabled={isSubmittingPRReceipt}
                        className={`px-6 py-2.5 ${isPAR ? 'bg-blue-600 hover:bg-blue-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-indigo-100 disabled:opacity-50`}
                      >
                        {isSubmittingPRReceipt ? (
                          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <ArrowRight className="w-4 h-4" />
                        )}
                        <span>Submit {isPAR ? 'PAR' : 'ICS'} Receipt to Engineer/Admin</span>
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountingDashboard;
