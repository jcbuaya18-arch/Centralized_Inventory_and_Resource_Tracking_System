
export enum View {
  DASHBOARD = 'DASHBOARD',
  ITEMS = 'ITEMS',
  STICKERS = 'STICKERS',
  REPORTS = 'REPORTS',
  AUDIT = 'AUDIT',
  OFFICES = 'OFFICES',
  PROFILE = 'PROFILE',
  DATABASE = 'DATABASE',
  REQUESTS = 'REQUESTS',
  OUTGOING_LOGS = 'OUTGOING_LOGS',
  RECEIVING = 'RECEIVING',
  TRANSACTIONS = 'TRANSACTIONS',
  NOTIFICATIONS = 'NOTIFICATIONS'
}

export enum UserRole {
  ADMIN = 'ADMIN',
  MAYOR = 'MAYOR',
  OFFICE_HEAD = 'OFFICE_HEAD',
  UNAUTHORIZED = 'UNAUTHORIZED',
  SUPPLY = 'SUPPLY',
  ACCOUNTING = 'ACCOUNTING',
  STAFF = 'STAFF'
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  field?: string;
  oldValue?: string | number;
  newValue?: string | number;
}

export interface InventoryItem {
  id: string;
  article: string;
  description: string;
  propertyNumber: string;
  assetCode?: string; // Standard LGU Asset Code
  unitOfMeasure: string;
  unitValue: number;
  qtyPropertyCard: number;
  qtyPhysicalCount: number;
  modelNumber?: string;
  serialNumber?: string;
  acquisitionDate?: string;
  acquisitionCost?: number;
  reorderPoint?: number;
  usefulLife?: number; // in years
  category: string;
  office: string;
  personAccountable: string; // Accountable Officer
  remarks?: string;
  history: HistoryEntry[];
  imageUrls?: string[];
  
  // Upgraded Fields
  yearPurchased?: number | string;
  assignedStaff?: string; // Assigned Staff/End User
  status: 'AVAILABLE' | 'ASSIGNED' | 'BORROWED' | 'UNDER_REPAIR' | 'LOST' | 'CONDEMNED' | 'RETIRED' | 'TRANSFERRED';
  condition?: 'Brand New' | 'Good' | 'Fair' | 'Damaged' | 'Expired' | 'Under Repair' | 'Poor' | 'Condemned' | 'Lost';
  departmentId?: string;

  createdAt?: string;
  borrowerName?: string;
  borrowedDate?: string;
  masterAssetId?: string;

  // Additional Metadata
  warrantyExpiration?: string;
  expirationDate?: string; // Item/product expiration date (YYYY-MM-DD) - distinct from warrantyExpiration
  supplier?: string;
  acquisitionMethod?: string;
  purchaseOrderNumber?: string;
  fundingSource?: string;

  // Accountability Tracking dates and transfers
  dateAssigned?: string;
  dateReceived?: string;
  previousHolder?: string;
  transferHistory?: HistoryEntry[];
  
  // Master data flags
  isFixed?: boolean;
  isMaster?: boolean;
  classification?: 'PAR' | 'ICS';
  isArchived?: boolean;
  archivedAt?: string;
  archivedBy?: string;
  archiveReason?: 'EXPIRED' | 'DAMAGED' | 'MANUAL';
  isOfflinePending?: boolean;
  updatedAt?: string;
  lastReceivedAt?: string;
}

export interface LguForm {
  id: string;
  type: 'ICS' | 'ITR' | 'STOCK_CARD' | 'SUPPLIES_REGISTRY' | 'PAR';
  itemId: string;
  itemArticle: string;
  propertyNumber: string;
  userId: string;
  userName: string;
  office: string;
  department: string;
  quantity: number;
  dateCreated: string;
  status: 'Draft' | 'Finalized' | 'Approved' | 'Returned';
  remarks?: string;
  signatoryApprovedBy?: string;
  signatoryCertifiedBy?: string;
}

export interface ReportHistory {
  id: string;
  timestamp: string;
  action: string;
  details: string;
}

export interface ReportRow extends Partial<InventoryItem> {
  tempId: string;
  dateAcquired?: string;
  shortageQty?: number;
  shortageValue?: number;
  officeAssociated?: string;
}

export interface GeneratedReport {
  id: string;
  report_type: string;
  fund_cluster: string;
  report_date: string;
  accountable_person: string;
  accountable_position: string;
  accountability_date: string;
  committee_chair: string;
  head_of_agency: string;
  head_position: string;
  coa_rep: string;
  total_value: number;
  item_count: number;
  items_snapshot: InventoryItem[]; 
  history: ReportHistory[];
  status: 'Draft' | 'Pending Approval' | 'Approved' | 'Rejected' | 'Returned for Revision' | 'Finalized';
  created_at?: string;
  reviewedBy?: string;
  
  // Custom GAM Form Parameters
  reportMode?: string;
  spcStockNo?: string;
  spcReorderLevel?: string;
  spcUnitCost?: number;
  spcNotedBy?: string;
  splcStockNo?: string;
  splcUnitCost?: number;
  splcAccountCode?: string;
  splcApprovedBy?: string;
  icsNo?: string;
  icsDateIssued?: string;
  icsEmployeeName?: string;
  icsEmployeePosition?: string;
  icsIssuedBy?: string;
  regsipPreparedBy?: string;
  regsipApprovedBy?: string;
  itrNo?: string;
  itrDate?: string;
  itrFromTransferor?: string;
  itrToTransferee?: string;
  itrPurpose?: string;
  itrType?: string;
  itrTypeOthers?: string;
  itrApprovedBy?: string;
  itrApprovedPosition?: string;
  itrFromPosition?: string;
  itrToPosition?: string;
  itrFromOffice?: string;
  itrToOffice?: string;
  rrspNo?: string;
  rrspDate?: string;
  rrspAccountCode?: string;
  rrspSupplier?: string;
  rrspOrDvNo?: string;
  rrspOrDvDate?: string;
  rrspReceivedBy?: string;
  rrspApprovedBy?: string;

  // New forwarding/review workflow tracking fields
  forwardedAt?: string;
  submittedByOffice?: string;
  senderName?: string;
  forwardedStatus?: 'Pending' | 'Reviewed' | 'Approved' | 'Rejected';
  adminRemarks?: string;
  isArchived?: boolean;
  audit_notes?: string;
  auditNotesDetail?: {
    notes: string;
    savedAt: string;
    createdBy: string;
    office: string;
    propertyType: string;
    auditSession: string;
    lastModified: string;
  };
}

export interface SystemLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  module: string;
  role?: string;
  formType?: string;
  transactionNumber?: string;
}

export interface AccessLog {
  id: string;
  timestamp: string;
  ip: string;
  device: string;
  status: string;
}

export interface SystemSettings {
  municipality: string;
  province: string;
  fiscalYear: string;
  systemVersion: string;
  lastBackup: string;
}

export interface Office {
  id: string;
  name: string;
  code: string;
}

export interface UserProfile {
  uid?: string;
  fullName: string;
  username: string;
  office: string;
  position: string;
  profilePic?: string;
  role: UserRole;
}

export interface ReceivingRequest {
  id: string;
  itemArticle: string;
  description: string;
  category: string;
  quantity: number;
  unitValue: number;
  supplier: string;
  office: string;
  deliveryDate: string;
  status: 'PENDING' | 'APPROVED' | 'Approved' | 'RECEIVED' | 'REJECTED';
  executiveRemarks?: string;
  requestedBy: string;
  approvedBy?: string;
  approvedAt?: string;
  receivedAt?: string;
  receivedBy?: string;
  unitCost?: number;
  targetOffice?: string;
  slipNumber?: string;
  expectedDeliveryDate?: string;
  justification?: string;
  details?: string;
  expirationDate?: string;
  poNumber?: string;
  invoiceNumber?: string;
  priority?: 'Low' | 'Medium' | 'High';
  condition?: string;
  preparedBy?: string;
  mayorRemarks?: string;
}

export interface AssetRequest {
  id: string;
  itemArticle: string;
  category: string;
  quantity: number;
  justification: string;
  office: string;
  requestedBy: string;
  requestedAt: string;
  status: 'PENDING' | 'FORWARDED' | 'APPROVED' | 'DECLINED' | 'DISPATCHED' | 'REJECTED' | 'RETURNED_FOR_REVISION' | 'Draft' | 'Pending Submission' | 'Submitted' | 'Pending Engineer/Admin Review' | 'Returned for Correction' | 'Resubmitted' | 'Completed' | 'Archived' | 'DRAFT' | 'PENDING_SUBMISSION' | 'SUBMITTED' | 'PENDING_REVIEW' | 'RETURNED_FOR_CORRECTION' | 'RESUBMITTED' | 'COMPLETED' | 'ARCHIVED';
  responseRemarks?: string;
  handledBy?: string;
  handledAt?: string;

  // Unified Request Fields
  requestType?: 'REQUISITION' | 'FINANCIAL' | 'PAR' | 'ICS';
  priority?: 'Low' | 'Medium' | 'High';
  amount?: number;
  adminRemarks?: string;

  // Custom Tracking Fields for Accounting Requests
  requestNumber?: string;
  assignedAdmin?: string;
  attachedDocs?: string[];
  actionHistory?: Array<{ timestamp: string; status: string; user: string; remarks?: string }>;

  // Audit Trail History
  history?: ReportHistory[];
  reportId?: string;
  items_snapshot?: any[];
  title?: string;
  details?: string;
  unit?: string;
  unitCost?: number;
  unitValue?: number;
  supplier?: string;
  targetOffice?: string;
  targetOfficeHead?: string;
  preparedBy?: string;
  slipNumber?: string;
  expectedDeliveryDate?: string;
  datePurchased?: string;
  expirationDate?: string;
  poNumber?: string;
  invoiceNumber?: string;
  serialNumber?: string;
  masterAssetId?: string;
  originatingOffice?: string;
  condition?: string;
  equipmentType?: string;
}

export interface AccountantRequest {
  id: string;
  title: string;
  details: string;
  amount?: number;
  submittedBy: string;
  submittedAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  priority: 'Low' | 'Medium' | 'High';
  adminRemarks?: string;
  handledBy?: string;
  handledAt?: string;
}

export interface InventoryTransaction {
  id: string;
  itemId: string;
  article: string;
  officeId: string; // represent office name/string
  transactionType: 'Item Received' | 'Item Issued' | 'Item Distributed' | 'Item Returned' | 'Inventory Adjustment' | 'Transfer Between Offices';
  quantity: number;
  previousBalance: number;
  newBalance: number;
  user: string;
  date: string;
  time: string;
  timestamp: string;
  remarks: string;
  reference?: string;
}

export type RolePermissions = Record<UserRole, View[]>;

