import type { Company, QbListSyncRun, QbLists } from '@/api/schema'

/** The folder the real API scans for company subfolders. */
export const COMPANY_ROOT = 'D:\\Accountexx Data\\Quickbook - Accounting File\\Quickbook - Accounting File'
export const DEFAULT_COMPANY_ID = 1

/** What the fake API stores; `lists` and `waitingCount` are derived on read. */
export type CompanyRecord = Omit<Company, 'lists' | 'waitingCount'>

export const companyFilePath = (folderName: string, fileName: string) => `${COMPANY_ROOT}\\${folderName}\\${fileName}`

type Seed = Partial<CompanyRecord> & Pick<CompanyRecord, 'id' | 'code' | 'displayName' | 'folderName' | 'state' | 'access'>

function record(s: Seed): CompanyRecord {
  const fileName = s.fileName === undefined ? `${s.displayName}.qbw` : s.fileName
  return {
    candidateFiles: [],
    accessCheckedUtc: null,
    accessMessage: null,
    qbCompanyName: null,
    qbLegalName: null,
    matchNames: [],
    isDefault: false,
    rowVersion: 1,
    ...s,
    fileName,
    filePath: fileName ? companyFilePath(s.folderName, fileName) : null,
  }
}

export function buildCompanies(now = Date.now()): CompanyRecord[] {
  return [
    record({
      id: 1, code: '18', displayName: 'Takoma Park Grocery Store Inc', folderName: '18_Takoma Park Grocery Store Inc',
      state: 'active', access: 'approved', accessCheckedUtc: new Date(now - 60 * 60_000).toISOString(),
      qbCompanyName: 'Zemen Market', matchNames: ['Zemen Market'], isDefault: true,
    }),
    record({
      id: 2, code: '440', displayName: 'S & A Convenience Market LLC', folderName: '440',
      fileName: 'S & A Convenience Market LLC.qbw', state: 'active', access: 'needs-approval',
    }),
    record({
      id: 3, code: '7', displayName: 'Sunrise Liquors', folderName: '7', fileName: null,
      state: 'ambiguous', access: 'unchecked', candidateFiles: ['Sunrise Liquors.qbw', 'Sunrise Liquors 2024.qbw'],
    }),
    record({
      id: 4, code: '12', displayName: 'Harbor Deli', folderName: '12',
      state: 'missing', access: 'file-not-found', accessMessage: 'The company file was not found.',
    }),
  ]
}

interface CompanyLists {
  lists: QbLists
  accountTypes: Record<string, string>
  listSyncs: QbListSyncRun[]
}

/** Lists for the companies other than the default (whose lists stay in `mockDb.lists`). */
export function buildCompanyLists(now = Date.now()): Record<number, CompanyLists> {
  const MIN = 60_000
  const lists: QbLists = {
    accounts: ['SA Operating 7731', 'SA Card 0440'],
    vendors: ['Coastal Beverage Supply', 'Metro Tobacco Wholesale'],
    customers: ['Walk-in Customers'],
    syncedUtc: new Date(now - 25 * MIN).toISOString(),
    lastSync: null,
    nextSyncUtc: null,
  }
  const counts = { accounts: 2, vendors: 2, customers: 1 }
  const ok = (id: number, ago: number, trigger: 'schedule' | 'dashboard', current: boolean): QbListSyncRun => ({
    id,
    trigger,
    outcome: 'ok',
    reason: null,
    startedUtc: new Date(now - ago - 3000).toISOString(),
    finishedUtc: new Date(now - ago).toISOString(),
    requestedBy: null,
    message: 'The lists were synced from QuickBooks.',
    counts,
    current,
  })
  const listSyncs = [ok(2, 25 * MIN, 'schedule', true), ok(1, 180 * MIN, 'dashboard', false)]
  lists.lastSync = structuredClone(listSyncs[0])
  const empty = (): CompanyLists => ({
    lists: { accounts: [], vendors: [], customers: [], syncedUtc: null, lastSync: null, nextSyncUtc: null },
    accountTypes: {},
    listSyncs: [],
  })
  return {
    2: { lists, accountTypes: { 'SA Operating 7731': 'Bank', 'SA Card 0440': 'CreditCard' }, listSyncs },
    3: empty(),
    4: empty(),
  }
}
