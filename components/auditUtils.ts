import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export interface PRSActionParams {
  action: string;
  user: string;
  role: string;
  transactionNumber: string;
  formType?: string;
}

/**
 * Centered audit logging helper that records PRS-related actions into the 'system_logs' collection with a server timestamp.
 * Supports both object parameter and positional parameters.
 */
export async function logPRSAction(params: PRSActionParams): Promise<void>;
export async function logPRSAction(
  action: string,
  user: string,
  role: string,
  transactionNumber: string,
  formType?: string
): Promise<void>;
export async function logPRSAction(
  first: string | PRSActionParams,
  second?: string,
  third?: string,
  fourth?: string,
  fifth?: string
): Promise<void> {
  let action = '';
  let user = '';
  let role = '';
  let transactionNumber = '';
  let formType = 'PRS';

  if (typeof first === 'object' && first !== null) {
    action = first.action;
    user = first.user;
    role = first.role;
    transactionNumber = first.transactionNumber;
    formType = first.formType || 'PRS';
  } else if (typeof first === 'string') {
    action = first;
    user = second || '';
    role = third || '';
    transactionNumber = fourth || '';
    formType = fifth || 'PRS';
  }

  try {
    await addDoc(collection(db, 'system_logs'), {
      timestamp: serverTimestamp(),
      action,
      user,
      role,
      transactionNumber,
      formType,
      module: 'Procurement Audit',
    });
    console.log(`[Audit Log Success]: Saved PRS action log for transaction ${transactionNumber}`);
  } catch (error) {
    console.error('[Audit Log Error]: Failed to save PRS log entry:', error);
  }
}
