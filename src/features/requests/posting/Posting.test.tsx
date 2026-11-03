import { act, renderHook, screen, waitFor, within } from '@testing-library/react'
import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { makeQueryClient } from '@/api/queryClient'
import { setAccessToken } from '@/api/session'
import { http, HttpResponse } from 'msw'
import { afterEach, vi } from 'vitest'
import { requestKeys, type RequestWithEtag } from '@/api/queries/requests'
import type { Txn } from '@/api/schema'
import { mockControl, mockDb } from '@/mocks/db'
import { toDetail } from '@/mocks/handlers/requestHelpers'
import { server } from '@/mocks/server'
import { renderApp } from '@/test/render'
import { postConfig, usePost } from './usePost'

const API = '/api/v2/saved-requests'
const DEFAULT_TIMEOUT = postConfig.timeoutMs

afterEach(() => {
  server.events.removeAllListeners()
  postConfig.timeoutMs = DEFAULT_TIMEOUT
  vi.useRealTimers()
})

const record = (id: number) => mockDb.requests.find((r) => r.id === id)!
const payloadOf = (id: number) => record(id).versions[record(id).versions.length - 1].payload

function countRequests() {
  const seen: { method: string; path: string; body: Promise<unknown>; ifMatch: string | null }[] = []
  server.events.on('request:start', ({ request }) => {
    const path = new URL(request.url).pathname
    const body = request.method === 'POST' ? request.clone().text().then((t) => (t ? JSON.parse(t) : undefined)) : Promise.resolve(undefined)
    seen.push({ method: request.method, path, body, ifMatch: request.headers.get('If-Match') })
  })
  const of = (method: string, path: string) => seen.filter((s) => s.method === method && s.path === path)
  return { count: (method: string, path: string) => of(method, path).length, of }
}

async function open(id = 1, as = 'u-admin') {
  mockControl.signInAs(as)
  const r = renderApp(`/statements/${id}`)
  await screen.findByRole('heading', { level: 1 })
  return r
}

const saveBar = () => screen.getByRole('region', { name: 'Save bar' })
const postButton = () => within(saveBar()).getByRole('button', { name: 'Post to QuickBooks' })
const result = () => screen.getByRole('status', { name: 'Post result' })

async function confirmPost(user: ReturnType<typeof renderApp>['user']) {
  await user.click(postButton())
  await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /^Post \d+ rows?$/ }))
}

describe('Post button and dialog', () => {
  test('Post is disabled with the tooltip "Save first" while the draft is dirty', async () => {
    const { user } = await open(1)
    const td = document.querySelector<HTMLElement>('tr[data-row="0"] td[data-field="memo"]')!
    await user.click(td)
    await user.keyboard('{Control>}a{/Control}changed{Enter}')
    await screen.findByText('1 unsaved change')
    expect(postButton()).toBeDisabled()
    await user.hover(postButton().parentElement!)
    expect((await screen.findAllByText('Save first')).length).toBeGreaterThan(0)
  })

  test('the dialog shows subject, rows, control total and validation state; a stale snapshot still allows posting', async () => {
    payloadOf(1).controlTotal = 4820.17
    record(1).validation.versionNumber = 2
    const { user } = await open(1)
    await user.click(postButton())
    const d = await screen.findByRole('dialog')
    expect(within(d).getByText('Chase statement – Aug 2026')).toBeInTheDocument()
    expect(within(d).getByText('12 rows')).toBeInTheDocument()
    expect(within(d).getByText('4,820.17')).toBeInTheDocument()
    expect(within(d).getByText(/Validation: OK/)).toBeInTheDocument()
    expect(within(d).getByText('Validation is out of date')).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: /^Post \d+ rows?$/ })).toBeEnabled()
  })

  test('the title and button carry the posting count and the skipped sentence appears only when rows are skipped', async () => {
    const { user } = await open(1)
    await user.click(postButton())
    const d = await screen.findByRole('dialog')
    expect(within(d).getByRole('heading', { name: 'Post 12 rows to QuickBooks?' })).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: 'Post 12 rows' })).toBeEnabled()
    expect(d).not.toHaveTextContent(/skipped/)
    expect(d).toHaveTextContent(/will post\./)
    await user.click(within(d).getByRole('button', { name: 'Cancel' }))
  })

  test("rows marked don't post are skipped: count, amount and sentence follow the saved payload", async () => {
    const rows = payloadOf(1).transactions as Txn[]
    rows[0].post = false
    rows[1].post = false
    const posting = rows.slice(2).reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0)
    const { user } = await open(1)
    await user.click(postButton())
    const d = await screen.findByRole('dialog')
    expect(within(d).getByRole('heading', { name: 'Post 10 rows to QuickBooks?' })).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: 'Post 10 rows' })).toBeInTheDocument()
    expect(d).toHaveTextContent("2 rows marked don't post are skipped.")
    expect(d).toHaveTextContent(`${(posting / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} will post.`)
  })

  test('another unposted push of the same statement is listed in an amber callout that opens it in a new tab', async () => {
    const reqs = countRequests()
    const { user } = await open(11)
    await user.click(postButton())
    const d = await screen.findByRole('dialog')
    expect(d).toHaveTextContent(/arrived at .* and isn't posted\. Make sure you're not posting the same statement twice\./)
    const openedEtag = `"${record(11).rowVersion}"`
    const link = within(d).getByRole('link', { name: /^Push / })
    expect(link).toHaveAttribute('href', '/statements/13')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    await user.click(within(d).getByRole('button', { name: /^Post \d+ rows?$/ }))
    await waitFor(() => expect(reqs.count('POST', `${API}/11/post`)).toBe(1))
    expect(reqs.of('POST', `${API}/11/post`)[0].ifMatch).toBe(openedEtag)
  })

  test('the callout wording follows the other push status (posting, partial, unknown)', async () => {
    record(13).status = 'posting'
    const { user } = await open(11)
    await user.click(postButton())
    const d = await screen.findByRole('dialog')
    expect(d).toHaveTextContent(/arrived at .* and is still posting\. Make sure you're not posting the same statement twice\./)
    expect(d).not.toHaveTextContent(/isn't posted/)
  })

  test('no callout when there is no other push', async () => {
    const { user } = await open(2)
    await user.click(postButton())
    expect(await screen.findByRole('dialog')).not.toHaveTextContent(/isn't posted/)
  })

  test('a duplicate needs "Yes, post anyway" and sends confirmDuplicate: true', async () => {
    const reqs = countRequests()
    const { user } = await open(5)
    await user.click(postButton())
    const d = await screen.findByRole('dialog')
    expect(within(d).getByText('Possible duplicate of SR-000001 (pending)')).toBeInTheDocument()
    const confirm = within(d).getByRole('button', { name: /^Post \d+ rows?$/ })
    expect(confirm).toBeDisabled()
    await user.click(within(d).getByRole('checkbox', { name: 'Yes, post anyway' }))
    expect(confirm).toBeEnabled()
    await user.click(confirm)
    await waitFor(() => expect(reqs.count('POST', `${API}/5/post`)).toBe(1))
    expect(await reqs.of('POST', `${API}/5/post`)[0].body).toEqual({ confirmDuplicate: true })
  })

  test('a 409 duplicate-unconfirmed response opens the same confirmation', async () => {
    const { user } = await open(1)
    // Flag it after the page loaded: the screen does not know yet.
    record(1).duplicate = { of: 5, reasons: ['same-payload'], acknowledgedBy: null }
    await confirmPost(user)
    const d = await screen.findByRole('dialog')
    expect(within(d).getByText('Possible duplicate of SR-000005 (pending)')).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: /^Post \d+ rows?$/ })).toBeDisabled()
    await user.click(within(d).getByRole('checkbox', { name: 'Yes, post anyway' }))
    expect(within(d).getByRole('button', { name: /^Post \d+ rows?$/ })).toBeEnabled()
  })

  test('after Confirm the button is disabled at once, progress shows, and a double-click sends exactly 1 POST', async () => {
    mockControl.nextPost = { status: 200, body: { status: 'posted' }, delayMs: 300 }
    const reqs = countRequests()
    const { user } = await open(1)
    await user.click(postButton())
    const confirm = within(await screen.findByRole('dialog')).getByRole('button', { name: /^Post \d+ rows?$/ })
    await user.dblClick(confirm)
    expect(postButton()).toBeDisabled()
    expect(screen.getByText(/Posting 12 rows to QuickBooks… this can take a few minutes/)).toBeInTheDocument()
    await user.click(postButton()).catch(() => {})
    await waitFor(() => expect(result()).toHaveTextContent('Posted'))
    expect(reqs.count('POST', `${API}/1/post`)).toBe(1)
    expect(reqs.of('POST', `${API}/1/post`)[0].ifMatch).toBe('"4"')
  })
})

test('the guard is synchronous: two post() calls in the same tick send 1 POST', async () => {
  mockControl.nextPost = { status: 200, body: { status: 'posted' }, delayMs: 0 }
  setAccessToken(mockControl.signInAs('u-admin'))
  const reqs = countRequests()
  const qc = makeQueryClient({ retry: false })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  const { result: hook } = renderHook(() => usePost('1'), { wrapper })
  await waitFor(() => expect(qc.getQueryData(requestKeys.detail('1'))).toBeDefined())
  const etag = qc.getQueryData<RequestWithEtag>(requestKeys.detail('1'))!.etag
  act(() => {
    hook.current.post({ etag })
    hook.current.post({ etag })
  })
  await waitFor(() => expect(hook.current.outcome?.kind).toBe('posted'))
  expect(reqs.count('POST', `${API}/1/post`)).toBe(1)
  setAccessToken(null)
})

test('a gateway error on the post reloads and watches, and never claims the result', async () => {
  server.use(http.post(`${API}/1/post`, () => new HttpResponse('<html>bad gateway</html>', { status: 502, headers: { 'Content-Type': 'text/html' } })))
  setAccessToken(mockControl.signInAs('u-admin'))
  const reqs = countRequests()
  const qc = makeQueryClient({ retry: false })
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  const { result: hook } = renderHook(() => usePost('1'), { wrapper })
  await waitFor(() => expect(qc.getQueryData(requestKeys.detail('1'))).toBeDefined())
  const etag = qc.getQueryData<RequestWithEtag>(requestKeys.detail('1'))!.etag
  act(() => hook.current.post({ etag }))
  await waitFor(() => expect(hook.current.outcome?.title).toMatch(/Lost contact|did not take the post/))
  expect(hook.current.outcome?.title).not.toMatch(/Couldn't reach/)
  expect(reqs.count('POST', `${API}/1/post`)).toBe(1)
  setAccessToken(null)
})

describe('outcomes', () => {
  test('200 posted → "Posted" banner with the postId; attempts are invalidated', async () => {
    mockControl.nextPost = { status: 200, body: { status: 'posted' }, delayMs: 0 }
    const { user, queryClient } = await open(1)
    const spy = vi.spyOn(queryClient, 'invalidateQueries')
    await confirmPost(user)
    await waitFor(() => expect(result()).toHaveTextContent('Posted'))
    expect(result()).toHaveTextContent('api-chase-4521-2026-08')
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ queryKey: requestKeys.attempts('1') }))
  })

  test('422 → "Nothing was sent" and the rows get data-problem from the response findings', async () => {
    const rows = payloadOf(1).transactions as Txn[]
    const validation = [1, 4, 7].map((i) => ({ index: i, externalId: rows[i].externalId, reason: 'unknown-vendor', detail: 'not in QuickBooks' }))
    mockControl.nextPost = { status: 422, body: { code: 'validation-held', title: 'Rows held', detail: 'Some rows cannot be posted. Nothing was sent.', validation }, delayMs: 0 }
    const { user } = await open(1)
    expect(document.querySelectorAll('tr[data-problem="true"]')).toHaveLength(0)
    await confirmPost(user)
    await waitFor(() => expect(result()).toHaveTextContent('Nothing was sent'))
    await waitFor(() => expect(document.querySelectorAll('tr[data-problem="true"]')).toHaveLength(3))
    for (const i of [1, 4, 7]) expect(document.querySelector(`tr[data-row="${i}"]`)).toHaveAttribute('data-problem', 'true')
  })

  test('200 partial → the banner lists the held rows and those rows get data-problem', async () => {
    const validation = [
      { index: 4, externalId: 'row-5', reason: 'quickbooks-rejected', detail: 'QuickBooks rejected the row' },
      { index: 9, externalId: 'row-10', reason: 'quickbooks-rejected' },
    ]
    mockControl.nextPost = { status: 200, body: { status: 'partial', postId: 'api-p', validation }, delayMs: 0 }
    const { user } = await open(1)
    await confirmPost(user)
    await waitFor(() => expect(result()).toHaveTextContent("Some rows posted, some didn't."))
    const items = within(within(result()).getByRole('list', { name: 'Held rows' })).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual([
      'Row 5 (row-5): quickbooks-rejected — QuickBooks rejected the row',
      'Row 10 (row-10): quickbooks-rejected',
    ])
    await waitFor(() => expect(document.querySelectorAll('tr[data-problem="true"]')).toHaveLength(2))
    for (const i of [4, 9]) expect(document.querySelector(`tr[data-row="${i}"]`)).toHaveAttribute('data-problem', 'true')
  })

  test('409 busy with Retry-After: 5 → disabled for 5 s, then re-enabled', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    mockControl.nextPost = { status: 409, body: { code: 'busy', title: 'QuickBooks is busy', retryAfterSeconds: 5 }, delayMs: 0 }
    const { user } = await open(1)
    await confirmPost(user)
    await waitFor(() => expect(result()).toHaveTextContent('QuickBooks is busy. Try again in 5 seconds'))
    await waitFor(() => expect(postButton()).toBeDisabled())
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    expect(postButton()).toBeDisabled()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })
    await waitFor(() => expect(postButton()).toBeEnabled())
  })

  test('409 already-posting → the detail reloads and a banner names who pressed Post', async () => {
    const reqs = countRequests()
    const { user } = await open(1)
    const getsBefore = reqs.count('GET', `${API}/1`)
    const r = record(1)
    r.status = 'posting'
    r.attempts.push({ id: 900, versionNumber: 3, outcome: 'in-progress', httpStatus: null, postId: null, counts: null, error: null, startedUtc: new Date().toISOString(), finishedUtc: null, startedBy: { id: 'u-editor', name: 'Eli Editor' } })
    await confirmPost(user)
    await waitFor(() => expect(result()).toHaveTextContent('Eli Editor pressed Post'))
    await waitFor(() => expect(reqs.count('GET', `${API}/1`)).toBeGreaterThan(getsBefore))
    expect(within(result()).getByRole('link', { name: 'See their attempt' })).toHaveAttribute('href', '/statements/1?sheet=1&sheetTab=results')
  })

  test('401 on post → exactly 1 POST, the session is refreshed, and the detail reloads', async () => {
    const reqs = countRequests()
    const { user } = await open(1)
    const refreshesBefore = reqs.count('POST', '/api/v2/auth/refresh')
    const getsBefore = reqs.count('GET', `${API}/1`)
    mockDb.session!.generation++ // the token on hand is now stale
    await confirmPost(user)
    await waitFor(() => expect(reqs.count('GET', `${API}/1`)).toBeGreaterThan(getsBefore))
    expect(reqs.count('POST', `${API}/1/post`)).toBe(1)
    expect(reqs.count('POST', '/api/v2/auth/refresh')).toBe(refreshesBefore + 1)
    expect(result()).toHaveTextContent('nothing was re-sent')
    expect(record(1).status).toBe('pending')
  })

  test('200 with request status unknown → a warning containing "may have posted"', async () => {
    mockControl.nextPost = { status: 200, body: { status: 'unknown', postId: 'api-x' }, delayMs: 0 }
    const { user } = await open(1)
    await confirmPost(user)
    await waitFor(() => expect(result()).toHaveTextContent('may have posted'))
  })

  test('without an ETag the post is not sent', async () => {
    // Serve the real record without its ETag header.
    server.use(http.get(`${API}/1`, () => HttpResponse.json(toDetail(record(1), 'admin'))))
    const reqs = countRequests()
    const { user } = await open(1)
    await confirmPost(user)
    expect(await screen.findByText("This request can't be posted right now — reload and try again.")).toBeInTheDocument()
    expect(reqs.count('POST', `${API}/1/post`)).toBe(0)
  })
})

describe('recovery', () => {
  test('timeout: keeps showing progress, polls, and shows "Posted" when the post finishes; never re-sends', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    postConfig.timeoutMs = 100
    mockControl.nextPost = { status: 200, body: { status: 'posted' }, delayMs: 700 }
    const reqs = countRequests()
    const { user } = await open(1)
    await confirmPost(user)
    await waitFor(() => expect(reqs.count('GET', `${API}/1`)).toBeGreaterThan(1))
    expect(screen.getByRole('status', { name: 'Posting progress' })).toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Post result' })).not.toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })
    await waitFor(() => expect(result()).toHaveTextContent('Posted'))
    expect(result()).toHaveTextContent('api-chase-4521-2026-08')
    expect(screen.queryByRole('status', { name: 'Posting progress' })).not.toBeInTheDocument()
    expect(reqs.count('POST', `${API}/1/post`)).toBe(1)
  })

  test('reopening a request that is posting shows progress, no Post button, then the success banner', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await open(6)
    expect(screen.getByRole('status', { name: 'Posting progress' })).toHaveTextContent('Posting 8 rows to QuickBooks')
    expect(screen.queryByRole('button', { name: 'Post to QuickBooks' })).not.toBeInTheDocument()
    const r = record(6)
    r.status = 'posted'
    r.postId = 'api-visa-8890-2026-08'
    Object.assign(r.attempts[0], { outcome: 'posted', httpStatus: 200, postId: r.postId, finishedUtc: new Date().toISOString() })
    r.rowVersion++
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000)
    })
    await waitFor(() => expect(result()).toHaveTextContent('Posted'))
    expect(result()).toHaveTextContent('api-visa-8890-2026-08')
    expect(screen.queryByRole('status', { name: 'Posting progress' })).not.toBeInTheDocument()
  })
})

describe('isolation between requests', () => {
  test('a held post on one request leaves no banner or marked rows on the duplicate it links to', async () => {
    // 12 and 5 are both pending at version 1; make 12 point at 5 as its duplicate.
    record(12).duplicate = { of: 5, reasons: ['same-reference'], acknowledgedBy: null }
    const rows = payloadOf(12).transactions as Txn[]
    const validation = [0, 1].map((i) => ({ index: i, externalId: rows[i].externalId, reason: 'unknown-vendor' }))
    mockControl.nextPost = { status: 422, body: { code: 'validation-held', title: 'Rows held', validation }, delayMs: 0 }
    const { user } = await open(12)
    await user.click(postButton())
    const d = await screen.findByRole('dialog')
    await user.click(within(d).getByRole('checkbox', { name: 'Yes, post anyway' }))
    await user.click(within(d).getByRole('button', { name: /^Post \d+ rows?$/ }))
    await waitFor(() => expect(result()).toHaveTextContent('Nothing was sent'))
    await waitFor(() => expect(document.querySelectorAll('tr[data-problem="true"]')).toHaveLength(2))

    await user.click(screen.getByRole('link', { name: 'Possible duplicate of SR-000005' }))
    await screen.findByRole('heading', { level: 1, name: 'Chase statement – Aug 2026 (resent)' })
    await waitFor(() => expect(document.querySelector('tr[data-row="11"]')).not.toBeNull())
    expect(screen.queryByRole('status', { name: 'Post result' })).not.toBeInTheDocument()
    expect(document.querySelectorAll('tr[data-problem="true"]')).toHaveLength(0)
    expect(postButton()).toBeEnabled()
  })

  test('leaving and coming back while the post is in flight keeps Post blocked and sends nothing more', async () => {
    mockControl.nextPost = { status: 200, body: { status: 'posted' }, delayMs: 800 }
    const reqs = countRequests()
    const { user, router } = await open(1)
    // The server below keeps answering with the record as it was before the post (a slow status flip).
    const before = toDetail(structuredClone(record(1)), 'admin')
    await confirmPost(user)
    await waitFor(() => expect(reqs.count('POST', `${API}/1/post`)).toBe(1))
    server.use(http.get(`${API}/1`, () => HttpResponse.json(before, { headers: { ETag: '"4"' } })))
    act(() => {
      void router.navigate('/statements')
    })
    await screen.findByRole('heading', { name: 'Statements' })
    act(() => {
      void router.navigate('/statements/1')
    })
    await screen.findByRole('heading', { level: 1, name: 'Chase statement – Aug 2026' })
    await waitFor(() => expect(reqs.count('GET', `${API}/1`)).toBeGreaterThan(1))
    expect(postButton()).toBeDisabled()
    expect(screen.getByRole('status', { name: 'Posting progress' })).toBeInTheDocument()
    await user.click(postButton()).catch(() => {})
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    // The first post finishes; nothing else was sent.
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Posting progress' })).not.toBeInTheDocument(), { timeout: 3000 })
    expect(reqs.count('POST', `${API}/1/post`)).toBe(1)
  })
})

describe('the version the dialog showed', () => {
  test('a reload while the dialog is open: the dialog says so and Confirm sends the ETag it showed (412)', async () => {
    const reqs = countRequests()
    const { user, queryClient } = await open(1)
    await user.click(postButton())
    const d = await screen.findByRole('dialog')
    // A colleague saves version N+1; a focus refetch brings it in under the open dialog.
    const r = record(1)
    r.versions.push({ ...structuredClone(r.versions[r.versions.length - 1]), number: r.versions[r.versions.length - 1].number + 1 })
    r.rowVersion++
    await act(() => queryClient.invalidateQueries({ queryKey: requestKeys.detail('1'), exact: true }))
    expect(await within(d).findByText('This request changed while this dialog was open.')).toBeInTheDocument()
    await user.click(within(d).getByRole('button', { name: /^Post \d+ rows?$/ }))
    await waitFor(() => expect(result()).toHaveTextContent('This changed since you opened it.'))
    expect(reqs.count('POST', `${API}/1/post`)).toBe(1)
    expect(reqs.of('POST', `${API}/1/post`)[0].ifMatch).toBe('"4"')
  })
})

describe('the version the dialog showed (counts)', () => {
  test('a reload with a different row set under the open dialog keeps the original title and button count', async () => {
    const { user, queryClient } = await open(1)
    await user.click(postButton())
    const d = await screen.findByRole('dialog')
    expect(within(d).getByRole('heading', { name: 'Post 12 rows to QuickBooks?' })).toBeInTheDocument()
    const r = record(1)
    const next = structuredClone(r.versions[r.versions.length - 1])
    ;(next.payload.transactions as Txn[]).splice(0, 4)
    next.number += 1
    r.versions.push(next)
    r.rowVersion++
    await act(() => queryClient.invalidateQueries({ queryKey: requestKeys.detail('1'), exact: true }))
    expect(await within(d).findByText('This request changed while this dialog was open.')).toBeInTheDocument()
    expect(within(d).getByRole('heading', { name: 'Post 12 rows to QuickBooks?' })).toBeInTheDocument()
    expect(within(d).getByRole('button', { name: 'Post 12 rows' })).toBeInTheDocument()
  })
})

describe('the version the dialog showed (rows and control total)', () => {
  test('Rows and Control total come from the version the dialog opened on, not the live request', async () => {
    const { user, queryClient } = await open(1)
    await user.click(postButton())
    const d = await screen.findByRole('dialog')
    const rowsBefore = within(d).getByText('Rows').nextElementSibling!.textContent!
    const totalBefore = within(d).getByText('Control total').nextElementSibling!.textContent!
    const r = record(1)
    const next = structuredClone(r.versions[r.versions.length - 1])
    ;(next.payload.transactions as Txn[]).splice(0, 4)
    next.payload.controlTotal = 1
    next.number += 1
    r.versions.push(next)
    r.rowVersion++
    await act(() => queryClient.invalidateQueries({ queryKey: requestKeys.detail('1'), exact: true }))
    expect(await within(d).findByText('This request changed while this dialog was open.')).toBeInTheDocument()
    expect(within(d).getByText('Rows').nextElementSibling).toHaveTextContent(rowsBefore)
    expect(within(d).getByText('Control total').nextElementSibling).toHaveTextContent(totalBefore)
  })
})

describe('watching after a timeout', () => {
  test('the first reload fails and the next succeeds: the outcome shows and only 1 POST was sent', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    postConfig.timeoutMs = 100
    mockControl.nextPost = { status: 200, body: { status: 'posted' }, delayMs: 700 }
    const reqs = countRequests()
    const { user } = await open(1)
    const getsBefore = reqs.count('GET', `${API}/1`)
    server.use(http.get(`${API}/1`, () => HttpResponse.error(), { once: true }))
    await confirmPost(user)
    await waitFor(() => expect(reqs.count('GET', `${API}/1`)).toBe(getsBefore + 1))
    expect(screen.getByRole('status', { name: 'Posting progress' })).toBeInTheDocument()
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3500)
    })
    await waitFor(() => expect(result()).toHaveTextContent('Posted'))
    expect(screen.queryByRole('status', { name: 'Posting progress' })).not.toBeInTheDocument()
    expect(reqs.count('POST', `${API}/1/post`)).toBe(1)
  })
})
