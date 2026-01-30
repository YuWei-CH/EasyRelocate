import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import ComparePage from './pages/ComparePage'
import LandingPage from './pages/LandingPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}

