// R-13: `POST /statement-extractions`. Reads one uploaded PDF and returns the rows, saving nothing but a short-lived
// extraction record (no PDF bytes, no text).
import { http, HttpResponse } from 'msw'
import type { DuplicateReason, Extraction, Payload, PossibleDuplicate, Txn } from '@/api/schema'
import { mockControl, mockDb, type ExtractionRecord, type RequestRecord } from '../db'
import { EXTRACTION_MODEL, outcomeFor, PROMPT_VERSION } from '../fixtures/extractions'
import { duplicateReasons, rowsOf } from '../payloadRules'
import { API, authenticate, nowUtc, problem } from './common'
import { current, publicRef } from './requestHelpers'

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const RECORD_TTL_MS = 24 * 60 * 60 * 1000
const MAX_DUPLICATES = 5

async function sha256(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const CRLF2 = String.fromCharCode(13, 10, 13, 10)

interface FilePart {
  name: string
  bytes: ArrayBuffer
}

/**
 * The `file` part of a multipart body. Parsed by hand because undici's `request.formData()` cannot build a File under
 * jsdom (vitest); a browser would manage, but one code path keeps the mock identical in both.
 */
async function readFilePart(request: Request): Promise<FilePart | null> {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(request.headers.get('Content-Type') ?? '')
  if (!boundary) return null
  const body = new Uint8Array(await request.arrayBuffer())
  const text = new TextDecoder('latin1').decode(body) // one char per byte, so indexes are byte offsets
  const delimiter = `--${boundary[1] ?? boundary[2]}`
  for (const part of text.split(delimiter)) {
    const headerEnd = part.indexOf(CRLF2)
    if (headerEnd < 0) continue
    const headers = part.slice(0, headerEnd)
    if (!/name="file"/i.test(headers)) continue
    const name = /filename="([^"]*)"/i.exec(headers)?.[1] ?? 'statement.pdf'
    const start = text.indexOf(part) + headerEnd + 4
    const end = text.indexOf(part) + part.length - 2 // drop the CRLF before the next delimiter
    return { name, bytes: body.slice(start, end).buffer }
  }
  return null
}

const looksLikePdf = (bytes: ArrayBuffer) => new TextDecoder().decode(bytes.slice(0, 5)) === '%PDF-'

/** Untrusted file names: control characters stripped, at most 255 characters (R-13.7). */
const cleanName = (name: string) => name.replace(/\p{Cc}/gu, '').slice(0, 255) || 'statement.pdf'

/** Uploaded rows often lack account or payee, so half of them matching on date + amount + kind also counts (R-13.9). */
function looseOverlap(read: Txn[], theirs: Txn[]): boolean {
  if (read.length === 0) return false
  const key = (r: Txn) => `${r.kind}|${r.date}|${r.amount}`
  const keys = new Set(theirs.map(key))
  return read.filter((r) => keys.has(key(r))).length * 2 >= read.length
}

function possibleDuplicates(payload: Payload, fileSha: string): PossibleDuplicate[] {
  const read = rowsOf(payload)
  return [...mockDb.requests]
    .sort((a, b) => b.created.utc.localeCompare(a.created.utc) || b.id - a.id)
    .flatMap((r: RequestRecord): PossibleDuplicate[] => {
      const theirs = current(r).payload
      const reasons = new Set(duplicateReasons(payload, theirs) as DuplicateReason[])
      if (looseOverlap(read, rowsOf(theirs))) reasons.add('overlapping-rows')
      if (r.upload?.sha256 === fileSha) reasons.add('same-file')
      if (reasons.size === 0) return []
      return [{
        id: r.id,
        publicRef: publicRef(r.id),
        reference: typeof theirs.reference === 'string' ? theirs.reference : null,
        status: r.status,
        receivedUtc: r.email?.receivedUtc ?? r.created.utc,
        source: r.upload ? 'upload' : r.email ? 'email' : 'other',
        reasons: [...reasons],
      }]
    })
    .slice(0, MAX_DUPLICATES)
}

export const extractionHandlers = [
  http.post(`${API}/statement-extractions`, async ({ request }) => {
    const auth = authenticate(request, 'requests:submit')
    if ('error' in auth) return auth.error

    const file = await readFilePart(request)
    if (!file) return problem(400, 'file-required', 'File required', 'Send one PDF in the "file" part.')
    const { bytes } = file
    if (bytes.byteLength > MAX_UPLOAD_BYTES) return problem(413, 'file-too-large', 'File too large', 'The PDF is larger than 10 MB.')
    if (!looksLikePdf(bytes)) return problem(415, 'not-a-pdf', 'Not a PDF', "That file isn't a PDF.")

    if (mockControl.extractDelayMs > 0) await mockControl.sleep(mockControl.extractDelayMs)
    const forced = mockControl.nextExtraction
    if (forced) {
      mockControl.nextExtraction = null
      const code = String(forced.body.code ?? 'error')
      return problem(forced.status, code, String(forced.body.title ?? code), forced.body.detail as string | undefined)
    }

    const name = cleanName(file.name)
    const outcome = outcomeFor(name)
    if (outcome.kind === 'problem') return problem(outcome.status, outcome.code, outcome.title, outcome.detail)

    const now = Date.now()
    const record: ExtractionRecord = {
      id: crypto.randomUUID(),
      userId: auth.user.id,
      file: { name, sizeBytes: bytes.byteLength, sha256: await sha256(bytes), pageCount: 1 + Math.floor(bytes.byteLength / 100_000) },
      model: EXTRACTION_MODEL,
      promptVersion: PROMPT_VERSION,
      payload: outcome.payload,
      extractedUtc: nowUtc(),
      expiresUtc: new Date(now + RECORD_TTL_MS).toISOString(),
      savedRequestId: null,
    }
    mockDb.extractions.push(record)
    const body: Extraction = {
      extractionId: record.id,
      file: record.file,
      model: record.model,
      promptVersion: record.promptVersion,
      extractedUtc: record.extractedUtc,
      expiresUtc: record.expiresUtc,
      isBankStatement: true,
      payload: structuredClone(record.payload),
      possibleDuplicates: possibleDuplicates(record.payload, record.file.sha256),
    }
    return HttpResponse.json(body)
  }),
]
