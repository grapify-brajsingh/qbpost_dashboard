import { useMemo, useState } from 'react'
import type { RequestDetail, Txn } from '@/api/schema'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { findingsByRow, readErrorCells, tableShape } from './findings'
import { RawJsonEditor } from './RawJsonEditor'
import { TxTable } from './TxTable'
import { ValidationPanel } from './ValidationPanel'

export function TransactionsTab({ request }: { request: RequestDetail }) {
  const [onlyProblems, setOnlyProblems] = useState(false)
  const shape = tableShape(request.payload)
  const rows = useMemo(() => (shape === 'table' ? (request.payload.transactions as Txn[]) : []), [shape, request.payload])
  const findings = useMemo(() => findingsByRow(rows, request.validation.validation ?? []), [rows, request.validation.validation])
  const readErrors = useMemo(() => readErrorCells(request.readErrors), [request.readErrors])

  return (
    <div className="space-y-4">
      <ValidationPanel request={request} orphans={findings.get(-1) ?? []} />
      {shape === 'raw' ? (
        <RawJsonEditor payload={request.payload} readErrors={request.readErrors} />
      ) : (
        <TxTable
          rows={rows}
          editable={false}
          findings={findings}
          readErrors={readErrors}
          onlyProblems={onlyProblems}
          toolbar={
            <div className="flex items-center gap-2">
              <Checkbox id="only-problems" checked={onlyProblems} onCheckedChange={(c) => setOnlyProblems(c === true)} />
              <Label htmlFor="only-problems">Only rows with problems</Label>
            </div>
          }
        />
      )}
    </div>
  )
}
