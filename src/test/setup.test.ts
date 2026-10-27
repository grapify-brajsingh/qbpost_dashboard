import { http, HttpResponse } from 'msw'
import { server } from '@/mocks/server'

describe('test setup: AbortSignal bridge', () => {
  it("keeps jsdom's AbortController usable with EventTarget listeners", () => {
    const target = new EventTarget()
    const controller = new AbortController()
    const seen = vi.fn()
    target.addEventListener('ping', seen, { signal: controller.signal })
    target.dispatchEvent(new Event('ping'))
    controller.abort()
    target.dispatchEvent(new Event('ping'))
    expect(seen).toHaveBeenCalledTimes(1)
  })

  it('forwards a jsdom signal to fetch, including an already-aborted one', async () => {
    server.use(http.get('/bridge', () => HttpResponse.json({ ok: true })))
    expect((await fetch('/bridge', { signal: new AbortController().signal })).ok).toBe(true)
    const aborted = new AbortController()
    aborted.abort(new Error('stop'))
    await expect(fetch('/bridge', { signal: aborted.signal })).rejects.toThrow('stop')
  })
})
