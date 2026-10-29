import { api } from '../client'
import type { Me } from '../schema'

export interface LoginResponse {
  accessToken: string
  expiresUtc: string
  user: Me
}

export const login = (email: string, password: string) =>
  api.post<LoginResponse>('/auth/login', { email, password }).then((r) => r.data)

export const fetchMe = () => api.get<Me>('/auth/me').then((r) => r.data)

export const logout = () => api.post<void>('/auth/logout').then(() => undefined)

/** The API rotates the session on a password change: the answer carries the new access token, as sign-in does. */
export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post<LoginResponse>('/auth/change-password', { currentPassword, newPassword }).then((r) => r.data)
