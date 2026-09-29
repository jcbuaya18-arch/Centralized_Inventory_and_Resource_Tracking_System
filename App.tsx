import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { View, Office, UserRole } from './types';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './components/Dashboard';
import Inventory from './components/Inventory';
import Stickers from './components/Stickers';
import Reports from './components/Reports';
import Offices from './components/Offices';
import Profile from './components/Profile';
import Login from './components/Login';
import CloudLedger from './components/CloudLedger';
import AuditView from './components/AuditView';
import { RequisitionsManager } from './components/RequisitionsManager';
import { ProcurementTransactionHistory } from './components/ProcurementTransactionHistory';
import { NotificationHistory } from './components/NotificationHistory';
import MayorDashboard from './components/MayorDashboard';
import OfficeHeadDashboard from './components/OfficeHeadDashboard';
import AccountingDashboard from './components/AccountingDashboard';
import { auth, db } from './firebase';
import { collection, addDoc, deleteDoc, doc, updateDoc } from 'firebase/firestore';

// Custom Hooks
import { useAuth } from './hooks/useAuth';
import { useFirestoreSubscriptions } from './hooks/useFirestoreSubscriptions';
import { useInventoryActions } from './hooks/useInventoryActions';
import { useOfflineSync } from './hooks/useOfflineSync';
import { useRouting } from './hooks/useRouting';

const App: React.FC = () => {
  // ── Auth ──
  const {
    isAuthenticated, isLoading, userProfile, rolePermissions,
    setUserProfile, setRolePermissions,
    handleLogin, handleLogout,
    addSystemLog, addAccessLog,
  } = useAuth();

  // ── Firestore Subscriptions ──
  const {
    rawItems, masterAssets, offices, systemLogs, accessLogs,
    settings, setSettings, setOffices, setRawItems, setMasterAssets,
  } = useFirestoreSubscriptions(isAuthenticated, userProfile, addSystemLog);

  // ── Inventory Actions ──
  const {
    items, queuedTransactions, setQueuedTransactions,
    handleAddItem, handleRemoveItem, handleUpdateItem, handleAddItemFirestore,
  } = useInventoryActions(
    isAuthenticated, userProfile, offices, rawItems, masterAssets,
    setRawItems, setMasterAssets, addSystemLog
  );

  // ── Offline Sync ──
  const { isOnline, showSyncSuccess } = useOfflineSync(
    handleAddItemFirestore, addSystemLog, setQueuedTransactions
  );

  // ── Routing ──
  const {
    currentView, setCurrentView, officeFilter, setOfficeFilter,
    officeTab, setOfficeTab,
    reportsInitialTab, setReportsInitialTab,
    requisitionsInitialTab, setRequisitionsInitialTab,
    requisitionsInitialSearch, setRequisitionsInitialSearch,
    dashboardActiveTabOverride, setDashboardActiveTabOverride,
    activeToast, setActiveToast,
    handleNotificationActionClick,
  } = useRouting(offices);

  // ── Local UI State ──
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [notificationPermission, setNotificationPermission] = useState<string>(
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'default'
  );

  // ── Notification Permission Handler ──
  const requestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        setNotificationPermission(permission);
        if (permission === 'granted') {
          new Notification("Notifications Enabled", {
            body: "You will now receive alerts for pending Asset Transfer requests requiring your approval.",
            icon: '/tibiaoLogo.jpg'
          });
        }
      } catch (err) {
        console.error("Failed to request notification permission:", err);
      }
    }
  };

  // ── Content Renderer ──
  const renderContent = () => {
    if (isLoading) return (
      <div className="flex flex-col items-center justify-center h-full space-y-4">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-gray-400">Syncing LGU Cloud Node...</p>
      </div>
    );

    if (userProfile.role === UserRole.UNAUTHORIZED) {
      return (
        <div className="flex flex-col items-center justify-center h-full max-w-md mx-auto text-center space-y-6 p-8 bg-white rounded-[40px] shadow-2xl border border-red-50">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center text-red-500 mb-4">
            <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-black text-gray-900 uppercase tracking-tighter italic">Access Restricted</h2>
          <div className="space-y-4">
            <p className="text-gray-500 text-sm leading-relaxed">
              Account Sync: <span className="font-bold text-gray-900">{auth.currentUser?.email}</span>
            </p>
            <div className="bg-amber-50 p-4 rounded-2xl border border-amber-100 mb-4">
              <p className="text-[8px] font-black text-amber-600 uppercase tracking-widest mb-1">Status</p>
              <p className="text-[10px] text-amber-800 font-bold uppercase italic">Permission Denied by Cloud Node</p>
            </div>
            <p className="text-gray-500 text-sm leading-relaxed">
              Your account is not currently whitelisted for this system.
            </p>
            <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100">
              <p className="text-[8px] font-black text-gray-400 uppercase tracking-widest mb-1">Your System ID</p>
              <p className="font-mono text-[10px] text-gray-600 break-all">{auth.currentUser?.uid}</p>
            </div>
            <p className="text-gray-400 text-[10px] font-bold uppercase leading-relaxed">
              Please provide the ID above to the Municipal Administrator to request access.
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="w-full bg-gray-900 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-black transition-all shadow-xl active:scale-95"
          >
            Sign Out / Switch Account
          </button>
        </div>
      );
    }

    const setItems = () => {};

    switch (currentView) {
      case View.DASHBOARD:
        return <Dashboard items={items} offices={offices} setView={setCurrentView} userRole={userProfile.role} onSeedDemo={() => {}} userName={userProfile.fullName} onCheckWarranties={async () => 0} onNotificationActionClick={handleNotificationActionClick} />;
      case View.ITEMS:
        return <Inventory items={items} setItems={setItems} offices={offices} officeFilter={officeFilter} setOfficeFilter={setOfficeFilter} userRole={userProfile.role} onAddItem={handleAddItem} onRemoveItem={handleRemoveItem} onUpdateItem={handleUpdateItem} userName={userProfile.fullName} userOffice={userProfile.office} officeTab={officeTab} setOfficeTab={setOfficeTab} />;
      case View.RECEIVING:
        return <Inventory items={items} setItems={setItems} offices={offices} officeFilter={officeFilter} setOfficeFilter={setOfficeFilter} userRole={userProfile.role} onAddItem={handleAddItem} onRemoveItem={handleRemoveItem} onUpdateItem={handleUpdateItem} userName={userProfile.fullName} userOffice={userProfile.office} initialSubTab="receiving" officeTab={officeTab} setOfficeTab={setOfficeTab} />;
      case View.STICKERS:
        return <Stickers items={items} userRole={userProfile.role} userName={userProfile.fullName} onUpdateItem={handleUpdateItem} />;
      case View.REPORTS:
        return (
          <Reports
            items={items}
            onAddItem={handleAddItem}
            onRemoveItem={handleRemoveItem}
            onUpdateItem={handleUpdateItem}
            onReportSave={() => addSystemLog('Official Report Saved', 'Reporting')}
            userRole={userProfile.role}
            userOffice={userProfile.office}
            userName={userProfile.fullName}
            initialTab={reportsInitialTab}
          />
        );
      case View.AUDIT:
        return <AuditView systemLogs={systemLogs} accessLogs={accessLogs} userRole={userProfile.role} />;
      case View.TRANSACTIONS:
        return <ProcurementTransactionHistory />;
      case View.REQUESTS:
        return (
          <RequisitionsManager
            offices={offices}
            userName={userProfile.fullName}
            userRole={userProfile.role}
            userOffice={userProfile.office}
            initialTab={requisitionsInitialTab}
            initialSearch={requisitionsInitialSearch}
          />
        );
      case View.NOTIFICATIONS:
        return (
          <NotificationHistory
            user={userProfile}
            setView={setCurrentView}
            setViewParams={(params: any) => {
              if (params.tab) setRequisitionsInitialTab(params.tab);
              if (params.recordId) setRequisitionsInitialSearch(params.recordId);
            }}
            onNotificationActionClick={handleNotificationActionClick}
          />
        );
      case View.DATABASE:
        return <CloudLedger />;
      case View.OFFICES:
        if (officeFilter) {
          return (
            <Inventory
              items={items} setItems={setItems} offices={offices}
              officeFilter={officeFilter} setOfficeFilter={setOfficeFilter}
              userRole={userProfile.role} onAddItem={handleAddItem}
              onRemoveItem={handleRemoveItem} onUpdateItem={handleUpdateItem}
              userName={userProfile.fullName} userOffice={userProfile.office}
              officeTab={officeTab} setOfficeTab={setOfficeTab}
            />
          );
        }
        return <Offices offices={offices} setOffices={setOffices} setView={setCurrentView} setOfficeFilter={setOfficeFilter} userRole={userProfile.role} onAddOffice={async (o: Partial<Office>) => { await addDoc(collection(db, 'offices'), o); addSystemLog(`New Office Registered: ${o.name}`, 'Offices'); }} onRemoveOffice={async (id: string) => { await deleteDoc(doc(db, 'offices', id)); addSystemLog('Office Record Removed', 'Offices'); }} onUpdateOffice={async (id: string, updates: Partial<Office>) => { await updateDoc(doc(db, 'offices', id), updates); addSystemLog(`Office Updated: ${updates.name || id}`, 'Offices'); }} officeTab={officeTab} setOfficeTab={setOfficeTab} />;
      case View.PROFILE:
        return (
          <Profile
            profile={userProfile} setProfile={setUserProfile}
            systemLogs={systemLogs} accessLogs={accessLogs}
            settings={settings} setSettings={setSettings}
            onLogout={handleLogout}
            notificationPermission={notificationPermission}
            onRequestPermission={requestNotificationPermission}
          />
        );
      default:
        return <Dashboard items={items} offices={offices} setView={setCurrentView} userRole={userProfile.role} onSeedDemo={() => {}} userName={userProfile.fullName} onCheckWarranties={async () => 0} onNotificationActionClick={handleNotificationActionClick} />;
    }
  };

  if (!isAuthenticated) return <Login onLogin={handleLogin} />;

  const renderRoleView = () => {
    if (userProfile.role === UserRole.MAYOR) {
      return (
        <MayorDashboard
          items={items} offices={offices} onLogout={handleLogout}
          userName={userProfile.fullName} user={userProfile}
          setView={setCurrentView} onNotificationActionClick={handleNotificationActionClick}
        />
      );
    }

    if (userProfile.role === UserRole.OFFICE_HEAD) {
      return (
        <OfficeHeadDashboard
          items={items} offices={offices} onLogout={handleLogout}
          userEmail={auth.currentUser?.email || 'officehead@tibiao.gov.ph'}
          userOffice={userProfile.office || 'Accounting Office'}
          userName={userProfile.fullName}
          reportsInitialTab={reportsInitialTab}
          activeTabOverride={dashboardActiveTabOverride}
          onResetOverride={() => setDashboardActiveTabOverride(null)}
          user={userProfile} setView={setCurrentView}
          onNotificationActionClick={handleNotificationActionClick}
        />
      );
    }

    if (userProfile.role === UserRole.ACCOUNTING) {
      return (
        <AccountingDashboard
          items={items} offices={offices} onLogout={handleLogout}
          userName={userProfile.fullName}
          onAddItem={handleAddItem} onRemoveItem={handleRemoveItem} onUpdateItem={handleUpdateItem}
          reportsInitialTab={reportsInitialTab}
          activeTabOverride={dashboardActiveTabOverride}
          onResetOverride={() => setDashboardActiveTabOverride(null)}
          user={userProfile} setView={setCurrentView}
          onNotificationActionClick={handleNotificationActionClick}
        />
      );
    }

    return (
      <div className="gov-app flex h-screen overflow-hidden bg-gray-50">
        <Sidebar currentView={currentView} setView={setCurrentView} userRole={userProfile.role} onLogout={handleLogout} isOpen={isSidebarOpen} setIsOpen={setIsSidebarOpen} rolePermissions={rolePermissions} />
        <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
          <Header user={userProfile} onMenuClick={() => setIsSidebarOpen(true)} setView={setCurrentView} onNotificationActionClick={handleNotificationActionClick} />
          <main className="gov-main flex-1 p-4 md:p-8 overflow-y-auto custom-scrollbar">
            <div className="max-w-7xl mx-auto h-full">
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentView}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                  transition={{ duration: 0.25, ease: 'easeInOut' }}
                  className="h-full"
                >
                  {renderContent()}
                </motion.div>
              </AnimatePresence>
            </div>
          </main>
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="gov-app min-h-screen">
        {renderRoleView()}
      </div>

      {!isOnline && (
        <div
          id="offline-indicator-badge"
          className="fixed bottom-6 right-6 z-[9999] animate-bounce bg-amber-500 text-slate-950 px-5 py-3 rounded-2xl shadow-[0_20px_50px_rgba(245,158,11,0.3)] border border-amber-400/50 flex items-center space-x-3 text-xs font-black uppercase tracking-wider font-brand transition-all"
        >
          <span className="w-2.5 h-2.5 bg-slate-950 rounded-full animate-ping shrink-0"></span>
          <span>Operating Offline &bull; Edits are queued locally</span>
        </div>
      )}

      {showSyncSuccess && (
        <div
          id="sync-success-indicator-badge"
          className="fixed bottom-6 right-6 z-[9999] animate-pulse bg-emerald-600 text-white px-5 py-3 rounded-2xl shadow-[0_20px_50px_rgba(5,150,105,0.3)] border border-emerald-500 flex items-center space-x-3 text-xs font-black uppercase tracking-wider font-brand transition-all"
        >
          <span className="w-2.5 h-2.5 bg-white rounded-full shrink-0"></span>
          <span>Connection Restored &bull; Sync Completed</span>
        </div>
      )}

      {activeToast && (
        <div
          id="active-transfer-toast"
          className="fixed bottom-24 right-6 z-[10000] bg-white text-slate-800 rounded-2xl shadow-[0_20px_50px_rgba(30,41,59,0.15)] border-l-4 border-l-blue-600 border border-slate-100 p-5 max-w-sm flex flex-col space-y-3 transition-all animate-in slide-in-from-bottom-5 duration-300"
        >
          <div className="flex items-start justify-between space-x-3">
            <div className="flex items-center space-x-2.5">
              <span className="p-2 bg-blue-50 text-blue-600 rounded-xl shrink-0">
                <svg className="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
              </span>
              <div>
                <h4 className="text-xs font-black text-slate-900 tracking-tight uppercase">{activeToast.title}</h4>
                <p className="text-[11px] text-slate-500 font-medium leading-relaxed mt-0.5">{activeToast.message}</p>
              </div>
            </div>
            <button
              onClick={() => setActiveToast(null)}
              className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-50 rounded-lg transition-all shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex items-center justify-end space-x-2 pt-1 border-t border-slate-50">
            <button
              onClick={() => setActiveToast(null)}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all cursor-pointer"
            >
              Dismiss
            </button>
            <button
              onClick={() => {
                if (userProfile.role === UserRole.OFFICE_HEAD || userProfile.role === UserRole.ACCOUNTING) {
                  setDashboardActiveTabOverride('reports');
                  setReportsInitialTab('transfers');
                } else {
                  setCurrentView(View.REPORTS);
                  setReportsInitialTab('transfers');
                }
                setActiveToast(null);
              }}
              className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[9px] font-black uppercase tracking-wider transition-all shadow-md shadow-blue-100 cursor-pointer"
            >
              Review & Approve
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default App;
