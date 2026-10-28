import { useEffect, useState } from 'react'
import { FileTextIcon, HistoryIcon, UserIcon, UsersIcon, type LucideIcon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { useRequestsList } from '@/api/queries/requests'
import { hasScope, useSession } from '@/auth/useSession'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'

const SEARCH_DEBOUNCE_MS = 200

interface PageEntry {
  label: string
  to: string
  icon: LucideIcon
  adminOnly?: boolean
}

const PAGES: PageEntry[] = [
  { label: 'Statements', to: '/statements', icon: FileTextIcon },
  { label: 'Audit trail', to: '/audit', icon: HistoryIcon },
  { label: 'Users', to: '/users', icon: UsersIcon, adminOnly: true },
  { label: 'My account', to: '/account', icon: UserIcon },
]

export function CommandMenu({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        onOpenChange(!open)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onOpenChange])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader className="sr-only">
        <DialogTitle>Search or jump to</DialogTitle>
        <DialogDescription>Find a statement or go to a page.</DialogDescription>
      </DialogHeader>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <CommandBody close={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

/** Mounted only while the dialog is open, so the search state resets and nothing is fetched when closed. */
function CommandBody({ close }: { close(): void }) {
  const { me } = useSession()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [text])
  const { data } = useRequestsList({ q: q || undefined, pageSize: 8 })

  const needle = text.trim().toLowerCase()
  const pages = PAGES.filter(
    (p) => (!p.adminOnly || hasScope(me, 'users:manage')) && p.label.toLowerCase().includes(needle),
  )
  const go = (to: string) => {
    close()
    void navigate(to)
  }

  return (
    // The server does the statement search; cmdk must not filter its results again.
    <Command shouldFilter={false}>
      <CommandInput placeholder="Search by reference, sender or subject…" value={text} onValueChange={setText} />
      <CommandList>
        <CommandEmpty>Nothing found.</CommandEmpty>
        {data && data.items.length > 0 && (
          <CommandGroup heading={q ? 'Statements' : 'Recent statements'}>
            {data.items.map((r) => (
              <CommandItem key={r.id} value={`statement-${r.id}`} onSelect={() => go(`/statements/${r.id}`)}>
                <FileTextIcon />
                <span className="num font-mono text-xs">{r.publicRef}</span>
                <span className="truncate text-muted-foreground">{r.email?.subject ?? r.reference ?? ''}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {pages.length > 0 && (
          <CommandGroup heading="Pages">
            {pages.map((p) => (
              <CommandItem key={p.to} value={`page-${p.to}`} onSelect={() => go(p.to)}>
                <p.icon />
                {p.label}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  )
}
