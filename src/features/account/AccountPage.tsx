import { useState } from 'react'
import { useTheme } from 'next-themes'
import { ChangePasswordForm } from '@/auth/ChangePasswordPage'
import { useSession } from '@/auth/useSession'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

const ROLE_LABEL = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' } as const
const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'Match computer' },
] as const

export function AccountPage() {
  const { me } = useSession()
  const { theme, setTheme } = useTheme()
  const [changed, setChanged] = useState(false)
  if (!me) return null
  return (
    <div className="max-w-3xl space-y-6 p-6 md:px-7">
      <div>
        <h1 className="text-[22px] font-semibold tracking-tight">My account</h1>
        <p className="mt-1 text-muted-foreground">Your details, how the dashboard looks, and your password.</p>
      </div>

      <section className="space-y-3 rounded-[10px] border bg-card p-5" aria-labelledby="account-details">
        <h2 id="account-details" className="text-base font-semibold">
          Your details
        </h2>
        <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
          <dt className="text-muted-foreground">Name</dt>
          <dd>{me.displayName}</dd>
          <dt className="text-muted-foreground">Email</dt>
          <dd>{me.email}</dd>
          <dt className="text-muted-foreground">Role</dt>
          <dd>{ROLE_LABEL[me.role]}</dd>
        </dl>
      </section>

      <section className="space-y-3 rounded-[10px] border bg-card p-5" aria-labelledby="account-theme">
        <h2 id="account-theme" className="text-base font-semibold">
          Appearance
        </h2>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-label="Theme"
          value={theme ?? 'system'}
          onValueChange={(v) => v && setTheme(v)}
        >
          {THEMES.map((t) => (
            <ToggleGroupItem key={t.value} value={t.value}>
              {t.label}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </section>

      <section className="space-y-3 rounded-[10px] border bg-card p-5" aria-labelledby="account-password">
        <h2 id="account-password" className="text-base font-semibold">
          Change password
        </h2>
        {changed && (
          <p role="status" className="text-sm text-success">
            Password changed.
          </p>
        )}
        <ChangePasswordForm onChanged={() => setChanged(true)} />
      </section>
    </div>
  )
}
