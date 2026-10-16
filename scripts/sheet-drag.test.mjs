import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useSheetDrag } from '../src/hooks/useSheetDrag.ts'

function captureDrag(expanded = false) {
  const changes = []
  let handlers
  function Capture() {
    handlers = useSheetDrag(expanded, (value) => changes.push(value))
    return null
  }
  renderToStaticMarkup(createElement(Capture))
  return { handlers, changes }
}

function pointer(clientY) {
  return { clientY, pointerId: 1, currentTarget: { setPointerCapture() {} } }
}

test('tapping the handle or clicking from the keyboard toggles the sheet', () => {
  for (const expanded of [false, true]) {
    const { handlers, changes } = captureDrag(expanded)
    handlers.onPointerDown(pointer(100))
    handlers.onPointerUp(pointer(100))
    handlers.onClick()
    assert.deepEqual(changes, [!expanded])

    changes.length = 0
    handlers.onClick()
    assert.deepEqual(changes, [!expanded])
  }
})

test('only drags beyond 25px expand upward or collapse downward without toggling twice', () => {
  for (const distance of [-26, -25, 25, 26]) {
    const { handlers, changes } = captureDrag()
    handlers.onPointerDown(pointer(100))
    handlers.onPointerUp(pointer(100 + distance))
    assert.deepEqual(changes, Math.abs(distance) > 25 ? [distance < 0] : [])

    handlers.onClick()
    assert.deepEqual(changes, [Math.abs(distance) > 25 ? distance < 0 : true])
  }
})

test('a canceled gesture clears its start point and allows the next click', () => {
  const { handlers, changes } = captureDrag()
  handlers.onPointerDown(pointer(100))
  handlers.onPointerCancel()
  handlers.onPointerUp(pointer(0))
  assert.deepEqual(changes, [])
  handlers.onClick()
  assert.deepEqual(changes, [true])

  changes.length = 0
  handlers.onPointerDown(pointer(100))
  handlers.onPointerUp(pointer(0))
  handlers.onPointerCancel()
  handlers.onClick()
  assert.deepEqual(changes, [true, true])
})
