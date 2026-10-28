import { useDatabaseHealth } from '@/api/queries/health'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

export function DbHealthLight() {
  const { isSuccess, isError } = useDatabaseHealth()
  const label = isSuccess ? 'Database: OK' : isError ? 'Database: unavailable' : 'Database: checking'
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          role="img"
          aria-label={label}
          className={cn(
            'relative inline-block size-2.5 rounded-full ring-4 transition-colors duration-300',
            isSuccess ? 'bg-success ring-success/15' : isError ? 'bg-destructive ring-destructive/15' : 'bg-muted-foreground/40 ring-transparent',
          )}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
