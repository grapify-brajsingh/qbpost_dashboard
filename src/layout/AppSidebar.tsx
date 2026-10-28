import { FileTextIcon, HistoryIcon, LogOutIcon, MoonIcon, SearchIcon, SunIcon, UserIcon, UsersIcon } from 'lucide-react'
import { useTheme } from 'next-themes'
import { NavLink, useLocation } from 'react-router'
import { useStats } from '@/api/queries/requests'
import { hasScope, useSession } from '@/auth/useSession'
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
} from '@/components/ui/sidebar'

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] ?? '?').slice(0, 2)).toUpperCase()
}

const ROLE_LABEL = { admin: 'Admin', editor: 'Editor', viewer: 'Viewer' } as const

const footerButton =
  'grid size-[30px] place-items-center rounded-md border border-[#1f2a3d] text-[#9fb0c8] hover:bg-sidebar-accent'

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

  return (
    <Sidebar collapsible="icon" aria-label="Main menu">
      <SidebarHeader>
        <div className="flex items-center gap-2.5 px-1 py-1.5 font-semibold text-white">
          <div className="grid size-7 shrink-0 place-items-center rounded-lg bg-linear-to-br from-[#22d3ee] to-[#0e7490] text-[13px] font-bold text-[#04202a] shadow-[0_0_18px_rgba(34,211,238,.35)]">
            Qb
          </div>
          <span className="group-data-[collapsible=icon]:hidden">QbAutopost</span>
        </div>
        <button
          type="button"
          onClick={onOpenSearch}
          className="flex items-center gap-2 rounded-lg border border-[#1f2a3d] px-2.5 py-1.5 text-[13px] text-[#7c8aa3] hover:bg-sidebar-accent group-data-[collapsible=icon]:hidden"
        >
          <SearchIcon className="size-[15px]" />
          Search or jump to…
          <kbd className="ml-auto rounded border border-[#2a3850] px-1.5 text-[11px]">Ctrl K</kbd>
        </button>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Work</SidebarGroupLabel>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={on('/statements')} tooltip="Statements">
                <NavLink to="/statements">
                  <FileTextIcon />
                  <span>Statements</span>
                </NavLink>
              </SidebarMenuButton>
              {toReview > 0 && (
                <SidebarMenuBadge
                  aria-label={`${toReview} to review`}
                  className="rounded-full bg-primary-soft px-2 text-[11px] text-sidebar-primary"
                >
                  {toReview}
                </SidebarMenuBadge>
              )}
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={on('/audit')} tooltip="Audit trail">
                <NavLink to="/audit">
                  <HistoryIcon />
                  <span>Audit trail</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup>
          <SidebarGroupLabel>{isAdmin ? 'Admin' : 'Account'}</SidebarGroupLabel>
          <SidebarMenu>
            {isAdmin && (
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={on('/users')} tooltip="Users">
                  <NavLink to="/users">
                    <UsersIcon />
                    <span>Users</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={on('/account')} tooltip="My account">
                <NavLink to="/account">
                  <UserIcon />
                  <span>My account</span>
                </NavLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <div className="flex items-center gap-2.5 border-t border-sidebar-border p-2.5">
          <div className="grid size-[30px] shrink-0 place-items-center rounded-full bg-[#1e3a52] text-xs font-semibold text-[#a5f3fc]">
            {initials(me?.displayName ?? '')}
          </div>
          <div className="min-w-0 text-sm leading-tight group-data-[collapsible=icon]:hidden">
            <div className="truncate text-white">{me?.displayName}</div>
            <small className="text-xs text-[#6b7a94]">{me ? ROLE_LABEL[me.role] : ''}</small>
          </div>
          <div className="ml-auto flex gap-1.5 group-data-[collapsible=icon]:hidden">
            <button
              type="button"
              aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}
              onClick={() => setTheme(dark ? 'light' : 'dark')}
              className={footerButton}
            >
              {dark ? <SunIcon className="size-[15px]" /> : <MoonIcon className="size-[15px]" />}
            </button>
            <button type="button" aria-label="Sign out" onClick={() => void signOut()} className={footerButton}>
              <LogOutIcon className="size-[15px]" />
            </button>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
