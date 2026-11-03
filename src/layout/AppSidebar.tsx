import { FileTextIcon, HistoryIcon, LayoutDashboardIcon, ListIcon, LogOutIcon, MoonIcon, SearchIcon, SunIcon, UserIcon, UsersIcon, type LucideIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { NavLink, useLocation } from 'react-router'
import { useStats } from '@/api/queries/requests'
import { hasScope, useSession } from '@/auth/useSession'
import { BrandMark } from '@/components/BrandMark'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)).toUpperCase()
}

const ROLE_LABEL = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' } as const

function NavItem({ to, icon: Icon, label, active }: { to: string; icon: LucideIcon; label: string; active: boolean }) {
  const { isMobile, setOpenMobile } = useSidebar()
  return (
    <SidebarMenuButton
      asChild
      isActive={active}
      tooltip={label}
      className="h-9 data-[active=true]:text-primary data-[active=true]:shadow-[inset_2px_0_0_var(--primary)]"
    >
      {/* On phones the menu is a sheet: close it once a page is picked. */}
      <NavLink to={to} end={to === '/'} onClick={() => isMobile && setOpenMobile(false)}>
        <Icon />
        <span>{label}</span>
      </NavLink>
    </SidebarMenuButton>
  )
}

export function AppSidebar({ onOpenSearch }: { onOpenSearch(): void }) {
  const { me, signOut } = useSession()
  const { pathname } = useLocation()
  const { resolvedTheme, setTheme } = useTheme()
  const isAdmin = hasScope(me, 'users:manage')
  const { data: stats } = useStats()

  // Statements still to review; admins also see statements that need a decision (partial, unknown).
  const toReview = stats ? stats.byStatus.pending + (isAdmin ? stats.byStatus.partial + stats.byStatus.unknown : 0) : 0
  const on = (prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  const dark = resolvedTheme === 'dark'
  const themeLabel = dark ? 'Switch to light theme' : 'Switch to dark theme'

  return (
    <Sidebar collapsible="icon" aria-label="Main menu">
      <SidebarHeader className="gap-3 px-3 pt-4">
        <div className="flex items-center gap-2.5 px-0.5 group-data-[collapsible=icon]:px-0">
          <BrandMark className="size-7 shrink-0" />
          <div className="grid leading-tight group-data-[collapsible=icon]:hidden">
            <span className="text-[15px] font-semibold tracking-[-0.01em] text-foreground">QbAutopost</span>
            <span className="text-xs text-muted-foreground">Statement review</span>
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex h-9 items-center gap-2 rounded-md border border-input bg-card px-2.5 text-[13px] text-muted-foreground shadow-xs transition-colors duration-150 outline-none hover:border-ring/40 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 group-data-[collapsible=icon]:hidden"
        >
          <SearchIcon className="size-4" aria-hidden />
          Search or jump to…
          <kbd className="ml-auto rounded border bg-muted px-1.5 font-sans text-[11px] text-muted-foreground">Ctrl K</kbd>
        </button>
      </SidebarHeader>
      <SidebarContent className="px-1">
        <SidebarGroup>
          <SidebarGroupLabel>Work</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <NavItem to="/" icon={LayoutDashboardIcon} label="Home" active={pathname === '/'} />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <NavItem to="/statements" icon={FileTextIcon} label="Statements" active={on('/statements')} />
              {toReview > 0 && (
                <SidebarMenuBadge
                  aria-label={`${toReview} to review`}
                  className="top-2 rounded-full bg-primary-soft px-1.5 text-[11px] font-semibold text-primary tabular-nums"
                >
                  {toReview}
                </SidebarMenuBadge>
              )}
            </SidebarMenuItem>
            <SidebarMenuItem>
              <NavItem to="/audit" icon={HistoryIcon} label="Audit trail" active={on('/audit')} />
            </SidebarMenuItem>
            <SidebarMenuItem>
              <NavItem to="/lists" icon={ListIcon} label="Lists" active={on('/lists')} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{isAdmin ? 'Admin' : 'Account'}</SidebarGroupLabel>
          <SidebarMenu>
            {isAdmin && (
              <SidebarMenuItem>
                <NavItem to="/users" icon={UsersIcon} label="Users" active={on('/users')} />
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <NavItem to="/account" icon={UserIcon} label="My account" active={on('/account')} />
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-3 group-data-[collapsible=icon]:p-2">
        <div className="flex items-center gap-2.5">
          <Avatar className="size-8 group-data-[collapsible=icon]:hidden">
            <AvatarFallback className="bg-primary-soft text-xs font-semibold text-primary">
              {initials(me?.displayName ?? '')}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1 text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <div className="truncate font-medium text-foreground">{me?.displayName}</div>
            <div className="text-xs text-muted-foreground">{me ? ROLE_LABEL[me.role] : ''}</div>
          </div>
          <div className="flex gap-0.5 group-data-[collapsible=icon]:flex-col">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={themeLabel} onClick={() => setTheme(dark ? 'light' : 'dark')}>
                  {dark ? <SunIcon /> : <MoonIcon />}
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">{themeLabel}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="Sign out" onClick={() => void signOut()}>
                  <LogOutIcon />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Sign out</TooltipContent>
            </Tooltip>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
