// R-18: the companies the API can book statements to, the folder scan, the access check and the admin edits.
import { http, HttpResponse } from 'msw'
import type { Actor, AuditAction, Company, CompanyPatch, CompanyRef, CompanyScanResult } from '@/api/schema'
import { mockControl, mockDb } from '../db'
import { companyFilePath, type CompanyRecord } from '../fixtures/companies'
import type { MockUser } from '../fixtures/users'
import { actorOf, API, authenticate, nowUtc, parseIfMatch, problem, readJson } from './common'

export const findCompany = (id: number): CompanyRecord | undefined => mockDb.companies.find((c) => c.id === id)

export function companyRef(id: number | null): CompanyRef | null {
  const c = id === null ? undefined : findCompany(id)
  return c ? { id: c.id, code: c.code, displayName: c.displayName } : null
}

export const isReady = (c: CompanyRecord): boolean => c.state === 'active' && c.access === 'approved'

/** Company 1 keeps its lists in the top-level mock tables; the others have their own. */
function syncsOf(id: number) {
  return id === 1 ? mockDb.listSyncs : (mockDb.companyLists[id]?.listSyncs ?? [])
}

export function toCompany(c: CompanyRecord): Company {
  const newest = syncsOf(c.id)[0]
  return {
    ...c,
    lists: newest ? { syncedUtc: newest.finishedUtc, outcome: newest.outcome } : null,
    waitingCount: mockDb.requests.filter((r) => r.status === 'pending' && r.companyId === c.id).length,
  }
}

export function recordCompanyAudit(action: AuditAction, user: MockUser | Actor, companyId: number | null, detail: Record<string, unknown>) {
  const actor = 'displayName' in user ? actorOf(user) : user
  mockDb.companyAudit.push({ id: mockDb.counters.audit++, action, atUtc: nowUtc(), actor, companyId, detail })
}

const allCompanies = () => [...mockDb.companies].sort((a, b) => a.id - b.id).map(toCompany)

export const companyHandlers = [
  http.get(`${API}/companies`, ({ request }) => {
    const auth = authenticate(request, 'lists:read')
    if ('error' in auth) return auth.error
    const { rootFolder, lastScanUtc } = mockDb.companyRoot
    return HttpResponse.json({
      rootFolder,
      rootConfigured: rootFolder !== null,
      rootReachable: !mockControl.companyRootMissing,
      lastScanUtc,
      items: allCompanies(),
    })
  }),

  http.post(`${API}/companies/scan`, async ({ request }) => {
    const auth = authenticate(request, 'requests:admin')
    if ('error' in auth) return auth.error
    if (mockControl.syncDelayMs > 0) await mockControl.sleep(mockControl.syncDelayMs)
    const { rootFolder } = mockDb.companyRoot
    if (mockControl.companyRootMissing || rootFolder === null) {
      return problem(503, 'company-root-unavailable', 'Company folder unavailable', rootFolder ?? 'No company folder is set.')
    }
    let added = 0
    for (const folderName of mockControl.scanAdds) {
      if (mockDb.companies.some((c) => c.folderName === folderName)) continue
      const m = /^(\d+)_(.+)$/.exec(folderName)
      const displayName = m ? m[2] : folderName
      const fileName = `${displayName}.qbw`
      mockDb.companies.push({
        id: Math.max(0, ...mockDb.companies.map((c) => c.id)) + 1,
        code: m ? m[1] : null,
        displayName,
        folderName,
        fileName,
        filePath: companyFilePath(folderName, fileName),
        state: 'active',
        candidateFiles: [],
        access: 'unchecked',
        accessCheckedUtc: null,
        accessMessage: null,
        qbCompanyName: null,
        qbLegalName: null,
        matchNames: [],
        isDefault: false,
        rowVersion: 1,
      })
      added++
    }
    mockControl.scanAdds = []
    mockDb.companyRoot.lastScanUtc = nowUtc()
    const body: CompanyScanResult = { added, updated: 0, missing: 0, ambiguous: 0, noCompanyFile: [], items: allCompanies() }
    recordCompanyAudit('companies-scanned', auth.user, null, { added, updated: 0, missing: 0, ambiguous: 0, noCompanyFile: [] })
    return HttpResponse.json(body)
  }),

  http.post(`${API}/companies/:id/check`, ({ request, params }) => {
    const auth = authenticate(request, 'requests:admin')
    if ('error' in auth) return auth.error
    const c = findCompany(Number(params.id))
    if (!c) return problem(404, 'not-found', 'Not found', 'Company was not found.')
    // The API's order (M17 5.1): a company with no file to open is refused first, then the file being re-pointed, then
    // QuickBooks not running (only when the file exists), then the session: another file open, or one that won't open.
    if (c.state !== 'active') {
      return problem(409, 'company-not-ready', 'Company not ready', 'Choose the company file or enable the company first.', {
        state: c.state,
        access: c.access,
      })
    }
    if (mockControl.companyChangedDuringCheck) {
      return problem(412, 'edited-by-someone-else', 'Edited by someone else', 'The company changed since you loaded it. Reload it and try again. Nothing was changed.', {
        rowVersion: c.rowVersion,
      })
    }
    if (mockControl.qbNotOpen && !mockControl.companyFileGone) {
      return problem(503, 'quickbooks-not-open', 'QuickBooks is not open', 'QuickBooks is not running in this session, and this app never starts it.')
    }
    const open = mockControl.companyOpenElsewhere
    if (open !== null && open !== c.fileName) {
      return problem(409, 'company-file-open-elsewhere', 'Another company file is open', `QuickBooks has ${open} open.`, {
        openFile: open,
        neededFile: c.fileName,
      })
    }
    if (mockControl.companyFileUnavailable) {
      return problem(503, 'company-file-unavailable', 'Company file unavailable', `QuickBooks could not open ${c.fileName}.`, {
        neededFile: c.fileName,
      })
    }
    if (mockControl.companyFileGone) {
      c.access = 'file-not-found'
      c.accessMessage = 'The company file was not found.'
    } else {
      c.access = 'approved'
      c.accessMessage = null
    }
    c.accessCheckedUtc = nowUtc()
    c.rowVersion += 1
    recordCompanyAudit('company-checked', auth.user, c.id, { companyId: c.id, access: c.access })
    return HttpResponse.json(toCompany(c))
  }),

  http.patch(`${API}/companies/:id`, async ({ request, params }) => {
    const auth = authenticate(request, 'requests:admin')
    if ('error' in auth) return auth.error
    const c = findCompany(Number(params.id))
    if (!c) return problem(404, 'not-found', 'Not found', 'Company was not found.')
    const ifMatch = parseIfMatch(request)
    if (ifMatch === undefined) return problem(428, 'precondition-required', 'Precondition required', 'Send If-Match with the version you saw.')
    if (ifMatch !== c.rowVersion) return problem(412, 'edited-by-someone-else', 'Edited by someone else', 'Reload the company and try again.', { rowVersion: c.rowVersion })
    const body = ((await readJson(request)) ?? {}) as CompanyPatch
    // Like the API's audit detail: only what changed, under the same names.
    const detail: Record<string, unknown> = { companyId: c.id }
    const bad = (detail: string) => problem(400, 'invalid-request', 'Invalid request', detail)
    if (body.matchNames !== undefined && (!Array.isArray(body.matchNames) || body.matchNames.some((n) => typeof n !== 'string'))) {
      return bad('matchNames must be a list of names.')
    }
    if (body.filePath === undefined && body.disabled === undefined && body.matchNames === undefined) {
      return bad('Send at least one of matchNames, filePath or disabled.')
    }
    if (body.filePath !== undefined) {
      const name = c.candidateFiles.find((f) => f === body.filePath || companyFilePath(c.folderName, f) === body.filePath)
      if (!name) return problem(400, 'invalid-request', 'Invalid request', "filePath is not one of the company's candidate files")
      c.fileName = name
      c.filePath = companyFilePath(c.folderName, name)
      c.candidateFiles = []
      c.state = 'active'
      // The file changed, so an earlier access check says nothing about it.
      c.access = 'unchecked'
      c.accessCheckedUtc = null
      c.accessMessage = null
      detail.filePath = c.filePath
      detail.state = 'active'
    }
    if (body.disabled !== undefined) {
      // Re-enabling returns to what the scan found: no chosen file means ambiguous, a missing file stays missing.
      c.state = body.disabled ? 'disabled' : c.fileName === null ? 'ambiguous' : c.access === 'file-not-found' ? 'missing' : 'active'
      detail.state = c.state
    }
    if (body.matchNames !== undefined) {
      c.matchNames = [...body.matchNames]
      detail.matchNames = c.matchNames
    }
    c.rowVersion += 1
    recordCompanyAudit('company-updated', auth.user, c.id, detail)
    return HttpResponse.json(toCompany(c))
  }),
]
