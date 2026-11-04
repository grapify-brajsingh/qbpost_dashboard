import { screen, within } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'
import type { Company, ExtractionCompany } from '@/api/schema'
import { buildCompanies } from '@/mocks/fixtures/companies'
import { renderWithProviders } from '@/test/render'
import { CompanyBlock } from './CompanyBlock'

const all = buildCompanies().map((c) => ({ ...c, lists: null, waitingCount: 0 })) as Company[]
const takoma = { id: 1, code: '18', displayName: 'Takoma Park Grocery Store Inc' }
const sunrise = { id: 3, code: '7', displayName: 'Sunrise Liquors' }
// Sunrise is "ambiguous" (not active) in the fixtures, so make it assignable for the ordering test.
const companies = all.map((c) => (c.id === 3 ? { ...c, state: 'active' as const } : c))

const matched: ExtractionCompany = { match: 'matched', printedName: 'TAKOMA PARK GROCERY STORE INC', dbaName: 'ZEMEN MARKET', companyId: 1, candidates: [takoma] }
const ambiguous: ExtractionCompany = { match: 'ambiguous', printedName: 'SUNRISE', dbaName: null, companyId: null, candidates: [sunrise, takoma] }
const none = (printedName: string | null): ExtractionCompany => ({ match: 'none', printedName, dbaName: null, companyId: null, candidates: [] })

const show = (match: ExtractionCompany | undefined, onChange = vi.fn()) =>
  renderWithProviders(<CompanyBlock match={match} companies={companies} value={undefined} onChange={onChange} />)

describe('CompanyBlock', () => {
  test('matched: shows the company and what was read, Change opens the select', async () => {
    const { user } = show(matched)
    expect(screen.getByText('Takoma Park Grocery Store Inc')).toBeInTheDocument()
    expect(screen.getByText(/Read from statement:/)).toHaveTextContent('Read from statement: TAKOMA PARK GROCERY STORE INC')
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(screen.getByRole('combobox', { name: 'Company' })).toBeInTheDocument()
  })

  test('ambiguous: candidates first and "More than one company matches"', () => {
    show(ambiguous)
    expect(screen.getByText('More than one company matches')).toBeInTheDocument()
    const options = within(screen.getByRole('combobox', { name: 'Company' })).getAllByRole('option').map((o) => o.textContent)
    expect(options).toEqual(['Choose a company', '7 · Sunrise Liquors', '18 · Takoma Park Grocery Store Inc', '440 · S & A Convenience Market LLC'])
    expect(screen.getByText('Optional. Without a company the statement waits until someone chooses one.')).toBeInTheDocument()
  })

  test('none: printed name sentence, or the no-name sentence', () => {
    const first = show(none('ACME CORP'))
    expect(screen.getByText(/No company matched the printed name/)).toHaveTextContent('No company matched the printed name ACME CORP')
    expect(screen.getByRole('combobox', { name: 'Company' })).toBeInTheDocument()
    first.unmount()
    show(none(null))
    expect(screen.getByText('No business name was found on the statement')).toBeInTheDocument()
  })

  test('choosing reports the id', async () => {
    const onChange = vi.fn()
    const { user } = show(none(null), onChange)
    await user.selectOptions(screen.getByRole('combobox', { name: 'Company' }), '2')
    expect(onChange).toHaveBeenCalledWith(2)
  })

  test('no company block on an older API (match undefined)', () => {
    show(undefined)
    expect(screen.queryByText('Company')).not.toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  })
})
