import type { Txn } from '@/api/schema'
import { changeSentence } from './changeSentence'

const rows: Txn[] = [{ externalId: 'row-1' }, { externalId: 'row-7' }]

describe('changeSentence', () => {
  test('field replace names the row (1-based) with its externalId', () => {
    const s = changeSentence({ op: 'replace', path: '$.transactions[1].payee', old: 'ABC PLUMBING', new: 'ABC Plumbing LLC' }, rows)
    expect(s.text).toBe('Row 2 (row-7) payee: ABC PLUMBING → ABC Plumbing LLC')
  })

  test('the externalId is left out when unknown', () => {
    const s = changeSentence({ op: 'replace', path: '$.transactions[5].memo', old: 'a', new: 'b' }, rows)
    expect(s.text).toBe('Row 6 memo: a → b')
  })

  test('money fields are formatted', () => {
    expect(changeSentence({ op: 'replace', path: '$.controlTotal', old: 4820.17, new: 4784.17 }).text).toBe(
      'Control total: 4,820.17 → 4,784.17',
    )
    expect(changeSentence({ op: 'replace', path: '$.transactions[0].amount', old: 1234.5, new: 10 }, rows).text).toBe(
      'Row 1 (row-1) amount: 1,234.50 → 10.00',
    )
  })

  test('add and remove carry the row as details', () => {
    const added = changeSentence({ op: 'add', path: '$.transactions[12]', new: { externalId: 'x' } })
    expect(added).toEqual({ text: 'Row 13 added', details: { externalId: 'x' } })
    const removed = changeSentence({ op: 'remove', path: '$.transactions[7]', old: { externalId: 'y' } })
    expect(removed).toEqual({ text: 'Row 8 removed', details: { externalId: 'y' } })
  })

  test('any other path shows JSON values', () => {
    expect(changeSentence({ op: 'replace', path: '$.reference', old: 'a', new: 'b' }).text).toBe('$.reference: "a" → "b"')
  })
})
