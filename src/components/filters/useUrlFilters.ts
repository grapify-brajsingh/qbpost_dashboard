import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { format, isValid, parse } from 'date-fns'

export type FilterKind = 'text' | 'date' | 'number' | 'bool' | 'enum' | 'enumList'

export type FilterSpec = Record<string, { kind: FilterKind; values?: readonly string[] }>

type ValueOf<D> = D extends { kind: 'text' | 'date' }
  ? string
  : D extends { kind: 'number' }
    ? number
    : D extends { kind: 'bool' }
      ? boolean
      : D extends { kind: 'enum'; values: infer V extends readonly string[] }
        ? V[number]
        : D extends { kind: 'enumList'; values: infer V extends readonly string[] }
          ? V[number][]
          : D extends { kind: 'enum' }
            ? string
            : string[]

/** Every key is optional: `undefined` means "no filter". */
export type FilterValues<S extends FilterSpec> = { [K in keyof S]?: ValueOf<S[K]> }

const DATE_FORMAT = 'yyyy-MM-dd'

/** Local-time `yyyy-MM-dd` (never `toISOString()`, which shifts the day). */
export function formatDate(d: Date): string {
  return format(d, DATE_FORMAT)
}

function parseDate(raw: string): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return undefined
  const d = parse(raw, DATE_FORMAT, new Date(0))
  return isValid(d) && format(d, DATE_FORMAT) === raw ? raw : undefined
}

function readOne(def: FilterSpec[string], raw: string | null): unknown {
  if (raw === null) return undefined
  switch (def.kind) {
    case 'text':
      return raw === '' ? undefined : raw
    case 'date':
      return parseDate(raw)
    case 'number': {
      if (raw.trim() === '') return undefined
      const n = Number(raw)
      return Number.isFinite(n) ? n : undefined
    }
    case 'bool':
      return raw === 'true' ? true : raw === 'false' ? false : undefined
    case 'enum':
      return def.values && def.values.includes(raw) ? raw : undefined
    case 'enumList': {
      const items = raw
        .split(',')
        .filter((v) => v !== '' && (!def.values || def.values.includes(v)))
      return items.length ? items : undefined
    }
  }
}

function writeOne(value: unknown): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (Array.isArray(value)) return value.length ? value.join(',') : undefined
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : undefined
  return String(value)
}

/**
 * Filter state kept in the URL query string. The spec's keys are the URL param names.
 * Malformed values read as `undefined`; params outside the spec are never touched.
 * Typing (`text`) uses `replace`; everything else pushes a history entry.
 * Any `set` drops `page`, which means page 1.
 */
export function useUrlFilters<S extends FilterSpec>(spec: S) {
  const [params, setParams] = useSearchParams()

  const values = useMemo(() => {
    const out: Record<string, unknown> = {}
    for (const key of Object.keys(spec)) {
      const v = readOne(spec[key], params.get(key))
      if (v !== undefined) out[key] = v
    }
    return out as FilterValues<S>
  }, [params, spec])

  const set = useCallback(
    (patch: Partial<FilterValues<S>>) => {
      const keys = Object.keys(patch).filter((k) => k in spec)
      const textOnly = keys.every((k) => spec[k].kind === 'text')
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          for (const k of keys) {
            const w = writeOne((patch as Record<string, unknown>)[k])
            if (w === undefined) next.delete(k)
            else next.set(k, w)
          }
          next.delete('page')
          return next
        },
        { replace: textOnly },
      )
    },
    [setParams, spec],
  )

  const clear = useCallback(() => {
    setParams((prev) => {
      const next = new URLSearchParams(prev)
      for (const k of Object.keys(spec)) next.delete(k)
      next.delete('page')
      return next
    })
  }, [setParams, spec])

  const activeCount = Object.values(values).filter((v) => v !== false).length

  return { values, set, clear, activeCount }
}
