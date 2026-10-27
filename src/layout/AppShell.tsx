import { Outlet } from 'react-router'
import { TooltipProvider } from '@/components/ui/tooltip'
import { TopBar } from './TopBar'

export function AppShell() {
  return (
    <TooltipProvider>
      <TopBar />
      <main>
        <Outlet />
      </main>
    </TooltipProvider>
  )
}
