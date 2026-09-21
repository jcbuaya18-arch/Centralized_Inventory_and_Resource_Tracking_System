
import React, { useState } from 'react';
import { View, UserRole } from '../types';

interface SidebarProps {
  currentView: View;
  setView: (view: View) => void;
  userRole: UserRole;
  onLogout: () => void;
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  rolePermissions?: Record<UserRole, View[]>;
}

const Sidebar: React.FC<SidebarProps> = ({ currentView, setView, userRole, onLogout, isOpen, setIsOpen, rolePermissions }) => {
  const [isHovered, setIsHovered] = useState(false);
  const isExpanded = isOpen || isHovered;

  const navItems = [
    { id: View.DASHBOARD, label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001 1v-4a1 1 0 011 1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { id: View.ITEMS, label: 'Item Inventory', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
    { id: View.RECEIVING, label: 'Receiving & Inspection', icon: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10' },
    { id: View.REQUESTS, label: 'Procurement Request Slips', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01' },
    { id: View.OUTGOING_LOGS, label: 'Outgoing Request Logs', icon: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4' },
    { id: View.STICKERS, label: 'Property Stickers', icon: 'M7 7h.01M7 3h10a2 2 0 012 2v14a2 2 0 01-2 2H7a2 2 0 01-2-2V5a2 2 0 012-2z' },
    { id: View.REPORTS, label: 'Official Reports', icon: 'M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: View.TRANSACTIONS, label: 'Transaction Registry', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: View.AUDIT, label: 'Audit Trail', icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z' },
    { id: View.DATABASE, label: 'Data Administration', icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4' },
    { id: View.OFFICES, label: 'Offices & Departments', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
    { id: View.NOTIFICATIONS, label: 'Notifications', icon: 'M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9' },
    { id: View.PROFILE, label: 'My Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' }
  ];
  const allowedViews = rolePermissions?.[userRole] || [];

  const mainItems = navItems.filter(item => {
    if (rolePermissions && !allowedViews.includes(item.id)) {
      return false;
    }
    if (!rolePermissions) {
      if (userRole === UserRole.SUPPLY) {
        return [View.DASHBOARD, View.ITEMS, View.RECEIVING, View.REQUESTS, View.OUTGOING_LOGS, View.STICKERS, View.REPORTS, View.TRANSACTIONS].includes(item.id);
      }
      if (userRole === UserRole.ACCOUNTING) {
        return [View.DASHBOARD, View.ITEMS, View.RECEIVING, View.REQUESTS, View.OUTGOING_LOGS, View.STICKERS, View.REPORTS, View.TRANSACTIONS].includes(item.id);
      }
      return [View.DASHBOARD, View.ITEMS, View.RECEIVING, View.REQUESTS, View.OUTGOING_LOGS, View.STICKERS, View.REPORTS, View.TRANSACTIONS].includes(item.id);
    }
    return [View.DASHBOARD, View.ITEMS, View.RECEIVING, View.REQUESTS, View.OUTGOING_LOGS, View.STICKERS, View.REPORTS, View.TRANSACTIONS].includes(item.id);
  });
  
  const configItems = navItems.filter(item => {
    if (rolePermissions && !allowedViews.includes(item.id)) {
      return false;
    }
    if (!rolePermissions) {
      if (userRole === UserRole.STAFF) {
        return [View.PROFILE, View.NOTIFICATIONS].includes(item.id);
      }
      if (userRole === UserRole.SUPPLY) {
        return [View.OFFICES, View.PROFILE, View.NOTIFICATIONS].includes(item.id);
      }
      if (userRole === UserRole.ACCOUNTING) {
        return [View.PROFILE, View.NOTIFICATIONS].includes(item.id);
      }
      return [View.AUDIT, View.DATABASE, View.OFFICES, View.PROFILE, View.NOTIFICATIONS].includes(item.id);
    }
    return [View.AUDIT, View.DATABASE, View.OFFICES, View.PROFILE, View.NOTIFICATIONS].includes(item.id);
  });

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-40 md:hidden animate-in fade-in duration-300" 
          onClick={() => setIsOpen(false)}
        ></div>
      )}

      <aside 
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className={`gov-sidebar fixed inset-y-0 left-0 bg-white border-r border-gray-200 z-50 transform transition-[width,transform] duration-300 ease-in-out md:relative md:translate-x-0 ${isOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'} ${isExpanded ? 'md:w-64' : 'md:w-20'} w-64 flex flex-col no-print`}
      >
        <div className="gov-brand-lockup p-5 border-b border-gray-100 flex items-center justify-between overflow-hidden h-22">
          <div className="flex items-center space-x-3">
            <div className="gov-seal-frame w-10 h-10 flex-shrink-0 flex items-center justify-center seal-glow">
              <img 
                src="/tibiao-logo.png" 
                alt="Tibiao Seal" 
                className="w-10 h-10 object-contain"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className={`flex flex-col flex-1 min-w-0 transition-opacity duration-300 ${isExpanded ? 'opacity-100' : 'opacity-0 h-0 overflow-hidden pointer-events-none'}`}>
              <span className="text-[9px] font-black leading-tight uppercase tracking-tight truncate block">Municipality of Tibiao</span>
              <span className="text-[7px] font-black uppercase tracking-widest block">Official Seal</span>
            </div>
          </div>
          {isOpen && (
            <button onClick={() => setIsOpen(false)} className="md:hidden text-gray-400 hover:text-gray-900 flex-shrink-0">
               <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
        
        <nav className="flex-1 min-h-0 p-4 space-y-1.5 mt-4 overflow-y-auto overflow-x-hidden overscroll-contain gov-sidebar-nav">
          <div className={`text-[10px] font-black text-gray-400 uppercase tracking-widest px-3 mb-2 transition-all duration-300 ${isExpanded ? 'opacity-100 block' : 'opacity-0 h-0 overflow-hidden my-0 py-0'}`}>Core Monitoring</div>
          {mainItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 ${
                currentView === item.id 
                  ? 'bg-blue-600 text-white shadow-xl shadow-blue-200' 
                  : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
              } ${isExpanded ? 'space-x-3 justify-start' : 'justify-center px-2 space-x-0'}`}
              title={!isExpanded ? item.label : undefined}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={item.icon} />
              </svg>
              <span className={`font-bold text-xs uppercase tracking-tight text-left transition-all duration-300 ${isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 pointer-events-none overflow-hidden'}`}>{item.label}</span>
            </button>
          ))}

          <div className={`text-[10px] font-black text-gray-400 uppercase tracking-widest px-3 pt-6 mb-2 transition-all duration-300 ${isExpanded ? 'opacity-100 block' : 'opacity-0 h-0 overflow-hidden my-0 py-0'}`}>System Config</div>
          {configItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setView(item.id)}
              className={`w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 ${
                currentView === item.id 
                  ? 'bg-blue-600 text-white shadow-xl shadow-blue-200' 
                  : 'text-gray-600 hover:bg-blue-50 hover:text-blue-600'
              } ${isExpanded ? 'space-x-3 justify-start' : 'justify-center px-2 space-x-0'}`}
              title={!isExpanded ? item.label : undefined}
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d={item.icon} />
              </svg>
              <span className={`font-bold text-xs uppercase tracking-tight text-left transition-all duration-300 ${isExpanded ? 'opacity-100 w-auto' : 'opacity-0 w-0 pointer-events-none overflow-hidden'}`}>{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-gray-50">
          <button 
            onClick={onLogout}
            className={`w-full flex items-center rounded-xl text-red-500 hover:bg-red-50 transition-all group ${isExpanded ? 'px-4 py-3 space-x-3 justify-start' : 'p-3 justify-center space-x-0'}`}
            title={!isExpanded ? "Sign Out Session" : undefined}
          >
            <svg className="w-5 h-5 text-red-400 group-hover:text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span className={`font-black text-[10px] uppercase tracking-widest text-left transition-all duration-300 ${isExpanded ? 'opacity-100 w-auto font-black' : 'opacity-0 w-0 pointer-events-none overflow-hidden'}`}>Sign Out Session</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
