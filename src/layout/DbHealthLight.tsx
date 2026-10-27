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
            'inline-block size-3 rounded-full',
            isSuccess ? 'bg-green-500' : isError ? 'bg-red-500' : 'bg-muted-foreground/40',
          )}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
