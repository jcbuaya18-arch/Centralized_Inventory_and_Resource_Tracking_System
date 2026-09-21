import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';

interface InventoryItem {
  id: string;
  article: string;
  propertyNumber: string;
  unitValue: number;
  qtyPhysicalCount: number;
  office: string;
  personAccountable: string;
  status: string;
  condition?: string;
  category: string;
  classification?: string;
}

const CloudLedger: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'office_ledger' | 'raw_ledger'>('office_ledger');
  const [activeTable, setActiveTable] = useState<'inventory_items' | 'reports'>('inventory_items');
  const [selectedOffice, setSelectedOffice] = useState<string>('');
  
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [rawItems, setRawItems] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [rawLoading, setRawLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // 1. Subscribe to all items for the Office breakdown Ledger
  useEffect(() => {
    setIsLoading(true);
    const q = query(collection(db, 'inventory_items'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as InventoryItem[];
      setItems(fetched);
      setIsLoading(false);
      
      // Auto select first office if none was selected
      if (fetched.length > 0 && !selectedOffice) {
        const firstOffice = fetched[0].office || 'Unassigned';
        setSelectedOffice(firstOffice);
      }
    }, (error) => {
      console.error('Database Office Fetch Error:', error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // 2. Subscribe to raw table selection
  useEffect(() => {
    if (activeTab !== 'raw_ledger') return;
    setRawLoading(true);
    const q = query(collection(db, activeTable));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const fetched = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setRawItems(fetched);
      setRawLoading(false);
    }, (error) => {
      console.error('Raw Database Table Fetch Error:', error);
      setRawLoading(false);
    });

    return () => unsubscribe();
  }, [activeTab, activeTable]);

  // Group items by office
  const officeGroups: { [key: string]: InventoryItem[] } = {};
  items.forEach(item => {
    const officeName = item.office || 'Unassigned';
    if (!officeGroups[officeName]) {
      officeGroups[officeName] = [];
    }
    officeGroups[officeName].push(item);
  });

  const officeNames = Object.keys(officeGroups).sort();

  // Search filter for office breakdown
  const filteredOfficeItems = selectedOffice && officeGroups[selectedOffice]
    ? officeGroups[selectedOffice].filter(item => {
        const matchStr = `${item.article} ${item.propertyNumber} ${item.personAccountable} ${item.category}`.toLowerCase();
        return matchStr.includes(searchTerm.toLowerCase());
      })
    : [];

  // Search filter for raw records
  const filteredRawItems = rawItems.filter(record => {
    const serialized = JSON.stringify(record).toLowerCase();
    return serialized.includes(searchTerm.toLowerCase());
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-500 pb-20">
      {/* Page Title Header */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-black text-gray-900 font-brand tracking-tight uppercase">Cloud Ledger</h2>
          <p className="text-blue-600 text-[10px] font-bold uppercase tracking-[0.2em] mt-1">
            Real-time Government Allocation Ledger and Direct Database Nodes
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex bg-gray-100 p-1 rounded-2xl border border-gray-200">
          <button
            onClick={() => {
              setActiveTab('office_ledger');
              setSearchTerm('');
            }}
            className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'office_ledger' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Office Assignments
          </button>
          <button
            onClick={() => {
              setActiveTab('raw_ledger');
              setSearchTerm('');
            }}
            className={`px-5 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
              activeTab === 'raw_ledger' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Raw Firestore Nodes
          </button>
        </div>
      </div>

      {activeTab === 'office_ledger' ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Office Directory Cards */}
          <div className="lg:col-span-4 space-y-4 max-h-[750px] overflow-y-auto pr-2 custom-scrollbar">
            <h3 className="text-gray-400 text-[9px] font-black uppercase tracking-widest px-1">Municipal Offices</h3>
            
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-3"></div>
                <p className="text-[9px] font-black uppercase tracking-widest text-gray-400">Loading Offices...</p>
              </div>
            ) : officeNames.length === 0 ? (
              <div className="p-8 text-center bg-white rounded-3xl border border-gray-100 text-gray-400">
                No active municipal items found in registry.
              </div>
            ) : (
              officeNames.map(officeName => {
                const officeItems = officeGroups[officeName] || [];
                const totalVal = officeItems.reduce((sum, i) => sum + (i.unitValue * (i.qtyPhysicalCount || 1)), 0);
                const isSelected = selectedOffice === officeName;

                return (
                  <div
                    key={officeName}
                    onClick={() => setSelectedOffice(officeName)}
                    className={`p-5 rounded-3xl border transition-all cursor-pointer flex flex-col justify-between h-36 ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-100'
                        : 'bg-white border-gray-100 text-slate-800 hover:border-blue-200'
                    }`}
                  >
                    <div>
                      <span className={`text-[8px] font-black uppercase tracking-widest ${isSelected ? 'text-blue-200' : 'text-blue-600'}`}>
                        Active Department
                      </span>
                      <h4 className="font-brand font-black text-sm uppercase tracking-tight mt-1 line-clamp-2">
                        {officeName}
                      </h4>
                    </div>

                    <div className="flex items-end justify-between border-t pt-3 border-current/10 mt-3">
                      <div>
                        <p className={`text-[7px] font-bold uppercase ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>Items Count</p>
                        <p className="text-lg font-black leading-none mt-1">{officeItems.length}</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-[7px] font-bold uppercase ${isSelected ? 'text-blue-200' : 'text-gray-400'}`}>Total Value</p>
                        <p className="text-lg font-black leading-none mt-1">₱{totalVal.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Right Column: Detailed Item List for Selected Office */}
          <div className="lg:col-span-8 bg-white rounded-[40px] border border-gray-100 shadow-sm p-6 md:p-8 flex flex-col min-h-[600px]">
            {/* Context Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-50 pb-6 gap-4">
              <div>
                <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest leading-none">
                  Office Allocation Detail
                </span>
                <h3 className="text-xl font-brand font-black text-slate-900 uppercase tracking-tight mt-1">
                  {selectedOffice || 'No Office Selected'}
                </h3>
              </div>

              {/* Serch Bar */}
              <div className="relative w-full sm:max-w-xs">
                <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input 
                  type="text" 
                  placeholder="Filter items..." 
                  className="w-full pl-11 pr-4 py-2.5 bg-gray-50 border border-transparent focus:border-blue-100 outline-none rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-700"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>

            {/* List Table */}
            <div className="flex-1 overflow-x-auto custom-scrollbar mt-6">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Accessing Cloud Files...</p>
                </div>
              ) : filteredOfficeItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-28 text-center text-gray-400">
                  <svg className="w-12 h-12 text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                  </svg>
                  <p className="text-[10px] font-black uppercase tracking-widest">No Items Matched Criteria</p>
                </div>
              ) : (
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-gray-50/50 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                      <th className="px-4 py-3">Property No.</th>
                      <th className="px-4 py-3">Article Nomenclature</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Custodian</th>
                      <th className="px-4 py-3">Condition</th>
                      <th className="px-4 py-3 text-right">Value (₱)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 text-[10px] font-bold text-gray-700">
                    {filteredOfficeItems.map(item => (
                      <tr key={item.id} className="hover:bg-blue-50/10 transition-all">
                        <td className="px-4 py-4 font-mono text-[9px] text-gray-400">{item.propertyNumber}</td>
                        <td className="px-4 py-4 font-black text-slate-800 uppercase tracking-tight text-[11px] min-w-[150px]">
                          {item.article}
                        </td>
                        <td className="px-4 py-4">
                          <span className="bg-slate-50 text-slate-600 text-[8px] font-black px-2 py-0.5 rounded uppercase tracking-widest">
                            {item.category}
                          </span>
                        </td>
                        <td className="px-4 py-4 uppercase font-black text-gray-600 text-[9px]">{item.personAccountable || 'TBD'}</td>
                        <td className="px-4 py-4">
                          <span className={`text-[8.5px] font-black px-2 py-0.5 rounded-full border uppercase tracking-widest ${
                            item.condition === 'Brand New' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                            item.condition === 'Good' ? 'bg-blue-50 text-blue-700 border-blue-100' :
                            item.condition === 'Fair' ? 'bg-orange-50 text-orange-700 border-orange-100' :
                            item.condition === 'Damaged' ? 'bg-red-50 text-red-700 border-red-100/50' :
                            item.condition === 'Under Repair' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                            item.condition === 'Poor' ? 'bg-rose-50 text-rose-700 border-rose-100/50' :
                            item.condition === 'Condemned' ? 'bg-zinc-100 text-zinc-700 border-zinc-200' :
                            item.condition === 'Lost' ? 'bg-slate-100 text-slate-700 border-slate-200' :
                            'bg-gray-50 text-gray-700 border-gray-100'
                          }`}>
                            {item.condition || 'Brand New'}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-right font-black text-slate-900 text-xs">
                          {(item.unitValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Raw Firestore Nodes Mode */
        <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[600px]">
          <div className="p-8 border-b border-gray-50 flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex bg-gray-100 p-1.5 rounded-2xl space-x-1">
              <button 
                onClick={() => setActiveTable('inventory_items')} 
                className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                  activeTable === 'inventory_items' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                inventory_items
              </button>
              <button 
                onClick={() => setActiveTable('reports')} 
                className={`px-6 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${
                  activeTable === 'reports' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                reports
              </button>
            </div>

            <div className="relative flex-1 max-w-md">
              <svg className="w-4 h-4 absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input 
                type="text" 
                placeholder="Search raw records..." 
                className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-transparent focus:border-blue-100 outline-none rounded-2xl text-[10px] font-bold uppercase tracking-widest"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-auto custom-scrollbar">
            {rawLoading ? (
              <div className="flex flex-col items-center justify-center py-40">
                 <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                 <p className="text-[10px] font-black uppercase tracking-widest text-gray-400">Pinging Database...</p>
              </div>
            ) : filteredRawItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-32 text-center text-gray-400">
                <p className="text-[10px] font-black uppercase tracking-widest">No matching raw logs found</p>
              </div>
            ) : (
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-gray-50/50 text-[9px] font-black text-gray-400 uppercase tracking-widest border-b border-gray-100">
                    <th className="px-8 py-4">Database UUID</th>
                    <th className="px-4 py-4">Timestamp</th>
                    <th className="px-4 py-4">Primary Label</th>
                    <th className="px-4 py-4">Category / Status</th>
                    <th className="px-4 py-4 text-right">Data Size</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRawItems.map((record) => (
                    <tr key={record.id} className="hover:bg-blue-50/20 transition-all">
                      <td className="px-8 py-5 font-mono text-[9px] text-gray-400">{record.id}</td>
                      <td className="px-4 py-5 font-bold text-[10px] text-gray-600">
                        {record.created_at ? new Date(record.created_at).toLocaleString() : 'N/A'}
                      </td>
                      <td className="px-4 py-5 font-black text-[11px] text-gray-900 uppercase tracking-tight">
                        <div>{activeTable === 'inventory_items' ? record.article : record.report_type}</div>
                        {activeTable === 'inventory_items' && (
                          <div className="text-[8px] text-blue-600 font-mono mt-1 font-bold uppercase">
                            Office: <span className="text-gray-900">{record.office || 'Unassigned'}</span> &bull; Condition: <span className="text-purple-700">{record.condition || 'Brand New'}</span>
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-5 font-bold text-[10px]">
                        <span className="bg-blue-50 text-blue-600 text-[8px] font-black px-2 py-0.5 rounded-full uppercase tracking-widest">
                          {activeTable === 'inventory_items' ? record.category : record.status}
                        </span>
                      </td>
                      <td className="px-4 py-5 text-right font-mono text-[10px] text-gray-400">
                        {JSON.stringify(record).length} B
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CloudLedger;
