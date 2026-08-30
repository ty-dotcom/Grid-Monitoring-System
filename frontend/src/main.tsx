import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import GridApp from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GridApp />
  </StrictMode>,
)
