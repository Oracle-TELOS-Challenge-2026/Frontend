export function LoadingIndicator({ label, page = false }: { label: string; page?: boolean }) {
  return <div className={`loading-indicator${page ? ' loading-page' : ''}`} role="status"><span className="loading-spinner" aria-hidden="true" /><span className="sr-only">{label}</span></div>
}
