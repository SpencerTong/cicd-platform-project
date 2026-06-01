import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

// StrictMode activates extra development-only checks in React.
// It has no effect in production builds.
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
