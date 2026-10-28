import type { Txn } from '@/api/schema'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { cellText } from '@/features/requests/transactions/columns'
import { formatMoney } from '@/lib/money'

export interface DeleteTarget {
  rowKey: string
  /** Row number as shown (1-based). */
  n: number
  row: Txn
}

/** "5 Aug, Check, ABC Plumbing LLC, 184.32": enough to recognise the row. Values are text only. */
function describe(row: Txn): string {
  const amount = typeof row.amount === 'number' ? formatMoney(row.amount) : cellText(row.amount)
  return [cellText(row.date), cellText(row.kind), cellText(row.payee), amount].filter((s) => s !== '').join(', ')
}

/** Confirms a delete, and points at the Post switch for rows that should stay but not be posted. */
export function DeleteRowDialog({
  target,
  onClose,
  onConfirm,
}: {
  target: DeleteTarget | null
  onClose: () => void
  onConfirm: (rowKey: string) => void
}) {
  const summary = target ? describe(target.row) : ''
  return (
    <AlertDialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete row {target?.n}?</AlertDialogTitle>
          <AlertDialogDescription>
            {summary && `${summary}. `}Use this only for a row that shouldn't exist. To keep it but leave it out of QuickBooks,
            switch off Post instead.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={() => target && onConfirm(target.rowKey)}>
            Delete row
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
