import type { HttpHandler } from 'msw'
import { auditHandlers } from './audit'
import { companyHandlers } from './companies'
import { dashboardHandlers } from './dashboard'
import { authHandlers } from './auth'
import { extractionHandlers } from './extractions'
import { requestHandlers } from './requests'
import { supportHandlers } from './support'
import { userHandlers } from './users'

export const handlers: HttpHandler[] = [...authHandlers, ...auditHandlers, ...dashboardHandlers, ...requestHandlers, ...extractionHandlers, ...userHandlers, ...supportHandlers, ...companyHandlers]
