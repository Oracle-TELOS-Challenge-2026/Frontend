import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import test from 'node:test'
import * as jsxRuntime from 'react/jsx-runtime'
import ts from 'typescript'

const compiled = ts.transpileModule(readFileSync(new URL('../src/components/AppLayout.tsx', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
}).outputText

function mount(viewport) {
  const effects = [], properties = new Map(), listeners = new Map(), viewportListeners = new Map()
  const stage = { style: { setProperty: (key, value) => properties.set(key, value), removeProperty: (key) => properties.delete(key) } }
  let refIndex = 0
  const window = { innerHeight: 852, addEventListener: (key, handler) => listeners.set(key, handler), removeEventListener: (key) => listeners.delete(key) }
  if (viewport) window.visualViewport = { ...viewport, addEventListener: (key, handler) => viewportListeners.set(key, handler), removeEventListener: (key) => viewportListeners.delete(key) }
  const exports = {}
  runInContext(compiled, createContext({ exports, window, require: (name) => {
    if (name === 'react') return { useRef: () => ({ current: refIndex++ === 0 ? stage : { scrollTo() {} } }), useLayoutEffect: (setup) => effects.push(setup) }
    if (name === 'react/jsx-runtime') return jsxRuntime
    if (name === 'react-router-dom') return { useLocation: () => ({ pathname: '/owner' }), Link: () => null }
    return Object.fromEntries(['Brand', 'BottomNav', 'DesktopIntro', 'Icon', 'AccountActions'].map((key) => [key, () => null]))
  } }))
  exports.AppLayout({ children: null, toast: null, hasUnread: false, notificationCount: 0, onSwitch() {} })
  const cleanups = effects.map((setup) => setup())
  return { window, listeners, viewportListeners, height: () => properties.get('--app-height'), unmount: () => cleanups.forEach((cleanup) => cleanup?.()) }
}

test('app fits the visible height on opening, viewport resizing and returning to the page', () => {
  const app = mount({ height: 780, scale: 1 })
  assert.equal(app.height(), '780px')
  app.window.visualViewport.height = 450
  app.viewportListeners.get('resize')()
  assert.equal(app.height(), '450px')
  app.window.innerHeight = 760
  app.window.visualViewport.height = 800
  app.listeners.get('resize')()
  assert.equal(app.height(), '760px')
  app.window.innerHeight = 852
  app.listeners.get('pageshow')()
  assert.equal(app.height(), '800px')
  app.unmount()
  assert.equal(app.height(), undefined)
  assert.equal(app.listeners.size, 0)
  assert.equal(app.viewportListeners.size, 0)
})

test('pinch zoom and transient zero-height viewports do not shrink the app layout', () => {
  const app = mount({ height: 780, scale: 1 })
  app.window.visualViewport.height = 390
  app.window.visualViewport.scale = 2
  app.viewportListeners.get('resize')()
  assert.equal(app.height(), '780px')
  app.window.visualViewport.scale = 1
  app.window.visualViewport.height = 0
  app.viewportListeners.get('resize')()
  assert.equal(app.height(), '780px')
  app.window.visualViewport.height = 780
  app.viewportListeners.get('resize')()
  assert.equal(app.height(), '780px')
})

test('browsers without VisualViewport use the window height', () => {
  const app = mount()
  assert.equal(app.height(), '852px')
  app.window.innerHeight = 700
  app.listeners.get('resize')()
  assert.equal(app.height(), '700px')
  app.unmount()
})
