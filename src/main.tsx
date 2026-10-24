import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/inter'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/fraunces/wght-italic.css'
import './styles/app.css'
import App from './App'
import { registerScriptFonts } from './io/scriptFonts'
import { installMeasurer } from './io/measure'
import { paginate, useDoc } from './state/doc'

registerScriptFonts()
// Once a script's font arrives, lay the pages out again with its true widths and heights.
installMeasurer(() => { const s = useDoc.getState().script; if (s) useDoc.setState({ pagination: paginate(s) }) })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// Development builds expose the document store, for checking things from the browser console.
if (import.meta.env.DEV) (window as unknown as { pageone: unknown }).pageone = { useDoc }

// The launch splash (in index.html) stays long enough for its shine to cross, then fades away.
const splash = document.getElementById('splash')
if (splash) {
  window.setTimeout(() => {
    splash.classList.add('is-out')
    window.setTimeout(() => splash.remove(), 700)
  }, Math.max(400, 2300 - performance.now()))
}
