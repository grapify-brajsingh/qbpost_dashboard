import type { Action, RequestDetail } from '@/api/schema'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

const BUTTONS: { action: Exclude<Action, 'edit'>; label: string; variant: 'default' | 'outline' }[] = [
  { action: 'validate', label: 'Validate', variant: 'outline' },
  { action: 'post', label: 'Post', variant: 'default' },
  { action: 'discard', label: 'Discard', variant: 'outline' },
  { action: 'restore', label: 'Restore', variant: 'outline' },
  { action: 'resolve', label: 'Resolve', variant: 'outline' },
]

interface Props {
  request: Pick<RequestDetail, 'allowedActions'>
  onAction: (a: Action) => void
  /** A reason disables the button and shows as its tooltip. */
  disabled?: Partial<Record<Action, string>>
}

export function ActionBar({ request, onAction, disabled = {} }: Props) {
  const shown = BUTTONS.filter((b) => request.allowedActions.includes(b.action))
  if (shown.length === 0) return null
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Request actions">
      {shown.map((b) => {
        const reason = disabled[b.action]
        if (reason) {
          return (
            <Tooltip key={b.action}>
              <TooltipTrigger asChild>
                <span tabIndex={0}>
                  <Button variant={b.variant} disabled>
                    {b.label}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{reason}</TooltipContent>
            </Tooltip>
          )
        }
        return (
          <Button key={b.action} variant={b.variant} onClick={() => onAction(b.action)}>
            {b.label}
          </Button>
        )
      })}
    </div>
  )
}
