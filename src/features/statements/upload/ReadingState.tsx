import { useEffect, useState } from 'react'
import { Loader2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatBytes } from './format'

/** Step 2: what is being read and for how long. No fake progress bar: the API gives none. */
export function ReadingState({ file, onCancel }: { file: File; onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  // Announce every 10 s, not every second.
  const announced = Math.floor(seconds / 10) * 10

  return (
    <section aria-label="Reading the statement" className="grid justify-items-center gap-3 rounded-lg border bg-card px-6 py-12 text-center">
      <Loader2Icon className="size-6 animate-spin text-primary motion-reduce:animate-none" aria-hidden />
      <p className="text-sm">
        <span className="font-medium break-all">{file.name}</span>
        <span className="text-muted-foreground"> · {formatBytes(file.size)}</span>
      </p>
      <p role="status" className="text-sm text-muted-foreground">
        Reading the statement… This usually takes 10 to 40 seconds.
        <span className="sr-only">{announced > 0 ? ` ${announced} seconds so far.` : ''}</span>
      </p>
      <p aria-hidden className="text-xs text-muted-foreground tabular-nums">
        {seconds} s
      </p>
      <Button variant="outline" size="sm" onClick={onCancel}>
        Cancel
      </Button>
    </section>
  )
}
