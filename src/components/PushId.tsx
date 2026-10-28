import { Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function shortPushId(value: string): string {
  return value.length <= 8 ? value : `${value.slice(0, 4)}…${value.slice(-3)}`
}

export function PushId({ value, fallback }: { value: string | null; fallback: string }) {
  if (value === null) return <span className="text-muted-foreground">{fallback}</span>
  return (
    <span className="inline-flex items-center gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <code className="num font-mono text-xs">{shortPushId(value)}</code>
        </TooltipTrigger>
        <TooltipContent>{value}</TooltipContent>
      </Tooltip>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-6"
        aria-label="Copy push id"
        onClick={() => void navigator.clipboard.writeText(value)}
      >
        <Copy className="size-3.5" />
      </Button>
    </span>
  )
}
