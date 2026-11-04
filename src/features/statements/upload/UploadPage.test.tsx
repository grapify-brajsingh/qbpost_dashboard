import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import type { ExtractionCompany } from '@/api/schema'
import { mockControl, mockDb } from '@/mocks/db'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

afterEach(() => {
  vi.mocked(toast.info).mockClear()
})

const pdf = (name = 'chase-sep-2026.pdf') => new File(['%PDF-1.4\n% statement\n'], name, { type: 'application/pdf' })
const fileInput = () => document.querySelector<HTMLInputElement>('input[type="file"]')!
const cell = (row: number, field: string) => document.querySelector<HTMLElement>(`tr[data-row="${row}"] td[data-field="${field}"]`)!
const saveButton = () => screen.getByRole('button', { name: /Save statement|Saving…/ })

async function openUpload(as = 'u-editor') {
  mockControl.signInAs(as)
  const r = renderApp('/statements/upload')
  await screen.findByRole('heading', { level: 1, name: 'Upload a statement PDF' })
  return r
}

async function uploadAndReview(name = 'chase-sep-2026.pdf') {
  const r = await openUpload()
  await r.user.upload(fileInput(), pdf(name))
  await screen.findByRole('heading', { level: 2, name: name })
  return r
}

/** The PDF names the default company, so the name cells are open (an unmatched one locks them until a company is chosen). */
const MATCHED_DEFAULT: ExtractionCompany = {
  match: 'matched',
  printedName: 'ZEMEN MARKET',
  dbaName: null,
  companyId: 1,
  candidates: [{ id: 1, code: '18', displayName: 'Takoma Park Grocery Store Inc' }],
}

async function pickAccount(r: Awaited<ReturnType<typeof openUpload>>, row: number) {
  await r.user.click(cell(row, 'account'))
  await r.user.type(await screen.findByRole('combobox', { name: 'Account' }), 'chase check')
  await r.user.click(await screen.findByRole('option', { name: 'Chase Checking 4521' }))
  await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Account' })).not.toBeInTheDocument())
}

describe('who can upload', () => {
  it('a viewer sees no Upload PDF button, and the page is not found', async () => {
    mockControl.signInAs('u-viewer')
    const r = renderApp('/statements')
    await screen.findByRole('heading', { level: 1, name: 'Statements' })
    expect(screen.queryByRole('link', { name: 'Upload PDF' })).not.toBeInTheDocument()
    await r.router.navigate('/statements/upload')
    expect(await screen.findByRole('heading', { name: 'Page not found' })).toBeInTheDocument()
  })

  it('an editor opens it from the Statements page', async () => {
    mockControl.signInAs('u-editor')
    const r = renderApp('/statements')
    await r.user.click(await screen.findByRole('link', { name: 'Upload PDF' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Upload a statement PDF' })).toBeInTheDocument()
  })
})

describe('review and save', () => {
  beforeEach(() => {
    mockControl.nextMatch = structuredClone(MATCHED_DEFAULT)
  })

  it('shows the rows as read, blocks saving on empty required fields, and saves with the review edits', async () => {
    const r = await uploadAndReview()
    expect(screen.getByRole('textbox', { name: 'Reference' })).toHaveValue('chase-sep-2026')
    expect(screen.getByText('Not saved yet')).toBeInTheDocument()
    expect(screen.getByText('No control total')).toBeInTheDocument()
    expect(within(cell(2, 'account')).getByText('Empty')).toBeInTheDocument()
    expect(within(cell(5, 'payee')).getByText('Empty (optional)')).toBeInTheDocument()
    expect(screen.getByText(/2 empty required fields/)).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()

    await pickAccount(r, 2)
    await pickAccount(r, 9)
    expect(saveButton()).toBeEnabled()
    const before = mockDb.requests.length
    await r.user.click(saveButton())

    expect(await screen.findByRole('heading', { level: 1, name: 'chase-sep-2026.pdf' }, { timeout: 4000 })).toBeInTheDocument()
    expect(r.router.state.location.pathname).toMatch(/^\/statements\/\d+$/)
    expect(mockDb.requests).toHaveLength(before + 1)
    const saved = mockDb.requests[mockDb.requests.length - 1]
    expect(saved.versions.map((v) => v.note)).toEqual(['Read from chase-sep-2026.pdf', 'Reviewed before saving'])
    expect(saved.versions[1].changes).toHaveLength(2)
    expect(saved.versions[0].payload.controlTotal).toBeNull()
    expect(screen.getByText('Uploaded')).toBeInTheDocument()
  }, 15_000) // two combobox picks and a save: well over 5 s when the whole suite runs at once

  it('warns about a possible duplicate and still lets the user save', async () => {
    await uploadAndReview('dup-chase.pdf')
    const alert = screen.getByText('This may already be in the dashboard').closest('[role="alert"]') as HTMLElement
    expect(within(alert).getByRole('link', { name: 'SR-000001' })).toHaveAttribute('target', '_blank')
    expect(within(alert).getAllByText(/same reference/).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: 'Save statement' })).toBeInTheDocument()
  })

  it('Discard asks first, returns to the file picker and saves nothing', async () => {
    const r = await uploadAndReview()
    const before = mockDb.requests.length
    await r.user.click(screen.getByRole('button', { name: 'Discard' }))
    await r.user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Discard' }))
    expect(await screen.findByText(/Drop a PDF here/)).toBeInTheDocument()
    expect(mockDb.requests).toHaveLength(before)
  })

  it('an upload that was already saved goes to that statement', async () => {
    const r = await uploadAndReview()
    await pickAccount(r, 2)
    await pickAccount(r, 9)
    server.use(
      http.post('/api/v2/saved-requests', () =>
        HttpResponse.json(
          { type: 'https://qbautopost/problems/extraction-already-saved', title: 'Already saved', status: 409, code: 'extraction-already-saved', savedRequestId: 1, publicRef: 'SR-000001' },
          { status: 409, headers: { 'Content-Type': 'application/problem+json' } },
        ),
      ),
    )
    await r.user.click(saveButton())
    await waitFor(() => expect(r.router.state.location.pathname).toBe('/statements/1'))
    expect(toast.info).toHaveBeenCalledWith('This upload was already saved')
  })

  it('an expired upload says so and cannot be saved', async () => {
    const r = await uploadAndReview()
    await pickAccount(r, 2)
    await pickAccount(r, 9)
    mockControl.expireExtractions()
    await r.user.click(saveButton())
    expect(await screen.findByText('This upload has expired. Upload the PDF again.')).toBeInTheDocument()
    expect(saveButton()).toBeDisabled()
  })
})

describe('reading', () => {
  it.each([
    ['not-statement.pdf', "This PDF doesn't look like a bank or card statement.", false],
    ['scan.pdf', 'This PDF has no readable text. It may be a scan.', false],
    ['fail.pdf', "We couldn't read the statement this time.", true],
  ])('%s → "%s"', async (name, message, retry) => {
    const r = await openUpload()
    await r.user.upload(fileInput(), pdf(name))
    expect(await screen.findByText(message)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' }) !== null).toBe(retry)
    expect(screen.getByRole('button', { name: 'Choose another file' })).toBeInTheDocument()
  })

  it('reading not available offers no Try again', async () => {
    mockControl.nextExtraction = { status: 503, body: { code: 'extraction-unavailable', title: 'Unavailable' } }
    const r = await openUpload()
    await r.user.upload(fileInput(), pdf())
    expect(await screen.findByText("Reading PDFs isn't available right now.")).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
  })

  it('refuses a non-PDF before sending it', async () => {
    await openUpload()
    // A drop is not filtered by `accept`; userEvent filters by default, so turn that off to reach the check.
    await userEvent.setup({ applyAccept: false }).upload(fileInput(), new File(['hello'], 'notes.txt', { type: 'text/plain' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("That file isn't a PDF.")
  })

  it('Cancel while reading returns to the file picker', async () => {
    mockControl.extractDelayMs = 2000
    const r = await openUpload()
    await r.user.upload(fileInput(), pdf())
    expect(await screen.findByText(/Reading the statement/)).toBeInTheDocument()
    await r.user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(await screen.findByText(/Drop a PDF here/)).toBeInTheDocument()
  })
})

// R-16: the review editor shows the same lists status and Sync now.
describe('QuickBooks lists', () => {
  beforeEach(() => {
    mockControl.nextMatch = structuredClone(MATCHED_DEFAULT)
  })

  it('shows the lists status and Sync now in the review, and a sync updates the status', async () => {
    const r = await uploadAndReview()
    expect(await screen.findByText(/^Lists synced \d+ min ago$/)).toBeInTheDocument()
    await r.user.click(screen.getByRole('button', { name: 'Sync now' }))
    expect(await screen.findByText('Lists synced just now')).toBeInTheDocument()
  })
})

describe('company (R-19.5, R-20.1)', () => {
  const recordSaveBodies = () => {
    const bodies: Array<{ upload?: { extractionId?: string; companyId?: number } }> = []
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && new URL(request.url).pathname.endsWith('/saved-requests')) {
        void request.clone().json().then((b) => bodies.push(b))
      }
    })
    return bodies
  }
  afterEach(() => server.events.removeAllListeners())

  async function fillAndSave(r: Awaited<ReturnType<typeof openUpload>>, account?: { type: string; option: string }) {
    for (const row of [2, 9]) {
      if (!account) {
        await pickAccount(r, row)
        continue
      }
      await r.user.click(cell(row, 'account'))
      await r.user.type(await screen.findByRole('combobox', { name: 'Account' }), account.type)
      await r.user.click(await screen.findByRole('option', { name: account.option }))
      await waitFor(() => expect(screen.queryByRole('combobox', { name: 'Account' })).not.toBeInTheDocument())
    }
    await r.user.click(saveButton())
    await screen.findByRole('heading', { level: 1, name: 'chase-sep-2026.pdf' }, { timeout: 4000 })
  }

  it('a matched PDF shows the matched company and saves it as matched without sending companyId', async () => {
    mockControl.nextMatch = { match: 'matched', printedName: 'TAKOMA PARK GROCERY STORE INC', dbaName: 'ZEMEN MARKET', companyId: 1, candidates: [{ id: 1, code: '18', displayName: 'Takoma Park Grocery Store Inc' }] }
    const bodies = recordSaveBodies()
    const r = await uploadAndReview()
    expect(screen.getByText('Read from statement:', { exact: false })).toHaveTextContent('Read from statement: TAKOMA PARK GROCERY STORE INC')
    await fillAndSave(r)
    expect(mockDb.requests[mockDb.requests.length - 1]).toMatchObject({ companyId: 1, companySource: 'matched' })
    expect(bodies).toHaveLength(1)
    expect(bodies[0].upload).toEqual({ extractionId: expect.any(String) })
    expect(bodies[0].upload).not.toHaveProperty('companyId')
  }, 15_000)

  it('an unmatched PDF shows the picker; choosing 440 sends companyId 2 and the statement belongs to it', async () => {
    const bodies = recordSaveBodies()
    const r = await uploadAndReview()
    expect(screen.getByText('No business name was found on the statement')).toBeInTheDocument()
    // The companies load after the review shows: wait for the picker rather than assuming it is there.
    await r.user.selectOptions(await screen.findByRole('combobox', { name: 'Company' }), '2')
    // Company 440 has its own QuickBooks accounts: the editor switched to them.
    await fillAndSave(r, { type: 'SA Oper', option: 'SA Operating 7731' })
    expect(bodies[bodies.length - 1]).toMatchObject({ upload: { extractionId: expect.any(String), companyId: 2 } })
    expect(mockDb.requests[mockDb.requests.length - 1]).toMatchObject({ companyId: 2, companySource: 'chosen' })
  }, 15_000)

  it('an unmatched PDF locks the name cells with "Choose the company first" and reads no lists until a company is chosen', async () => {
    const lists: string[] = []
    server.events.on('request:start', ({ request }) => {
      const u = new URL(request.url)
      if (request.method === 'GET' && u.pathname.endsWith('/quickbooks/lists')) lists.push(u.search)
    })
    const r = await uploadAndReview()
    const picker = await screen.findByRole('combobox', { name: 'Company' })
    expect(await screen.findByText('Choose the company first')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sync now' })).not.toBeInTheDocument()
    for (const field of ['payee', 'account', 'lineAccount']) expect(cell(2, field)).toHaveAttribute('title', 'Choose the company first')
    await r.user.click(cell(2, 'account'))
    expect(screen.queryByRole('combobox', { name: 'Account' })).not.toBeInTheDocument()
    expect(lists).toHaveLength(0)

    await r.user.selectOptions(picker, '2')
    expect(screen.queryByText('Choose the company first')).not.toBeInTheDocument()
    await waitFor(() => expect(lists).toContain('?company=2'))
    expect(lists.every((q) => q === '?company=2')).toBe(true)
    await r.user.click(cell(2, 'account'))
    expect(await screen.findByRole('combobox', { name: 'Account' })).toBeInTheDocument()
  }, 15_000)

  it('an ambiguous PDF locks the name cells too', async () => {
    mockControl.nextMatch = {
      match: 'ambiguous', printedName: 'S', dbaName: null, companyId: null,
      candidates: [{ id: 2, code: '440', displayName: 'S & A Convenience Market LLC' }, { id: 1, code: '18', displayName: 'Takoma Park Grocery Store Inc' }],
    }
    await uploadAndReview()
    await screen.findByRole('combobox', { name: 'Company' })
    expect(await screen.findByText('Choose the company first')).toBeInTheDocument()
  })

  it('with only one company to choose, an unmatched PDF is not locked and uses the default lists', async () => {
    mockDb.companies.find((c) => c.id === 2)!.state = 'disabled'
    const r = await uploadAndReview()
    await screen.findByRole('combobox', { name: 'Company' })
    expect(await screen.findByText(/^Lists synced \d+ min ago$/)).toBeInTheDocument()
    expect(screen.queryByText('Choose the company first')).not.toBeInTheDocument()
    await pickAccount(r, 2)
  }, 15_000)

  it('saving without a company creates a statement on hold (rows without an account removed: their names are locked)', async () => {
    const bodies = recordSaveBodies()
    const r = await uploadAndReview()
    await screen.findByText('Choose the company first')
    for (const n of [3, 10]) {
      await r.user.click(screen.getByRole('button', { name: `Delete row ${n}` }))
      const confirm = await screen.findByRole('alertdialog')
      await r.user.click(within(confirm).getByRole('button', { name: 'Delete row' }))
      await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument())
    }
    await r.user.click(saveButton())
    await screen.findByRole('heading', { level: 1, name: 'chase-sep-2026.pdf' }, { timeout: 4000 })
    expect(bodies[0].upload).not.toHaveProperty('companyId')
    expect(mockDb.requests[mockDb.requests.length - 1]?.companyId ?? null).toBeNull()
    expect(await screen.findByRole('alert', { name: 'Company hold' })).toHaveTextContent('Choose the company before validating or posting.')
  }, 15_000)
})
