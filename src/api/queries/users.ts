import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { Page, Role, User, UserAuditRow } from '../schema'
import { api } from '../client'

export const USERS_PAGE_SIZE = 25

export interface UsersParams {
  q?: string
  role?: Role
  /** `false` hides disabled users; leave out to list everyone. */
  disabled?: boolean
  page?: number
}

export const userKeys = {
  all: ['users'] as const,
  list: (params: UsersParams) => [...userKeys.all, 'list', params] as const,
  detail: (id: string) => [...userKeys.all, 'detail', id] as const,
  audit: (id: string) => [...userKeys.all, 'detail', id, 'audit'] as const,
}

function listQuery(params: UsersParams): string {
  const qs = new URLSearchParams()
  if (params.q) qs.set('q', params.q)
  if (params.role) qs.set('role', params.role)
  if (params.disabled !== undefined) qs.set('disabled', String(params.disabled))
  if (params.page && params.page > 1) qs.set('page', String(params.page))
  qs.set('pageSize', String(USERS_PAGE_SIZE))
  return qs.toString()
}

export function useUsers(params: UsersParams) {
  return useQuery<Page<User>>({
    queryKey: userKeys.list(params),
    queryFn: ({ signal }) => api.get<Page<User>>(`/users?${listQuery(params)}`, { signal }).then((r) => r.data),
    placeholderData: keepPreviousData,
  })
}

export interface UserWithEtag {
  user: User
  etag: string
}

export function useUser(id: string) {
  return useQuery<UserWithEtag>({
    queryKey: userKeys.detail(id),
    queryFn: async ({ signal }) => {
      const r = await api.get<User>(`/users/${id}`, { signal })
      return { user: r.data, etag: r.headers.get('ETag') ?? '' }
    },
  })
}

export function useUserAudit(id: string) {
  return useQuery<UserAuditRow[]>({
    queryKey: userKeys.audit(id),
    queryFn: ({ signal }) => api.get<UserAuditRow[]>(`/users/${id}/audit`, { signal }).then((r) => r.data),
  })
}

export interface CreateUserInput {
  email: string
  displayName: string
  role: Role
}

/**
 * The temporary password is handed to `onPassword` and never returned, so it does not
 * end up in the mutation cache (data or variables).
 */
export interface PasswordSink {
  onPassword: (temporaryPassword: string) => void
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ input, onPassword }: { input: CreateUserInput } & PasswordSink): Promise<User> => {
      const { temporaryPassword, ...user } = (await api.post<User & { temporaryPassword: string }>('/users', input)).data
      onPassword(temporaryPassword)
      return user
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export interface UserPatch {
  displayName?: string
  role?: Role
  disabled?: boolean
}

/** `etag` is the ETag of the user on screen. */
export function usePatchUser(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ patch, etag }: { patch: UserPatch; etag: string }) =>
      api.patch<User>(`/users/${id}`, patch, { headers: { 'If-Match': etag } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export function useResetPassword(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ onPassword }: PasswordSink): Promise<void> => {
      onPassword((await api.post<{ temporaryPassword: string }>(`/users/${id}/reset-password`)).data.temporaryPassword)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}

export function useUnlock(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => api.post<User>(`/users/${id}/unlock`),
    onSuccess: () => qc.invalidateQueries({ queryKey: userKeys.all }),
  })
}
