import { useState } from 'react'
import { PencilIcon } from 'lucide-react'
import { parseReference } from '@/features/requests/transactions/cells/parse'
import { TextCell } from '@/features/requests/transactions/cells/TextCell'
import { cn } from '@/lib/utils'

const asText = (v: unknown) => (typeof v === 'string' ? v : '')

/** The statement's reference with the control total's pencil. A value that breaks the API's rule never leaves the editor. */
export function ReferenceField({ value, saved, onChange }: { value: unknown; saved: unknown; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const changed = !Object.is(value, saved)
  if (editing) {
    return (
      <span className="inline-block w-64 max-w-full align-middle">
        <TextCell
          label="Reference"
          initial={asText(value)}
          parse={parseReference}
          onCommit={(v) => {
            setEditing(false)
            if (v !== asText(value)) onChange(v as string)
          }}
          onCancel={() => setEditing(false)}
        />
      </span>
    )
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <button
        type="button"
        aria-label="Edit reference"
        data-testid="reference"
        data-dirty={changed ? 'true' : undefined}
        className={cn(
          'group/ref inline-flex items-center gap-1 rounded-md border border-dashed border-input px-1.5 py-0.5 break-all transition-colors outline-none hover:border-primary/50 hover:bg-primary-soft focus-visible:ring-[3px] focus-visible:ring-ring/40',
          changed && 'border-solid border-primary/40 bg-primary-soft',
        )}
        onClick={() => setEditing(true)}
      >
        {asText(value) || '—'}
        <PencilIcon aria-hidden className="size-3 shrink-0 text-muted-foreground transition-colors group-hover/ref:text-primary" />
      </button>
      {changed && <span className="text-[11px] text-primary">was {asText(saved) || 'empty'}</span>}
    </span>
  )
}
