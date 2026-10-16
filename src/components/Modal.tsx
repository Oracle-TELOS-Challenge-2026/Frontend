import { useId } from 'react'
import type { ReactNode } from 'react'
import { useDialog } from '../hooks/useDialog'
import { Icon } from './Icon'

export function Modal({ title, onClose, className = '', children }: { title: string; onClose: () => void; className?: string; children: ReactNode }) {
  const ref = useDialog()
  const titleId = useId()
  return <dialog ref={ref} className={`modal ${className}`} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); onClose() }} onClick={(event) => {
    if (event.target !== event.currentTarget) return
    const bounds = event.currentTarget.getBoundingClientRect()
    if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose()
  }}>
    <div className="modal-heading"><h2 id={titleId}>{title}</h2><button type="button" className="icon-button" aria-label="닫기" onClick={onClose}><Icon name="close" /></button></div>
    {children}
  </dialog>
}
