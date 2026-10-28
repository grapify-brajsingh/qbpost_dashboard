import { Button } from '@/components/ui/button'

export function NewArrivalsPill({ count, onShow }: { count: number; onShow: () => void }) {
  return (
    <Button size="sm" className="rounded-full" onClick={onShow}>
      {count} new — show
    </Button>
  )
}
