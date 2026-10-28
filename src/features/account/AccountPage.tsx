import { useState } from 'react'
import { CheckCircle2Icon, MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { ChangePasswordForm } from '@/auth/ChangePasswordPage'
import { useSession } from '@/auth/useSession'
import { PageHeader } from '@/components/PageHeader'
import { SettingsSection } from '@/components/SettingsSection'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const ROLE_LABEL = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' } as const
const ROLE_HELP = {
  admin: 'You can review, edit and post statements, restore discarded ones, resolve uncertain posts, and manage users.',
  editor: 'You can review, edit, discard and post statements.',
  viewer: 'You can read statements and the audit trail, but not change them.',
} as const
const THEMES = [
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'Match computer', icon: MonitorIcon },
] as const

export function AccountPage() {
  const { me } = useSession()
  const { theme, setTheme } = useTheme()
  const [changed, setChanged] = useState(false)
  if (!me) return null
  return (
    <div className="page max-w-4xl">
      <PageHeader title="My account" description="Your details, how the dashboard looks, and your password." />

      <div className="rounded-lg border bg-card px-5 py-7 sm:px-7">
        <SettingsSection title="Your details" description="Ask an admin to change your name or role.">
          <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-y-3 text-sm">
            <dt className="text-muted-foreground">Name</dt>
            <dd className="font-medium">{me.displayName}</dd>
            <dt className="text-muted-foreground">Email</dt>
            <dd className="break-all">{me.email}</dd>
            <dt className="text-muted-foreground">Role</dt>
            <dd>{ROLE_LABEL[me.role]}</dd>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">{ROLE_HELP[me.role]}</p>
        </SettingsSection>

        <SettingsSection title="Appearance" description="Saved in this browser.">
          <ToggleGroup
            type="single"
            variant="outline"
            aria-label="Theme"
            value={theme ?? 'system'}
            onValueChange={(v) => v && setTheme(v)}
            className="flex-wrap"
          >
            {THEMES.map((t) => (
              <ToggleGroupItem key={t.value} value={t.value} className="gap-1.5 px-3 data-[state=on]:bg-primary-soft data-[state=on]:text-primary">
                <t.icon aria-hidden />
                {t.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </SettingsSection>

        <SettingsSection title="Change password" description="Enter your current password, then the new one twice.">
          {changed && (
            <p role="status" className="mb-4 flex items-center gap-2 text-sm text-success animate-in fade-in-0 duration-200">
              <CheckCircle2Icon className="size-4" aria-hidden />
              Password changed.
            </p>
          )}
          <div className="max-w-sm">
            <ChangePasswordForm onChanged={() => setChanged(true)} />
          </div>
        </SettingsSection>
      </div>
    </div>
  )
}
