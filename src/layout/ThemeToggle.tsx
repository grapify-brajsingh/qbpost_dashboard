import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'

const ORDER = ['light', 'dark', 'system'] as const
type Choice = (typeof ORDER)[number]

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const current: Choice = ORDER.find((t) => t === theme) ?? 'system'
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]
  const Icon = current === 'light' ? SunIcon : current === 'dark' ? MoonIcon : MonitorIcon
  return (
    <Button variant="ghost" size="icon" aria-label={`Theme: ${current}. Switch to ${next}.`} onClick={() => setTheme(next)}>
      <Icon />
    </Button>
  )
}
