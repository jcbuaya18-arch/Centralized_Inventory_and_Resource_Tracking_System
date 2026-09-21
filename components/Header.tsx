import React, { useState, useEffect, useRef } from 'react';
import { UserProfile, View } from '../types';
import { db } from '../firebase';
import { collection, query, orderBy, limit, onSnapshot, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { Bell, Check, CheckCheck, Eye, Inbox, History, Truck } from 'lucide-react';
import { motion } from 'motion/react';
import { SupplierShipmentModal } from './SupplierShipmentModal';

interface HeaderProps {
  user: UserProfile;
  onMenuClick?: () => void;
  setView?: (view: any) => void;
  onNotificationActionClick?: (notification: any) => void;
}

const bellVariants = {
  ring: {
    rotate: [0, -15, 12, -12, 10, -10, 8, -8, 0],
    scale: [1, 1.25, 0.95, 1.2, 0.98, 1.1, 1],
    transition: {
      duration: 0.8,
      ease: "easeInOut"
    }
  },
  idle: {
    rotate: 0,
    scale: 1
  }
};

const Header: React.FC<HeaderProps> = ({ user, onMenuClick, setView, onNotificationActionClick }) => {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showShipmentModal, setShowShipmentModal] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [isAnimating, setIsAnimating] = useState(false);
  const prevUnreadIds = useRef<Set<string>>(new Set());
  const isFirstLoad = useRef(true);
  const hasReceivedSnapshot = useRef(false);

  useEffect(() => {
    const q = query(collection(db, 'notifications'), orderBy('timestamp', 'desc'), limit(50));
    const unsubscribe = onSnapshot(q, (snap) => {
      const fetched = snap.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setNotifications(fetched);
      hasReceivedSnapshot.current = true;
    }, (err) => {
      console.error("Error fetching notifications in Header:", err);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter based on role / authorization
  const authorizedNotifications = notifications.filter(n => {
    if (user.role === 'ADMIN') return true; // Super Administrator sees everything

    if (user.role === 'SUPPLY') {
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

    // Default: Office Head or Staff
    return (n.officeId === user.office) || (n.userId === user.uid) || (n.recipientRole === user.role);
  });

  const unreadCount = authorizedNotifications.filter(n => !n.isRead).length;

  const handleMarkAllRead = async () => {
    try {
      const batch = writeBatch(db);
      let count = 0;
      authorizedNotifications.forEach(n => {
        if (!n.isRead) {
          const ref = doc(db, 'notifications', n.id);
          batch.update(ref, { isRead: true, readAt: new Date().toISOString() });
          count++;
        }
      });
      if (count > 0) {
        await batch.commit();
      }
    } catch (err) {
      console.error("Error marking all read in Header:", err);
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
      console.error("Error toggling notification state inside Header:", err);
    }
  };

  // Effect to trigger shake/pulse animation on new unread notifications
  useEffect(() => {
    if (!hasReceivedSnapshot.current) return;

    const currentUnread = authorizedNotifications.filter(n => !n.isRead);
    const currentUnreadIds = new Set(currentUnread.map(n => n.id));

    if (isFirstLoad.current) {
      prevUnreadIds.current = currentUnreadIds;
      isFirstLoad.current = false;
      return;
    }

    let hasNewUnread = false;
    for (const id of currentUnreadIds) {
      if (!prevUnreadIds.current.has(id)) {
        hasNewUnread = true;
        break;
      }
    }

    if (hasNewUnread) {
      setIsAnimating(true);
      const timer = setTimeout(() => {
        setIsAnimating(false);
      }, 1000);
      prevUnreadIds.current = currentUnreadIds;
      return () => clearTimeout(timer);
    } else {
      prevUnreadIds.current = currentUnreadIds;
    }
  }, [authorizedNotifications]);

  return (
    <header className="gov-header bg-white border-b border-gray-200 h-20 flex items-center justify-between px-4 md:px-8 sticky top-0 z-30 no-print flex-shrink-0">
      <div className="flex items-center space-x-4">
        <button 
          onClick={onMenuClick}
          className="md:hidden p-2 text-gray-500 hover:bg-gray-100 rounded-xl transition-colors"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 6h16M4 12h16m-7 6h7" />
          </svg>
        </button>
        <div className="gov-header-seal relative hidden xs:block seal-glow">
          <img 
            src="/tibiao-logo.png"
            alt="Tibiao Seal" 
            className="w-10 h-10 object-contain"
            referrerPolicy="no-referrer"
          />
          <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-white rounded-full"></div>
        </div>
        <div className="min-w-0">
          <h1 className="text-xs md:text-base font-black text-gray-900 tracking-tight uppercase font-brand truncate max-w-[150px] sm:max-w-none">
            Municipality of Tibiao
          </h1>
          <div className="flex items-center space-x-2">
            <span className="text-[7px] md:text-[8px] font-black text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded">Local Network</span>
            <span className="hidden sm:inline text-[8px] font-bold text-gray-400 uppercase tracking-widest">• Secured Access</span>
          </div>
        </div>
      </div>
      
      <div className="flex items-center space-x-3 md:space-x-4 relative" ref={dropdownRef}>
        {/* Notification Bell Icon */}
        {setView && (
          <div className="relative">
            <button
              onClick={() => setShowDropdown(!showDropdown)}
              className={`p-2.5 rounded-xl border transition-all relative ${
                showDropdown 
                  ? 'bg-blue-50 border-blue-200 text-blue-600' 
                  : 'bg-gray-50 border-gray-200 text-gray-500 hover:bg-gray-100 hover:text-gray-700'
              }`}
              id="notification-bell-btn"
              title="Notifications Center"
            >
              <motion.div
                variants={bellVariants}
                animate={isAnimating ? "ring" : "idle"}
                className="flex items-center justify-center"
              >
                <Bell className="w-5 h-5" />
              </motion.div>
              {unreadCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white font-black text-[9px] w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-md animate-bounce">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Dropdown menu */}
            {showDropdown && (
              <div className="absolute right-0 mt-2.5 w-[320px] sm:w-[380px] bg-white border border-gray-100 shadow-2xl rounded-2xl z-50 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="font-black text-xs uppercase tracking-wider text-gray-700">Notifications</span>
                    {unreadCount > 0 && (
                      <span className="bg-blue-600 text-white font-black text-[9px] px-1.5 py-0.5 rounded">
                        {unreadCount} NEW
                      </span>
                    )}
                  </div>
                  <button 
                    onClick={handleMarkAllRead}
                    disabled={unreadCount === 0}
                    className="text-[9px] font-black text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider flex items-center space-x-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Mark all read</span>
                  </button>
                </div>

                {/* List */}
                <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-100 custom-scrollbar">
                  {authorizedNotifications.length === 0 ? (
                    <div className="p-8 text-center flex flex-col items-center justify-center">
                      <Inbox className="w-8 h-8 text-gray-300 mb-2" />
                      <p className="text-xs font-black text-gray-400 uppercase tracking-wide">Inbox is empty</p>
                      <p className="text-[10px] text-gray-400 mt-0.5 font-medium">You have no active notifications</p>
                    </div>
                  ) : (
                    authorizedNotifications.slice(0, 10).map((notif) => (
                      <div 
                        key={notif.id}
                        className={`p-4 flex items-start gap-3 hover:bg-gray-50/75 transition-all text-left ${
                          !notif.isRead ? 'bg-blue-50/25 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-[8px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                              {notif.module}
                            </span>
                            {notif.officeId && (
                              <span className="text-[9px] font-bold text-gray-400 uppercase">
                                • {notif.officeId}
                              </span>
                            )}
                            {!notif.isRead && (
                              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full" />
                            )}
                          </div>
                          <h4 className={`text-xs font-bold mt-1 ${!notif.isRead ? 'text-gray-900' : 'text-gray-600'}`}>
                            {notif.title}
                          </h4>
                          <p className="text-[11px] text-gray-500 font-medium mt-0.5 line-clamp-2">
                            {notif.message}
                          </p>
                          <span className="text-[8px] text-gray-400 font-bold uppercase tracking-wider block mt-1.5">
                            {new Date(notif.timestamp).toLocaleString()}
                          </span>
                        </div>

                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleRead(notif.id, notif.isRead);
                            }}
                            className={`p-1.5 rounded-lg border transition-all ${
                              notif.isRead 
                                ? 'border-gray-200 text-gray-400 hover:text-gray-600 hover:bg-gray-50' 
                                : 'border-blue-200 text-blue-600 hover:bg-blue-50'
                            }`}
                            title={notif.isRead ? "Mark as Unread" : "Mark as Read"}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button 
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowDropdown(false);
                              if (onNotificationActionClick) {
                                onNotificationActionClick(notif);
                              }
                            }}
                            className="p-1.5 bg-gray-950 hover:bg-black text-white rounded-lg text-[9px] font-black uppercase tracking-widest flex items-center justify-center"
                            title="View Action"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* Footer */}
                <button 
                  onClick={() => {
                    setShowDropdown(false);
                    setView(View.NOTIFICATIONS);
                  }}
                  className="p-3 bg-gray-50 hover:bg-gray-100 border-t border-gray-100 font-black text-[9px] text-center text-blue-600 hover:text-blue-800 uppercase tracking-widest flex items-center justify-center space-x-1.5 w-full transition-all"
                >
                  <History className="w-3.5 h-3.5" />
                  <span>View All Notification History</span>
                </button>
              </div>
            )}
          </div>
        )}

        <div className="hidden lg:flex flex-col items-end">
          <span className="text-xs font-black text-gray-800 uppercase tracking-tighter">{user.fullName}</span>
          <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">{user.position}</span>
        </div>
        <button className="flex items-center space-x-2 focus:outline-none group">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl md:rounded-2xl bg-blue-600 flex items-center justify-center border-2 border-white shadow-lg shadow-blue-100 transition-all overflow-hidden">
            {user.profilePic ? (
              <img src={user.profilePic} alt="Profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-black text-xs uppercase tracking-normal">
                {user.fullName.split(' ').filter(Boolean).map(part => part[0]).join('').substring(0, 2).toUpperCase() || 'SA'}
              </span>
            )}
          </div>
        </button>
      </div>
      {showShipmentModal && (
        <SupplierShipmentModal
          isOpen={showShipmentModal}
          onClose={() => setShowShipmentModal(false)}
          userRole={user.role}
          userName={user.fullName}
        />
      )}
    </header>
  );
};

export default Header;
