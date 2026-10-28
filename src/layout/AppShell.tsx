import { useMemo, useState } from 'react'
import { Outlet } from 'react-router'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppSidebar } from './AppSidebar'
import { Breadcrumb } from './Breadcrumb'
import { CommandMenu } from './CommandMenu'
import { DbHealthLight } from './DbHealthLight'
import { BreadcrumbContext } from './useBreadcrumb'

export function AppShell() {
  const [searchOpen, setSearchOpen] = useState(false)
  const [title, setTitle] = useState<string | null>(null)
  const crumbs = useMemo(() => ({ title, setTitle }), [title])
  return (
    <TooltipProvider>
      <BreadcrumbContext.Provider value={crumbs}>
        <SidebarProvider>
          <AppSidebar onOpenSearch={() => setSearchOpen(true)} />
          <SidebarInset className="min-w-0">
            <header className="flex h-14 items-center gap-3 border-b bg-card px-4 md:px-7">
              <SidebarTrigger aria-label="Menu" />
              <Breadcrumb />
              <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                <DbHealthLight />
                <span className="hidden sm:inline">API and database</span>
              </div>
            </header>
            <main className="min-w-0 flex-1">
              <Outlet />
            </main>
          </SidebarInset>
          <CommandMenu open={searchOpen} onOpenChange={setSearchOpen} />
        </SidebarProvider>
      </BreadcrumbContext.Provider>
    </TooltipProvider>
  )
}
