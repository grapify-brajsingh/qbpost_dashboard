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

export const changePassword = (currentPassword: string, newPassword: string) =>
  api.post<void>('/auth/change-password', { currentPassword, newPassword }).then(() => undefined)
