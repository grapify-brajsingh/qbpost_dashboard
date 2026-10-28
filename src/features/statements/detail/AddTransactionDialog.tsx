import { useState, type FormEvent } from 'react'
import { TXN_KINDS, type QbLists, type Txn } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { parseAmount, parseDate } from '@/features/requests/transactions/cells/parse'

const TEXT_FIELDS = ['payee', 'account', 'lineAccount', 'memo'] as const
type Fields = Record<'date' | 'kind' | 'amount' | (typeof TEXT_FIELDS)[number], string>
const EMPTY: Fields = { date: '', kind: '', payee: '', account: '', lineAccount: '', amount: '', memo: '' }

/** The row from the form, or the field errors. Empty fields are left out of the row. */
function toRow(f: Fields): { row: Partial<Txn> } | { errors: Partial<Record<keyof Fields, string>> } {
  const errors: Partial<Record<keyof Fields, string>> = {}
  const row: Partial<Txn> = {}
  if (f.date.trim()) {
    const r = parseDate(f.date)
    if ('error' in r) errors.date = r.error
    else row.date = r.value as string
  }
  if (f.kind) row.kind = f.kind
  for (const k of TEXT_FIELDS) if (f[k].trim()) row[k] = f[k].trim()
  if (f.amount.trim()) {
    const r = parseAmount(f.amount)
    if ('error' in r) errors.amount = r.error
    else row.amount = r.value as number
  }
  return Object.keys(errors).length > 0 ? { errors } : { row }
}

/** Adds a row to the draft; it is saved with the other changes. Same checks as the cells. */
export function AddTransactionDialog({
  open,
  onOpenChange,
  lists,
  onAdd,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  lists: QbLists | undefined
  onAdd: (row: Partial<Txn>) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && (
          <Body
            lists={lists}
            onAdd={(row) => {
              onAdd(row)
              onOpenChange(false)
            }}
            onCancel={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Body({ lists, onAdd, onCancel }: { lists: QbLists | undefined; onAdd: (row: Partial<Txn>) => void; onCancel: () => void }) {
  const [f, setF] = useState<Fields>(EMPTY)
  const [errors, setErrors] = useState<Partial<Record<keyof Fields, string>>>({})
  const set = (k: keyof Fields) => (v: string) => {
    setF((prev) => ({ ...prev, [k]: v }))
    setErrors((prev) => ({ ...prev, [k]: undefined }))
  }
  // Payees are customers for deposits and vendors otherwise (the API's rule).
  const payees = (f.kind === 'Deposit' ? lists?.customers : lists?.vendors) ?? []

  function submit(e: FormEvent) {
    e.preventDefault()
    const r = toRow(f)
    if ('errors' in r) setErrors(r.errors)
    else onAdd(r.row)
  }

  const field = (k: keyof Fields, label: string, opts: { list?: string; placeholder?: string; className?: string } = {}) => (
    <div className={`grid gap-1.5 ${opts.className ?? ''}`}>
      <Label htmlFor={`add-${k}`}>{label}</Label>
      <Input
        id={`add-${k}`}
        value={f[k]}
        list={opts.list}
        placeholder={opts.placeholder}
        aria-invalid={errors[k] !== undefined}
        autoComplete="off"
        onChange={(e) => set(k)(e.target.value)}
      />
      {errors[k] && <p className="text-xs text-destructive">{errors[k]}</p>}
    </div>
  )

  return (
    <form onSubmit={submit} className="grid gap-4">
      <DialogHeader>
        <DialogTitle>Add transaction</DialogTitle>
        <DialogDescription>Adds a row to this push. It's saved with your other changes.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3 sm:grid-cols-2">
        {field('date', 'Date', { placeholder: 'yyyy-MM-dd' })}
        <div className="grid gap-1.5">
          <Label htmlFor="add-kind">Kind</Label>
          <NativeSelect id="add-kind" wrapperClassName="w-full" value={f.kind} onChange={(e) => set('kind')(e.target.value)}>
            <NativeSelectOption value="">Choose a kind</NativeSelectOption>
            {TXN_KINDS.map((k) => (
              <NativeSelectOption key={k} value={k}>
                {k}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        {field('payee', 'Payee', { list: 'add-payees', className: 'sm:col-span-2' })}
        {field('account', 'Account', { list: 'add-accounts' })}
        {field('lineAccount', 'Line account', { list: 'add-accounts' })}
        {field('amount', 'Amount', { placeholder: '0.00' })}
        {field('memo', 'Memo')}
      </div>
      <datalist id="add-payees">
        {payees.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <datalist id="add-accounts">
        {(lists?.accounts ?? []).map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">Add row</Button>
      </DialogFooter>
    </form>
  )
}
