import { useMemo, useState } from 'react'
import { Outlet } from 'react-router'
import { Separator } from '@/components/ui/separator'
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
            <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur-md md:px-6">
              <SidebarTrigger aria-label="Menu" className="text-muted-foreground" />
              <Separator orientation="vertical" className="mr-1 data-[orientation=vertical]:h-5" />
              <Breadcrumb />
              <div className="ml-auto flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
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
