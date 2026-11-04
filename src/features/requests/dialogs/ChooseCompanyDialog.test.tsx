import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { afterEach, vi } from 'vitest'
import { toast } from 'sonner'
import type { Company, RequestDetail } from '@/api/schema'
import { buildCompanies } from '@/mocks/fixtures/companies'
import { mockDb } from '@/mocks/db'
import { toDetail } from '@/mocks/handlers/requestHelpers'
import { server } from '@/mocks/server'
import { renderWithProviders } from '@/test/render'
import { ChooseCompanyDialog } from './ChooseCompanyDialog'

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))

afterEach(() => server.events.removeAllListeners())

const companies: Company[] = buildCompanies().map((c) => ({ ...c, lists: null, waitingCount: 0 }))

function request(over: Partial<RequestDetail> = {}): RequestDetail {
  return { ...toDetail(mockDb.requests.find((r) => r.id === 14)!, 'editor'), ...over }
}

function show(r: RequestDetail, onOpenChange = vi.fn()) {
  const out = renderWithProviders(<ChooseCompanyDialog open onOpenChange={onOpenChange} request={r} etag='"7"' companies={companies} />)
  return { ...out, onOpenChange }
}

const optionTexts = () => within(screen.getByRole('combobox', { name: 'Company' })).getAllByRole('option').map((o) => o.textContent)

test('lists active companies only, match candidates first, and says Validation will be cleared when validated', () => {
  const candidates = [2]
  const validated = request({
    companyMatch: { match: 'ambiguous', printedName: 'S & A', dbaName: null, candidates },
    validationSummary: { state: 'held', problemCount: 1, validatedUtc: '2026-10-20T09:00:00Z', versionNumber: 1 },
  })
  const first = show(validated)
  expect(screen.getByRole('heading', { name: 'Choose company' })).toBeInTheDocument()
  expect(optionTexts()).toEqual(['Choose a company', '440 · S & A Convenience Market LLC', '18 · Takoma Park Grocery Store Inc'])
  expect(screen.queryByRole('option', { name: /Sunrise Liquors/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('option', { name: /Harbor Deli/ })).not.toBeInTheDocument()
  expect(screen.getByText('Validation will be cleared')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Assign company' })).toBeDisabled()
  first.unmount()

  show(request({ companyMatch: null, validationSummary: { state: 'none', problemCount: 0, validatedUtc: null, versionNumber: null } }))
  expect(optionTexts()).toEqual(['Choose a company', '18 · Takoma Park Grocery Store Inc', '440 · S & A Convenience Market LLC'])
  expect(screen.queryByText('Validation will be cleared')).not.toBeInTheDocument()
})

test('sends If-Match with the ETag and companyId; a 412 keeps the dialog open with the stale message', async () => {
  const sent: { ifMatch: string | null; body: unknown }[] = []
  server.use(
    http.post('/api/v2/saved-requests/14/company', async ({ request: req }) => {
      sent.push({ ifMatch: req.headers.get('If-Match'), body: await req.json() })
      return HttpResponse.json(
        { type: 'about:blank', title: 'Precondition Failed', status: 412, detail: 'The request changed.' },
        { status: 412, headers: { 'Content-Type': 'application/problem+json' } },
      )
    }),
  )
  const { user, onOpenChange } = show(request())
  await user.selectOptions(screen.getByRole('combobox', { name: 'Company' }), '18 · Takoma Park Grocery Store Inc')
  const assign = screen.getByRole('button', { name: 'Assign company' })
  expect(assign).toBeEnabled()
  await user.click(assign)
  const alert = await screen.findByRole('alert')
  expect(alert).toHaveTextContent('This changed since you opened it.')
  expect(alert).toHaveTextContent('The latest version was reloaded.')
  expect(sent).toEqual([{ ifMatch: '"7"', body: { companyId: 1 } }])
  expect(screen.getByRole('dialog', { name: 'Choose company' })).toBeInTheDocument()
  expect(onOpenChange).not.toHaveBeenCalled()
  expect(toast.success).not.toHaveBeenCalled()
  await waitFor(() => expect(assign).toBeEnabled())
})
