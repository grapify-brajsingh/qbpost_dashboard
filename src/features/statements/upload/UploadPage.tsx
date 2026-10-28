import { useCallback, useEffect, useRef, useState } from 'react'
import { useExtractPdf } from '@/api/queries/extractions'
import type { Extraction } from '@/api/schema'
import { PageHeader } from '@/components/PageHeader'
import { ExtractionError } from './ExtractionError'
import { FilePicker } from './FilePicker'
import { ReadingState } from './ReadingState'
import { ReviewEditor } from './ReviewEditor'

type Step =
  | { kind: 'choose' }
  | { kind: 'reading'; file: File }
  | { kind: 'failed'; file: File; error: unknown }
  | { kind: 'review'; extraction: Extraction }

/** `/statements/upload`: choose a PDF → reading → review → save (spec §4). Nothing is saved before Save statement. */
export function UploadPage() {
  const [step, setStep] = useState<Step>({ kind: 'choose' })
  const extract = useExtractPdf()
  const inFlight = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    inFlight.current?.abort()
    inFlight.current = null
  }, [])
  // Leaving the page while reading stops the read.
  useEffect(() => cancel, [cancel])

  const read = (file: File) => {
    cancel()
    const controller = new AbortController()
    inFlight.current = controller
    setStep({ kind: 'reading', file })
    extract.mutate(
      { file, signal: controller.signal },
      {
        onSuccess: (extraction) => {
          if (controller.signal.aborted) return
          setStep({ kind: 'review', extraction })
        },
        onError: (error) => {
          if (controller.signal.aborted) return
          setStep({ kind: 'failed', file, error })
        },
      },
    )
  }

  const chooseAnother = () => {
    cancel()
    setStep({ kind: 'choose' })
  }

  // Move focus to the review heading once the rows arrive, so keyboard and screen reader users land on them.
  useEffect(() => {
    if (step.kind === 'review') document.getElementById('review-heading')?.focus()
  }, [step.kind])

  return (
    <div className="page gap-4 pb-0 md:pb-0">
      <PageHeader
        title="Upload a statement PDF"
        description="We read it the same way as emailed statements. Nothing is saved until you review it."
      />
      {step.kind === 'choose' && <FilePicker onFile={read} />}
      {step.kind === 'reading' && <ReadingState file={step.file} onCancel={chooseAnother} />}
      {step.kind === 'failed' && (
        <ExtractionError error={step.error} fileName={step.file.name} onRetry={() => read(step.file)} onChooseAnother={chooseAnother} />
      )}
      {step.kind === 'review' && <ReviewEditor key={step.extraction.extractionId} extraction={step.extraction} onDiscard={chooseAnother} />}
    </div>
  )
}
