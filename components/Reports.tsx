
import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { InventoryItem, GeneratedReport, ReportRow } from '../types';
import { InventoryTransferReport } from './InventoryTransferReport';
import { GAMFormsEditor } from './GAMForms';
import { db } from '../firebase';
import { OFFICIAL_LGU_INVENTORY } from '../officialLguData';
import { collection, addDoc, deleteDoc, doc, updateDoc, onSnapshot, query, orderBy, serverTimestamp, getDocs, where } from 'firebase/firestore';

interface ReportsProps {
  items: InventoryItem[];
  onAddItem?: (item: Partial<InventoryItem>) => Promise<string>;
  onRemoveItem?: (id: string) => void;
  onUpdateItem?: (id: string, updates: Partial<InventoryItem>) => void;
  onReportSave?: () => void;
  userRole?: string;
  userOffice?: string;
  userName?: string;
  initialTab?: 'generator' | 'archive' | 'transfers';
}

interface VisibleFields {
  article: boolean;
  description: boolean;
  propertyNumber: boolean;
  condition: boolean;
  unitOfMeasure: boolean;
  unitValue: boolean;
  qtyPropertyCard: boolean;
  qtyPhysicalCount: boolean;
  shortageQty: boolean;
  shortageValue: boolean;
  remarks: boolean;
}

const OFFICE_CATEGORIES: Record<string, string[]> = {
  "Municipal Engineering": [
    "Infrastructure Assets",
    "Construction Equipment",
    "ICT Equipment",
    "Office Equipment"
  ],
  "Engineering Office": [
    "Infrastructure Assets",
    "Construction Equipment",
    "ICT Equipment",
    "Office Equipment"
  ],
  "Health & Nutrition": [
    "Medical Equipment",
    "Health Equipment",
    "ICT Equipment",
    "Office Equipment"
  ],
  "Health Office (RHU)": [
    "Medical Equipment",
    "Health Equipment",
    "ICT Equipment",
    "Office Equipment"
  ],
  "Agriculture": [
    "Agricultural Equipment",
    "Office Equipment",
    "ICT Equipment"
  ],
  "Agriculture Office": [
    "Agricultural Equipment",
    "Office Equipment",
    "ICT Equipment"
  ],
  "MDRRMO": [
    "Safety Equipment",
    "Communication Equipment",
    "Transportation Equipment"
  ],
  "Accounting & Finance": [
    "Office Equipment",
    "ICT Equipment",
    "Furniture & Fixtures"
  ],
  "Accounting Office": [
    "Office Equipment",
    "ICT Equipment",
    "Furniture & Fixtures"
  ],
  "Mayor's Office": [
    "Office Equipment",
    "Furniture & Fixtures",
    "ICT Equipment"
  ],
  "Assessor's Office": [
    "Office Equipment",
    "ICT Equipment",
    "Furniture & Fixtures"
  ],
  "Planning & Development": [
    "Office Equipment",
    "ICT Equipment",
    "Furniture & Fixtures"
  ],
  "Information Technology": [
    "ICT Equipment",
    "Office Equipment",
    "Communication Equipment"
  ],
  "Social Welfare": [
    "Office Equipment",
    "ICT Equipment",
    "Safety Equipment"
  ]
};

const Reports: React.FC<ReportsProps> = ({ 
  items, 
  onReportSave,
  onUpdateItem,
  userRole,
  userOffice,
  userName,
  initialTab
}) => {
  const currentRole = userRole || 'ADMIN';
  const currentOffice = userOffice || '';
  const currentUserName = userName || 'System Admin';

  const getCategoriesForOffice = useCallback((office: string): string[] => {
    const standardCategories = [
      "Office Equipment",
      "Furniture & Fixtures",
      "ICT Equipment",
      "Buildings",
      "Machinery",
      "Transportation Equipment",
      "Other Assets"
    ];

    if (!office) {
      const allPredefined = Array.from(new Set(Object.values(OFFICE_CATEGORIES).flat() as string[]));
      const existing = items.map(i => i.category || '').filter(Boolean);
      return Array.from(new Set([...allPredefined, ...standardCategories, ...existing])).sort() as string[];
    }
    
    const matchedKey = Object.keys(OFFICE_CATEGORIES).find(k => 
      k.toLowerCase() === office.toLowerCase() ||
      office.toLowerCase().includes(k.toLowerCase()) ||
      k.toLowerCase().includes(office.toLowerCase())
    );
    
    const mappedCats = matchedKey ? OFFICE_CATEGORIES[matchedKey] : [];
    
    const officeItemsCats = items
      .filter(i => i.office && i.office.toLowerCase() === office.toLowerCase())
      .map(i => i.category || '')
      .filter(Boolean);

    return Array.from(new Set([
      ...mappedCats,
      ...officeItemsCats,
      ...standardCategories
    ])).sort() as string[];
  }, [items]);

  const [activeTab, setActiveTab] = useState<'generator' | 'archive' | 'transfers'>(initialTab || 'generator');

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);
  const [vaultSubTab, setVaultSubTab] = useState<string>(
    (currentRole === 'OFFICE_HEAD' || currentRole === 'ACCOUNTING') ? 'drafts' : 'all'
  );
  
  const [reportMode, setReportMode] = useState<string>(currentRole === 'ACCOUNTING' ? 'par' : 'appendix73');
  
  // Custom GAM Forms parameters
  const [spcStockNo, setSpcStockNo] = useState<string>('ST-2024-001');
  const [spcReorderLevel, setSpcReorderLevel] = useState<string>('50');
  const [spcUnitCost, setSpcUnitCost] = useState<number>(220.00);
  const [spcNotedBy, setSpcNotedBy] = useState<string>('MARIA S. REYES');
  
  const [splcStockNo, setSplcStockNo] = useState<string>('ST-2024-001');
  const [splcUnitCost, setSplcUnitCost] = useState<number>(220.00);
  const [splcAccountCode, setSplcAccountCode] = useState<string>('5020401002');
  const [splcApprovedBy, setSplcApprovedBy] = useState<string>('MARIA S. REYES');

  const [icsNo, setIcsNo] = useState<string>('ICS-2024-001');
  const [icsDateIssued, setIcsDateIssued] = useState<string>('Jan. 20, 2024');
  const [icsEmployeeName, setIcsEmployeeName] = useState<string>('JUAN DELA CRUZ');
  const [icsEmployeePosition, setIcsEmployeePosition] = useState<string>('Administrative Assistant III');
  const [icsIssuedBy, setIcsIssuedBy] = useState<string>('MARIA S. REYES');

  const [regsipPreparedBy, setRegsipPreparedBy] = useState<string>('MARIA S. REYES');
  const [regsipApprovedBy, setRegsipApprovedBy] = useState<string>('PEDRO L. SANTOS');

  const [itrNo, setItrNo] = useState<string>('ITR-2024-001');
  const [itrDate, setItrDate] = useState<string>('Feb. 10, 2024');
  const [itrFromTransferor, setItrFromTransferor] = useState<string>('JUAN DELA CRUZ');
  const [itrToTransferee, setItrToTransferee] = useState<string>('MARIA REYES');
  const [itrPurpose, setItrPurpose] = useState<string>('Transfer due to change in assignment');
  const [itrType, setItrType] = useState<string>('reassignment');
  const [itrTypeOthers, setItrTypeOthers] = useState<string>('');
  const [itrApprovedBy, setItrApprovedBy] = useState<string>('JUDGE B. CABRERA');
  const [itrApprovedPosition, setItrApprovedPosition] = useState<string>('Municipal Mayor');
  const [itrFromPosition, setItrFromPosition] = useState<string>('Supply Officer II / Property Custodian');
  const [itrToPosition, setItrToPosition] = useState<string>('Administrative Assistant III');

  const [rrspNo, setRrspNo] = useState<string>('RRSP-2024-001');
  const [rrspDate, setRrspDate] = useState<string>('Jan. 18, 2024');
  const [rrspAccountCode, setRrspAccountCode] = useState<string>('5020402002');
  const [rrspSupplier, setRrspSupplier] = useState<string>('ABC Office Supplies');
  const [rrspOrDvNo, setRrspOrDvNo] = useState<string>('OR 00123');
  const [rrspOrDvDate, setRrspOrDvDate] = useState<string>('Jan. 18, 2024');
  const [rrspReceivedBy, setRrspReceivedBy] = useState<string>('JUAN DELA CRUZ');
  const [rrspApprovedBy, setRrspApprovedBy] = useState<string>('PEDRO L. SANTOS');
  const [editingReportId, setEditingReportId] = useState<string | null>(null);
  const [savedReports, setSavedReports] = useState<GeneratedReport[]>([]);
  const [isFetching, setIsFetching] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isViewOnly, setIsViewOnly] = useState<boolean>(false);
  const [showColumnPicker, setShowColumnPicker] = useState(false);
  const [showAssetPicker, setShowAssetPicker] = useState(false);
  const [pickerOfficeFilter, setPickerOfficeFilter] = useState<string>('');
  const [pickerSelectedIds, setPickerSelectedIds] = useState<Set<string>>(new Set());

  // Dynamic Role-Based Access Control Rules
  const isFormAuthorized = useCallback((mode: string, role: string, viewOnly: boolean): boolean => {
    const overallReportModes = ['appendix73', 'reorder', 'levels', 'depreciation', 'allocation'];
    if (overallReportModes.includes(mode)) return true;

    if (role === 'ACCOUNTING') {
      // Accounting can ONLY access par and ics
      return ['par', 'ics'].includes(mode);
    } else {
      // Engineer/Admin (any non-Accounting role)
      if (['par', 'ics'].includes(mode)) {
        // Cannot create/edit, only view/review is allowed
        return viewOnly;
      }
      return ['spc', 'splc', 'regsip', 'itr', 'rrsp'].includes(mode);
    }
  }, []);

  const isAuthorized = isFormAuthorized(reportMode, currentRole, isViewOnly);

  useEffect(() => {
    if (!isAuthorized && reportMode) {
      const logViolation = async () => {
        try {
          await addDoc(collection(db, 'system_logs'), {
            timestamp: new Date(),
            user: currentUserName,
            action: `SECURITY VIOLATION (403 FORBIDDEN): User with role "${currentRole}" attempted unauthorized access to form [Mode: ${reportMode.toUpperCase()}]`,
            module: "Reporting",
            severity: "HIGH"
          });
          
          await addDoc(collection(db, 'access_logs'), {
            timestamp: serverTimestamp(),
            user: currentUserName,
            status: `403 FORBIDDEN: Unauthorized Form Access [Mode: ${reportMode.toUpperCase()}]`,
            device: navigator.userAgent.split(')')[0].split('(')[1] || 'Web Browser',
            ip: 'Cloud Node'
          });
        } catch (error) {
          console.error("Failed to log security violation:", error);
        }
      };
      logViolation();
    }
  }, [isAuthorized, reportMode, currentRole, currentUserName]);

  const [visibleFields, setVisibleFields] = useState<VisibleFields>({
    article: true,
    description: true,
    propertyNumber: true,
    condition: true,
    unitOfMeasure: true,
    unitValue: true,
    qtyPropertyCard: true,
    qtyPhysicalCount: true,
    shortageQty: true,
    shortageValue: true,
    remarks: true,
  });

  // --- Official Appendix 73 Metadata (As per Provided Image) ---
  const [reportType, setReportType] = useState<string>('ICT EQUIPMENT');
  const [fundCluster, setFundCluster] = useState<string>('01');
  const [reportDate, setReportDate] = useState<string>('June 30, 2024');
  const [accountablePerson, setAccountablePerson] = useState<string>(
    (currentRole === 'OFFICE_HEAD' || currentRole === 'ACCOUNTING') ? currentUserName : 'FATIMA BRAVO-HEPERTOR'
  );
  const [accountablePosition, setAccountablePosition] = useState<string>(
    (currentRole === 'OFFICE_HEAD' || currentRole === 'ACCOUNTING') 
      ? (currentRole === 'ACCOUNTING' ? 'Municipal Accountant' : 'Office Head') 
      : 'ACT. MUN. FIRE MARSHALL'
  );
  const [accountableLocation, setAccountableLocation] = useState<string>('Tibiao, Antique');
  const [accountabilityDate, setAccountabilityDate] = useState<string>('January 1, 2024');
  
  // --- Triple Signatories ---
  const [committeeChair, setCommitteeChair] = useState<string>('KLEMENS G. BANDOJA');
  const [headOfAgency, setHeadOfAgency] = useState<string>('KLEMENS G. BANDOJA');
  const [headPosition, setHeadPosition] = useState<string>('Municipal Mayor');
  const [coaRep, setCoaRep] = useState<string>('COA REPRESENTATIVE');

  const [reportRows, setReportRows] = useState<ReportRow[]>([]);
  const [auditNotes, setAuditNotes] = useState<string>('');
  const [reportOfficeFilter, setReportOfficeFilter] = useState<string>(
    (currentRole === 'OFFICE_HEAD' || currentRole === 'ACCOUNTING') ? currentOffice : ''
  );
  const [reportCategoryFilter, setReportCategoryFilter] = useState<string>('');
  const [isWorkstationMinimized, setIsWorkstationMinimized] = useState(false);
  const [zoomScale, setZoomScale] = useState<number>(1.0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const populateFromInventory = useCallback((forceOffice?: string, forceCategory?: string) => {
    const office = forceOffice !== undefined ? forceOffice : reportOfficeFilter;
    const category = forceCategory !== undefined ? forceCategory : reportCategoryFilter;

    let filteredItems = items;
    if (office) filteredItems = filteredItems.filter(i => i.office && i.office.toLowerCase() === office.toLowerCase());
    if (category) filteredItems = filteredItems.filter(i => i.category && i.category.toLowerCase() === category.toLowerCase());

    const rows = filteredItems.map(item => ({
      ...item,
      tempId: Math.random().toString(36).substr(2, 9),
      shortageQty: (item.qtyPropertyCard || 0) - (item.qtyPhysicalCount || 0),
      shortageValue: ((item.qtyPropertyCard || 0) - (item.qtyPhysicalCount || 0)) * (item.unitValue || 0)
    }));
    setReportRows(rows);
    
    const officeName = office ? office.toUpperCase() : 'ALL DEPARTMENTS';
    const catName = category ? category.toUpperCase() : 'GENERAL ASSETS';
    setReportType(`${officeName} - ${catName}`);
  }, [items, reportOfficeFilter, reportCategoryFilter, setReportType]);

  useEffect(() => {
    setIsFetching(true);
    const q = query(collection(db, 'reports'), orderBy('created_at', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetchedReports = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as GeneratedReport[];
      setSavedReports(fetchedReports);
      setIsFetching(false);
    }, (error) => {
      console.error('Fetch Error:', error);
      setIsFetching(false);
    });

    return () => unsubscribe();
  }, []);

  const [notifications, setNotifications] = useState<any[]>([]);

  useEffect(() => {
    const q = query(
      collection(db, 'notifications'),
      orderBy('timestamp', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setNotifications(list);
    }, (err) => {
      console.error("Notifications fetch error:", err);
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
      if (currentRole === 'ADMIN') {
        return n.recipientRole === 'ADMIN';
      }
      if (currentRole === 'OFFICE_HEAD') {
        return n.recipientRole === 'OFFICE_HEAD' && n.recipientOffice === currentOffice;
      }
      if (currentRole === 'ACCOUNTING') {
        return n.recipientRole === 'ACCOUNTING' || n.recipientRole === 'OFFICE_HEAD';
      }
      return false;
    });
  }, [notifications, currentRole, currentOffice]);

  const displayedReports = useMemo(() => {
    let list = savedReports;
    if (currentRole === 'OFFICE_HEAD' || currentRole === 'ACCOUNTING') {
      list = list.filter(r => r.submittedByOffice === currentOffice || r.senderName === currentUserName || r.accountable_person === currentUserName);
    }
    
    if (currentRole === 'ADMIN') {
      if (vaultSubTab === 'incoming') {
        return list.filter(r => r.forwardedAt && !r.isArchived);
      } else if (vaultSubTab === 'archived') {
        return list.filter(r => r.isArchived);
      } else {
        return list.filter(r => !r.isArchived);
      }
    } else if (currentRole === 'OFFICE_HEAD' || currentRole === 'ACCOUNTING') {
      if (vaultSubTab === 'forwarded') {
        return list.filter(r => r.forwardedAt);
      } else {
        return list.filter(r => !r.forwardedAt);
      }
    }
    return list;
  }, [savedReports, currentRole, currentOffice, currentUserName, vaultSubTab]);

  const initialSyncDoneRef = useRef(false);

  // Synchronize state and trigger immediate load for Office Heads/Accountants on mount/props load
  useEffect(() => {
    if ((currentRole === 'OFFICE_HEAD' || currentRole === 'ACCOUNTING') && currentOffice && !initialSyncDoneRef.current) {
      setReportOfficeFilter(currentOffice);
      const validCats = getCategoriesForOffice(currentOffice);
      const targetCategory = validCats[0] || '';
      setReportCategoryFilter(targetCategory);
      populateFromInventory(currentOffice, targetCategory);
      initialSyncDoneRef.current = true;
    }
  }, [currentRole, currentOffice, populateFromInventory, getCategoriesForOffice]);

  // Automatically update the active report rows when items or filters change (only if not viewing locked/archived report)
  useEffect(() => {
    if (!isViewOnly) {
      populateFromInventory(reportOfficeFilter, reportCategoryFilter);
    }
  }, [items, reportOfficeFilter, reportCategoryFilter, isViewOnly, populateFromInventory]);

  const handleForwardReport = async (reportId: string | null, manualPayload?: any) => {
    setIsSaving(true);
    try {
      const timestamp = new Date().toISOString();
      const existingReport = savedReports.find(r => r.id === reportId);
      
      const newHistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: timestamp,
        action: 'Submitted',
        details: `Official Report submitted to Engineer/Admin by ${currentRole === 'ACCOUNTING' ? 'Accountant' : 'Office Head'} ${currentUserName} (${currentOffice || 'Office Department'}).`
      };

      const history = existingReport 
        ? [...(existingReport.history || []), newHistoryItem]
        : [
            {
              id: Math.random().toString(36).substr(2, 9),
              timestamp: timestamp,
              action: 'Draft Created',
              details: `Official Report draft compiled by ${currentRole === 'ACCOUNTING' ? 'Accountant' : 'Office Head'} ${currentUserName}.`
            },
            newHistoryItem
          ];

      const updates = {
        forwardedAt: timestamp,
        submittedByOffice: currentOffice || (currentRole === 'ACCOUNTING' ? 'Accounting Office' : 'Office Head Dept'),
        senderName: currentUserName || (currentRole === 'ACCOUNTING' ? 'Accountant' : 'Office Head'),
        forwardedStatus: 'Pending' as const,
        status: 'Pending Approval' as const,
        history: history
      };

      let finalReportId = reportId;

      if (reportId) {
        // Report exists, update it 
        await updateDoc(doc(db, 'reports', reportId), updates);
      } else {
        // Saving brand-new on the fly
        const docRef = await addDoc(collection(db, 'reports'), {
          ...manualPayload,
          ...updates,
          created_at: serverTimestamp()
        });
        finalReportId = docRef.id;
        setEditingReportId(docRef.id);
      }

      // If this is an Accounting user or a PAR/ICS form, synchronize with 'requests' collection!
      const activeMode = (manualPayload?.reportMode || reportMode || '').toLowerCase();
      if (currentRole === 'ACCOUNTING' || activeMode === 'par' || activeMode === 'ics') {
        const itemRows = manualPayload?.items_snapshot || reportRows || [];
        const firstItemArticle = itemRows[0]?.article || (activeMode === 'par' ? 'Property Acknowledgement Receipt' : 'Inventory Custodian Slip');
        const rNumber = activeMode === 'par' 
          ? (manualPayload?.parNo || `PAR-${new Date().getFullYear()}-${finalReportId.substring(0, 4).toUpperCase()}`)
          : (manualPayload?.icsNo || icsNo || `ICS-${new Date().getFullYear()}-${finalReportId.substring(0, 4).toUpperCase()}`);

        const requestsQuery = query(collection(db, 'requests'), where('reportId', '==', finalReportId));
        const requestsSnapshot = await getDocs(requestsQuery);

        const requestPayload = {
          reportId: finalReportId,
          requestType: activeMode.toUpperCase(),
          requestNumber: rNumber,
          itemArticle: firstItemArticle,
          category: activeMode === 'par' ? 'Property Card' : 'Inventory Slip',
          quantity: itemRows.length || 1,
          justification: manualPayload?.audit_notes || auditNotes || 'Submitted for official administrative review.',
          office: currentOffice || 'Accounting Office',
          requestedBy: currentUserName || 'Accountant',
          requestedAt: timestamp,
          status: 'Pending Engineer/Admin Review',
          responseRemarks: '',
          items_snapshot: itemRows,
          history: [
            {
              id: Math.random().toString(36).substr(2, 9),
              timestamp: timestamp,
              action: 'Submitted',
              details: `Official ${activeMode.toUpperCase()} Form submitted by Accountant ${currentUserName}. Status: Pending Engineer/Admin Review.`
            }
          ]
        };

        if (!requestsSnapshot.empty) {
          const reqDocId = requestsSnapshot.docs[0].id;
          const oldHistory = requestsSnapshot.docs[0].data().history || [];
          await updateDoc(doc(db, 'requests', reqDocId), {
            ...requestPayload,
            history: [
              ...oldHistory,
              {
                id: Math.random().toString(36).substr(2, 9),
                timestamp: timestamp,
                action: 'Resubmitted',
                details: `Official ${activeMode.toUpperCase()} Form resubmitted by Accountant ${currentUserName}. Status: Pending Engineer/Admin Review.`
              }
            ]
          });
        } else {
          await addDoc(collection(db, 'requests'), requestPayload);
        }
      }

      // Add a real-time notification in the database for Engineer/Admin
      await addDoc(collection(db, 'notifications'), {
        recipientRole: 'ADMIN',
        message: `New Official Report "${manualPayload?.report_type || reportType}" has been submitted by ${currentUserName} (${currentOffice || 'Office Dept'}) and is awaiting review.`,
        timestamp: timestamp,
        isRead: false,
        type: 'SUBMISSION',
        reportId: finalReportId || 'new'
      });

      await addDoc(collection(db, 'system_logs'), {
        timestamp: new Date(),
        user: currentUserName,
        action: `Submitted official report: ${manualPayload?.report_type || reportType} to Engineer/Admin for review.`,
        module: "Reporting"
      });

      if (onReportSave) onReportSave();
      alert("Official Report successfully submitted to Engineer/Admin for review!");
      setActiveTab('archive');
      setEditingReportId(null);
    } catch (error) {
      console.error("Submission Error:", error);
      alert("Failed to submit official report.");
    } finally {
      setIsSaving(false);
    }
  };

  const addRow = () => {
    const newRow: ReportRow = {
      tempId: Math.random().toString(36).substr(2, 9),
      article: '',
      description: '',
      propertyNumber: '',
      unitOfMeasure: 'unit',
      unitValue: 0,
      qtyPropertyCard: 1,
      qtyPhysicalCount: 1,
      remarks: '',
      shortageQty: 0,
      shortageValue: 0
    };
    setReportRows([...reportRows, newRow]);
  };

  const deleteRow = (tempId: string) => {
    setReportRows(reportRows.filter(r => r.tempId !== tempId));
  };

  const updateCell = (tempId: string, field: keyof ReportRow, value: any) => {
    setReportRows(reportRows.map(row => {
      if (row.tempId === tempId) {
        const updated = { ...row, [field]: value };
        if (['qtyPhysicalCount', 'qtyPropertyCard', 'unitValue'].includes(field)) {
          const card = field === 'qtyPropertyCard' ? Number(value) : (row.qtyPropertyCard || 0);
          const phys = field === 'qtyPhysicalCount' ? Number(value) : (row.qtyPhysicalCount || 0);
          const val = field === 'unitValue' ? Number(value) : (row.unitValue || 0);
          updated.shortageQty = card - phys;
          updated.shortageValue = (card - phys) * val;
        }
        return updated;
      }
      return row;
    }));
  };

  const totalValue: number = useMemo(() => {
    return reportRows.reduce((sum: number, r) => sum + ((r.unitValue || 0) * (r.qtyPhysicalCount || 0)), 0);
  }, [reportRows]);

  useEffect(() => {
    if (reportMode === 'par') {
      const hasOfficial = reportRows.some(row => row.isFixed);
      if (!hasOfficial && reportRows.length <= 1) {
        console.log("[LGU Seeder] Prefilling reportRows with official MDRRMO inventory...");
        const mappedRows = OFFICIAL_LGU_INVENTORY.map(item => ({
          ...item,
          tempId: Math.random().toString(36).substr(2, 9),
          shortageQty: (item.qtyPropertyCard || 0) - (item.qtyPhysicalCount || 0),
          shortageValue: ((item.qtyPropertyCard || 0) - (item.qtyPhysicalCount || 0)) * (item.unitValue || 0)
        }));
        setReportRows(mappedRows);
        setReportType("MDRRMO PAR-ICS UNIFIED REGISTRY");
        setFundCluster("General Fund");
        setIcsNo("MDRRMO-PAR-2024-001");
        setIcsDateIssued("October 2024");
        setIcsEmployeeName("NORMAN I. ALABADO");
        setIcsEmployeePosition("LDRRMO II/ MDRRMO");
        setIcsIssuedBy("CLEMENS G. BANDOJA");
      }
    }
  }, [reportMode, reportRows.length]);

  const totalShortageValue: number = useMemo(() => {
    return reportRows.reduce((sum: number, r) => sum + (r.shortageValue || 0), 0);
  }, [reportRows]);

  const totalMunicipalValue: number = useMemo(() => {
    return items.reduce((sum: number, item) => sum + (item.qtyPhysicalCount * item.unitValue), 0);
  }, [items]);

  const calculateDepreciation = (item: InventoryItem) => {
    const cost = item.acquisitionCost || (item.unitValue * (item.qtyPhysicalCount || 1));
    const life = item.usefulLife || 5;
    let yearsOwned = 0;
    if (item.acquisitionDate) {
      const acqDate = new Date(item.acquisitionDate);
      const now = new Date();
      yearsOwned = (now.getTime() - acqDate.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
    } else if (item.yearPurchased) {
      const currentYear = new Date().getFullYear();
      yearsOwned = Math.max(0, currentYear - Number(item.yearPurchased));
    } else {
      yearsOwned = 1; // Default
    }
    const salvageValue = cost * 0.05; // 5% standard salvage rate for government sectors
    const depreciableCost = cost - salvageValue;
    const annualDepreciation = depreciableCost / life;
    const accumulated = Math.min(depreciableCost, annualDepreciation * yearsOwned);
    return {
      annual: annualDepreciation,
      accumulated: accumulated,
      bookValue: cost - accumulated,
      cost,
      salvageValue,
      depreciableCost,
      yearsOwned: Math.min(life, yearsOwned)
    };
  };

  const renderReportBody = () => {
    switch (reportMode) {
      case 'levels':
        return (
          <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-xl">
            <h3 className="text-lg font-black uppercase mb-6 flex items-center gap-2">
              <div className="w-2 h-6 bg-blue-600 rounded-full"></div>
              Current Inventory Levels
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <th className="pb-4 px-4">Article</th>
                    <th className="pb-4 px-4">Category</th>
                    <th className="pb-4 px-4">Office</th>
                    <th className="pb-4 px-4 text-right">Physical Count</th>
                    <th className="pb-4 px-4 text-right">Unit Value</th>
                    <th className="pb-4 px-4 text-right">Total Value</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {items.map(item => (
                    <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-all">
                      <td className="py-4 px-4 font-bold">{item.article}</td>
                      <td className="py-4 px-4 text-gray-500">{item.category}</td>
                      <td className="py-4 px-4 text-gray-500">{item.office}</td>
                      <td className="py-4 px-4 text-right font-black">{item.qtyPhysicalCount}</td>
                      <td className="py-4 px-4 text-right">₱{item.unitValue.toLocaleString()}</td>
                      <td className="py-4 px-4 text-right font-black text-blue-600">₱{(item.qtyPhysicalCount * item.unitValue).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'reorder':
        const criticalItems = items.filter(i => (i.qtyPhysicalCount || 0) <= (i.reorderPoint || 0));
        return (
          <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-xl">
            <h3 className="text-lg font-black uppercase mb-6 flex items-center gap-2 text-red-600">
              <div className="w-2 h-6 bg-red-600 rounded-full"></div>
              Items Below Reorder Point
            </h3>
            {criticalItems.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400">
                      <th className="pb-4 px-4">Article</th>
                      <th className="pb-4 px-4">Office</th>
                      <th className="pb-4 px-4 text-right">Current Qty</th>
                      <th className="pb-4 px-4 text-right">Reorder Point</th>
                      <th className="pb-4 px-4 text-right">Shortage</th>
                    </tr>
                  </thead>
                  <tbody className="text-sm">
                    {criticalItems.map(item => (
                      <tr key={item.id} className="border-b border-gray-50 bg-red-50/30">
                        <td className="py-4 px-4 font-bold">{item.article}</td>
                        <td className="py-4 px-4 text-gray-500">{item.office}</td>
                        <td className="py-4 px-4 text-right font-black text-red-600">{item.qtyPhysicalCount}</td>
                        <td className="py-4 px-4 text-right font-bold">{item.reorderPoint || 0}</td>
                        <td className="py-4 px-4 text-right font-black text-red-700">{(item.reorderPoint || 0) - (item.qtyPhysicalCount || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-20 text-center text-gray-400 uppercase font-black tracking-widest text-xs">All stock levels are healthy</div>
            )}
          </div>
        );
      case 'depreciation':
        return (
          <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-xl">
            <h3 className="text-lg font-black uppercase mb-6 flex items-center gap-2">
              <div className="w-2 h-6 bg-indigo-600 rounded-full"></div>
              Asset Depreciation Schedule
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-gray-100 text-[10px] font-black uppercase tracking-widest text-gray-400">
                    <th className="pb-4 px-4">Asset</th>
                    <th className="pb-4 px-4">Acq. Date</th>
                    <th className="pb-4 px-4 text-right">Cost</th>
                    <th className="pb-4 px-4 text-right">Life (Yrs)</th>
                    <th className="pb-4 px-4 text-right">Accum. Dep.</th>
                    <th className="pb-4 px-4 text-right">Book Value</th>
                  </tr>
                </thead>
                <tbody className="text-sm">
                  {items.filter(i => i.category?.toLowerCase() !== 'supplies' && i.category?.toLowerCase() !== 'office supplies').map(item => {
                    const dep = calculateDepreciation(item);
                    const dateStr = item.acquisitionDate || (item.yearPurchased ? `Year: ${item.yearPurchased}` : 'Initial Provision');
                    return (
                      <tr key={item.id} className="border-b border-gray-50 hover:bg-gray-50 transition-all">
                        <td className="py-4 px-4 font-bold">{item.article}</td>
                        <td className="py-4 px-4 text-gray-500">{dateStr}</td>
                        <td className="py-4 px-4 text-right font-bold">₱{dep.cost.toLocaleString()}</td>
                        <td className="py-4 px-4 text-right">{item.usefulLife || 5} yrs</td>
                        <td className="py-4 px-4 text-right text-red-600 font-bold">₱{dep.accumulated.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                        <td className="py-4 px-4 text-right font-black text-emerald-600">₱{dep.bookValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'allocation':
        const officeAllocation = items.reduce((acc, item) => {
          acc[item.office] = (acc[item.office] || 0) + (item.qtyPhysicalCount * item.unitValue);
          return acc;
        }, {} as Record<string, number>);
        return (
          <div className="bg-white p-8 rounded-3xl border border-gray-200 shadow-xl">
            <h3 className="text-lg font-black uppercase mb-6 flex items-center gap-2">
              <div className="w-2 h-6 bg-orange-600 rounded-full"></div>
              Resource Allocation by Office
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-4">
                {Object.entries(officeAllocation).sort((a: [string, number], b: [string, number]) => b[1] - a[1]).map(([office, value]) => {
                  const percentage = totalMunicipalValue > 0 ? ((value as number) / (totalMunicipalValue as number)) * 100 : 0;
                  return (
                    <div key={office} className="space-y-1">
                      <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                        <span>{office}</span>
                        <span>₱{value.toLocaleString()} ({percentage.toFixed(1)}%)</span>
                      </div>
                      <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-orange-500 transition-all duration-1000" style={{ width: `${percentage}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="bg-gray-50 p-8 rounded-[40px] border border-gray-100 flex flex-col items-center justify-center text-center">
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] mb-2">Total Municipal Asset Value</p>
                <h4 className="text-4xl font-black text-gray-900 tracking-tighter italic font-brand">₱{totalMunicipalValue.toLocaleString()}</h4>
                <div className="mt-6 flex gap-2">
                  <div className="px-4 py-2 bg-white rounded-2xl border border-gray-200 text-[9px] font-black uppercase tracking-widest text-gray-500">{items.length} Total Items</div>
                  <div className="px-4 py-2 bg-white rounded-2xl border border-gray-200 text-[9px] font-black uppercase tracking-widest text-gray-500">{Object.keys(officeAllocation).length} Offices</div>
                </div>
              </div>
            </div>
          </div>
        );
      default:
        return (
          <div className="relative group">
            {/* Scroll Navigation Cues (No-Print) */}
            <div className="no-print absolute left-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-12 h-12 bg-white/80 rounded-full shadow-2xl z-20 transition-all pointer-events-none opacity-0 group-hover:opacity-100 animate-pulse">
               <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M15 19l-7-7 7-7" /></svg>
            </div>
            <div className="no-print absolute right-4 top-1/2 -translate-y-1/2 flex items-center justify-center w-12 h-12 bg-white/80 rounded-full shadow-2xl z-20 transition-all pointer-events-none opacity-0 group-hover:opacity-100 animate-pulse">
               <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M9 5l7 7-7 7" /></svg>
            </div>

            {isViewOnly && (
              <div className="no-print mb-6 mx-8 p-4 bg-blue-50 border border-blue-200 text-blue-700 rounded-2xl flex items-center justify-between text-xs font-bold uppercase tracking-widest shadow-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-blue-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <span>Locked Archive — Viewing-only mode enabled</span>
                </div>
                <button 
                  onClick={() => setIsViewOnly(false)} 
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-all active:scale-95 text-[10px]"
                >
                  Enable Quick Draft Edit
                </button>
              </div>
            )}

            {/* Zoom Controls Bar */}
            <div className="no-print mb-6 mx-8 flex flex-col sm:flex-row items-center justify-between bg-white border border-gray-150 p-4 rounded-3xl shadow-sm gap-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" /></svg>
                </div>
                <div>
                  <h4 className="text-[10px] font-black uppercase text-gray-900 tracking-wider">Report Canvas Zoom</h4>
                  <p className="text-[8px] font-bold uppercase text-gray-400 tracking-widest mt-0.5">Adjust form scale on-screen</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => setZoomScale(prev => Math.max(0.4, Number((prev - 0.1).toFixed(1))))}
                  disabled={zoomScale <= 0.4}
                  className="w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-700 rounded-xl text-xs font-black transition-all active:scale-90 border border-gray-100"
                  title="Zoom Out"
                >
                  -
                </button>
                <div className="w-16 text-center text-xs font-black text-gray-700 tracking-tight">
                  {Math.round(zoomScale * 100)}%
                </div>
                <button 
                  onClick={() => setZoomScale(prev => Math.min(1.8, Number((prev + 0.1).toFixed(1))))}
                  disabled={zoomScale >= 1.8}
                  className="w-10 h-10 flex items-center justify-center bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-700 rounded-xl text-xs font-black transition-all active:scale-90 border border-gray-100"
                  title="Zoom In"
                >
                  +
                </button>
                <button 
                  onClick={() => setZoomScale(1.0)}
                  disabled={zoomScale === 1.0}
                  className="ml-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-[9px] font-black uppercase tracking-widest rounded-xl text-gray-600 transition-all active:scale-95"
                  title="Reset Zoom to 100%"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* Table Container with Horizontal Scroll */}
            <div 
              ref={scrollContainerRef}
              className="overflow-x-auto pb-12 custom-scrollbar bg-slate-50/50 rounded-[48px] p-8 border border-gray-100 shadow-inner flex justify-start"
            >
              {/* 13 INCH FOLIO CANVAS */}
              <div 
                id="report-canvas" 
                className="bg-white p-[0.7in] shadow-[0_30px_100px_-20px_rgba(0,0,0,0.2)] border border-gray-200 font-serif text-black leading-tight flex-shrink-0"
                style={{ width: '13in', minHeight: '8.5in', zoom: zoomScale }}
              >
                {!isAuthorized ? (
                  <div className="flex flex-col items-center justify-center p-12 text-center min-h-[350px]">
                    <div className="w-20 h-20 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-6 border border-red-200 shadow-sm">
                      <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <h2 className="font-brand font-black text-2xl uppercase text-gray-900 tracking-tight mb-2">403 FORBIDDEN</h2>
                    <h3 className="font-bold text-xs uppercase tracking-widest text-red-600 mb-4">Role-Based Access Control Violation</h3>
                    <p className="text-gray-500 font-medium text-xs max-w-md uppercase tracking-wider leading-relaxed mb-8">
                      Your authenticated role <span className="font-black text-gray-800 bg-gray-100 px-2 py-1 rounded-md">{currentRole}</span> is strictly prohibited from accessing, creating, or editing the <span className="font-black text-red-600 bg-red-50 px-2 py-1 rounded-md">{reportMode?.toUpperCase()}</span> form in the Registry Workstation.
                    </p>
                    <div className="flex gap-4">
                      <button
                        type="button"
                        onClick={() => setReportMode('appendix73')}
                        className="px-6 py-3 bg-gray-900 hover:bg-gray-800 text-white font-black text-[9px] uppercase tracking-widest rounded-2xl transition-all shadow-md active:scale-95 cursor-pointer"
                      >
                        Back to Appendix 73
                      </button>
                    </div>
                  </div>
                ) : ['appendix73', 'reorder', 'levels', 'depreciation', 'allocation'].includes(reportMode) ? (
                  <>
                    <div className="text-right italic font-bold text-[11pt] mb-4 uppercase tracking-tighter">Appendix 73</div>

                    <div className="text-center mb-12">
                     <h1 className="font-bold uppercase text-[16pt] tracking-tight leading-none mb-2">REPORT ON THE PHYSICAL COUNT OF PROPERTY, PLANT AND EQUIPMENT</h1>
                     <div className="text-[11pt] mb-4 italic">(Type of Property, Plant and Equipment)</div>
                     <div className="flex flex-col items-center">
                       {isViewOnly ? (
                         <span className="text-center font-bold text-[14pt] uppercase px-4 min-w-[600px] border-b border-black pb-1">
                           {reportType || 'CLASSIFICATION TYPE'}
                         </span>
                       ) : (
                         <input 
                           className="text-center bg-transparent border-b border-black focus:border-blue-500 focus:bg-blue-50/10 outline-none font-bold text-[14pt] uppercase px-4 min-w-[600px] transition-all" 
                           value={reportType} readOnly={true} tabIndex={-1} style={{ pointerEvents: 'none', cursor: 'not-allowed' }} 
                           onChange={e => setReportType(e.target.value.toUpperCase())} 
                           placeholder="CLASSIFICATION TYPE" 
                         />
                       )}
                       <div className="no-print text-[8pt] text-gray-400 font-bold uppercase mt-1 tracking-widest">(Type of Property, Plant and Equipment)</div>
                       <div className="flex items-center space-x-2 mt-6 text-[12pt]">
                         <span>As of</span>
                        <div className="inline-block relative">
                          {isViewOnly ? (
                            <span className="text-center font-bold px-4 w-72 border-b border-black inline-block text-[12pt]">
                              {reportDate || 'Date'}
                            </span>
                          ) : (
                            <input 
                              className="text-center bg-transparent border-b border-black focus:border-blue-500 outline-none font-bold px-4 w-72" 
                              value={reportDate} 
                              onChange={e => setReportDate(e.target.value)} 
                              placeholder="Date"
                            />
                          )}
                          <div className="no-print absolute top-full left-0 w-full text-center text-[7pt] text-gray-400 font-bold uppercase mt-1 tracking-widest leading-none">(Date of Report)</div>
                        </div>
                       </div>
                     </div>
                              {/* Fund Cluster & Accountability Header */}
                  <div className="space-y-4 mb-10 text-[12pt] leading-[1.8]">
                    <div className="flex items-baseline mb-4">
                      <span className="font-bold mr-2 text-[12pt]">Fund Cluster:</span>
                      <div className="inline-block relative min-w-[200px]">
                        {isViewOnly ? (
                          <span className="border-b border-black font-bold w-full px-1 text-left text-[12pt] inline-block">
                            {fundCluster || '01'}
                          </span>
                        ) : (
                          <input 
                            className="bg-transparent border-b border-black focus:border-blue-500 outline-none font-bold w-full px-1 text-left uppercase" 
                            value={fundCluster} 
                            onChange={e => setFundCluster(e.target.value.toUpperCase())} 
                            placeholder="01"
                          />
                        )}
                        <div className="no-print absolute top-full left-0 text-[7pt] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1 whitespace-nowrap">(UACS Code)</div>
                      </div>
                    </div>

                    <div className="text-justify leading-[2.8] font-medium text-[12pt]">
                      For which 
                      <div className="inline-block relative mx-1 min-w-[320px]">
                        {isViewOnly ? (
                          <span className="border-b border-black font-bold w-full text-center text-[12pt] inline-block uppercase">
                            {accountablePerson || 'NAME OF ACCOUNTABLE OFFICER'}
                          </span>
                        ) : (
                          <input 
                            className="bg-transparent border-b border-black focus:border-blue-500 outline-none font-bold w-full text-center uppercase translate-y-[2px]" 
                            value={accountablePerson} 
                            onChange={e => setAccountablePerson(e.target.value.toUpperCase())} 
                            placeholder="NAME OF ACCOUNTABLE OFFICER"
                          />
                        )}
                        <div className="no-print absolute top-full left-0 w-full text-center text-[7pt] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">(Accountable Person)</div>
                      </div>
                      , 
                      <div className="inline-block relative mx-1 min-w-[280px]">
                        {isViewOnly ? (
                          <span className="border-b border-black font-bold w-full text-center text-[12pt] inline-block uppercase">
                            {accountablePosition || 'DESIGNATION'}
                          </span>
                        ) : (
                          <input 
                            className="bg-transparent border-b border-black focus:border-blue-500 outline-none font-bold w-full text-center uppercase translate-y-[2px]" 
                            value={accountablePosition} 
                            onChange={e => setAccountablePosition(e.target.value.toUpperCase())} 
                            placeholder="DESIGNATION"
                          />
                        )}
                        <div className="no-print absolute top-full left-0 w-full text-center text-[7pt] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">(Position)</div>
                      </div>
                      , 
                      <div className="inline-block relative mx-1 min-w-[200px]">
                        {isViewOnly ? (
                          <span className="border-b border-black font-bold w-full text-center text-[12pt] inline-block">
                            {accountableLocation || 'MUNICIPALITY/LGU'}
                          </span>
                        ) : (
                          <input 
                            className="bg-transparent border-b border-black focus:border-blue-500 outline-none font-bold w-full text-center translate-y-[2px]" 
                            value={accountableLocation} 
                            onChange={e => setAccountableLocation(e.target.value)} 
                            placeholder="MUNICIPALITY/LGU"
                          />
                        )}
                        <div className="no-print absolute top-full left-0 w-full text-center text-[7pt] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">(Location/Entity)</div>
                      </div>
                      , is accountable, having assumed such accountability on 
                      <div className="inline-block relative mx-1 min-w-[200px]">
                        {isViewOnly ? (
                          <span className="border-b border-black font-bold w-full text-center text-[12pt] inline-block">
                            {accountabilityDate || 'MONTH DAY, YEAR'}
                          </span>
                        ) : (
                          <input 
                            className="bg-transparent border-b border-black focus:border-blue-500 outline-none font-bold w-full text-center translate-y-[2px]" 
                            value={accountabilityDate} 
                            onChange={e => setAccountabilityDate(e.target.value)} 
                            placeholder="MONTH DAY, YEAR"
                          />
                        )}
                        <div className="no-print absolute top-full left-0 w-full text-center text-[7pt] text-gray-400 font-bold uppercase tracking-widest leading-none mt-1">(Assumption Date)</div>
                      </div>.
                    </div>
                  </div>        </div>
                             {/* The Official Registry Table */}
                  <table className="w-full border-collapse border border-black text-[10pt]">
                    <thead>
                       <tr className="font-bold uppercase text-center">
                          <th className="border border-black px-0.5 py-2 w-12" rowSpan={2}>No.</th>
                          {visibleFields.article && <th className="border border-black px-0.5 py-2 w-40" rowSpan={2}>ARTICLE</th>}
                          {visibleFields.description && <th className="border border-black px-0.5 py-2" rowSpan={2}>DESCRIPTION</th>}
                          {visibleFields.propertyNumber && <th className="border border-black px-0.5 py-2 w-36" rowSpan={2}>PROPERTY NUMBER</th>}
                           {visibleFields.condition && <th className="border border-black px-0.5 py-2 w-32" rowSpan={2}>CONDITION</th>}
                          {visibleFields.unitOfMeasure && <th className="border border-black px-0.5 py-2 w-28" rowSpan={2}>UNIT OF MEASURE</th>}
                          {visibleFields.unitValue && <th className="border border-black px-0.5 py-2 w-40" rowSpan={2}>UNIT VALUE</th>}
                          {(visibleFields.qtyPropertyCard || visibleFields.qtyPhysicalCount) && (
                            <th className="border border-black px-0.5 py-1 text-[9pt]" colSpan={(visibleFields.qtyPropertyCard ? 1 : 0) + (visibleFields.qtyPhysicalCount ? 1 : 0)}>QUANTITY</th>
                          )}
                          {(visibleFields.shortageQty || visibleFields.shortageValue) && (
                            <th className="border border-black px-0.5 py-1 text-[9pt]" colSpan={(visibleFields.shortageQty ? 1 : 0) + (visibleFields.shortageValue ? 1 : 0)}>SHORTAGE/OVERAGE</th>
                          )}
                          {visibleFields.remarks && <th className="border border-black px-0.5 py-2 w-48" rowSpan={2}>REMARKS</th>}
                          {!isViewOnly && <th className="border border-black p-2 w-10 no-print" rowSpan={2}></th>}
                       </tr>
                       <tr className="font-bold text-[8pt] text-center">
                          {visibleFields.qtyPropertyCard && <th className="border border-black px-0.5 py-1 w-28">per PROPERTY CARD</th>}
                          {visibleFields.qtyPhysicalCount && <th className="border border-black px-0.5 py-1 w-28">per PHYSICAL COUNT</th>}
                          {visibleFields.shortageQty && <th className="border border-black px-0.5 py-1 w-24">Quantity</th>}
                          {visibleFields.shortageValue && <th className="border border-black px-0.5 py-1 w-36">Value</th>}
                       </tr>
                    </thead>
                    <tbody>
                       {reportRows.map((row, idx) => (
                         <tr key={row.tempId} className="group hover:bg-blue-50/30 transition-all">
                            <td className="border border-black text-center font-bold py-2 px-0">{idx + 1}</td>
                            {visibleFields.article && (
                              <td className="border border-black px-0.5 py-2">
                                {isViewOnly ? (
                                  <span className="w-full font-bold uppercase block px-1 text-xs">
                                    {row.article || '-'}
                                  </span>
                                ) : (
                                  <input 
                                    className="w-full bg-transparent outline-none font-bold uppercase placeholder:font-normal placeholder:italic" 
                                    value={row.article} 
                                    onChange={e => updateCell(row.tempId, 'article', e.target.value)} 
                                    placeholder="Article..."
                                  />
                                )}
                              </td>
                            )}
                            {visibleFields.description && (
                              <td className="border border-black px-0.5 py-2">
                                {isViewOnly ? (
                                  <div className="w-full whitespace-pre-wrap break-words text-xs px-1">
                                    {row.description || '-'}
                                  </div>
                                ) : (
                                  <textarea 
                                    rows={1} 
                                    className="w-full bg-transparent outline-none resize-none overflow-hidden" 
                                    value={row.description} 
                                    onChange={e => updateCell(row.tempId, 'description', e.target.value)} 
                                    placeholder="Specification..."
                                  />
                                )}
                              </td>
                            )}
                            {visibleFields.propertyNumber && (
                              <td className="border border-black px-0.5 py-2">
                                {isViewOnly ? (
                                  <span className="w-full text-center font-mono text-[9.5pt] block">
                                    {row.propertyNumber || '-'}
                                  </span>
                                ) : (
                                  <input 
                                    className="w-full bg-transparent outline-none text-center font-mono text-[9.5pt]" 
                                    value={row.propertyNumber} 
                                    onChange={e => updateCell(row.tempId, 'propertyNumber', e.target.value)} 
                                    placeholder="ID-000"
                                  />
                                )}
                              </td>
                            )}
                            {visibleFields.condition && (
                              <td className="border border-black px-0.5 py-2">
                                {isViewOnly ? (
                                  <span className="w-full text-center font-bold text-[9.5pt] block">
                                    {row.condition || 'New'}
                                  </span>
                                ) : (
                                  <select 
                                    className="w-full bg-transparent outline-none text-center font-bold text-[9.5pt]" 
                                    value={row.condition || 'New'} 
                                    onChange={e => updateCell(row.tempId, 'condition', e.target.value)} 
                                  >
                                    {['New', 'Good', 'Fair', 'Poor', 'Damaged', 'Under Repair', 'Condemned', 'Lost'].map(opt => (
                                      <option key={opt} value={opt} className="text-black font-semibold">{opt}</option>
                                    ))}
                                  </select>
                                )}
                              </td>
                            )}
                            {visibleFields.unitOfMeasure && (
                              <td className="border border-black px-0.5 py-2">
                                {isViewOnly ? (
                                  <span className="w-full text-center block">
                                    {row.unitOfMeasure || '-'}
                                  </span>
                                ) : (
                                  <input 
                                    className="w-full bg-transparent outline-none text-center" 
                                    value={row.unitOfMeasure} 
                                    onChange={e => updateCell(row.tempId, 'unitOfMeasure', e.target.value)} 
                                  />
                                )}
                              </td>
                            )}
                            {visibleFields.unitValue && (
                              <td className="border border-black px-0.5 py-2">
                                {isViewOnly ? (
                                  <span className="w-full text-right font-bold block pr-2">
                                    {row.unitValue !== undefined && row.unitValue !== null ? `₱ ${Number(row.unitValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                  </span>
                                ) : (
                                  <input 
                                    type="number" 
                                    className="w-full bg-transparent outline-none text-right font-bold" 
                                    value={row.unitValue} 
                                    onChange={e => updateCell(row.tempId, 'unitValue', e.target.value)} 
                                  />
                                )}
                              </td>
                            )}
                            {visibleFields.qtyPropertyCard && (
                              <td className="border border-black px-0.5 py-2">
                                {isViewOnly ? (
                                  <span className="w-full text-center block font-bold">
                                    {row.qtyPropertyCard !== undefined && row.qtyPropertyCard !== null ? row.qtyPropertyCard : '-'}
                                  </span>
                                ) : (
                                  <input 
                                    type="number" 
                                    className="w-full bg-transparent outline-none text-center" 
                                    value={row.qtyPropertyCard} 
                                    onChange={e => updateCell(row.tempId, 'qtyPropertyCard', e.target.value)} 
                                  />
                                )}
                              </td>
                            )}
                            {visibleFields.qtyPhysicalCount && (
                              <td className="border border-black px-0.5 py-2">
                                {isViewOnly ? (
                                  <span className="w-full text-center font-black block">
                                    {row.qtyPhysicalCount !== undefined && row.qtyPhysicalCount !== null ? row.qtyPhysicalCount : '-'}
                                  </span>
                                ) : (
                                  <input 
                                    type="number" 
                                    className="w-full bg-transparent outline-none text-center font-black" 
                                    value={row.qtyPhysicalCount} 
                                    onChange={e => updateCell(row.tempId, 'qtyPhysicalCount', e.target.value)} 
                                  />
                                )}
                              </td>
                            )}
                            {visibleFields.shortageQty && (
                              <td className={`border border-black px-0.5 py-2 text-center font-black ${row.shortageQty && row.shortageQty > 0 ? 'text-red-700' : row.shortageQty && row.shortageQty < 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                                {row.shortageQty && row.shortageQty > 0 ? `(${row.shortageQty})` : row.shortageQty && row.shortageQty < 0 ? `+${Math.abs(row.shortageQty)}` : '-'}
                              </td>
                            )}
                            {visibleFields.shortageValue && (
                              <td className={`border border-black px-0.5 py-2 text-right font-black ${row.shortageValue && row.shortageValue > 0 ? 'text-red-700' : row.shortageValue && row.shortageValue < 0 ? 'text-emerald-700' : 'text-gray-400'}`}>
                                {row.shortageValue && row.shortageValue !== 0 ? `₱ ${Math.abs(row.shortageValue).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                              </td>
                            )}
                            {visibleFields.remarks && (
                              <td className="border border-black px-0.5 py-2">
                                {isViewOnly ? (
                                  <span className="w-full italic text-[9pt] block px-1">
                                    {row.remarks || '-'}
                                  </span>
                                ) : (
                                  <input 
                                    className="w-full bg-transparent outline-none italic text-[9pt]" 
                                    value={row.remarks} 
                                    onChange={e => updateCell(row.tempId, 'remarks', e.target.value)} 
                                  />
                                )}
                              </td>
                            )}
                            {!isViewOnly && (
                              <td className="border border-black p-2 text-center no-print">
                                 <button onClick={() => deleteRow(row.tempId)} className="text-red-300 hover:text-red-600 transition-colors opacity-0 group-hover:opacity-100">
                                   <svg className="w-4 h-4 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                 </button>
                              </td>
                            )}
                         </tr>
                       ))}
                       {/* Calculation Summary Row (Reference Image Alignment) */}
                       <tr className="font-black bg-gray-50/50">
                          <td className="border border-black px-1 py-3 text-center uppercase tracking-tighter" colSpan={1 + (visibleFields.article ? 1 : 0) + (visibleFields.description ? 1 : 0) + (visibleFields.propertyNumber ? 1 : 0) + (visibleFields.condition ? 1 : 0) + (visibleFields.unitOfMeasure ? 1 : 0)}>
                            TOTAL ASSET VALUE
                          </td>
                          {visibleFields.unitValue && (
                            <td className="border border-black px-1 py-3 text-right text-[11pt] font-black">
                               {reportRows.reduce((s, r) => s + (Number(r.unitValue) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          )}
                          {(visibleFields.qtyPropertyCard || visibleFields.qtyPhysicalCount || visibleFields.shortageQty) && (
                            <td className="border border-black px-1 py-3 text-center text-[8pt] text-gray-500 italic" colSpan={(visibleFields.qtyPropertyCard ? 1 : 0) + (visibleFields.qtyPhysicalCount ? 1 : 0) + (visibleFields.shortageQty ? 1 : 0)}>
                               {totalShortageValue !== 0 && (
                                 <span>Net Shortage Value: ₱ {totalShortageValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                               )}
                            </td>
                          )}
                          {visibleFields.shortageValue && (
                            <td className="border border-black px-1 py-3 text-right font-black text-[11pt] text-blue-800 bg-blue-50/20">
                               {totalValue === 0 ? '-' : totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </td>
                          )}
                          <td className="border border-black px-1 py-3" colSpan={(visibleFields.remarks ? 1 : 0) + (isViewOnly ? 0 : 1)}></td>
                       </tr>
                       {/* Signatories Row directly in Table */}
                       <tr>
                          <td className="border border-black p-0" colSpan={1 + (visibleFields.article ? 1 : 0) + (visibleFields.description ? 1 : 0) + (visibleFields.propertyNumber ? 1 : 0) + (visibleFields.condition ? 1 : 0) + (visibleFields.unitOfMeasure ? 1 : 0) + (visibleFields.unitValue ? 1 : 0) + (visibleFields.qtyPropertyCard ? 1 : 0) + (visibleFields.qtyPhysicalCount ? 1 : 0) + (visibleFields.shortageQty ? 1 : 0) + (visibleFields.shortageValue ? 1 : 0) + (visibleFields.remarks ? 1 : 0) + (isViewOnly ? 0 : 1)}>
                             <div className="grid grid-cols-3 divide-x divide-transparent print:divide-transparent">
                               <div className="flex flex-col min-h-[180px] p-4 text-left">
                                 <div className="font-bold italic text-[11pt] mb-12 text-gray-800">Certified Correct by:</div>
                                 <div className="text-center mt-auto">
                                   {isViewOnly ? (
                                     <div className="w-full border-b border-black text-center font-black uppercase mb-1 text-[12pt] tracking-tight min-h-[28px] flex items-center justify-center">
                                       {committeeChair || 'NAME OF CHAIR'}
                                     </div>
                                   ) : (
                                     <input 
                                       className="w-full bg-transparent border-b border-black text-center font-black uppercase outline-none mb-1 text-[12pt] tracking-tight" 
                                       value={committeeChair} 
                                       onChange={e => setCommitteeChair(e.target.value.toUpperCase())} 
                                       placeholder="NAME OF CHAIR"
                                     />
                                   )}
                                   <p className="text-[7.5pt] leading-tight font-black uppercase tracking-widest text-gray-500 underline decoration-gray-400 decoration-dotted">Signature over Printed Name of Inventory Committee Chair and Members</p>
                                 </div>
                               </div>
                               <div className="flex flex-col min-h-[180px] p-4 text-left border-l border-black/5 print:border-none">
                                 <div className="font-bold italic text-[11pt] mb-12 text-gray-800">Approved by:</div>
                                 <div className="text-center mt-auto">
                                   {isViewOnly ? (
                                     <div className="w-full border-b border-black text-center font-black uppercase mb-1 text-[12pt] tracking-tight min-h-[28px] flex items-center justify-center">
                                       {headOfAgency || 'NAME OF HEAD'}
                                     </div>
                                   ) : (
                                     <input 
                                       className="w-full bg-transparent border-b border-black text-center font-black uppercase outline-none mb-1 text-[12pt] tracking-tight" 
                                       value={headOfAgency} 
                                       onChange={e => setHeadOfAgency(e.target.value.toUpperCase())} 
                                       placeholder="NAME OF HEAD"
                                     />
                                   )}
                                   <p className="text-[7.5pt] leading-tight font-black uppercase tracking-widest text-gray-500 underline decoration-gray-400 decoration-dotted">Signature over Printed Name of Head of Agency/Entity or Authorized Representative</p>
                                 </div>
                               </div>
                               <div className="flex flex-col min-h-[180px] p-4 text-left border-l border-black/5 print:border-none">
                                 <div className="font-bold italic text-[11pt] mb-12 text-gray-800">Verified by:</div>
                                 <div className="text-center mt-auto">
                                   {isViewOnly ? (
                                     <div className="w-full border-b border-black text-center font-black uppercase mb-1 text-[12pt] tracking-tight min-h-[28px] flex items-center justify-center">
                                       {coaRep || 'NAME OF COA REP.'}
                                     </div>
                                   ) : (
                                     <input 
                                       className="w-full bg-transparent border-b border-black text-center font-black uppercase outline-none mb-1 text-[12pt] tracking-tight" 
                                       value={coaRep} 
                                       onChange={e => setCoaRep(e.target.value.toUpperCase())} 
                                       placeholder="NAME OF COA REP."
                                     />
                                   )}
                                   <p className="text-[7.5pt] leading-tight font-black uppercase tracking-widest text-gray-500 underline decoration-gray-400 decoration-dotted">Signature over Printed Name of COA Representative</p>
                                  </div>
                                </div>
                              </div>
                           </td>
                        </tr>
                     </tbody>
                  </table>
                  </>
                ) : (
                  <div className="space-y-6">
                    <GAMFormsEditor
                      isViewOnly={isViewOnly}
                      reportMode={reportMode}
                      userRole={currentRole}
                      reportRows={reportRows}
                      reportType={reportType}
                      setReportType={setReportType}
                      reportDate={reportDate}
                      setReportDate={setReportDate}
                      fundCluster={fundCluster}
                      setFundCluster={setFundCluster}
                      updateCell={updateCell}
                      spcStockNo={spcStockNo}
                      setSpcStockNo={setSpcStockNo}
                      spcReorderLevel={spcReorderLevel}
                      setSpcReorderLevel={setSpcReorderLevel}
                      spcUnitCost={spcUnitCost}
                      setSpcUnitCost={setSpcUnitCost}
                      spcNotedBy={spcNotedBy}
                      setSpcNotedBy={setSpcNotedBy}
                      splcStockNo={splcStockNo}
                      setSplcStockNo={setSplcStockNo}
                      splcUnitCost={splcUnitCost}
                      setSplcUnitCost={setSplcUnitCost}
                      splcAccountCode={splcAccountCode}
                      setSplcAccountCode={setSplcAccountCode}
                      splcApprovedBy={splcApprovedBy}
                      setSplcApprovedBy={setSplcApprovedBy}
                      icsNo={icsNo}
                      setIcsNo={setIcsNo}
                      icsDateIssued={icsDateIssued}
                      setIcsDateIssued={setIcsDateIssued}
                      icsEmployeeName={icsEmployeeName}
                      setIcsEmployeeName={setIcsEmployeeName}
                      icsEmployeePosition={icsEmployeePosition}
                      setIcsEmployeePosition={setIcsEmployeePosition}
                      icsIssuedBy={icsIssuedBy}
                      setIcsIssuedBy={setIcsIssuedBy}
                      onAddRow={(type) => {
                        const newRow = {
                          tempId: Math.random().toString(36).substr(2, 9),
                          article: '',
                          description: '',
                          propertyNumber: type === 'ics' ? 'LGU-MDRRMO-ICS-PENDING' : 'LGU-MDRRMO-PAR-PENDING',
                          unitOfMeasure: 'unit',
                          unitValue: 0,
                          qtyPropertyCard: 1,
                          qtyPhysicalCount: 1,
                          remarks: '',
                          shortageQty: 0,
                          shortageValue: 0
                        };
                        setReportRows([...reportRows, newRow]);
                      }}
                      onDeleteRow={(tempId) => {
                        const row = reportRows.find(r => r.tempId === tempId);
                        if (row && row.isFixed) {
                          alert("This is part of the official MDRRMO baseline inventory data and cannot be deleted.");
                          return;
                        }
                        setReportRows(reportRows.filter(r => r.tempId !== tempId));
                      }}
                      regsipPreparedBy={regsipPreparedBy}
                      setRegsipPreparedBy={setRegsipPreparedBy}
                      regsipApprovedBy={regsipApprovedBy}
                      setRegsipApprovedBy={setRegsipApprovedBy}
                      itrNo={itrNo}
                      setItrNo={setItrNo}
                      itrDate={itrDate}
                      setItrDate={setItrDate}
                      itrFromTransferor={itrFromTransferor}
                      setItrFromTransferor={setItrFromTransferor}
                      itrToTransferee={itrToTransferee}
                      setItrToTransferee={setItrToTransferee}
                      itrPurpose={itrPurpose}
                      setItrPurpose={setItrPurpose}
                      itrType={itrType}
                      setItrType={setItrType}
                      itrTypeOthers={itrTypeOthers}
                      setItrTypeOthers={setItrTypeOthers}
                      itrApprovedBy={itrApprovedBy}
                      setItrApprovedBy={setItrApprovedBy}
                      itrApprovedPosition={itrApprovedPosition}
                      setItrApprovedPosition={setItrApprovedPosition}
                      itrFromPosition={itrFromPosition}
                      setItrFromPosition={setItrFromPosition}
                      itrToPosition={itrToPosition}
                      setItrToPosition={setItrToPosition}
                      rrspNo={rrspNo}
                      setRrspNo={setRrspNo}
                      rrspDate={rrspDate}
                      setRrspDate={setRrspDate}
                      rrspAccountCode={rrspAccountCode}
                      setRrspAccountCode={setRrspAccountCode}
                      rrspSupplier={rrspSupplier}
                      setRrspSupplier={setRrspSupplier}
                      rrspOrDvNo={rrspOrDvNo}
                      setRrspOrDvNo={setRrspOrDvNo}
                      rrspOrDvDate={rrspOrDvDate}
                      setRrspOrDvDate={setRrspOrDvDate}
                      rrspReceivedBy={rrspReceivedBy}
                      setRrspReceivedBy={setRrspReceivedBy}
                      rrspApprovedBy={rrspApprovedBy}
                      setRrspApprovedBy={setRrspApprovedBy}
                    />
                  </div>
                )}

                  {/* Printable Audit Notes */}
                  {auditNotes && (
                    <div className="mt-8 pt-6 border-t border-black/10 text-left print:break-inside-avoid">
                      <h4 className="font-sans font-black text-[10.5pt] uppercase text-gray-950 tracking-wider mb-2">
                        Official Audit Notes & Findings
                      </h4>
                      <p className="text-[10pt] text-gray-800 leading-relaxed font-sans whitespace-pre-wrap italic bg-slate-50/50 p-4 rounded-2xl border border-gray-100">
                        "{auditNotes}"
                      </p>
                      {editingReportId && savedReports.find(r => r.id === editingReportId)?.auditNotesDetail && (() => {
                        const detail = savedReports.find(r => r.id === editingReportId)!.auditNotesDetail!;
                        return (
                          <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-[8pt] font-mono text-gray-500 font-semibold uppercase tracking-wider">
                            <span>Saved: {new Date(detail.savedAt || detail.lastModified).toLocaleString()}</span>
                            <span>Created By: {detail.createdBy}</span>
                            <span>Dept: {detail.office}</span>
                            <span>Session ID: {detail.auditSession}</span>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                  <table className="hidden">
                    <tbody>
                      <tr>
                        <td>
                          <div>
                            <div>
                              <div>
                                 </div>
                               </div>
                             </div>
                          </td>
                       </tr>
                    </tbody>
                 </table>


              </div>
            </div>
          </div>
        );
    }
  };

  const handleLockArchive = async (status: 'Draft' | 'Finalized' = 'Finalized') => {
    const isAuthorizedToSave = isFormAuthorized(reportMode, currentRole, false);
    if (!isAuthorizedToSave) {
      alert("HTTP 403 Forbidden: You are not authorized to save drafts or finalize this form.");
      return;
    }
    setIsSaving(true);
    const timestamp = new Date().toISOString();
    const existingReport = editingReportId ? savedReports.find(r => r.id === editingReportId) : null;
    
    let history = existingReport ? (existingReport.history || []) : [];

    const actionText = status === 'Draft' ? 'Draft Saved' : 'Report Finalized';
    const detailText = status === 'Draft' 
      ? `Report draft updated by ${currentUserName} (${currentOffice || 'Office Department'}).`
      : `Report finalized and archived by ${currentUserName} (${currentOffice || 'Office Department'}).`;

    history = [
      ...history,
      {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: timestamp,
        action: actionText,
        details: detailText
      }
    ];

    const reportPayload = {
      report_type: reportType,
      fund_cluster: fundCluster,
      report_date: reportDate,
      accountable_person: accountablePerson,
      accountable_position: accountablePosition,
      accountability_date: accountabilityDate,
      committee_chair: committeeChair,
      head_of_agency: headOfAgency,
      head_position: headPosition,
      coa_rep: coaRep,
      total_value: totalValue,
      item_count: reportRows.length,
      items_snapshot: reportRows,
      status: status,
      history: history,
      audit_notes: auditNotes,
      
      // Custom GAM parameters
      reportMode: reportMode,
      spcStockNo,
      spcReorderLevel,
      spcUnitCost,
      spcNotedBy,
      splcStockNo,
      splcUnitCost,
      splcAccountCode,
      splcApprovedBy,
      icsNo,
      icsDateIssued,
      icsEmployeeName,
      icsEmployeePosition,
      icsIssuedBy,
      regsipPreparedBy,
      regsipApprovedBy,
      itrNo,
      itrDate,
      itrFromTransferor,
      itrToTransferee,
      itrPurpose,
      itrType,
      itrTypeOthers,
      itrApprovedBy,
      itrApprovedPosition,
      itrFromPosition,
      itrToPosition,
      rrspNo,
      rrspDate,
      rrspAccountCode,
      rrspSupplier,
      rrspOrDvNo,
      rrspOrDvDate,
      rrspReceivedBy,
      rrspApprovedBy,

      auditNotesDetail: auditNotes ? {
        notes: auditNotes,
        savedAt: existingReport?.auditNotesDetail?.savedAt || timestamp,
        createdBy: existingReport?.auditNotesDetail?.createdBy || currentUserName || 'Unknown Auditor',
        office: reportOfficeFilter || 'GENERAL SYSTEM',
        propertyType: reportCategoryFilter || reportType || 'GENERAL ASSETS',
        auditSession: editingReportId ? `Session-${editingReportId.substring(0,6).toUpperCase()}` : `Session-${Math.random().toString(36).substr(2,6).toUpperCase()}`,
        lastModified: timestamp
      } : (existingReport?.auditNotesDetail || null),
      created_at: existingReport ? (existingReport.created_at || serverTimestamp()) : serverTimestamp()
    };

    try {
      if (editingReportId) {
        await updateDoc(doc(db, 'reports', editingReportId), reportPayload);
      } else {
        const newDocRef = await addDoc(collection(db, 'reports'), reportPayload);
        setEditingReportId(newDocRef.id);
      }
      
      await addDoc(collection(db, 'system_logs'), {
        timestamp: new Date(),
        user: currentUserName,
        action: status === 'Draft' 
          ? `Saved draft of form/report: ${reportType || 'GENERAL'} [Mode: ${reportMode?.toUpperCase()}]` 
          : `Finalized and archived form/report: ${reportType || 'GENERAL'} [Mode: ${reportMode?.toUpperCase()}]`,
        module: "Reporting"
      });

      if (onReportSave) onReportSave();
      alert(status === 'Draft' ? 'Draft successfully saved to Vault.' : 'Audit successfully locked in the vault.');
      setActiveTab('archive');
      setEditingReportId(null);
    } catch (err) {
      console.error(err);
      alert('Transmission failed. Check network.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAuditNotes = async (notesText: string) => {
    setIsSaving(true);
    const timestamp = new Date().toISOString();
    const existingReport = editingReportId ? savedReports.find(r => r.id === editingReportId) : null;
    
    // History trace log
    let history = existingReport ? (existingReport.history || []) : [];
    history = [
      ...history,
      {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: timestamp,
        action: 'Audit Notes Saved',
        details: `Audit notes explicitly saved/updated by ${currentUserName}. Office Associated: ${reportOfficeFilter || 'All Office Depts'}. Property Type: ${reportCategoryFilter || reportType || 'General Assets'}.`
      }
    ];

    const notesPayloadObj = {
      notes: notesText,
      savedAt: existingReport?.auditNotesDetail?.savedAt || timestamp,
      createdBy: existingReport?.auditNotesDetail?.createdBy || currentUserName || 'Unknown Auditor',
      office: reportOfficeFilter || 'GENERAL SYSTEM',
      propertyType: reportCategoryFilter || reportType || 'GENERAL ASSETS',
      auditSession: editingReportId ? `Session-${editingReportId.substring(0,6).toUpperCase()}` : `Session-${Math.random().toString(36).substr(2,6).toUpperCase()}`,
      lastModified: timestamp
    };

    const reportPayload = {
      report_type: reportType || 'NEW AUDIT',
      fund_cluster: fundCluster || '01',
      report_date: reportDate || new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      accountable_person: accountablePerson || 'UNASSIGNED',
      accountable_position: accountablePosition || 'Auditor',
      accountability_date: accountabilityDate || '',
      committee_chair: committeeChair || 'Committee Chair',
      head_of_agency: headOfAgency || 'Head of Agency',
      head_position: headPosition || 'Municipal Mayor',
      coa_rep: coaRep || 'COA Representative',
      total_value: totalValue,
      item_count: reportRows.length,
      items_snapshot: reportRows,
      status: (existingReport ? existingReport.status : 'Draft') as any,
      history: history,
      audit_notes: notesText,
      auditNotesDetail: notesPayloadObj,

      // Custom GAM parameters
      reportMode: reportMode,
      spcStockNo,
      spcReorderLevel,
      spcUnitCost,
      spcNotedBy,
      splcStockNo,
      splcUnitCost,
      splcAccountCode,
      splcApprovedBy,
      icsNo,
      icsDateIssued,
      icsEmployeeName,
      icsEmployeePosition,
      icsIssuedBy,
      regsipPreparedBy,
      regsipApprovedBy,
      itrNo,
      itrDate,
      itrFromTransferor,
      itrToTransferee,
      itrPurpose,
      itrType,
      itrTypeOthers,
      itrApprovedBy,
      itrApprovedPosition,
      itrFromPosition,
      itrToPosition,
      rrspNo,
      rrspDate,
      rrspAccountCode,
      rrspSupplier,
      rrspOrDvNo,
      rrspOrDvDate,
      rrspReceivedBy,
      rrspApprovedBy,

      created_at: existingReport ? (existingReport.created_at || serverTimestamp()) : serverTimestamp()
    };

    try {
      if (editingReportId) {
        await updateDoc(doc(db, 'reports', editingReportId), reportPayload);
      } else {
        const newDocRef = await addDoc(collection(db, 'reports'), reportPayload);
        setEditingReportId(newDocRef.id);
      }
      
      alert('Audit notes saved successfully.');
    } catch (err) {
      console.error(err);
      alert('Failed to save audit notes. Check network connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const loadFromArchive = (report: GeneratedReport, isDuplicate: boolean = false) => {
    setEditingReportId(isDuplicate ? null : report.id);
    setReportType(report.report_type);
    setFundCluster(report.fund_cluster);
    setReportDate(report.report_date);
    setAccountablePerson(report.accountable_person);
    setAccountablePosition(report.accountable_position);
    setAccountabilityDate(report.accountability_date);
    setCommitteeChair(report.committee_chair);
    setHeadOfAgency(report.head_of_agency);
    setHeadPosition(report.head_position || 'Municipal Mayor');
    setCoaRep(report.coa_rep);
    setReportRows(report.items_snapshot.map(i => ({ ...i, tempId: Math.random().toString(36).substr(2, 9) })));
    setAuditNotes(report.auditNotesDetail?.notes || report.audit_notes || '');

    // Restore official GAM Mode & custom form parameters
    setReportMode(report.reportMode || 'appendix73');
    if (report.spcStockNo !== undefined) setSpcStockNo(report.spcStockNo);
    if (report.spcReorderLevel !== undefined) setSpcReorderLevel(report.spcReorderLevel);
    if (report.spcUnitCost !== undefined) setSpcUnitCost(report.spcUnitCost);
    if (report.spcNotedBy !== undefined) setSpcNotedBy(report.spcNotedBy);
    if (report.splcStockNo !== undefined) setSplcStockNo(report.splcStockNo);
    if (report.splcUnitCost !== undefined) setSplcUnitCost(report.splcUnitCost);
    if (report.splcAccountCode !== undefined) setSplcAccountCode(report.splcAccountCode);
    if (report.splcApprovedBy !== undefined) setSplcApprovedBy(report.splcApprovedBy);
    if (report.icsNo !== undefined) setIcsNo(report.icsNo);
    if (report.icsDateIssued !== undefined) setIcsDateIssued(report.icsDateIssued);
    if (report.icsEmployeeName !== undefined) setIcsEmployeeName(report.icsEmployeeName);
    if (report.icsEmployeePosition !== undefined) setIcsEmployeePosition(report.icsEmployeePosition);
    if (report.icsIssuedBy !== undefined) setIcsIssuedBy(report.icsIssuedBy);
    if (report.regsipPreparedBy !== undefined) setRegsipPreparedBy(report.regsipPreparedBy);
    if (report.regsipApprovedBy !== undefined) setRegsipApprovedBy(report.regsipApprovedBy);
    if (report.itrNo !== undefined) setItrNo(report.itrNo);
    if (report.itrDate !== undefined) setItrDate(report.itrDate);
    if (report.itrFromTransferor !== undefined) setItrFromTransferor(report.itrFromTransferor);
    if (report.itrToTransferee !== undefined) setItrToTransferee(report.itrToTransferee);
    if (report.itrPurpose !== undefined) setItrPurpose(report.itrPurpose);
    if (report.itrType !== undefined) setItrType(report.itrType || 'reassignment');
    if (report.itrTypeOthers !== undefined) setItrTypeOthers(report.itrTypeOthers || '');
    if (report.itrApprovedBy !== undefined) setItrApprovedBy(report.itrApprovedBy || 'JUDGE B. CABRERA');
    if (report.itrApprovedPosition !== undefined) setItrApprovedPosition(report.itrApprovedPosition || 'Municipal Mayor');
    if (report.itrFromPosition !== undefined) setItrFromPosition(report.itrFromPosition || 'Supply Officer II / Property Custodian');
    if (report.itrToPosition !== undefined) setItrToPosition(report.itrToPosition || 'Administrative Assistant III');
    if (report.rrspNo !== undefined) setRrspNo(report.rrspNo);
    if (report.rrspDate !== undefined) setRrspDate(report.rrspDate);
    if (report.rrspAccountCode !== undefined) setRrspAccountCode(report.rrspAccountCode);
    if (report.rrspSupplier !== undefined) setRrspSupplier(report.rrspSupplier);
    if (report.rrspOrDvNo !== undefined) setRrspOrDvNo(report.rrspOrDvNo);
    if (report.rrspOrDvDate !== undefined) setRrspOrDvDate(report.rrspOrDvDate);
    if (report.rrspReceivedBy !== undefined) setRrspReceivedBy(report.rrspReceivedBy);
    if (report.rrspApprovedBy !== undefined) setRrspApprovedBy(report.rrspApprovedBy);

    if (isDuplicate) {
      setIsViewOnly(false);
      alert('Report duplicated. You can now edit and save this as a new entry.');
    } else {
      setIsViewOnly(report.status === 'Finalized' || report.status === 'Pending Approval' || report.status === 'Approved' || report.status === 'Rejected');
    }
    setActiveTab('generator');
  };

  const deleteReport = async (id: string) => {
    if (!confirm('Are you sure you want to delete this archived report?')) return;
    try {
      await deleteDoc(doc(db, 'reports', id));
    } catch (err) {
      console.error('Delete Error:', err);
    }
  };

  const getExportMarkup = (type: 'xls' | 'doc') => {
    // Custom Official GAM forms HTML print layout overrides
    if (reportMode === 'spc') {
      const rowsHtml = reportRows.map((row, idx) => {
        const totalReceipts = Number(row.qtyPhysicalCount) || 1;
        const totalIssues = Number(row.shortageQty) || 0;
        const balance = Number(row.qtyPropertyCard) || Math.max(0, totalReceipts - totalIssues);
        return `
          <tr>
            <td style="border: 0.5pt solid black; text-align: center;">${row.dateAcquired || reportDate}</td>
            <td style="border: 0.5pt solid black; text-align: center;">${row.propertyNumber || 'RIS-2024-001'}</td>
            <td style="border: 0.5pt solid black; text-align: center; font-weight: bold; color: green;">${totalReceipts}</td>
            <td style="border: 0.5pt solid black; text-align: center; font-weight: bold; color: red;">${totalIssues}</td>
            <td style="border: 0.5pt solid black; text-align: center; font-weight: bold; color: blue;">${balance}</td>
            <td style="border: 0.5pt solid black;">${row.remarks || row.article || 'General stock issued'}</td>
          </tr>
        `;
      }).join('');

      return `
        <html>
        <head>
          <style>
            @page { size: 13in 8.5in; margin: 0.5in; mso-page-orientation: landscape; }
            body { font-family: "Times New Roman", serif; font-size: 11pt; line-height: 1.3; }
            table { border-collapse: collapse; width: 100%; margin-top: 15pt; }
            th { border: 0.5pt solid black; padding: 6pt; background-color: #f3f4f6; text-align: center; font-weight: bold; }
            td { border: 0.5pt solid black; padding: 6pt; font-size: 10.5pt; }
            .header-info { width: 100%; border-collapse: collapse; margin-top: 15pt; }
            .header-info td { border: none; padding: 4pt 0; font-size: 11pt; }
          </style>
        </head>
        <body>
          <div style="text-align: right; font-style: italic; font-weight: bold;">Appendix 54</div>
          <div style="text-align: center; text-transform: uppercase; font-size: 10pt; color: gray; font-weight: bold;">PROVINCE OF ANTIQUE, MUNICIPALITY OF TIBIAO</div>
          <h1 style="text-align: center; font-size: 18pt; font-weight: bold; margin: 5pt 0 0 0;">SUPPLIES PROPERTY CARD</h1>
          <div style="text-align: center; font-style: italic; font-size: 10pt; margin-bottom: 15pt;">Municipal Property Office / General Services Department</div>

          <table class="header-info">
            <tr>
              <td style="width: 50%;"><b>Supplies / Item Description:</b> <span style="border-bottom: 1px solid black; padding: 0 10px;">${reportType || 'TOWEL, COTTON, LARGE'}</span></td>
              <td style="width: 50%; text-align: right;"><b>Stock No:</b> <span style="border-bottom: 1px solid black; padding: 0 10px;">${spcStockNo || 'ST-2024-001'}</span></td>
            </tr>
            <tr>
              <td><b>Unit of Measure:</b> <span style="border-bottom: 1px solid black; padding: 0 10px;">${reportRows[0]?.unitOfMeasure || 'PIECE'}</span></td>
              <td style="text-align: right;"><b>Reorder Point:</b> <span style="border-bottom: 1px solid black; padding: 0 10px;">${spcReorderLevel || '20'}</span></td>
            </tr>
            <tr>
              <td><b>Average Unit Cost:</b> <span style="border-bottom: 1px solid black; padding: 0 10px;">₱${(spcUnitCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></td>
              <td></td>
            </tr>
          </table>

          <table>
            <thead>
              <tr>
                <th rowspan="2" style="width: 12%;">Date</th>
                <th rowspan="2" style="width: 20%;">Reference / RIS No.</th>
                <th colspan="3">Quantity</th>
                <th rowspan="2" style="width: 38%;">Remarks / User Department</th>
              </tr>
              <tr>
                <th style="width: 10%;">Receipt Qty</th>
                <th style="width: 10%;">Issue Qty</th>
                <th style="width: 10%;">Balance Qty</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <table style="width: 100%; border: none; margin-top: 40pt;">
            <tr>
              <td style="border: none; width: 50%; text-align: left;">
                <div style="font-weight: bold; font-style: italic;">Prepared By:</div>
                <div style="margin-top: 40pt; border-bottom: 1pt solid black; display: inline-block; min-width: 220pt; text-align: center; font-weight: bold; text-transform: uppercase;">LGU PROPERTY CUSTODIAN</div>
                <div style="font-size: 8.5pt; color: gray; font-weight: bold; text-align: center; text-transform: uppercase; margin-top: 4pt;">Supply Officer / Custodian</div>
              </td>
              <td style="border: none; width: 50%; text-align: right;">
                <div style="font-weight: bold; font-style: italic; text-align: left; padding-left: 100pt;">Noted By:</div>
                <div style="margin-top: 40pt; border-bottom: 1pt solid black; display: inline-block; min-width: 220pt; text-align: center; font-weight: bold; text-transform: uppercase;">${spcNotedBy || 'MARIA S. REYES'}</div>
                <div style="font-size: 8.5pt; color: gray; font-weight: bold; text-align: center; text-transform: uppercase; margin-top: 4pt; padding-left: 100pt;">Head, General Services Dept</div>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
    }

    if (reportMode === 'splc') {
      const rowsHtml = reportRows.map((row, idx) => {
        const rQty = Number(row.qtyPhysicalCount) || 1;
        const rUcost = Number(row.unitValue) || splcUnitCost || 0;
        const rTotal = rQty * rUcost;
        const iQty = Number(row.shortageQty) || 0;
        const iTotal = iQty * rUcost;
        const bQty = Number(row.qtyPropertyCard) || Math.max(0, rQty - iQty);
        const bTotal = bQty * rUcost;
        return `
          <tr>
            <td style="border: 0.5pt solid black; text-align: center;">${row.dateAcquired || reportDate}</td>
            <td style="border: 0.5pt solid black; text-align: center; font-family: monospace;">${row.propertyNumber || 'OR-00213'}</td>
            <td style="border: 0.5pt solid black; text-align: center;">${rQty}</td>
            <td style="border: 0.5pt solid black; text-align: right;">₱${rUcost.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td style="border: 0.5pt solid black; text-align: right;">₱${rTotal.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td style="border: 0.5pt solid black; text-align: center; color: red;">${iQty || '-'}</td>
            <td style="border: 0.5pt solid black; text-align: right; color: red;">${iQty > 0 ? '₱' + rUcost.toLocaleString(undefined, {minimumFractionDigits:2}) : '-'}</td>
            <td style="border: 0.5pt solid black; text-align: right; color: red;">${iQty > 0 ? '₱' + iTotal.toLocaleString(undefined, {minimumFractionDigits:2}) : '-'}</td>
            <td style="border: 0.5pt solid black; text-align: center; font-weight: bold; color: blue;">${bQty}</td>
            <td style="border: 0.5pt solid black; text-align: right; font-weight: bold; color: blue;">₱${bTotal.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
          </tr>
        `;
      }).join('');

      return `
        <html>
        <head>
          <style>
            @page { size: 13in 8.5in; margin: 0.5in; mso-page-orientation: landscape; }
            body { font-family: "Times New Roman", serif; font-size: 10.5pt; line-height: 1.3; }
            table { border-collapse: collapse; width: 100%; margin-top: 15pt; }
            th { border: 0.5pt solid black; padding: 5pt; background-color: #f3f4f6; text-align: center; font-weight: bold; }
            td { border: 0.5pt solid black; padding: 5pt; font-size: 10pt; }
          </style>
        </head>
        <body>
          <div style="text-align: right; font-style: italic; font-weight: bold;">Appendix 55</div>
          <div style="text-align: center; text-transform: uppercase; font-size: 10pt; color: gray; font-weight: bold;">PROVINCE OF ANTIQUE, MUNICIPALITY OF TIBIAO</div>
          <h1 style="text-align: center; font-size: 18pt; font-weight: bold; margin: 5pt 0 0 0;">SUPPLIES LEDGER CARD</h1>
          <div style="text-align: center; font-style: italic; font-size: 10pt; margin-bottom: 15pt;">LGU Accounting Unit / General Ledger Division</div>

          <table style="width: 100%; border: none; margin-bottom: 10pt;">
            <tr>
              <td style="border: none; width: 50%;"><b>Description of Supplies:</b> <span style="border-bottom: 1px solid black; padding: 0 10px;">${reportType || 'OFFICE SUPPLIES'}</span></td>
              <td style="border: none; width: 50%; text-align: right;"><b>Stock No:</b> <span style="border-bottom: 1px solid black; padding: 0 10px;">${splcStockNo || 'ST-2024-001'}</span></td>
            </tr>
            <tr>
              <td style="border: none;"><b>GL Account Code:</b> <span style="border-bottom: 1px solid black; padding: 0 10px; color: blue;">${splcAccountCode || '5020401002'}</span></td>
              <td style="border: none; text-align: right;"><b>Est. Avg Unit Cost:</b> <span style="border-bottom: 1px solid black; padding: 0 10px;">₱${(splcUnitCost || 0).toLocaleString(undefined, {minimumFractionDigits: 2})}</span></td>
            </tr>
          </table>

          <table>
            <thead>
              <tr>
                <th rowspan="2" style="width: 10%;">Date</th>
                <th rowspan="2" style="width: 14%;">Reference No</th>
                <th colspan="3">Receipts</th>
                <th colspan="3">Issues</th>
                <th colspan="2">Balance</th>
              </tr>
              <tr>
                <th style="width: 8%;">Qty</th>
                <th style="width: 10%;">Unit Cost</th>
                <th style="width: 12%;">Total Amount</th>
                <th style="width: 8%;">Qty</th>
                <th style="width: 10%;">Unit Cost</th>
                <th style="width: 12%;">Total Amount</th>
                <th style="width: 8%;">Qty</th>
                <th style="width: 12%;">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <table style="width: 100%; border: none; margin-top: 40pt;">
            <tr>
              <td style="border: none; width: 50%; text-align: left;">
                <div style="font-weight: bold; font-style: italic;">Certified Prepared:</div>
                <div style="margin-top: 40pt; border-bottom: 1pt solid black; display: inline-block; min-width: 200pt; text-align: center; font-weight: bold; text-transform: uppercase;">LGU ACCOUNTING CLERK</div>
                <div style="font-size: 8.5pt; color: gray; font-weight: bold; text-align: center; text-transform: uppercase; margin-top: 4pt;">Bookkeeper / Accounting Dept</div>
              </td>
              <td style="border: none; width: 50%; text-align: right;">
                <div style="font-weight: bold; font-style: italic; text-align: left; padding-left: 100pt;">Approved / Noted:</div>
                <div style="margin-top: 40pt; border-bottom: 1pt solid black; display: inline-block; min-width: 200pt; text-align: center; font-weight: bold; text-transform: uppercase;">${splcApprovedBy || 'MARIA S. REYES'}</div>
                <div style="font-size: 8.5pt; color: gray; font-weight: bold; text-align: center; text-transform: uppercase; margin-top: 4pt; padding-left: 100pt;">Municipal Accountant</div>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
    }

    if (reportMode === 'ics') {
      const rowsHtml = reportRows.map((row, idx) => {
        const cleanQty = Number(row.qtyPhysicalCount) || 1;
        const cleanPrice = Number(row.unitValue) || 0;
        return `
          <tr>
            <td style="border: 1px solid black; text-align: center; font-weight: bold;">${cleanQty}</td>
            <td style="border: 1px solid black; text-align: center; text-transform: uppercase;">${row.unitOfMeasure || 'PC'}</td>
            <td style="border: 1px solid black; text-align: right; font-family: monospace;">₱${cleanPrice.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td style="border: 1px solid black; padding-left: 10px;">
              <b style="text-transform: uppercase;">${row.article || 'OFFICE ASSET'}</b><br/>
              <span style="font-size: 8.5pt; color: #4b5563;">${row.description || ''}</span>
            </td>
            <td style="border: 1px solid black; text-align: center; font-family: monospace;">${row.propertyNumber || 'Pending'}</td>
            <td style="border: 1px solid black; text-align: center;">${row.usefulLife || '5'} Years</td>
          </tr>
        `;
      }).join('');

      // Extra spacer rows to ensure standard height
      let emptyRowsHtml = "";
      for (let i = 0; i < Math.max(1, 6 - reportRows.length); i++) {
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

      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Inventory Custodian Slip (ICS)</title>
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
              margin: 15px;
              color: #000;
              background: #fff;
              line-height: 1.3;
              font-size: 9.5pt;
            }
            .sheet-container {
              width: 100%;
              max-width: 800px;
              margin: 0 auto;
            }
            table {
              width: 100%;
              border-collapse: collapse;
            }
            .header-table {
              margin-bottom: 12px;
            }
            .header-logo {
              width: 65px;
              height: 65px;
              object-fit: contain;
            }
            .title-block {
              text-align: center;
              font-weight: bold;
              font-size: 13.5pt;
              text-transform: uppercase;
              margin-top: 5px;
              margin-bottom: 15px;
              letter-spacing: 0.5px;
            }
            .meta-table {
              margin-bottom: 10px;
              font-size: 9.5pt;
            }
            .underline-span {
              border-bottom: 1px solid black;
              padding: 0 8px;
              font-weight: bold;
            }
            .data-table {
              margin-bottom: 15px;
              font-size: 9pt;
            }
            .data-table th {
              border: 1px solid black;
              padding: 5px;
              background-color: #f8fafc;
              text-align: center;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 8.5pt;
            }
            .data-table td {
              border: 1px solid black;
              padding: 5px 6px;
              vertical-align: middle;
            }
            .sign-table {
              width: 100%;
              border-collapse: collapse;
              border: 1.5px solid black;
              margin-top: 15px;
              font-size: 9pt;
              page-break-inside: avoid;
            }
            .sign-td {
              width: 50%;
              padding: 10px;
              vertical-align: top;
            }
            .sign-line {
              border-bottom: 1px solid black;
              text-align: center;
              font-weight: bold;
              text-transform: uppercase;
              margin-top: 25px;
              margin-bottom: 2px;
              min-height: 18px;
              font-size: 9.5pt;
            }
            .sign-sub {
              font-size: 7.5pt;
              text-align: center;
              color: #374151;
              margin-bottom: 10px;
            }
            .annex-label {
              text-align: right;
              font-weight: bold;
              font-style: italic;
              font-size: 9pt;
              margin-top: 10px;
            }
          </style>
        </head>
        <body>
          <div class="sheet-container">
            <table class="header-table">
              <tr>
                <td style="width: 15%; text-align: center; padding: 0;">
                  <img src="/tibiaoLogo.jpg" class="header-logo" alt="LGU Tibiao Seal" onError="this.style.display='none'" />
                </td>
                <td style="width: 70%; text-align: center; padding: 0; line-height: 1.3;">
                  <div style="font-size: 9.5pt; text-transform: uppercase; font-weight: bold;">Republic of the Philippines</div>
                  <div style="font-size: 9pt; font-style: italic; color: #374151;">Province of Antique</div>
                  <div style="font-size: 11.5pt; font-weight: bold; text-transform: uppercase;">MUNICIPALITY OF TIBIAO</div>
                </td>
                <td style="width: 15%; padding: 0;">&nbsp;</td>
              </tr>
            </table>

            <div class="title-block">INVENTORY CUSTODIAN SLIP</div>

            <table class="meta-table">
              <tr>
                <td style="width: 60%; padding: 3px 0;">
                  <strong>Entity Name:</strong> <span class="underline-span" style="min-width: 220px; display: inline-block;">MUNICIPALITY OF TIBIAO / ${(reportRows[0]?.officeAssociated || 'GENERAL SERVICES').toUpperCase()}</span>
                </td>
                <td style="width: 40%; text-align: right; padding: 3px 0;">&nbsp;</td>
              </tr>
              <tr>
                <td style="padding: 3px 0;">
                  <strong>Fund Cluster:</strong> <span class="underline-span" style="min-width: 160px; display: inline-block;">${fundCluster || "GENERAL FUND"}</span>
                </td>
                <td style="text-align: right; padding: 3px 0;">
                  <strong>ICS No.:</strong> <span class="underline-span" style="min-width: 120px; display: inline-block; font-family: monospace;">${icsNo || 'ICS-2024-001'}</span>
                </td>
              </tr>
            </table>

            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 8%;">Quantity</th>
                  <th style="width: 10%;">Unit</th>
                  <th style="width: 15%;">Amount / Value</th>
                  <th style="width: 37%;">Description (Article Name & Specifications)</th>
                  <th style="width: 15%;">Inventory Property No.</th>
                  <th style="width: 15%;">Est. Useful Life</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
                ${emptyRowsHtml}
              </tbody>
            </table>

            <table class="sign-table">
              <tr>
                <td class="sign-td" style="border-right: 1.5px solid black;">
                  <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 15px;">Received by:</div>
                  <div class="sign-line">${icsEmployeeName || "End-User Employee"}</div>
                  <div class="sign-sub">Signature over Printed Name of End User</div>
                  
                  <div class="sign-line" style="margin-top: 15px;">${icsEmployeePosition || "Administrative Aide VI"}</div>
                  <div class="sign-sub">Position / Office</div>
                  
                  <div class="sign-line" style="margin-top: 15px;">${icsDateIssued || 'Jan. 20, 2024'}</div>
                  <div class="sign-sub">Date</div>
                </td>
                <td class="sign-td">
                  <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 15px;">Issued by:</div>
                  <div class="sign-line">${icsIssuedBy || "CLEMENS G. BANDOJA"}</div>
                  <div class="sign-sub">Signature over Printed Name of Supply and/or Property Custodian</div>
                  
                  <div class="sign-line" style="margin-top: 15px;">Supply Officer II / Property Custodian</div>
                  <div class="sign-sub">Position / Office</div>
                  
                  <div class="sign-line" style="margin-top: 15px;">${icsDateIssued || 'Jan. 20, 2024'}</div>
                  <div class="sign-sub">Date</div>
                </td>
              </tr>
            </table>

            <div class="annex-label">Appendix 59</div>
          </div>
        </body>
        </html>
      `;
    }

    if (reportMode === 'par') {
      const parItems = reportRows.filter(row => !row.propertyNumber?.includes('ICS') && !row.remarks?.includes('ICS'));
      const icsItems = reportRows.filter(row => row.propertyNumber?.includes('ICS') || row.remarks?.includes('ICS'));

      const parRowsHtml = parItems.map((row) => {
        const cleanQty = Number(row.qtyPhysicalCount) || 1;
        const cleanPrice = Number(row.unitValue) || 0;
        const value = cleanPrice * cleanQty;
        return `
          <tr>
            <td style="border: 1px solid black; text-align: center; font-weight: bold; padding: 6px;">${cleanQty}</td>
            <td style="border: 1px solid black; text-align: center; text-transform: uppercase; padding: 6px;">${row.unitOfMeasure || 'unit'}</td>
            <td style="border: 1px solid black; padding: 6px; text-align: left;">
              <b style="text-transform: uppercase; font-size: 10pt;">${row.article || 'OFFICE EQUIPMENT'}</b><br/>
              <span style="font-size: 8.5pt; color: #4b5563; font-family: sans-serif;">${row.description || 'No specs provided.'}</span>
            </td>
            <td style="border: 1px solid black; text-align: center; font-family: monospace; font-size: 9pt; padding: 6px;">${row.propertyNumber || 'Pending'}</td>
            <td style="border: 1px solid black; text-align: center; font-size: 9pt; padding: 6px;">${row.dateAcquired || row.acquisitionDate || 'N/A'}</td>
            <td style="border: 1px solid black; text-align: right; font-family: monospace; font-weight: bold; padding: 6px; padding-right: 10px;">₱${value.toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2})}</td>
          </tr>
        `;
      }).join('');

      let parEmptyRowsHtml = "";
      for (let i = 0; i < Math.max(1, 4 - parItems.length); i++) {
        parEmptyRowsHtml += `
          <tr style="height: 25px; opacity: 0.4;">
            <td style="border: 1px solid black;">&nbsp;</td>
            <td style="border: 1px solid black;">&nbsp;</td>
            <td style="border: 1px solid black;">&nbsp;</td>
            <td style="border: 1px solid black;">&nbsp;</td>
            <td style="border: 1px solid black;">&nbsp;</td>
            <td style="border: 1px solid black;">&nbsp;</td>
          </tr>
        `;
      }

      const icsRowsHtml = icsItems.map((row) => {
        const cleanQty = Number(row.qtyPhysicalCount) || row.qtyPropertyCard || 1;
        const useful = row.usefulLife || 'N/A';
        return `
          <tr>
            <td style="border: 1px solid black; text-align: center; font-weight: bold; padding: 6px;">${cleanQty}</td>
            <td style="border: 1px solid black; text-align: center; text-transform: uppercase; padding: 6px;">${row.unitOfMeasure || 'unit'}</td>
            <td style="border: 1px solid black; padding: 6px; text-align: left;">
              <b style="text-transform: uppercase; font-size: 10pt;">${row.article || 'SEMI-EXPENDABLE PROPERTY'}</b><br/>
              <span style="font-size: 8.5pt; color: #4b5563; font-family: sans-serif;">${row.description || 'No specs provided.'}</span>
            </td>
            <td style="border: 1px solid black; text-align: center; font-family: monospace; font-size: 9pt; padding: 6px;">${row.propertyNumber || 'Pending'}</td>
            <td style="border: 1px solid black; text-align: center; font-size: 9pt; padding: 6px;">${useful !== 'N/A' ? `${useful} yrs` : 'N/A'}</td>
          </tr>
        `;
      }).join('');

      let icsEmptyRowsHtml = "";
      for (let i = 0; i < Math.max(1, 4 - icsItems.length); i++) {
        icsEmptyRowsHtml += `
          <tr style="height: 25px; opacity: 0.4;">
            <td style="border: 1px solid black;">&nbsp;</td>
            <td style="border: 1px solid black;">&nbsp;</td>
            <td style="border: 1px solid black;">&nbsp;</td>
            <td style="border: 1px solid black;">&nbsp;</td>
            <td style="border: 1px solid black;">&nbsp;</td>
          </tr>
        `;
      }

      return `
        <!DOCTYPE html>
        <html>
        <head>
          <title>MDRRMO PAR-ICS Unified Registry Printout</title>
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
              .page-break {
                page-break-before: always;
              }
            }
            body {
              font-family: 'Times New Roman', Times, serif;
              margin: 10px;
              color: #000;
              background: #fff;
              line-height: 1.3;
              font-size: 9.5pt;
            }
            .section-container {
              width: 100%;
              max-width: 800px;
              margin: 0 auto;
              border: 1px solid #111;
              padding: 25px;
              box-sizing: border-box;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
            }
            .title-block {
              text-align: center;
              font-weight: bold;
              font-size: 14pt;
              text-transform: uppercase;
              margin-top: 10px;
              margin-bottom: 5px;
              letter-spacing: 0.5px;
            }
            .meta-table {
              margin-bottom: 12px;
              font-size: 9.5pt;
            }
            .underline-span {
              border-bottom: 1px solid black;
              padding: 0 8px;
              font-weight: bold;
            }
            .data-table {
              margin-bottom: 15px;
              font-size: 9pt;
            }
            .data-table th {
              border: 1px solid black;
              padding: 6px;
              background-color: #f1f5f9;
              text-align: center;
              font-weight: bold;
              text-transform: uppercase;
              font-size: 8.5pt;
            }
            .data-table td {
              border: 1px solid black;
              padding: 5px 6px;
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
            }
            .sign-sub {
              font-size: 7.5pt;
              text-align: center;
              color: #374151;
            }
            .annex-label {
              text-align: right;
              font-weight: bold;
              font-style: italic;
              font-size: 10pt;
              margin-bottom: 5px;
            }
            .divider-line {
              border-top: 2px dashed #999;
              margin: 40px 0;
              text-align: center;
              position: relative;
            }
            .divider-text {
              position: absolute;
              top: -10px;
              left: 50%;
              transform: translateX(-50%);
              background: #fff;
              padding: 0 15px;
              font-size: 8pt;
              color: #666;
              font-weight: bold;
              text-transform: uppercase;
            }
          </style>
        </head>
        <body>
          <!-- PAR SECTION -->
          <div class="section-container">
            <div class="annex-label">Annex B</div>
            
            <div style="text-align: center; line-height: 1.2;">
              <div style="font-size: 9pt; text-transform: uppercase; font-weight: bold; color: #444;">Republic of the Philippines</div>
              <div style="font-size: 9pt; font-style: italic; color: #444;">Province of Antique</div>
              <div style="font-size: 12pt; font-weight: bold; text-transform: uppercase;">MUNICIPALITY OF TIBIAO</div>
              <div style="font-size: 10pt; font-weight: bold; color: #2a354f;">MDRRMO / OFFICE OF EMERGENCY MANAGEMENT</div>
            </div>

            <div class="title-block">PROPERTY ACKNOWLEDGEMENT RECEIPT</div>
            <div style="text-align: center; font-style: italic; font-size: 8.5pt; margin-bottom: 15px; color: #555;">Required for LGU Equipment with acquisition cost exceeding threshold</div>

            <table class="meta-table">
              <tr>
                <td style="width: 50%; padding: 3px 0;">
                  <strong>Entity Name:</strong> <span class="underline-span" style="min-width: 220px; display: inline-block;">MUNICIPALITY OF TIBIAO / MDRRMO</span>
                </td>
                <td style="width: 50%; text-align: right; padding: 3px 0;">
                  <strong>Fund Cluster:</strong> <span class="underline-span" style="min-width: 140px; display: inline-block; text-align: center;">${fundCluster || "General Fund"}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 3px 0;">&nbsp;</td>
                <td style="text-align: right; padding: 3px 0;">
                  <strong>PAR No.:</strong> <span class="underline-span" style="min-width: 140px; display: inline-block; font-family: monospace; text-align: center;">${icsNo || 'MDRRMO-PAR-2024-001'}</span>
                </td>
              </tr>
            </table>

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
                ${parRowsHtml}
                ${parEmptyRowsHtml}
              </tbody>
            </table>

            <table class="sign-table">
              <tr>
                <td class="sign-td" style="border-right: 1.5px solid black;">
                  <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 15px; font-style: italic;">Received by:</div>
                  <div class="sign-line">${icsEmployeeName || "NORMAN I. ALABADO"}</div>
                  <div class="sign-sub" style="font-weight: bold;">Signature over Printed Name of End User</div>
                  
                  <div class="sign-line" style="margin-top: 15px;">${icsEmployeePosition || "LDRRMO II/ MDRRMO"}</div>
                  <div class="sign-sub">Position / Office</div>
                </td>
                <td class="sign-td">
                  <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 15px; font-style: italic;">Issued by:</div>
                  <div class="sign-line">${icsIssuedBy || "CLEMENS G. BANDOJA"}</div>
                  <div class="sign-sub" style="font-weight: bold;">Signature over Printed Name of Property Custodian</div>
                  
                  <div class="sign-line" style="margin-top: 15px;">Supply and/or Property Custodian Representative</div>
                  <div class="sign-sub">Position / Office</div>
                </td>
              </tr>
            </table>
          </div>

          <!-- SECTION SPLITTER / PAPER CUTTER line -->
          <div class="divider-line">
            <span class="divider-text">✂️ Unified Inventory Registry Form Partition</span>
          </div>

          <!-- ICS SECTION -->
          <div class="section-container page-break">
            <div class="annex-label">Appendix 59</div>
            
            <div style="text-align: center; line-height: 1.2;">
              <div style="font-size: 9pt; text-transform: uppercase; font-weight: bold; color: #444;">Republic of the Philippines</div>
              <div style="font-size: 9pt; font-style: italic; color: #444;">Province of Antique</div>
              <div style="font-size: 12pt; font-weight: bold; text-transform: uppercase;">MUNICIPALITY OF TIBIAO</div>
              <div style="font-size: 10pt; font-weight: bold; color: #2a354f;">MDRRMO / OFFICE OF EMERGENCY MANAGEMENT</div>
            </div>

            <div class="title-block">INVENTORY CUSTODIAN SLIP</div>
            <div style="text-align: center; font-style: italic; font-size: 8.5pt; margin-bottom: 15px; color: #555;">Semi-Expendable Property Issued Ledger</div>

            <table class="meta-table">
              <tr>
                <td style="width: 50%; padding: 3px 0;">
                  <strong>Entity Name:</strong> <span class="underline-span" style="min-width: 220px; display: inline-block;">MUNICIPALITY OF TIBIAO / MDRRMO</span>
                </td>
                <td style="width: 50%; text-align: right; padding: 3px 0;">
                  <strong>Fund Cluster:</strong> <span class="underline-span" style="min-width: 140px; display: inline-block; text-align: center;">${fundCluster || "General Fund"}</span>
                </td>
              </tr>
              <tr>
                <td style="padding: 3px 0;">&nbsp;</td>
                <td style="text-align: right; padding: 3px 0;">
                  <strong>ICS No.:</strong> <span class="underline-span" style="min-width: 140px; display: inline-block; font-family: monospace; text-align: center;">MDRRMO-ICS-${icsNo ? icsNo.replace(/[^0-9]/g, '') : '2024-001'}</span>
                </td>
              </tr>
            </table>

            <table class="data-table">
              <thead>
                <tr>
                  <th style="width: 8%;">Quantity</th>
                  <th style="width: 10%;">Unit</th>
                  <th style="width: 52%;">Description</th>
                  <th style="width: 16%;">Inventory Item No.</th>
                  <th style="width: 14%;">Est. Useful Life</th>
                </tr>
              </thead>
              <tbody>
                ${icsRowsHtml}
                ${icsEmptyRowsHtml}
              </tbody>
            </table>

            <table class="sign-table">
              <tr>
                <td class="sign-td" style="border-right: 1.5px solid black;">
                  <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 15px; font-style: italic;">Received by:</div>
                  <div class="sign-line">${icsEmployeeName || "NORMAN I. ALABADO"}</div>
                  <div class="sign-sub" style="font-weight: bold;">Signature over Printed Name of End User</div>
                  
                  <div class="sign-line" style="margin-top: 15px;">${icsEmployeePosition || "LDRRMO II/ MDRRMO"}</div>
                  <div class="sign-sub">Position / Office</div>
                </td>
                <td class="sign-td">
                  <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 15px; font-style: italic;">Released / Issued by:</div>
                  <div class="sign-line">${icsIssuedBy || "CLEMENS G. BANDOJA"}</div>
                  <div class="sign-sub" style="font-weight: bold;">Signature over Printed Name of Property Custodian</div>
                  
                  <div class="sign-line" style="margin-top: 15px;">Supply Officer / properties Representative</div>
                  <div class="sign-sub">Position / Office</div>
                </td>
              </tr>
            </table>
          </div>
        </body>
        </html>
      `;
    }

    if (reportMode === 'regsip') {
      const rowsHtml = reportRows.map((row, idx) => {
        const qtyVal = Number(row.qtyPhysicalCount) || 1;
        const costVal = Number(row.unitValue) || 0;
        return `
          <tr>
            <td style="border: 0.5pt solid black; text-align: center;">${row.dateAcquired || reportDate}</td>
            <td style="border: 0.5pt solid black; text-align: center; font-family: monospace;">ICS-2024-${(idx*13+45).toString().padStart(3, '0')}</td>
            <td style="border: 0.5pt solid black;">
              <b>${row.article || 'OFFICE ASSET'}</b><br/>
              <span style="font-size: 8.5pt; color: #555;">${row.description || ''}</span>
            </td>
            <td style="border: 0.5pt solid black; text-align: center; font-weight: bold;">${qtyVal}</td>
            <td style="border: 0.5pt solid black; text-align: right;">₱${costVal.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td style="border: 0.5pt solid black; text-align: right; font-weight: bold;">₱${(qtyVal * costVal).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td style="border: 0.5pt solid black; text-align: center; font-weight: bold; text-transform: uppercase;">${row.officeAssociated || 'OFFICE STAFF'}</td>
          </tr>
        `;
      }).join('');

      return `
        <html>
        <head>
          <style>
            @page { size: 13in 8.5in; margin: 0.5in; mso-page-orientation: landscape; }
            body { font-family: "Times New Roman", serif; font-size: 11pt; line-height: 1.3; }
            table { border-collapse: collapse; width: 100%; margin-top: 15pt; }
            th { border: 0.5pt solid black; padding: 6pt; background-color: #f3f4f6; text-align: center; font-weight: bold; }
            td { border: 0.5pt solid black; padding: 6pt; font-size: 10pt; }
          </style>
        </head>
        <body>
          <div style="text-align: right; font-style: italic; font-weight: bold;">Appendix 64</div>
          <div style="text-align: center; text-transform: uppercase; font-size: 10pt; color: gray; font-weight: bold;">PROVINCE OF ANTIQUE, MUNICIPALITY OF TIBIAO</div>
          <h1 style="text-align: center; font-size: 18pt; font-weight: bold; margin: 5pt 0 0 0;">REGISTRY OF SEMI-EXPENDABLE PROPERTY ISSUED</h1>
          <div style="text-align: center; font-style: italic; font-size: 10pt; margin-bottom: 20pt;">Control Registry Log (REG-SIP) - High Value Office Ledger</div>

          <table style="width: 100%; border: none; border-bottom: 1px solid black; padding-bottom: 5px; margin-bottom: 15pt;">
            <tr>
              <td style="border: none; font-size: 11.5pt;"><b>LGU Combined Office:</b> <span style="font-weight: bold; text-transform: uppercase; color: blue;">${reportRows[0]?.officeAssociated || 'GENERAL SERVICES'}</span></td>
              <td style="border: none; text-align: right; font-size: 11.5pt;"><b>Date of Registry Audit:</b> <span style="font-weight: bold;">${reportDate || 'December 31, 2024'}</span></td>
            </tr>
          </table>

          <table>
            <thead>
              <tr>
                <th style="width: 12%;">Date Issued</th>
                <th style="width: 14%;">ICS Slip No.</th>
                <th style="width: 30%;">Semi-Expendable Description</th>
                <th style="width: 8%;">Qty</th>
                <th style="width: 12%;">Unit Cost</th>
                <th style="width: 12%;">Total Value</th>
                <th style="width: 12%;">End-User Custodian</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <table style="width: 100%; border: none; margin-top: 40pt;">
            <tr>
              <td style="border: none; width: 50%; text-align: left;">
                <div style="font-weight: bold; font-style: italic;">Registry Clerk:</div>
                <div style="margin-top: 40pt; border-bottom: 1pt solid black; display: inline-block; min-width: 220pt; text-align: center; font-weight: bold; text-transform: uppercase;">${regsipPreparedBy || 'MARIA S. REYES'}</div>
                <div style="font-size: 8.5pt; color: gray; font-weight: bold; text-align: center; text-transform: uppercase; margin-top: 4pt;">Property Ledger Officer</div>
              </td>
              <td style="border: none; width: 50%; text-align: right;">
                <div style="font-weight: bold; font-style: italic; text-align: left; padding-left: 100pt;">Authorized Approved:</div>
                <div style="margin-top: 40pt; border-bottom: 1pt solid black; display: inline-block; min-width: 220pt; text-align: center; font-weight: bold; text-transform: uppercase;">${regsipApprovedBy || 'PEDRO L. SANTOS'}</div>
                <div style="font-size: 8.5pt; color: gray; font-weight: bold; text-align: center; text-transform: uppercase; margin-top: 4pt; padding-left: 100pt;">Heads of Office / Treasurer</div>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
    }

    if (reportMode === 'itr') {
      const rowsHtml = reportRows.map((row, idx) => {
        const cleanQty = Number(row.qtyPhysicalCount) || 1;
        const cleanCost = Number(row.unitValue) || 0;
        const totalCost = cleanQty * cleanCost;
        return `
          <tr>
            <td style="border: 0.5pt solid black; text-align: center;">${row.dateAcquired || reportDate || 'N/A'}</td>
            <td style="border: 0.5pt solid black; text-align: center; font-family: monospace; font-size: 8.5pt;">${row.propertyNumber || 'Pending'}</td>
            <td style="border: 0.5pt solid black; text-align: center; font-size: 9pt; text-transform: uppercase;">${row.unitOfMeasure || 'unit'}</td>
            <td style="border: 0.5pt solid black; text-align: left; padding-left: 6px; text-transform: uppercase;">
              <b>${row.article || 'Transferred Prop'}</b><br/>
              <span style="font-size: 8pt; color: #4b5563; text-transform: none;">${row.description || 'N/A'}</span>
            </td>
            <td style="border: 0.5pt solid black; text-align: center; font-weight: bold;">${cleanQty}</td>
            <td style="border: 0.5pt solid black; text-align: right; padding-right: 6px;">₱${cleanCost.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td style="border: 0.5pt solid black; text-align: right; padding-right: 6px; font-weight: bold;">₱${totalCost.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td style="border: 0.5pt solid black; text-align: center; font-weight: bold; color: #1e3a8a;">${row.condition || 'Good'}</td>
          </tr>
        `;
      }).join('');

      // Render up to 5 empty rows to ensure elegant structural document proportions
      const emptyRowCount = Math.max(0, 5 - reportRows.length);
      let emptyRowsHtml = '';
      for (let i = 0; i < emptyRowCount; i++) {
        emptyRowsHtml += `
          <tr style="height: 28px;">
            <td style="border: 0.5pt solid black;">&nbsp;</td>
            <td style="border: 0.5pt solid black;">&nbsp;</td>
            <td style="border: 0.5pt solid black;">&nbsp;</td>
            <td style="border: 0.5pt solid black;">&nbsp;</td>
            <td style="border: 0.5pt solid black;">&nbsp;</td>
            <td style="border: 0.5pt solid black;">&nbsp;</td>
            <td style="border: 0.5pt solid black;">&nbsp;</td>
            <td style="border: 0.5pt solid black;">&nbsp;</td>
          </tr>
        `;
      }

      return `
        <html>
        <head>
          <style>
            @page { size: 8.5in 11in; margin: 0.4in; }
            body { font-family: "Times New Roman", serif; font-size: 10pt; line-height: 1.35; color: black; }
            table { border-collapse: collapse; width: 100%; margin-top: 10pt; }
            th { border: 0.5pt solid black; padding: 5pt; background-color: #f9fafb; text-align: center; font-weight: bold; font-size: 8.5pt; text-transform: uppercase; }
            td { border: 0.5pt solid black; padding: 5pt; font-size: 9.5pt; }
            .meta-info { width: 100%; margin-top: 10pt; margin-bottom: 8pt; border: 0.5pt solid black; background-color: #ffffff; }
            .meta-info td { border: none; padding: 4pt 6pt; font-size: 10pt; vertical-align: middle; }
            .checkbox-section { font-size: 9.5pt; border: 0.5pt solid black; padding: 8px; margin-top: 6px; }
            .sub-title { text-align: center; font-style: italic; font-size: 10px; color: #4b5563; margin-top: -2px; }
          </style>
        </head>
        <body>
          <div style="text-align: right; font-style: italic; font-weight: bold; font-size: 11pt;">Appendix 71</div>
          <div style="text-align: center; font-weight: bold; font-size: 9.5pt; text-transform: uppercase; color: #4b5563;">Province of Antique, Municipality of Tibiao</div>
          <h1 style="text-align: center; font-size: 17pt; font-weight: bold; margin: 3pt 0 0 0; letter-spacing: -0.2px; text-transform: uppercase;">INVENTORY TRANSFER REPORT</h1>
          <div class="sub-title">Departmental Property Custody Transfer Control Form</div>

          <table class="meta-info">
            <tr>
              <td style="width: 50%; border-right: 0.5pt solid black; border-bottom: 0.5pt solid black;"><b>Transfer Report No:</b> <span style="font-weight: bold; padding-left: 10px;">${itrNo || 'ITR-2024-001'}</span></td>
              <td style="width: 50%; border-bottom: 0.5pt solid black;"><b>Transfer Date:</b> <span style="font-weight: bold; padding-left: 10px;">${itrDate || 'Feb 10, 2024'}</span></td>
            </tr>
            <tr>
              <td style="border-right: 0.5pt solid black; border-bottom: 0.5pt solid black;"><b>From (Transferor):</b> <span style="font-weight: bold; color: #1e3a8a; padding-left: 10px; text-transform: uppercase;">${itrFromTransferor || 'JUAN DELA CRUZ'}</span></td>
              <td style="border-bottom: 0.5pt solid black;"><b>To (Transferee):</b> <span style="font-weight: bold; color: #065f46; padding-left: 10px; text-transform: uppercase;">${itrToTransferee || 'MARIA REYES'}</span></td>
            </tr>
            <tr>
              <td colspan="2"><b>Purpose of Transfer:</b> <span style="font-style: italic; font-size: 9pt; padding-left: 10px; color: #374151;">${itrPurpose || 'Transfer due to change in assignment'}</span></td>
            </tr>
          </table>

          <div class="checkbox-section">
            <span style="font-weight: bold; margin-right: 12px;">Type of Transfer:</span>
            <span style="margin-right: 18px;">
              <span style="font-family: monospace; font-size: 12pt; border: 1px solid black; padding: 0 4px; border-radius: 1px; line-height: 1; vertical-align: middle;">${itrType === 'donation' ? 'X' : '&nbsp;'}</span> Donation
            </span>
            <span style="margin-right: 18px;">
              <span style="font-family: monospace; font-size: 12pt; border: 1px solid black; padding: 0 4px; border-radius: 1px; line-height: 1; vertical-align: middle;">${itrType === 'relocation' ? 'X' : '&nbsp;'}</span> Relocation
            </span>
            <span style="margin-right: 18px;">
              <span style="font-family: monospace; font-size: 12pt; border: 1px solid black; padding: 0 4px; border-radius: 1px; line-height: 1; vertical-align: middle;">${itrType === 'reassignment' ? 'X' : '&nbsp;'}</span> Reassignment
            </span>
            <span style="margin-right: 18px;">
              <span style="font-family: monospace; font-size: 12pt; border: 1px solid black; padding: 0 4px; border-radius: 1px; line-height: 1; vertical-align: middle;">${itrType === 'sale' ? 'X' : '&nbsp;'}</span> Sale
            </span>
            <span>
              <span style="font-family: monospace; font-size: 12pt; border: 1px solid black; padding: 0 4px; border-radius: 1px; line-height: 1; vertical-align: middle;">${itrType === 'others' ? 'X' : '&nbsp;'}</span> Others: <span style="border-bottom: 0.5pt solid black; font-weight: bold; padding: 0 6px;">${itrType === 'others' ? (itrTypeOthers || 'N/A') : '___________________'}</span>
            </span>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 12%;">Acquisition Date</th>
                <th style="width: 16%;">Property No.</th>
                <th style="width: 8%;">Unit</th>
                <th style="width: 32%;">Description (Specification of Transfer)</th>
                <th style="width: 6%;">Qty</th>
                <th style="width: 12%;">Unit Cost</th>
                <th style="width: 14%;">Total Cost</th>
                <th style="width: 10%;">Condition</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
              ${emptyRowsHtml}
            </tbody>
          </table>

          <table style="width: 100%; border-collapse: collapse; border: 1.5px solid black; margin-top: 15px; font-size: 9pt; page-break-inside: avoid;">
            <tr>
              <td style="width: 33.3%; padding: 10px; border-right: 1px solid black; vertical-align: top;">
                <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 12px; font-size: 8.5pt;">Released/Transferred By:</div>
                <div style="border-bottom: 1px solid black; text-align: center; font-weight: bold; text-transform: uppercase; margin-top: 30px; margin-bottom: 2px; min-height: 18px; font-size: 9.5pt;">${itrFromTransferor || "Transferor Employee"}</div>
                <div style="font-size: 7.5pt; text-align: center; color: #374151; margin-bottom: 8px;">Signature over Printed Name</div>
                
                <div style="border-bottom: 1px solid black; text-align: center; font-weight: bold; text-transform: uppercase; margin-top: 15px; margin-bottom: 2px; min-height: 18px; font-size: 9.5pt;">${itrFromPosition || "Property Custodian / Supply Officer"}</div>
                <div style="font-size: 7.5pt; text-align: center; color: #374151; margin-bottom: 8px;">Designation</div>
                
                <div style="border-bottom: 1px solid black; text-align: center; font-weight: bold; text-transform: uppercase; margin-top: 15px; margin-bottom: 2px; min-height: 18px; font-size: 9.5pt;">${itrDate || "Date"}</div>
                <div style="font-size: 7.5pt; text-align: center; color: #374151;">Date</div>
              </td>
              <td style="width: 33.3%; padding: 10px; border-right: 1px solid black; vertical-align: top;">
                <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 12px; font-size: 8.5pt;">Approved By:</div>
                <div style="border-bottom: 1px solid black; text-align: center; font-weight: bold; text-transform: uppercase; margin-top: 30px; margin-bottom: 2px; min-height: 18px; font-size: 9.5pt;">${itrApprovedBy || "Approving Officer"}</div>
                <div style="font-size: 7.5pt; text-align: center; color: #374151; margin-bottom: 8px;">Signature over Printed Name</div>
                
                <div style="border-bottom: 1px solid black; text-align: center; font-weight: bold; text-transform: uppercase; margin-top: 15px; margin-bottom: 2px; min-height: 18px; font-size: 9.5pt;">${itrApprovedPosition || "Municipal Mayor"}</div>
                <div style="font-size: 7.5pt; text-align: center; color: #374151; margin-bottom: 8px;">Designation</div>
                
                <div style="border-bottom: 1px solid black; text-align: center; font-weight: bold; text-transform: uppercase; margin-top: 15px; margin-bottom: 2px; min-height: 18px; font-size: 9.5pt;">${itrDate || "Date"}</div>
                <div style="font-size: 7.5pt; text-align: center; color: #374151;">Date</div>
              </td>
              <td style="width: 33.3%; padding: 10px; vertical-align: top;">
                <div style="font-weight: bold; text-transform: uppercase; margin-bottom: 12px; font-size: 8.5pt;">Received By:</div>
                <div style="border-bottom: 1px solid black; text-align: center; font-weight: bold; text-transform: uppercase; margin-top: 30px; margin-bottom: 2px; min-height: 18px; font-size: 9.5pt;">${itrToTransferee || "Transferee Employee"}</div>
                <div style="font-size: 7.5pt; text-align: center; color: #374151; margin-bottom: 8px;">Signature over Printed Name</div>
                
                <div style="border-bottom: 1px solid black; text-align: center; font-weight: bold; text-transform: uppercase; margin-top: 15px; margin-bottom: 2px; min-height: 18px; font-size: 9.5pt;">${itrToPosition || "Transferee Employee / Recipient"}</div>
                <div style="font-size: 7.5pt; text-align: center; color: #374151; margin-bottom: 8px;">Designation</div>
                
                <div style="border-bottom: 1px solid black; text-align: center; font-weight: bold; text-transform: uppercase; margin-top: 15px; margin-bottom: 2px; min-height: 18px; font-size: 9.5pt;">${itrDate || "Date"}</div>
                <div style="font-size: 7.5pt; text-align: center; color: #374151;">Date</div>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
    }

    if (reportMode === 'rrsp') {
      const rowsHtml = reportRows.map((row, idx) => {
        const countVal = Number(row.qtyPhysicalCount) || 1;
        const costVal = Number(row.unitValue) || 0;
        return `
          <tr>
            <td style="border: 0.5pt solid black; text-align: center; font-family: monospace;">${row.propertyNumber || 'PR-0023'}</td>
            <td style="border: 0.5pt solid black;">
              <b>${row.article || 'RECEIPT ITEM'}</b><br/>
              <span style="font-size: 8.5pt; color: #555;">${row.description || ''}</span>
            </td>
            <td style="border: 0.5pt solid black; text-align: center; font-weight: bold;">${countVal}</td>
            <td style="border: 0.5pt solid black; text-align: right;">₱${costVal.toLocaleString(undefined, {minimumFractionDigits:2})}</td>
            <td style="border: 0.5pt solid black; text-align: right; font-weight: bold; color: blue;">₱${(countVal * costVal).toLocaleString(undefined, {minimumFractionDigits:2})}</td>
          </tr>
        `;
      }).join('');

      return `
        <html>
        <head>
          <style>
            @page { size: 13in 8.5in; margin: 0.5in; mso-page-orientation: landscape; }
            body { font-family: "Times New Roman", serif; font-size: 11pt; line-height: 1.3; }
            table { border-collapse: collapse; width: 100%; margin-top: 15pt; }
            th { border: 0.5pt solid black; padding: 6pt; background-color: #f3f4f6; text-align: center; font-weight: bold; }
            td { border: 0.5pt solid black; padding: 6pt; font-size: 10.5pt; }
            .meta-info { width: 100%; margin-bottom: 15pt; border: 0.5pt solid #ddd; padding: 10px; background-color: #fcfcfc; }
            .meta-info td { border: none; padding: 3pt 5pt; font-size: 11pt; }
          </style>
        </head>
        <body>
          <div style="text-align: right; font-style: italic; font-weight: bold;">Appendix 63</div>
          <div style="text-align: center; text-transform: uppercase; font-size: 10pt; color: gray; font-weight: bold;">PROVINCE OF ANTIQUE, MUNICIPALITY OF TIBIAO</div>
          <h1 style="text-align: center; font-size: 18pt; font-weight: bold; margin: 5pt 0 0 0;">REPORT ON THE RECEIPT OF PROPERTY</h1>
          <div style="text-align: center; font-style: italic; font-size: 10pt; margin-bottom: 20pt;">LGU Receipt of Semi-Expendable Property (RRSP) Control Document</div>

          <table class="meta-info">
            <tr>
              <td style="width: 50%;"><b>RRSP Form No:</b> <span style="border-bottom: 1px solid black; padding: 0 5%; font-weight: bold;">${rrspNo || 'RRSP-2024-001'}</span></td>
              <td style="width: 50%; text-align: right;"><b>RRSP Date:</b> <span style="border-bottom: 1px solid black; padding: 0 5%; font-weight: bold;">${rrspDate || 'Jan 18, 2024'}</span></td>
            </tr>
            <tr>
              <td><b>Accountable Code:</b> <span style="border-bottom: 1px solid black; font-weight: bold; color: blue;">${rrspAccountCode || '5020402002'}</span></td>
              <td style="text-align: right;"><b>Supplier / Source:</b> <span style="border-bottom: 1px solid black; font-weight: bold; uppercase;">${rrspSupplier || 'ABC SUPPLIES LTD'}</span></td>
            </tr>
            <tr>
              <td><b>OR / DV Reference:</b> <span style="border-bottom: 1px solid black; font-weight: bold;">${rrspOrDvNo || 'OR 221342'}</span></td>
              <td style="text-align: right;"><b>Date of Invoice:</b> <span style="border-bottom: 1px solid black; font-weight: bold;">${rrspOrDvDate || 'Jan 15, 2024'}</span></td>
            </tr>
          </table>

          <table>
            <thead>
              <tr>
                <th style="width: 15%;">Invoice Stock No.</th>
                <th style="width: 45%;">Item Description</th>
                <th style="width: 10%;">Qty Received</th>
                <th style="width: 15%;">Unit Cost</th>
                <th style="width: 15%;">Total Value</th>
              </tr>
            </thead>
            <tbody>
              ${rowsHtml}
            </tbody>
          </table>

          <table style="width: 100%; border: none; margin-top: 45pt;">
            <tr>
              <td style="border: none; width: 50%; text-align: left;">
                <div style="font-weight: bold; font-style: italic;">Received By (Supply Clerk):</div>
                <div style="margin-top: 40pt; border-bottom: 1pt solid black; display: inline-block; min-width: 220pt; text-align: center; font-weight: bold; text-transform: uppercase;">${rrspReceivedBy || 'JUAN DELA CRUZ'}</div>
                <div style="font-size: 8.5pt; color: gray; font-weight: bold; text-align: center; text-transform: uppercase; margin-top: 4pt;">Supply Officer I / Clerk</div>
              </td>
              <td style="border: none; width: 50%; text-align: right;">
                <div style="font-weight: bold; font-style: italic; text-align: left; padding-left: 100pt;">Approved & Verified By:</div>
                <div style="margin-top: 40pt; border-bottom: 1pt solid black; display: inline-block; min-width: 220pt; text-align: center; font-weight: bold; text-transform: uppercase;">${rrspApprovedBy || 'PEDRO L. SANTOS'}</div>
                <div style="font-size: 8.5pt; color: gray; font-weight: bold; text-align: center; text-transform: uppercase; margin-top: 4pt; padding-left: 100pt;">Treasurer / Mayor Designee</div>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `;
    }

    // Default Appendix 73 layout compiled rows
    const tableRows = reportRows.map((r, i) => `
      <tr>
        <td style="border: 0.5pt solid black; text-align: center; vertical-align: middle; padding-left: 1pt; padding-right: 1pt;">${i + 1}</td>
        ${visibleFields.article ? `<td style="border: 0.5pt solid black; vertical-align: middle; text-transform: uppercase; padding-left: 1pt; padding-right: 1pt;">${r.article || ''}</td>` : ''}
        ${visibleFields.description ? `<td style="border: 0.5pt solid black; vertical-align: middle; padding-left: 1pt; padding-right: 1pt;">${r.description || ''}</td>` : ''}
        ${visibleFields.propertyNumber ? `<td style="border: 0.5pt solid black; text-align: center; vertical-align: middle; padding-left: 1pt; padding-right: 1pt;">${r.propertyNumber || ''}</td>` : ''}
        ${visibleFields.condition ? `<td style="border: 0.5pt solid black; text-align: center; vertical-align: middle; padding-left: 1pt; padding-right: 1pt;">${r.condition || 'New'}</td>` : ''}
        ${visibleFields.unitOfMeasure ? `<td style="border: 0.5pt solid black; text-align: center; vertical-align: middle; padding-left: 1pt; padding-right: 1pt;">${r.unitOfMeasure || ''}</td>` : ''}
        ${visibleFields.unitValue ? `<td style="border: 0.5pt solid black; text-align: right; vertical-align: middle; padding-left: 1pt; padding-right: 1pt;">${(Number(r.unitValue) || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>` : ''}
        ${visibleFields.qtyPropertyCard ? `<td style="border: 0.5pt solid black; text-align: center; vertical-align: middle; padding-left: 1pt; padding-right: 1pt;">${r.qtyPropertyCard || '0'}</td>` : ''}
        ${visibleFields.qtyPhysicalCount ? `<td style="border: 0.5pt solid black; text-align: center; vertical-align: middle; padding-left: 1pt; padding-right: 1pt;">${r.qtyPhysicalCount || '0'}</td>` : ''}
        ${visibleFields.shortageQty ? `<td style="border: 0.5pt solid black; text-align: center; vertical-align: middle; color: red; padding-left: 1pt; padding-right: 1pt;">${r.shortageQty || ''}</td>` : ''}
        ${visibleFields.shortageValue ? `<td style="border: 0.5pt solid black; text-align: right; vertical-align: middle; color: red; padding-left: 1pt; padding-right: 1pt;">${(Number(r.shortageValue) || 0) === 0 ? '-' : (Number(r.shortageValue) || 0).toLocaleString(undefined, {minimumFractionDigits:2})}</td>` : ''}
        ${visibleFields.remarks ? `<td style="border: 0.5pt solid black; vertical-align: middle; padding-left: 1pt; padding-right: 1pt;">${r.remarks || ''}</td>` : ''}
      </tr>
    `).join('');

    const qtyColSpan = (visibleFields.qtyPropertyCard ? 1 : 0) + (visibleFields.qtyPhysicalCount ? 1 : 0);
    const shortageColSpan = (visibleFields.shortageQty ? 1 : 0) + (visibleFields.shortageValue ? 1 : 0);

    const summaryColSpan1 = 1 + (visibleFields.article ? 1 : 0) + (visibleFields.description ? 1 : 0) + (visibleFields.propertyNumber ? 1 : 0) + (visibleFields.condition ? 1 : 0) + (visibleFields.unitOfMeasure ? 1 : 0);
    const summaryColSpan2 = (visibleFields.qtyPropertyCard ? 1 : 0) + (visibleFields.qtyPhysicalCount ? 1 : 0) + (visibleFields.shortageQty ? 1 : 0);
    const summaryColSpan3 = (visibleFields.remarks ? 1 : 0);

    const totalCols = (visibleFields.article ? 1 : 0) + 
                     (visibleFields.description ? 1 : 0) + 
                     (visibleFields.propertyNumber ? 1 : 0) + 
                     (visibleFields.condition ? 1 : 0) + 
                     (visibleFields.unitOfMeasure ? 1 : 0) + 
                     (visibleFields.unitValue ? 1 : 0) + 
                     (visibleFields.qtyPropertyCard ? 1 : 0) + 
                     (visibleFields.qtyPhysicalCount ? 1 : 0) + 
                     (visibleFields.shortageQty ? 1 : 0) + 
                     (visibleFields.shortageValue ? 1 : 0) + 
                     (visibleFields.remarks ? 1 : 0) + 1;

    const summaryRow = `
      <tr style="background-color: #f3f4f6; font-weight: bold;">
        <td style="border: 0.5pt solid black; text-align: center; text-transform: uppercase; padding: 4pt; font-size: 11pt;" colspan="${summaryColSpan1}">TOTAL ASSET VALUE</td>
        ${visibleFields.unitValue ? `
          <td style="border: 0.5pt solid black; text-align: right; font-weight: bold; padding: 4pt; vertical-align: bottom;">
            <div style="font-size: 11pt;">${reportRows.reduce((s, r) => s + (Number(r.unitValue) || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </td>` : ''}
        ${summaryColSpan2 > 0 ? `<td style="border: 0.5pt solid black;" colspan="${summaryColSpan2}"></td>` : ''}
        ${visibleFields.shortageValue ? `
          <td style="border: 0.5pt solid black; text-align: right; font-weight: bold; color: #1e3a8a; padding: 4pt; vertical-align: bottom;">
            <div style="font-size: 11pt;">${totalValue === 0 ? '-' : totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
          </td>` : ''}
        ${summaryColSpan3 > 0 ? `<td style="border: 0.5pt solid black;" colspan="${summaryColSpan3}"></td>` : ''}
      </tr>
      <tr>
        <td colspan="${totalCols}" style="border: 0.5pt solid black; padding: 0;">
          <table style="width: 100%; border-collapse: collapse; border: none !important;">
            <tr>
              <td style="padding: 10pt; width: 33.3%; text-align: center; vertical-align: top; border: none !important;">
                <div style="font-style: italic; font-size: 10pt; font-weight: bold; text-align: left; margin-bottom: 50pt;">Certified Correct by:</div>
                <div style="border-bottom: 1pt solid black; font-weight: bold; text-transform: uppercase; display: inline-block; min-width: 220pt; padding-bottom: 2pt; font-size: 12pt;">${committeeChair}</div>
                <div style="font-size: 8pt; font-weight: bold; text-transform: uppercase; margin-top: 4pt; line-height: 1.1;">Signature over Printed Name of <br/>Inventory Committee Chair and Members</div>
              </td>
              <td style="padding: 10pt; width: 33.3%; text-align: center; vertical-align: top; border: none !important;">
                <div style="font-style: italic; font-size: 10pt; font-weight: bold; text-align: left; margin-bottom: 50pt;">Approved by:</div>
                <div style="border-bottom: 1pt solid black; font-weight: bold; text-transform: uppercase; display: inline-block; min-width: 220pt; padding-bottom: 2pt; font-size: 12pt;">${headOfAgency}</div>
                <div style="font-size: 8pt; font-weight: bold; text-transform: uppercase; margin-top: 4pt; line-height: 1.1;">Signature over Printed Name of Head of Agency/Entity or Authorized Representative</div>
              </td>
              <td style="padding: 10pt; width: 33.3%; text-align: center; vertical-align: top; border: none !important;">
                <div style="font-style: italic; font-size: 10pt; font-weight: bold; text-align: left; margin-bottom: 50pt;">Verified by:</div>
                <div style="border-bottom: 1pt solid black; font-weight: bold; text-transform: uppercase; display: inline-block; min-width: 220pt; padding-bottom: 2pt; font-size: 12pt;">${coaRep}</div>
                <div style="font-size: 8pt; font-weight: bold; text-transform: uppercase; margin-top: 4pt; line-height: 1.1;">Signature over Printed Name of COA Representative</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    `;

    return `
      <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="utf-8">
        <!--[if gte mso 9]>
        <xml>
          <w:WordDocument>
            <w:View>Print</w:View>
            <w:NormalView/>
            <w:Zoom>100</w:Zoom>
            <w:DoNotOptimizeForBrowser/>
            <w:PageWidth>18720</w:PageWidth>
            <w:PageHeight>12240</w:PageHeight>
          </w:WordDocument>
          <o:OfficeDocumentSettings>
            <o:AllowPNG/>
          </o:OfficeDocumentSettings>
        </xml>
        <![endif]-->
        <style>
          @page {
            size: 13in 8.5in;
            margin: 0.5in;
            mso-page-orientation: landscape;
            mso-paper-source: 0;
          }
          body { font-family: "Times New Roman", serif; font-size: 11pt; line-height: 1.2; }
          table { border-collapse: collapse; width: 100%; }
          th { border: 0.5pt solid black; font-weight: bold; text-transform: uppercase; background-color: #f3f4f6; font-size: 9pt; text-align: center; padding: 5pt; }
          td { border: 0.5pt solid black; padding: 4pt; font-size: 10pt; }
          .header-text { text-align: center; margin-bottom: 25pt; }
          .appendix { text-align: right; font-style: italic; font-weight: bold; margin-bottom: 5pt; }
          .title { font-size: 14pt; font-weight: bold; text-transform: uppercase; margin: 0; }
          .subtitle { font-size: 11pt; font-style: italic; margin-top: 2pt; }
          .classification { font-size: 12pt; font-weight: bold; text-transform: uppercase; text-decoration: underline; margin-top: 10pt; }
          .as-of { font-size: 11pt; margin-top: 2pt; }
          .metadata { margin-bottom: 10pt; }
          .fund-cluster { font-size: 11pt; font-weight: bold; }
          .accountability { font-size: 11pt; text-align: justify; margin-top: 5pt; }
        </style>
      </head>
      <body>
        <div class="appendix">Appendix 73</div>
        <div class="header-text">
          <h1 class="title">REPORT ON THE PHYSICAL COUNT OF PROPERTY, PLANT AND EQUIPMENT</h1>
          <div class="subtitle">(Type of Property, Plant and Equipment)</div>
          <div class="classification">${reportType || '_____________________'}</div>
          <div class="as-of">As of ${reportDate}</div>
        </div>
        
        <div class="metadata">
          <div class="fund-cluster">Fund Cluster: ${fundCluster || '______'}</div>
          <div class="accountability">
            For which <b>${accountablePerson || '_____________________'}</b>, ${accountablePosition || '_____________________'}, ${accountableLocation || '_____________________'}, is accountable, having assumed such accountability on <b>${accountabilityDate}</b>.
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th rowspan="2" style="width: 30pt;">No.</th>
              ${visibleFields.article ? '<th rowspan="2">ARTICLE</th>' : ''}
              ${visibleFields.description ? '<th rowspan="2">DESCRIPTION</th>' : ''}
              ${visibleFields.propertyNumber ? '<th rowspan="2">PROPERTY NUMBER</th>' : ''}
              ${visibleFields.condition ? '<th rowspan="2" style="width: 80pt;">CONDITION</th>' : ''}
              ${visibleFields.unitOfMeasure ? '<th rowspan="2" style="width: 60pt;">UNIT OF MEASURE</th>' : ''}
              ${visibleFields.unitValue ? '<th rowspan="2" style="width: 80pt;">UNIT VALUE</th>' : ''}
              ${qtyColSpan > 0 ? `<th colspan="${qtyColSpan}">QUANTITY</th>` : ''}
              ${shortageColSpan > 0 ? `<th colspan="${shortageColSpan}">SHORTAGE/OVERAGE</th>` : ''}
              ${visibleFields.remarks ? '<th rowspan="2" style="width: 100pt;">REMARKS</th>' : ''}
            </tr>
            <tr>
              ${visibleFields.qtyPropertyCard ? '<th style="font-size: 8pt; width: 70pt;">per PROPERTY CARD</th>' : ''}
              ${visibleFields.qtyPhysicalCount ? '<th style="font-size: 8pt; width: 70pt;">per PHYSICAL COUNT</th>' : ''}
              ${visibleFields.shortageQty ? '<th style="font-size: 8pt; width: 60pt;">Quantity</th>' : ''}
              ${visibleFields.shortageValue ? '<th style="font-size: 8pt; width: 80pt;">Value</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${tableRows}
            ${summaryRow}
          </tbody>
        </table>

        ${auditNotes ? `
          <div style="margin-top: 30pt; border-top: 1px solid #ccc; padding-top: 15pt;">
            <p style="font-family: sans-serif; font-size: 11pt; font-weight: bold; text-transform: uppercase; margin: 0 0 5pt 0; color: #1f2937;">Official Audit Notes & Findings</p>
            <p style="font-family: sans-serif; font-size: 10pt; font-style: italic; font-weight: normal; color: #374151; line-height: 1.4; margin: 0; white-space: pre-wrap;">"${auditNotes}"</p>
            ${editingReportId && savedReports.find(r => r.id === editingReportId)?.auditNotesDetail ? (() => {
              const detail = savedReports.find(r => r.id === editingReportId)!.auditNotesDetail!;
              return `
                <div style="font-family: monospace; font-size: 8pt; color: #6b7280; font-weight: bold; text-transform: uppercase; margin-top: 10pt;">
                  Saved: ${new Date(detail.savedAt || detail.lastModified || '').toLocaleString()} | 
                  Created By: ${detail.createdBy || ''} | 
                  Dept: ${detail.office || ''} | 
                  Session: ${detail.auditSession || ''}
                </div>
              `;
            })() : ''}
          </div>
        ` : ''}
      </body>
      </html>
    `;
  };

  const handleExport = (type: 'xls' | 'doc') => {
    const blob = new Blob(['\ufeff', getExportMarkup(type)], {
      type: type === 'xls' ? 'application/vnd.ms-excel' : 'application/msword'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `LGU_Tibiao_Report_${Date.now()}.${type}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleAssetSelection = () => {
    const selectedItems = items.filter(item => pickerSelectedIds.has(item.id));
    const newRows: ReportRow[] = selectedItems.map(item => ({
      ...item,
      tempId: Math.random().toString(36).substr(2, 9),
      shortageQty: (item.qtyPropertyCard || 0) - (item.qtyPhysicalCount || 0),
      shortageValue: ((item.qtyPropertyCard || 0) - (item.qtyPhysicalCount || 0)) * (item.unitValue || 0)
    }));
    setReportRows([...reportRows, ...newRows]);
    setShowAssetPicker(false);
    setPickerSelectedIds(new Set());
  };

  const startBlankAudit = () => {
    setEditingReportId(null);
    setReportRows([]);
    setReportType('NEW AUDIT');
    setReportOfficeFilter('');
    setReportCategoryFilter('');
    setIsViewOnly(false);
    setActiveTab('generator');
    setAuditNotes('');
  };

  const resetReportSession = () => {
    setIsViewOnly(false);
    setAuditNotes('');
    if (reportMode === 'par') {
      console.log("[LGU Seeder] Restoring official MDRRMO PAR-ICS baseline records on reset...");
      const mappedRows = OFFICIAL_LGU_INVENTORY.map(item => ({
        ...item,
        tempId: Math.random().toString(36).substr(2, 9),
        shortageQty: (item.qtyPropertyCard || 0) - (item.qtyPhysicalCount || 0),
        shortageValue: ((item.qtyPropertyCard || 0) - (item.qtyPhysicalCount || 0)) * (item.unitValue || 0)
      }));
      setReportRows(mappedRows);
      setReportType("MDRRMO PAR-ICS UNIFIED REGISTRY");
      setFundCluster("General Fund");
      setIcsNo("MDRRMO-PAR-2024-001");
      setIcsDateIssued("October 2024");
      setIcsEmployeeName("NORMAN I. ALABADO");
      setIcsEmployeePosition("LDRRMO II/ MDRRMO");
      setIcsIssuedBy("CLEMENS G. BANDOJA");
    } else {
      setReportRows([{
        tempId: Math.random().toString(36).substr(2, 9),
        article: '',
        description: '',
        propertyNumber: '',
        unitOfMeasure: 'unit',
        unitValue: 0,
        qtyPropertyCard: 1,
        qtyPhysicalCount: 1,
        remarks: '',
        shortageQty: 0,
        shortageValue: 0
      }]);
      setReportType('');
      setFundCluster('');
      setIcsNo('ICS-2024-001');
      setIcsDateIssued('Jan. 20, 2024');
      setIcsEmployeeName('JUAN DELA CRUZ');
      setIcsEmployeePosition('Administrative Assistant III');
      setIcsIssuedBy('MARIA S. REYES');
    }
    const today = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    setReportDate(today);
    setAccountablePerson('');
    setAccountablePosition('');
    setAccountableLocation('');
    setAccountabilityDate(today);
    setCommitteeChair('');
    setHeadOfAgency('');
    setHeadPosition('');
    setCoaRep('');
    setReportOfficeFilter('');
    setReportCategoryFilter('');
    setEditingReportId(null);
  };

  const handleAutoPrint = () => {
    if (reportRows.length === 0) {
      alert('Cannot print an empty report. Please add assets first.');
      return;
    }
    
    // Log printing action in the system logs
    const logPrint = async () => {
      try {
        await addDoc(collection(db, 'system_logs'), {
          timestamp: new Date(),
          user: currentUserName,
          action: `Printed Official Form/Report: ${reportType || 'GENERAL'} [Mode: ${reportMode?.toUpperCase()}]`,
          module: "Reporting"
        });
      } catch (err) {
        console.error('Failed to log printing action:', err);
      }
    };
    logPrint();

    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    printWindow.document.write(getExportMarkup('doc'));
    printWindow.document.close();
    
    // Allow time for the window to load and styles to apply
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
      // printWindow.close(); // Optional: close after print
    }, 500);
  };

  return (
    <div className="space-y-6 pb-24 text-gray-900">
      {/* Asset Picker Modal */}
      {showAssetPicker && (
        <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-md z-[150] flex items-center justify-center p-4">
          <div className="bg-white rounded-[40px] w-full max-w-4xl max-h-[85vh] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in duration-300">
            <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-blue-600 text-white">
              <div>
                <h3 className="font-brand font-black text-2xl uppercase tracking-tighter italic">Select Assets to Add</h3>
                <p className="text-blue-100 text-[10px] font-bold uppercase tracking-widest mt-1">Pick items from LGU Master Inventory</p>
              </div>
              <button 
                onClick={() => setShowAssetPicker(false)}
                className="p-3 bg-white/10 hover:bg-white/20 rounded-2xl transition-all"
              >
                <svg className="w-6 h-6 outline-none" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row gap-4 items-center">
              <div className="flex bg-white border border-gray-200 rounded-2xl p-1 w-full max-w-xs shadow-sm">
                <select 
                  value={pickerOfficeFilter} 
                  onChange={(e) => setPickerOfficeFilter(e.target.value)}
                  className="w-full bg-transparent px-4 py-2 text-[10px] font-black uppercase tracking-widest outline-none"
                >
                  <option value="">Filter by Dept: All</option>
                  {Array.from(new Set(items.map(i => i.office))).sort().map(off => (
                    <option key={off} value={off}>{off}</option>
                  ))}
                </select>
              </div>
              <div className="text-[10px] font-black uppercase tracking-widest text-gray-400">
                {pickerSelectedIds.size} Items Selected
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
              <div className="grid grid-cols-1 gap-3">
                {items
                  .filter(i => !pickerOfficeFilter || i.office === pickerOfficeFilter)
                  .map(item => (
                    <div 
                      key={item.id} 
                      onClick={() => {
                        const next = new Set(pickerSelectedIds);
                        if (next.has(item.id)) next.delete(item.id);
                        else next.add(item.id);
                        setPickerSelectedIds(next);
                      }}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center gap-4 ${pickerSelectedIds.has(item.id) ? 'bg-blue-50 border-blue-200 shadow-sm' : 'bg-white border-gray-100 hover:border-gray-200'}`}
                    >
                      <div className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${pickerSelectedIds.has(item.id) ? 'bg-blue-600 border-blue-600 text-white' : 'border-gray-200 bg-white'}`}>
                        {pickerSelectedIds.has(item.id) && <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" d="M5 13l4 4L19 7" /></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start">
                          <span className="text-sm font-black text-gray-900 uppercase truncate pr-4">{item.article}</span>
                          <span className="text-[9px] font-black text-gray-400 uppercase tracking-widest">{item.propertyNumber}</span>
                        </div>
                        <div className="flex gap-2 mt-1">
                          <span className="text-[8px] font-bold text-blue-600 uppercase tracking-tight bg-blue-50 px-1.5 py-0.5 rounded">{item.office}</span>
                          <span className="text-[8px] font-bold text-gray-400 uppercase tracking-tight bg-gray-50 px-1.5 py-0.5 rounded">{item.category}</span>
                        </div>
                      </div>
                    </div>
                  ))
                }
              </div>
            </div>

            <div className="p-8 bg-gray-50 border-t border-gray-100 flex justify-end gap-4">
              <button 
                onClick={() => setShowAssetPicker(false)}
                className="px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-gray-900 transition-all"
              >
                Cancel
              </button>
              <button 
                onClick={handleAssetSelection}
                disabled={pickerSelectedIds.size === 0}
                className="px-10 py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-100 transition-all flex items-center gap-2"
              >
                Add Selected to Report
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Workstation UI Header */}
      <div className={`no-print flex flex-col items-center justify-between bg-white/70 backdrop-blur-2xl px-6 py-4 rounded-[32px] border border-white shadow-2xl gap-4 sticky top-0 z-50 transition-all duration-500 overflow-hidden ${isWorkstationMinimized ? 'h-[72px]' : 'min-h-[140px]'}`}>
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-black text-gray-900 font-brand tracking-tighter uppercase italic">Registry Workstation</h2>
            <button 
              onClick={() => setIsWorkstationMinimized(!isWorkstationMinimized)}
              className="p-2 bg-gray-100 hover:bg-gray-200 rounded-xl transition-all text-gray-500 hover:text-gray-900 shadow-sm"
              title={isWorkstationMinimized ? 'Expand Workstation' : 'Minimize Workstation'}
            >
              {isWorkstationMinimized ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" /></svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M5 15l7-7 7 7" /></svg>
              )}
            </button>
            <div className={`flex bg-gray-100 p-1 rounded-2xl space-x-1 transition-all duration-300`}>
              <button onClick={startBlankAudit} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'generator' && !editingReportId ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>New Manual Audit</button>
              {currentRole !== 'ACCOUNTING' && (
                <>
                  <button onClick={() => setActiveTab('archive')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'archive' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}>Audit Vault ({savedReports.length})</button>
                </>
              )}
            </div>
          </div>

          <div className={`flex gap-2 transition-all duration-300 ${isWorkstationMinimized ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10 pointer-events-none'}`}>
             <button onClick={() => setIsWorkstationMinimized(false)} className="bg-blue-600 text-white px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg transition-all">Restore Tools</button>
          </div>
        </div>

        {activeTab === 'generator' && !isWorkstationMinimized && (
          <div className="flex flex-wrap w-full gap-4 items-center justify-between pb-2 border-t border-gray-50 pt-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center bg-white border border-gray-100 rounded-2xl shadow-sm p-1">
                <select 
                  value={reportOfficeFilter} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setReportOfficeFilter(val);
                    const validCats = getCategoriesForOffice(val);
                    let targetCategory = reportCategoryFilter;
                    if (!validCats.includes(reportCategoryFilter)) {
                      targetCategory = validCats[0] || '';
                      setReportCategoryFilter(targetCategory);
                    }
                    populateFromInventory(val, targetCategory);
                  }}
                  className="bg-transparent text-gray-700 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest outline-none"
                >
                  <option value="">Dept: All</option>
                  {Array.from(new Set(items.map(i => i.office))).sort().map(office => (
                    <option key={office} value={office}>{office}</option>
                  ))}
                </select>
                
                <div className="w-[1px] h-4 bg-gray-200 mx-1"></div>

                <select 
                  value={reportCategoryFilter} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setReportCategoryFilter(val);
                    populateFromInventory(reportOfficeFilter, val);
                  }}
                  className="bg-transparent text-gray-700 px-3 py-1.5 rounded-xl text-[11px] font-black uppercase tracking-widest outline-none"
                >
                  {!reportOfficeFilter && <option value="">Type: All</option>}
                  {getCategoriesForOffice(reportOfficeFilter).map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <button 
                onClick={populateFromInventory}
                title="Sync with Inventory"
                className="p-3 bg-white border border-gray-100 rounded-2xl text-blue-600 hover:bg-blue-50 transition-all shadow-sm active:scale-90"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
              </button>

              <div className="flex bg-blue-50/50 p-1 rounded-2xl space-x-1 ml-2 items-center">
                {currentRole !== 'ACCOUNTING' && (
                  <>
                    <button onClick={() => setReportMode('appendix73')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${reportMode === 'appendix73' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Appendix 73</button>
                    <button onClick={() => setReportMode('levels')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${reportMode === 'levels' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Levels</button>
                    <button onClick={() => setReportMode('reorder')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${reportMode === 'reorder' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Reorder</button>
                    <button onClick={() => setReportMode('depreciation')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${reportMode === 'depreciation' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Depreciation</button>
                    <button onClick={() => setReportMode('allocation')} className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${reportMode === 'allocation' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Allocation</button>
                    <span className="text-gray-300 px-1 font-light">|</span>
                  </>
                )}

                <select
                  value={['spc', 'splc', 'ics', 'regsip', 'itr', 'rrsp', 'par'].includes(reportMode) ? reportMode : ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      setReportMode(e.target.value);
                    }
                  }}
                  className={`px-3 py-2 bg-transparent rounded-xl text-[9px] font-black uppercase tracking-widest transition-all border-none outline-none cursor-pointer ${['spc', 'splc', 'ics', 'regsip', 'itr', 'rrsp', 'par'].includes(reportMode) ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 bg-transparent'}`}
                >
                  <option value="" disabled className="text-gray-400">Official GAM Forms</option>
                  {currentRole === 'ACCOUNTING' ? (
                    <>
                      <option value="par">PAR - Property Acknowledgement Receipt (Annex B)</option>
                      <option value="ics">ICS - Inventory Custodian Slip (App. 59)</option>
                    </>
                  ) : (
                    <>
                      <option value="spc">SPC - Supplies Property Card (App. 54)</option>
                      <option value="splc">SPLC - Supplies Ledger Card (App. 55)</option>
                      <option value="regsip">REG SIP - Registry of Property (App. 64)</option>
                      <option value="itr">ITR - Inventory Transfer Report (App. 71)</option>
                      <option value="rrsp">RRSP - Receipt of Property (App. 63)</option>
                    </>
                  )}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center">
              {reportMode === 'appendix73' && (
                <div className="relative">
                  <button 
                    onClick={() => setShowColumnPicker(!showColumnPicker)} 
                    className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2 transition-all"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
                    Fields
                  </button>
                  
                  {showColumnPicker && (
                    <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-3xl shadow-2xl border border-gray-100 p-6 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="text-[10px] font-black uppercase tracking-widest text-gray-400">Toggle Fields</h4>
                        <button onClick={() => setShowColumnPicker(false)} className="text-gray-400 hover:text-gray-900">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                      <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {Object.entries({
                          article: 'Article',
                          description: 'Description',
                          propertyNumber: 'Property No.',
                          condition: 'Item Condition',
                          unitOfMeasure: 'Unit',
                          unitValue: 'Unit Value',
                          qtyPropertyCard: 'Property Card Qty',
                          qtyPhysicalCount: 'Physical Count Qty',
                          shortageQty: 'Shortage Qty',
                          shortageValue: 'Shortage Value',
                          remarks: 'Remarks'
                        }).map(([field, label]) => (
                          <label key={field} className="flex items-center group cursor-pointer">
                            <div className="relative flex items-center">
                              <input 
                                type="checkbox" 
                                className="sr-only" 
                                checked={visibleFields[field as keyof VisibleFields]} 
                                onChange={() => setVisibleFields({ ...visibleFields, [field]: !visibleFields[field as keyof VisibleFields] })}
                              />
                              <div className={`w-10 h-5 rounded-full transition-all ${visibleFields[field as keyof VisibleFields] ? 'bg-blue-600' : 'bg-gray-200'}`}></div>
                              <div className={`absolute left-1 w-3 h-3 bg-white rounded-full transition-all ${visibleFields[field as keyof VisibleFields] ? 'translate-x-5' : 'translate-x-0'}`}></div>
                            </div>
                            <span className="ml-3 text-[10px] font-bold uppercase tracking-tight text-gray-600 group-hover:text-gray-900 transition-colors">
                              {label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!isViewOnly && (
                <>
                  <button onClick={addRow} className="bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2 transition-all active:scale-95">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg> Blank Row
                  </button>
                  <button 
                    onClick={resetReportSession} 
                    className="bg-white border border-red-100 text-red-500 hover:bg-red-50 px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2 transition-all active:scale-95"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg> Clear All
                  </button>
                  <button 
                    onClick={() => {
                      setPickerOfficeFilter(reportOfficeFilter);
                      setShowAssetPicker(true);
                    }} 
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all active:scale-95 text-nowrap"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 6h16M4 12h16m-7 6h7" /></svg> Choose Assets
                  </button>
                  <button onClick={() => handleLockArchive('Draft')} disabled={isSaving} className="bg-amber-500 hover:bg-amber-600 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all active:scale-95">
                    {isSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 4v16m8-8H4" /></svg>}
                    Save Draft
                  </button>
                  {(currentRole === 'OFFICE_HEAD' || currentRole === 'ACCOUNTING') && (
                    <button 
                      onClick={() => {
                        const payload = {
                          report_type: reportType,
                          fund_cluster: fundCluster,
                          report_date: reportDate,
                          accountable_person: accountablePerson,
                          accountable_position: accountablePosition,
                          accountability_date: accountabilityDate,
                          committee_chair: committeeChair,
                          head_of_agency: headOfAgency,
                          head_position: headPosition,
                          coa_rep: coaRep,
                          total_value: totalValue,
                          item_count: reportRows.length,
                          items_snapshot: reportRows,
                          status: 'Finalized' as const,
                          reportMode: reportMode,
                          spcStockNo,
                          spcReorderLevel,
                          spcUnitCost,
                          spcNotedBy,
                          splcStockNo,
                          splcUnitCost,
                          splcAccountCode,
                          splcApprovedBy,
                          icsNo,
                          icsDateIssued,
                          icsEmployeeName,
                          icsEmployeePosition,
                          icsIssuedBy,
                          regsipPreparedBy,
                          regsipApprovedBy,
                          itrNo,
                          itrDate,
                          itrFromTransferor,
                          itrToTransferee,
                          itrPurpose,
                          rrspNo,
                          rrspDate,
                          rrspAccountCode,
                          rrspSupplier,
                          rrspOrDvNo,
                          rrspOrDvDate,
                          rrspReceivedBy,
                          rrspApprovedBy,
                        };
                        handleForwardReport(editingReportId, payload);
                      }} 
                      id="btn-send-to-administrator"
                      disabled={isSaving} 
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all active:scale-95 animate-pulse"
                    >
                      {isSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
                      {currentRole === 'ACCOUNTING' ? 'Send to Administrator' : 'Forward to Engineer/Admin'}
                    </button>
                  )}
                  {currentRole !== 'ACCOUNTING' && (
                    <button onClick={() => handleLockArchive('Finalized')} disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 transition-all active:scale-95">
                      {isSaving ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>}
                      Lock Archive
                    </button>
                  )}
                  <div className="h-8 w-px bg-gray-200 mx-2 hidden xl:block"></div>
                </>
              )}
              <button onClick={handleAutoPrint} className="bg-white border border-gray-200 text-teal-700 hover:bg-teal-50 px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-sm flex items-center gap-2 transition-all active:scale-95">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" /></svg>
                Auto Print
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Real-time Notifications Banner Area */}
      {activeNotifications.length > 0 && (
        <div className="space-y-3 no-print">
          {activeNotifications.map(notif => (
            <div 
              key={notif.id} 
              className={`p-5 rounded-[24px] shadow-lg border flex flex-col md:flex-row md:items-center justify-between gap-4 animate-in slide-in-from-top-3 duration-300 ${
                notif.type === 'DECISION' 
                  ? 'bg-amber-50 border-amber-200 text-amber-900' 
                  : 'bg-indigo-50 border-indigo-200 text-indigo-900'
              }`}
            >
              <div className="flex items-start gap-3.5">
                <div className="text-lg mt-0.5">
                  {notif.type === 'DECISION' ? '🔔' : '📨'}
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-800">
                    {notif.type === 'DECISION' ? 'Workflow Status Decision' : 'New Report Submission Alert'}
                  </p>
                  <p className="text-xs font-semibold mt-1">{notif.message}</p>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                    Received: {new Date(notif.timestamp).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 self-end md:self-center">
                {notif.reportId && notif.reportId !== 'new' && (
                  <button 
                    onClick={() => {
                      const rep = savedReports.find(r => r.id === notif.reportId);
                      if (rep) {
                        loadFromArchive(rep);
                      }
                      dismissNotification(notif.id);
                    }} 
                    className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all shadow-md"
                  >
                    View Report
                  </button>
                )}
                <button 
                  onClick={() => dismissNotification(notif.id)} 
                  className="px-4 py-2 bg-white/85 hover:bg-white text-slate-600 rounded-xl text-[9px] font-black uppercase tracking-widest border border-slate-200 shadow-sm transition-all"
                >
                  Dismiss
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'transfers' ? (
        <InventoryTransferReport 
          items={items}
          userRole={currentRole}
          userOffice={currentOffice}
          userName={currentUserName}
          onUpdateItem={onUpdateItem}
        />
      ) : activeTab === 'generator' ? (
        <div className="space-y-6">
          {(() => {
            const selectedReport = savedReports.find(r => r.id === editingReportId);
            if (!selectedReport) return null;
            
            if (currentRole === 'ADMIN' && selectedReport.forwardedAt) {
              return (
                <div className="bg-slate-950 text-white p-6 md:p-8 rounded-[40px] border border-slate-900 shadow-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 animate-in slide-in-from-top-4 duration-300">
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">
                        Incoming Official Report
                      </span>
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest ${
                        selectedReport.status === 'Approved' ? 'bg-green-600 text-white' :
                        selectedReport.status === 'Rejected' ? 'bg-red-600 text-white' :
                        selectedReport.status === 'Returned for Revision' ? 'bg-orange-600 text-white' : 'bg-amber-600 text-white animate-pulse'
                      }`}>
                        Status: {selectedReport.status || 'Pending Approval'}
                      </span>
                    </div>
                    <h4 className="text-lg font-black uppercase tracking-tight font-brand">Submitted by: {selectedReport.submittedByOffice}</h4>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                      Sender: <span className="text-white">{selectedReport.senderName}</span> | Sent: {new Date(selectedReport.forwardedAt).toLocaleString()}
                    </p>
                    
                    {/* Admin Remarks Text Area */}
                    <div className="mt-4 pt-4 border-t border-slate-800 space-y-1">
                      <label className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Review Comments / Engineer Admin Remarks</label>
                      <input 
                        type="text" 
                        placeholder="e.g. 'Audit verified. Found all assets accounted for correctly.'" 
                        className="w-full bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 rounded-xl px-4 py-2.5 focus:outline-none focus:border-blue-500 font-bold"
                        defaultValue={selectedReport.adminRemarks || ''}
                        onBlur={async (e) => {
                          try {
                            await updateDoc(doc(db, 'reports', selectedReport.id), { adminRemarks: e.target.value });
                          } catch (err) {
                            console.error("Remarks error:", err);
                          }
                        }}
                      />
                    </div>
                  </div>
                  
                  {/* Review Actions */}
                  <div className="flex flex-wrap gap-2.5">
                    <button 
                      onClick={async () => {
                        const comments = (document.querySelector('input[placeholder*="Audit verified"]') as HTMLInputElement)?.value || '';
                        const timestamp = new Date().toISOString();
                        const history = [
                          ...(selectedReport.history || []),
                          {
                            id: Math.random().toString(36).substr(2, 9),
                            timestamp,
                            action: 'ApprovedByAdmin',
                            details: `Official Report APPROVED by Engineer/Admin ${currentUserName}. Remarks: "${comments}".`
                          }
                        ];
                        try {
                          await updateDoc(doc(db, 'reports', selectedReport.id), { 
                            forwardedStatus: 'Approved',
                            status: 'Approved',
                            history,
                            adminRemarks: comments
                          });
                          await addDoc(collection(db, 'system_logs'), {
                            timestamp: new Date(),
                            user: currentUserName,
                            action: `APPROVED Official Report from ${selectedReport.submittedByOffice}.`,
                            module: "Reporting"
                          });
                          await addDoc(collection(db, 'notifications'), {
                            recipientRole: 'OFFICE_HEAD',
                            recipientOffice: selectedReport.submittedByOffice,
                            message: `Your Official Report "${selectedReport.report_type}" has been APPROVED by the Engineer/Admin.`,
                            timestamp,
                            isRead: false,
                            type: 'DECISION',
                            reportId: selectedReport.id
                          });
                          await addDoc(collection(db, 'notifications'), {
                            recipientRole: 'ACCOUNTING',
                            message: `TRANSACTION COMPLETED: Official Report "${selectedReport.report_type}" from ${selectedReport.submittedByOffice || 'Office'} has been APPROVED and completed by Engineer/Admin (${currentUserName}).`,
                            timestamp,
                            isRead: false,
                            type: 'COMPLETED_TRANSACTION',
                            reportId: selectedReport.id
                          });
                          alert('Report status changed to APPROVED.');
                        } catch (err) { alert('Failed updating status'); }
                      }}
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95"
                    >
                      Approve
                    </button>
                    <button 
                      onClick={async () => {
                        const comments = (document.querySelector('input[placeholder*="Audit verified"]') as HTMLInputElement)?.value || '';
                        const timestamp = new Date().toISOString();
                        const history = [
                          ...(selectedReport.history || []),
                          {
                            id: Math.random().toString(36).substr(2, 9),
                            timestamp,
                            action: 'RejectedByAdmin',
                            details: `Official Report REJECTED by Engineer/Admin ${currentUserName}. Remarks: "${comments}".`
                          }
                        ];
                        try {
                          await updateDoc(doc(db, 'reports', selectedReport.id), { 
                            forwardedStatus: 'Rejected',
                            status: 'Rejected',
                            history,
                            adminRemarks: comments
                          });
                          await addDoc(collection(db, 'system_logs'), {
                            timestamp: new Date(),
                            user: currentUserName,
                            action: `REJECTED Official Report from ${selectedReport.submittedByOffice}.`,
                            module: "Reporting"
                          });
                          await addDoc(collection(db, 'notifications'), {
                            recipientRole: 'OFFICE_HEAD',
                            recipientOffice: selectedReport.submittedByOffice,
                            message: `Your Official Report "${selectedReport.report_type}" has been REJECTED by the Engineer/Admin.`,
                            timestamp,
                            isRead: false,
                            type: 'DECISION',
                            reportId: selectedReport.id
                          });
                          alert('Report status changed to REJECTED.');
                        } catch (err) { alert('Failed updating status'); }
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95"
                    >
                      Reject
                    </button>
                    <button 
                      onClick={async () => {
                        const comments = (document.querySelector('input[placeholder*="Audit verified"]') as HTMLInputElement)?.value || '';
                        const timestamp = new Date().toISOString();
                        const history = [
                          ...(selectedReport.history || []),
                          {
                            id: Math.random().toString(36).substr(2, 9),
                            timestamp,
                            action: 'ReturnedForRevision',
                            details: `Official Report returned for revision by Engineer/Admin ${currentUserName}. Remarks: "${comments}".`
                          }
                        ];
                        try {
                          await updateDoc(doc(db, 'reports', selectedReport.id), { 
                            forwardedStatus: 'Pending',
                            status: 'Returned for Revision',
                            history,
                            adminRemarks: comments
                          });
                          await addDoc(collection(db, 'system_logs'), {
                            timestamp: new Date(),
                            user: currentUserName,
                            action: `Returned Official Report from ${selectedReport.submittedByOffice} for revision.`,
                            module: "Reporting"
                          });
                          await addDoc(collection(db, 'notifications'), {
                            recipientRole: 'OFFICE_HEAD',
                            recipientOffice: selectedReport.submittedByOffice,
                            message: `Your Official Report "${selectedReport.report_type}" has been returned for revisions. Details: "${comments}".`,
                            timestamp,
                            isRead: false,
                            type: 'DECISION',
                            reportId: selectedReport.id
                          });
                          alert('Report returned to Office Head for revision.');
                        } catch (err) { alert('Failed updating status'); }
                      }}
                      className="bg-orange-600 hover:bg-orange-700 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95"
                    >
                      Return with Comments
                    </button>
                    
                    <div className="w-[1px] h-8 bg-slate-800 mx-1 hidden md:block"></div>
                    
                    <button 
                      onClick={async () => {
                        try {
                          await updateDoc(doc(db, 'reports', selectedReport.id), { isArchived: !selectedReport.isArchived });
                          alert(selectedReport.isArchived ? 'Restored report from records folder.' : 'Report archived successfully.');
                        } catch (err) { alert('Failed to archive'); }
                      }}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95"
                    >
                      {selectedReport.isArchived ? 'Restore' : 'Archive'}
                    </button>
                  </div>
                </div>
              );
            }
            
            if ((currentRole === 'OFFICE_HEAD' || currentRole === 'ACCOUNTING') && selectedReport.forwardedAt) {
              return (
                <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-[36px] flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-in duration-300">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="bg-indigo-600 text-white px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest">
                        Forwarded Official Report
                      </span>
                      <span className={`px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${
                        selectedReport.forwardedStatus === 'Approved' ? 'bg-green-100 text-green-800 border border-green-200' :
                        selectedReport.forwardedStatus === 'Rejected' ? 'bg-red-100 text-red-800 border border-red-200' :
                        selectedReport.forwardedStatus === 'Reviewed' ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-gray-100 text-gray-800 border border-gray-200'
                      }`}>
                        Review Status: {selectedReport.forwardedStatus || 'Pending'}
                      </span>
                    </div>
                    <p className="text-slate-800 text-sm font-bold uppercase mt-1">Submitted tracking to Municipal Administrator</p>
                    <p className="text-[9px] text-gray-500 font-bold uppercase tracking-wider">
                      Sent on: {new Date(selectedReport.forwardedAt).toLocaleString()}
                    </p>
                    {selectedReport.adminRemarks && (
                      <div className="bg-white/60 p-4 rounded-2xl border border-indigo-200/40 text-[11px] text-rose-950 font-semibold mt-2 italic">
                        <span className="font-sans font-black text-[9px] block uppercase text-indigo-800 tracking-widest not-italic mb-1">Feedback from Municipal Admin / Engineer:</span>
                        "{selectedReport.adminRemarks}"
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            
            return null;
          })()}
          {renderReportBody()}

          {/* Save Audit Notes Form Section */}
          <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-xl mt-8 no-print space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center text-lg shadow-sm">📝</div>
                <div>
                  <h4 className="text-sm font-black uppercase text-slate-900 tracking-tight">Audit Investigation Remarks & Notes</h4>
                  <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Log custom validation notes or findings for this audit session</p>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[8.5px] font-black uppercase tracking-widest ${isViewOnly ? 'bg-red-50 text-red-600 border border-red-200' : 'bg-green-50 text-green-600 border border-green-200'}`}>
                {isViewOnly ? 'READ ONLY (Locked)' : 'EDITABLE'}
              </span>
            </div>

            <div className="space-y-4">
              <textarea
                placeholder="Write physical count discrepancies, audit remarks, recommendations, or validation notes..."
                value={auditNotes}
                onChange={(e) => setAuditNotes(e.target.value)}
                disabled={isViewOnly}
                rows={4}
                className="w-full bg-slate-50 border border-gray-150 p-5 rounded-2xl text-xs font-semibold outline-none focus:bg-white focus:border-indigo-500 disabled:opacity-75 disabled:cursor-not-allowed text-slate-800 placeholder-gray-400"
              />

              {!isViewOnly ? (
                <div className="flex justify-between items-center bg-gray-50 p-4 rounded-2xl border border-gray-100">
                  <div className="text-[8.5px] text-gray-400 font-bold uppercase tracking-widest space-y-1">
                    <div>User: <span className="font-extrabold text-gray-700">{currentUserName}</span> ({currentOffice || 'Office'})</div>
                    <div>Session Key: <span className="font-mono font-extrabold text-indigo-600">
                      {editingReportId ? `Session-${editingReportId.substring(0,6).toUpperCase()}` : 'New Active Session'}
                    </span></div>
                  </div>
                  <button
                    onClick={() => handleSaveAuditNotes(auditNotes)}
                    disabled={isSaving}
                    id="btn-save-audit-notes"
                    className="bg-slate-900 hover:bg-slate-800 text-white font-black text-[9px] uppercase tracking-widest px-6 py-3 rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2"
                  >
                    {isSaving ? (
                      <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                    Save Audit Notes
                  </button>
                </div>
              ) : (
                editingReportId && savedReports.find(r => r.id === editingReportId)?.auditNotesDetail && (() => {
                  const detail = savedReports.find(r => r.id === editingReportId)!.auditNotesDetail!;
                  return (
                    <div className="bg-slate-50 p-5 rounded-2xl border border-slate-100 space-y-2">
                      <div className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Metadata Footprint</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-[9px] font-extrabold uppercase text-slate-600 tracking-wider">
                        <div>
                          <span className="font-medium text-slate-400 block mb-0.5">Author</span>
                          {detail.createdBy}
                        </div>
                        <div>
                          <span className="font-medium text-slate-400 block mb-0.5">Office</span>
                          {detail.office}
                        </div>
                        <div>
                          <span className="font-medium text-slate-400 block mb-0.5">Audit Session</span>
                          <span className="font-mono text-indigo-600">{detail.auditSession}</span>
                        </div>
                        <div>
                          <span className="font-medium text-slate-400 block mb-0.5">Last Saved</span>
                          {new Date(detail.savedAt || detail.lastModified).toLocaleString()}
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>
          </div>

          {/* Official Audit Trail Section */}
          {(() => {
            const selectedReport = savedReports.find(r => r.id === editingReportId);
            if (!selectedReport || !selectedReport.history || selectedReport.history.length === 0) return null;
            return (
              <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-xl mt-8 no-print">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-8 h-8 bg-indigo-50 rounded-xl flex items-center justify-center text-lg shadow-sm">📜</div>
                  <div>
                    <h4 className="text-sm font-black uppercase text-slate-900 tracking-tight">Official Report Audit Trail</h4>
                    <p className="text-[9px] text-gray-400 font-bold uppercase mt-0.5">Complete history of security events & status changes</p>
                  </div>
                </div>
                <div className="relative border-l-2 border-dashed border-gray-150 pl-6 ml-3 space-y-6">
                  {selectedReport.history.map((log: any, index: number) => (
                    <div key={log.id || index} className="relative">
                      {/* Timeline node */}
                      <div className="absolute -left-[30px] top-1 w-3.5 h-3.5 bg-indigo-600 border-2 border-white rounded-full shadow-sm"></div>
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="bg-indigo-50 text-indigo-700 px-2.5 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest border border-indigo-100">{log.action}</span>
                          <span className="text-[10px] text-gray-400 font-bold">{new Date(log.timestamp).toLocaleString()}</span>
                        </div>
                        <p className="text-[11px] text-slate-700 font-semibold mt-1.5">{log.details}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Sub-tab filter widgets */}
          {currentRole === 'ADMIN' ? (
            <div className="flex gap-2 pb-2 border-b border-gray-100">
              <button 
                onClick={() => setVaultSubTab('all')} 
                className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${vaultSubTab === 'all' ? 'bg-gray-900 text-white shadow-md' : 'bg-white border border-gray-100 text-gray-500 hover:text-gray-900 shadow-sm'}`}
              >
                All System Audits ({savedReports.filter(r => !r.isArchived).length})
              </button>
              <button 
                onClick={() => setVaultSubTab('incoming')} 
                className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all relative ${vaultSubTab === 'incoming' ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-gray-100 text-gray-500 hover:text-gray-900 shadow-sm'}`}
              >
                Incoming Office Reports
                {savedReports.filter(r => r.forwardedAt && r.forwardedStatus === 'Pending' && !r.isArchived).length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full animate-bounce">
                    {savedReports.filter(r => r.forwardedAt && r.forwardedStatus === 'Pending' && !r.isArchived).length}
                  </span>
                )}
              </button>
              <button 
                onClick={() => setVaultSubTab('archived')} 
                className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${vaultSubTab === 'archived' ? 'bg-red-600 text-white shadow-md' : 'bg-white border border-gray-100 text-gray-500 hover:text-gray-900 shadow-sm'}`}
              >
                Archived Records ({savedReports.filter(r => r.isArchived).length})
              </button>
            </div>
          ) : (currentRole === 'OFFICE_HEAD' || currentRole === 'ACCOUNTING') ? (
            <div className="flex gap-2 pb-2 border-b border-gray-100">
              <button 
                onClick={() => setVaultSubTab('drafts')} 
                className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all ${vaultSubTab === 'drafts' ? 'bg-gray-900 text-white shadow-md' : 'bg-white border border-gray-100 text-gray-500 hover:text-gray-900 shadow-sm'}`}
              >
                My Saved Audits / Drafts ({savedReports.filter(r => r.submittedByOffice === currentOffice && !r.forwardedAt).length})
              </button>
              <button 
                onClick={() => setVaultSubTab('forwarded')} 
                className={`px-5 py-2.5 rounded-full text-[9px] font-black uppercase tracking-widest transition-all relative ${vaultSubTab === 'forwarded' ? 'bg-blue-600 text-white shadow-md' : 'bg-white border border-gray-100 text-gray-500 hover:text-gray-900 shadow-sm'}`}
              >
                Forwarded to Admin ({savedReports.filter(r => r.submittedByOffice === currentOffice && r.forwardedAt).length})
                {savedReports.filter(r => r.submittedByOffice === currentOffice && r.forwardedAt && r.forwardedStatus === 'Pending').length > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">
                    {savedReports.filter(r => r.submittedByOffice === currentOffice && r.forwardedAt && r.forwardedStatus === 'Pending').length}
                  </span>
                )}
              </button>
            </div>
          ) : null}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
             {isFetching ? (
               <div className="col-span-full py-48 flex flex-col items-center">
                 <div className="w-14 h-14 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                 <p className="mt-8 text-[11px] font-black uppercase tracking-[0.4em] text-gray-400">Opening High-Security Vault...</p>
               </div>
             ) : displayedReports.length > 0 ? displayedReports.map(report => (
               <div key={report.id} className="bg-white p-8 rounded-[48px] border border-gray-100 shadow-xl flex flex-col hover:border-blue-400 hover:shadow-2xl hover:-translate-y-1 transition-all group relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-6 flex gap-2 opacity-0 group-hover:opacity-100 transition-all z-10">
                    <button onClick={() => loadFromArchive(report, true)} className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all shadow-md" title="Duplicate Audit"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg></button>
                    <button onClick={() => loadFromArchive(report)} className="p-3 bg-blue-50 text-blue-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all shadow-md"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg></button>
                    <button onClick={() => deleteReport(report.id)} className="p-3 bg-red-50 text-red-600 rounded-2xl hover:bg-red-600 hover:text-white transition-all shadow-md"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                  </div>
                  
                  {report.forwardedAt ? (
                    <div className="mb-6 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                        </div>
                        <div className="flex flex-col">
                          <span className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-indigo-200">Forwarded Report</span>
                          {report.forwardedStatus === 'Pending' && <span className="text-[8px] font-bold text-amber-600 uppercase tracking-widest mt-1 ml-1 flex items-center gap-1"><div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></div> Pending review</span>}
                          {report.forwardedStatus === 'Reviewed' && <span className="text-[8px] font-bold text-indigo-600 uppercase tracking-widest mt-1 ml-1 flex items-center gap-1">● Reviewed & Cleared</span>}
                          {report.forwardedStatus === 'Approved' && <span className="text-[8px] font-bold text-green-600 uppercase tracking-widest mt-1 ml-1 flex items-center gap-1">✔ Approved</span>}
                          {report.forwardedStatus === 'Rejected' && <span className="text-[8px] font-bold text-red-600 uppercase tracking-widest mt-1 ml-1 flex items-center gap-1">✘ Rejected</span>}
                        </div>
                      </div>
                      {report.submittedByOffice && (
                        <span className="bg-gray-50 text-gray-500 px-2.5 py-1 rounded-xl text-[8px] font-black uppercase border border-gray-100 truncate max-w-[120px]">
                          {report.submittedByOffice}
                        </span>
                      )}
                    </div>
                  ) : (
                    <div className="mb-6 flex items-center space-x-3">
                      <div className="w-10 h-10 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-100">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>
                      </div>
                      <div className="flex flex-col">
                        <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest border border-blue-200">Archive Block</span>
                        {report.status === 'Draft' && <span className="text-[8px] font-bold text-amber-600 uppercase tracking-widest mt-1 ml-1 flex items-center gap-1"><div className="w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse"></div> Draft Mode</span>}
                      </div>
                    </div>
                  )}
                  
                  <h3 className="text-2xl font-black uppercase text-gray-900 mb-2 leading-tight group-hover:text-blue-600 transition-colors pr-12">{report.report_type}</h3>
                  <div className="flex items-center space-x-2 text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-6">
                     <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                     <span>Audit Date: {report.report_date}</span>
                  </div>

                  {/* Saved Audit Notes Preview on Vault Card */}
                  {report.auditNotesDetail?.notes ? (
                    <div className="mb-6 bg-slate-50/80 border border-slate-100 p-5 rounded-[24px] text-[11px] text-slate-700 font-medium leading-relaxed">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1">
                          <span>📝</span> Notes Logs
                        </span>
                        <span className="text-[7.5px] font-mono text-indigo-600 font-black uppercase tracking-widest bg-indigo-50 px-2 py-0.5 rounded-full">
                          {report.auditNotesDetail.auditSession}
                        </span>
                      </div>
                      <p className="line-clamp-2 italic text-slate-600 font-sans">"{report.auditNotesDetail.notes}"</p>
                      <div className="mt-3 flex items-center justify-between text-[7px] text-gray-400 font-black uppercase tracking-widest font-mono pt-2 border-t border-slate-100/55">
                        <span>By: {report.auditNotesDetail.createdBy}</span>
                        <span>{new Date(report.auditNotesDetail.savedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  ) : report.audit_notes ? (
                    <div className="mb-6 bg-slate-50/80 border border-slate-100 p-5 rounded-[24px] text-[11px] text-slate-700 font-medium">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest flex items-center gap-1">
                          <span>📝</span> Notes Logs
                        </span>
                      </div>
                      <p className="line-clamp-2 italic text-slate-600 font-sans">"{report.audit_notes}"</p>
                    </div>
                  ) : (
                    <div className="mb-6 py-5 border border-dashed border-gray-150 rounded-[24px] flex items-center justify-center text-[8px] text-gray-400 font-black uppercase tracking-widest bg-slate-50/30">
                      No Investigation Notes Logged
                    </div>
                  )}
                  
                  <div className="mt-auto bg-gray-50 p-6 rounded-[36px] flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-gray-100 group-hover:bg-blue-50 group-hover:border-blue-100 transition-all">
                     <div>
                       <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-1">Audit Valuation</p>
                       <span className="text-xl font-black text-gray-900 tracking-tighter text-nowrap">₱ {report.total_value.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                     </div>
                     <div className="flex gap-2 w-full sm:w-auto">
                       {(currentRole === 'OFFICE_HEAD' || currentRole === 'ACCOUNTING') && !report.forwardedAt && (
                         <button 
                           onClick={(e) => {
                             e.stopPropagation();
                             handleForwardReport(report.id, report);
                           }}
                           disabled={isSaving}
                           className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-md flex items-center gap-1.5"
                         >
                           <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                           {currentRole === 'ACCOUNTING' ? 'Send' : 'Forward'}
                         </button>
                       )}
                       <button onClick={() => loadFromArchive(report)} className="bg-white px-6 py-3 rounded-2xl text-blue-600 text-[10px] font-black uppercase tracking-[0.2em] border border-blue-100 shadow-sm group-hover:bg-blue-600 group-hover:text-white transition-all active:scale-95">Verify</button>
                     </div>
                  </div>
               </div>
             )) : (
               <div className="col-span-full py-60 text-center border-4 border-dashed border-gray-100 rounded-[80px] flex flex-col items-center justify-center space-y-8">
                  <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center text-gray-200">
                     <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
                  </div>
                  <div>
                     <p className="text-[14px] font-black uppercase tracking-[0.5em] text-gray-300">No locked archives in vault</p>
                     <p className="text-[10px] font-bold text-gray-400 mt-2 uppercase tracking-widest">Generate your first audit to secure municipal records</p>
                  </div>
                  <button 
                    onClick={() => setActiveTab('generator')}
                    className="bg-blue-600 text-white px-12 py-4 rounded-3xl text-[10px] font-black uppercase tracking-widest shadow-2xl hover:bg-blue-700 transition-all active:scale-95"
                  >
                    Initiate New Session
                  </button>
               </div>
             )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Reports;
