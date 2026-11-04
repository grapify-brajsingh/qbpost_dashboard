import { render, screen } from '@testing-library/react'
import { expect, test } from 'vitest'
import type { Company } from '@/api/schema'
import { buildCompanies } from '@/mocks/fixtures/companies'
import { CompanySelect } from './CompanySelect'

test('the select never grows wider than its container, so a long company name cannot push the page sideways', () => {
  const companies = buildCompanies().map((c) => ({ ...c, displayName: `${c.displayName} ${'Very long name '.repeat(8)}`, lists: null, waitingCount: 0 })) as Company[]
  render(<CompanySelect label="Company" companies={companies} value={undefined} onChange={() => {}} />)
  const select = screen.getByRole('combobox', { name: 'Company' })
  expect(select.closest('[data-slot="native-select-wrapper"]')).toHaveClass('max-w-full')
  expect(select).toHaveClass('w-full', 'min-w-0')
})
