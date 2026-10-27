import { ChevronDownIcon } from 'lucide-react'
import { Link, NavLink } from 'react-router'
import { hasScope, useSession } from '@/auth/useSession'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { DbHealthLight } from './DbHealthLight'
import { ThemeToggle } from './ThemeToggle'

const navClass = ({ isActive }: { isActive: boolean }) =>
  cn('rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent', isActive && 'bg-accent')

export function TopBar() {
  const { me, signOut } = useSession()
  return (
    <header className="flex h-14 items-center gap-4 border-b px-6">
      <span className="text-base font-semibold">QbAutopost</span>
      <nav className="flex items-center gap-1" aria-label="Main">
        <NavLink to="/requests" className={navClass}>
          Requests
        </NavLink>
        {hasScope(me, 'users:manage') && (
          <NavLink to="/users" className={navClass}>
            Users
          </NavLink>
        )}
      </nav>
      <div className="ml-auto flex items-center gap-3">
        <DbHealthLight />
        <ThemeToggle />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost">
              {me?.displayName}
              <ChevronDownIcon />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link to="/change-password">Change password</Link>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => void signOut()}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
