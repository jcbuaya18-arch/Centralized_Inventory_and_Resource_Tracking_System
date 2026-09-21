import { UserRole } from '../types';

export interface KnownAccount {
  role: UserRole;
  office: string;
  fullName: string;
  position: string;
}

export const KNOWN_ACCOUNTS: Record<string, KnownAccount> = {
  'jocelynmanzan1962@gmail.com': {
    role: UserRole.ADMIN,
    office: 'Municipal Hall - Admin',
    fullName: 'Jocelyn Manzan',
    position: 'Municipal Administrator'
  },
  'ravenlangote08@gmail.com': {
    role: UserRole.ADMIN,
    office: 'Municipal Hall - Admin',
    fullName: 'Raven Langote',
    position: 'Municipal Administrator'
  },
  'jcbuaya18@gmail.com': {
    role: UserRole.ADMIN,
    office: 'Municipal Hall - Admin',
    fullName: 'JC Buaya',
    position: 'Municipal Administrator'
  },
  'jc@gmail.com': {
    role: UserRole.ADMIN,
    office: 'Municipal Hall - Admin',
    fullName: 'JC Buaya',
    position: 'Municipal Administrator'
  },
  'meccaellaelumba@gmail.com': {
    role: UserRole.ACCOUNTING,
    office: 'Accounting Office',
    fullName: 'Mecca Ella Elumba',
    position: 'Municipal Accountant'
  },
  'mayor@tibiao.gov.ph': {
    role: UserRole.MAYOR,
    office: "Mayor's Office",
    fullName: 'Mayor Gil Barez',
    position: 'Municipal Mayor'
  },
  'agricultureofficehead@gmail.com': {
    role: UserRole.OFFICE_HEAD,
    office: 'Agriculture',
    fullName: 'Agriculture Office Head',
    position: 'Office Head - Agriculture'
  },
  'healthnutritionofficehead@gmail.com': {
    role: UserRole.OFFICE_HEAD,
    office: 'Health & Nutrition',
    fullName: 'Health & Nutrition Office Head',
    position: 'Office Head - Health & Nutrition'
  },
  'informationtechnologyofficehead@gmail.com': {
    role: UserRole.OFFICE_HEAD,
    office: 'Information Technology',
    fullName: 'Information Technology Office Head',
    position: 'Office Head - Information Technology'
  },
  'mdrromoofficehead@gmail.com': {
    role: UserRole.OFFICE_HEAD,
    office: 'MDRRMO',
    fullName: 'MDRRMO Office Head',
    position: 'Office Head - MDRRMO'
  },
  'mdrrmoofficehead@gmail.com': {
    role: UserRole.OFFICE_HEAD,
    office: 'MDRRMO',
    fullName: 'MDRRMO Office Head',
    position: 'Office Head - MDRRMO'
  },
  'assessorofficehead@gmail.com': {
    role: UserRole.OFFICE_HEAD,
    office: "Assessor's Office",
    fullName: "Assessor's Office Head",
    position: "Office Head - Assessor's Office"
  },
  'officehead@tibiao.gov.ph': {
    role: UserRole.OFFICE_HEAD,
    office: 'Municipal Engineering Office',
    fullName: 'Engr. J. Santos',
    position: 'Municipal Engineer / Office Head'
  }
};

/** List of whitelisted emails that can auto-register / bypass login */
export const AUTO_REGISTER_EMAILS = Object.keys(KNOWN_ACCOUNTS);

/**
 * Get bypass info for a given email, returning null if not a known account.
 */
export const getBypassInfo = (email: string) => {
  const lower = email.toLowerCase().trim();
  return KNOWN_ACCOUNTS[lower] || null;
};
