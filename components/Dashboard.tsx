
import React from 'react';
import { InventoryItem, Office, View, UserRole } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface DashboardProps {
  items: InventoryItem[];
  offices: Office[];
  setView: (view: View) => void;
  userRole: UserRole;
  onSeedDemo?: () => void;
  userName?: string;
  onCheckWarranties?: (itemsList: InventoryItem[]) => Promise<number>;
  onNotificationActionClick?: (notification: any) => void;
}

const Dashboard: React.FC<DashboardProps> = ({ items, offices, setView, onSeedDemo, userName }) => {
  const totalValue = items.reduce((acc, item) => acc + (item.unitValue * item.qtyPhysicalCount), 0);

  const chartData = offices.map(office => ({
    name: office.name.length > 8 ? office.name.substring(0, 8) + '...' : office.name,
    items: items.filter(item => item.office === office.name).length
  }));

  const topDept = [...chartData].sort((a, b) => b.items - a.items)[0];
  const isEmpty = items.length === 0;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl md:text-3xl font-black text-gray-900 font-brand tracking-tight uppercase">Admin Overview</h2>
          <p className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mt-1">Tibiao Municipal Items & Resources Monitoring</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Column: Core Inventory Overview */}
        <div className="lg:col-span-3 space-y-6">
          {isEmpty && (
            <div className="bg-white border-2 border-dashed border-gray-200 rounded-[40px] p-12 flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-20 h-20 bg-blue-50 rounded-[32px] flex items-center justify-center text-blue-600">
                    <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
                    </svg>
                </div>
                <div className="max-w-sm">
                    <h3 className="text-xl font-black uppercase tracking-tight text-gray-900">System Registry is Empty</h3>
                    <p className="text-xs text-gray-500 font-bold uppercase mt-2">Start by adding your municipal assets manually or bootstrap with demo data to see the system in action.</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3">
                    <button onClick={() => setView(View.ITEMS)} className="bg-blue-600 text-white px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">Add First Item</button>
                    <button onClick={onSeedDemo} className="bg-gray-100 text-gray-600 px-8 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest">Bootstrap Demo</button>
                </div>
            </div>
          )}

          {!isEmpty && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm card-lift">
                  <h3 className="text-gray-400 text-[8px] md:text-[9px] font-black uppercase tracking-widest">Active Items</h3>
                  <p className="text-2xl md:text-3xl font-black text-gray-900 font-brand mt-1">{items.length}</p>
                </div>
                <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm card-lift">
                  <h3 className="text-gray-400 text-[8px] md:text-[9px] font-black uppercase tracking-widest">Offices</h3>
                  <p className="text-2xl md:text-3xl font-black text-gray-900 font-brand mt-1">{offices.length}</p>
                </div>
                <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm card-lift">
                  <h3 className="text-gray-400 text-[8px] md:text-[9px] font-black uppercase tracking-widest">Registry Value</h3>
                  <p className="text-xl md:text-2xl font-black text-gray-900 font-brand mt-1">₱{totalValue.toLocaleString()}</p>
                </div>
                <div className="bg-white p-5 rounded-[24px] border border-gray-100 shadow-sm card-lift">
                  <h3 className="text-gray-400 text-[8px] md:text-[9px] font-black uppercase tracking-widest text-blue-600">Top Dept</h3>
                  <p className="text-lg md:text-xl font-black text-gray-900 font-brand mt-1 truncate">{topDept?.name || 'N/A'}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6">
                <div className="bg-white p-6 md:p-8 rounded-[32px] md:rounded-[40px] border border-gray-100 shadow-sm card-lift">
                  <h3 className="text-[9px] font-black text-gray-400 uppercase tracking-widest mb-6 md:mb-8">Items per Department</h3>
                  <div className="h-56 md:h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 8, fontWeight: 700, fill: '#9ca3af'}} />
                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 8, fontWeight: 700, fill: '#9ca3af'}} />
                        <Tooltip contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '10px'}} />
                        <Bar dataKey="items" fill="#2563EB" radius={[4, 4, 0, 0]} barSize={24} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Column: Executive Station / Supply & GSO Portal */}
        <div className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-[34px] border border-gray-100 shadow-sm space-y-6 relative overflow-hidden group card-lift-lg">
            {/* Decal logo decoration in back */}
            <div className="absolute top-0 right-0 p-4 opacity-[0.03] select-none pointer-events-none transition-transform duration-700 group-hover:scale-110">
              <img 
                src="/tibiaoLogo.jpg" 
                alt="Tibiao Seal" 
                className="w-32 h-32 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>

            <div className="border-b border-gray-100 pb-4">
              <span className="text-[8px] font-black text-blue-600 bg-blue-50 px-2.5 py-0.5 rounded uppercase tracking-widest">
                Executive Station
              </span>
              <h3 className="font-brand font-black text-gray-900 text-sm uppercase tracking-tight mt-2">
                Supply & GSO Portal
              </h3>
            </div>

            {/* Profile Avatar and Name Block */}
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center border-2 border-white shadow-lg shadow-blue-100 overflow-hidden shrink-0">
                <span className="text-white font-black text-sm uppercase tracking-wider">
                  GSO
                </span>
              </div>
              <div className="min-w-0">
                <h4 className="font-black text-xs text-slate-800 uppercase tracking-tight truncate">
                  {userName || 'GSO Administrator'}
                </h4>
                <p className="text-[9px] text-gray-400 font-bold uppercase tracking-wider leading-none mt-1">
                  GSO Engineer / Supply Master
                </p>
              </div>
            </div>

            {/* Verification Status & Indicators */}
            <div className="space-y-2.5 pt-1.5">
              <div className="flex items-center justify-between p-3 bg-slate-50/70 border border-slate-100 rounded-2xl">
                <span className="text-[8px] font-black text-gray-400 uppercase tracking-widest">Network Authority</span>
                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-wide flex items-center">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>
                  GSO Active Node
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-center">
                  <p className="text-[7.5px] font-black text-gray-400 uppercase tracking-wider">Master Audit</p>
                  <p className="text-[9px] font-black text-slate-700 uppercase mt-0.5">Yes</p>
                </div>
                <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-100 text-center">
                  <p className="text-[7.5px] font-black text-gray-400 uppercase tracking-wider">Ledger Sign-off</p>
                  <p className="text-[9px] font-black text-slate-700 uppercase mt-0.5">Authorized</p>
                </div>
              </div>
            </div>

            {/* System Nodes Info List */}
            <div className="space-y-2 pt-2 border-t border-gray-100 text-[9px] font-bold text-gray-500 uppercase tracking-wider">
              <div className="flex justify-between">
                <span>System Role:</span>
                <span className="text-slate-800 font-black">GSO Admin</span>
              </div>
              <div className="flex justify-between">
                <span>Designation:</span>
                <span className="text-slate-800 font-black">Supply & Property</span>
              </div>
              <div className="flex justify-between">
                <span>Jurisdiction:</span>
                <span className="text-slate-800 font-black">Tibiao, Antique</span>
              </div>
            </div>

            {/* GSO Handy Shortcuts */}
            <div className="space-y-2 pt-4 border-t border-gray-100">
              <p className="text-[8.5px] font-black text-gray-400 uppercase tracking-widest block mb-2">GSO Executive Shortcuts</p>
              
              <button 
                onClick={() => setView && setView(View.REPORTS)}
                className="w-full flex items-center justify-between p-3 bg-blue-50/50 hover:bg-blue-50 rounded-xl text-left border border-transparent hover:border-blue-100 transition-all font-brand group"
              >
                <span className="text-[9.5px] font-black text-blue-700 uppercase tracking-wide font-brand">Generate Reports</span>
                <svg className="w-3.5 h-3.5 text-blue-500 transform group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <button 
                onClick={() => setView && setView(View.RECEIVING)}
                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-slate-100 rounded-xl text-left border border-transparent hover:border-slate-200 transition-all font-brand group"
              >
                <span className="text-[9.5px] font-black text-slate-700 uppercase tracking-wide font-brand">Supplier Cargo</span>
                <svg className="w-3.5 h-3.5 text-slate-400 transform group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
