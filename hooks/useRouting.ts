import React, { useState, useEffect, useCallback } from 'react';
import { View, Office } from '../types';

export interface UseRoutingReturn {
  currentView: View;
  setCurrentView: React.Dispatch<React.SetStateAction<View>>;
  officeFilter: string;
  setOfficeFilter: React.Dispatch<React.SetStateAction<string>>;
  officeTab: 'stock_card' | 'par' | 'ics';
  setOfficeTab: React.Dispatch<React.SetStateAction<'stock_card' | 'par' | 'ics'>>;
  reportsInitialTab: 'generator' | 'archive' | 'transfers';
  setReportsInitialTab: React.Dispatch<React.SetStateAction<'generator' | 'archive' | 'transfers'>>;
  requisitionsInitialTab: 'PAR' | 'ICS' | 'REQUISITION' | 'FINANCIAL';
  setRequisitionsInitialTab: React.Dispatch<React.SetStateAction<'PAR' | 'ICS' | 'REQUISITION' | 'FINANCIAL'>>;
  requisitionsInitialSearch: string;
  setRequisitionsInitialSearch: React.Dispatch<React.SetStateAction<string>>;
  dashboardActiveTabOverride: string | null;
  setDashboardActiveTabOverride: React.Dispatch<React.SetStateAction<string | null>>;
  activeToast: ToastState;
  setActiveToast: React.Dispatch<React.SetStateAction<ToastState>>;
  handleNotificationActionClick: (notif: any) => Promise<void>;
}

export type ToastState = {
  id: string;
  title: string;
  message: string;
  type: string;
  itrNo?: string;
} | null;

function getInitialView(): View {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  if (path === '/offices' || path.startsWith('/offices/')) return View.OFFICES;

  const pathViewMap: Record<string, View> = {
    '/inventory': View.ITEMS,
    '/receiving': View.RECEIVING,
    '/stickers': View.STICKERS,
    '/reports': View.REPORTS,
    '/audit': View.AUDIT,
    '/database': View.DATABASE,
    '/requests': View.REQUESTS,
    '/profile': View.PROFILE,
    '/transactions': View.TRANSACTIONS
  };
  return pathViewMap[path] || View.DASHBOARD;
}

function getInitialOfficeFilter(): string {
  const path = typeof window !== 'undefined' ? window.location.pathname : '';
  if (path.startsWith('/offices/')) {
    return decodeURIComponent(path.substring(9));
  }
  return '';
}

export function useRouting(offices: Office[]): UseRoutingReturn {
  const [currentView, setCurrentView] = useState<View>(getInitialView);
  const [officeFilter, setOfficeFilter] = useState<string>(getInitialOfficeFilter);
  const [officeTab, setOfficeTab] = useState<'stock_card' | 'par' | 'ics'>('stock_card');
  const [reportsInitialTab, setReportsInitialTab] = useState<'generator' | 'archive' | 'transfers'>('generator');
  const [requisitionsInitialTab, setRequisitionsInitialTab] = useState<'PAR' | 'ICS' | 'REQUISITION' | 'FINANCIAL'>('PAR');
  const [requisitionsInitialSearch, setRequisitionsInitialSearch] = useState<string>('');
  const [dashboardActiveTabOverride, setDashboardActiveTabOverride] = useState<string | null>(null);
  const [activeToast, setActiveToast] = useState<ToastState>(null);

  const handleNotificationActionClick = useCallback(async (notif: any) => {
    try {
      if (notif.id) {
        const { doc, updateDoc } = await import('firebase/firestore');
        const { db } = await import('../firebase');
        const ref = doc(db, 'notifications', notif.id);
        await updateDoc(ref, { isRead: true, readAt: new Date().toISOString() });
      }
    } catch (err) {
      console.error("Error opening notification:", err);
    }

    const targetRecordId = notif.relatedRecordId || notif.reportId || notif.slipNumber || notif.transactionNumber || '';

    if (
      notif.type === 'PAR_SUBMITTED' ||
      notif.type === 'PAR_UPLOAD' ||
      notif.type === 'PAR_APPROVED' ||
      notif.type?.includes('PAR')
    ) {
      setCurrentView(View.REQUESTS);
      setRequisitionsInitialTab('PAR');
      setRequisitionsInitialSearch(targetRecordId);
    } else if (
      notif.type === 'ICS_SUBMITTED' ||
      notif.type === 'ICS_UPLOAD' ||
      notif.type === 'ICS_APPROVED' ||
      notif.type?.includes('ICS')
    ) {
      setCurrentView(View.REQUESTS);
      setRequisitionsInitialTab('ICS');
      setRequisitionsInitialSearch(targetRecordId);
    } else if (
      notif.type === 'PURCHASE_REQUEST' ||
      notif.type === 'DIRECT_PURCHASE' ||
      notif.type === 'ACCOUNTING_REQUEST' ||
      notif.type === 'NEW_REQUEST' ||
      notif.type === 'ADMIN_RECEIVED_REQUEST' ||
      notif.type === 'PROCUREMENT_APPROVED' ||
      notif.type === 'PROCUREMENT_REJECTED' ||
      notif.type === 'SLIP_APPROVAL' ||
      notif.type === 'DECISION' ||
      notif.type === 'PROCUREMENT_SUBMITTED' ||
      notif.type?.includes('PURCHASE') ||
      notif.type?.includes('DIRECT') ||
      notif.module === 'PROCUREMENT'
    ) {
      setCurrentView(View.REQUESTS);
      setRequisitionsInitialTab('REQUISITION');
      setRequisitionsInitialSearch(targetRecordId);
    } else if (notif.type === 'SHIPMENT_READY' || notif.type === 'RECEIVE_REGISTER_COMPLETED' || notif.type === 'RECEIPT' || notif.type?.includes('RECEIVE') || notif.type?.includes('CARGO')) {
      setCurrentView(View.RECEIVING);
    } else if (notif.type === 'SUBMISSION' || notif.module === 'REPORTS' || notif.type?.includes('REPORT') || notif.type === 'RRSP_CREATED' || notif.type === 'RPCPPE_UPDATED') {
      setCurrentView(View.REPORTS);
      if (notif.type === 'RRSP_CREATED' || notif.title?.includes('RRSP')) {
        setReportsInitialTab('archive');
      } else {
        setReportsInitialTab('generator');
      }
    } else if (notif.type === 'INVENTORY_UPDATE' || notif.type === 'INVENTORY_UPDATED' || notif.type === 'INVENTORY_REGISTERED' || notif.module === 'INVENTORY' || notif.type === 'LOW_STOCK' || notif.type === 'OUT_OF_STOCK' || notif.type?.includes('DUPLICATE')) {
      setCurrentView(View.ITEMS);
    } else if (notif.module === 'OFFICE' || notif.type === 'OFFICE_CHANGED') {
      setCurrentView(View.OFFICES);
    } else if (notif.module === 'SYSTEM') {
      setCurrentView(View.AUDIT);
    } else {
      setCurrentView(View.DASHBOARD);
    }
  }, []);

  // ── URL pushState Sync ──
  useEffect(() => {
    let targetPath = '/';
    if (currentView === View.OFFICES) {
      if (officeFilter) {
        const matchedOffice = offices.find(o => o.name.toLowerCase() === officeFilter.toLowerCase());
        const officeId = matchedOffice ? matchedOffice.id : encodeURIComponent(officeFilter);
        targetPath = `/offices/${officeId}`;
      } else {
        targetPath = '/offices';
      }
    } else {
      const viewMap: Record<string, string> = {
        [View.DASHBOARD]: '/',
        [View.ITEMS]: '/inventory',
        [View.RECEIVING]: '/receiving',
        [View.STICKERS]: '/stickers',
        [View.REPORTS]: '/reports',
        [View.AUDIT]: '/audit',
        [View.DATABASE]: '/database',
        [View.REQUESTS]: '/requests',
        [View.PROFILE]: '/profile',
        [View.TRANSACTIONS]: '/transactions'
      };
      targetPath = viewMap[currentView] || '/';
    }

    if (window.location.pathname !== targetPath) {
      window.history.pushState({ view: currentView, filter: officeFilter }, '', targetPath);
    }
  }, [currentView, officeFilter, offices]);

  // ── popstate Handler ──
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const path = window.location.pathname;
      if (path === '/offices') {
        setCurrentView(View.OFFICES);
        setOfficeFilter('');
      } else if (path.startsWith('/offices/')) {
        const pathPart = decodeURIComponent(path.substring(9));
        const matchedOffice = offices.find(o =>
          o.id === pathPart || o.name.toLowerCase() === pathPart.toLowerCase() || o.code === pathPart
        );
        setCurrentView(View.OFFICES);
        setOfficeFilter(matchedOffice ? matchedOffice.name : pathPart);
      } else {
        const reverseMap: Record<string, View> = {
          '/': View.DASHBOARD,
          '/inventory': View.ITEMS,
          '/receiving': View.RECEIVING,
          '/stickers': View.STICKERS,
          '/reports': View.REPORTS,
          '/audit': View.AUDIT,
          '/database': View.DATABASE,
          '/requests': View.REQUESTS,
          '/profile': View.PROFILE,
          '/transactions': View.TRANSACTIONS
        };
        const view = reverseMap[path];
        if (view) {
          setCurrentView(view);
          setOfficeFilter('');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [offices]);

  return {
    currentView, setCurrentView,
    officeFilter, setOfficeFilter,
    officeTab, setOfficeTab,
    reportsInitialTab, setReportsInitialTab,
    requisitionsInitialTab, setRequisitionsInitialTab,
    requisitionsInitialSearch, setRequisitionsInitialSearch,
    dashboardActiveTabOverride, setDashboardActiveTabOverride,
    activeToast, setActiveToast,
    handleNotificationActionClick,
  };
}
