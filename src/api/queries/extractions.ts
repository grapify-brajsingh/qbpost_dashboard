import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Extraction, Payload, RequestDetail } from '../schema'
import { api } from '../client'
import { requestKeys } from './requests'

/** Reading a statement takes 10–40 s; the API gives up at 120 s (R-13.11). */
export const EXTRACT_TIMEOUT_MS = 150_000

/** `POST /statement-extractions`: reads one PDF, saves nothing. Pass a signal so Cancel aborts it. */
export function useExtractPdf() {
  return useMutation({
    mutationFn: async ({ file, signal }: { file: File; signal?: AbortSignal }) => {
      const form = new FormData()
      form.append('file', file, file.name)
      const r = await api.post<Extraction>('/statement-extractions', form, { timeoutMs: EXTRACT_TIMEOUT_MS, signal })
      return r.data
    },
  })
}

export interface SaveUploadBody {
  extractionId: string
  reference: string
  controlTotal: number | null
  transactions: Payload['transactions']
}

/** `POST /saved-requests` with `upload.extractionId` (R-14): the reviewed rows become a statement. */
export function useSaveUpload() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ extractionId, ...payload }: SaveUploadBody) => {
      const r = await api.post<RequestDetail>('/saved-requests', { ...payload, upload: { extractionId } })
      return r.data
    },
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: requestKeys.all }), qc.invalidateQueries({ queryKey: ['audit'] })]),
  })
}
