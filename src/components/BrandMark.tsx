/** The QbAutopost mark: two rules under a figure, the bookkeeper's sign for a final total. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 28 28" aria-hidden className={className}>
      <rect width="28" height="28" rx="7" fill="var(--primary)" />
      <path d="M8 9.5h12M8 13.5h8" stroke="var(--primary-foreground)" strokeWidth="2" strokeLinecap="round" opacity=".55" />
      <path d="M8 18h12M8 21h12" stroke="var(--primary-foreground)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}
