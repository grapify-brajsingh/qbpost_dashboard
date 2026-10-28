import type { HttpHandler } from 'msw'
import { authHandlers } from './auth'
import { requestHandlers } from './requests'
import { supportHandlers } from './support'
import { userHandlers } from './users'

export const handlers: HttpHandler[] = [...authHandlers, ...requestHandlers, ...userHandlers, ...supportHandlers]
