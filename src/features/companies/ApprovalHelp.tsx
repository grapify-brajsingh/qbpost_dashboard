import { ShieldAlertIcon } from 'lucide-react'
import type { Company } from '@/api/schema'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

/** What an admin does once per company so QuickBooks lets QbAutopost open the file without anyone signed in. */
export function ApprovalHelp({ companies }: { companies: readonly Company[] }) {
  if (companies.length === 0) return null
  return (
    <Alert variant="info">
      <ShieldAlertIcon aria-hidden />
      <AlertTitle>QuickBooks has not approved {companies.map((c) => c.displayName).join(', ')} yet</AlertTitle>
      <AlertDescription>
        <ol className="list-decimal space-y-0.5 pl-5">
          <li>Open that company file in QuickBooks as the admin user.</li>
          <li>Accept the QbAutopost certificate when QuickBooks asks.</li>
          <li>Choose "Yes, always; allow access even if QuickBooks is not running".</li>
          <li>Pick a QuickBooks user.</li>
          <li>Press Check access here.</li>
        </ol>
      </AlertDescription>
    </Alert>
  )
}
