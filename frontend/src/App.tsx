import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import ComparePage from './pages/ComparePage'
import LandingPage from './pages/LandingPage'
import OnboardingExtensionPage from './pages/OnboardingExtensionPage'
import OnboardingTokenPage from './pages/OnboardingTokenPage'

export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/onboarding/extension" element={<OnboardingExtensionPage />} />
        <Route path="/onboarding/token" element={<OnboardingTokenPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  )
}
