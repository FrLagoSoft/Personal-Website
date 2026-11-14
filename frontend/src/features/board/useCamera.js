import { useCallback, useEffect, useMemo, useRef } from 'react'
import { animate, useMotionValue } from 'framer-motion'
import { clamp } from '@/shared/utils/math.js'

export const MIN_ZOOM = 0.2
export const MAX_ZOOM = 1.5

// Pan / zoom camera for the board.
//   screen = viewport centre + world × s + (x, y)
// Drag to pan (with a little glide), wheel or pinch to zoom at the pointer,
// and flyTo() for the animated moves the board makes itself.
//
// boundsRef.current = { x0, x1, y0, y1, minZoom } is the area the tiles
// cover. The camera cannot leave it: drag past the edge and it resists, let go
// and it comes back. That keeps the visitor from floating off into empty
// board, and it caps how many background cells ever need drawing.
export function useCamera(stageRef, boundsRef) {
    const x = useMotionValue(0)
    const y = useMotionValue(0)
    const s = useMotionValue(0.6)
    const dragged = useRef(false) // true for the click that ends a drag, so tiles can ignore it
    const running = useRef([])
    const glide = useRef(0)

    const stop = useCallback(() => {
        running.current.forEach(a => a.stop())
        running.current = []
        cancelAnimationFrame(glide.current)
    }, [])

    // How far the camera may sit from the centre at zoom `scale`: at least a
    // third of the screen must still show the area the tiles cover.
    const limits = useCallback((scale = s.get()) => {
        const b = boundsRef?.current, el = stageRef.current
        if (!b || !el) return null
        const { width, height } = el.getBoundingClientRect()
        const padX = width * 0.34, padY = height * 0.34
        let x0 = padX - width / 2 - b.x1 * scale, x1 = width / 2 - padX - b.x0 * scale
        let y0 = padY - height / 2 - b.y1 * scale, y1 = height / 2 - padY - b.y0 * scale
        if (x0 > x1) x0 = x1 = (x0 + x1) / 2
        if (y0 > y1) y0 = y1 = (y0 + y1) / 2
        return { x0, x1, y0, y1 }
    }, [boundsRef, stageRef, s])

    const flyTo = useCallback((tx, ty, ts, instant = false) => {
        stop()
        if (instant) { x.set(tx); y.set(ty); s.set(ts); return }
        const spring = { type: 'spring', stiffness: 120, damping: 22, mass: 1 }
        running.current = [animate(x, tx, spring), animate(y, ty, spring), animate(s, ts, spring)]
    }, [x, y, s, stop])

    // Zoom by a factor, keeping the screen point (px, py) fixed. Defaults to the centre.
    const zoomAt = useCallback((factor, px, py, smooth = false) => {
        const el = stageRef.current
        if (!el) return
        const rect = el.getBoundingClientRect()
        const cx = (px ?? rect.left + rect.width / 2) - rect.left - rect.width / 2
        const cy = (py ?? rect.top + rect.height / 2) - rect.top - rect.height / 2
        const from = s.get()
        const to = clamp(from * factor, boundsRef?.current?.minZoom ?? MIN_ZOOM, MAX_ZOOM)
        const k = to / from
        let tx = cx - (cx - x.get()) * k
        let ty = cy - (cy - y.get()) * k
        const lim = limits(to)
        if (lim) { tx = clamp(tx, lim.x0, lim.x1); ty = clamp(ty, lim.y0, lim.y1) }
        if (smooth) flyTo(tx, ty, to)
        else { stop(); x.set(tx); y.set(ty); s.set(to) }
    }, [stageRef, boundsRef, x, y, s, flyTo, stop, limits])

    useEffect(() => {
        const el = stageRef.current
        if (!el) return
        const pointers = new Map()
        let start = null
        let dragging = false
        let pinch = 0
        let vx = 0, vy = 0, lastT = 0

        const down = e => {
            if (e.pointerType === 'mouse' && e.button !== 0) return
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
            if (pointers.size === 1) {
                start = { x: e.clientX, y: e.clientY }
                dragging = false
                vx = vy = 0
                lastT = performance.now()
            } else if (pointers.size === 2) {
                const [a, b] = [...pointers.values()]
                pinch = Math.hypot(a.x - b.x, a.y - b.y)
                beginDrag(e)
            }
        }

        const beginDrag = e => {
            if (dragging) return
            dragging = true
            dragged.current = true
            stop()
            el.classList.add('is-dragging')
            try { el.setPointerCapture(e.pointerId) } catch { /* pointer already gone */ }
        }

        const move = e => {
            const prev = pointers.get(e.pointerId)
            if (!prev) return
            const dx = e.clientX - prev.x, dy = e.clientY - prev.y
            pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

            if (pointers.size === 2) {
                const [a, b] = [...pointers.values()]
                const dist = Math.hypot(a.x - b.x, a.y - b.y)
                if (pinch > 0) zoomAt(dist / pinch, (a.x + b.x) / 2, (a.y + b.y) / 2)
                pinch = dist
                x.set(x.get() + dx / 2); y.set(y.get() + dy / 2)
                return
            }
            if (!dragging) {
                if (Math.hypot(e.clientX - start.x, e.clientY - start.y) < 6) return
                beginDrag(e)
            }
            // Past the edge of the board the drag resists, like stretching rubber.
            const lim = limits()
            const nx = x.get() + dx, ny = y.get() + dy
            const outX = lim && (nx < lim.x0 || nx > lim.x1), outY = lim && (ny < lim.y0 || ny > lim.y1)
            x.set(x.get() + dx * (outX ? 0.3 : 1)); y.set(y.get() + dy * (outY ? 0.3 : 1))
            const now = performance.now()
            const dt = Math.max(now - lastT, 1)
            vx = vx * 0.6 + (dx / dt) * 0.4
            vy = vy * 0.6 + (dy / dt) * 0.4
            lastT = now
        }

        const up = e => {
            if (!pointers.delete(e.pointerId)) return
            pinch = 0
            if (pointers.size || !dragging) return
            dragging = false
            el.classList.remove('is-dragging')
            setTimeout(() => { dragged.current = false }, 0)
            const settle = () => {
                const lim = limits()
                if (!lim) return
                const tx = clamp(x.get(), lim.x0, lim.x1), ty = clamp(y.get(), lim.y0, lim.y1)
                if (tx !== x.get() || ty !== y.get()) flyTo(tx, ty, s.get())
            }
            if (performance.now() - lastT > 80) { settle(); return } // held still before letting go: no glide
            let last = performance.now()
            const step = now => {
                const dt = now - last
                last = now
                vx *= Math.exp(-dt / 240); vy *= Math.exp(-dt / 240)
                x.set(x.get() + vx * dt); y.set(y.get() + vy * dt)
                const lim = limits()
                const out = lim && (x.get() < lim.x0 || x.get() > lim.x1 || y.get() < lim.y0 || y.get() > lim.y1)
                if (!out && Math.hypot(vx, vy) > 0.02) glide.current = requestAnimationFrame(step)
                else settle()
            }
            glide.current = requestAnimationFrame(step)
        }

        const wheel = e => {
            e.preventDefault()
            const delta = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaY
            zoomAt(Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.0016)), e.clientX, e.clientY)
        }

        el.addEventListener('pointerdown', down)
        el.addEventListener('pointermove', move)
        el.addEventListener('pointerup', up)
        el.addEventListener('pointercancel', up)
        el.addEventListener('wheel', wheel, { passive: false })
        return () => {
            stop()
            el.removeEventListener('pointerdown', down)
            el.removeEventListener('pointermove', move)
            el.removeEventListener('pointerup', up)
            el.removeEventListener('pointercancel', up)
            el.removeEventListener('wheel', wheel)
        }
    }, [stageRef, x, y, s, stop, zoomAt, limits, flyTo])

    return useMemo(() => ({ x, y, s, dragged, flyTo, zoomAt }), [x, y, s, flyTo, zoomAt])
}
