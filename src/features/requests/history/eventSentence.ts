import type { RequestEvent } from '@/api/schema'

const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)

/** One timeline event as a sentence; unknown kinds fall back to the kind itself. */
export function eventSentence(e: RequestEvent): string {
  const d = e.detail ?? {}
  switch (e.kind) {
    case 'created':
      return 'Request received'
    case 'flagged-duplicate':
      return typeof d.of === 'number'
        ? `Flagged as a possible duplicate of SR-${String(d.of).padStart(6, '0')}`
        : 'Flagged as a possible duplicate'
    case 'edited': {
      const note = str(d.note)
      return `Edited${typeof d.version === 'number' ? ` (version ${d.version})` : ''}${note ? `: ${note}` : ''}`
    }
    case 'validated':
      return `Validated${str(d.state) ? `: ${str(d.state)}` : ''}`
    case 'post-started':
      return 'Post started'
    case 'post-finished':
      return `Post finished${str(d.outcome) ? `: ${str(d.outcome)}` : ''}`
    case 'discarded':
      return `Discarded${str(d.reason) ? `: ${str(d.reason)}` : ''}`
    case 'restored':
      return 'Restored'
    case 'resolved': {
      const outcome = str(d.outcome)
      const note = str(d.note)
      return `Resolved${outcome ? ` as ${outcome}` : ''}${note ? `: ${note}` : ''}`
    }
    default:
      return e.kind
  }
}
