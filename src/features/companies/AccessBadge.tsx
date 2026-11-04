import type { CompanyAccess } from '@/api/schema'
import { Badge } from '@/components/ui/badge'
import { accessView } from './companiesView'

/** QuickBooks access of one company: an icon and a word, never colour alone. */
export function AccessBadge({ access }: { access: CompanyAccess }) {
  const { label, variant, icon: Icon } = accessView(access)
  return (
    <Badge variant={variant}>
      <Icon aria-hidden />
      {label}
    </Badge>
  )
}
