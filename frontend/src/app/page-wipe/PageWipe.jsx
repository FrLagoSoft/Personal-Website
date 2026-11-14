import { useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { audio } from '@/features/sound'
import { clamp } from '@/shared/utils/math.js'
import { WipeContext } from './useWipe.js'
import './page-wipe.css'

// Page transition: hexagons grow from the point you clicked until they cover
// the screen, the route changes underneath, then they shrink away again.
// Pages trigger it through useWipe() (see useWipe.js).

const R = 62                    // cell radius (centre to top corner)
const CW = R * Math.sqrt(3)     // cell width
const COVER_MS = 620
const REVEAL_MS = 680
const SPREAD = 0.6              // how much of the time is spent on the travelling edge
const SHADES = ['#10231A', '#16301F', '#1B3A27', '#12281D']

export function WipeProvider({ children }) {
    const canvasRef = useRef(null)
    const busy = useRef(false)
    const navigate = useNavigate()

    const run = useCallback((origin, duration, covering) => new Promise(resolve => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        const dpr = Math.min(window.devicePixelRatio || 1, 2)
        const w = window.innerWidth, h = window.innerHeight
        canvas.width = w * dpr; canvas.height = h * dpr
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        const far = Math.max(
            Math.hypot(origin.x, origin.y), Math.hypot(w - origin.x, origin.y),
            Math.hypot(origin.x, h - origin.y), Math.hypot(w - origin.x, h - origin.y),
        )
        const t0 = performance.now()

        const frame = now => {
            const P = clamp((now - t0) / duration)
            ctx.clearRect(0, 0, w, h)
            for (let row = -1; row * R * 1.5 < h + R; row++) {
                for (let col = -1; col * CW < w + CW; col++) {
                    const cx = col * CW + (row & 1 ? CW / 2 : 0), cy = row * R * 1.5
                    const local = clamp((P - (Math.hypot(cx - origin.x, cy - origin.y) / far) * SPREAD) / (1 - SPREAD))
                    // Slightly over 1 at full size so neighbours overlap and no gaps show.
                    const size = (covering ? 1 - (1 - local) ** 3 : 1 - local ** 3) * 1.08
                    if (size <= 0.01) continue
                    ctx.beginPath()
                    for (let i = 0; i < 6; i++) {
                        const a = Math.PI / 6 + (i * Math.PI) / 3
                        ctx.lineTo(cx + Math.cos(a) * R * size, cy + Math.sin(a) * R * size)
                    }
                    ctx.closePath()
                    ctx.fillStyle = SHADES[(col * 7 + row * 13 + 400) % SHADES.length]
                    ctx.fill()
                }
            }
            if (P < 1) requestAnimationFrame(frame)
            else resolve()
        }
        requestAnimationFrame(frame)
    }), [])

    const go = useCallback(async (to, origin) => {
        if (busy.current) return
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        if (calm) { navigate(to); return }
        busy.current = true
        const canvas = canvasRef.current
        const from = origin ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 }
        canvas.style.display = 'block'
        audio.wipe()
        await run(from, COVER_MS, true)
        navigate(to)
        // Give the next page a moment to mount and lay out behind the cover.
        await new Promise(r => setTimeout(r, 140))
        await run({ x: window.innerWidth / 2, y: window.innerHeight / 2 }, REVEAL_MS, false)
        canvas.style.display = 'none'
        busy.current = false
    }, [navigate, run])

    // If the visitor uses the browser's back button mid-wipe, never leave the cover up.
    useEffect(() => () => { busy.current = false }, [])

    return (
        <WipeContext.Provider value={go}>
            {children}
            <canvas ref={canvasRef} className="wipe" aria-hidden="true" />
        </WipeContext.Provider>
    )
}
