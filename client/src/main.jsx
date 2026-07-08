import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router'
import './index.css'
import App from './App.jsx'

// HashRouter (not BrowserRouter): GitHub Pages serves static files, so hash
// URLs (/stockjs/#/stock/AAPL/committee) load index.html directly with no
// server-side 404 rewrite, and survive email-client link rewriting. See
// docs/deep-links-mobile-plan.md.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
)

// Dev-only: committee backtest, runnable from the browser console.
//   const report = await window.__stockjsBacktest()
if (import.meta.env.DEV) {
  import('./utils/backtest').then((m) => {
    window.__stockjsBacktest = m.runBacktest
    window.__stockjsBacktestDownload = m.downloadBacktestReport
  })
}
