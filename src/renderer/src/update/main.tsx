import './update.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import UpdateApp from './UpdateApp'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <UpdateApp />
  </StrictMode>
)
