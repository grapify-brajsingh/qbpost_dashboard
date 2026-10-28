import { Button } from '@/components/ui/button'

export function ClearFilters({ onClear, disabled }: { onClear: () => void; disabled?: boolean }) {
  return (
    <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={disabled}>
      Clear filters
    </Button>
  )
}
