import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
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
