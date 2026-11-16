import { useEffect, useRef } from 'react'
import { HEX_W, HEX_H, STEP_X, STEP_Y, hexDist, wedgeCell, cellKey, TILE_CELLS } from './layout.js'
import { clamp } from '@/shared/utils/math.js'
import { weather } from '@/features/weather'
import './hex-field.css'

// The living background: one <canvas> that draws the hex lattice the tiles sit
// on, in the same coordinates as the tiles, so the foreground hexagons line up
// exactly with the cells underneath them.
//
// The page talks to it through a plain object (`field.current`):
//   mask      which categories are open, one bit per direction (bit n = dir n)
//   wave      { x, y, t } where and when the last open/close happened
//   ripples   [{ x, y, t, color }] rings of colour from a click
//   bursts    [{ x, y, t, dir }] category icons thrown out of a tile
//   glows     [{ x, y, t, color }] a spot that glows and fades (a meteor strike)
//   hover     { x, y, color } | null: the tile under the pointer; the field
//             glows towards its colour
//
// COLOUR MIXING. With nothing open the field is sage. Open a category and the
// field takes its colour; open several and every cell blends between them by
// its angle around the centre, so the board becomes a soft colour wheel of
// whatever is open.
//
// WEATHER (only with the `withWeather` prop, so the landing page stays clear).
// Every weather pulls all the colours towards its own light: grey-blue for
// rain, deep navy at night. On top of that: puddles gather in the rain, snow
// settles, stars come out, the aurora washes across the cells, a gust of wind
// sweeps over them, and a meteor leaves a glow where it lands. Things that
// fall through the air are drawn by a different, cheaper layer: WeatherLayer.
//
// PERFORMANCE. This used to repaint every cell, every frame, forever. Now there
// are two kinds of frame:
//   FULL     the whole screen. 60 a second while the camera moves (the cells
//            must keep up with the tiles), 30 a second while only colours are
//            changing (a wave, a ripple), and four a second otherwise, which
//            is plenty for the slow "breathing".
//   PATCH    only the small rectangles where something is actually different:
//            around the pointer, around a hovered tile's glow, under each
//            floating icon. 30 a second, and a fraction of the pixels.
// On top of that, cells that share a colour are filled together in one go, and
// the canvas resolution is capped: soft pastel cells do not need every pixel
// of a high-density screen.

const BASE = [221, 234, 222]
const GUTTER = [238, 246, 238] // the colour between the cells
const FLIP_MS = 400        // how long one cell takes to flip
const WAVE_MS = 30         // delay per cell of distance as a colour change spreads
const RIPPLE_SPEED = 1.5   // world px per ms
const RIPPLE_LIFE = 1500
const BURST_LIFE = 950
const GLOW_RADIUS = 720    // world px
const SPOT_LIFE = 2600     // how long a meteor's glow lasts
const SPOT_REACH = 330     // and how far it spreads, in world px
const MAX_PIXELS = 2.6e6   // canvas resolution budget
const ICONS_PER_FIELD = 7
const ICON_SIZE = 86       // world px
const ROUGH = 0b111001110011100 // the top three bits of each colour channel

// How each weather lights the board: [red, green, blue, strength]. Every colour
// on the field is pulled that far (0 → 1) towards that colour.
const GRADE = {
    sunny: [255, 246, 220, 0.05],
    windy: [206, 228, 226, 0.14],
    rain: [112, 132, 160, 0.46],
    snow: [214, 224, 240, 0.5],
    stars: [20, 28, 62, 0.82],
    meteors: [26, 20, 54, 0.84],
    aurora: [12, 24, 46, 0.86],
}

const easeOut = t => 1 - (1 - t) ** 3
const easeBack = t => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2

// ── Per-cell facts that never change, cached ────────────────────────────────
const cells = new Map()
function cellInfo(q, r) {
    const key = cellKey(q, r)
    let c = cells.get(key)
    if (!c) {
        const x = STEP_X * (q + r / 2), y = STEP_Y * r
        const n = Math.sin(q * 127.1 + r * 311.7) * 43758.5453
        c = { x, y, dist: hexDist(q, r), angle: Math.atan2(y, x), hash: n - Math.floor(n), colors: [] }
        cells.set(key, c)
    }
    return c
}

// The blended colour of a cell for a given set of open categories, as 0xRRGGBB.
function cellColor(c, mask, tints) {
    let v = c.colors[mask]
    if (v !== undefined) return v
    if (!mask) v = (BASE[0] << 16) | (BASE[1] << 8) | BASE[2]
    else {
        let r = 0, g = 0, b = 0, total = 0
        for (let dir = 0; dir < 6; dir++) {
            if (!(mask & (1 << dir))) continue
            // Angle between this cell and the middle of that category's wedge
            // (taken the short way round the circle, so it is always between 0 and π).
            let d = Math.abs(c.angle - ((dir * 60 + 30) * Math.PI) / 180) % (2 * Math.PI)
            if (d > Math.PI) d = 2 * Math.PI - d
            const w = c.dist ? 1 / (d * d * d + 0.02) : 1
            r += tints[dir][0] * w; g += tints[dir][1] * w; b += tints[dir][2] * w; total += w
        }
        v = ((r / total) << 16) | ((g / total) << 8) | (b / total | 0)
    }
    c.colors[mask] = v
    return v
}

function hexPath(ctx, x, y, hw, hh) {
    ctx.moveTo(x, y - hh)
    ctx.lineTo(x + hw, y - hh / 2)
    ctx.lineTo(x + hw, y + hh / 2)
    ctx.lineTo(x, y + hh)
    ctx.lineTo(x - hw, y + hh / 2)
    ctx.lineTo(x - hw, y - hh / 2)
    ctx.closePath()
}

// A four-pointed star.
function starPath(ctx, x, y, r) {
    const k = r * 0.2
    ctx.moveTo(x, y - r)
    ctx.lineTo(x + k, y - k); ctx.lineTo(x + r, y); ctx.lineTo(x + k, y + k)
    ctx.lineTo(x, y + r)
    ctx.lineTo(x - k, y + k); ctx.lineTo(x - r, y); ctx.lineTo(x - k, y - k)
    ctx.closePath()
}

// ── Category icons, tinted once into small offscreen canvases ───────────────
function loadIcons(palette, onReady) {
    const sets = []
    palette.forEach((cat, dir) => {
        if (!cat?.iconSet) return
        sets[dir] = []
        for (let n = 1; n <= 4; n++) {
            const img = new Image()
            img.onload = () => {
                const c = document.createElement('canvas')
                c.width = c.height = 128
                const g = c.getContext('2d')
                g.drawImage(img, 0, 0, 128, 128)
                g.globalCompositeOperation = 'source-in'
                g.fillStyle = cat.deep
                g.fillRect(0, 0, 128, 128)
                sets[dir][n - 1] = c
                onReady()
            }
            img.src = `/assets/${cat.iconSet}${n}.svg`
        }
    })
    return sets
}

// Empty cells in a category's wedge, just beyond its tiles: where its icons live.
function iconCells(dir) {
    const out = []
    for (let ring = 2; ring < 10 && out.length < ICONS_PER_FIELD; ring++) {
        for (let b = 0; b < ring && out.length < ICONS_PER_FIELD; b++) {
            const { q, r } = wedgeCell(dir, ring, b)
            if (TILE_CELLS.has(cellKey(q, r))) continue
            const c = cellInfo(q, r)
            if (c.hash > 0.3) out.push(c)
        }
    }
    return out
}

function HexField({ getCamera, field, palette, withWeather = false }) {
    const canvasRef = useRef(null)

    useEffect(() => {
        const canvas = canvasRef.current
        const ctx = canvas.getContext('2d')
        const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const tints = palette ? palette.map(p => p?.tint) : []
        const pointer = { x: -9999, y: -9999 }
        const introAt = performance.now()
        let raf = 0
        let w = 0, h = 0
        let lastFull = 0, lastPatch = 0
        let busyUntil = introAt + 2800       // FULL frames at 60 a second until then
        let stirUntil = 0                     // the pointer moved: PATCH frames until then
        let lastCam = { x: NaN, y: NaN, s: NaN }
        let stale = []                        // patches painted last time, which must be repainted once more

        // Colour state: `from` is what is on screen, `to` is where a wave is taking it.
        let from = 0, to = 0, waveAt = -1e9, waveX = 0, waveY = 0
        const glow = { x: 0, y: 0, r: 0, g: 0, b: 0, level: 0 }
        let icons = []                        // { cell, dir, n, born, dying }
        const wake = (ms = 400) => { busyUntil = Math.max(busyUntil, performance.now() + ms) }
        const stir = (ms = 300) => { stirUntil = Math.max(stirUntil, performance.now() + ms) }
        const iconSets = palette ? loadIcons(palette, () => wake(200)) : []

        // Weather state that builds up and wears off slowly.
        let wet = 0, snowy = 0                // how soaked / snowed-under the board is, 0 → 1
        let gusting = false, gustAt = -1e9, gustDir = 1
        let gutter = ''
        const starList = [], puddleList = []

        // Scratch arrays reused every frame.
        let cap = 512
        let keys = new Int32Array(cap), geo = new Float32Array(cap * 4), order = new Int32Array(cap)

        function resize() {
            w = canvas.clientWidth; h = canvas.clientHeight
            let dpr = Math.min(window.devicePixelRatio || 1, 1.5)
            if (w * h * dpr * dpr > MAX_PIXELS) dpr = Math.max(0.75, Math.sqrt(MAX_PIXELS / (w * h)))
            canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
            ctx.setTransform(canvas.width / w, 0, 0, canvas.height / h, 0, 0)
            wake()
        }

        function syncState(now) {
            const state = field?.current
            if (!state) return null
            // A category was opened or closed: start a wave from where it happened.
            if (state.mask !== to) {
                from = to // an unfinished wave snaps to its end
                const opened = state.mask & ~to, closed = to & ~state.mask
                to = state.mask
                waveAt = state.wave?.t ?? now
                waveX = state.wave?.x ?? 0; waveY = state.wave?.y ?? 0
                for (let dir = 0; dir < 6; dir++) {
                    if (opened & (1 << dir)) {
                        icons = icons.filter(i => i.dir !== dir)
                        iconCells(dir).forEach((cell, k) => {
                            const reach = Math.hypot(cell.x - waveX, cell.y - waveY) / STEP_X
                            icons.push({ cell, dir, n: Math.floor(cell.hash * 97) % 4, born: waveAt + reach * WAVE_MS + FLIP_MS + k * 110, dying: 0 })
                        })
                    }
                    if (closed & (1 << dir)) icons.forEach(i => { if (i.dir === dir) i.dying = now })
                }
                wake(Math.max(0, waveAt - now) + 1500)   // long enough for the wave to cross the screen
            }
            if (state.ripples.length || state.bursts.length) wake(200)
            while (state.ripples.length && now - state.ripples[0].t > RIPPLE_LIFE) state.ripples.shift()
            while (state.bursts.length && now - state.bursts[0].t > BURST_LIFE) state.bursts.shift()
            while (state.glows?.length && now - state.glows[0].t > SPOT_LIFE) state.glows.shift()
            return state
        }

        // Fills every cell from `start` on that shares one colour key, as a single path.
        function fillRun(sorted, count, start, mask, drop) {
            const key = keys[sorted[start]] & mask
            let end = start
            ctx.beginPath()
            for (; end < count && (keys[sorted[end]] & mask) === key; end++) {
                const o = sorted[end] * 4
                hexPath(ctx, geo[o], geo[o + 1] + drop, geo[o + 2], geo[o + 3])
            }
            return end
        }

        function draw(now) {
            raf = requestAnimationFrame(draw)
            const state = syncState(now)
            const cam = getCamera()
            const s = cam.s
            const ox = w / 2 + cam.x, oy = h / 2 + cam.y
            const moved = cam.x !== lastCam.x || cam.y !== lastCam.y || cam.s !== lastCam.s

            // ── The weather: how it lights the board right now ──────────────
            // Every colour becomes  colour × (1 − pull) + light.
            let pull = 0, lightR = 0, lightG = 0, lightB = 0
            let night = 0, aurora = 0, raining = 0, snowing = 0, fading = false
            if (withWeather) {
                const sky = weather.get(), m = weather.mix(now)
                const a = GRADE[sky.prev], b = GRADE[sky.id]
                pull = a[3] + (b[3] - a[3]) * m
                lightR = a[0] * a[3] + (b[0] * b[3] - a[0] * a[3]) * m
                lightG = a[1] * a[3] + (b[1] * b[3] - a[1] * a[3]) * m
                lightB = a[2] * a[3] + (b[2] * b[3] - a[2] * a[3]) * m
                fading = m < 1
                aurora = weather.amount('aurora', now)
                night = Math.min(1, weather.amount('stars', now) + weather.amount('meteors', now) + aurora)
                raining = weather.amount('rain', now)
                snowing = weather.amount('snow', now)
                // The strip between the cells changes with the light too.
                const strip = `rgb(${GUTTER[0] * (1 - pull) + lightR | 0},${GUTTER[1] * (1 - pull) + lightG | 0},${GUTTER[2] * (1 - pull) + lightB | 0})`
                if (strip !== gutter) canvas.style.backgroundColor = gutter = strip
                // A gust is starting: it will sweep across the cells for a second or so.
                if (!calm && weather.amount('windy', now) > 0.3) {
                    const wind = weather.wind(now)
                    if (wind.force > 0.62 && !gusting) { gusting = true; gustAt = now; gustDir = wind.dir; wake(1500) }
                    else if (wind.force < 0.5) gusting = false
                }
            }

            // The glow follows whatever tile is under the pointer.
            const hover = state?.hover
            const wantGlow = hover ? 1 : 0
            if (hover) { glow.x = hover.x; glow.y = hover.y; glow.r = hover.color[0]; glow.g = hover.color[1]; glow.b = hover.color[2] }
            const glowing = Math.abs(wantGlow - glow.level) > 0.004
            if (glowing) stir(120); else glow.level = wantGlow

            // ── Which kind of frame is this? ────────────────────────────────
            const spots = state?.glows
            // (The aurora drifts slowly, so eight frames a second carry it.)
            const busy = now < busyUntil || fading
            const full = now - lastFull >= (moved ? 15 : busy ? 33 : aurora > 0 ? 125 : calm ? 1000 : 250)
            let patches = null
            if (!full) {
                if (calm || now - lastPatch < 31 || (now >= stirUntil && !icons.length && !spots?.length)) return
                // Everything that might look different from the last frame, as rectangles.
                patches = stale
                stale = []
                const cellHalf = (HEX_W / 2) * s + 10
                if (now < stirUntil) {
                    const reach = 240 * Math.max(s, 0.5) + cellHalf
                    stale.push([pointer.x - reach, pointer.y - reach, reach * 2, reach * 2])
                }
                if (glow.level > 0.01 || glowing) {
                    const reach = GLOW_RADIUS * s + cellHalf
                    stale.push([ox + glow.x * s - reach, oy + glow.y * s - reach, reach * 2, reach * 2])
                }
                if (spots) for (const spot of spots) {
                    const reach = SPOT_REACH * s + cellHalf
                    stale.push([ox + spot.x * s - reach, oy + spot.y * s - reach, reach * 2, reach * 2])
                }
                patches = patches.concat(stale)
                const half = (ICON_SIZE / 2 + 12) * s
                for (const icon of icons) patches.push([ox + icon.cell.x * s - half, oy + icon.cell.y * s - half, half * 2, half * 2])
                // Keep the ones on screen, snapped outwards to whole canvas pixels so their edges leave no seam.
                const k = canvas.width / w
                patches = patches.filter(p => p[0] < w && p[1] < h && p[0] + p[2] > 0 && p[1] + p[3] > 0).map(p => {
                    const x0 = Math.floor(p[0] * k) / k, y0 = Math.floor(p[1] * k) / k
                    return [x0, y0, Math.ceil((p[0] + p[2]) * k) / k - x0, Math.ceil((p[1] + p[3]) * k) / k - y0]
                })
                if (!patches.length) return
            } else stale = []

            const step = Math.min(now - Math.max(lastFull, lastPatch), 100)
            glow.level += (wantGlow - glow.level) * Math.min(1, step / 110)
            if (full) {
                // Puddles gather over twenty seconds of rain and dry as slowly; snow takes longer to settle.
                const since = Math.min(now - lastFull, 1000) / 1000
                wet += ((raining > 0.5 ? 1 : 0) - wet) * Math.min(1, since / 20)
                snowy += ((snowing > 0.5 ? 1 : 0) - snowy) * Math.min(1, since / 45)
                lastFull = now
                lastCam = { x: cam.x, y: cam.y, s: cam.s }
            }
            lastPatch = now
            // The slow ambient light only moves on FULL frames. A PATCH frame reuses
            // the last one, so a cell it repaints matches the neighbours it did not.
            const ambient = lastFull

            const intro = calm ? 9e9 : now - introAt
            const waving = now - waveAt < 4000 && from !== to
            if (!waving) from = to
            const ripples = state?.ripples
            const near = 240 * Math.max(s, 0.5)
            const cellW = (HEX_W / 2) * s, cellH = (HEX_H / 2) * s + 7 * s
            // Where the front of the current gust is, in world px (null when the air is still).
            const gustAge = now - gustAt
            const gustFront = gustAge < 1400
                ? (gustDir > 0 ? -ox / s - 450 : (w - ox) / s + 450) + gustDir * (w / s + 900) * (gustAge / 1300)
                : null
            starList.length = puddleList.length = 0

            if (patches) {
                ctx.save()
                ctx.beginPath()
                for (const p of patches) ctx.rect(p[0], p[1], p[2], p[3])
                ctx.clip()
            }
            ctx.clearRect(0, 0, w, h)

            // ── Pass 1: work out each cell's colour and size ────────────────
            let count = 0
            const r0 = Math.floor(-oy / s / STEP_Y) - 1, r1 = Math.ceil((h - oy) / s / STEP_Y) + 1
            for (let r = r0; r <= r1; r++) {
                const q0 = Math.floor(-ox / s / STEP_X - r / 2) - 1, q1 = Math.ceil((w - ox) / s / STEP_X - r / 2) + 1
                for (let q = q0; q <= q1; q++) {
                    const c = cellInfo(q, r)
                    const sx = ox + c.x * s, sy = oy + c.y * s
                    if (patches) {            // a PATCH frame skips every cell outside the patches
                        let hit = false
                        for (const p of patches) {
                            if (sx + cellW > p[0] && sx - cellW < p[0] + p[2] && sy + cellH > p[1] && sy - cellH < p[1] + p[3]) { hit = true; break }
                        }
                        if (!hit) continue
                    }
                    let size = 1, flip = 1

                    if (intro < 2800) {
                        size = easeOut(clamp((intro - c.dist * 38) / 380))
                        if (size <= 0.01) continue
                    }

                    let rgb = cellColor(c, to, tints)
                    if (waving) {
                        const before = cellColor(c, from, tints)
                        if (before !== rgb) {
                            const p = calm ? 1 : clamp((now - waveAt - (Math.hypot(c.x - waveX, c.y - waveY) / STEP_X) * WAVE_MS) / FLIP_MS)
                            if (p < 1) { flip = Math.abs(Math.cos(Math.PI * p)); if (p < 0.5) rgb = before }
                        }
                    }
                    let cr = rgb >> 16, cg = (rgb >> 8) & 255, cb = rgb & 255

                    // The weather's light, then whatever has settled on the board.
                    if (pull) { cr = cr * (1 - pull) + lightR; cg = cg * (1 - pull) + lightG; cb = cb * (1 - pull) + lightB }
                    if (snowy > 0.01) {
                        const k = snowy * (0.3 + 0.45 * c.hash)
                        cr += (250 - cr) * k; cg += (252 - cg) * k; cb += (255 - cb) * k
                    }
                    // The aurora: slow bands of green and violet that drift across the cells.
                    if (aurora > 0.01) {
                        const band = Math.sin(c.x * 0.0016 + ambient * 0.00035 + 1.8 * Math.sin(c.y * 0.0011 - ambient * 0.00021))
                        if (band > 0) {
                            const k = band * Math.sqrt(band) * 0.6 * aurora * (0.6 + 0.4 * Math.sin(c.y * 0.002 + ambient * 0.0004 + c.hash * 6.28))
                            const violet = 0.5 + 0.5 * Math.sin(c.x * 0.0009 - ambient * 0.00015 + c.y * 0.0006)
                            cr += (70 + 100 * violet - cr) * k; cg += (255 - 135 * violet - cg) * k; cb += (170 + 85 * violet - cb) * k
                        }
                    }

                    if (!calm) {
                        // Slow breathing from the centre, and a few cells that glint.
                        let light = 0.03 * Math.sin(ambient * 0.0007 - c.dist * 0.6)
                        if (c.hash > 0.86) light += 0.05 * (0.5 + 0.5 * Math.sin(ambient * 0.0013 + c.hash * 40))

                        // The tile under the pointer washes the cells around it in its colour.
                        if (glow.level > 0.01) {
                            const gd = 1 - Math.hypot(c.x - glow.x, c.y - glow.y) / GLOW_RADIUS
                            if (gd > 0) {
                                const a = gd * gd * 0.62 * glow.level
                                cr += (glow.r - cr) * a; cg += (glow.g - cg) * a; cb += (glow.b - cb) * a
                            }
                        }

                        // The cell under the pointer brightens and gives slightly.
                        const pd = 1 - Math.hypot(sx - pointer.x, sy - pointer.y) / near
                        if (pd > 0) { light += 0.16 * pd * pd; size *= 1 - 0.08 * pd }

                        // A gust of wind flattens the cells for a moment as it passes over.
                        if (gustFront !== null) {
                            const band = 1 - Math.abs(c.x - gustFront) / 420
                            if (band > 0) { light += 0.12 * band; size *= 1 - 0.09 * band }
                        }

                        const a = Math.abs(light) * 2.2
                        if (light > 0) { cr += (255 - cr) * a; cg += (255 - cg) * a; cb += (255 - cb) * a }
                        else { cr += (150 - cr) * a; cg += (175 - cg) * a; cb += (155 - cb) * a }

                        // Rings of colour travelling out from whatever was clicked.
                        if (ripples) for (const rp of ripples) {
                            const age = now - rp.t
                            if (age < 0) continue
                            const band = 1 - Math.abs(Math.hypot(c.x - rp.x, c.y - rp.y) - age * RIPPLE_SPEED) / 190
                            if (band <= 0) continue
                            const k = band * (1 - age / RIPPLE_LIFE) * 0.6
                            cr += (rp.color[0] - cr) * k; cg += (rp.color[1] - cg) * k; cb += (rp.color[2] - cb) * k
                            size *= 1 + 0.05 * band * (1 - age / RIPPLE_LIFE)
                        }

                        // Where a meteor landed, the cells glow and slowly cool.
                        if (spots) for (const spot of spots) {
                            const age = now - spot.t
                            if (age < 0 || age > SPOT_LIFE) continue
                            const d = 1 - Math.hypot(c.x - spot.x, c.y - spot.y) / SPOT_REACH
                            if (d <= 0) continue
                            const k = d * (1 - age / SPOT_LIFE) ** 2 * 0.9
                            cr += (spot.color[0] - cr) * k; cg += (spot.color[1] - cg) * k; cb += (spot.color[2] - cb) * k
                        }
                    }

                    const hw = (HEX_W / 2) * s * size * flip
                    if (hw < 0.4) continue
                    if (count === cap) {
                        cap *= 2
                        const k2 = new Int32Array(cap), g2 = new Float32Array(cap * 4)
                        k2.set(keys); g2.set(geo); keys = k2; geo = g2; order = new Int32Array(cap)
                    }
                    // Colours are rounded to steps of 8 so near-identical cells share one fill.
                    keys[count] = ((cr >> 3) << 10) | ((cg >> 3) << 5) | (cb >> 3)
                    geo[count * 4] = sx; geo[count * 4 + 1] = sy; geo[count * 4 + 2] = hw; geo[count * 4 + 3] = (HEX_H / 2) * s * size
                    count++

                    // Things that sit on a cell: about a quarter of them hold a star at
                    // night, and about half collect a puddle in the rain.
                    if (flip > 0.6) {
                        if (night > 0.02 && c.hash > 0.55 && c.hash < 0.83) {
                            const twinkle = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(ambient * 0.0021 + c.hash * 97))
                            starList.push(sx + (c.hash - 0.69) * 3.5 * cellW, sy + ((c.hash * 7) % 1 - 0.5) * 0.8 * cellW, (9 + 15 * ((c.hash * 13) % 1)) * s * size, night * twinkle)
                        }
                        if (wet > 0.02 && c.hash < 0.55) puddleList.push(sx + (c.hash - 0.27) * cellW, sy + cellW * 0.22, cellW * (0.3 + 0.55 * c.hash) * wet * size)
                    }
                }
            }

            // ── Pass 2: fill, one path per colour ───────────────────────────
            // Undersides first (the sliver of "thickness" below each cell), grouped
            // by rough colour since nobody can tell their exact shade; then the tops.
            const sorted = order.subarray(0, count)
            for (let i = 0; i < count; i++) sorted[i] = i
            sorted.sort((a, b) => (keys[a] & ROUGH) - (keys[b] & ROUGH))
            for (let i = 0; i < count;) {
                const key = keys[sorted[i]] & ROUGH
                i = fillRun(sorted, count, i, ROUGH, 7 * s)
                ctx.fillStyle = `rgb(${(((key >> 10) << 3) + 16) * 0.87 | 0},${((((key >> 5) & 31) << 3) + 16) * 0.89 | 0},${(((key & 31) << 3) + 16) * 0.87 | 0})`
                ctx.fill()
            }
            sorted.sort((a, b) => keys[a] - keys[b])
            for (let i = 0; i < count;) {
                const key = keys[sorted[i]]
                i = fillRun(sorted, count, i, -1, 0)
                ctx.fillStyle = `rgb(${((key >> 10) << 3) + 3},${(((key >> 5) & 31) << 3) + 3},${((key & 31) << 3) + 3})`
                ctx.fill()
            }

            // ── Rain water lying on the cells: a pale pool with a brighter glint ─
            if (puddleList.length) {
                ctx.beginPath()
                for (let i = 0; i < puddleList.length; i += 3) {
                    const x = puddleList[i], y = puddleList[i + 1], r = puddleList[i + 2]
                    ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, r * 0.42, 0, 0, Math.PI * 2)
                }
                ctx.fillStyle = 'rgba(255,255,255,0.17)'; ctx.fill()
                ctx.beginPath()
                for (let i = 0; i < puddleList.length; i += 3) {
                    const x = puddleList[i] - puddleList[i + 2] * 0.3, y = puddleList[i + 1] - puddleList[i + 2] * 0.1, r = puddleList[i + 2] * 0.34
                    ctx.moveTo(x + r, y); ctx.ellipse(x, y, r, r * 0.4, 0, 0, Math.PI * 2)
                }
                ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fill()
            }

            // ── Stars, in three brightnesses so each takes a single fill ────
            if (starList.length) {
                for (let level = 0; level < 3; level++) {
                    ctx.beginPath()
                    for (let i = 0; i < starList.length; i += 4) {
                        if (Math.min(2, starList[i + 3] * 3 | 0) === level) starPath(ctx, starList[i], starList[i + 1], starList[i + 2] * (0.75 + 0.15 * level))
                    }
                    ctx.fillStyle = `rgba(255,248,214,${0.28 + 0.3 * level})`
                    ctx.fill()
                }
            }

            // ── Category icons resting on the empty cells of open fields ────
            if (icons.length) {
                icons = icons.filter(i => !i.dying || now - i.dying < 260)
                for (const icon of icons) {
                    const age = now - icon.born
                    const img = iconSets[icon.dir]?.[icon.n]
                    if (age < 0 || !img) continue
                    const { cell } = icon
                    const pop = icon.dying ? 1 - (now - icon.dying) / 260 : easeBack(clamp(age / 420))
                    const bob = calm ? 0 : Math.sin(now * 0.0011 + cell.hash * 20) * 7
                    const x = ox + cell.x * s, y = oy + (cell.y + bob) * s
                    // The ring that announces each icon, as on the original site.
                    if (age < 900 && !icon.dying && !calm) {
                        const t = age / 900
                        ctx.beginPath()
                        ctx.arc(x, y, (34 + 80 * easeOut(t)) * s, 0, Math.PI * 2)
                        ctx.strokeStyle = `rgba(255,255,255,${0.85 * (1 - t)})`
                        ctx.lineWidth = 3 * s
                        ctx.stroke()
                        wake(100)
                    }
                    if (icon.dying) wake(100)
                    const size = ICON_SIZE * s * pop
                    // At night the icons fade back, so they do not compete with the stars.
                    ctx.globalAlpha = 0.5 * clamp(pop) * (1 - 0.55 * night)
                    ctx.drawImage(img, x - size / 2, y - size / 2, size, size)
                }
                ctx.globalAlpha = 1
            }

            // ── Icons thrown out of a tile when it is pressed ───────────────
            if (state) for (const burst of state.bursts) {
                const t = (now - burst.t) / BURST_LIFE
                if (t < 0 || t > 1) continue
                for (let k = 0; k < 8; k++) {
                    const img = iconSets[burst.dir]?.[k % 4]
                    if (!img) continue
                    const angle = (k / 8) * Math.PI * 2 + burst.t % 1.7
                    const reach = (150 + (k % 3) * 55) * easeOut(t)
                    const size = (54 - 20 * t) * s
                    ctx.save()
                    ctx.translate(ox + (burst.x + Math.cos(angle) * reach) * s, oy + (burst.y + Math.sin(angle) * reach - 60 * t * (1 - t)) * s)
                    ctx.rotate((k % 2 ? 1 : -1) * t * 1.6)
                    ctx.globalAlpha = 0.85 * (1 - t) ** 1.5
                    ctx.drawImage(img, -size / 2, -size / 2, size, size)
                    ctx.restore()
                }
            }

            if (patches) ctx.restore()
        }

        const onMove = e => {
            pointer.x = e.clientX; pointer.y = e.clientY
            stir()
        }
        const onLeave = () => { pointer.x = pointer.y = -9999; stir(100) }
        const onVisibility = () => {
            cancelAnimationFrame(raf)
            if (!document.hidden) raf = requestAnimationFrame(draw)
        }

        resize()
        raf = requestAnimationFrame(draw)
        const ro = new ResizeObserver(resize)
        ro.observe(canvas)
        window.addEventListener('pointermove', onMove, { passive: true })
        document.addEventListener('pointerleave', onLeave)
        document.addEventListener('visibilitychange', onVisibility)
        return () => {
            cancelAnimationFrame(raf)
            ro.disconnect()
            window.removeEventListener('pointermove', onMove)
            document.removeEventListener('pointerleave', onLeave)
            document.removeEventListener('visibilitychange', onVisibility)
        }
    }, [getCamera, field, palette, withWeather])

    return <canvas ref={canvasRef} className="hexfield" aria-hidden="true" />
}

export default HexField
