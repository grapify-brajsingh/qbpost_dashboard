import type { Payload } from '@/api/schema'
import {
  addRow,
  changeBreakdown,
  createDraft,
  dirtyCount,
  draftToPayload,
  isDirty,
  isPosting,
  postStats,
  setPost,
  rowsSumCents,
  setCell,
  setControlTotal,
  setReference,
  toggleDeleteRow,
} from './draft'

test('unknown fields survive', () => {
  const p = { reference: 'r', controlTotal: 1, email: { subject: 's' }, transactions: [{ kind: 'Check', amount: 1, confidence: 0.9 }] }
  const out = draftToPayload(setCell(createDraft(p), '0', 'payee', 'X'))
  expect(out).toEqual({ ...p, transactions: [{ kind: 'Check', amount: 1, confidence: 0.9, payee: 'X' }] })
})

test('setting a cell back clears dirty', () => {
  const d0 = createDraft({ transactions: [{ payee: 'A', memo: 'm' }] })
  const d1 = setCell(d0, '0', 'payee', 'B')
  expect(d1.dirtyCells).toEqual(new Set(['0:payee']))
  expect(dirtyCount(d1)).toBe(1)
  const d2 = setCell(d1, '0', 'payee', 'A')
  expect(d2.dirtyCells.size).toBe(0)
  expect(isDirty(d2)).toBe(false)
  // A field the row never had, set and then cleared, is not added to the payload.
  const d3 = setCell(setCell(d0, '0', 'refNumber', '9'), '0', 'refNumber', '')
  expect(isDirty(d3)).toBe(false)
  expect(draftToPayload(d3)).toEqual({ transactions: [{ payee: 'A', memo: 'm' }] })
  expect('refNumber' in (draftToPayload(d3).transactions as object[])[0]).toBe(false)
  // The input is never mutated.
  expect(d0.rows[0]).toEqual({ payee: 'A', memo: 'm' })
})

test('sum excludes deleted rows and includes added', () => {
  let d = createDraft({ transactions: [{ amount: 1.1 }, { amount: 2.2 }, { amount: 'x' }] })
  expect(rowsSumCents(d)).toBe(330)
  d = toggleDeleteRow(d, '1')
  expect(rowsSumCents(d)).toBe(110)
  d = addRow(d)
  d = setCell(d, 'n0', 'amount', 0.05)
  expect(rowsSumCents(d)).toBe(115)
  expect(dirtyCount(d)).toBe(2)
  expect(draftToPayload(d).transactions).toEqual([{ amount: 1.1 }, { amount: 'x' }, { externalId: d.added[0].externalId, amount: 0.05 }])
  d = toggleDeleteRow(d, '1')
  expect(rowsSumCents(d)).toBe(335)
  // Deleting an added row removes it.
  d = toggleDeleteRow(d, 'n0')
  expect(d.added).toEqual([])
  expect(isDirty(d)).toBe(false)
})

test('controlTotal is only changed by setControlTotal', () => {
  const d = setCell(createDraft({ controlTotal: 10, transactions: [{ amount: 10 }] }), '0', 'amount', 12)
  expect(draftToPayload(d).controlTotal).toBe(10)
  const d2 = setControlTotal(d, 12)
  expect(draftToPayload(d2).controlTotal).toBe(12)
  expect(dirtyCount(d2)).toBe(2)
  expect(dirtyCount(setControlTotal(d2, 10))).toBe(1)
})

test('unedited draft round-trips to a deep-equal payload', () => {
  const p: Payload = {
    reference: 'r',
    extra: [1, { a: null }],
    transactions: [{ kind: 'Check', amount: 12.345, nested: { x: 1 } }, { payee: 'P' }],
  }
  const out = draftToPayload(createDraft(p))
  expect(out).toStrictEqual(p)
  expect('controlTotal' in out).toBe(false)
  // An edit that is undone also round-trips.
  const back = draftToPayload(setCell(setCell(createDraft(p), '1', 'payee', 'Q'), '1', 'payee', 'P'))
  expect(back).toStrictEqual(p)
})

describe('dont-post and row ids', () => {
  it('setPost(false) then setPost(true) on a row without post leaves no post key and no dirty cell', () => {
    const d0 = createDraft({ transactions: [{ payee: 'A' }] })
    const d1 = setPost(d0, '0', false)
    expect(d1.dirtyCells).toEqual(new Set(['0:post']))
    expect(isPosting(d1.rows[0])).toBe(false)
    const d2 = setPost(d1, '0', true)
    expect('post' in d2.rows[0]).toBe(false)
    expect(d2.dirtyCells.size).toBe(0)
    expect(isDirty(d2)).toBe(false)
  })

  it('setPost(false) on a loaded post:false row is not dirty; draftToPayload keeps post:false', () => {
    const d0 = createDraft({ transactions: [{ payee: 'A', post: false }] })
    const d1 = setPost(d0, '0', false)
    expect(isDirty(d1)).toBe(false)
    expect(draftToPayload(d1).transactions).toEqual([{ payee: 'A', post: false }])
    const d2 = setPost(d1, '0', true)
    expect(d2.dirtyCells).toEqual(new Set(['0:post']))
    expect(setPost(d2, '0', false).dirtyCells.size).toBe(0)
  })

  it('addRow gives dash-<uuid> externalId and keeps unknown fields on other rows', () => {
    const p = { transactions: [{ payee: 'A', confidence: 0.5 }] }
    const d = addRow(createDraft(p))
    expect(d.added[0].externalId).toMatch(/^dash-[0-9a-f-]{36}$/)
    expect(addRow(d, { externalId: 'mine', kind: 'Check' }).added[1]).toEqual({ externalId: 'mine', kind: 'Check' })
    expect(draftToPayload(d).transactions).toEqual([{ payee: 'A', confidence: 0.5 }, d.added[0]])
  })

  it('changeBreakdown counts 1 edit, 1 added, 1 post-off separately', () => {
    let d = createDraft({ transactions: [{ payee: 'A' }, { payee: 'B' }] })
    d = setCell(d, '0', 'payee', 'X')
    d = setPost(d, '1', false)
    d = addRow(d)
    expect(changeBreakdown(d)).toEqual({ edits: 1, added: 1, deleted: 0, postOff: 1, postOn: 0 })
    expect(dirtyCount(d)).toBe(3)
    d = toggleDeleteRow(d, '1')
    expect(changeBreakdown(d)).toEqual({ edits: 1, added: 1, deleted: 1, postOff: 0, postOn: 0 })
    const on = setPost(createDraft({ transactions: [{ post: false }] }), '0', true)
    expect(changeBreakdown(on).postOn).toBe(1)
  })

  it('postStats counts every non-deleted row; skipped rows stay in allCents', () => {
    let d = createDraft({ transactions: [{ amount: 10.1 }, { amount: 0.2, post: false }, { amount: 5 }] })
    d = addRow(d, { amount: 1 })
    d = toggleDeleteRow(d, '2')
    expect(postStats(d)).toEqual({ total: 3, posting: 2, skipped: 1, skippedCents: 20, allCents: 1130 })
  })
})

describe('reference', () => {
  const p = { reference: 'a b', controlTotal: 1, transactions: [] }

  test('a changed reference is one edit and goes into the payload', () => {
    const d = setReference(createDraft(p), 'a-b')
    expect(dirtyCount(d)).toBe(1)
    expect(changeBreakdown(d).edits).toBe(1)
    expect(draftToPayload(d).reference).toBe('a-b')
  })

  test('changing it back is no edit, and the control total keeps it', () => {
    expect(dirtyCount(setReference(setReference(createDraft(p), 'a-b'), 'a b'))).toBe(0)
    expect(setControlTotal(setReference(createDraft(p), 'a-b'), 2).top.reference).toBe('a-b')
  })
})
