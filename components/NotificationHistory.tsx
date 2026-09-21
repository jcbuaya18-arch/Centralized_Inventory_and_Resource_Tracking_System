import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, query, orderBy, onSnapshot, writeBatch, doc, updateDoc, addDoc } from 'firebase/firestore';
import { UserProfile, View } from '../types';
import { 
  Bell, 
  Search, 
  Filter, 
  Check, 
  CheckCheck, 
  Calendar, 
  ArrowLeft, 
  FileText, 
  ShoppingBag, 
  Database, 
  ShieldAlert, 
  Building, 
  Settings,
  Eye,
  RefreshCw
} from 'lucide-react';

interface NotificationHistoryProps {
  user: UserProfile;
  setView: (view: View) => void;
  setViewParams?: (params: any) => void;
  onNotificationActionClick: (notification: any) => void;
}

export const NotificationHistory: React.FC<NotificationHistoryProps> = ({ 
  user, 
  setView, 
  setViewParams,
  onNotificationActionClick 
}) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedModule, setSelectedModule] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL'); // ALL, READ, UNREAD
  const [selectedOffice, setSelectedOffice] = useState('ALL');
  const [selectedDateFilter, setSelectedDateFilter] = useState('ALL'); // ALL, TODAY, WEEK, MONTH
  const [selectedType, setSelectedType] = useState('ALL');

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotifications(fetched);
      setLoading(false);
    }, (err) => {
      console.error("Error fetching notifications in History:", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Filter logic based on security / role roles
  const authorizedNotifications = notifications.filter(n => {
    if (user.role === 'ADMIN') return true; // Super Administrator sees all

    if (user.role === 'SUPPLY') {
      // Supply/Engineer
      const allowedModules = ['PROCUREMENT', 'ENGINEER', 'INVENTORY', 'SYSTEM'];
      const allowedTypes = [
        'ACCOUNTING_REQUEST', 'PAR_SUBMITTED', 'ICS_SUBMITTED', 'SHIPMENT_READY', 
        'RECEIVE_REGISTER_COMPLETED', 'INVENTORY_UPDATED', 'STOCK_CARD_UPDATED', 'RPCPPE_UPDATED',
        'LOW_STOCK', 'OUT_OF_STOCK', 'DUPLICATE_ASSET', 'DUPLICATE_PROPERTY',
        'SYSTEM_USER_CREATED', 'SYSTEM_USER_UPDATED', 'SYSTEM_PASSWORD_RESET', 'SYSTEM_DEVICE_LOGIN', 'SYSTEM_BACKUP_COMPLETED'
      ];
      return allowedTypes.includes(n.type) || allowedModules.includes(n.module) || n.recipientRole === 'ADMIN' || n.recipientRole === 'SUPPLY';
    }

    if (user.role === 'ACCOUNTING') {
      const allowedTypes = [
        'PROCUREMENT_APPROVED', 'ADMIN_RECEIVED_REQUEST', 'PAR_APPROVED', 'ICS_APPROVED', 
        'RRSP_CREATED', 'INVENTORY_REGISTERED', 'REQUEST_REJECTED', 'REQUEST_RETURNED_REVISION',
        'PROCUREMENT_REJECTED', 'PAR_UPDATED', 'ICS_UPDATED', 'COMPLETED_TRANSACTION',
        'SLIP_APPROVAL', 'DISTRIBUTION', 'RECEIPT', 'DECISION', 'SUBMISSION',
        'INVENTORY_UPDATE', 'NEW_REQUEST', 'PROCUREMENT_SUBMITTED'
      ];
      return allowedTypes.includes(n.type) || n.recipientRole === 'ACCOUNTING';
    }

    // Default: Office Head or Staff - only see items relating to their office/user
    return (n.officeId === user.office) || (n.userId === user.uid) || (n.recipientRole === user.role);
  });

  // Apply search & visual filters
  const filteredNotifications = authorizedNotifications.filter(n => {
    // 1. Search Query (Title or Message)
    if (searchQuery) {
      const queryLower = searchQuery.toLowerCase();
      const titleMatch = n.title?.toLowerCase().includes(queryLower);
      const messageMatch = n.message?.toLowerCase().includes(queryLower);
      const officeMatch = n.officeId?.toLowerCase().includes(queryLower);
      const typeMatch = n.type?.toLowerCase().includes(queryLower);
      if (!titleMatch && !messageMatch && !officeMatch && !typeMatch) return false;
    }

    // 2. Module
    if (selectedModule !== 'ALL' && n.module !== selectedModule) {
      return false;
    }

    // 3. Status
    if (selectedStatus === 'READ' && !n.isRead) return false;
    if (selectedStatus === 'UNREAD' && n.isRead) return false;

    // 4. Office
    if (selectedOffice !== 'ALL' && n.officeId !== selectedOffice) {
      return false;
    }

    // 5. Date Filter
    if (selectedDateFilter !== 'ALL') {
      const notifDate = new Date(n.timestamp);
      const now = new Date();
      if (selectedDateFilter === 'TODAY') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        if (notifDate < today) return false;
      } else if (selectedDateFilter === 'WEEK') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (notifDate < oneWeekAgo) return false;
      } else if (selectedDateFilter === 'MONTH') {
        const oneMonthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
        if (notifDate < oneMonthAgo) return false;
      }
    }

    // 6. Type
    if (selectedType !== 'ALL' && n.type !== selectedType) {
      return false;
    }

    return true;
  });

  const handleMarkAllRead = async () => {
    try {
      const batch = writeBatch(db);
      let count = 0;
      filteredNotifications.forEach(n => {
        if (!n.isRead) {
          const ref = doc(db, 'notifications', n.id);
          batch.update(ref, { isRead: true, readAt: new Date().toISOString() });
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
        // Log the action
        await addDoc(collection(db, 'system_logs'), {
          timestamp: new Date().toISOString(),
          user: user.fullName,
          role: user.role,
          office: user.office || 'N/A',
          action: `Marked all notifications as read (${count} count)`,
          module: 'System'
        }).catch(() => {
          // Fallback if system logs fails on specific non-existing ID setting
        });
      }
    } catch (err) {
      console.error("Error marking all read:", err);
    }
  };

  const handleToggleRead = async (id: string, currentRead: boolean) => {
    try {
      const ref = doc(db, 'notifications', id);
      await updateDoc(ref, { 
        isRead: !currentRead,
        readAt: !currentRead ? new Date().toISOString() : null
      });
    } catch (err) {
      console.error("Error toggling notification state:", err);
    }
  };

  // Helper for rendering module icon badges
  const getModuleIcon = (moduleName: string) => {
    switch (moduleName) {
      case 'PROCUREMENT':
        return <ShoppingBag className="w-4 h-4 text-amber-500" />;
      case 'ACCOUNTING':
        return <FileText className="w-4 h-4 text-teal-500" />;
      case 'ENGINEER':
        return <Settings className="w-4 h-4 text-indigo-500" />;
      case 'INVENTORY':
        return <Database className="w-4 h-4 text-emerald-500" />;
      case 'OFFICE':
        return <Building className="w-4 h-4 text-blue-500" />;
      case 'REPORTS':
        return <FileText className="w-4 h-4 text-sky-500" />;
      case 'SYSTEM':
        return <ShieldAlert className="w-4 h-4 text-red-500" />;
      default:
        return <Bell className="w-4 h-4 text-gray-400" />;
    }
  };

  // Helper for getting module names for dropdown list
  const uniqueOffices = Array.from(new Set(authorizedNotifications.map(n => n.officeId).filter(Boolean)));
  const uniqueTypes = Array.from(new Set(authorizedNotifications.map(n => n.type).filter(Boolean)));

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-gray-50/50 p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
        <div className="flex items-center space-x-3">
          <button 
            onClick={() => setView(View.DASHBOARD)}
            className="p-2 bg-gray-50 hover:bg-gray-100 text-gray-600 rounded-xl transition-all"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-black text-gray-800 tracking-tight uppercase font-brand">Notification History</h2>
            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mt-0.5">
              Review and manage alerts generated across LGU Tibiao
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <button 
            onClick={handleMarkAllRead}
            disabled={filteredNotifications.filter(n => !n.isRead).length === 0}
            className="flex items-center space-x-1.5 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed text-blue-700 font-black uppercase text-[10px] tracking-wider rounded-xl border border-blue-100 transition-all"
          >
            <CheckCheck className="w-4 h-4" />
            <span>Mark filtered as read</span>
          </button>
        </div>
      </div>

      {/* Filter panel */}
      <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
        <div className="flex items-center space-x-2 border-b border-gray-100 pb-3">
          <Filter className="w-4 h-4 text-gray-400" />
          <span className="text-xs font-black text-gray-500 uppercase tracking-widest">Search & Filters</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {/* Keyword Search */}
          <div className="col-span-1 md:col-span-2 relative">
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Search Keyword</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input 
                type="text"
                placeholder="Search description, office, title..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 hover:bg-gray-100/70 focus:bg-white text-xs text-gray-800 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-400 transition-all font-semibold"
              />
            </div>
          </div>

          {/* Module Filter */}
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Module</label>
            <select
              value={selectedModule}
              onChange={(e) => setSelectedModule(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 hover:bg-gray-100/70 text-xs text-gray-700 font-bold border border-gray-200 rounded-xl focus:outline-none transition-all"
            >
              <option value="ALL">ALL MODULES</option>
              <option value="PROCUREMENT">PROCUREMENT</option>
              <option value="ACCOUNTING">ACCOUNTING</option>
              <option value="ENGINEER">ENGINEER/ADMIN</option>
              <option value="INVENTORY">INVENTORY</option>
              <option value="OFFICE">OFFICE DEPT</option>
              <option value="REPORTS">REPORTS</option>
              <option value="SYSTEM">SYSTEM LOGS</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 hover:bg-gray-100/70 text-xs text-gray-700 font-bold border border-gray-200 rounded-xl focus:outline-none transition-all"
            >
              <option value="ALL">ALL STATUS</option>
              <option value="UNREAD">UNREAD ONLY</option>
              <option value="READ">READ ONLY</option>
            </select>
          </div>

          {/* Office Filter */}
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Office / Dept</label>
            <select
              value={selectedOffice}
              onChange={(e) => setSelectedOffice(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 hover:bg-gray-100/70 text-xs text-gray-700 font-bold border border-gray-200 rounded-xl focus:outline-none transition-all"
            >
              <option value="ALL">ALL OFFICES</option>
              {uniqueOffices.map(office => (
                <option key={office} value={office}>{office}</option>
              ))}
            </select>
          </div>

          {/* Date Filter */}
          <div>
            <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest block mb-1">Date Created</label>
            <select
              value={selectedDateFilter}
              onChange={(e) => setSelectedDateFilter(e.target.value)}
              className="w-full px-3 py-2.5 bg-gray-50 hover:bg-gray-100/70 text-xs text-gray-700 font-bold border border-gray-200 rounded-xl focus:outline-none transition-all"
            >
              <option value="ALL">ANYTIME</option>
              <option value="TODAY">TODAY</option>
              <option value="WEEK">PAST 7 DAYS</option>
              <option value="MONTH">PAST 30 DAYS</option>
            </select>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex-1 flex flex-col">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 space-y-3">
            <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs font-black text-gray-400 uppercase tracking-wider">Syncing real-time notifications...</p>
          </div>
        ) : filteredNotifications.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center max-w-md mx-auto">
            <div className="w-14 h-14 bg-gray-50 text-gray-300 rounded-2xl flex items-center justify-center mb-4">
              <Bell className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-black text-gray-800 uppercase tracking-tight">No Notifications Found</h3>
            <p className="text-xs text-gray-400 font-semibold leading-relaxed mt-1">
              There are no notifications matching your search filters, or none have been generated yet.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 overflow-y-auto max-h-[600px]">
            {filteredNotifications.map((notif) => (
              <div 
                key={notif.id}
                className={`p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:bg-gray-50/75 ${
                  !notif.isRead ? 'bg-blue-50/30 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'
                }`}
              >
                <div className="flex items-start space-x-3.5 min-w-0 flex-1">
                  <div className={`p-2.5 rounded-xl flex-shrink-0 flex items-center justify-center ${
                    !notif.isRead ? 'bg-blue-100/70 text-blue-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {getModuleIcon(notif.module)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-xs font-black ${!notif.isRead ? 'text-gray-900' : 'text-gray-700'}`}>
                        {notif.title}
                      </span>
                      {notif.officeId && (
                        <span className="px-2 py-0.5 bg-gray-100 text-[8px] font-black text-gray-500 rounded uppercase tracking-wider">
                          🏛️ {notif.officeId}
                        </span>
                      )}
                      <span className="px-2 py-0.5 bg-blue-50 text-[8px] font-black text-blue-500 rounded uppercase tracking-wider">
                        {notif.module}
                      </span>
                      {!notif.isRead && (
                        <span className="w-2 h-2 bg-blue-600 rounded-full animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-gray-500 mt-1 font-semibold leading-relaxed">
                      {notif.message}
                    </p>
                    <div className="flex items-center space-x-2 mt-2">
                      <Calendar className="w-3 h-3 text-gray-400" />
                      <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wide">
                        {new Date(notif.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 shrink-0 self-end sm:self-auto">
                  {/* Mark as read button */}
                  <button 
                    onClick={() => handleToggleRead(notif.id, notif.isRead)}
                    className={`p-2 rounded-xl border transition-all ${
                      notif.isRead 
                        ? 'border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50' 
                        : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                    }`}
                    title={notif.isRead ? "Mark as Unread" : "Mark as Read"}
                  >
                    <Check className="w-4 h-4" />
                  </button>

                  {/* View Details/Action button */}
                  <button 
                    onClick={() => onNotificationActionClick(notif)}
                    className="flex items-center space-x-1 px-3 py-2 bg-gray-900 hover:bg-black text-white rounded-xl text-[9px] font-black uppercase tracking-wider transition-all"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>View</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
