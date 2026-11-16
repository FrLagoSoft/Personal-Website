import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useSearchParams } from 'react-router-dom'
import { HexField, Tile, DetailPanel, useCamera, TILES, TILE_BY_ID, ENTRY_COUNT, HEX_W, HEX_H, boundsOf, nearestCell } from '@/features/board'
import { Controls, HomeKey, ZoomKeys, Progress, IndexDrawer } from '@/features/controls'
import { useWipe } from '@/app/page-wipe'
import { CATEGORIES } from '@/content/content.js'
import { clamp } from '@/shared/utils/math.js'
import { useStableCallback } from '@/shared/hooks/useStableCallback.js'
import { useNarrow } from '@/shared/hooks/useNarrow.js'
import { prefs, usePrefs } from '@/shared/state/prefs.js'
import { audio } from '@/features/sound'
import { mascot, LINES, pick } from '@/features/mascot'
import { weather, useWeather, WeatherLayer, WEATHERS, WEATHER_IDS } from '@/features/weather'
import './board.css'

const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))
const CORE = TILES.filter(t => t.kind !== 'entry')       // centre + the six categories, always on the board
const ENTRIES = TILES.filter(t => t.kind === 'entry')    // every other tile: on the page from the start, hidden until its category opens
const CAT_IDS = new Set(CATEGORIES.map(c => c.id))
// What the background needs to know about each category, indexed by direction.
const PALETTE = []
CATEGORIES.forEach(c => { PALETTE[c.dir] = { tint: c.colors.tint, deep: c.colors.deep, iconSet: c.iconSet } })
const maskOf = ids => ids.reduce((m, id) => m | (1 << TILE_BY_ID[id].data.dir), 0)
const SAGE = [138, 168, 145]


// The board. Centre tile, six categories around it, and each category's tiles
// fanning out into its own wedge when opened.
function BoardPage() {
    const stageRef = useRef(null)
    const boundsRef = useRef(null)
    const cam = useCamera(stageRef, boundsRef)
    const go = useWipe()
    const narrow = useNarrow()
    const p = usePrefs()
    const [params, setParams] = useSearchParams()

    const [open, setOpen] = useState(() => (params.get('open') || '').split(',').filter(id => CAT_IDS.has(id)))
    const [selected, setSelected] = useState(null)
    const [firstVisit, setFirstVisit] = useState(false)
    const [fresh, setFresh] = useState(null)       // the tile that was just read for the first time
    const [nudge, setNudge] = useState(null)
    const [indexOpen, setIndexOpen] = useState(false)
    const [settled, setSettled] = useState(false)   // false for the first half second, so tiles opened by the address bar still animate in

    const visited = useMemo(() => new Set(p.visited), [p.visited])
    const field = useRef({ mask: 0, wave: null, ripples: [], bursts: [], glows: [], hover: null })
    const getCamera = useCallback(() => ({ x: cam.x.get(), y: cam.y.get(), s: cam.s.get() }), [cam])
    const lesson = useRef(0)                       // which step of the first-visit walkthrough we are on
    const greeted = useRef(new Set())              // categories the mascot has already introduced
    const lastTouch = useRef(0)

    const ripple = (tile, hex) => field.current.ripples.push({ x: tile.x, y: tile.y, t: performance.now(), color: hexToRgb(hex) })
    const burst = (tile, dir) => field.current.bursts.push({ x: tile.x, y: tile.y, t: performance.now(), dir })
    const setField = (ids, origin, delay = 0) => {
        field.current.mask = maskOf(ids)
        field.current.wave = { x: origin?.x ?? 0, y: origin?.y ?? 0, t: performance.now() + delay }
    }
    // Where a tile currently is on screen, so the mascot can look at it.
    const onScreen = tile => {
        const { width, height } = stageRef.current.getBoundingClientRect()
        return [width / 2 + cam.x.get() + tile.x * cam.s.get(), height / 2 + cam.y.get() + tile.y * cam.s.get()]
    }

    // ── Camera framing ──────────────────────────────────────────────────────
    // Fit whatever is on the board, or centre the selected tile in the space
    // the panel leaves free. Also tells the camera how far it may roam.
    const frame = useCallback((openIds, selectedId, instant = false) => {
        const el = stageRef.current
        if (!el) return
        const { width, height } = el.getBoundingClientRect()
        const b = boundsOf(TILES.filter(t => t.kind !== 'entry' || openIds.includes(t.cat.id)))
        const margin = narrow ? 150 : 190 // room for the controls above and the mascot below
        const fit = clamp(Math.min((width * 0.92) / b.w, (height - margin) / b.h), 0.2, 1)
        boundsRef.current = { ...b, minZoom: Math.max(0.2, fit * 0.7) }

        const panel = Math.min(480, width * 0.44)
        if (selectedId) {
            const inset = narrow ? { r: 0, b: height * 0.6 } : { r: panel, b: 0 }
            const t = TILE_BY_ID[selectedId]
            const ts = clamp(Math.min((width - inset.r) / (HEX_W * 2.1), (height - inset.b) / (HEX_H * 1.45)), 0.4, 1.05)
            cam.flyTo(-inset.r / 2 - t.x * ts, -inset.b / 2 - t.y * ts, ts, instant)
        } else cam.flyTo(-b.cx * fit, -6 - b.cy * fit, fit, instant)

        // The strip of floor the mascot may use: never under the panel.
        mascot.hide(narrow && !!selectedId)
        mascot.range(narrow ? 50 : 70, width - (narrow ? 50 : selectedId ? panel + 90 : 110))
    }, [cam, narrow])

    useEffect(() => { frame(open, selected) }, [open, selected, frame])

    useEffect(() => {
        let t
        const onResize = () => { clearTimeout(t); t = setTimeout(() => frame(open, selected), 120) }
        window.addEventListener('resize', onResize)
        return () => { clearTimeout(t); window.removeEventListener('resize', onResize) }
    }, [open, selected, frame])

    // ── Actions ─────────────────────────────────────────────────────────────
    // Reading a tile for the first time can be an occasion. Only the biggest
    // one that applies is celebrated.
    const celebrate = tile => {
        const seen = prefs.get().visited
        const cat = tile.cat
        const fieldDone = cat.entries.every(e => seen.includes(e.id)) && prefs.earn(`field:${cat.id}`)
        if (seen.length >= ENTRY_COUNT && prefs.earn('all')) { audio.bloom(); mascot.cheer(true); mascot.say(LINES.all(ENTRY_COUNT)) }
        else if (fieldDone) { audio.bloom(); mascot.cheer(true); mascot.say(LINES.fieldDone(cat.label)) }
        else if (seen.length >= Math.ceil(ENTRY_COUNT / 2) && prefs.earn('half')) { mascot.cheer(); mascot.say(LINES.half(seen.length, ENTRY_COUNT)) }
        else if (tile.data.medal) { mascot.cheer(); mascot.say(pick(LINES.medal), { low: true }) }
        else if (prefs.earn('first')) { mascot.cheer(); mascot.say(LINES.firstTile, { low: true }) }
    }

    const select = useStableCallback(id => {
        const tile = TILE_BY_ID[id]
        if (!tile) return
        audio.unlock()
        lastTouch.current = performance.now()
        if (lesson.current === 2) { lesson.current = 3; mascot.hush() }
        mascot.lookAt(...onScreen(tile))
        if (tile.kind === 'entry') {
            const isNew = !prefs.get().visited.includes(id)
            setFirstVisit(isNew)
            if (!open.includes(tile.cat.id)) {
                const next = [...open, tile.cat.id]
                setOpen(next)
                setField(next, TILE_BY_ID[tile.cat.id])
            }
            if (tile.data.medal) audio.chime(tile.order + tile.cat.dir)
            else audio.note(tile.order + tile.cat.dir * 2, 0.22)
            ripple(tile, tile.cat.colors.face)
            if (isNew) {
                prefs.visit(id)
                burst(tile, tile.cat.dir)
                setFresh(id)
                setTimeout(() => setFresh(f => (f === id ? null : f)), 1100)
                celebrate(tile)
            }
        } else {
            audio.note(0, 0.2)
            ripple(tile, '#8AA891')
        }
        audio.panel(true)
        setSelected(id)
        setIndexOpen(false)
    })

    const closePanel = useStableCallback(() => {
        if (!selected) return
        audio.panel(false)
        setSelected(null)
        if (lesson.current === 3) {                 // last step of the walkthrough
            lesson.current = 0
            prefs.set({ coached: true })
            mascot.say(LINES.tutorial[2])
        }
    })

    const toggle = tile => {
        audio.unlock()
        audio.press()
        lastTouch.current = performance.now()
        const cat = tile.data
        const opening = !open.includes(cat.id)
        const next = opening ? [...open, cat.id] : open.filter(id => id !== cat.id)
        setField(next, tile)
        ripple(tile, cat.colors.face)
        audio.arp(cat.entries.length, opening, cat.dir)
        if (opening) burst(tile, cat.dir)
        if (!opening && selected && TILE_BY_ID[selected]?.cat?.id === cat.id) setSelected(null)
        setOpen(next)

        mascot.lookAt(...onScreen(tile))
        if (!opening) return
        if (next.length === CATEGORIES.length) {
            // Every field open at once: the whole board lights up. (The original
            // site had a rainbow easter egg here; this is its descendant.)
            audio.bloom()
            mascot.cheer(true)
            mascot.say(LINES.fullBoard)
            const now = performance.now()
            CATEGORIES.forEach((c, i) => field.current.ripples.push({ x: 0, y: 0, t: now + i * 130, color: hexToRgb(c.colors.face) }))
        } else if (lesson.current === 1) {
            lesson.current = 2
            mascot.hop()
            mascot.say(LINES.tutorial[1], { sticky: true })
        } else if (!greeted.current.has(cat.id) && lesson.current === 0) {
            mascot.say(LINES.opened(cat.label, cat.blurb), { low: true })
        }
        greeted.current.add(cat.id)
    }

    const { dragged } = cam
    const activate = useStableCallback(tile => {
        if (dragged.current) return // that click was the end of a drag
        if (tile.kind === 'cat') toggle(tile)
        else select(tile.id)
    })

    // The background glows towards the colour of whatever tile is under the pointer.
    const hover = useStableCallback(tile => {
        field.current.hover = tile && { x: tile.x, y: tile.y, color: tile.kind === 'me' ? SAGE : hexToRgb((tile.cat ?? tile.data).colors.face) }
    })

    const step = dir => {
        const tile = TILE_BY_ID[selected]
        if (tile?.kind !== 'entry') return
        const list = tile.cat.entries
        select(list[(tile.order + dir + list.length) % list.length].id)
    }

    const help = () => mascot.say(LINES.help, { sticky: true })
    // What the mascot suggests when it is pressed: a field not opened yet, or what is left to read.
    const hint = useStableCallback(() => {
        const closed = CATEGORIES.filter(c => !open.includes(c.id))
        const left = ENTRY_COUNT - prefs.get().visited.length
        return closed.length ? LINES.hintField(pick(closed).label) : left ? LINES.hintLeft(left) : null
    })
    useEffect(() => {
        mascot.hint = hint
        return () => { mascot.hint = null }
    }, [hint])
    const fit = () => { closePanel(); frame(open, null) }
    const openIndex = () => {
        audio.unlock()
        setIndexOpen(true)
        if (prefs.earn('index')) mascot.say(LINES.index, { low: true })
    }

    // ── Weather ─────────────────────────────────────────────────────────────
    // The weather cycle runs while the board is open: about five minutes each,
    // in a random order. Two things in the address bar change that:
    //   ?weather=rain   open on a particular weather
    //   ?cycle=20       change every 20 seconds (for showing it off)
    const sky = useWeather()
    useEffect(() => {
        const asked = params.get('weather')
        const every = Number(params.get('cycle')) * 1000
        weather.start({
            id: WEATHER_IDS.includes(asked) ? asked : undefined,   // otherwise the one weather.plan() picked
            stay: every >= 5000 ? every : undefined,
        })
        audio.setWeather(weather.get().id)
        const off = [
            weather.on('change', ev => audio.setWeather(ev.id)),
            weather.on('thunder', () => audio.thunder()),
            // A meteor has landed on the board.
            weather.on('impact', ev => {
                const now = performance.now()
                audio.impact(ev.note)
                field.current.glows.push({ x: ev.x, y: ev.y, t: now, color: [255, 176, 96] })
                const hit = TILES.find(t => t.q === ev.q && t.r === ev.r)   // one that lands on a tile makes it jump
                if (hit) {
                    setNudge(hit.id)
                    setTimeout(() => setNudge(n => (n === hit.id ? null : n)), 1300)
                }
            }),
        ]
        return () => { off.forEach(fn => fn()); weather.stop(); audio.setWeather('sunny') }
        // Runs once, when the board opens.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── Arriving ────────────────────────────────────────────────────────────
    // Deep links: /hexagons?t=dronautics opens straight onto a tile.
    useEffect(() => {
        const settle = setTimeout(() => setSettled(true), 500)
        lastTouch.current = performance.now()
        setField(open, null, 500)
        frame(open, null, true)
        cam.s.set(cam.s.get() * 0.82) // start slightly pulled back, then settle in
        frame(open, null)
        const target = params.get('t')
        const linked = TILE_BY_ID[target] && TILE_BY_ID[target].kind !== 'cat'
        const timers = [
            linked && setTimeout(() => select(target), 900),
            // The mascot says hello: a walkthrough for first-timers, a welcome for the rest.
            !linked && setTimeout(() => {
                const seen = prefs.get().visited.length
                if (!prefs.get().coached) { lesson.current = 1; mascot.say(LINES.tutorial[0], { sticky: true }) }
                else if (seen && seen < ENTRY_COUNT) mascot.say(LINES.welcomeBack(seen, ENTRY_COUNT), { low: true })
            }, 1700),
        ]
        return () => { clearTimeout(settle); timers.forEach(clearTimeout); mascot.hush(); mascot.hide(false) }
        // Runs once on arrival; later changes are driven by the visitor.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    useEffect(() => {
        const next = {}
        if (selected) next.t = selected
        else if (open.length) next.open = open.join(',')
        setParams(next, { replace: true })
    }, [selected, open, setParams])

    // Every few seconds one unopened tile hops on its own, as an invitation.
    // And if the visitor goes quiet for a while, the mascot suggests something.
    useEffect(() => {
        if (selected || indexOpen) return
        const id = setInterval(() => {
            const unread = TILES.filter(t => t.kind === 'entry' && !prefs.get().visited.includes(t.id))
            const pool = open.length ? unread.filter(t => open.includes(t.cat.id)) : TILES.filter(t => t.kind === 'cat')
            if (pool.length) {
                const tile = pool[Math.floor(Math.random() * pool.length)]
                setNudge(tile.id)
                setTimeout(() => setNudge(n => (n === tile.id ? null : n)), 1300)
            }
            if (performance.now() - lastTouch.current > 38000 && lesson.current === 0 && unread.length) {
                lastTouch.current = performance.now() + 50000 // do not nag: once, then a long pause
                const closed = CATEGORIES.filter(c => !open.includes(c.id))
                mascot.say(closed.length ? LINES.hintField(pick(closed).label) : LINES.hintLeft(unread.length), { low: true })
            }
        }, 4600)
        return () => clearInterval(id)
    }, [open, selected, indexOpen])

    // ── Keyboard ────────────────────────────────────────────────────────────
    const onKey = useStableCallback(e => {
        if (e.target.closest?.('input, textarea')) { if (e.key === 'Escape') setIndexOpen(false); return }
        if (e.metaKey || e.ctrlKey || e.altKey) return
        const k = e.key
        if (k === 'Escape') { if (indexOpen) setIndexOpen(false); else if (selected) closePanel(); else mascot.hush() }
        else if (k === 'ArrowRight' && selected) step(1)
        else if (k === 'ArrowLeft' && selected) step(-1)
        else if (k === 'f' || k === 'F') fit()
        else if (k === 'm' || k === 'M') audio.setMusic(prefs.get().music !== true)
        else if (k === 's' || k === 'S') audio.setSfx(!prefs.get().sfx)
        else if (k === '+' || k === '=') cam.zoomAt(1.35, undefined, undefined, true)
        else if (k === '-') cam.zoomAt(1 / 1.35, undefined, undefined, true)
        else if (k === '/') { e.preventDefault(); openIndex() }
        else if (k === '?') help()
        else if (k === 'w' || k === 'W') weather.next()
    })
    useEffect(() => {
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
    }, [onKey])

    // A click on empty board closes the panel.
    const onStageClick = e => {
        if (dragged.current || e.target.closest('.tile')) return
        closePanel()
    }

    const selectedTile = selected ? TILE_BY_ID[selected] : null

    return (
        <main className="board" data-weather={sky} data-night={WEATHERS[sky].night || undefined}>
            <div className="stage" ref={stageRef} onClick={onStageClick}
                onPointerDown={() => { audio.unlock(); lastTouch.current = performance.now() }}>
                <HexField getCamera={getCamera} field={field} palette={PALETTE} withWeather />
                <motion.div className="world" style={{ x: cam.x, y: cam.y, scale: cam.s }}>
                    {/* Every entry tile is here from the start, hidden. Opening a category
                        only flips data-out, and CSS deals the tiles out from their category
                        (see .slot--entry in tile.css). Nothing is created or destroyed, and the
                        movement is run by the graphics card, so opening stays smooth. */}
                    {ENTRIES.map(t => {
                        const home = TILE_BY_ID[t.cat.id]
                        const out = settled && open.includes(t.cat.id)
                        return (
                            <div
                                key={t.id}
                                className="slot slot--entry"
                                data-out={out || undefined}
                                style={{
                                    left: t.x, top: t.y, zIndex: t.r + 20,
                                    '--from-x': `${((home.x - t.x) * 0.7).toFixed(0)}px`,
                                    '--from-y': `${((home.y - t.y) * 0.7).toFixed(0)}px`,
                                    '--out-delay': `${140 + t.order * 55}ms`,                              // dealt out one after another
                                    '--back-delay': `${(t.cat.entries.length - 1 - t.order) * 30}ms`,     // and gathered in reverse
                                }}
                            >
                                <Tile tile={t} selected={selected === t.id} visited={visited.has(t.id)} fresh={fresh === t.id}
                                    nudge={nudge === t.id} onActivate={activate} onHover={hover} />
                            </div>
                        )
                    })}
                    {CORE.map((t, i) => {
                        const seen = t.kind === 'cat' ? t.data.entries.filter(e => visited.has(e.id)).length : 0
                        return (
                            <motion.div
                                key={t.id}
                                className="slot"
                                style={{ left: t.x, top: t.y, zIndex: t.r + 20 }}
                                initial={{ scale: 0, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                transition={{ type: 'spring', stiffness: 220, damping: 17, delay: 0.25 + i * 0.07 }}
                            >
                                <Tile
                                    tile={t}
                                    open={open.includes(t.id)}
                                    selected={selected === t.id}
                                    nudge={nudge === t.id}
                                    progress={seen ? `${seen} of ${t.data.entries.length} read` : undefined}
                                    onActivate={activate}
                                    onHover={hover}
                                />
                            </motion.div>
                        )
                    })}
                </motion.div>
            </div>

            <WeatherLayer getCamera={getCamera} snap={nearestCell} />

            <HomeKey onHome={e => go('/', { x: e.clientX, y: e.clientY })} />
            <Controls onIndex={openIndex} onFit={fit} onHelp={help} onWeather={() => weather.next()} />
            <ZoomKeys
                onIn={() => cam.zoomAt(1.35, undefined, undefined, true)}
                onOut={() => cam.zoomAt(1 / 1.35, undefined, undefined, true)}
            />
            {!(narrow && selected) && <Progress count={visited.size} onClick={openIndex} />}

            <AnimatePresence>
                {selectedTile && (
                    <DetailPanel
                        key="panel"
                        tile={selectedTile}
                        narrow={narrow}
                        firstVisit={firstVisit}
                        position={selectedTile.kind === 'entry' ? `${selectedTile.order + 1} of ${selectedTile.cat.entries.length}` : null}
                        onClose={closePanel}
                        onPrev={selectedTile.kind === 'entry' ? () => step(-1) : null}
                        onNext={selectedTile.kind === 'entry' ? () => step(1) : null}
                    />
                )}
            </AnimatePresence>

            <AnimatePresence>
                {indexOpen && <IndexDrawer key="index" visited={visited} onPick={select} onClose={() => setIndexOpen(false)} />}
            </AnimatePresence>
        </main>
    )
}

export default BoardPage
