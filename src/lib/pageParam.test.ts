import { parsePage } from './pageParam'

describe('parsePage', () => {
  test.each([
    ['3', 3],
    ['2.7', 2],
    [null, 1],
    ['', 1],
    ['abc', 1],
    ['0', 1],
    ['-4', 1],
    ['Infinity', 1],
    ['1e10', 1],
    ['1000001', 1],
    ['1000000', 1_000_000],
  ])('%s -> %s', (raw, want) => {
    expect(parsePage(raw)).toBe(want)
  })
})
