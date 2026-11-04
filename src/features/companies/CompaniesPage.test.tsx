import { screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { toast } from 'sonner'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import { mockControl } from '@/mocks/db'
import { buildCompanies } from '@/mocks/fixtures/companies'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'

const API = '/api/v2'

// The app's Toaster is mounted in main.tsx, outside the route table; assert on the calls instead.
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }))
beforeEach(() => {
  for (const f of Object.values(toast)) vi.mocked(f).mockClear()
})

function open(route = '/companies', as = 'u-admin') {
  mockControl.signInAs(as)
  return renderApp(route)
}

const companiesTable = () => screen.findByRole('table', { name: 'Companies' })

/** Opens a row's ⋯ menu and picks an item. */
async function pickAction(user: ReturnType<typeof open>['user'], company: string, item: string) {
  await user.click(await screen.findByRole('button', { name: `Actions for ${company}` }))
  await user.click(await screen.findByRole('menuitem', { name: item }))
}

const root = 'D:\\Accountexx Data\\Quickbook - Accounting File\\Quickbook - Accounting File'

describe('reading', () => {
  test.each(['u-viewer', 'u-editor', 'u-admin'])('%s sees Companies in the sidebar and the four companies', async (who) => {
    open('/companies', who)
    expect(await screen.findByRole('heading', { level: 1, name: 'Companies' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Companies' })).toHaveAttribute('href', '/companies')
    const table = await companiesTable()
    expect(within(table).getByText('Takoma Park Grocery Store Inc')).toBeInTheDocument()
    expect(within(table).getByText('Needs approval')).toBeInTheDocument()
    expect(within(table).getByText('2 files — choose one')).toBeInTheDocument()
    expect(within(table).getByText('Folder missing')).toBeInTheDocument()
    // Status is icon + word, never colour alone.
    expect(within(table).getByText('Folder missing').querySelector('svg')).not.toBeNull()
    // The full path is in a tooltip on the file name, which the keyboard can reach.
    expect(within(table).getByText('Takoma Park Grocery Store Inc.qbw')).toHaveAttribute('tabindex', '0')
    expect(screen.getByText(root)).toBeInTheDocument()
    expect(screen.getByText(/Last scanned/)).toBeInTheDocument()
  })

  test('only an admin gets Sync and the actions menu', async () => {
    const editor = open('/companies', 'u-editor')
    await companiesTable()
    expect(screen.queryByRole('button', { name: 'Sync' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Actions for/ })).not.toBeInTheDocument()
    editor.unmount()

    open('/companies', 'u-admin')
    await companiesTable()
    expect(screen.getByRole('button', { name: 'Sync' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Actions for Takoma Park Grocery Store Inc' })).toBeInTheDocument()
  })

  test('rows link to the company lists and waiting statements', async () => {
    open('/companies', 'u-viewer')
    const table = await companiesTable()
    const row = within(table).getByRole('row', { name: /Takoma Park Grocery Store Inc/ })
    expect(within(row).getByRole('link', { name: 'Lists' })).toHaveAttribute('href', '/lists?company=1')
    expect(within(row).getByRole('link', { name: /waiting for Takoma/ })).toHaveAttribute('href', '/statements?company=1')
  })
})

describe('sync', () => {
  test('Sync shows Scanning…, then the new company appears without a reload and the toast says what changed', async () => {
    mockControl.scanAdds = ['22_Harbor Deli East']
    mockControl.syncDelayMs = 150
    const { user } = open('/companies', 'u-admin')
    await user.click(await screen.findByRole('button', { name: 'Sync' }))
    expect(await screen.findByRole('button', { name: 'Scanning…' })).toBeDisabled()
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Found 1 new'))
    expect(await screen.findByText('Harbor Deli East')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Scanning…' })).not.toBeInTheDocument()
  })

  test('a failed scan shows the problem', async () => {
    mockControl.companyRootMissing = true
    const { user } = open('/companies', 'u-admin')
    // The unreachable root hides Sync in the header, so scan from the empty page state instead.
    server.use(
      http.get(`${API}/companies`, () =>
        HttpResponse.json({ rootFolder: root, rootConfigured: true, rootReachable: true, lastScanUtc: null, items: [] }),
      ),
    )
    await user.click(await screen.findByRole('button', { name: 'Sync' }))
    expect(await screen.findByText('Company folder unavailable')).toBeInTheDocument()
  })
})

describe('access', () => {
  test('a Needs approval company shows the approval help naming it', async () => {
    open('/companies', 'u-viewer')
    await companiesTable()
    const help = screen.getByRole('alert')
    expect(within(help).getByText(/S & A Convenience Market LLC/)).toBeInTheDocument()
    expect(within(help).getByText(/Yes, always; allow access even if QuickBooks is not running/)).toBeInTheDocument()
  })

  test('Check access with another file open says which files, once, no retry', async () => {
    mockControl.companyOpenElsewhere = 'S & A Convenience Market LLC.qbw'
    let checks = 0
    server.events.on('request:start', ({ request }) => {
      if (request.method === 'POST' && /\/companies\/1\/check$/.test(request.url)) checks++
    })
    const { user } = open('/companies', 'u-admin')
    await pickAction(user, 'Takoma Park Grocery Store Inc', 'Check access')
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        'QuickBooks has S & A Convenience Market LLC.qbw open — close it or open Takoma Park Grocery Store Inc.qbw, then check again.',
      ),
    )
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(checks).toBe(1)
    server.events.removeAllListeners()
  })

  test('Check access approves 440: the badge turns Approved and the help goes away', async () => {
    const { user } = open('/companies', 'u-admin')
    const table = await companiesTable()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    await pickAction(user, 'S & A Convenience Market LLC', 'Check access')
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('QuickBooks access approved for S & A Convenience Market LLC'))
    await waitFor(() => expect(within(table).queryByText('Needs approval')).not.toBeInTheDocument())
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  test('while one check runs, Check access is disabled for every company', async () => {
    let answer: () => void = () => {}
    const held = new Promise<void>((resolve) => {
      answer = resolve
    })
    server.use(
      http.post(`${API}/companies/:id/check`, async () => {
        await held
        return HttpResponse.json({ type: 'about:blank', title: 'Server error', status: 500 }, { status: 500, headers: { 'Content-Type': 'application/problem+json' } })
      }),
    )
    const { user } = open('/companies', 'u-admin')
    await pickAction(user, 'Takoma Park Grocery Store Inc', 'Check access')
    await user.click(await screen.findByRole('button', { name: 'Actions for S & A Convenience Market LLC' }))
    expect(await screen.findByRole('menuitem', { name: 'Check access' })).toHaveAttribute('aria-disabled', 'true')
    await user.keyboard('{Escape}')
    answer()
    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    await user.click(await screen.findByRole('button', { name: 'Actions for S & A Convenience Market LLC' }))
    expect(await screen.findByRole('menuitem', { name: 'Check access' })).not.toHaveAttribute('aria-disabled')
  })

  test('QuickBooks not running is a warning', async () => {
    mockControl.qbNotOpen = true
    const { user } = open('/companies', 'u-admin')
    await pickAction(user, 'S & A Convenience Market LLC', 'Check access')
    await waitFor(() => expect(toast.warning).toHaveBeenCalledWith("QuickBooks isn't running"))
  })
})

describe('page states', () => {
  const answer = (body: unknown, status = 200) => server.use(http.get(`${API}/companies`, () => HttpResponse.json(body as object, { status })))

  test('root unreachable shows the path and Try again; root not configured shows the setup message', async () => {
    mockControl.companyRootMissing = true
    const { user } = open('/companies', 'u-admin')
    expect(await screen.findByText("Can't reach the company folder")).toBeInTheDocument()
    // Once in the page description, once as the problem's detail.
    expect(screen.getAllByText(root)).toHaveLength(2)
    expect(screen.queryByRole('table', { name: 'Companies' })).not.toBeInTheDocument()

    const first = { ...buildCompanies()[0], lists: null, waitingCount: 0 }
    answer({ rootFolder: null, rootConfigured: false, rootReachable: true, lastScanUtc: null, items: [first] })
    await user.click(screen.getByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('No company folder is set.')).toBeInTheDocument()
    expect(screen.getByText('Companies:RootFolder')).toBeInTheDocument()
    expect(await companiesTable()).toBeInTheDocument()
    expect(screen.getByText('Takoma Park Grocery Store Inc')).toBeInTheDocument()
  })

  test('no companies shows the folder and Sync for an admin', async () => {
    answer({ rootFolder: root, rootConfigured: true, rootReachable: true, lastScanUtc: null, items: [] })
    open('/companies', 'u-admin')
    expect(await screen.findByText(`No company files found in ${root}.`)).toBeInTheDocument()
    expect(screen.getByText('Each company needs its own subfolder with a .qbw file.')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: 'Sync' })).toHaveLength(1)
  })

  test('an older API (404) says Companies need a newer API.', async () => {
    answer({ title: 'Not found', status: 404 }, 404)
    open('/companies', 'u-editor')
    expect(await screen.findByText('Companies need a newer API.')).toBeInTheDocument()
  })
})

describe('edits', () => {
  test('Edit match names adds a trimmed name, refuses a repeat, and saves with If-Match', async () => {
    let ifMatch: string | null = null
    let body: { matchNames?: string[] } = {}
    server.events.on('request:start', async ({ request }) => {
      if (request.method === 'PATCH') {
        ifMatch = request.headers.get('If-Match')
        body = await request.clone().json()
      }
    })
    const { user } = open('/companies', 'u-admin')
    await pickAction(user, 'Takoma Park Grocery Store Inc', 'Edit match names')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Statements whose printed business name equals one of these are assigned to this company.')).toBeInTheDocument()
    expect(within(dialog).getByText('Zemen Market')).toBeInTheDocument()

    const input = within(dialog).getByRole('textbox', { name: 'Add a name' })
    await user.type(input, '  Takoma Grocery ')
    await user.click(within(dialog).getByRole('button', { name: 'Add' }))
    expect(within(dialog).getByText('Takoma Grocery')).toBeInTheDocument()

    await user.type(input, 'zemen market')
    expect(within(dialog).getByRole('button', { name: 'Add' })).toBeDisabled()
    // A typed name not yet added would be silently dropped: Save waits until it is added or cleared.
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(within(dialog).getByText('Add this name or clear it before saving.')).toBeInTheDocument()
    await user.clear(input)
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
    await user.type(input, '   ')
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeEnabled()
    await user.clear(input)

    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(ifMatch).toBe('"1"')
    expect(body.matchNames).toEqual(['Zemen Market', 'Takoma Grocery'])
    server.events.removeAllListeners()
  })

  test('a name can be removed, and a 412 keeps the dialog open with the problem', async () => {
    server.use(
      http.patch(`${API}/companies/:id`, () =>
        HttpResponse.json({ title: 'Edited by someone else', status: 412, code: 'edited-by-someone-else' }, { status: 412 }),
      ),
    )
    const { user } = open('/companies', 'u-admin')
    await pickAction(user, 'Takoma Park Grocery Store Inc', 'Edit match names')
    const dialog = await screen.findByRole('dialog')
    await user.click(within(dialog).getByRole('button', { name: 'Remove Zemen Market' }))
    expect(within(dialog).queryByText('Zemen Market')).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    expect(await within(dialog).findByText('Edited by someone else')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  test('Choose file saves the picked candidate and Sunrise Liquors becomes active', async () => {
    const { user } = open('/companies', 'u-admin')
    const table = await companiesTable()
    await pickAction(user, 'Sunrise Liquors', 'Choose file')
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('button', { name: 'Save' })).toBeDisabled()
    await user.click(within(dialog).getByRole('radio', { name: 'Sunrise Liquors 2024.qbw' }))
    await user.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    await waitFor(() => expect(within(table).getByText('Sunrise Liquors 2024.qbw')).toBeInTheDocument())
    expect(within(table).queryByText('2 files — choose one')).not.toBeInTheDocument()
  })

  test('Disable greys a company and Enable brings it back', async () => {
    const { user } = open('/companies', 'u-admin')
    const table = await companiesTable()
    await pickAction(user, 'S & A Convenience Market LLC', 'Disable')
    expect(await within(table).findByText('Disabled')).toBeInTheDocument()
    expect(within(table).getByText('Disabled').querySelector('svg')).not.toBeNull()
    await pickAction(user, 'S & A Convenience Market LLC', 'Enable')
    await waitFor(() => expect(within(table).queryByText('Disabled')).not.toBeInTheDocument())
  })
})

describe('navigation', () => {
  test('Ctrl K lists Companies', async () => {
    const { user } = open('/companies', 'u-viewer')
    await companiesTable()
    await user.keyboard('{Control>}k{/Control}')
    expect(await screen.findByRole('option', { name: 'Companies' })).toBeInTheDocument()
  })
})
