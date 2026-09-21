import { initializeApp, getApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, getFirestore, Firestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from './firebase-applet-config.json';

// Hardcoded fallback configuration to ensure robust operation under all bundling environments
const fallbackConfig = {
  projectId: "gen-lang-client-0519730769",
  appId: "1:613915283942:web:efc53d274086bb16af8627",
  apiKey: "AIzaSyBfaTufE4p0JtHtHl5jEXN9lWAcqQQFUuo",
  authDomain: "gen-lang-client-0519730769.firebaseapp.com",
  firestoreDatabaseId: "ai-studio-c0e4fbbc-d42c-4fdf-b600-de03cd22550f",
  storageBucket: "gen-lang-client-0519730769.firebasestorage.app",
  messagingSenderId: "613915283942",
  measurementId: ""
};

// Consolidate configuration
const rawConfig = (firebaseConfig as any)?.default || firebaseConfig || fallbackConfig;
const config = (rawConfig && rawConfig.projectId) ? rawConfig : fallbackConfig;

// Initialize Firebase App strictly once using singleton pattern
export const app = getApps().length === 0 ? initializeApp(config) : getApp();

// Initialize Firestore instance targeting the configured named database ID
const dbDatabaseId = config.firestoreDatabaseId || fallbackConfig.firestoreDatabaseId;

const initDb = (): Firestore => {
  if (dbDatabaseId && dbDatabaseId !== '(default)') {
    try {
      console.log('[Firebase] Initializing named Firestore database:', dbDatabaseId);
      return initializeFirestore(app, {}, dbDatabaseId) as Firestore;
    } catch (e) {
      try {
        return getFirestore(app, dbDatabaseId) as Firestore;
      } catch (e2) {
        console.warn('[Firebase] Fallback to default database:', e2);
        return getFirestore(app) as Firestore;
      }
    }
  }

  try {
    return getFirestore(app) as Firestore;
  } catch (e) {
    return initializeFirestore(app, {}) as Firestore;
  }
};

export const db: Firestore = initDb();
export const auth = getAuth(app);
export const storage = getStorage(app);

if (typeof window !== 'undefined' && db) {
  (window as any).db = db;
}

console.log('[Firebase] Firestore initialized successfully:', !!db);

import { collection, addDoc, query, where, getDocs } from 'firebase/firestore';

export async function createNotification(data: {
  userId?: string;
  recipientRole?: string;
  officeId?: string;
  module: string;
  relatedRecordId?: string;
  type: string;
  title: string;
  message: string;
  triggeringUser?: { fullName: string; role: string; office?: string };
}) {
  if (!db) {
    console.warn('[Notification] Skipped: db is not initialized');
    return;
  }
  try {
    // Basic deduplication: Check if an unread notification of the same type and relatedRecordId exists
    if (data.relatedRecordId) {
      const q = query(
        collection(db, 'notifications'),
        where('type', '==', data.type),
        where('relatedRecordId', '==', data.relatedRecordId),
        where('isRead', '==', false)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        console.log(`[Notification] Duplicate notification for type ${data.type} and record ${data.relatedRecordId} skipped.`);
        return;
      }
    }

    const payload = {
      userId: data.userId || null,
      recipientRole: data.recipientRole || null,
      officeId: data.officeId || null,
      module: data.module,
      relatedRecordId: data.relatedRecordId || null,
      type: data.type,
      title: data.title,
      message: data.message,
      isRead: false,
      timestamp: new Date().toISOString()
    };

    const docRef = await addDoc(collection(db, 'notifications'), payload);
    console.log(`[Notification] Created notification ID ${docRef.id} with title "${data.title}"`);

    // Log the notification creation in system logs / audit logs
    await addDoc(collection(db, 'system_logs'), {
      timestamp: new Date().toISOString(),
      user: data.triggeringUser?.fullName || 'System',
      role: data.triggeringUser?.role || 'SYSTEM',
      office: data.triggeringUser?.office || 'GSO',
      action: `Created Notification: "${data.title}" for ${data.recipientRole || 'All'} in module ${data.module}`,
      module: 'System',
      relatedRecordId: data.relatedRecordId || null
    });
  } catch (error) {
    console.error("[Create Notification Error]:", error);
  }
}

export interface ProcurementTransactionPayload {
  slipNumber: string;
  requestId: string;
  itemArticle: string;
  quantity: number;
  amount?: number | null;
  status: 'Sent' | 'Pending' | 'Received' | 'Distributed' | 'Approved' | 'Declined';
  user: string;
  office: string;
  details: string;
}

export async function logProcurementTransaction(data: ProcurementTransactionPayload) {
  if (!db) {
    console.warn('[ProcurementTransaction] Skipped: db is not initialized');
    return;
  }
  try {
    const payload: any = {
      slipNumber: data.slipNumber || "N/A",
      requestId: data.requestId,
      itemArticle: data.itemArticle || "Equipment",
      quantity: Number(data.quantity) || 1,
      status: data.status,
      user: data.user || "Unknown",
      office: data.office || "Unknown Office",
      timestamp: new Date().toISOString(),
      details: data.details || ""
    };
    
    if (data.amount !== undefined && data.amount !== null && !isNaN(Number(data.amount))) {
      payload.amount = Number(data.amount);
    }

    await addDoc(collection(db, "procurement_transactions"), payload);
    console.log(`[Centralized Transaction History]: Registered status "${data.status}" for slip ${payload.slipNumber}`);
  } catch (error) {
    console.error("[Centralized Transaction History Error]:", error);
  }
}

export interface PRSAuditLog {
  user: string;
  role: string;
  formType: 'PRS';
  transactionNumber: string;
  timestamp: string;
  action: string;
  module: string;
}

export async function logPRSAction(log: PRSAuditLog) {
  if (!db) {
    console.warn('[PRSAction] Skipped: db is not initialized');
    return;
  }
  try {
    await addDoc(collection(db, "system_logs"), {
      timestamp: log.timestamp,
      user: log.user,
      role: log.role,
      formType: log.formType,
      transactionNumber: log.transactionNumber,
      action: log.action,
      module: log.module
    });
    console.log(`[PRS Audit Log]: Saved entry for transaction ${log.transactionNumber} - ${log.action}`);
  } catch (error) {
    console.error("[PRS Audit Log Error]:", error);
  }
}

// Keep the old name as alias to prevent breaking any un-migrated code
export const logPrsAudit = logPRSAction;

