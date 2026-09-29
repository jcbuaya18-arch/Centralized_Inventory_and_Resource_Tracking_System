import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, addDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { UserRole } from '../types';

interface OutgoingRequestLogsProps {
  userOffice?: string;
  userName?: string;
  userRole?: UserRole;
}

export const OutgoingRequestLogs: React.FC<OutgoingRequestLogsProps> = ({ userOffice, userName, userRole }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [inventoryTransactions, setInventoryTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & State
  const [activeTab, setActiveTab] = useState<'ALL' | 'TRANSFERS' | 'DISPATCHES' | 'APPROVALS'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [originOfficeFilter, setOriginOfficeFilter] = useState(userRole === UserRole.OFFICE_HEAD && userOffice ? userOffice : '');
  const [destOfficeFilter, setDestOfficeFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');

  // Selected Log Modal State
  const [selectedLog, setSelectedLog] = useState<any | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  // Edit Log Modal State
  const [editingLog, setEditingLog] = useState<any | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Edit Form Fields
  const [editArticle, setEditArticle] = useState('');
  const [editQuantity, setEditQuantity] = useState<number>(1);
  const [editAmount, setEditAmount] = useState<number | ''>(0);
  const [editOriginOffice, setEditOriginOffice] = useState('');
  const [editDestOffice, setEditDestOffice] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editRequestedBy, setEditRequestedBy] = useState('');
  const [editJustification, setEditJustification] = useState('');
  const [editAdminRemarks, setEditAdminRemarks] = useState('');

  const startEditingLog = (log: any) => {
    setEditingLog(log);
    setEditArticle(log.article || '');
    setEditQuantity(log.quantity || 1);
    setEditAmount(log.amount !== undefined && log.amount !== null ? log.amount : '');
    setEditOriginOffice(log.originOffice || '');
    setEditDestOffice(log.destinationOffice || '');
    setEditStatus(log.status || 'PENDING');
    setEditRequestedBy(log.requestedBy || '');
    setEditJustification(log.justification || '');
    setEditAdminRemarks(log.adminRemarks || '');
    setShowEditModal(true);
  };

  const handleSaveLogEdit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingLog) return;
    setIsSavingEdit(true);
    try {
      const timestamp = new Date().toISOString();
      const updatedHistoryItem = {
        id: Math.random().toString(36).substring(2, 9),
        timestamp,
        action: 'Modified Outgoing Log',
        details: `Log record updated by ${userName || 'Accounting Officer'}. Status set to "${editStatus}".`
      };

      const existingHistory = editingLog.history || [];
      const newHistory = [updatedHistoryItem, ...existingHistory];

      if (editingLog.sourceType === 'REQUEST') {
        const docRef = doc(db, 'requests', editingLog.rawId);
        await updateDoc(docRef, {
          itemArticle: editArticle,
          title: editArticle,
          quantity: Number(editQuantity),
          amount: editAmount === '' ? 0 : Number(editAmount),
          unitValue: editAmount === '' ? 0 : Number(editAmount),
          originatingOffice: editOriginOffice,
          office: editOriginOffice,
          destinationOffice: editDestOffice,
          targetOffice: editDestOffice,
          recipientOffice: editDestOffice,
          status: editStatus,
          requestedBy: editRequestedBy,
          submittedBy: editRequestedBy,
          justification: editJustification,
          details: editJustification,
          adminRemarks: editAdminRemarks,
          responseRemarks: editAdminRemarks,
          history: newHistory,
        });
      } else if (editingLog.sourceType === 'PROCUREMENT_TX') {
        const docRef = doc(db, 'procurement_transactions', editingLog.rawId);
        await updateDoc(docRef, {
          itemArticle: editArticle,
          quantity: Number(editQuantity),
          amount: editAmount === '' ? 0 : Number(editAmount),
          office: editOriginOffice,
          targetOffice: editDestOffice,
          status: editStatus,
          user: editRequestedBy,
          details: editJustification,
        });
      } else if (editingLog.sourceType === 'INVENTORY_TX') {
        const docRef = doc(db, 'inventory_transactions', editingLog.rawId);
        await updateDoc(docRef, {
          article: editArticle,
          quantity: Number(editQuantity),
          officeId: editOriginOffice,
          targetOffice: editDestOffice,
          remarks: editJustification,
        });
      }

      await addDoc(collection(db, 'system_logs'), {
        timestamp: new Date(),
        user: userName || 'Accounting Officer',
        action: `Modified Outgoing Request Log (${editingLog.slipNumber}): "${editArticle}" updated`,
        module: 'Outgoing Request Logs'
      });

      alert(`Outgoing Request Log ${editingLog.slipNumber} updated successfully!`);
      setShowEditModal(false);
      setEditingLog(null);
    } catch (err) {
      console.error("Error updating outgoing request log:", err);
      alert("Failed to save changes to Firestore database.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Real-time Firestore subscriptions
  useEffect(() => {
    // 1. Subscribe to requests collection for outgoing requests
    const qReqs = query(collection(db, 'requests'), orderBy('requestedAt', 'desc'));
    const unsubReqs = onSnapshot(qReqs, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: d.id,
        sourceType: 'REQUEST',
        ...d.data()
      }));
      setRequests(list);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching outgoing requests:", err);
      setLoading(false);
    });

    // 2. Subscribe to procurement_transactions collection
    const qProc = query(collection(db, 'procurement_transactions'), orderBy('timestamp', 'desc'));
    const unsubProc = onSnapshot(qProc, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: d.id,
        sourceType: 'PROCUREMENT_TX',
        ...d.data()
      }));
      setTransactions(list);
    }, (err) => {
      console.error("Error fetching procurement transactions:", err);
    });

    // 3. Subscribe to inventory_transactions collection
    const qInvTx = query(collection(db, 'inventory_transactions'), orderBy('timestamp', 'desc'));
    const unsubInvTx = onSnapshot(qInvTx, (snapshot) => {
      const list = snapshot.docs.map(d => ({
        id: d.id,
        sourceType: 'INVENTORY_TX',
        ...d.data()
      }));
      setInventoryTransactions(list);
    }, (err) => {
      console.error("Error fetching inventory transactions:", err);
    });

    return () => {
      unsubReqs();
      unsubProc();
      unsubInvTx();
    };
  }, []);

  // Consolidate and normalize all outgoing logs
  const consolidatedLogs = useMemo(() => {
    const logs: any[] = [];

    // Process Requests
    requests.forEach((r) => {
      const slipNo = r.slipNumber || r.requestNumber || `PR-${r.id.substring(0, 8).toUpperCase()}`;
      const origin = r.originatingOffice || r.office || 'Municipal Hall';
      const dest = r.destinationOffice || r.recipientOffice || r.targetOffice || 'Accounting / Engineering';
      
      logs.push({
        id: `REQ-${r.id}`,
        rawId: r.id,
        sourceType: 'REQUEST',
        slipNumber: slipNo,
        article: r.itemArticle || r.title || 'Untitled Request',
        quantity: r.quantity || 1,
        amount: r.amount || r.unitValue || 0,
        requestType: r.requestType || 'REQUISITION',
        originOffice: origin,
        destinationOffice: dest,
        requestedBy: r.requestedBy || r.submittedBy || 'Official',
        status: String(r.status || 'PENDING').toUpperCase(),
        timestamp: r.requestedAt || r.sentAt || r.createdAt || new Date().toISOString(),
        justification: r.justification || r.details || '',
        adminRemarks: r.adminRemarks || r.responseRemarks || '',
        history: r.history || [],
        attachedDocs: r.attachedDocs || [],
        rawRecord: r
      });
    });

    // Process Procurement Transactions
    transactions.forEach((t) => {
      const slipNo = t.slipNumber || `TX-${t.id.substring(0, 8).toUpperCase()}`;
      logs.push({
        id: `PTX-${t.id}`,
        rawId: t.id,
        sourceType: 'PROCUREMENT_TX',
        slipNumber: slipNo,
        article: t.itemArticle || 'Procurement Item',
        quantity: t.quantity || 1,
        amount: t.amount || 0,
        requestType: 'PROCUREMENT_LOG',
        originOffice: t.office || 'Procurement Office',
        destinationOffice: t.targetOffice || 'Warehouse / Recipient',
        requestedBy: t.user || 'System Officer',
        status: String(t.status || 'LOGGED').toUpperCase(),
        timestamp: t.timestamp || new Date().toISOString(),
        justification: t.details || 'Procurement transaction entry',
        adminRemarks: '',
        history: [],
        rawRecord: t
      });
    });

    // Process Inventory Transfer Transactions
    inventoryTransactions.forEach((it) => {
      if (it.transactionType?.includes('Transfer') || it.transactionType?.includes('Distributed') || it.transactionType?.includes('Issued')) {
        logs.push({
          id: `ITX-${it.id}`,
          rawId: it.id,
          sourceType: 'INVENTORY_TX',
          slipNumber: it.reference || `ITX-${it.id.substring(0, 8).toUpperCase()}`,
          article: it.article || 'Transferred Item',
          quantity: it.quantity || 1,
          amount: 0,
          requestType: 'TRANSFER_LOG',
          originOffice: it.officeId || 'Warehouse',
          destinationOffice: it.targetOffice || 'Recipient Office',
          requestedBy: it.user || 'Warehouse Custodian',
          status: 'COMPLETED',
          timestamp: it.timestamp || new Date().toISOString(),
          justification: it.remarks || 'Stock movement record',
          adminRemarks: '',
          history: [],
          rawRecord: it
        });
      }
    });

    // Sort descending by timestamp
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [requests, transactions, inventoryTransactions]);

  // Extract unique offices for filter dropdowns
  const availableOffices = useMemo(() => {
    const set = new Set<string>();
    consolidatedLogs.forEach(l => {
      if (l.originOffice) set.add(l.originOffice);
      if (l.destinationOffice) set.add(l.destinationOffice);
    });
    return Array.from(set).sort();
  }, [consolidatedLogs]);

  // Filtered outgoing logs
  const filteredLogs = useMemo(() => {
    return consolidatedLogs.filter(log => {
      // Tab Category Filtering
      if (activeTab === 'TRANSFERS' && !['TRANSFER_LOG', 'SENT', 'SUBMITTED', 'FORWARDED'].includes(log.status) && !log.destinationOffice) return false;
      if (activeTab === 'DISPATCHES' && !['DISPATCHED', 'DISTRIBUTED', 'COMPLETED', 'RECEIVED'].includes(log.status)) return false;
      if (activeTab === 'APPROVALS' && !['APPROVED', 'DECLINED', 'REJECTED', 'RETURNED_FOR_REVISION'].includes(log.status)) return false;

      // Keyword Search
      const term = searchTerm.toLowerCase().trim();
      if (term) {
        const matchSearch =
          (log.slipNumber || '').toLowerCase().includes(term) ||
          (log.article || '').toLowerCase().includes(term) ||
          (log.originOffice || '').toLowerCase().includes(term) ||
          (log.destinationOffice || '').toLowerCase().includes(term) ||
          (log.requestedBy || '').toLowerCase().includes(term) ||
          (log.justification || '').toLowerCase().includes(term);
        if (!matchSearch) return false;
      }

      // Office Filters
      if (originOfficeFilter && (log.originOffice || '').toLowerCase() !== originOfficeFilter.toLowerCase()) return false;
      if (destOfficeFilter && (log.destinationOffice || '').toLowerCase() !== destOfficeFilter.toLowerCase()) return false;

      // Status Filter
      if (statusFilter && log.status !== statusFilter) return false;

      // Date Filter
      if (dateFilter && !log.timestamp.startsWith(dateFilter)) return false;

      return true;
    });
  }, [consolidatedLogs, activeTab, searchTerm, originOfficeFilter, destOfficeFilter, statusFilter, dateFilter]);

  // Outgoing Statistics Metrics
  const metrics = useMemo(() => {
    return {
      total: consolidatedLogs.length,
      pending: consolidatedLogs.filter(l => ['PENDING', 'FORWARDED', 'SUBMITTED', 'SENT'].includes(l.status)).length,
      approved: consolidatedLogs.filter(l => ['APPROVED', 'COMPLETED', 'DISPATCHED', 'RECEIVED'].includes(l.status)).length,
      declined: consolidatedLogs.filter(l => ['DECLINED', 'REJECTED', 'RETURNED_FOR_REVISION'].includes(l.status)).length,
      totalValue: consolidatedLogs.reduce((acc, l) => acc + (l.amount || 0), 0)
    };
  }, [consolidatedLogs]);

  // Printable Audit Log Handler
  const handlePrintLogs = () => {
    const printWindow = window.open('', '_blank', 'width=1000,height=800');
    if (!printWindow) return;

    const rowsHtml = filteredLogs.map((log, idx) => `
      <tr>
        <td style="border:1px solid #000;padding:6px;text-align:center;">${idx + 1}</td>
        <td style="border:1px solid #000;padding:6px;font-family:monospace;font-size:9pt;font-weight:700;color:#1d4ed8;">${log.slipNumber}</td>
        <td style="border:1px solid #000;padding:6px;font-weight:700;text-transform:uppercase;">${log.article} (x${log.quantity})</td>
        <td style="border:1px solid #000;padding:6px;">${log.originOffice} &rarr; ${log.destinationOffice}</td>
        <td style="border:1px solid #000;padding:6px;text-align:center;font-weight:700;">${log.status}</td>
        <td style="border:1px solid #000;padding:6px;">${log.requestedBy}</td>
        <td style="border:1px solid #000;padding:6px;font-size:8pt;">${new Date(log.timestamp).toLocaleString()}</td>
      </tr>
    `).join('');

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>LGU Tibiao - Outgoing Request Audit Log</title>
        <style>
          @media print { @page { margin: 15mm; } body { -webkit-print-color-adjust: exact; } }
          body { font-family: 'Times New Roman', serif; font-size: 10pt; color: #000; padding: 24px; }
          .header { text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; }
          .gov { font-size: 8pt; text-transform: uppercase; font-weight: 700; color: #555; }
          .lgu { font-size: 14pt; font-weight: 900; text-transform: uppercase; }
          .title { font-size: 18pt; font-weight: 900; text-transform: uppercase; margin-top: 4px; }
          table { width: 100%; border-collapse: collapse; font-size: 9pt; }
          th { background: #111; color: #fff; border: 1px solid #000; padding: 8px; text-transform: uppercase; font-size: 8pt; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="gov">Republic of the Philippines &bull; Province of Antique</div>
          <div class="lgu">Municipality of Tibiao</div>
          <div class="title">Consolidated Outgoing Request Audit Log</div>
          <div style="font-size: 9pt; font-style: italic; margin-top: 4px;">Generated On: ${new Date().toLocaleString()}</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Slip Number</th>
              <th>Item / Quantity</th>
              <th>Route (Origin &rarr; Destination)</th>
              <th>Status</th>
              <th>Officer</th>
              <th>Date & Time</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); }, 400);
  };

  // Status Badge Helper
  const renderStatusBadge = (status: string) => {
    const s = String(status || '').toUpperCase();
    if (['APPROVED', 'COMPLETED', 'RECEIVED'].includes(s)) {
      return (
        <span className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl">
          {s}
        </span>
      );
    }
    if (['PENDING', 'FORWARDED', 'SUBMITTED', 'SENT', 'DRAFT'].includes(s)) {
      return (
        <span className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-200 rounded-xl">
          {s === 'FORWARDED' ? 'SENT TO ADMIN' : s}
        </span>
      );
    }
    if (['DISPATCHED', 'DISTRIBUTED'].includes(s)) {
      return (
        <span className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-200 rounded-xl">
          {s}
        </span>
      );
    }
    if (['DECLINED', 'REJECTED', 'RETURNED_FOR_REVISION', 'RETURNED FOR CORRECTION'].includes(s)) {
      return (
        <span className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-rose-50 text-rose-700 border border-rose-200 rounded-xl">
          {s}
        </span>
      );
    }
    return (
      <span className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-slate-50 text-slate-700 border border-slate-200 rounded-xl">
        {s}
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Banner / Page Header */}
      <div className="bg-white p-6 md:p-8 rounded-[32px] border border-gray-150 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <div className="flex items-center space-x-2">
            <span className="w-2.5 h-6 bg-indigo-600 rounded-full block"></span>
            <h2 className="text-2xl md:text-3xl font-black text-slate-900 font-brand tracking-tight uppercase">
              Outgoing Request Logs
            </h2>
          </div>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-1 ml-4">
            LGU Centralized Outgoing Requisition & Dispatch Log Desk &bull; Track Sent Slips, Inter-Office Transfers & Outgoing Approvals
          </p>
        </div>
        <button
          onClick={handlePrintLogs}
          className="bg-slate-900 hover:bg-indigo-600 text-white font-black text-[9px] uppercase tracking-widest px-5 py-3.5 rounded-2xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2 cursor-pointer self-start sm:self-auto"
        >
          <svg className="w-4 h-4 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          <span>Print Audit Log</span>
        </button>
      </div>

      {/* Metrics Widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        <div className="bg-white p-5 rounded-[24px] border border-gray-150 shadow-sm flex flex-col justify-between">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Outgoing Logs</span>
          <div className="text-2xl font-black text-slate-900 mt-2">{metrics.total}</div>
        </div>
        <div className="bg-white p-5 rounded-[24px] border border-gray-150 shadow-sm flex flex-col justify-between">
          <span className="text-[9px] font-black text-amber-600 uppercase tracking-widest">Pending Evaluation</span>
          <div className="text-2xl font-black text-amber-900 mt-2">{metrics.pending}</div>
        </div>
        <div className="bg-white p-5 rounded-[24px] border border-gray-150 shadow-sm flex flex-col justify-between">
          <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">Approved / Dispatched</span>
          <div className="text-2xl font-black text-emerald-900 mt-2">{metrics.approved}</div>
        </div>
        <div className="bg-white p-5 rounded-[24px] border border-gray-150 shadow-sm flex flex-col justify-between">
          <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">Total Valuation</span>
          <div className="text-xl font-black text-indigo-900 mt-2">₱{metrics.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-250 pb-4 no-print">
        {[
          { id: 'ALL', label: 'All Outgoing Logs', count: consolidatedLogs.length },
          { id: 'TRANSFERS', label: 'Inter-Office Transfers', count: consolidatedLogs.filter(l => l.destinationOffice).length },
          { id: 'DISPATCHES', label: 'Dispatched & Completed', count: consolidatedLogs.filter(l => ['DISPATCHED', 'DISTRIBUTED', 'COMPLETED', 'RECEIVED'].includes(l.status)).length },
          { id: 'APPROVALS', label: 'Approved / Flagged', count: consolidatedLogs.filter(l => ['APPROVED', 'DECLINED', 'REJECTED', 'RETURNED_FOR_REVISION'].includes(l.status)).length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition-all duration-200 flex items-center space-x-2 ${
              activeTab === tab.id
                ? 'bg-slate-900 text-white shadow-md scale-[1.02]'
                : 'bg-white hover:bg-gray-100 text-slate-600 border border-gray-200'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-slate-700'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Main Grid: Controls + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        
        {/* Controls / Filter Sidebar */}
        <div className="bg-white p-6 rounded-[28px] border border-gray-150 shadow-sm space-y-5 h-fit no-print">
          <h3 className="text-slate-900 text-xs font-black uppercase tracking-widest border-b border-gray-100 pb-3">
            Search & Filter Controls
          </h3>

          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Search Keywords</label>
            <input
              type="text"
              placeholder="SLIP NO, ARTICLE, OFFICER..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-500 hover:bg-gray-100/70 rounded-xl font-bold text-[10px] uppercase tracking-widest outline-none transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Originating Office</label>
            <select
              value={originOfficeFilter}
              onChange={e => setOriginOfficeFilter(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-500 outline-none hover:bg-gray-100/70 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
            >
              <option value="">All Originating Offices</option>
              {availableOffices.map(off => (
                <option key={off} value={off}>{off}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Destination Office</label>
            <select
              value={destOfficeFilter}
              onChange={e => setDestOfficeFilter(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-500 outline-none hover:bg-gray-100/70 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
            >
              <option value="">All Destination Offices</option>
              {availableOffices.map(off => (
                <option key={off} value={off}>{off}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Specific Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-500 outline-none hover:bg-gray-100/70 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="PENDING">PENDING</option>
              <option value="APPROVED">APPROVED</option>
              <option value="DISPATCHED">DISPATCHED</option>
              <option value="DECLINED">DECLINED</option>
              <option value="REJECTED">REJECTED</option>
              <option value="COMPLETED">COMPLETED</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Date Filter</label>
            <input
              type="date"
              value={dateFilter}
              onChange={e => setDateFilter(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-500 rounded-xl font-bold text-[10px] uppercase tracking-widest outline-none transition-all"
            />
          </div>

          <button
            onClick={() => {
              setSearchTerm('');
              setOriginOfficeFilter('');
              setDestOfficeFilter('');
              setStatusFilter('');
              setDateFilter('');
            }}
            className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 font-black text-[9px] uppercase tracking-widest rounded-xl transition-all"
          >
            Clear Filters
          </button>
        </div>

        {/* Logs Listing Table */}
        <div className="lg:col-span-3 bg-white rounded-[32px] border border-gray-150 shadow-sm p-6 md:p-8 overflow-hidden">
          
          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center space-y-3">
              <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Syncing outgoing logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-16 text-center space-y-3 border-2 border-dashed border-gray-150 rounded-[28px]">
              <div className="text-3xl">📤</div>
              <h4 className="text-slate-900 text-xs font-black uppercase tracking-wider">No Outgoing Logs Found</h4>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest max-w-sm mx-auto leading-relaxed">
                Adjust search keywords or category tabs to display logged outgoing requests and transfers.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-150 text-[8px] font-black text-gray-400 uppercase tracking-widest">
                    <th className="pb-4 pt-1 px-3">Date & Time</th>
                    <th className="pb-4 pt-1 px-3">Slip Reference</th>
                    <th className="pb-4 pt-1 px-3">Item Article / Qty</th>
                    <th className="pb-4 pt-1 px-3">Route (Origin &rarr; Destination)</th>
                    <th className="pb-4 pt-1 px-3 text-center">Status</th>
                    <th className="pb-4 pt-1 px-3">Officer</th>
                    <th className="pb-4 pt-1 px-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-[10px] font-bold text-gray-600">
                  {filteredLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50/70 transition-colors">
                      <td className="py-4 px-3 text-[9px] text-slate-400 font-mono leading-tight whitespace-nowrap">
                        {log.timestamp ? (
                          <>
                            <div>{log.timestamp.split('T')[0]}</div>
                            <div className="text-[8px] text-gray-400 mt-0.5">{log.timestamp.split('T')[1]?.substring(0, 5)}</div>
                          </>
                        ) : 'N/A'}
                      </td>

                      <td className="py-4 px-3">
                        <span className="font-mono bg-indigo-50 border border-indigo-150 text-indigo-700 px-2.5 py-1 rounded-xl text-[9px] uppercase font-black tracking-wider">
                          {log.slipNumber}
                        </span>
                      </td>

                      <td className="py-4 px-3 leading-tight">
                        <div className="text-slate-900 font-black uppercase tracking-tight text-[11px]">{log.article}</div>
                        <div className="text-slate-400 text-[8.5px] font-bold uppercase tracking-wider mt-0.5">
                          Qty: <span className="text-indigo-600 font-black">{log.quantity}</span>
                          {log.amount ? ` • Val: ₱${log.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}` : ''}
                        </div>
                      </td>

                      <td className="py-4 px-3 leading-tight">
                        <div className="text-slate-800 font-black text-[9.5px] uppercase">{log.originOffice}</div>
                        <div className="text-indigo-600 text-[8px] font-bold uppercase tracking-wider mt-0.5">
                          &rarr; {log.destinationOffice}
                        </div>
                      </td>

                      <td className="py-4 px-3 text-center">
                        {renderStatusBadge(log.status)}
                      </td>

                      <td className="py-4 px-3 whitespace-nowrap">
                        <div className="text-slate-800 font-black text-[9px] uppercase">{log.requestedBy}</div>
                      </td>

                      <td className="py-4 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              setSelectedLog(log);
                              setShowDetailModal(true);
                            }}
                            className="px-3 py-1.5 bg-slate-900 hover:bg-indigo-600 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-sm"
                          >
                            Details
                          </button>
                          <button
                            onClick={() => startEditingLog(log)}
                            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[9px] font-black uppercase tracking-widest transition-all cursor-pointer shadow-sm flex items-center gap-1"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                            </svg>
                            <span>Edit</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

        </div>
      </div>

      {/* Details Modal */}
      {showDetailModal && selectedLog && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl border border-gray-150 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400">Outgoing Log Audit Record</span>
                <h3 className="text-lg font-black uppercase tracking-tight font-brand mt-0.5">
                  Ref: {selectedLog.slipNumber}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedLog(null);
                }}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto custom-scrollbar text-xs">
              <div className="grid grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                <div>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Item Article</span>
                  <p className="font-black text-slate-900 text-sm uppercase mt-0.5">{selectedLog.article}</p>
                </div>
                <div>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Current Status</span>
                  <div className="mt-1">{renderStatusBadge(selectedLog.status)}</div>
                </div>
                <div>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Originating Office</span>
                  <p className="font-bold text-slate-800 uppercase mt-0.5">{selectedLog.originOffice}</p>
                </div>
                <div>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Destination Office</span>
                  <p className="font-bold text-indigo-700 uppercase mt-0.5">{selectedLog.destinationOffice}</p>
                </div>
                <div>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Quantity & Value</span>
                  <p className="font-bold text-slate-800 uppercase mt-0.5">
                    {selectedLog.quantity} unit(s) {selectedLog.amount ? `• ₱${selectedLog.amount.toLocaleString()}` : ''}
                  </p>
                </div>
                <div>
                  <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest block">Logging Officer</span>
                  <p className="font-bold text-slate-800 uppercase mt-0.5">{selectedLog.requestedBy}</p>
                </div>
              </div>

              {selectedLog.justification && (
                <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100 space-y-1">
                  <span className="text-[8px] font-black text-indigo-600 uppercase tracking-widest block">Purpose / Justification Details</span>
                  <p className="text-slate-700 italic leading-relaxed">&ldquo;{selectedLog.justification}&rdquo;</p>
                </div>
              )}

              {selectedLog.adminRemarks && (
                <div className="p-4 bg-blue-50/40 rounded-2xl border border-blue-100 space-y-1">
                  <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest block">Evaluation / Remarks</span>
                  <p className="text-slate-700 font-semibold">{selectedLog.adminRemarks}</p>
                </div>
              )}

              {selectedLog.history && selectedLog.history.length > 0 && (
                <div className="space-y-2 pt-2 border-t border-gray-100">
                  <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest block">Audit History Trail ({selectedLog.history.length})</span>
                  <div className="space-y-2">
                    {selectedLog.history.map((h: any, idx: number) => (
                      <div key={h.id || idx} className="p-3 bg-gray-50 rounded-xl border-l-3 border-l-indigo-600">
                        <div className="flex items-center justify-between text-[8px] font-black uppercase text-indigo-700">
                          <span>{h.action}</span>
                          <span className="text-gray-400 font-mono">{h.timestamp ? new Date(h.timestamp).toLocaleString() : ''}</span>
                        </div>
                        <p className="text-[10px] text-slate-600 mt-1">{h.details}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
              <button
                onClick={() => {
                  const logToEdit = selectedLog;
                  setShowDetailModal(false);
                  setSelectedLog(null);
                  startEditingLog(logToEdit);
                }}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                <span>Edit Record</span>
              </button>
              <button
                onClick={() => {
                  setShowDetailModal(false);
                  setSelectedLog(null);
                }}
                className="px-5 py-2.5 bg-slate-900 hover:bg-black text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer"
              >
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Log Modal */}
      {showEditModal && editingLog && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-[32px] shadow-2xl border border-gray-150 overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[8px] font-black uppercase tracking-widest text-indigo-400">Modify Outgoing Requisition Record</span>
                <h3 className="text-lg font-black uppercase tracking-tight font-brand mt-0.5">
                  Edit Ref: {editingLog.slipNumber}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingLog(null);
                }}
                className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-all cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveLogEdit} className="p-6 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Item Article / Description *</label>
                  <input
                    type="text"
                    required
                    value={editArticle}
                    onChange={e => setEditArticle(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-indigo-600 rounded-xl font-bold text-xs uppercase text-slate-800 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Current Status</label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-indigo-600 rounded-xl font-bold text-xs uppercase text-slate-800 outline-none transition-all cursor-pointer"
                  >
                    <option value="PENDING">PENDING</option>
                    <option value="SUBMITTED">SUBMITTED / FORWARDED</option>
                    <option value="APPROVED">APPROVED</option>
                    <option value="DISPATCHED">DISPATCHED</option>
                    <option value="COMPLETED">COMPLETED</option>
                    <option value="DECLINED">DECLINED</option>
                    <option value="REJECTED">REJECTED</option>
                    <option value="RETURNED_FOR_REVISION">RETURNED FOR REVISION</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Quantity *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={editQuantity}
                    onChange={e => setEditQuantity(Number(e.target.value))}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-indigo-600 rounded-xl font-bold text-xs text-slate-800 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Valuation Amount (₱)</label>
                  <input
                    type="number"
                    min={0}
                    value={editAmount}
                    onChange={e => setEditAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-indigo-600 rounded-xl font-bold text-xs text-slate-800 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Originating Office *</label>
                  <input
                    type="text"
                    required
                    value={editOriginOffice}
                    onChange={e => setEditOriginOffice(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-indigo-600 rounded-xl font-bold text-xs uppercase text-slate-800 outline-none transition-all"
                  />
                </div>

                <div>
                  <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Destination Office *</label>
                  <input
                    type="text"
                    required
                    value={editDestOffice}
                    onChange={e => setEditDestOffice(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-indigo-600 rounded-xl font-bold text-xs uppercase text-slate-800 outline-none transition-all"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Logging / Requesting Officer</label>
                  <input
                    type="text"
                    value={editRequestedBy}
                    onChange={e => setEditRequestedBy(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-indigo-600 rounded-xl font-bold text-xs uppercase text-slate-800 outline-none transition-all"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Purpose / Specifications / Justification</label>
                  <textarea
                    rows={2}
                    value={editJustification}
                    onChange={e => setEditJustification(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-indigo-600 rounded-xl font-bold text-xs text-slate-800 outline-none transition-all"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[8px] font-black text-slate-400 uppercase tracking-widest mb-1">Evaluation / Admin Remarks</label>
                  <textarea
                    rows={2}
                    value={editAdminRemarks}
                    onChange={e => setEditAdminRemarks(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 focus:border-indigo-600 rounded-xl font-bold text-xs text-slate-800 outline-none transition-all"
                  />
                </div>
              </div>

              {/* Modal Buttons */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingLog(null);
                  }}
                  className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-slate-700 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-black uppercase tracking-widest rounded-xl transition-all shadow-md active:scale-95 flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSavingEdit ? 'Saving...' : 'Save & Sync Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
