/**
 * App Root Component — defines route layouts using react-router-dom.
 */

import { Routes, Route } from 'react-router-dom'
import { LandingPage } from './pages/LandingPage'
import { Dashboard } from './pages/Dashboard'

function App() {
  return (
    <Routes>
      {/* Product Website Landing Page */}
      <Route path="/" element={<LandingPage />} />
      
      {/* Desktop Dashboard Area */}
      <Route path="/app" element={<Dashboard />} />
    </Routes>
  )
}

export default App
