import { useRef } from 'react'
import type { PointerEvent } from 'react'

export function useSheetDrag(expanded: boolean, onExpandedChange: (expanded: boolean) => void) {
  const pointerStart = useRef<number | null>(null)
  const dragged = useRef(false)

  return {
    onPointerDown: (event: PointerEvent<HTMLButtonElement>) => {
      pointerStart.current = event.clientY
      dragged.current = false
      event.currentTarget.setPointerCapture(event.pointerId)
    },
    onPointerUp: (event: PointerEvent<HTMLButtonElement>) => {
      if (pointerStart.current !== null && Math.abs(event.clientY - pointerStart.current) > 25) {
        onExpandedChange(event.clientY < pointerStart.current)
        dragged.current = true
      }
      pointerStart.current = null
    },
    onClick: () => {
      if (!dragged.current) onExpandedChange(!expanded)
      dragged.current = false
    },
  }
}
