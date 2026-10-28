import { Link } from 'react-router'
import type { RequestSummary } from '@/api/schema'
import { Badge } from '@/components/ui/badge'

const refOf = (id: number) => `SR-${String(id).padStart(6, '0')}`

export function FlagChips({ request, linkDuplicate = false }: { request: RequestSummary; linkDuplicate?: boolean }) {
  const dup = request.duplicate
  const dupText =
    dup.flagged && `Possible duplicate of ${dup.ofRef ?? (dup.of === null ? 'another request' : refOf(dup.of))}`
  return (
    <span className="flex flex-wrap gap-1">
      {request.needsAttention && (
        <Badge className="bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200">Needs attention</Badge>
      )}
      {dupText && (
        <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
          {linkDuplicate && dup.of !== null ? <Link to={`/statements/${dup.of}`}>{dupText}</Link> : dupText}
        </Badge>
      )}
    </span>
  )
}
