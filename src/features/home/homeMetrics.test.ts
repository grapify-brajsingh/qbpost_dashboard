import type { RequestSummary } from '@/api/schema'
import {
  ageBuckets,
  auditHref,
  bucketEvents,
  bucketSeries,
  delta,
  firstName,
  formatMinutes,
  greeting,
  periodRange,
  queryEnd,
  statusHref,
  successRate,
  trendSummary,
} from './homeMetrics'

// Local times throughout: the page buckets by the user's calendar day.
const NOW = new Date(2026, 9, 28, 9, 41, 30) // Wed 28 Oct 2026 09:41:30

describe('periodRange', () => {
  test('N local days including today, the previous period right before it, `to` rounded to the minute', () => {
    const r = periodRange(7, NOW)
    expect(r.from).toEqual(new Date(2026, 9, 22))
    expect(r.to).toEqual(new Date(2026, 9, 28, 9, 41))
    expect(r.prevFrom).toEqual(new Date(2026, 9, 15))
    expect(r.prevTo.getTime()).toBe(r.from.getTime() - 1)
  })
})

describe('bucketEvents', () => {
  const ev = (d: Date, action: 'received' | 'posted') => ({ atUtc: d.toISOString(), action })

  test('one bucket per day for 7 days, empty days included, counted by action', () => {
    const r = periodRange(7, NOW)
    const b = bucketEvents(
      [
        ev(new Date(2026, 9, 28, 8), 'received'),
        ev(new Date(2026, 9, 28, 9), 'received'),
        ev(new Date(2026, 9, 28, 9, 30), 'posted'),
        ev(new Date(2026, 9, 22, 0, 0, 1), 'posted'),
      ],
      r,
    )
    expect(b).toHaveLength(7)
    expect(b[0]).toMatchObject({ from: '2026-10-22', to: '2026-10-22', received: 0, posted: 1, label: '22 Oct' })
    expect(b[6]).toMatchObject({ from: '2026-10-28', received: 2, posted: 1 })
    expect(b.slice(1, 6).every((x) => x.received === 0 && x.posted === 0)).toBe(true)
  })

  test('90 days are weeks starting Monday, clamped to the period', () => {
    const r = periodRange(90, NOW)
    const b = bucketEvents([ev(new Date(2026, 9, 27, 12), 'received')], r)
    expect(b[0].from).toBe('2026-07-31') // the period start, not the Monday before it
    expect(b[0].to).toBe('2026-08-02') // Sunday
    expect(b[1].from).toBe('2026-08-03')
    const last = b[b.length - 1]
    expect(last).toMatchObject({ from: '2026-10-26', to: '2026-10-28', received: 1 })
    expect(last.tooltipLabel).toBe('Week of 26 Oct')
  })

  test('events outside the period are ignored', () => {
    const r = periodRange(7, NOW)
    const b = bucketEvents([ev(new Date(2026, 9, 21, 23, 59), 'received')], r)
    expect(b.reduce((n, x) => n + x.received, 0)).toBe(0)
  })
})

describe('queryEnd', () => {
  test('the end of the minute `to` was rounded down from, so events from the last seconds count', () => {
    expect(queryEnd(periodRange(7, NOW))).toEqual(new Date(2026, 9, 28, 9, 42))
  })
})

describe('bucketSeries', () => {
  test('daily series fill the matching days; days the API left out stay empty', () => {
    const r = periodRange(7, NOW)
    const b = bucketSeries(
      [
        { start: '2026-10-22', received: 1, posted: 0, postFailed: 0 },
        { start: '2026-10-28', received: 3, posted: 2, postFailed: 1 },
      ],
      r,
    )
    expect(b).toHaveLength(7)
    expect(b[0]).toMatchObject({ from: '2026-10-22', received: 1, posted: 0 })
    expect(b[6]).toMatchObject({ from: '2026-10-28', received: 3, posted: 2 })
    expect(b.slice(1, 6).every((x) => x.received === 0 && x.posted === 0)).toBe(true)
  })

  test('a weekly entry starting the Monday before the period lands in the clamped first week', () => {
    const r = periodRange(90, NOW)
    const b = bucketSeries([{ start: '2026-07-27', received: 4, posted: 1, postFailed: 0 }], r)
    expect(b[0]).toMatchObject({ from: '2026-07-31', received: 4, posted: 1 })
  })
})

describe('formatMinutes', () => {
  test.each([
    [0, 'under 1 min'],
    [45, '45 min'],
    [60, '1 h'],
    [1260, '21 h'],
    [2880, '2 d'],
    [4320, '3 d'],
    [3000, '2 d 2 h'],
  ])('%i minutes → %s', (minutes, text) => {
    expect(formatMinutes(minutes)).toBe(text)
  })
})

describe('trendSummary', () => {
  test('totals and the busiest bucket', () => {
    const r = periodRange(7, NOW)
    const b = bucketEvents([{ atUtc: new Date(2026, 9, 27, 10).toISOString(), action: 'received' }], r)
    expect(trendSummary(b, 'last 7 days')).toBe('Received 1 and posted 0 statements in the last 7 days. Busiest: Tue 27 Oct, 1 received.')
  })
})

describe('ageBuckets', () => {
  const item = (receivedUtc: string | null, createdUtc = '2026-10-01T00:00:00Z') =>
    ({ email: receivedUtc ? { subject: null, receivedUtc } : null, created: { utc: createdUtc } }) as unknown as RequestSummary

  test('counts calendar days since received (created when no email), with the filter dates of each bucket', () => {
    const b = ageBuckets(
      [
        item(new Date(2026, 9, 28, 0, 5).toISOString()),
        item(new Date(2026, 9, 27, 23, 59).toISOString()),
        item(new Date(2026, 9, 25, 12).toISOString()),
        item(new Date(2026, 9, 22, 12).toISOString()),
        item(null, new Date(2026, 9, 2).toISOString()),
      ],
      NOW,
    )
    expect(b.map((x) => [x.label, x.count])).toEqual([
      ['Today', 1],
      ['1–2 days', 1],
      ['3–6 days', 2],
      ['7+ days', 1],
    ])
    expect(b[0]).toMatchObject({ receivedFrom: '2026-10-28', receivedTo: '2026-10-28' })
    expect(b[2]).toMatchObject({ receivedFrom: '2026-10-22', receivedTo: '2026-10-25' })
    expect(b[3]).toMatchObject({ receivedFrom: undefined, receivedTo: '2026-10-21' })
  })
})

describe('delta', () => {
  test('signed absolute difference', () => {
    expect(delta(9, 3)).toEqual({ diff: 6, text: '+6' })
    expect(delta(1, 3)).toEqual({ diff: -2, text: '−2' })
    expect(delta(4, 4)).toEqual({ diff: 0, text: 'No change' })
  })
  test('nothing in the previous period says so instead of a difference', () => {
    expect(delta(5, 0)).toEqual({ diff: 5, text: null })
  })
})

test('successRate', () => {
  expect(successRate(37, 3)).toBe(93)
  expect(successRate(0, 0)).toBeNull()
})

test('greeting and firstName', () => {
  expect(greeting(new Date(2026, 9, 28, 4))).toBe('Good evening')
  expect(greeting(new Date(2026, 9, 28, 9))).toBe('Good morning')
  expect(greeting(new Date(2026, 9, 28, 12))).toBe('Good afternoon')
  expect(greeting(new Date(2026, 9, 28, 18))).toBe('Good evening')
  expect(firstName('Asha K')).toBe('Asha')
  expect(firstName('  ')).toBe('')
})

test('links', () => {
  expect(auditHref('posted', '2026-10-22', '2026-10-28')).toBe('/audit?action=posted&from=2026-10-22&to=2026-10-28')
  expect(statusHref('pending', false)).toBe('/statements')
  expect(statusHref('posted', false)).toBe('/statements?tab=posted')
  expect(statusHref('discarded', true)).toBe('/statements?tab=discarded')
  expect(statusHref('partial', true)).toBe('/statements')
  expect(statusHref('partial', false)).toBe('/statements?tab=all')
  expect(statusHref('posting', true)).toBe('/statements?tab=all')
})
