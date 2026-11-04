import { describe, expect, test } from 'vitest'
import { ApiError } from '@/api/problem'
import type { CompaniesResponse, Company, CompanyScanResult } from '@/api/schema'
import {
  accessView,
  assignableCompanies,
  checkAccessToast,
  cleanMatchName,
  companyLabel,
  defaultCompanyId,
  fileText,
  isCompanyReady,
  rootUnreachableError,
  scanToastText,
  sortCompanies,
} from './companiesView'

let nextId = 1
function company(o: Partial<Company> = {}): Company {
  const id = o.id ?? nextId++
  return {
    id,
    code: String(id),
    displayName: `Company ${id}`,
    folderName: String(id),
    fileName: `c${id}.qbw`,
    filePath: `D:\\root\\${id}\\c${id}.qbw`,
    state: 'active',
    candidateFiles: [],
    access: 'approved',
    accessCheckedUtc: null,
    accessMessage: null,
    qbCompanyName: null,
    qbLegalName: null,
    matchNames: [],
    isDefault: false,
    rowVersion: 1,
    lists: null,
    waitingCount: 0,
    ...o,
  }
}
const scan = (o: Partial<CompanyScanResult> = {}): CompanyScanResult => ({
  added: 0,
  updated: 0,
  missing: 0,
  ambiguous: 0,
  noCompanyFile: [],
  items: [],
  ...o,
})
const apiError = (status: number, p: Record<string, unknown>) =>
  new ApiError({ title: 'Problem', status, ...p } as ConstructorParameters<typeof ApiError>[0], new Headers())

test('companyLabel and fileText', () => {
  expect(companyLabel({ code: '18', displayName: 'Takoma Park Grocery Store Inc' })).toBe('18 · Takoma Park Grocery Store Inc')
  expect(companyLabel({ code: null, displayName: 'Sunrise Liquors' })).toBe('Sunrise Liquors')
  expect(fileText(company({ state: 'ambiguous', candidateFiles: ['a.qbw', 'b.qbw'] }))).toBe('2 files — choose one')
  expect(fileText(company({ fileName: 'x.qbw' }))).toBe('x.qbw')
  expect(fileText(company({ fileName: null, state: 'missing' }))).toBe('—')
})

test('scanToastText', () => {
  expect(scanToastText(scan({ added: 2, missing: 1 }))).toBe('Found 2 new, 1 missing')
  expect(scanToastText(scan({}))).toBe('No changes')
})

test('check access: open elsewhere names both files, or the needed one when openFile is unknown', () => {
  expect(
    checkAccessToast(
      apiError(409, { code: 'company-file-open-elsewhere', openFile: 'S & A Convenience Market LLC.qbw', neededFile: 'Takoma Park Grocery Store Inc.qbw' }),
    ),
  ).toEqual({
    level: 'error',
    text: 'QuickBooks has S & A Convenience Market LLC.qbw open — close it or open Takoma Park Grocery Store Inc.qbw, then check again.',
  })
  expect(checkAccessToast(apiError(409, { code: 'company-file-open-elsewhere', neededFile: 'Takoma Park Grocery Store Inc.qbw' })).text).toBe(
    'Another company file is open in QuickBooks — close it or open Takoma Park Grocery Store Inc.qbw, then check again.',
  )
  expect(checkAccessToast(apiError(503, { code: 'quickbooks-not-open' }))).toEqual({ level: 'warning', text: "QuickBooks isn't running" })
  expect(checkAccessToast(apiError(503, { code: 'company-file-unavailable', neededFile: 'Takoma.qbw' }))).toEqual({
    level: 'error',
    text: "QuickBooks couldn't open Takoma.qbw. Check that QuickBooks can open it, then check again.",
  })
  expect(checkAccessToast(apiError(503, { code: 'company-file-unavailable' })).text).toContain('the company file')
  // M17 5.1: the file was re-pointed while QuickBooks answered.
  expect(checkAccessToast(apiError(412, { code: 'edited-by-someone-else', rowVersion: 3 }))).toEqual({
    level: 'warning',
    text: 'This company changed while QuickBooks was checking it. The list is reloaded; check again.',
  })
  expect(checkAccessToast(apiError(500, { title: 'Boom' }))).toEqual({ level: 'error', text: 'Boom' })
})

test('check access: each answer from the API', () => {
  const name = 'S & A Convenience Market LLC'
  expect(checkAccessToast(company({ displayName: name, access: 'approved' }))).toEqual({
    level: 'success',
    text: `QuickBooks access approved for ${name}`,
  })
  expect(checkAccessToast(company({ displayName: name, access: 'needs-approval' }))).toEqual({
    level: 'warning',
    text: `QuickBooks hasn't approved ${name} yet. Follow the steps above, then check again.`,
  })
  expect(checkAccessToast(company({ access: 'file-not-found', fileName: 'x.qbw' }))).toEqual({
    level: 'error',
    text: "x.qbw wasn't found. Sync the folder, then check again.",
  })
  expect(checkAccessToast(company({ access: 'error', accessMessage: null })).text).toBe('QuickBooks could not check this file.')
  expect(checkAccessToast(company({ access: 'error', accessMessage: 'Denied' })).text).toBe('Denied')
  expect(checkAccessToast(new TypeError('x')).level).toBe('error')
})

test('cleanMatchName trims, refuses blanks and case-insensitive repeats', () => {
  expect(cleanMatchName('  Zemen Market ', [])).toBe('Zemen Market')
  expect(cleanMatchName('   ', [])).toBeNull()
  expect(cleanMatchName('zemen market', ['Zemen Market'])).toBeNull()
  expect(cleanMatchName(' ZEMEN MARKET ', ['Zemen Market'])).toBeNull()
})

test('sortCompanies puts missing and disabled last; assignableCompanies keeps active, firstIds first', () => {
  const a = company({ id: 1, code: '18', displayName: 'B' })
  const b = company({ id: 2, code: '7', displayName: 'A' })
  const c = company({ id: 3, code: '12', displayName: 'C', state: 'missing' })
  const d = company({ id: 4, code: '3', displayName: 'D', state: 'disabled' })
  const e = company({ id: 5, code: null, displayName: 'E' })
  expect(sortCompanies([a, c, d, e, b]).map((x) => x.id)).toEqual([2, 1, 5, 4, 3])
  expect(assignableCompanies([a, b, c, d, e]).map((x) => x.id)).toEqual([2, 1, 5])
  expect(assignableCompanies([a, b, c, d, e], [5, 1]).map((x) => x.id)).toEqual([5, 1, 2])
  expect(assignableCompanies([a, b], [99]).map((x) => x.id)).toEqual([2, 1])
})

test('isCompanyReady, defaultCompanyId, accessView, rootUnreachableError', () => {
  expect(isCompanyReady({ state: 'active', access: 'approved' })).toBe(true)
  expect(isCompanyReady({ state: 'active', access: 'needs-approval' })).toBe(false)
  expect(isCompanyReady({ state: 'disabled', access: 'approved' })).toBe(false)
  const r: CompaniesResponse = { rootFolder: 'D:\\r', rootConfigured: true, rootReachable: true, lastScanUtc: null, items: [company({ id: 9, isDefault: true })] }
  expect(defaultCompanyId(r)).toBe(9)
  expect(defaultCompanyId(null)).toBeUndefined()
  expect(accessView('file-not-found')).toMatchObject({ label: 'File missing', variant: 'danger' })
  expect(accessView('unchecked')).toMatchObject({ label: 'Not checked', variant: 'muted' })
  expect(rootUnreachableError('D:\\r').problem).toEqual({ title: "Can't reach the company folder", status: 503, detail: 'D:\\r' })
})

describe('accessView words', () => {
  test.each([
    ['approved', 'Approved', 'success'],
    ['needs-approval', 'Needs approval', 'warning'],
    ['unchecked', 'Not checked', 'muted'],
    ['error', 'Error', 'danger'],
  ] as const)('%s', (a, label, variant) => expect(accessView(a)).toMatchObject({ label, variant }))
})
