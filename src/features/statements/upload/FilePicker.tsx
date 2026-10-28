import { useId, useState, type DragEvent } from 'react'
import { FileUpIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fileProblem } from './format'

/** Step 1: a drop zone around a real file input, so it works by keyboard and screen reader. */
export function FilePicker({ onFile }: { onFile: (file: File) => void }) {
  const id = useId()
  const [error, setError] = useState<string | null>(null)
  const [over, setOver] = useState(false)

  const take = (files: FileList | null) => {
    if (!files || files.length === 0) return
    const problem = fileProblem(files)
    setError(problem)
    if (!problem) onFile(files[0])
  }
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    setOver(false)
    take(e.dataTransfer.files)
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        onDragOver={(e) => {
          e.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cn(
          'grid cursor-pointer justify-items-center gap-2 rounded-lg border-2 border-dashed bg-card px-6 py-12 text-center transition-colors',
          'focus-within:ring-2 focus-within:ring-ring hover:border-primary/60',
          over && 'border-primary bg-primary-soft',
        )}
      >
        <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
          <FileUpIcon className="size-5" aria-hidden />
        </span>
        <span className="text-sm font-medium">
          Drop a PDF here, or <span className="text-primary underline underline-offset-2">choose a file</span>
        </span>
        <span className="text-xs text-muted-foreground">PDF only · up to 10 MB · one file</span>
        <input
          id={id}
          type="file"
          accept="application/pdf,.pdf"
          className="sr-only"
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => {
            take(e.target.files)
            e.target.value = ''
          }}
        />
      </label>
      {error && (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
