import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import LandingPage from '@/pages/landing/LandingPage.jsx'
import BoardPage from '@/pages/board/BoardPage.jsx'
import { WipeProvider } from './page-wipe'
import { Mascot } from '@/features/mascot'

// Two pages: the landing page and the board. The old /intro instructions page
// is now the mascot's job (it walks first-time visitors through the board), so
// that URL simply forwards there. The mascot is mounted once, outside the
// pages, so it is the same dog walking from one page to the next.
function App() {
    return (
        <MotionConfig reducedMotion="user">
            <BrowserRouter>
                <WipeProvider>
                    <Routes>
                        <Route path="/" element={<LandingPage />} />
                        <Route path="/hexagons" element={<BoardPage />} />
                        <Route path="/intro" element={<Navigate to="/hexagons" replace />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                    <Mascot />
                </WipeProvider>
            </BrowserRouter>
        </MotionConfig>
    )
}

export default App
