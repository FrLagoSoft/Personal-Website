import { useEffect, useMemo, useRef, useState } from 'react'
import { weather, useWeather } from './weather.js'
import './weather.css'

// Everything that falls, blows or flies: rain, snow, leaves, fireflies,
// meteors. It sits over the board and under the controls.
//
// PERFORMANCE. Nothing here is drawn frame by frame. (The first version drew
// every raindrop on a full-screen canvas 30 times a second, and that alone
// cost more than the rest of the page.) Instead:
//   - RAIN and SNOW are small pictures of streaks or flakes, drawn once, tiled
//     across a sheet, and the sheet slides. Sliding a finished picture is the
//     cheapest thing a graphics card does.
//   - LEAVES, FIREFLIES and METEORS are a handful of small elements with
//     movement the browser runs by itself (CSS and Web Animations). Each is a
//     single element, however many ways it moves: every animated element is a
//     separate layer for the graphics card to place, so fewer is cheaper.
// So the only JavaScript that runs is on a moment: a new weather, a meteor
// launched, a flash of lightning. Nothing runs per frame.
//
// Props:
//   getCamera()   the board camera, so meteors can aim at a spot on the board
//   snap(x, y)    nearest hex cell to a point on the board: { x, y, q, r }

const rand = (a, b) => a + Math.random() * (b - a)
const TILE = 512                                   // size of the rain and snow pictures
const LEAF_COLORS = ['#7FB069', '#E6A23C', '#D9772E', '#9CCB6B', '#C2553B']

// Meteors land on a rhythm: one step every STEP_MS, striking where the pattern
// has a 1. Change the pattern or the step to match a piece of music.
const STEP_MS = 720
const PATTERN = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 1, 0, 1, 1]
const TUNE = [9, 7, 6, 4, 7, 5, 4, 2]             // the note each strike plays, in turn
const FLIGHT_MS = 620                              // from appearing to landing

// The two pictures, drawn once. Each must tile: nothing may cross an edge
// without reappearing on the opposite one.
let pictures = null
function draw() {
    if (pictures) return pictures
    const canvas = () => { const c = document.createElement('canvas'); c.width = c.height = TILE; return c }

    const rain = canvas(), r = rain.getContext('2d')
    r.strokeStyle = 'rgba(66,98,146,0.55)'; r.lineWidth = 1.5; r.lineCap = 'round'
    r.beginPath()
    for (let i = 0; i < 64; i++) {
        const x = rand(2, TILE - 2), y = rand(0, TILE), len = rand(16, 30)
        for (const wrap of [0, -TILE]) { r.moveTo(x, y + wrap); r.lineTo(x, y + len + wrap) }   // a streak cut off at the bottom continues at the top
    }
    r.stroke()

    const snow = canvas(), s = snow.getContext('2d')
    s.fillStyle = 'rgba(255,255,255,0.95)'; s.strokeStyle = 'rgba(104,134,182,0.4)'; s.lineWidth = 0.8
    for (let i = 0; i < 26; i++) {
        const size = rand(1.6, 4)
        s.beginPath(); s.arc(rand(size + 1, TILE - size - 1), rand(size + 1, TILE - size - 1), size, 0, Math.PI * 2)
        s.fill(); s.stroke()
    }
    return (pictures = { rain: `url(${rain.toDataURL()})`, snow: `url(${snow.toDataURL()})` })
}

// Random but fixed settings for a set of elements, handed to CSS as variables.
const scatter = (count, make) => Array.from({ length: count }, (_, i) => make(i))

function WeatherLayer({ getCamera, snap }) {
    const id = useWeather()
    const root = useRef(null)
    const flash = useRef(null)
    const calm = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
    const art = useMemo(() => (calm ? null : draw()), [calm])
    const windDir = weather.get().windDir

    // The outgoing weather stays on screen for a few seconds while it fades.
    const [leaving, setLeaving] = useState(null)
    useEffect(() => {
        let timer
        const off = weather.on('change', ev => {
            setLeaving(ev.prev)
            clearTimeout(timer)
            timer = setTimeout(() => setLeaving(null), 4200)
        })
        return () => { off(); clearTimeout(timer) }
    }, [])

    const rings = useMemo(() => scatter(8, () => ({ left: `${rand(2, 98)}%`, top: `${rand(8, 96)}%`, '--dur': `${rand(0.45, 0.9).toFixed(2)}s`, '--delay': `${rand(-1, 0).toFixed(2)}s` })), [])
    const leaves = useMemo(() => scatter(10, i => ({
        '--top': `${rand(2, 96).toFixed(1)}%`, '--dur': `${rand(2.6, 5.2).toFixed(2)}s`, '--delay': `${rand(-5, 0).toFixed(2)}s`,
        '--size': `${rand(11, 20).toFixed(0)}px`, '--sway': `${rand(30, 90).toFixed(0)}px`, '--spin': `${rand(0.7, 1.8).toFixed(2)}s`, '--color': LEAF_COLORS[i % LEAF_COLORS.length],
    })), [])
    const gusts = useMemo(() => scatter(5, () => ({ '--top': `${rand(6, 94).toFixed(1)}%`, '--delay': `${rand(-0.8, 0).toFixed(2)}s`, '--len': `${rand(130, 260).toFixed(0)}px` })), [])
    const flies = useMemo(() => scatter(9, () => ({
        left: `${rand(4, 96).toFixed(1)}%`, top: `${rand(8, 92).toFixed(1)}%`, '--dx': `${rand(-150, 150).toFixed(0)}px`, '--dy': `${rand(-110, 110).toFixed(0)}px`,
        '--dur': `${rand(9, 17).toFixed(1)}s`, '--pulse': `${rand(1.8, 4).toFixed(1)}s`, '--delay': `${rand(-9, 0).toFixed(1)}s`,
    })), [])

    // A splash ring that has finished moves somewhere new before it plays again.
    const moveRing = e => { e.currentTarget.style.left = `${rand(2, 98)}%`; e.currentTarget.style.top = `${rand(8, 96)}%` }

    // ── Rain: lightning, now and then, once it has properly set in ───────────
    useEffect(() => {
        if (id !== 'rain' || calm) return
        let timer
        const strike = () => {
            flash.current?.animate([{ opacity: 0 }, { opacity: 0.55, offset: 0.08 }, { opacity: 0.12, offset: 0.22 }, { opacity: 0.45, offset: 0.32 }, { opacity: 0 }], { duration: 440 })
            weather.emit('thunder')
            timer = setTimeout(strike, rand(45000, 100000))
        }
        timer = setTimeout(strike, rand(18000, 40000))
        return () => clearTimeout(timer)
    }, [id, calm])

    // ── Wind: the white streaks only fly while a gust is actually blowing ────
    useEffect(() => {
        if (id !== 'windy' || calm) return
        const timer = setInterval(() => { if (root.current) root.current.dataset.gust = weather.wind().force > 0.6 ? 'true' : '' }, 250)
        return () => clearInterval(timer)
    }, [id, calm])

    // ── Meteor shower: launch on the rhythm, and report each landing ─────────
    useEffect(() => {
        if (id !== 'meteors' || calm) return
        const host = root.current
        let step = 0, strikes = 0

        // A short-lived element that plays one animation and removes itself.
        const fling = (className, frames, options, style) => {
            const el = document.createElement('i')
            el.className = className
            if (style) Object.assign(el.style, style)
            host.appendChild(el)
            const anim = el.animate(frames, options)
            anim.onfinish = anim.oncancel = () => el.remove()
            return anim
        }

        const launch = () => {
            const cam = getCamera()
            const { width: w, height: h } = host.getBoundingClientRect()
            const aim = { x: rand(0.1, 0.9) * w, y: rand(0.18, 0.85) * h }
            const cell = snap((aim.x - w / 2 - cam.x) / cam.s, (aim.y - h / 2 - cam.y) / cam.s)
            const tx = w / 2 + cam.x + cell.x * cam.s, ty = h / 2 + cam.y + cell.y * cam.s
            const ox = -weather.get().windDir * rand(430, 620), oy = -rand(640, 820)   // where it comes from, relative to where it lands
            const angle = (Math.atan2(-oy, -ox) * 180) / Math.PI
            const note = TUNE[strikes++ % TUNE.length]
            const fall = fling('wx__meteor', [
                { transform: `translate(${tx + ox}px,${ty + oy}px) rotate(${angle}deg)` },
                { transform: `translate(${tx}px,${ty}px) rotate(${angle}deg)` },
            ], { duration: FLIGHT_MS, easing: 'cubic-bezier(0.55, 0, 1, 0.7)' })
            fall.addEventListener('finish', () => {
                weather.emit('impact', { ...cell, sx: tx, sy: ty, note })
                const size = 300 * cam.s
                fling('wx__impact', [{ transform: 'scale(0.12)', opacity: 0.95 }, { transform: 'scale(1)', opacity: 0 }],
                    { duration: 450, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
                    { left: `${tx - size / 2}px`, top: `${ty - size / 2}px`, width: `${size}px`, height: `${size}px` })
                for (let k = 0; k < 9; k++) {
                    const a = rand(-Math.PI, 0), reach = rand(40, 150), turn = (a * 180) / Math.PI
                    fling('wx__spark', [
                        { transform: `translate(${tx}px,${ty}px) rotate(${turn}deg)`, opacity: 1 },
                        { transform: `translate(${tx + Math.cos(a) * reach}px,${ty + Math.sin(a) * reach + 46}px) rotate(${turn}deg)`, opacity: 0 },
                    ], { duration: rand(380, 620), easing: 'cubic-bezier(0.1, 0.7, 0.4, 1)' })
                }
            })
        }

        let timer
        const begin = setTimeout(() => {                    // let the night settle in before the first one
            timer = setInterval(() => { if (!document.hidden && PATTERN[step++ % PATTERN.length]) launch() }, STEP_MS)
        }, 3500)
        return () => { clearTimeout(begin); clearInterval(timer) }
    }, [id, calm, getCamera, snap])

    if (calm) return null       // colours and light still change with the weather; nothing flies
    const on = name => (id === name ? 'true' : undefined)
    const up = name => id === name || leaving === name

    return (
        <div className="weather" ref={root} data-dir={windDir} style={{ '--dir': windDir }} aria-hidden="true">
            {up('rain') && (
                <div className="wx wx--rain" data-on={on('rain')}>
                    <div className="wx__tilt">
                        <div className="wx__sheet" style={{ backgroundImage: art.rain }} />
                    </div>
                    {rings.map((style, i) => <i key={i} className="wx__ring" style={style} onAnimationIteration={moveRing} />)}
                    <div className="wx__flash" ref={flash} />
                </div>
            )}
            {up('snow') && (
                <div className="wx wx--snow" data-on={on('snow')}>
                    <div className="wx__drift"><div className="wx__sheet wx__sheet--far" style={{ backgroundImage: art.snow }} /></div>
                    <div className="wx__drift wx__drift--back"><div className="wx__sheet wx__sheet--near" style={{ backgroundImage: art.snow }} /></div>
                </div>
            )}
            {up('windy') && (
                <div className="wx wx--windy" data-on={on('windy')}>
                    {leaves.map((style, i) => <i key={i} className="wx__leaf" style={style} />)}
                    {gusts.map((style, i) => <i key={i} className="wx__gust" style={style} />)}
                </div>
            )}
            {(up('stars') || up('aurora')) && (
                <div className="wx wx--night" data-on={on('stars') || on('aurora')}>
                    {flies.map((style, i) => <i key={i} className="wx__fly" style={style} />)}
                    <i className="wx__shoot" />
                    <i className="wx__shoot wx__shoot--b" />
                </div>
            )}
        </div>
    )
}

export default WeatherLayer
