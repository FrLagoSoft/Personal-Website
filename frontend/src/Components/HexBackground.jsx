import { useState, useEffect, useMemo, useRef, memo } from 'react'
import { motion } from 'framer-motion'
import { AnimatePresence } from 'framer-motion'

const CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'

const W  = 266
const H  = Math.round(W * 306 / 266)   
const DV = Math.round(W * 229 / 266)   // vertical row spacing
const DO = W / 2                        // alternating row horizontal offset
const offsetX = 2847 % 266 + 80
const offsetY = 1832 % 26 + 480
const RINGS     = 50
const RING_STEP = 70   

// --- color helpers ---

function parseHex(c) {
    return [parseInt(c.slice(1,3),16), parseInt(c.slice(3,5),16), parseInt(c.slice(5,7),16)]
}
function toHex([r,g,b]) {
    return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${b.toString(16).padStart(2,'0')}`
}
function lerp(a, b, t) {
    const [ar,ag,ab] = parseHex(a), [br,bg,bb] = parseHex(b)
    return toHex([ar+(br-ar)*t, ag+(bg-ag)*t, ab+(bb-ab)*t].map(Math.round))
}
function darken(c, amt = 0.84) {
    return toHex(parseHex(c).map(v => Math.round(v * amt)))
}

// Hex positions in hexData are canvas-relative. Canvas center (398, 382) sits at
// viewport center (vw/2, vh/2), so viewport-relative pos = vw/2 + (pos.x - 398).
const CANVAS_CX = 398
const CANVAS_CY = 382
//

// POWER controls sector sharpness: higher = harder edges, lower = softer blend.
const ANGULAR_POWER = 5

function angularBlend(cx, cy, hexes) {
    const tileAngle = Math.atan2(cy - BG_CY, cx - BG_CX)

    const weights = hexes.map(h => {
        const hexAngle = Math.atan2(h.pos.y - CANVAS_CY, h.pos.x - CANVAS_CX)
        let diff = tileAngle - hexAngle
        while (diff >  Math.PI) diff -= 2 * Math.PI
        while (diff < -Math.PI) diff += 2 * Math.PI
        const angDist = Math.abs(diff)
        const w = 1 / (Math.pow(angDist, ANGULAR_POWER) + 0.05)
        return { w, color: h.lightColor }
    })

    const totalW = weights.reduce((s, { w }) => s + w, 0)
    const [r, g, b] = weights.reduce((acc, { w, color }) => {
        const [cr, cg, cb] = parseHex(color)
        return [acc[0] + cr * w / totalW, acc[1] + cg * w / totalW, acc[2] + cb * w / totalW]
    }, [0, 0, 0])

    return darken(toHex([Math.round(r), Math.round(g), Math.round(b)]))
}

function computeTileColor(cx, cy, selectedHexes) {
    if (selectedHexes.length === 0) return darken('#EEFBEF')
    if (selectedHexes.length === 1) return darken(selectedHexes[0].lightColor)
    if (selectedHexes.length === 2) {
        const [a, b] = selectedHexes
        const dx = b.pos.x - a.pos.x, dy = b.pos.y - a.pos.y
        const len = Math.sqrt(dx*dx + dy*dy) || 1
        const proj = (cx - BG_CX) * (dx/len) + (cy - BG_CY) * (dy/len)
        const t = Math.max(0, Math.min(1, proj / 500 * 0.5 + 0.5))
        return darken(lerp(a.lightColor, b.lightColor, t))
    }
    return angularBlend(cx, cy, selectedHexes)
}

// Background fill color for the thin gaps between tiles
function computeBgFill(selectedHexes) {
    if (!selectedHexes.length) return '#EEFBEF'
    if (selectedHexes.length === 1) return selectedHexes[0].lightColor
    if (selectedHexes.length === 3) {
        const [r1,g1,b1] = parseHex(selectedHexes[0].lightColor)
        const [r2,g2,b2] = parseHex(selectedHexes[1].lightColor)
        const [r3,g3,b3] = parseHex(selectedHexes[2].lightColor)
        return toHex([Math.round((r1+r2+r3)/3), Math.round((g1+g2+g3)/3), Math.round((b1+b2+b3)/3)])
    }
    return lerp(selectedHexes[0].lightColor, selectedHexes[1].lightColor, 0.5)
}


// BG_CX/BG_CY is the center of this rect, which maps to the viewport center (Gabriel Lago).
// 6000×4000 covers a 1920×1080 screen at 50% zoom (3840×2160 CSS pixels)
// plus the full drag range (±800 horizontal, ±600 vertical) with room to spare.
const BG_W  = 4788
const BG_H  = 2520
const BG_CX = BG_W / 2   // 3000
const BG_CY = BG_H / 2   // 2000

// Generates the hex grid once — covers the full BG_W × BG_H area
function buildGrid() {
    const cols = Math.ceil(BG_W / W) + 2
    const rows = Math.ceil(BG_H / DV) + 2
    const cells = []
    let maxDist = 0

    for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
            const x  = col * W + (row % 2 ? DO : 0) - offsetX
            const y  = row * DV - offsetY
            const cx = x + W / 2
            const cy = y + H / 2
            // Distance from the background center (= viewport center = Gabriel Lago)
            const dist = Math.sqrt((cx - BG_CX)**2 + (cy - BG_CY)**2)
            if (dist > maxDist) maxDist = dist
            cells.push({ id: `${row}-${col}`, x, y, cx, cy, dist })
        }
    }

    return cells.map(c => ({
        ...c,
        stagger: Math.round((c.dist / maxDist) * (RINGS - 1)) * RING_STEP
    }))
}

function RippleRing({ delay }) {
    const [done, setDone] = useState(false)
    if (done) return null
    return (
        <motion.div
            style={{ position: 'absolute', width: 100, height: 100, borderRadius: '50%', border: '2px solid white' }}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ scale: [0, 2.5], opacity: [0, 0.8, 0] }}
            transition={{ duration: 1.2, ease: 'easeOut', delay }}
            onAnimationComplete={() => setDone(true)}
        />
    )
}

function HexBackground({ selectedHexes, hexPositions, expandedHexLabels, panX, panY, panScale, clickWave, isRainbow }) {
    const grid       = useMemo(() => buildGrid(), [])
    const maxStagger = (RINGS - 1) * RING_STEP
    const [displayed, setDisplayed] = useState(selectedHexes)
    const [phase, setPhase]         = useState('idle')
    const [shootingStars, setShootingStars] = useState([])
    const containerRef = useRef(null)

    useEffect(() => {
        const schedule = () => {
            const delay = 10000 + Math.random() * 3500
            return setTimeout(() => {
                const tile = grid[Math.floor(Math.random() * grid.length)]
                const angle = 30 + Math.random() * 30
                const dir   = Math.random() < 0.5 ? 1 : -1
                const dist  = 3500 + Math.random() * 300
                const dx = Math.cos(angle * Math.PI / 180) * dist * dir
                const dy = Math.sin(angle * Math.PI / 180) * dist
                const color = computeTileColor(tile.cx, tile.cy, displayed)
                const id = Date.now() + Math.random()
                setShootingStars(prev => [...prev, { id, x: tile.x, y: tile.y, dx, dy, color }])
                setTimeout(() => setShootingStars(prev => prev.filter(s => s.id !== id)), 10100)
                t = schedule()
            }, delay)
        }
        let t = schedule()
        return () => clearTimeout(t)
    }, [displayed])

    useEffect(() => {
        if (!clickWave || !containerRef.current) return
        const container = containerRef.current
        const bgX = BG_CX + (clickWave.pos.x - CANVAS_CX)
        const bgY = BG_CY + (clickWave.pos.y - CANVAS_CY)
        const WAVE_RADIUS = 510

        let rafId, timeoutId
        const touchedTiles = []

        rafId = requestAnimationFrame(() => {
            const tiles = container.querySelectorAll('.hex-tile')
            grid.forEach((cell, i) => {
                const dist = Math.sqrt((cell.cx - bgX) ** 2 + (cell.cy - bgY) ** 2)
                if (dist <= WAVE_RADIUS) {
                    tiles[i].style.setProperty('--wave-stagger', `${Math.min(dist / 2000 * 2000, 900)}ms`)
                    tiles[i].style.setProperty('--wave-color', clickWave.color)
                    touchedTiles.push(tiles[i])
                }
            })
            container.classList.add('hex-waving')
            timeoutId = setTimeout(() => {
                container.classList.remove('hex-waving')
                touchedTiles.forEach(t => t.style.removeProperty('--wave-stagger'))
            }, 1700)
        })

        return () => {
            cancelAnimationFrame(rafId)
            clearTimeout(timeoutId)
            container.classList.remove('hex-waving')
        }
    }, [clickWave])

    const key = selectedHexes.map(h => h.label).join('|')

    const iconPositions = useMemo(() => {
        if (!hexPositions || isRainbow) return { coding: [], education: [], projects: [], jobs: [], extracurricular: [] }
    return {
        coding: displayed.some(h => h.label === "Coding Experience")
            ? generateIconPositions(10, hexPositions, displayed, darken('#111111'), panX, panY, panScale)
            : [],
        education: displayed.some(h => h.label === "Education")
            ? generateIconPositions(10, hexPositions, displayed, darken('#DBEAFE'), panX, panY, panScale)
            : [],
        projects: displayed.some(h => h.label === "Projects")
            ? generateIconPositions(10, hexPositions, displayed, darken('#FEF08A'), panX, panY, panScale)
            : [],
        jobs: displayed.some(h => h.label === "Job Experience")
            ? generateIconPositions(10, hexPositions, displayed, darken('#FDCA64'), panX, panY, panScale)
            : [],
        extracurricular: displayed.some(h => h.label === "Extracurricular")
            ? generateIconPositions(10, hexPositions, displayed, darken('#EDE9FE'), panX, panY, panScale)
            : [],
    }
}, [displayed])

    useEffect(() => {
        // Phase 1: collapse all tiles outward from center
        setPhase('collapsing')

        // Phase 2: once all tiles have collapsed, swap colors and expand
        // The 250ms buffer gives the last tile's flip time to finish
        // If you raised RING_STEP or CSS duration, raise this buffer too
        const t1 = setTimeout(() => {
            setDisplayed(selectedHexes)
            setPhase('expanding')
        }, maxStagger + 250)

        // Phase 3: back to idle once all tiles have finished expanding
        const t2 = setTimeout(() => setPhase('idle'), (maxStagger + 250) * 2)

        return () => { clearTimeout(t1); clearTimeout(t2) }
    }, [key])

    // Tile colors are recomputed only when displayed changes, not on every render
    const tileColors = useMemo(
        () => grid.map(h => computeTileColor(h.cx, h.cy, displayed)),
        [displayed]
    )
   

    const bgFill = computeBgFill(displayed)
    const [extracurricularIconsReady, setExtracurricularIconsReady] = useState(false)
    const [projectIconsReady, setProjectIconsReady] = useState(false)
    const [educationIconsReady, setEducationIconsReady] = useState(false)
    const [jobIconsReady, setJobIconsReady] = useState(false)
    const [iconsReady, setIconsReady] = useState(false)
    const hasAnimated = useRef(false)
    const hasAnimatedEducation = useRef(false)
    const hasAnimatedJobs = useRef(false)
    const hasAnimatedProjects = useRef(false)
    const hasAnimatedExtracurricular = useRef(false)

    useEffect(() => {
        if (phase === 'collapsing') hasAnimated.current = true
        if (phase === 'idle' && expandedHexLabels.includes("Coding Experience") && hasAnimated.current) {
            setIconsReady(true)
            hasAnimated.current = false
        }
        if (!expandedHexLabels.includes("Coding Experience")) {
            setIconsReady(false)
            hasAnimated.current = false
        }
    }, [phase, expandedHexLabels])

    useEffect(() => {
        if (phase === 'collapsing') hasAnimatedEducation.current = true
        if (phase === 'idle' && expandedHexLabels.includes("Education") && hasAnimatedEducation.current) {
            setEducationIconsReady(true)
            hasAnimatedEducation.current = false
        }
        if (!expandedHexLabels.includes("Education")) {
            setEducationIconsReady(false)
            hasAnimatedEducation.current = false
        }

    }, [phase, expandedHexLabels])

    useEffect(() => {
        if (phase === 'collapsing') hasAnimatedJobs.current = true
        if (phase === 'idle' && expandedHexLabels.includes("Job Experience") && hasAnimatedJobs.current) {
            setJobIconsReady(true)
            hasAnimatedJobs.current = false
        }
        if (!expandedHexLabels.includes("Job Experience")) {
            setJobIconsReady(false)
            hasAnimatedJobs.current = false 
        }
    }, [phase, expandedHexLabels])

    useEffect(() => {
        if (phase === 'collapsing') hasAnimatedProjects.current = true
        if (phase === 'idle' && expandedHexLabels.includes("Projects") && hasAnimatedProjects.current) {
            setProjectIconsReady(true)
            hasAnimatedProjects.current = false
        }
        if (!expandedHexLabels.includes("Projects")) {
            setProjectIconsReady(false)
            hasAnimatedProjects.current = false
        }
    }, [phase, expandedHexLabels])

    useEffect(() => {
        if (phase === 'collapsing') hasAnimatedExtracurricular.current = true
        if (phase === 'idle' && expandedHexLabels.includes("Extracurricular") && hasAnimatedExtracurricular.current) {
            setExtracurricularIconsReady(true)
            hasAnimatedExtracurricular.current = false
        }
        if (!expandedHexLabels.includes("Extracurricular")) {
            setExtracurricularIconsReady(false)
            hasAnimatedExtracurricular.current = false
        }
    }, [phase, expandedHexLabels])

    function colorDistance(c1, c2) {
    const [r1,g1,b1] = parseHex(c1)
    const [r2,g2,b2] = parseHex(c2)
    return Math.sqrt((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2)
}

    function generateIconPositions(count, hexPositions, displayed, targetColor, panX, panY, panScale) {
    const s  = panScale ? panScale.get() : 1
    const tx = panX     ? panX.get()     : 0
    const ty = panY     ? panY.get()     : 0
    const vw = window.innerWidth
    const vh = window.innerHeight
    const visLeft  = BG_CX - (vw / 2 + tx) / s
    const visRight = BG_CX + (vw / 2 - tx) / s
    const visTop   = BG_CY - (vh / 2 + ty) / s
    const visBot   = BG_CY + (vh / 2 - ty) / s

    const positions = []
    let attempts = 0
    while (positions.length < count && attempts < 200) {
        attempts++
        const x = visLeft + Math.random() * (visRight - visLeft)
        const y = visTop  + Math.random() * (visBot  - visTop)
        if (hexPositions.every(hex => distance(x, y, hex) > 260) &&
            colorDistance(computeTileColor(x + 50, y + 50, displayed), targetColor) < 25 &&
            positions.every(p => Math.sqrt((x - p.x)**2 + (y - p.y)**2) > 150)) {
            positions.push({ x, y, iconNum: Math.ceil(Math.random() * 4), dir: Math.random() < 0.5 ? 'up' : 'left' })
        }
    }
    return positions
}
    function distance(x, y, hex) {
    const bgX = BG_CX + (hex.x - CANVAS_CX)
    const bgY = BG_CY + (hex.y - CANVAS_CY)
    return Math.sqrt((x - bgX)**2 + (y - bgY)**2)
    }

    return (
        // Adding 'hex-collapsing' class triggers the CSS transition on all tiles
        // via the cascade — one DOM change instead of N inline style mutations
        <div
            ref={containerRef}
            className={phase === 'collapsing' ? 'hex-collapsing' : ''}
            style={{
                position: 'absolute',
                left: `calc(50% - ${BG_CX}px)`,
                top: `calc(50% - ${BG_CY}px)`,
                width: BG_W,
                height: BG_H,
                zIndex: 0,
                pointerEvents: 'none',
                backgroundColor: bgFill,
                transition: 'background-color 2s ease'
            }}
        >
            {grid.map((hex, i) => (
                <div
                    key={hex.id}
                    className="hex-tile"
                    style={{
                        '--stagger': `${hex.stagger}ms`,  // CSS custom property, read by index.css
                        position: 'absolute',
                        left: hex.x,
                        top: hex.y,
                        width: W,
                        height: H,
                        clipPath: CLIP,
                        backgroundColor: tileColors[i],
                    }}
                />
            ))}

            {shootingStars.map(star => (
                <motion.div
                    key={star.id}
                    style={{
                        position: 'absolute',
                        left: star.x,
                        top: star.y,
                        width: W * 1.5,
                        height: H * 1.5,
                        clipPath: CLIP,
                        backgroundColor: star.color,
                        pointerEvents: 'none',
                        zIndex: 1,
                        filter: `brightness(1.4) drop-shadow(0 0 8px ${star.color})`,
                    }}
                    initial={{ x: 0, y: 0, opacity: 0.9, scale: 1 }}
                    animate={{ x: star.dx, y: star.dy, opacity: 0, scale: 0.2 }}
                    transition={{ duration: 1, ease: 'easeIn' }}
                />
            ))}

            <AnimatePresence>
    {iconsReady && iconPositions.coding.map((pos, i) => (
        <motion.div
            key={`${pos.x}-${pos.y}`}
            style={{ position: 'absolute', left: pos.x, top: pos.y }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.4 } }}
        >
    
             {/* Entry ring — fires once on mount */}
                <RippleRing delay={i * 0.65} />

                 {/* Icon with looping pulse */}
                <motion.img
                src={`/assets/CodeImage${pos.iconNum}.svg`}
                initial={{ opacity: 0 }}
                animate={{
                    opacity: 1,
                    ...(i < 3 ? (pos.dir === 'up' ? { y: [0, -8, 0] } : { x: [0, -8, 0] }) : {})
                }}
                transition={{
                    opacity: { duration: 0.5, delay: i * 0.65 },
                    x: { duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.65 },
                    y: { duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.65 },
                }}
                style={{ width: 70, height: 70 }}
                    />

            </motion.div>
            ))}
            </AnimatePresence>

            <AnimatePresence>
    {educationIconsReady && iconPositions.education.map((pos, i) => (
        <motion.div
            key={`${pos.x}-${pos.y}`}
            style={{ position: 'absolute', left: pos.x, top: pos.y }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.4 } }}
        >
    
             {/* Entry ring — fires once on mount */}
                <RippleRing delay={i * 0.65} />

                 {/* Icon with looping pulse */}
                <motion.img
                src={`/assets/education${pos.iconNum}.svg`}
                initial={{ opacity: 0 }}
                animate={{
                    opacity: 1,
                    ...(i < 3 ? (pos.dir === 'up' ? { y: [0, -8, 0] } : { x: [0, -8, 0] }) : {})
                }}
                transition={{
                    opacity: { duration: 0.5, delay: i * 0.65 },
                    x: { duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.65 },
                    y: { duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.65 },
                }}
                style={{ width: 70, height: 70 }}
                    />

</motion.div>
            ))}
            </AnimatePresence>

             <AnimatePresence>
    {jobIconsReady && iconPositions.jobs.map((pos, i) => (
        <motion.div
            key={`${pos.x}-${pos.y}`}
            style={{ position: 'absolute', left: pos.x, top: pos.y }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.4 } }}
        >
    
             {/* Entry ring — fires once on mount */}
                <RippleRing delay={i * 0.65} />

                 {/* Icon with looping pulse */}
                <motion.img
                src={`/assets/Job${pos.iconNum}.svg`}
                initial={{ opacity: 0 }}
                animate={{
                    opacity: 1,
                    ...(i < 3 ? (pos.dir === 'up' ? { y: [0, -8, 0] } : { x: [0, -8, 0] }) : {})
                }}
                transition={{
                    opacity: { duration: 0.5, delay: i * 0.65 },
                    x: { duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.65 },
                    y: { duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.65 },
                }}
                style={{ width: 70, height: 70 }}
                    />

</motion.div>
            ))}
            </AnimatePresence>

            <AnimatePresence>
    {projectIconsReady && iconPositions.projects.map((pos, i) => (
        <motion.div
            key={`${pos.x}-${pos.y}`}
            style={{ position: 'absolute', left: pos.x, top: pos.y }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.4 } }}
        >
    
             {/* Entry ring — fires once on mount */}
                <RippleRing delay={i * 0.65} />

                 {/* Icon with looping pulse */}
                <motion.img
                src={`/assets/Projects${pos.iconNum}.svg`}
                initial={{ opacity: 0 }}
                animate={{
                    opacity: 1,
                    ...(i < 3 ? (pos.dir === 'up' ? { y: [0, -8, 0] } : { x: [0, -8, 0] }) : {})
                }}
                transition={{
                    opacity: { duration: 0.5, delay: i * 0.65 },
                    x: { duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.65 },
                    y: { duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.65 },
                }}
                style={{ width: 70, height: 70 }}
                    />

</motion.div>
            ))}
            </AnimatePresence>

            <AnimatePresence>
    {extracurricularIconsReady && iconPositions.extracurricular.map((pos, i) => (
        <motion.div
            key={`${pos.x}-${pos.y}`}
            style={{ position: 'absolute', left: pos.x, top: pos.y }}
            exit={{ opacity: 0, scale: 0.8, transition: { duration: 0.4 } }}
        >
    
             {/* Entry ring — fires once on mount */}
                <RippleRing delay={i * 0.65} />

                 {/* Icon with looping pulse */}
                <motion.img
                src={`/assets/Extracurricular${pos.iconNum}.svg`}
                initial={{ opacity: 0 }}
                animate={{
                    opacity: 1,
                    ...(i < 3 ? (pos.dir === 'up' ? { y: [0, -8, 0] } : { x: [0, -8, 0] }) : {})
                }}
                transition={{
                    opacity: { duration: 0.5, delay: i * 0.65 },
                    x: { duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.65 },
                    y: { duration: 2.5, repeat: Infinity, ease: 'easeInOut', delay: i * 0.65 },
                }}
                style={{ width: 70, height: 70 }}
                    />

</motion.div>
            ))}
            </AnimatePresence>

        </div>
    )
}

export default memo(HexBackground)