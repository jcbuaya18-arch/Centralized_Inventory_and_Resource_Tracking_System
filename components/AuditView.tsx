import React, { useState } from 'react';
import { SystemLog, AccessLog, UserRole } from '../types';

interface AuditViewProps {
  systemLogs: SystemLog[];
  accessLogs: AccessLog[];
  userRole: UserRole;
}

const AuditView: React.FC<AuditViewProps> = ({ systemLogs, accessLogs, userRole }) => {
  const [activeTab, setActiveTab] = useState<'system' | 'access'>('system');
  const [searchTerm, setSearchTerm] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [userFilter, setUserFilter] = useState('');
  const [formTypeFilter, setFormTypeFilter] = useState<string>('all');
  const [transactionSearch, setTransactionSearch] = useState('');

  if (userRole !== UserRole.ADMIN) {
    return (
      <div className="bg-red-50 border border-red-200 p-10 rounded-[38px] text-center max-w-lg mx-auto space-y-4">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto text-2xl font-black">!</div>
        <h3 className="font-brand font-black text-xl uppercase tracking-tight text-red-900">Privilege Restriction</h3>
        <p className="text-[10px] text-red-700 font-bold uppercase tracking-widest leading-loose">
          The Master Audit Registry is exclusively accessible by LGU Security and Administrative Officers.
        </p>
      </div>
    );
  }

  const modules = Array.from(new Set(systemLogs.map(log => log.module || 'General')));
  const users = Array.from(new Set(systemLogs.map(log => log.user || 'Unknown')));
  const formTypes = Array.from(new Set(systemLogs.map(log => log.formType).filter(Boolean))) as string[];

  const filteredLogs = systemLogs.filter(log => {
    const matchesSearch = log.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.action.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (log.transactionNumber && log.transactionNumber.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesModule = moduleFilter ? log.module === moduleFilter : true;
    const matchesUser = userFilter ? log.user === userFilter : true;
    const matchesDate = dateFilter ? new Date(log.timestamp).toISOString().split('T')[0] === dateFilter : true;
    
    let matchesFormType = true;
    if (formTypeFilter === 'PRS') {
      matchesFormType = log.formType === 'PRS';
    } else if (formTypeFilter === 'standard') {
      matchesFormType = log.formType !== 'PRS';
    } else if (formTypeFilter !== 'all') {
      matchesFormType = log.formType === formTypeFilter;
    }

    const matchesTransaction = transactionSearch
      ? !!(log.transactionNumber && log.transactionNumber.toLowerCase().includes(transactionSearch.toLowerCase()))
      : true;

    return matchesSearch && matchesModule && matchesUser && matchesDate && matchesFormType && matchesTransaction;
  });

  const filteredAccess = accessLogs.filter(log => {
    const matchesSearch = log.status.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.device.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          log.ip.includes(searchTerm);
    const matchesDate = dateFilter ? new Date(log.timestamp).toISOString().split('T')[0] === dateFilter : true;
    return matchesSearch && matchesDate;
  });

  return (
    <div className="space-y-8 pb-16">
      {/* Search and Filters toolbar */}
      <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-gray-900 font-brand uppercase tracking-tight">Master Security Audit & Trail</h2>
          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mt-1">LGU Immutable Real-Time Compliance Registry</p>
        </div>

        <div className="flex bg-gray-50 p-1 rounded-2xl border border-gray-100 self-start md:self-auto">
          <button
            onClick={() => { setActiveTab('system'); setSearchTerm(''); }}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'system' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}
          >
            System Registry
          </button>
          <button
            onClick={() => { setActiveTab('access'); setSearchTerm(''); }}
            className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'access' ? 'bg-gray-900 text-white shadow-md' : 'text-gray-500 hover:text-gray-900'}`}
          >
            Access Fail-safes
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Left Side Filters (No print) */}
        <div className="no-print lg:col-span-1 space-y-6">
          <div className="bg-white rounded-[32px] border border-gray-100 shadow-sm p-6 space-y-5">
            <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest border-b border-gray-50 pb-3">Audit Search & Filter</h3>
            
            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block ml-1">Search Keywords</label>
              <input
                type="text"
                placeholder="USER, TX, OR ACTION..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 rounded-xl font-bold text-[10px] uppercase tracking-widest"
              />
            </div>

            <div className="space-y-1">
              <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block ml-1">Filter Date</label>
              <input
                type="date"
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 rounded-xl font-bold text-[10px] uppercase tracking-widest"
              />
            </div>

            {activeTab === 'system' && (
              <>
                {formTypeFilter === 'PRS' && (
                  <div className="space-y-1 bg-amber-50/55 p-3 rounded-2xl border border-amber-100">
                    <label className="text-[9px] font-black text-amber-700 uppercase tracking-widest block ml-1 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      PRS Transaction Search
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. PRS-2026-..."
                      value={transactionSearch}
                      onChange={e => setTransactionSearch(e.target.value)}
                      className="w-full px-4 py-3 bg-white border border-amber-200 focus:border-amber-500 rounded-xl font-mono font-bold text-[10px] uppercase tracking-widest placeholder:text-gray-300"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block ml-1">Filter Form Type</label>
                  <select
                    value={formTypeFilter}
                    onChange={e => setFormTypeFilter(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 rounded-xl font-bold text-[10px] uppercase tracking-widest"
                  >
                    <option value="all">-- All Forms / Logs --</option>
                    <option value="PRS">Procurement Slip (PRS)</option>
                    <option value="standard">Standard Activities (Exclude PRS)</option>
                    {formTypes.filter(type => type !== 'PRS' && type !== 'standard').map(type => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block ml-1">Filter User</label>
                  <select
                    value={userFilter}
                    onChange={e => setUserFilter(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 rounded-xl font-bold text-[10px] uppercase tracking-widest"
                  >
                    <option value="">-- All Users --</option>
                    {users.map(u => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block ml-1">Filter Module</label>
                  <select
                    value={moduleFilter}
                    onChange={e => setModuleFilter(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-50 border border-transparent focus:border-blue-500 rounded-xl font-bold text-[10px] uppercase tracking-widest"
                  >
                    <option value="">-- All Modules --</option>
                    {modules.map(m => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <button
              onClick={() => {
                setSearchTerm('');
                setDateFilter('');
                setUserFilter('');
                setModuleFilter('');
                setFormTypeFilter('all');
                setTransactionSearch('');
              }}
              className="w-full py-2.5 bg-gray-50 hover:bg-gray-150 border border-gray-100 text-gray-500 hover:text-black font-black text-[9px] uppercase tracking-widest rounded-xl transition-all"
            >
              Reset Filters
            </button>
            
            <button
              onClick={() => window.print()}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-black text-[9px] uppercase tracking-widest rounded-xl transition-all shadow-lg"
            >
              Print Master Audit
            </button>
          </div>
        </div>

        {/* Audit timelines */}
        <div className="lg:col-span-3 bg-white rounded-[32px] border border-gray-100 shadow-sm p-6 md:p-8">
          {activeTab === 'system' ? (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-gray-100 pb-4 gap-3">
                <div>
                  <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Chronological Operations Track</h3>
                  <p className="text-[9px] text-gray-400 font-bold uppercase tracking-widest mt-0.5">Isolate and analyze compliance milestones</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-xl border border-gray-100">
                    <button
                      type="button"
                      onClick={() => setFormTypeFilter('all')}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                        formTypeFilter === 'all'
                          ? 'bg-white text-gray-900 shadow-sm border border-gray-100'
                          : 'text-gray-400 hover:text-gray-700'
                      }`}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormTypeFilter('PRS')}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                        formTypeFilter === 'PRS'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-amber-700 hover:text-amber-800 bg-amber-50/50'
                      }`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                      PRS Only
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormTypeFilter('standard')}
                      className={`px-3 py-1.5 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all ${
                        formTypeFilter === 'standard'
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-gray-400 hover:text-gray-700'
                      }`}
                    >
                      Standard
                    </button>
                  </div>

                  <span className="px-2.5 py-1 bg-green-50 border border-green-100 text-green-700 text-[8px] font-black uppercase tracking-widest rounded-full">
                    {filteredLogs.length} Events
                  </span>
                </div>
              </div>

              {formTypeFilter === 'PRS' && (
                <div className="bg-amber-50/40 border border-amber-100 rounded-2xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="p-1.5 bg-amber-100 text-amber-800 rounded-lg text-xs font-black">PRS</span>
                    <div>
                      <h4 className="text-[10px] font-black text-gray-800 uppercase tracking-wider">Procurement Transaction Locator</h4>
                      <p className="text-[8px] text-amber-700 font-bold uppercase tracking-widest">Filter chronological operations by a specific transaction number</p>
                    </div>
                  </div>
                  <div className="relative flex-1 max-w-md w-full">
                    <input
                      type="text"
                      placeholder="Enter PRS Reference / Transaction No..."
                      value={transactionSearch}
                      onChange={e => setTransactionSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white border border-amber-200 focus:border-amber-500 rounded-xl font-mono font-bold text-[10px] uppercase tracking-widest placeholder:text-gray-300 focus:ring-1 focus:ring-amber-500"
                    />
                    <svg className="absolute left-3 top-2.5 w-3.5 h-3.5 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                </div>
              )}

              {filteredLogs.length === 0 ? (
                <div className="py-20 text-center text-gray-300 font-bold uppercase tracking-[0.2em] text-[10px]">No Actions Found</div>
              ) : (
                <div className="relative border-l border-gray-100 pl-4 space-y-6">
                  {filteredLogs.map(log => {
                    const date = new Date(log.timestamp);
                    return (
                      <div key={log.id} className="relative group">
                        {/* Dot indicator */}
                        <div className="absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full bg-blue-600 border-2 border-white group-hover:scale-125 transition-transform"></div>
                        
                        <div className="p-4 bg-gray-50/50 hover:bg-gray-50 rounded-2xl border border-transparent hover:border-gray-100 transition-all">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[8px] font-black text-blue-600 uppercase tracking-widest bg-blue-50/50 border border-blue-50 px-2 py-0.5 rounded">{log.module || 'System'}</span>
                                {log.formType === 'PRS' && (
                                  <span className="text-[8px] font-black text-amber-600 uppercase tracking-widest bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                                    PRS FORM
                                  </span>
                                )}
                                {log.transactionNumber && (
                                  <span className="text-[8px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
                                    REF: {log.transactionNumber}
                                  </span>
                                )}
                                {log.role && (
                                  <span className="text-[8px] font-semibold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded">
                                    ROLE: {log.role}
                                  </span>
                                )}
                              </div>
                              <h4 className="text-xs font-black text-gray-900 uppercase tracking-tight">{log.action}</h4>
                            </div>
                            <div className="text-left sm:text-right min-w-[120px]">
                              <p className="text-[9px] font-black text-gray-500 uppercase tracking-wider">{log.user}</p>
                              <p className="text-[8px] font-bold text-gray-400 font-mono mt-0.5">{date.toLocaleDateString()} &bull; {date.toLocaleTimeString()}</p>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between border-b border-gray-50 pb-3">
                <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest">Access Verification Logs</h3>
                <span className="px-2.5 py-1 bg-purple-50 border border-purple-100 text-purple-700 text-[8px] font-black uppercase tracking-widest rounded-full">{filteredAccess.length} Sessions Logged</span>
              </div>

              {filteredAccess.length === 0 ? (
                <div className="py-20 text-center text-gray-300 font-bold uppercase tracking-[0.2em] text-[10px]">No Session logs recorded</div>
              ) : (
                <div className="relative border-l border-gray-100 pl-4 space-y-6">
                  {filteredAccess.map(log => {
                    const date = new Date(log.timestamp);
                    const isSuccess = log.status.toLowerCase().includes('success') || log.status.toLowerCase().includes('login');
                    return (
                      <div key={log.id} className="relative group">
                        {/* Dot */}
                        <div className={`absolute -left-[21px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-white transition-transform ${isSuccess ? 'bg-emerald-500' : 'bg-red-500'}`}></div>

                        <div className="p-4 bg-gray-50/50 hover:bg-gray-50 rounded-2xl border border-transparent hover:border-gray-100 transition-all">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                            <div>
                              <span className={`text-[8px] font-black uppercase tracking-widest border px-2 py-0.5 rounded ${isSuccess ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-red-50 border-red-100 text-red-700'}`}>
                                {log.status}
                              </span>
                              <p className="text-[9px] text-gray-400 font-bold mt-1 uppercase tracking-wider">{log.device} &bull; {log.ip}</p>
                            </div>
                            <div className="text-right font-mono text-[8.5px] font-bold text-gray-400 mt-1 sm:mt-0">
                              {date.toLocaleString()}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AuditView;
