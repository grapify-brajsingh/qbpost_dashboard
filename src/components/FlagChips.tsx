import { CopyIcon, TriangleAlertIcon } from 'lucide-react'
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
        <Badge variant="danger">
          <TriangleAlertIcon aria-hidden />
          Needs attention
        </Badge>
      )}
      {dupText && (
        <Badge variant="warning">
          <CopyIcon aria-hidden />
          {linkDuplicate && dup.of !== null ? (
            <Link className="underline-offset-2 hover:underline" to={`/statements/${dup.of}`}>
              {dupText}
            </Link>
          ) : (
            dupText
          )}
        </Badge>
      )}
    </span>
  )
}
