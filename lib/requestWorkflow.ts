import { AssetRequest, UserRole } from '../types';

export const PENDING_ACCOUNTING_REVIEW = 'Pending Accounting Review';

/**
 * True while a purchase request is still in the Accounting stage: awaiting
 * Accounting review, or declined by Accounting. Such requests must not reach
 * the Engineer/Admin queues until Accounting approves them.
 */
export const isAwaitingAccountingApproval = (req: Partial<AssetRequest>): boolean => {
  if (req.status === PENDING_ACCOUNTING_REVIEW) return true;
  const declined = req.status === 'DECLINED' || req.status === 'REJECTED' || req.status === ('Rejected' as any);
  return declined && String(req.handledBy || '').includes('(Accounting)');
};

/** Roles whose new purchase requests must be approved by Accounting first. */
export const requiresAccountingReview = (role: UserRole | string): boolean =>
  role !== UserRole.ADMIN && role !== UserRole.ACCOUNTING;
