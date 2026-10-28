import { describe, expect, it } from 'vitest'
import { addRow, createDraft, setCell, toggleDeleteRow } from '@/features/requests/transactions/draft'
import { badValues, emptyFields, emptyFindings, requiredCount, saveBlocker } from './emptyFields'

const full = { kind: 'Check', date: '2026-09-01', amount: 10, account: 'Chase Checking 4521', payee: 'Bank Fees', lineAccount: 'Bank Service Charges' }
const draftOf = (rows: object[]) => createDraft({ reference: null, controlTotal: null, transactions: rows })

describe('emptyFields', () => {
  it('lists empty required and recommended fields per display index; blank strings and null count as empty', () => {
    const d = draftOf([full, { ...full, account: undefined, payee: '  ' }, { ...full, date: null, lineAccount: '' }])
    const e = emptyFields(d)
    expect(e.has(0)).toBe(false)
    expect(e.get(1)).toEqual({ required: ['account'], recommended: ['payee'] })
    expect(e.get(2)).toEqual({ required: ['date'], recommended: ['lineAccount'] })
    expect(requiredCount(e)).toBe(2)
  })

  it('skips deleted rows, follows edits, and indexes added rows after the loaded ones', () => {
    let d = draftOf([{ ...full, account: '' }, { ...full, kind: '' }])
    d = toggleDeleteRow(d, '1')
    d = setCell(d, '0', 'account', 'Chase Checking 4521')
    d = addRow(d, { kind: 'Deposit' })
    const e = emptyFields(d)
    expect([...e.keys()]).toEqual([2])
    expect(e.get(2)!.required).toEqual(['date', 'amount', 'account'])
  })

  it('turns them into one finding per field, worded for the cell', () => {
    const f = emptyFindings(emptyFields(draftOf([{ ...full, account: undefined, payee: undefined }])))
    expect(f.get(0)).toEqual([
      { index: 0, reason: 'empty-account', detail: 'Empty' },
      { index: 0, reason: 'empty-payee', detail: 'Empty (optional)' },
    ])
  })
})

describe('saveBlocker', () => {
  const ok = draftOf([full])
  it('is null when the statement can be saved', () => {
    expect(saveBlocker(ok, 'chase-sep', false)).toBeNull()
  })
  it('names the first reason: saving, empty required fields, reference, rows', () => {
    expect(saveBlocker(ok, 'x', true)).toBe('Saving…')
    expect(saveBlocker(draftOf([{ ...full, account: '' }, { ...full, date: '' }]), '', false)).toBe('Fill in 2 empty required fields')
    expect(saveBlocker(draftOf([{ ...full, account: '' }]), 'x', false)).toBe('Fill in 1 empty required field')
    expect(saveBlocker(ok, '   ', false)).toBe('Enter a reference')
    expect(saveBlocker(draftOf([]), 'x', false)).toBe('Add at least one row')
    expect(saveBlocker(toggleDeleteRow(ok, '0'), 'x', false)).toBe('Add at least one row')
  })
})

describe('badValues (spec §4.7)', () => {
  it('flags a date that is not yyyy-MM-dd, a non-numeric amount and an unknown kind; skips empty and deleted rows', () => {
    let d = draftOf([full, { ...full, date: '08/01/2026' }, { ...full, amount: '12.50', kind: 'Withdrawal' }, { ...full, date: 'Aug 1' }, { ...full, date: '' }])
    d = toggleDeleteRow(d, '3')
    const bad = badValues(d)
    expect([...bad.keys()]).toEqual([1, 2])
    expect([...bad.get(1)!]).toEqual(['date'])
    expect([...bad.get(2)!].sort()).toEqual(['amount', 'kind'])
  })

  it('blocks saving until they are fixed', () => {
    expect(saveBlocker(draftOf([{ ...full, date: '08/01/2026' }]), 'x', false)).toBe('Fix 1 value that could not be read')
    expect(saveBlocker(draftOf([{ ...full, date: 'x' }, { ...full, amount: 'y' }]), 'x', false)).toBe('Fix 2 values that could not be read')
  })
})
