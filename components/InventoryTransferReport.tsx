import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { 
  collection, 
  addDoc, 
  doc, 
  updateDoc, 
  deleteDoc,
  onSnapshot, 
  query, 
  orderBy, 
  serverTimestamp, 
  getDoc,
  runTransaction 
} from 'firebase/firestore';
import { InventoryItem, GeneratedReport, UserRole } from '../types';
import { 
  Plus, 
  Trash2, 
  Search, 
  Building2, 
  User, 
  UserCheck,
  Check, 
  X, 
  Send, 
  Calendar, 
  AlertCircle,
  FileSpreadsheet,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Printer,
  ChevronRight,
  ArrowRightLeft,
  Edit3,
  Save
} from 'lucide-react';

interface InventoryTransferReportProps {
  items: InventoryItem[];
  userRole?: string;
  userOffice?: string;
  userName?: string;
  onUpdateItem?: (id: string, updates: Partial<InventoryItem>) => void;
}

export const InventoryTransferReport: React.FC<InventoryTransferReportProps> = ({
  items: propItems,
  userRole = 'STAFF',
  userOffice = 'General Office',
  userName = 'System User',
  onUpdateItem
}) => {
  // Real-time collections state
  const [items, setItems] = useState<InventoryItem[]>(propItems);
  const [transfers, setTransfers] = useState<GeneratedReport[]>([]);
  const [isFetching, setIsFetching] = useState(true);
  
  // Tabs and selection
  const [activeSubTab, setActiveSubTab] = useState<'tracker' | 'new_transfer' | 'history'>('tracker');
  const [selectedTransfer, setSelectedTransfer] = useState<GeneratedReport | null>(null);
  const [hasItrChanges, setHasItrChanges] = useState<boolean>(false);

  useEffect(() => {
    setHasItrChanges(false);
  }, [selectedTransfer?.id]);
  
  // Selection / Search state for creation form
  const [searchItemTerm, setSearchItemTerm] = useState('');
  const [itemCategoryFilter, setItemCategoryFilter] = useState('All');
  
  // Creation form state
  const [fromOffice, setFromOffice] = useState(userOffice);
  const [toOffice, setToOffice] = useState('');
  const [itrNo, setItrNo] = useState(() => `ITR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
  const [itrDate, setItrDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [itrFromTransferor, setItrFromTransferor] = useState(userName);
  const [itrFromPosition, setItrFromPosition] = useState('Property Custodian / Supply Representative');
  const [itrToTransferee, setItrToTransferee] = useState('');
  const [itrToPosition, setItrToPosition] = useState('Office Staff / Recipient');
  const [itrApprovedBy, setItrApprovedBy] = useState('HON. JOCELYN R. CABRERA');
  const [itrApprovedPosition, setItrApprovedPosition] = useState('Municipal Mayor');
  const [itrPurpose, setItrPurpose] = useState('');
  const [itrType, setItrType] = useState<'reassignment' | 'donation' | 'relocation' | 'sale' | 'others'>('reassignment');
  const [itrTypeOthers, setItrTypeOthers] = useState('');
  
  // Selected items to transfer
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  
  // UI States
  const [isSaving, setIsSaving] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [rejectionRemarks, setRejectionRemarks] = useState('');
  const [showRejectionForm, setShowRejectionForm] = useState(false);

  // Current editing draft reference ID
  const [editingTransferId, setEditingTransferId] = useState<string | null>(null);

  // Form step for multi-step process
  const [formStep, setFormStep] = useState(1);

  // Search and status filters for overall list
  const [searchTerm, setSearchTerm] = useState('');
  const [historySearchTerm, setHistorySearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Draft' | 'For Approval' | 'Completed' | 'Rejected'>('All');
  const [officeFilter, setOfficeFilter] = useState('All');

  // Load inventory items and transfers in real-time
  useEffect(() => {
    // Subscribe to inventory items
    const itemsRef = collection(db, 'inventory_items');
    const unsubscribeItems = onSnapshot(itemsRef, (snapshot) => {
      const fetchedItems = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InventoryItem[];
      setItems(fetchedItems);
    }, (error) => {
      console.error('[ITR] Items loading failed:', error);
    });

    // Subscribe to ITR reports
    const reportsRef = collection(db, 'reports');
    const qReports = query(reportsRef, orderBy('created_at', 'desc'));
    const unsubscribeReports = onSnapshot(qReports, (snapshot) => {
      const allReports = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as GeneratedReport[];
      
      // Filter reports of type 'itr'
      const itrReports = allReports.filter(r => r.report_type === 'itr');
      setTransfers(itrReports);
      setIsFetching(false);
    }, (error) => {
      console.error('[ITR] Transfers loading failed:', error);
      setIsFetching(false);
    });

    return () => {
      unsubscribeItems();
      unsubscribeReports();
    };
  }, []);

  // Sync prop items if firestore subscriber fails
  useEffect(() => {
    if (propItems && propItems.length > 0 && items.length === 0) {
      setItems(propItems);
    }
  }, [propItems]);

  // Unique list of offices
  const officesList = useMemo(() => {
    const offices = new Set<string>();
    items.forEach(item => {
      if (item.office) offices.add(item.office);
    });
    // Add default user offices if missing
    if (userOffice) offices.add(userOffice);
    return Array.from(offices).sort();
  }, [items, userOffice]);

  // Filtered items available for transfer from the selected source office
  const availableItemsForTransfer = useMemo(() => {
    return items.filter(item => {
      // Must be in the selected source office
      const matchesOffice = item.office === fromOffice;
      // Filter out items already marked condemed/lost
      const matchesStatus = item.status !== 'CONDEMNED' && item.status !== 'LOST';
      // Search filters
      const matchesSearch = 
        item.article.toLowerCase().includes(searchItemTerm.toLowerCase()) ||
        item.propertyNumber.toLowerCase().includes(searchItemTerm.toLowerCase()) ||
        (item.description && item.description.toLowerCase().includes(searchItemTerm.toLowerCase()));
      // Category filter
      const matchesCategory = itemCategoryFilter === 'All' || item.category === itemCategoryFilter;

      return matchesOffice && matchesStatus && matchesSearch && matchesCategory;
    });
  }, [items, fromOffice, searchItemTerm, itemCategoryFilter]);

  // Unique categories of available items
  const itemCategories = useMemo(() => {
    const cats = new Set<string>();
    items.forEach(item => {
      if (item.category) cats.add(item.category);
    });
    return Array.from(cats).sort();
  }, [items]);

  // Handle selected items toggle
  const toggleItemSelection = (id: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  // List of selected items' full payloads
  const selectedTransferItems = useMemo(() => {
    return items.filter(item => selectedItemIds.has(item.id));
  }, [items, selectedItemIds]);

  // Total transfer value
  const totalTransferValue = useMemo(() => {
    return selectedTransferItems.reduce((sum, item) => sum + (Number(item.unitValue) || 0) * (Number(item.qtyPhysicalCount) || 1), 0);
  }, [selectedTransferItems]);

  // Filter transfers list
  const filteredTransfers = useMemo(() => {
    return transfers.filter(t => {
      let matchesStatus = true;
      if (statusFilter !== 'All') {
        if (statusFilter === 'For Approval') {
          matchesStatus = t.status === 'For Approval' || t.status === 'Pending Approval';
        } else if (statusFilter === 'Completed') {
          matchesStatus = t.status === 'Completed' || t.status === 'Approved';
        } else {
          matchesStatus = t.status === statusFilter;
        }
      }
      const matchesOffice = officeFilter === 'All' || t.itrFromOffice === officeFilter || t.itrToOffice === officeFilter;
      
      const searchLower = searchTerm.toLowerCase();
      const matchesSearch = 
        (t.itrNo && t.itrNo.toLowerCase().includes(searchLower)) ||
        (t.itrFromTransferor && t.itrFromTransferor.toLowerCase().includes(searchLower)) ||
        (t.itrToTransferee && t.itrToTransferee.toLowerCase().includes(searchLower)) ||
        (t.itrPurpose && t.itrPurpose.toLowerCase().includes(searchLower));

      return matchesStatus && matchesOffice && matchesSearch;
    });
  }, [transfers, statusFilter, officeFilter, searchTerm]);

  // Handle setting a success toast
  const triggerSuccess = (msg: string) => {
    setActionSuccess(msg);
    setActionError(null);
    setTimeout(() => setActionSuccess(null), 6000);
  };

  // Handle ITR Form Creation Submission
  const handleSubmitTransfer = async (status: 'Draft' | 'For Approval') => {
    if (selectedItemIds.size === 0) {
      setActionError('Please select at least one inventory item to transfer.');
      return;
    }
    if (!toOffice) {
      setActionError('Please specify the destination office.');
      return;
    }
    if (!itrToTransferee) {
      setActionError("Please provide the receiving employee's name.");
      return;
    }
    if (fromOffice === toOffice) {
      setActionError('Source office and destination office cannot be the same department.');
      return;
    }

    setIsSaving(true);
    setActionError(null);

    try {
      const reportPayload = {
        report_type: 'itr',
        fund_cluster: '01 - General Fund',
        report_date: itrDate,
        accountable_person: itrFromTransferor,
        accountable_position: itrFromPosition,
        accountability_date: itrDate,
        committee_chair: '',
        head_of_agency: itrApprovedBy,
        head_position: itrApprovedPosition,
        coa_rep: '',
        total_value: totalTransferValue,
        item_count: selectedTransferItems.length,
        items_snapshot: selectedTransferItems,
        status: status,
        reportMode: 'itr',
        
        // Critical filtering and sorting fields matching Reports.tsx
        submittedByOffice: fromOffice,
        senderName: userName,
        
        // Custom Inventory Transfer Report fields
        itrNo,
        itrDate,
        itrFromTransferor,
        itrToTransferee,
        itrPurpose: itrPurpose || 'Office reassignment / Custodian transfer',
        itrType,
        itrTypeOthers: itrType === 'others' ? itrTypeOthers : '',
        itrApprovedBy,
        itrApprovedPosition,
        itrFromPosition,
        itrToPosition,
        itrFromOffice: fromOffice,
        itrToOffice: toOffice,
      };

      if (editingTransferId) {
        // Update existing document
        const reportDocRef = doc(db, 'reports', editingTransferId);
        const reportDocSnap = await getDoc(reportDocRef);
        let existingHistory = [];
        let existingCreatedAt = null;
        if (reportDocSnap.exists()) {
          const docData = reportDocSnap.data();
          existingHistory = docData.history || [];
          existingCreatedAt = docData.created_at || null;
        }

        const editHistoryEntry = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          action: 'UPDATED',
          details: `Transfer Request ${itrNo} updated and saved as ${status} by ${userName}.`
        };

        await updateDoc(reportDocRef, {
          ...reportPayload,
          created_at: existingCreatedAt || serverTimestamp(),
          history: [...existingHistory, editHistoryEntry]
        });

        // Store notification for admins or reviewers if pending
        if (status === 'For Approval') {
          await addDoc(collection(db, 'notifications'), {
            recipientRole: 'ADMIN',
            message: `Official transfer request "${itrNo}" (${fromOffice} ➔ ${toOffice}) has been submitted/updated by ${userName} and is awaiting review.`,
            timestamp: new Date().toISOString(),
            isRead: false,
            type: 'SUBMISSION',
            reportId: editingTransferId
          });
        }

        // Add to audit logs
        await addDoc(collection(db, 'system_logs'), {
          timestamp: new Date(),
          user: userName,
          action: `Updated ITR ${itrNo} from ${fromOffice} to ${toOffice} (${status}).`,
          module: 'Reporting'
        });

        triggerSuccess(`Transfer slip ${itrNo} successfully updated as ${status}.`);
      } else {
        // Create main report document
        const newHistoryEntry = {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          action: 'CREATED',
          details: `Transfer Request ${itrNo} created in ${status} status by ${userName}.`
        };

        const docRef = await addDoc(collection(db, 'reports'), {
          ...reportPayload,
          created_at: serverTimestamp(),
          history: [newHistoryEntry]
        });
        
        // Store notification for admins or reviewers if pending
        if (status === 'For Approval') {
          await addDoc(collection(db, 'notifications'), {
            recipientRole: 'ADMIN',
            message: `Official transfer request "${itrNo}" (${fromOffice} ➔ ${toOffice}) has been submitted by ${userName} and is awaiting review.`,
            timestamp: new Date().toISOString(),
            isRead: false,
            type: 'SUBMISSION',
            reportId: docRef.id
          });
        }

        // Add to audit logs
        await addDoc(collection(db, 'system_logs'), {
          timestamp: new Date(),
          user: userName,
          action: `Created ITR ${itrNo} from ${fromOffice} to ${toOffice} (${status}).`,
          module: 'Reporting'
        });

        triggerSuccess(`Transfer slip ${itrNo} successfully saved as ${status}.`);
      }
      
      // Reset form
      setSelectedItemIds(new Set());
      setToOffice('');
      setItrToTransferee('');
      setItrPurpose('');
      setEditingTransferId(null);
      setItrNo(`ITR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
      setActiveSubTab('tracker');
    } catch (err) {
      console.error('[ITR] Failed to save/update:', err);
      setActionError('Validation / database sync failed. Check your internet connection.');
    } finally {
      setIsSaving(false);
    }
  };

  // Save metadata changes to an existing transfer report directly from the previewer
  const handleSaveItrChanges = async () => {
    if (!selectedTransfer || !selectedTransfer.id) return;
    setIsSaving(true);
    setActionError(null);
    try {
      const reportRef = doc(db, 'reports', selectedTransfer.id);
      
      const updatedFields = {
        itrNo: selectedTransfer.itrNo || '',
        itrDate: selectedTransfer.itrDate || '',
        itrFromTransferor: selectedTransfer.itrFromTransferor || '',
        itrToTransferee: selectedTransfer.itrToTransferee || '',
        itrPurpose: selectedTransfer.itrPurpose || '',
      };

      const editHistoryEntry = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        action: 'METADATA_UPDATED',
        details: `Metadata fields modified directly on viewer: ITR No=${selectedTransfer.itrNo}, Date=${selectedTransfer.itrDate} by ${userName}.`
      };

      const existingHistory = selectedTransfer.history || [];

      await updateDoc(reportRef, {
        ...updatedFields,
        history: [...existingHistory, editHistoryEntry]
      });

      // Update local selectedTransfer state with new history
      setSelectedTransfer({
        ...selectedTransfer,
        ...updatedFields,
        history: [...existingHistory, editHistoryEntry]
      });

      setHasItrChanges(false);
      triggerSuccess('Report metadata updated successfully.');
    } catch (err) {
      console.error('[ITR] Failed to update metadata:', err);
      setActionError('Failed to save metadata changes.');
    } finally {
      setIsSaving(false);
    }
  };

  // Execute approval workflow & automate updates to inventory item ownership records via Firestore transaction
  const handleApproveTransfer = async (transfer: GeneratedReport) => {
    if (!transfer.id) return;
    setIsSaving(true);
    setActionError(null);

    const fromDept = transfer.itrFromOffice || 'Unassigned';
    const toDept = transfer.itrToOffice || 'Unassigned';
    const transfereeEmp = transfer.itrToTransferee || 'Unassigned';
    const transferorEmp = transfer.itrFromTransferor || 'Unassigned';
    const itemsSnapshot = transfer.items_snapshot || [];

    try {
      console.log(`[ITR] Initiating automated ownership updates via Transaction for ITR: ${transfer.itrNo}`);
      
      let finalHistory: any[] = [];

      await runTransaction(db, async (transaction) => {
        // Reads First:
        // 1. Get the report document content
        const reportRef = doc(db, 'reports', transfer.id!);
        const reportSnap = await transaction.get(reportRef);
        if (!reportSnap.exists()) {
          throw new Error('Report document not found!');
        }

        // 2. Get current snapshots for each inventory item record
        const itemOperations: { ref: any, currentData: any, item: any }[] = [];
        for (const item of itemsSnapshot) {
          if (!item.id) continue;
          const itemRef = doc(db, 'inventory_items', item.id);
          const itemSnap = await transaction.get(itemRef);
          itemOperations.push({
            ref: itemRef,
            currentData: itemSnap.exists() ? itemSnap.data() : null,
            item
          });
        }

        // Writes Second:
        // 1. Apply changes to inventory item records atomic-safely
        for (const op of itemOperations) {
          const { ref, currentData, item } = op;
          let existingHistory = item.history || [];
          let existingTransferHistory = item.transferHistory || [];
          if (currentData) {
            existingHistory = currentData.history || [];
            existingTransferHistory = currentData.transferHistory || [];
          }

          const transferHistoryEntry = {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            user: userName,
            action: `ITR Approved - Transferred ownership from ${fromDept} (${transferorEmp}) to ${toDept} (${transfereeEmp}). Control No: ${transfer.itrNo}`
          };

          const transferSpecificEntry = {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            user: userName,
            action: "Asset Transfer",
            field: "Office & Accountability",
            oldValue: `${fromDept} (${transferorEmp})`,
            newValue: `${toDept} (${transfereeEmp})`
          };

          const updatedHistory = [...existingHistory, transferHistoryEntry];
          const updatedTransferHistory = [...existingTransferHistory, transferSpecificEntry];

          const itemUpdates: Partial<InventoryItem> = {
            office: toDept,
            personAccountable: transfereeEmp,
            assignedStaff: transfereeEmp,
            previousHolder: transferorEmp,
            dateAssigned: transfer.itrDate || new Date().toISOString().split('T')[0],
            status: 'ASSIGNED',
            history: updatedHistory,
            transferHistory: updatedTransferHistory
          };

          transaction.update(ref, itemUpdates);

          // Execute prop update if provided to sync core layout view state instantly
          if (onUpdateItem) {
            onUpdateItem(item.id, itemUpdates);
          }
        }

        // 2. Update the report document to 'Completed' status
        const existingReportHistory = reportSnap.data().history || [];
        finalHistory = [
          ...existingReportHistory,
          {
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            action: 'APPROVED',
            details: `Transfer approved by ${userName} (${userRole}). Automated asset ownership updates applied to ${itemsSnapshot.length} records inside a Firestore transaction.`
          }
        ];

        transaction.update(reportRef, {
          status: 'Completed',
          history: finalHistory,
          approvedAt: new Date().toISOString(),
          reviewedBy: userName
        });
      });

      // 3. Document logs and notify offline/online users
      await addDoc(collection(db, 'system_logs'), {
        timestamp: new Date(),
        user: userName,
        action: `Approved & Completed ITR ${transfer.itrNo} (Transaction). Transferred ${itemsSnapshot.length} assets to ${toDept}.`,
        module: 'Reporting'
      });

      await addDoc(collection(db, 'notifications'), {
        recipientRole: 'OFFICE_HEAD',
        message: `Inventory Transfer ${transfer.itrNo} (${fromDept} ➔ ${toDept}) has been officially COMPLETED. Custodianship updated atomically.`,
        timestamp: new Date().toISOString(),
        isRead: false,
        type: 'APPROVAL',
        reportId: transfer.id
      });

      triggerSuccess(`Transfer ${transfer.itrNo} atomically COMPLETED! Asset folders updated instantly.`);
      setSelectedTransfer(prev => prev ? { ...prev, status: 'Completed', history: finalHistory } : null);
    } catch (err) {
      console.error('[ITR] Approval transaction routine failed:', err);
      setActionError('Authorization validation or Firestore transaction sequence crashed.');
    } finally {
      setIsSaving(false);
    }
  };

  // Reject the transfer request
  const handleRejectTransfer = async (transfer: GeneratedReport) => {
    if (!transfer.id) return;
    if (!rejectionRemarks) {
      setActionError('Please specify feedback remarks for the rejection.');
      return;
    }

    setIsSaving(true);
    setActionError(null);

    try {
      const newHistory = [
        ...(transfer.history || []),
        {
          id: Math.random().toString(36).substr(2, 9),
          timestamp: new Date().toISOString(),
          action: 'REJECTED',
          details: `Transfer rejected by ${userName}. Reason: ${rejectionRemarks}`
        }
      ];

      await updateDoc(doc(db, 'reports', transfer.id), {
        status: 'Rejected',
        adminRemarks: rejectionRemarks,
        history: newHistory,
        rejectedAt: new Date().toISOString(),
        reviewedBy: userName
      });

      await addDoc(collection(db, 'system_logs'), {
        timestamp: new Date(),
        user: userName,
        action: `Rejected transfer ITR ${transfer.itrNo} from ${transfer.itrFromOffice} to ${transfer.itrToOffice}.`,
        module: 'Reporting'
      });

      await addDoc(collection(db, 'notifications'), {
        recipientRole: 'OFFICE_HEAD',
        message: `Transfer ${transfer.itrNo} has been Rejected by Admin: ${rejectionRemarks}`,
        timestamp: new Date().toISOString(),
        isRead: false,
        type: 'REJECTION',
        reportId: transfer.id
      });

      triggerSuccess(`Transfer ${transfer.itrNo} marked as Rejected.`);
      setSelectedTransfer(prev => prev ? { ...prev, status: 'Rejected', adminRemarks: rejectionRemarks, history: newHistory } : null);
      setShowRejectionForm(false);
      setRejectionRemarks('');
    } catch (err) {
      console.error('[ITR] Rejection failed:', err);
      setActionError('Could not process database update.');
    } finally {
      setIsSaving(false);
    }
  };

  // Helper stats definitions
  const totalCount = transfers.length;
  const pendingCount = transfers.filter(t => t.status === 'Pending Approval' || t.status === 'For Approval').length;
  const approvedCount = transfers.filter(t => t.status === 'Approved' || t.status === 'Completed').length;
  const draftCount = transfers.filter(t => t.status === 'Draft').length;

  const userAndOfficeCompletedTransfers = useMemo(() => {
    return transfers.filter(t => {
      const isCompleted = t.status === 'Completed' || t.status === 'Approved';
      const matchesOffice = t.itrFromOffice === userOffice || t.itrToOffice === userOffice;
      const matchesUser = t.itrFromTransferor === userName || t.itrToTransferee === userName || t.reviewedBy === userName;
      return isCompleted && (matchesOffice || matchesUser);
    });
  }, [transfers, userOffice, userName]);

  const filteredHistoryTransfers = useMemo(() => {
    return userAndOfficeCompletedTransfers.filter(t => {
      const searchLower = historySearchTerm.toLowerCase();
      if (!searchLower) return true;
      return (
        t.itrNo?.toLowerCase().includes(searchLower) ||
        t.itrFromOffice?.toLowerCase().includes(searchLower) ||
        t.itrToOffice?.toLowerCase().includes(searchLower) ||
        t.itrFromTransferor?.toLowerCase().includes(searchLower) ||
        t.itrToTransferee?.toLowerCase().includes(searchLower) ||
        t.itrPurpose?.toLowerCase().includes(searchLower)
      );
    });
  }, [userAndOfficeCompletedTransfers, historySearchTerm]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Visual Header with Real Stats */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm">
        <div>
          <span className="bg-teal-50 text-teal-600 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-teal-100">
            Government Standard: GAM App. 71
          </span>
          <h1 className="text-3xl font-black text-gray-900 uppercase tracking-tighter mt-3 flex items-center gap-2">
            <ArrowRightLeft className="w-8 h-8 text-indigo-600" />
            Inventory Transfer Ledger
          </h1>
          <p className="text-gray-500 text-xs font-bold uppercase tracking-tight mt-1">
            Official Transfer Slip Workflows & Automated Assets Relocation Records
          </p>
        </div>
        
        {/* Tab Toggle */}
        <div className="flex flex-wrap gap-1 bg-neutral-100 p-1.5 rounded-2xl border border-neutral-150">
          <button
            onClick={() => { setActiveSubTab('tracker'); setSelectedTransfer(null); setActionError(null); }}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeSubTab === 'tracker' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Track Transfers ({totalCount})
          </button>
          <button
            onClick={() => { setActiveSubTab('new_transfer'); setSelectedTransfer(null); setActionError(null); setFormStep(1); }}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeSubTab === 'new_transfer' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            Create Transfer Request
          </button>
          <button
            onClick={() => { setActiveSubTab('history'); setSelectedTransfer(null); setActionError(null); }}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
              activeSubTab === 'history' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-800'
            }`}
          >
            History Log ({userAndOfficeCompletedTransfers.length})
          </button>
        </div>
      </div>

      {/* Action Alerts */}
      {actionError && (
        <div className="bg-red-50 text-red-700 p-4 rounded-3xl font-bold text-xs flex items-center gap-3 border border-red-100 shadow-sm animate-bounce">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{actionError}</span>
        </div>
      )}
      {actionSuccess && (
        <div className="bg-emerald-50 text-emerald-800 p-4 rounded-3xl font-black text-xs flex items-center gap-3 border border-emerald-100 shadow-sm animate-pulse">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {/* Main Content Areas */}
      {activeSubTab === 'tracker' && !selectedTransfer && (
        <div className="space-y-6">
          {/* Dashboard Stats Panel */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm">
              <span className="text-[9px] font-black uppercase tracking-widest text-neutral-400">Total Registers</span>
              <div className="text-2xl font-black text-gray-900 mt-2">{totalCount} ITRs</div>
            </div>
            <div className="bg-amber-50 p-6 rounded-[32px] border border-amber-100/55 shadow-sm">
              <span className="text-[9px] font-black uppercase tracking-widest text-amber-500">Awaiting Approval</span>
              <div className="text-2xl font-black text-amber-800 mt-2">{pendingCount} Active</div>
            </div>
            <div className="bg-emerald-50 p-6 rounded-[32px] border border-emerald-100/55 shadow-sm">
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Dispatched & Complete</span>
              <div className="text-2xl font-black text-emerald-800 mt-2">{approvedCount} Settled</div>
            </div>
            <div className="bg-indigo-50 p-6 rounded-[32px] border border-indigo-100/55 shadow-sm">
              <span className="text-[9px] font-black uppercase tracking-widest text-indigo-500">Draft Slips</span>
              <div className="text-2xl font-black text-indigo-800 mt-2">{draftCount} In Prep</div>
            </div>
          </div>

          {/* Table Filters */}
          <div className="bg-white p-6 rounded-[40px] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search by ITR No., Recipient, transferor, or reason..."
                className="w-full pl-10 pr-4 py-3 bg-neutral-50 border-none rounded-2xl text-xs font-bold leading-none uppercase tracking-tight placeholder:text-gray-400 text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-wrap gap-3 w-full md:w-auto">
              {/* Status filter */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="bg-neutral-50 px-4 py-3 border-none rounded-2xl text-xs font-black uppercase tracking-wide focus:outline-none text-gray-600 cursor-pointer"
              >
                <option value="All">All Statuses</option>
                <option value="Draft">Draft</option>
                <option value="For Approval">For Approval</option>
                <option value="Completed">Completed</option>
                <option value="Rejected">Rejected</option>
              </select>

              {/* Office filter */}
              <select
                value={officeFilter}
                onChange={e => setOfficeFilter(e.target.value)}
                className="bg-neutral-50 px-4 py-3 border-none rounded-2xl text-xs font-black uppercase tracking-wide focus:outline-none text-gray-600 max-w-xs cursor-pointer"
              >
                <option value="All">All Offices/Departments</option>
                {officesList.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Transfers grid table */}
          {isFetching ? (
            <div className="flex flex-col items-center justify-center p-12 bg-white rounded-[40px] border border-gray-100 shadow-sm space-y-4">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-400">Loading transfer records...</p>
            </div>
          ) : filteredTransfers.length === 0 ? (
            <div className="bg-white p-16 rounded-[40px] text-center border border-gray-100 shadow-sm">
              <Building2 className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="font-bold text-gray-700 uppercase tracking-wide mb-1">No Transfer Slips Found</h3>
              <p className="text-gray-400 text-xs max-w-md mx-auto">No official transfer requests are matching your selected filters. Create a new request to get started.</p>
            </div>
          ) : (
            <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-8 py-4 text-left text-[9px] font-black uppercase tracking-widest text-neutral-400">Control / ITR No</th>
                      <th className="px-4 py-4 text-left text-[9px] font-black uppercase tracking-widest text-neutral-400">Source Office (From)</th>
                      <th className="px-4 py-4 text-left text-[9px] font-black uppercase tracking-widest text-neutral-400">Destination Office (To)</th>
                      <th className="px-4 py-4 text-left text-[9px] font-black uppercase tracking-widest text-neutral-400">Items / Value</th>
                      <th className="px-4 py-4 text-left text-[9px] font-black uppercase tracking-widest text-neutral-400">Transfer Date</th>
                      <th className="px-4 py-4 text-center text-[9px] font-black uppercase tracking-widest text-neutral-400">Status</th>
                      <th className="px-8 py-4 text-right text-[9px] font-black uppercase tracking-widest text-neutral-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredTransfers.map((t) => (
                      <tr key={t.id} className="hover:bg-neutral-50/50 transition-colors">
                        <td className="px-8 py-5">
                          <span className="font-mono text-[11px] font-black text-gray-900 block uppercase">{t.itrNo || 'ITR-2024-N/A'}</span>
                          <span className="text-[8px] font-black bg-neutral-100 text-neutral-500 px-2 py-0.5 rounded-full mt-1 inline-block uppercase">Appendix 71</span>
                        </td>
                        <td className="px-4 py-5 font-bold text-[11px] text-gray-700 uppercase tracking-tight">
                          {t.itrFromOffice || 'General Admin'}
                          <span className="block text-[8.5px] font-medium text-gray-400 mt-1 capitalize">Transferor: {t.itrFromTransferor || 'Staff'}</span>
                        </td>
                        <td className="px-4 py-5 font-bold text-[11px] text-gray-700 uppercase tracking-tight">
                          {t.itrToOffice || 'Unassigned'}
                          <span className="block text-[8.5px] font-medium text-gray-400 mt-1 capitalize">Transferee: {t.itrToTransferee || 'Staff'}</span>
                        </td>
                        <td className="px-4 py-5">
                          <span className="font-extrabold text-[11px] text-gray-900 block uppercase">{t.item_count || t.items_snapshot?.length || 0} items</span>
                          <span className="font-bold font-mono text-[10px] text-indigo-600 mt-0.5 block">
                            ₱{(t.total_value || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-4 py-5 font-bold text-[10px] text-gray-500 uppercase">
                          {t.itrDate || 'N/A'}
                        </td>
                        <td className="px-4 py-5 text-center">
                          <span className={`text-[8.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider block text-center min-w-[110px] ${
                            t.status === 'Approved' || t.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' :
                            t.status === 'Pending Approval' || t.status === 'For Approval' ? 'bg-amber-50 text-amber-700 border border-amber-100' :
                            t.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border border-rose-100' :
                            'bg-neutral-50 text-neutral-600 border border-neutral-100'
                          }`}>
                            {t.status === 'Pending Approval' || t.status === 'For Approval' ? 'For Approval' : 
                             t.status === 'Approved' || t.status === 'Completed' ? 'Completed' : t.status}
                          </span>
                        </td>
                        <td className="px-8 py-5 text-right">
                          <button
                            onClick={() => setSelectedTransfer(t)}
                            className="bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest"
                          >
                            Open Slip
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Transfer History Log Sub-tab */}
      {activeSubTab === 'history' && !selectedTransfer && (
        <div className="space-y-6">
          {/* Audit contextual information panel */}
          <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div className="space-y-2">
              <span className="bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-widest px-3 py-1 rounded-full border border-emerald-100">
                Official Custody History logs
              </span>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">Departmental Transfer History</h2>
              <p className="text-neutral-400 text-xs max-w-2xl leading-relaxed">
                This log displays all completed, approved and legally finalized custody transfers related to your profile (<span className="text-indigo-600 font-bold">{userName}</span>) or your designated department (<span className="text-indigo-600 font-bold">{userOffice}</span>).
              </p>
            </div>
            
            {/* Context stats breakdown */}
            <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
              <div className="bg-neutral-50 px-6 py-4 rounded-[24px] border border-neutral-100 min-w-[140px]">
                <span className="text-[8px] font-black uppercase tracking-widest text-neutral-400 block">Outgoing</span>
                <span className="text-lg font-black text-indigo-600">{userAndOfficeCompletedTransfers.filter(t => t.itrFromOffice === userOffice).length} items</span>
              </div>
              <div className="bg-neutral-50 px-6 py-4 rounded-[24px] border border-neutral-100 min-w-[140px]">
                <span className="text-[8px] font-black uppercase tracking-widest text-neutral-400 block">Incoming</span>
                <span className="text-lg font-black text-emerald-600">{userAndOfficeCompletedTransfers.filter(t => t.itrToOffice === userOffice).length} items</span>
              </div>
            </div>
          </div>

          {/* Quick search input */}
          <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
            <div className="relative w-full md:w-96">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={historySearchTerm}
                onChange={e => setHistorySearchTerm(e.target.value)}
                placeholder="Search history by ITR No., names, or purposes..."
                className="w-full pl-10 pr-4 py-3 bg-neutral-50 border-none rounded-2xl text-xs font-bold leading-none uppercase tracking-tight placeholder:text-gray-400 text-gray-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Showing {filteredHistoryTransfers.length} of {userAndOfficeCompletedTransfers.length} completed records
            </div>
          </div>

          {/* History record list */}
          {filteredHistoryTransfers.length === 0 ? (
            <div className="bg-white p-16 rounded-[40px] text-center border border-gray-100 shadow-sm">
              <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-4" />
              <h3 className="font-bold text-gray-700 uppercase tracking-wide mb-1">No Completed Transfers Logged</h3>
              <p className="text-gray-400 text-xs max-w-md mx-auto">
                No finalized transfers matching your office or account names were found. Completed requests will display here automatically.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-8 py-4 text-left text-[9px] font-black uppercase tracking-widest text-neutral-400">Control No</th>
                      <th className="px-4 py-4 text-left text-[9px] font-black uppercase tracking-widest text-neutral-400">Source (From)</th>
                      <th className="px-4 py-4 text-left text-[9px] font-black uppercase tracking-widest text-neutral-400">Destination (To)</th>
                      <th className="px-4 py-4 text-left text-[9px] font-black uppercase tracking-widest text-neutral-400">Logistics Representative</th>
                      <th className="px-4 py-4 text-left text-[9px] font-black uppercase tracking-widest text-neutral-400">Status</th>
                      <th className="px-8 py-4 text-right text-[9px] font-black uppercase tracking-widest text-neutral-400">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {filteredHistoryTransfers.map((t) => {
                      const itemCount = t.items_snapshot?.length || 0;
                      const totalVal = t.items_snapshot?.reduce((sum, currentItem) => {
                        const q = Number(currentItem.qtyPhysicalCount) || 1;
                        const v = Number(currentItem.unitValue) || 0;
                        return sum + (q * v);
                      }, 0) || 0;

                      return (
                        <tr key={t.id} className="hover:bg-neutral-50/50 transition-colors">
                          <td className="px-8 py-5">
                            <span className="font-mono text-[11px] font-black text-gray-900 block uppercase">{t.itrNo}</span>
                            <span className="text-[7.5px] font-sans text-gray-400 flex items-center gap-1 mt-1">
                              <Calendar className="w-3 h-3" />
                              {t.itrDate}
                            </span>
                          </td>
                          <td className="px-4 py-5">
                            <div className="font-bold text-[11px] text-indigo-700 uppercase tracking-tight">{t.itrFromOffice}</div>
                            <div className="text-[9px] text-gray-400 mt-0.5">By: {t.itrFromTransferor}</div>
                          </td>
                          <td className="px-4 py-5">
                            <div className="font-bold text-[11px] text-emerald-700 uppercase tracking-tight">{t.itrToOffice || 'Unassigned'}</div>
                            <div className="text-[9px] text-gray-400 mt-0.5">To: {t.itrToTransferee || 'Pending'}</div>
                          </td>
                          <td className="px-4 py-5">
                            <span className="font-sans text-[10px] text-gray-600 block leading-normal font-medium max-w-[200px] truncate">
                              Purpose: {t.itrPurpose || 'Not specified'}
                            </span>
                            <span className="text-[8.5px] font-bold text-gray-400 uppercase mt-0.5 block">
                              {itemCount} Assets • ₱{totalVal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="px-4 py-5">
                            <span className="text-[8.5px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider block text-center min-w-[110px] bg-emerald-50 text-emerald-700 border border-emerald-100">
                              Completed
                            </span>
                          </td>
                          <td className="px-8 py-5 text-right">
                            <button
                              onClick={() => setSelectedTransfer(t)}
                              className="bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest"
                            >
                              Open Slip
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Creation form sub tab */}
      {activeSubTab === 'new_transfer' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          
          {/* Elegant Progress Stepper */}
          <div className="bg-white p-5 rounded-[28px] border border-gray-100 shadow-sm max-w-full">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 max-w-3xl mx-auto">
              
              {/* Step 1 button */}
              <div 
                onClick={() => { if (formStep > 1) setFormStep(1); }}
                className="flex items-center gap-2.5 cursor-pointer select-none"
              >
                <span className={`w-7 h-7 rounded-full font-brand text-xs font-black flex items-center justify-center transition-all ${
                  formStep === 1 ? 'bg-indigo-600 text-white shadow-md ring-4 ring-indigo-50' : 
                  formStep > 1 ? 'bg-indigo-100 text-indigo-700' : 'bg-neutral-100 text-neutral-400'
                }`}>
                  {formStep > 1 ? '✓' : '1'}
                </span>
                <div>
                  <span className={`text-[8px] font-black uppercase tracking-wider block ${formStep === 1 ? 'text-indigo-600' : 'text-neutral-400'}`}>Step 1</span>
                  <span className="text-[10px] font-bold text-gray-700 block uppercase">Offices & Date</span>
                </div>
              </div>

              <div className={`hidden sm:block flex-1 h-[2px] ${formStep > 1 ? 'bg-indigo-300' : 'bg-neutral-100'}`} />

              {/* Step 2 button */}
              <div 
                onClick={() => {
                  if (formStep > 2) {
                    setFormStep(2);
                  } else if (formStep === 1) {
                    if (toOffice && fromOffice !== toOffice && itrNo && itrDate) {
                      setFormStep(2);
                      setActionError(null);
                    }
                  }
                }}
                className="flex items-center gap-2.5 cursor-pointer select-none"
              >
                <span className={`w-7 h-7 rounded-full font-brand text-xs font-black flex items-center justify-center transition-all ${
                  formStep === 2 ? 'bg-indigo-600 text-white shadow-md ring-4 ring-indigo-50' : 
                  formStep > 2 ? 'bg-indigo-100 text-indigo-700' : 'bg-neutral-100 text-neutral-400'
                }`}>
                  {formStep > 2 ? '✓' : '2'}
                </span>
                <div>
                  <span className={`text-[8px] font-black uppercase tracking-wider block ${formStep === 2 ? 'text-indigo-600' : 'text-neutral-400'}`}>Step 2</span>
                  <span className="text-[10px] font-bold text-gray-700 block uppercase">Custodian Personnel</span>
                </div>
              </div>

              <div className={`hidden sm:block flex-1 h-[2px] ${formStep > 2 ? 'bg-indigo-300' : 'bg-neutral-100'}`} />

              {/* Step 3 button */}
              <div className="flex items-center gap-2.5 select-none">
                <span className={`w-7 h-7 rounded-full font-brand text-xs font-black flex items-center justify-center transition-all ${
                  formStep === 3 ? 'bg-indigo-600 text-white shadow-md ring-4 ring-indigo-50' : 'bg-neutral-100 text-neutral-400'
                }`}>
                  3
                </span>
                <div>
                  <span className={`text-[8px] font-black uppercase tracking-wider block ${formStep === 3 ? 'text-indigo-600' : 'text-neutral-400'}`}>Step 3</span>
                  <span className="text-[10px] font-bold text-gray-700 block uppercase">Asset Pick & Preview</span>
                </div>
              </div>

            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 items-start">
            
            {/* Left columns (Active Form Stage Area) */}
            <div className={`space-y-6 ${formStep === 3 ? 'xl:col-span-4' : 'xl:col-span-12 max-w-2xl mx-auto'}`}>
              
              {/* STEP 1 PANEL */}
              {formStep === 1 && (
                <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-5 animate-in fade-in duration-250">
                  <h3 className="font-brand font-black text-slate-800 uppercase tracking-tight text-xs flex items-center gap-2 border-b border-gray-50 pb-3">
                    <Building2 className="w-4 h-4 text-indigo-600" />
                    Transfers Departments
                  </h3>

                  <div className="space-y-4">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 block mb-1">Source Department (From)</label>
                      <select
                        value={fromOffice}
                        onChange={e => {
                          setFromOffice(e.target.value);
                          setSelectedItemIds(new Set()); // Reset selections when source office changes
                        }}
                        className="w-full bg-neutral-50 px-4 py-3 rounded-2xl text-xs font-bold uppercase tracking-tight text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {officesList.map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 block mb-1">Destination Department (To)</label>
                      <select
                        value={toOffice}
                        onChange={e => setToOffice(e.target.value)}
                        className="w-full bg-neutral-50 px-4 py-3 rounded-2xl text-xs font-bold uppercase tracking-tight text-gray-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="">Select Destination...</option>
                        {officesList.map(o => (
                          <option key={o} value={o}>{o}</option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 block mb-1">ITR Control No.</label>
                        <input
                          type="text"
                          value={itrNo}
                          onChange={e => setItrNo(e.target.value)}
                          className="w-full bg-neutral-50 px-4 py-3.5 rounded-2xl text-xs font-bold focus:outline-none text-gray-800"
                          placeholder="Automatic No."
                        />
                      </div>
                      <div>
                        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 block mb-1">Transfer Date</label>
                        <input
                          type="date"
                          value={itrDate}
                          onChange={e => setItrDate(e.target.value)}
                          className="w-full bg-neutral-50 px-4 py-3.5 rounded-2xl text-xs font-bold focus:outline-none text-gray-800"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      if (!toOffice) {
                        setActionError('Please specify the Destination Department (To) to proceed.');
                        return;
                      }
                      if (fromOffice === toOffice) {
                        setActionError('Source Department and Destination Department cannot be identical.');
                        return;
                      }
                      if (!itrNo) {
                        setActionError('An ITR Control Number is required.');
                        return;
                      }
                      if (!itrDate) {
                        setActionError('Please pick a Transfer Date.');
                        return;
                      }
                      setActionError(null);
                      setFormStep(2);
                    }}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-4 rounded-xl uppercase tracking-widest text-[9px] shadow-sm transition-all flex items-center justify-center gap-1.5"
                  >
                    Continue to Personnel
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* STEP 2 PANEL */}
              {formStep === 2 && (
                <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-5 animate-in fade-in duration-250">
                  <h3 className="font-brand font-black text-slate-800 uppercase tracking-tight text-xs flex items-center gap-2 border-b border-gray-50 pb-3">
                    <UserCheck className="w-4 h-4 text-emerald-600" />
                    Custodian Personnel
                  </h3>

                  <div className="space-y-4">
                    {/* Released/Transferor details */}
                    <div className="p-3 bg-neutral-50 rounded-2xl space-y-2 border border-neutral-100">
                      <span className="text-[8px] font-black uppercase text-indigo-600 tracking-widest block font-sans">Released / Transferor</span>
                      <input
                        type="text"
                        value={itrFromTransferor}
                        onChange={e => setItrFromTransferor(e.target.value)}
                        placeholder="Transferor Person Name"
                        className="w-full bg-white px-3 py-2.5 rounded-xl text-xs font-semibold focus:outline-none text-gray-700"
                      />
                      <input
                        type="text"
                        value={itrFromPosition}
                        onChange={e => setItrFromPosition(e.target.value)}
                        placeholder="Designation"
                        className="w-full bg-white px-3 py-2.5 rounded-xl text-[10px] font-semibold focus:outline-none text-gray-500"
                      />
                    </div>

                    {/* Recipient/Transferee details */}
                    <div className="p-3 bg-neutral-50 rounded-2xl space-y-2 border border-neutral-100">
                      <span className="text-[8px] font-black uppercase text-emerald-600 tracking-widest block font-sans">Recipient / Transferee</span>
                      <input
                        type="text"
                        value={itrToTransferee}
                        onChange={e => setItrToTransferee(e.target.value)}
                        placeholder="Recipient Person Name"
                        className="w-full bg-white px-3 py-2.5 rounded-xl text-xs font-semibold focus:outline-none text-gray-700"
                      />
                      <input
                        type="text"
                        value={itrToPosition}
                        onChange={e => setItrToPosition(e.target.value)}
                        placeholder="Designation"
                        className="w-full bg-white px-3 py-2.5 rounded-xl text-[10px] font-semibold focus:outline-none text-gray-500"
                      />
                    </div>

                    {/* Approving officer */}
                    <div className="p-3 bg-neutral-50 rounded-2xl space-y-2 border border-neutral-100">
                      <span className="text-[8px] font-black uppercase text-purple-600 tracking-widest block font-sans">Required Approval Signatory</span>
                      <input
                        type="text"
                        value={itrApprovedBy}
                        onChange={e => setItrApprovedBy(e.target.value)}
                        placeholder="Approving Officer Name"
                        className="w-full bg-white px-3 py-2.5 rounded-xl text-xs font-semibold focus:outline-none text-gray-700"
                      />
                      <input
                        type="text"
                        value={itrApprovedPosition}
                        onChange={e => setItrApprovedPosition(e.target.value)}
                        placeholder="Position Title (e.g. Municipal Mayor)"
                        className="w-full bg-white px-3 py-2.5 rounded-xl text-[10px] font-semibold focus:outline-none text-gray-500"
                      />
                    </div>

                    {/* Transfer details reason */}
                    <div className="p-3.5 bg-neutral-50 rounded-2xl space-y-2 border border-neutral-100">
                      <label className="text-[8px] font-black uppercase text-neutral-400 block tracking-widest mb-1">Transfer Type & Reason</label>
                      <div className="grid grid-cols-2 gap-1.5 text-[10px] font-extrabold pb-2">
                        {['reassignment', 'donation', 'relocation', 'sale', 'others'].map(t => (
                          <label key={t} className="flex items-center gap-1.5 cursor-pointer border border-neutral-150 p-1.5 rounded-lg bg-white">
                            <input
                              type="radio"
                              name="itrTypeRadio"
                              checked={itrType === t}
                              onChange={() => setItrType(t as any)}
                              className="text-indigo-600 w-3 h-3"
                            />
                            <span className="capitalize">{t}</span>
                          </label>
                        ))}
                      </div>

                      {itrType === 'others' && (
                        <input
                          type="text"
                          value={itrTypeOthers}
                          onChange={e => setItrTypeOthers(e.target.value)}
                          placeholder="Specify type..."
                          className="w-full bg-white border border-neutral-200 px-3 py-2 rounded-xl text-[10px] font-semibold focus:outline-none text-gray-600"
                        />
                      )}

                      <textarea
                        rows={3}
                        value={itrPurpose}
                        onChange={e => setItrPurpose(e.target.value)}
                        placeholder="Reason for custodian relocation..."
                        className="w-full bg-white border border-neutral-200 px-3 py-2 rounded-xl text-[11px] font-semibold focus:outline-none text-gray-800"
                      ></textarea>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => setFormStep(1)}
                      className="flex-1 bg-white border border-neutral-200 hover:bg-neutral-50 text-gray-600 font-bold py-3.5 rounded-xl uppercase tracking-widest text-[9px] transition-colors"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!itrFromTransferor) {
                          setActionError('Please specify the Releasing / Transferor Employee Name.');
                          return;
                        }
                        if (!itrToTransferee) {
                          setActionError('Please specify the Recipient / Transferee Employee Name.');
                          return;
                        }
                        if (!itrApprovedBy) {
                          setActionError('Please specify the Required Approval Signatory.');
                          return;
                        }
                        setActionError(null);
                        setFormStep(3);
                      }}
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3.5 rounded-xl uppercase tracking-widest text-[9px] transition-colors flex items-center justify-center gap-1"
                    >
                      Continue
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* STEP 3 PANEL: CONFIRMATION SUMMARY & SUBMISSIONS */}
              {formStep === 3 && (
                <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-5 animate-in fade-in duration-250">
                  <h3 className="font-brand font-black text-slate-800 uppercase tracking-tight text-xs flex items-center gap-2 border-b border-gray-50 pb-2">
                    <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                    Confirm & Submit
                  </h3>

                  <div className="space-y-2.5 text-[11px] border-b border-gray-100 pb-4">
                    <div className="flex justify-between">
                      <span className="text-[8px] font-black uppercase text-neutral-400">ITR No:</span>
                      <span className="font-bold text-gray-800 text-right uppercase">{itrNo}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[8px] font-black uppercase text-neutral-400">Date:</span>
                      <span className="font-bold text-gray-800 text-right">{itrDate}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[8px] font-black uppercase text-neutral-400">From Office:</span>
                      <span className="font-bold text-indigo-600 text-right">{fromOffice}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[8px] font-black uppercase text-neutral-400">To Office:</span>
                      <span className="font-bold text-emerald-600 text-right">{toOffice}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[8px] font-black uppercase text-neutral-400">Transferor:</span>
                      <span className="font-bold text-gray-800 text-right">{itrFromTransferor}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[8px] font-black uppercase text-neutral-400">Transferee:</span>
                      <span className="font-bold text-gray-800 text-right">{itrToTransferee}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[8px] font-black uppercase text-neutral-400">Total Value:</span>
                      <span className="font-bold text-indigo-700 text-right font-mono">₱{totalTransferValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    <button
                      type="button"
                      onClick={() => setFormStep(2)}
                      className="w-full bg-white border border-neutral-200 hover:bg-neutral-50 text-gray-650 font-black py-3 rounded-xl uppercase tracking-widest text-[8.5px] transition-colors"
                    >
                      Back to Personnel
                    </button>

                    <div className="flex gap-3">
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleSubmitTransfer('Draft')}
                        className="flex-1 bg-neutral-50 hover:bg-neutral-100 text-neutral-750 font-black py-3.5 rounded-xl uppercase tracking-widest text-[8px] border border-neutral-200 disabled:opacity-50"
                      >
                        {editingTransferId ? 'Update Draft' : 'Save Draft'}
                      </button>
                      <button
                        type="button"
                        disabled={isSaving}
                        onClick={() => handleSubmitTransfer('For Approval')}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-black py-3.5 rounded-xl uppercase tracking-widest text-[8px] shadow-sm disabled:opacity-50 flex items-center justify-center gap-1"
                      >
                        <Send className="w-3 h-3" />
                        {editingTransferId ? 'Submit Updates' : 'Submit Slip'}
                      </button>
                    </div>

                    {editingTransferId && (
                      <button
                        onClick={() => {
                          setEditingTransferId(null);
                          setSelectedItemIds(new Set());
                          setToOffice('');
                          setItrToTransferee('');
                          setItrPurpose('');
                          setItrNo(`ITR-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`);
                          setFormStep(1);
                          setActiveSubTab('tracker');
                        }}
                        className="w-full text-center text-[8.5px] font-black hover:text-red-600 text-neutral-400 transition-colors uppercase tracking-widest mt-1"
                      >
                        [ Cancel Edit ]
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>

            {formStep === 3 && (
              <>
                {/* Creation Inventory Item Selector Table & formal layout (Right columns) */}
                <div className="xl:col-span-8 space-y-6">
            
            {/* Asset Items Selection Box */}
            <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-50 pb-4">
                <div>
                  <h3 className="font-black text-gray-900 uppercase tracking-tight text-base flex items-center gap-2">
                    Select Assets to Relocate
                  </h3>
                  <p className="text-gray-400 text-[10px] font-bold uppercase mt-0.5">
                    Showing current stocks held inside: <span className="text-indigo-600">{fromOffice}</span>
                  </p>
                </div>

                {/* Filter and selector */}
                <div className="flex flex-wrap gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                    <input
                      type="text"
                      value={searchItemTerm}
                      onChange={e => setSearchItemTerm(e.target.value)}
                      placeholder="Search assets..."
                      className="pl-8 pr-3 py-2 bg-neutral-100 rounded-xl text-[10px] font-bold focus:outline-none w-44 uppercase"
                    />
                  </div>

                  <select
                    value={itemCategoryFilter}
                    onChange={e => setItemCategoryFilter(e.target.value)}
                    className="bg-neutral-100 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight focus:outline-none text-gray-500 text-left max-w-[150px] cursor-pointer"
                  >
                    <option value="All">All Categories</option>
                    {itemCategories.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Selection items table view */}
              {availableItemsForTransfer.length === 0 ? (
                <div className="p-12 text-center bg-neutral-50/50 rounded-3xl border border-neutral-100 border-dashed">
                  <HelpCircle className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-tight">No matchable assets held in this department.</p>
                </div>
              ) : (
                <div className="max-h-[350px] overflow-y-auto border border-neutral-50 rounded-2xl divide-y divide-gray-50 custom-scrollbar">
                  {availableItemsForTransfer.map((item) => {
                    const isSelected = selectedItemIds.has(item.id);
                    return (
                      <div 
                        key={item.id} 
                        onClick={() => toggleItemSelection(item.id)}
                        className={`p-4 flex items-center justify-between gap-4 cursor-pointer hover:bg-neutral-50/80 transition-colors ${
                          isSelected ? 'bg-indigo-50/20' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-5 h-5 flex items-center justify-center rounded-md border ${
                            isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-neutral-300 bg-white'
                          }`}>
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          <div>
                            <span className="font-bold text-gray-900 text-xs block uppercase">{item.article}</span>
                            <span className="text-[10px] text-gray-400 font-mono block">No: {item.propertyNumber} &bull; Code: {item.assetCode || 'N/A'}</span>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="font-extrabold text-neutral-800 text-xs block">
                            ₱{(item.unitValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                          </span>
                          <span className="text-[9px] font-black text-indigo-500 uppercase block tracking-wider mt-0.5">{item.category}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Selected summary */}
              <div className="flex items-center justify-between bg-indigo-50/30 p-4 border border-indigo-150/40 rounded-3xl text-xs">
                <div>
                  <span className="text-neutral-500 font-bold uppercase tracking-wide block">Selected transfer assets list:</span>
                  <span className="font-black text-indigo-800 uppercase mt-0.5 block">{selectedTransferItems.length} unique records selected</span>
                </div>
                <div className="text-right">
                  <span className="text-neutral-500 font-bold uppercase tracking-wide block">Total Relocation Assets Value:</span>
                  <span className="font-black text-indigo-600 font-mono mt-0.5 block">
                    ₱{totalTransferValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
            </div>

            {/* Document formal physical paper pre-render (GAM App.71 Preview) */}
            <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-6">
              <div className="flex justify-between items-center pb-3 border-b border-gray-50">
                <span className="text-[10px] font-black uppercase text-neutral-400 tracking-wider">Formal ITR Slip Preview</span>
                <span className="text-[8px] font-black bg-neutral-100 text-neutral-500 px-2 py-1 rounded">GAM SYSTEM PRE-PRINT</span>
              </div>

              {/* A4 Printable paper bounds */}
              <div className="border border-neutral-200 bg-neutral-50 p-6 rounded-2xl font-serif max-w-full overflow-x-auto">
                <div className="bg-white p-8 border border-neutral-300 shadow-sm mx-auto min-w-[700px] text-black text-[9pt] leading-tight space-y-4">
                  
                  {/* Appendices title header */}
                  <div className="flex justify-between items-start">
                    <span className="font-serif italic font-bold text-[10pt]">Appendix 71</span>
                    <span className="font-sans text-[7.5pt] text-gray-400 uppercase text-right leading-tight">DEPARTMENTAL PROPERTY CUSTODY WORKFLOWS<br/>MUNICIPAL GOVERNMENT OF TIBIAO</span>
                  </div>

                  {/* Header labels */}
                  <div className="text-center font-serif text-black">
                    <div className="text-[9.5pt] font-bold uppercase">PROVINCE OF ANTIQUE, MUNICIPALITY OF TIBIAO</div>
                    <div className="text-[14pt] font-black tracking-tight uppercase mt-1">INVENTORY TRANSFER REPORT</div>
                    <div className="text-[8pt] italic text-gray-500 mt-0.5">Departmental Property Custody Transfer Control Form</div>
                  </div>

                  {/* Meta box */}
                  <table className="w-full border border-black border-collapse text-[9pt]">
                    <tbody>
                      <tr>
                        <td className="border border-black p-2 w-[50%] font-serif">
                          <b>Transfer Report No:</b> <span className="font-bold border-b border-black/40 pb-0.5 px-3">{itrNo}</span>
                        </td>
                        <td className="border border-black p-2 w-[50%] font-serif">
                          <b>Transfer Date:</b> <span className="font-bold border-b border-black/40 pb-0.5 px-3">{itrDate}</span>
                        </td>
                      </tr>
                      <tr>
                        <td className="border border-black p-2 font-serif">
                          <b>From (Transferor):</b> <span className="font-black text-indigo-700 uppercase">{itrFromTransferor || 'UNSPECIFIED'}</span>
                          <div className="text-[8px] text-gray-500 uppercase mt-0.5 font-sans">Office: {fromOffice}</div>
                        </td>
                        <td className="border border-black p-2 font-serif">
                          <b>To (Transferee):</b> <span className="font-black text-emerald-700 uppercase">{itrToTransferee || 'PENDING'}</span>
                          <div className="text-[8px] text-gray-500 uppercase mt-0.5 font-sans">Office: {toOffice || 'UNSPECIFIED'}</div>
                        </td>
                      </tr>
                      <tr>
                        <td colSpan={2} className="border border-black p-2 font-serif">
                          <b>Purpose of Transfer:</b> <span className="italic block mt-1 text-gray-600 bg-neutral-50 p-1.5 rounded">{itrPurpose || 'Transfer due to change in office assignment.'}</span>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Type of transfer selectors */}
                  <div className="border border-black p-2 text-[8pt] font-sans flex flex-wrap gap-4 items-center bg-neutral-50/50">
                    <span className="font-bold font-serif text-[8.5pt]">Type of Transfer:</span>
                    <span className="flex items-center gap-1">
                      <span className="w-4 h-4 inline-block text-center border border-black font-mono font-bold text-xs bg-white text-indigo-600 leading-none">{itrType === 'donation' ? 'X' : ' '}</span> Donation
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-4 h-4 inline-block text-center border border-black font-mono font-bold text-xs bg-white text-indigo-600 leading-none">{itrType === 'relocation' ? 'X' : ' '}</span> Relocation
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-4 h-4 inline-block text-center border border-black font-mono font-bold text-xs bg-white text-indigo-600 leading-none">{itrType === 'reassignment' ? 'X' : ' '}</span> Reassignment
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-4 h-4 inline-block text-center border border-black font-mono font-bold text-xs bg-white text-indigo-600 leading-none">{itrType === 'sale' ? 'X' : ' '}</span> Sale
                    </span>
                    <span className="flex items-center gap-1">
                      <span className="w-4 h-4 inline-block text-center border border-black font-mono font-bold text-xs bg-white text-indigo-600 leading-none">{itrType === 'others' ? 'X' : ' '}</span> Others: <span className="border-b border-black px-1 font-bold">{itrType === 'others' ? itrTypeOthers : '_________________'}</span>
                    </span>
                  </div>

                  {/* Items list pre-render */}
                  <table className="w-full border-collapse border border-black font-serif text-[8.5pt]">
                    <thead>
                      <tr className="bg-neutral-50">
                        <th className="border border-black p-1.5 w-[12%] text-center">Date Acq.</th>
                        <th className="border border-black p-1.5 w-[18%] text-center">Property No</th>
                        <th className="border border-black p-1.5 w-[10%] text-center">Unit</th>
                        <th className="border border-black p-1.5 w-[32%] text-left">Description Specification</th>
                        <th className="border border-black p-1.5 w-[6%] text-center">Qty</th>
                        <th className="border border-black p-1.5 w-[11%] text-right">Unit Cost</th>
                        <th className="border border-black p-1.5 w-[11%] text-right">Total Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedTransferItems.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="border border-black p-4 text-center text-gray-400 italic">No inventory items selected. Add items above to build preview lists.</td>
                        </tr>
                      ) : (
                        selectedTransferItems.map((item, idx) => {
                          const quantity = Number(item.qtyPhysicalCount) || 1;
                          const cost = Number(item.unitValue) || 0;
                          return (
                            <tr key={item.id || idx}>
                              <td className="border border-black p-1 text-center font-sans text-[7.5pt]">{item.acquisitionDate || itrDate}</td>
                              <td className="border border-black p-1 text-center font-mono text-[7.5pt]">{item.propertyNumber}</td>
                              <td className="border border-black p-1 text-center uppercase text-[7.5pt]">{item.unitOfMeasure || 'unit'}</td>
                              <td className="border border-black p-1 leading-tight text-left">
                                <b className="uppercase block font-sans text-[7.5pt]">{item.article}</b>
                                <span className="text-[7pt] text-gray-500 block truncate max-w-[200px]">{item.description}</span>
                              </td>
                              <td className="border border-black p-1 text-center">{quantity}</td>
                              <td className="border border-black p-1 text-right">₱{cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                              <td className="border border-black p-1 text-right font-bold">₱{(quantity * cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            </tr>
                          );
                        })
                      )}
                      
                      {/* empty placeholder rows for proportion matching */}
                      {Array.from({ length: Math.max(0, 4 - selectedTransferItems.length) }).map((_, idx) => (
                        <tr key={`empty-${idx}`} className="h-5">
                          <td className="border border-black p-1">&nbsp;</td>
                          <td className="border border-black p-1">&nbsp;</td>
                          <td className="border border-black p-1">&nbsp;</td>
                          <td className="border border-black p-1">&nbsp;</td>
                          <td className="border border-black p-1">&nbsp;</td>
                          <td className="border border-black p-1">&nbsp;</td>
                          <td className="border border-black p-1">&nbsp;</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {/* Signatures box */}
                  <table className="w-full border-collapse border border-black text-[7.5pt] leading-tight font-sans">
                    <tbody>
                      <tr>
                        <td className="border border-black p-2 w-[33.3%] vertical-align-top">
                          <div className="font-bold uppercase mb-4">Released/Transferred By:</div>
                          <div className="border-b border-black text-center font-bold text-[8.5pt] uppercase pt-4 min-h-[16px]">{itrFromTransferor || ' '}</div>
                          <div className="text-center text-[7pt] text-gray-500 mt-0.5">Signature over Printed Name</div>
                          <div className="border-b border-black text-center font-bold text-[8pt] pt-2 min-h-[16px]">{itrFromPosition || ' '}</div>
                          <div className="text-center text-[7pt] text-gray-500 mt-0.5">Designation</div>
                          <div className="border-b border-black text-center font-semibold pt-2 min-h-[16px]">{itrDate || ' '}</div>
                          <div className="text-center text-[7pt] text-gray-500 mt-0.5">Date</div>
                        </td>
                        <td className="border border-black p-2 w-[33.3%] vertical-align-top">
                          <div className="font-bold uppercase mb-4 text-purple-700">Approval Required:</div>
                          <div className="border-b border-black text-center font-bold text-[8.5pt] uppercase pt-4 min-h-[16px]">{itrApprovedBy || ' '}</div>
                          <div className="text-center text-[7pt] text-gray-500 mt-0.5">Signature over Printed Name</div>
                          <div className="border-b border-black text-center font-bold text-[8pt] pt-2 min-h-[16px]">{itrApprovedPosition || ' '}</div>
                          <div className="text-center text-[7pt] text-gray-500 mt-0.5">Designation</div>
                          <div className="border-b border-black text-center font-semibold pt-2 min-h-[16px]">{itrDate || ' '}</div>
                          <div className="text-center text-[7pt] text-gray-500 mt-0.5">Date</div>
                        </td>
                        <td className="border border-black p-2 w-[33.3%] vertical-align-top">
                          <div className="font-bold uppercase mb-4 text-emerald-700">Received By:</div>
                          <div className="border-b border-black text-center font-bold text-[8.5pt] uppercase pt-4 min-h-[16px]">{itrToTransferee || ' '}</div>
                          <div className="text-center text-[7pt] text-gray-500 mt-0.5">Signature over Printed Name</div>
                          <div className="border-b border-black text-center font-bold text-[8pt] pt-2 min-h-[16px]">{itrToPosition || ' '}</div>
                          <div className="text-center text-[7pt] text-gray-500 mt-0.5">Designation</div>
                          <div className="border-b border-black text-center font-semibold pt-2 min-h-[16px]">{itrDate || ' '}</div>
                          <div className="text-center text-[7pt] text-gray-500 mt-0.5">Date</div>
                        </td>
                      </tr>
                    </tbody>
                  </table>

                </div>
              </div>
            </div>
          </div>
        </>
      )}

          </div>

        </div>
      )}

      {/* Individual Selected Transfer Details & PDF Viewer / Printable Slip */}
      {selectedTransfer && (
        <div className="bg-white p-8 rounded-[40px] border border-gray-100 shadow-sm space-y-8">
          
          {/* Header Controls */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-gray-50 pb-6">
            <div>
              <button 
                onClick={() => { setSelectedTransfer(null); setActionError(null); }}
                className="text-neutral-500 hover:text-neutral-900 text-xs font-black uppercase tracking-widest flex items-center gap-1 mb-2"
              >
                ← Back to Tracker List
              </button>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">ITR Transfer Slip Folder</h2>
                <span className={`text-[8.5px] font-black px-2.5 py-1 rounded-full uppercase border ${
                  selectedTransfer.status === 'Approved' || selectedTransfer.status === 'Completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-150' :
                  selectedTransfer.status === 'Pending Approval' || selectedTransfer.status === 'For Approval' ? 'bg-amber-50 text-amber-700 border-amber-150' :
                  selectedTransfer.status === 'Rejected' ? 'bg-rose-50 text-rose-700 border-rose-150' :
                  'bg-neutral-50 text-neutral-600 border-neutral-150'
                }`}>
                  Status: {selectedTransfer.status === 'Pending Approval' || selectedTransfer.status === 'For Approval' ? 'For Approval' : 
                           selectedTransfer.status === 'Approved' || selectedTransfer.status === 'Completed' ? 'Completed' : selectedTransfer.status}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => window.print()}
                className="bg-neutral-100 text-neutral-700 hover:bg-neutral-200 transition-colors px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2"
              >
                <Printer className="w-4 h-4" />
                Print Physical Slip
              </button>

              {/* Show edit / submit / delete actions if status is Draft */}
              {selectedTransfer.status === 'Draft' && (
                <>
                  <button
                    disabled={isSaving}
                    onClick={async () => {
                      if (!selectedTransfer.id) return;
                      setIsSaving(true);
                      try {
                        const reportRef = doc(db, 'reports', selectedTransfer.id);
                        await deleteDoc(reportRef);
                        triggerSuccess(`Draft transfer request ${selectedTransfer.itrNo} deleted.`);
                        setSelectedTransfer(null);
                      } catch (err) {
                        console.error('Delete draft failed:', err);
                        setActionError('Failed to delete draft.');
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    className="bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Draft
                  </button>
                  <button
                    onClick={() => {
                      // Load draft into form state
                      setEditingTransferId(selectedTransfer.id || null);
                      setFromOffice(selectedTransfer.itrFromOffice || '');
                      setToOffice(selectedTransfer.itrToOffice || '');
                      setItrNo(selectedTransfer.itrNo || '');
                      setItrDate(selectedTransfer.itrDate || '');
                      setItrFromTransferor(selectedTransfer.itrFromTransferor || '');
                      setItrFromPosition(selectedTransfer.itrFromPosition || '');
                      setItrToTransferee(selectedTransfer.itrToTransferee || '');
                      setItrToPosition(selectedTransfer.itrToPosition || '');
                      setItrApprovedBy(selectedTransfer.itrApprovedBy || '');
                      setItrApprovedPosition(selectedTransfer.itrApprovedPosition || '');
                      setItrPurpose(selectedTransfer.itrPurpose || '');
                      setItrType((selectedTransfer.itrType || 'reassignment') as any);
                      setItrTypeOthers(selectedTransfer.itrTypeOthers || '');
                      
                      // Map snapshot items to selected ID set
                      const snapIds = new Set<string>();
                      if (selectedTransfer.items_snapshot) {
                        selectedTransfer.items_snapshot.forEach(item => {
                          if (item.id) snapIds.add(item.id);
                        });
                      }
                      setSelectedItemIds(snapIds);
                      
                      // Transition views
                      setActiveSubTab('new_transfer');
                      setSelectedTransfer(null);
                      setFormStep(1);
                    }}
                    className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 transition-colors px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1.5"
                  >
                    <Edit3 className="w-4 h-4" />
                    Edit Request
                  </button>
                  <button
                    disabled={isSaving}
                    onClick={async () => {
                      if (!selectedTransfer.id) return;
                      setIsSaving(true);
                      try {
                        const reportRef = doc(db, 'reports', selectedTransfer.id);
                        const newHistory = [
                          ...(selectedTransfer.history || []),
                          {
                            id: Math.random().toString(36).substr(2, 9),
                            timestamp: new Date().toISOString(),
                            action: 'SUBMITTED',
                            details: `Promoted draft to For Approval status by ${userName}.`
                          }
                        ];
                        await updateDoc(reportRef, {
                          status: 'For Approval',
                          history: newHistory
                        });

                        await addDoc(collection(db, 'notifications'), {
                          recipientRole: 'ADMIN',
                          message: `Official transfer request "${selectedTransfer.itrNo}" (${selectedTransfer.itrFromOffice} ➔ ${selectedTransfer.itrToOffice}) has been promoted from Draft and is awaiting review.`,
                          timestamp: new Date().toISOString(),
                          isRead: false,
                          type: 'SUBMISSION',
                          reportId: selectedTransfer.id
                        });

                        triggerSuccess(`Transfer slip ${selectedTransfer.itrNo} submitted successfully For Approval.`);
                        setSelectedTransfer(prev => prev ? { ...prev, status: 'For Approval', history: newHistory } : null);
                      } catch (err) {
                        console.error('Submit draft failed:', err);
                        setActionError('Could not process database update.');
                      } finally {
                        setIsSaving(false);
                      }
                    }}
                    className="bg-indigo-600 text-white hover:bg-indigo-700 transition-all px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-indigo-100 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Send className="w-4 h-4" />
                    Submit Request
                  </button>
                </>
              )}

              {/* Show admin approval controls if pending and role is authorized */}
              {(selectedTransfer.status === 'Pending Approval' || selectedTransfer.status === 'For Approval') && 
                ['ADMIN', 'OFFICE_HEAD'].includes(userRole) && (
                <>
                  <button
                    onClick={() => { setActionError(null); setShowRejectionForm(true); }}
                    className="bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors px-4 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest flex items-center gap-1"
                  >
                    <X className="w-4 h-4" />
                    Reject Order
                  </button>
                  <button
                    disabled={isSaving}
                    onClick={() => { setActionError(null); handleApproveTransfer(selectedTransfer); }}
                    className="bg-emerald-600 text-white hover:bg-emerald-700 transition-all px-5 py-3 rounded-2xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-emerald-100 flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <Check className="w-4 h-4 stroke-[3]" />
                    Approve & Complete
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Rejection input block */}
          {showRejectionForm && (
            <div className="bg-neutral-50 p-6 rounded-3xl border border-rose-100 space-y-4">
              <span className="text-[10px] font-black uppercase text-rose-800 tracking-widest block">Administrator Rejection Reason / Remarks Form</span>
              <textarea
                rows={3}
                value={rejectionRemarks}
                onChange={e => setRejectionRemarks(e.target.value)}
                placeholder="Specify what edits are necessary, or reasons for denying the transfer..."
                className="w-full bg-white px-4 py-3 rounded-2xl text-xs font-semibold focus:outline-none text-gray-800 border border-neutral-200"
              ></textarea>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => { setShowRejectionForm(false); setRejectionRemarks(''); }}
                  className="bg-white text-gray-500 hover:bg-neutral-100 px-4 py-2 border rounded-xl text-[10px] font-black uppercase tracking-widest"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleRejectTransfer(selectedTransfer)}
                  className="bg-rose-600 text-white hover:bg-rose-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest"
                >
                  Submit Rejection
                </button>
              </div>
            </div>
          )}

          {/* Grid view: Details checklist and Printable ITR paper */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            
            {/* Left side detailed info checklist */}
            <div className="lg:col-span-4 space-y-6">
              
              {/* Timeline of approvals */}
              <div className="bg-neutral-50/50 p-6 rounded-3xl border border-neutral-100 space-y-4">
                <h3 className="text-xs font-black uppercase text-neutral-400 tracking-widest">ITR Execution Workflow Logs</h3>
                
                <div className="relative border-l border-neutral-200 pl-4 ml-2 space-y-5">
                  {/* Item ownership relocation check */}
                  <div className="relative">
                    <span className="absolute -left-[24px] top-0 bg-white border border-neutral-200 p-0.5 rounded-full z-10 flex items-center justify-center">
                      <span className="w-2.5 h-2.5 bg-indigo-600 rounded-full"></span>
                    </span>
                    <span className="font-black text-[10px] text-indigo-700 uppercase tracking-tight block">1. Draft Created</span>
                    <span className="text-[8.5px] text-gray-400 block font-sans">Date: {selectedTransfer.itrDate}</span>
                    <p className="text-[10.5px] text-gray-500 mt-1">Transfers slip generated by {selectedTransfer.itrFromTransferor}.</p>
                  </div>

                  <div className="relative">
                    <span className="absolute -left-[24px] top-0 bg-white border border-neutral-200 p-0.5 rounded-full z-10 flex items-center justify-center">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        selectedTransfer.status !== 'Draft' ? 'bg-amber-500' : 'bg-gray-300'
                      }`}></span>
                    </span>
                    <span className={`font-black text-[10px] uppercase tracking-tight block ${
                      selectedTransfer.status !== 'Draft' ? 'text-amber-700' : 'text-gray-400'
                    }`}>2. Dispatched for Approval</span>
                    <span className="text-[8.5px] text-gray-400 block font-sans">Route: Department Head (Mayor)</span>
                    <p className="text-[10.5px] text-gray-500 mt-1">
                      {selectedTransfer.status === 'Draft' 
                        ? 'Under review by creator employee.' 
                        : `Forwarded for validation regarding ${selectedTransfer.itrPurpose}.`
                      }
                    </p>
                  </div>

                  <div className="relative">
                    <span className="absolute -left-[24px] top-0 bg-white border border-neutral-200 p-0.5 rounded-full z-10 flex items-center justify-center">
                      <span className={`w-2.5 h-2.5 rounded-full ${
                        selectedTransfer.status === 'Approved' || selectedTransfer.status === 'Completed' ? 'bg-emerald-500' :
                        selectedTransfer.status === 'Rejected' ? 'bg-rose-500' :
                        'bg-gray-300'
                      }`}></span>
                    </span>
                    <span className={`font-black text-[10px] uppercase tracking-tight block ${
                      selectedTransfer.status === 'Approved' || selectedTransfer.status === 'Completed' ? 'text-emerald-700' :
                      selectedTransfer.status === 'Rejected' ? 'text-rose-700' :
                      'text-gray-400'
                    }`}>3. Approval Decision</span>
                    
                    {(selectedTransfer.status === 'Approved' || selectedTransfer.status === 'Completed') && (
                      <div className="mt-1 space-y-1">
                        <p className="text-[10px] text-emerald-800 font-bold bg-emerald-50/50 p-2 rounded-xl border border-emerald-100">
                          Automated custody updates applied! Assets are now assigned to {selectedTransfer.itrToOffice}.
                        </p>
                      </div>
                    )}

                    {selectedTransfer.status === 'Rejected' && (
                      <div className="mt-1 space-y-1">
                        <p className="text-[10px] text-rose-800 font-semibold bg-rose-50/50 p-2 rounded-xl border border-rose-100">
                          Administrative Reason: {selectedTransfer.adminRemarks || 'Requires verification of property serial codes.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Snapshot Assets Folder */}
              <div className="bg-white p-6 rounded-[32px] border border-gray-100 shadow-sm space-y-4">
                <h3 className="text-xs font-black uppercase text-neutral-400 tracking-widest">Asset Details ({selectedTransfer.items_snapshot?.length || 0})</h3>
                <div className="divide-y divide-gray-50 max-h-[300px] overflow-y-auto custom-scrollbar">
                  {(selectedTransfer.items_snapshot || []).map((item, idx) => (
                    <div key={item.id || idx} className="py-3 flex justify-between items-center text-xs">
                      <div>
                        <span className="font-extrabold text-neutral-800 uppercase block">{item.article}</span>
                        <span className="text-[10px] text-gray-400 font-mono block">No: {item.propertyNumber}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-neutral-600 block">₱{(item.unitValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

            </div>

            {/* Right side Printable format document */}
            <div className="lg:col-span-8 bg-neutral-100 p-6 rounded-[32px] overflow-x-auto">
              <div className="bg-white p-8 border border-neutral-300 shadow-sm mx-auto min-w-[700px] text-black text-[9pt] leading-tight space-y-4 relative overflow-hidden font-serif">
                
                {/* Watermark overlay */}
                {(selectedTransfer.status === 'Approved' || selectedTransfer.status === 'Completed') && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none opacity-[0.06] border-[12px] border-emerald-600 p-8 rounded-[40px] text-emerald-600 font-sans font-black text-6xl uppercase tracking-[0.2em] transform -rotate-[22deg] text-center">
                    APPROVED<br/>
                    COA COMPLIANT
                  </div>
                )}
                {selectedTransfer.status === 'Rejected' && (
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 select-none pointer-events-none opacity-[0.06] border-[12px] border-rose-600 p-8 rounded-[40px] text-rose-600 font-sans font-black text-6xl uppercase tracking-[0.2em] transform -rotate-[22deg] text-center">
                    REJECTED<br/>
                    VOID
                  </div>
                )}

                {/* Appendix titles */}
                <div className="flex justify-between items-start">
                  <span className="font-serif italic font-bold text-[10pt]">Appendix 71</span>
                  <span className="font-sans text-[7.5pt] text-gray-400 uppercase text-right leading-tight">DEPARTMENTAL PROPERTY CUSTODY WORKFLOWS<br/>MUNICIPAL GOVERNMENT OF TIBIAO</span>
                </div>

                {/* Titles */}
                <div className="text-center font-serif text-black">
                  <div className="text-[9.5pt] font-semibold uppercase">PROVINCE OF ANTIQUE, MUNICIPALITY OF TIBIAO</div>
                  <div className="text-[14pt] font-black tracking-tight uppercase mt-1">INVENTORY TRANSFER REPORT</div>
                  <div className="text-[8pt] italic text-gray-500 mt-0.5">Departmental Property Custody Transfer Control Form</div>
                </div>

                {/* Save Changes Floating Banner (No-Print) */}
                {hasItrChanges && (
                  <div className="no-print bg-amber-50 border border-amber-200 p-4 rounded-2xl flex justify-between items-center mb-4 animate-in fade-in duration-200">
                    <div className="flex items-center gap-2">
                      <span className="text-amber-800 text-[10px] font-black uppercase tracking-wider block">⚠️ Unsaved Report Metadata Changes</span>
                    </div>
                    <button
                      onClick={handleSaveItrChanges}
                      disabled={isSaving}
                      className="bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-black text-[9px] uppercase tracking-widest px-4 py-2 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                    >
                      <Save className="w-3.5 h-3.5" />
                      Save Metadata
                    </button>
                  </div>
                )}

                 {/* Meta box */}
                <table className="w-full border border-black border-collapse text-[9pt]">
                  <tbody>
                    <tr>
                      <td className="border border-black p-2 w-[50%]">
                        <b>Transfer Report No:</b>{" "}
                        <input
                          type="text"
                          value={selectedTransfer.itrNo || ''}
                          onChange={e => {
                            setSelectedTransfer({ ...selectedTransfer, itrNo: e.target.value });
                            setHasItrChanges(true);
                          }}
                          className="font-bold border-b border-black/40 pb-0.5 px-2 bg-amber-50/40 hover:bg-amber-50 focus:bg-amber-100 outline-none text-black transition-colors w-[200px]"
                        />
                      </td>
                      <td className="border border-black p-2 w-[50%]">
                        <b>Transfer Date:</b>{" "}
                        <input
                          type="text"
                          value={selectedTransfer.itrDate || ''}
                          onChange={e => {
                            setSelectedTransfer({ ...selectedTransfer, itrDate: e.target.value });
                            setHasItrChanges(true);
                          }}
                          className="font-bold border-b border-black/40 pb-0.5 px-2 bg-amber-50/40 hover:bg-amber-50 focus:bg-amber-100 outline-none text-black transition-colors w-[200px]"
                        />
                      </td>
                    </tr>
                    <tr>
                      <td className="border border-black p-2">
                        <b>From (Transferor):</b>{" "}
                        <input
                          type="text"
                          value={selectedTransfer.itrFromTransferor || ''}
                          onChange={e => {
                            setSelectedTransfer({ ...selectedTransfer, itrFromTransferor: e.target.value });
                            setHasItrChanges(true);
                          }}
                          className="font-black text-indigo-700 uppercase border-b border-black/40 pb-0.5 px-2 bg-amber-50/40 hover:bg-amber-50 focus:bg-amber-100 outline-none transition-colors w-[220px]"
                        />
                        <div className="text-[8px] text-gray-500 uppercase mt-1 font-sans">Office: {selectedTransfer.itrFromOffice}</div>
                      </td>
                      <td className="border border-black p-2">
                        <b>To (Transferee):</b>{" "}
                        <input
                          type="text"
                          value={selectedTransfer.itrToTransferee || ''}
                          onChange={e => {
                            setSelectedTransfer({ ...selectedTransfer, itrToTransferee: e.target.value });
                            setHasItrChanges(true);
                          }}
                          className="font-black text-emerald-700 uppercase border-b border-black/40 pb-0.5 px-2 bg-amber-50/40 hover:bg-amber-50 focus:bg-amber-100 outline-none transition-colors w-[220px]"
                        />
                        <div className="text-[8px] text-gray-500 uppercase mt-1 font-sans">Office: {selectedTransfer.itrToOffice || 'UNSPECIFIED'}</div>
                      </td>
                    </tr>
                    <tr>
                      <td colSpan={2} className="border border-black p-2">
                        <b>Purpose of Transfer:</b>
                        <textarea
                          rows={2}
                          value={selectedTransfer.itrPurpose || ''}
                          onChange={e => {
                            setSelectedTransfer({ ...selectedTransfer, itrPurpose: e.target.value });
                            setHasItrChanges(true);
                          }}
                          className="italic block mt-1 text-gray-600 bg-amber-50/40 hover:bg-amber-50 focus:bg-amber-100 border border-black/20 p-1.5 rounded w-full outline-none transition-colors"
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* Custom details */}
                <div className="border border-black p-2 text-[8pt] font-sans flex flex-wrap gap-4 items-center bg-neutral-50/50">
                  <span className="font-bold font-serif text-[8.5pt]">Type of Transfer:</span>
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 inline-block text-center border border-black font-mono font-bold text-xs bg-white text-indigo-600 leading-none">{selectedTransfer.itrType === 'donation' ? 'X' : ' '}</span> Donation
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 inline-block text-center border border-black font-mono font-bold text-xs bg-white text-indigo-600 leading-none">{selectedTransfer.itrType === 'relocation' ? 'X' : ' '}</span> Relocation
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 inline-block text-center border border-black font-mono font-bold text-xs bg-white text-indigo-600 leading-none">{selectedTransfer.itrType === 'reassignment' ? 'X' : ' '}</span> Reassignment
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 inline-block text-center border border-black font-mono font-bold text-xs bg-white text-indigo-600 leading-none">{selectedTransfer.itrType === 'sale' ? 'X' : ' '}</span> Sale
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="w-4 h-4 inline-block text-center border border-black font-mono font-bold text-xs bg-white text-indigo-600 leading-none">{selectedTransfer.itrType === 'others' ? 'X' : ' '}</span> Others: <span className="border-b border-black px-1 font-bold">{selectedTransfer.itrType === 'others' ? (selectedTransfer.itrTypeOthers || 'Other method') : '_________________'}</span>
                  </span>
                </div>

                {/* Items matrix */}
                <table className="w-full border-collapse border border-black text-[8.5pt]">
                  <thead>
                    <tr className="bg-neutral-50">
                      <th className="border border-black p-1.5 w-[12%] text-center">Date Acq.</th>
                      <th className="border border-black p-1.5 w-[18%] text-center">Property No</th>
                      <th className="border border-black p-1.5 w-[10%] text-center">Unit</th>
                      <th className="border border-black p-1.5 w-[32%] text-left">Description Specification</th>
                      <th className="border border-black p-1.5 w-[6%] text-center">Qty</th>
                      <th className="border border-black p-1.5 w-[11%] text-right">Unit Cost</th>
                      <th className="border border-black p-1.5 w-[11%] text-right">Total Cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(selectedTransfer.items_snapshot || []).map((item, idx) => {
                      const quantity = Number(item.qtyPhysicalCount) || 1;
                      const cost = Number(item.unitValue) || 0;
                      return (
                        <tr key={item.id || idx}>
                          <td className="border border-black p-1 text-center font-sans text-[7.5pt]">{item.acquisitionDate || selectedTransfer.itrDate}</td>
                          <td className="border border-black p-1 text-center font-mono text-[7.5pt]">{item.propertyNumber}</td>
                          <td className="border border-black p-1 text-center uppercase text-[7.5pt]">{item.unitOfMeasure || 'unit'}</td>
                          <td className="border border-black p-1 leading-tight text-left">
                            <b className="uppercase block font-sans text-[7.5pt]">{item.article}</b>
                            <span className="text-[7pt] text-gray-500 block truncate max-w-[200px]">{item.description}</span>
                          </td>
                          <td className="border border-black p-1 text-center">{quantity}</td>
                          <td className="border border-black p-1 text-right">₱{cost.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                          <td className="border border-black p-1 text-right font-bold">₱{(quantity * cost).toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                        </tr>
                      );
                    })}
                    
                    {/* empty placeholder rows for proportion matching */}
                    {Array.from({ length: Math.max(0, 4 - (selectedTransfer.items_snapshot?.length || 0)) }).map((_, idx) => (
                      <tr key={`empty-${idx}`} className="h-5">
                        <td className="border border-black p-1">&nbsp;</td>
                        <td className="border border-black p-1">&nbsp;</td>
                        <td className="border border-black p-1">&nbsp;</td>
                        <td className="border border-black p-1">&nbsp;</td>
                        <td className="border border-black p-1">&nbsp;</td>
                        <td className="border border-black p-1">&nbsp;</td>
                        <td className="border border-black p-1">&nbsp;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Signatories section */}
                <table className="w-full border-collapse border border-black text-[7.5pt] leading-tight font-sans">
                  <tbody>
                    <tr>
                      <td className="border border-black p-2 w-[33.3%] vertical-align-top">
                        <div className="font-bold uppercase mb-4">Released/Transferred By:</div>
                        <div className="border-b border-black text-center font-bold text-[8.5pt] uppercase pt-4 min-h-[16px]">{selectedTransfer.itrFromTransferor || ' '}</div>
                        <div className="text-center text-[7pt] text-gray-500 mt-0.5">Signature over Printed Name</div>
                        <div className="border-b border-black text-center font-bold text-[8pt] pt-2 min-h-[16px]">{selectedTransfer.itrFromPosition || ' '}</div>
                        <div className="text-center text-[7pt] text-gray-500 mt-0.5">Designation</div>
                        <div className="border-b border-black text-center font-semibold pt-2 min-h-[16px]">{selectedTransfer.itrDate || ' '}</div>
                        <div className="text-center text-[7pt] text-gray-500 mt-0.5">Date</div>
                      </td>
                      <td className="border border-black p-2 w-[33.3%] vertical-align-top">
                        <div className="font-bold uppercase mb-4 text-purple-700">Approval / Authorizer:</div>
                        <div className="border-b border-black text-center font-bold text-[8.5pt] uppercase pt-4 min-h-[16px]">{selectedTransfer.itrApprovedBy || ' '}</div>
                        <div className="text-center text-[7pt] text-gray-500 mt-0.5">Signature over Printed Name</div>
                        <div className="border-b border-black text-center font-bold text-[8pt] pt-2 min-h-[16px]">{selectedTransfer.itrApprovedPosition || ' '}</div>
                        <div className="text-center text-[7pt] text-gray-500 mt-0.5">Designation</div>
                        <div className="border-b border-black text-center font-semibold pt-2 min-h-[16px]">{selectedTransfer.itrDate || ' '}</div>
                        <div className="text-center text-[7pt] text-gray-500 mt-0.5">Date</div>
                      </td>
                      <td className="border border-black p-2 w-[33.3%] vertical-align-top">
                        <div className="font-bold uppercase mb-4 text-emerald-700">Received By:</div>
                        <div className="border-b border-black text-center font-bold text-[8.5pt] uppercase pt-4 min-h-[16px]">{selectedTransfer.itrToTransferee || ' '}</div>
                        <div className="text-center text-[7pt] text-gray-500 mt-0.5">Signature over Printed Name</div>
                        <div className="border-b border-black text-center font-bold text-[8pt] pt-2 min-h-[16px]">{selectedTransfer.itrToPosition || ' '}</div>
                        <div className="text-center text-[7pt] text-gray-500 mt-0.5">Designation</div>
                        <div className="border-b border-black text-center font-semibold pt-2 min-h-[16px]">{selectedTransfer.itrDate || ' '}</div>
                        <div className="text-center text-[7pt] text-gray-500 mt-0.5">Date</div>
                      </td>
                    </tr>
                  </tbody>
                </table>

              </div>
            </div>

          </div>

        </div>
      )}
    </div>
  );
};
