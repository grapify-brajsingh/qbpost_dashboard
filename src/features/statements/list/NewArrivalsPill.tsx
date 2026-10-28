import { ArrowUpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function NewArrivalsPill({ count, onShow }: { count: number; onShow: () => void }) {
  return (
    <Button size="sm" className="h-7 rounded-full px-3 animate-in fade-in-0 zoom-in-95 duration-200" onClick={onShow}>
      <ArrowUpIcon aria-hidden />
      {count} new — show
    </Button>
  )
}
