import type { Payload } from '@/api/schema'
import {
  addRow,
  createDraft,
  dirtyCount,
  draftToPayload,
  isDirty,
  rowsSumCents,
  setCell,
  setControlTotal,
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
  expect(draftToPayload(d).transactions).toEqual([{ amount: 1.1 }, { amount: 'x' }, { amount: 0.05 }])
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
