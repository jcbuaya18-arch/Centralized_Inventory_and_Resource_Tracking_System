import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';

interface ProcurementTransaction {
  id: string;
  slipNumber: string;
  requestId: string;
  itemArticle: string;
  quantity: number;
  amount?: number;
  status: 'Sent' | 'Pending' | 'Received' | 'Distributed' | 'Approved' | 'Declined';
  user: string;
  office: string;
  timestamp: string;
  details: string;
}

interface ProcurementTransactionHistoryProps {
  userOffice?: string;
}

export const ProcurementTransactionHistory: React.FC<ProcurementTransactionHistoryProps> = ({ userOffice }) => {
  const [transactions, setTransactions] = useState<ProcurementTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [officeFilter, setOfficeFilter] = useState(userOffice || '');
  const [dateFilter, setDateFilter] = useState('');

  useEffect(() => {
    if (userOffice) {
      setOfficeFilter(userOffice);
    }
  }, [userOffice]);

  useEffect(() => {
    const q1 = query(collection(db, 'procurement_transactions'), orderBy('timestamp', 'desc'));

    let unsub1 = () => {};

    try {
      unsub1 = onSnapshot(q1, (snapshot) => {
        const list1 = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as ProcurementTransaction[];
        setTransactions(list1);
        setLoading(false);
      }, (error) => {
        console.error("Error loading procurement transactions:", error);
        setLoading(false);
      });
    } catch (e) {
      console.error(e);
      setLoading(false);
    }

    return () => {
      unsub1();
    };
  }, []);

  const offices = useMemo(() => {
    return Array.from(new Set(transactions.map(t => t.office).filter(Boolean)));
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    return transactions.filter(t => {
      const searchMatch = 
        (t.slipNumber?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (t.itemArticle?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (t.user?.toLowerCase() || '').includes(searchTerm.toLowerCase()) ||
        (t.details?.toLowerCase() || '').includes(searchTerm.toLowerCase());
      
      const statusMatch = statusFilter ? t.status === statusFilter : true;
      const officeMatch = officeFilter ? ((t.office || '').toLowerCase() === officeFilter.toLowerCase() || (t.details || '').toLowerCase().includes(officeFilter.toLowerCase())) : true;
      const dateMatch = dateFilter ? t.timestamp?.startsWith(dateFilter) : true;

      return searchMatch && statusMatch && officeMatch && dateMatch;
    });
  }, [transactions, searchTerm, statusFilter, officeFilter, dateFilter]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending':
        return (
          <span className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-amber-50 text-amber-700 border border-amber-250/30 rounded-xl">
            Pending
          </span>
        );
      case 'Sent':
        return (
          <span className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-blue-50 text-blue-700 border border-blue-250/30 rounded-xl">
            Sent
          </span>
        );
      case 'Received':
        return (
          <span className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-emerald-50 text-emerald-700 border border-emerald-250/30 rounded-xl">
            Received
          </span>
        );
      case 'Distributed':
        return (
          <span className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-purple-50 text-purple-700 border border-purple-250/30 rounded-xl">
            Distributed
          </span>
        );
      case 'Approved':
        return (
          <span className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-teal-50 text-teal-700 border border-teal-250/30 rounded-xl">
            Approved
          </span>
        );
      case 'Declined':
        return (
          <span className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-rose-50 text-rose-700 border border-rose-250/30 rounded-xl">
            Declined
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-1 text-[8px] font-black uppercase tracking-widest bg-slate-50 text-slate-700 border border-slate-200 rounded-xl">
            {status}
          </span>
        );
    }
  };

  const statusMetrics = useMemo(() => {
    return {
      total: transactions.length,
      sent: transactions.filter(t => t.status === 'Sent').length,
      pending: transactions.filter(t => t.status === 'Pending').length,
      received: transactions.filter(t => t.status === 'Received').length,
      distributed: transactions.filter(t => t.status === 'Distributed').length,
    };
  }, [transactions]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Banner/Header Block */}
      <div className="bg-white p-6 md:p-8 rounded-[32px] border border-gray-100 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <span className="text-[8px] font-black uppercase tracking-widest text-indigo-600">Auditing Desk</span>
          <h2 className="text-xl md:text-2xl font-black text-slate-9 tracking-tight uppercase font-brand mt-0.5">Consolidated Transaction History</h2>
          <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-1">
            Real-time compliance registry logging physical & financial status updates of Procurement Slips
          </p>
        </div>
        <button
          onClick={handlePrint}
          className="bg-slate-900 hover:bg-slate-850 text-white font-black text-[9px] uppercase tracking-widest px-4 py-3 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5 self-start sm:self-auto cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
          </svg>
          Print Audit log
        </button>
      </div>

      {/* Metrics widgets */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 no-print">
        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm flex flex-col justify-between">
          <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Total Logs</span>
          <div className="text-2xl font-black text-slate-900 mt-2">{statusMetrics.total}</div>
        </div>
        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm flex flex-col justify-between">
          <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest">Sent Cargo</span>
          <div className="text-2xl font-black text-blue-900 mt-2">{statusMetrics.sent}</div>
        </div>
        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm flex flex-col justify-between">
          <span className="text-[9px] font-black text-amber-500 uppercase tracking-widest">Pending Slips</span>
          <div className="text-2xl font-black text-amber-900 mt-2">{statusMetrics.pending}</div>
        </div>
        <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm flex flex-col justify-between">
          <span className="text-[9px] font-black text-emerald-500 uppercase tracking-widest">Received</span>
          <div className="text-2xl font-black text-emerald-900 mt-2">{statusMetrics.received}</div>
        </div>
      </div>

      {/* Grid structure: Left controls, Right logs list */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-[28px] border border-gray-100 shadow-sm space-y-5 h-fit no-print">
          <h3 className="text-slate-900 text-xs font-black uppercase tracking-widest border-b border-gray-50 pb-3">Filters Panel</h3>
          
          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Search Keyword</label>
            <input
              type="text"
              placeholder="SLIP NO, ITEM, DETAILS, USER..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-500 hover:bg-gray-100/70 rounded-xl font-bold text-[10px] uppercase tracking-widest outline-none transition-all"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Registry Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-500 outline-none hover:bg-gray-100/70 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
            >
              <option value="">All Statuses</option>
              <option value="Pending">Pending</option>
              <option value="Sent">Sent</option>
              <option value="Received">Received</option>
              <option value="Distributed">Distributed</option>
              <option value="Approved">Approved</option>
              <option value="Declined">Declined</option>
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Originating Office</label>
            <select
              value={officeFilter}
              onChange={e => setOfficeFilter(e.target.value)}
              className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-indigo-500 outline-none hover:bg-gray-100/70 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
            >
              <option value="">All Offices</option>
              {offices.map(off => (
                <option key={off} value={off}>{off}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[8px] font-black text-gray-400 uppercase tracking-widest ml-1">Specific Date</label>
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
              setStatusFilter('');
              setOfficeFilter('');
              setDateFilter('');
            }}
            className="w-full py-3 bg-slate-50 hover:bg-slate-100 text-slate-700 font-black text-[9px] uppercase tracking-widest rounded-xl transition-all"
          >
            Clear Filters
          </button>
        </div>

        {/* List representation / Printable table */}
        <div className="lg:col-span-3 bg-white rounded-[32px] border border-gray-100 shadow-sm p-6 md:p-8 overflow-hidden">
          
          {/* Printable Header Details */}
          <div className="hidden print:block text-center border-b border-slate-900 pb-5 mb-6">
            <h1 className="text-lg font-black uppercase tracking-tight">LGU Tibiao Asset Requisition & Cargo Log</h1>
            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-1">Centralized Audit trail Registry (Accounting & Engineering Modules)</p>
            <p className="text-[9px] text-gray-500 uppercase mt-2">Generated On: {new Date().toLocaleString()}</p>
          </div>

          {loading ? (
            <div className="p-16 flex flex-col items-center justify-center space-y-3">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
              <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Syncing transactions log...</p>
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="p-16 text-center space-y-3 border-2 border-dashed border-gray-100 rounded-[24px]">
              <div className="text-3xl">📝</div>
              <h4 className="text-slate-900 text-xs font-black uppercase tracking-wider">No Transactions Found</h4>
              <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest max-w-sm mx-auto leading-relaxed">
                Try amending search parameters or logging a physical/financial status update inside the slips table.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-gray-150 text-[8px] font-black text-gray-400 uppercase tracking-widest">
                    <th className="pb-4 pt-1 px-2 shrink-0">Time & Date</th>
                    <th className="pb-4 pt-1 px-2">Slip Number</th>
                    <th className="pb-4 pt-1 px-2">Item / Qty</th>
                    <th className="pb-4 pt-1 px-2 text-center">Status</th>
                    <th className="pb-4 pt-1 px-2">Action Details</th>
                    <th className="pb-4 pt-1 px-2">Officer</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 text-[10px] font-bold text-gray-600">
                  {filteredTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="py-4 px-2 text-[9px] text-slate-400 font-mono leading-tight whitespace-nowrap">
                        {tx.timestamp ? (
                          <>
                            <div>{tx.timestamp.split('T')[0]}</div>
                            <div className="text-[8px] text-gray-300 mt-0.5">{tx.timestamp.split('T')[1]?.substring(0, 5)}</div>
                          </>
                        ) : 'N/A'}
                      </td>
                      <td className="py-4 px-2">
                        <span className="font-mono bg-indigo-50/50 border border-indigo-100/50 text-indigo-700 px-2 py-1 rounded-lg text-[9px] uppercase font-black tracking-wider">
                          {tx.slipNumber || "N/A"}
                        </span>
                      </td>
                      <td className="py-4 px-2 leading-tight">
                        <div className="text-slate-900 font-black uppercase tracking-tight text-[10px]">{tx.itemArticle}</div>
                        <div className="text-slate-400 text-[8px] font-bold uppercase tracking-wider mt-0.5">
                          Qty: <span className="text-indigo-600 font-black">{tx.quantity}</span>
                          {tx.amount ? ` • Cost: ₱${tx.amount.toLocaleString()}` : ''}
                        </div>
                      </td>
                      <td className="py-4 px-2 text-center">
                        {getStatusBadge(tx.status)}
                      </td>
                      <td className="py-4 px-2 leading-relaxed text-[9px] font-medium text-slate-500 max-w-xs xl:max-w-md">
                        {tx.details}
                        <div className="text-[8px] text-gray-300 font-mono uppercase tracking-widest mt-1">From: {tx.office}</div>
                      </td>
                      <td className="py-4 px-2 whitespace-nowrap">
                        <div className="text-slate-800 font-black text-[9px] uppercase tracking-wide">{tx.user}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
