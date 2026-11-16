import { useCallback, useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { FaLinkedin, FaGithub, FaInstagram, FaYoutube } from 'react-icons/fa'
import { HexField, Tile, TILES, STEP_X, STEP_Y, HEX_H } from '@/features/board'
import Icon from '@/shared/ui/Icon.jsx'
import { useWipe } from '@/app/page-wipe'
import { PROFILE } from '@/content/content.js'
import { audio } from '@/features/sound'
import { prefs } from '@/shared/state/prefs.js'
import { mascot, LINES } from '@/features/mascot'
import { weather } from '@/features/weather'
import '@/shared/ui/buttons.css'
import './landing.css'

const CLUSTER = TILES.filter(t => t.kind !== 'entry') // the centre tile and the six categories
const SOCIAL_ICONS = { linkedin: FaLinkedin, github: FaGithub, instagram: FaInstagram, youtube: FaYoutube }
const EASE = [0.2, 0.8, 0.2, 1]
const hexToRgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16))

// Landing page: who this is, the three results, and a small working model of
// the board. The tiles here sit on the same lattice as the background field,
// and each one opens the board on that category.
function LandingPage() {
    const go = useWipe()
    const nestRef = useRef(null)
    const camera = useRef({ x: 0, y: 0, s: 0.5 })
    const [scale, setScale] = useState(0.5)
    const getCamera = useCallback(() => camera.current, [])
    // Nothing is open here, but the field still glows towards the tile under the pointer.
    const field = useRef({ mask: 0, wave: null, ripples: [], bursts: [], hover: null })
    const hover = useCallback(tile => {
        field.current.hover = tile && { x: tile.x, y: tile.y, color: tile.kind === 'me' ? [138, 168, 145] : hexToRgb(tile.data.colors.face) }
    }, [])

    // The mascot walks on and says hello (on a phone it stays quiet: no room for a speech bubble).
    useEffect(() => {
        if (window.matchMedia('(max-width: 900px)').matches) return
        const t = setTimeout(() => mascot.say(LINES.landing), 2600)
        return () => { clearTimeout(t); mascot.hush() }
    }, [])

    // Size the cluster to its box, and point the background's camera at it so
    // the canvas cells land exactly under the tiles.
    useEffect(() => {
        const measure = () => {
            const el = nestRef.current
            if (!el) return
            const box = el.getBoundingClientRect()
            const s = Math.min(box.width / (STEP_X * 3 + 30), box.height / (STEP_Y * 2 + HEX_H + 50), 0.86)
            camera.current = {
                x: box.left + box.width / 2 - window.innerWidth / 2,
                y: box.top + box.height / 2 - window.innerHeight / 2,
                s,
            }
            setScale(s)
        }
        measure()
        const ro = new ResizeObserver(measure)
        ro.observe(nestRef.current)
        window.addEventListener('resize', measure)
        window.addEventListener('scroll', measure, true)
        return () => { ro.disconnect(); window.removeEventListener('resize', measure); window.removeEventListener('scroll', measure, true) }
    }, [])

    // mode: 'on' turns sound and music on, 'muted' turns both off, and 'keep'
    // respects whatever a returning visitor chose (first-timers get sound).
    const enter = (e, to = '/hexagons', mode = 'on') => {
        if (mode === 'muted') {
            audio.setSfx(false)
            audio.setMusic(false)
        } else {
            if (mode === 'on') prefs.set({ sfx: true, music: true })
            else if (prefs.get().music === null) prefs.set({ music: true })
            audio.cue(weather.plan())     // start the music of the weather the board is about to open on
            audio.unlock()
            audio.enter()
        }
        go(to, { x: e.clientX, y: e.clientY })
    }

    const openTile = (tile, e) => enter(e, tile.kind === 'cat' ? `/hexagons?open=${tile.id}` : '/hexagons?t=me', 'keep')

    return (
        <main className="landing">
            <HexField getCamera={getCamera} field={field} />
            <div className="landing__veil" />

            <header className="landing__top">
                <span className="mark" aria-hidden="true">
                    <svg viewBox="0 0 26 30" width="26" height="30"><polygon points="13,0 26,7.5 26,22.5 13,30 0,22.5 0,7.5" /></svg>
                    <b>GL</b>
                </span>
                <nav className="socials" aria-label="Social links">
                    {PROFILE.socials.map(s => {
                        const Brand = SOCIAL_ICONS[s.id]
                        return (
                            <a key={s.id} href={s.href} target={s.href.startsWith('mailto') ? undefined : '_blank'} rel="noopener noreferrer" aria-label={s.label} title={s.label}>
                                {Brand ? <Brand size={19} /> : <Icon name="mail" size={19} />}
                            </a>
                        )
                    })}
                </nav>
            </header>

            <section className="hero">
                <motion.p className="hero__kicker" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 0.15, ease: EASE }}>
                    {PROFILE.kicker}
                </motion.p>

                <h1 className="hero__name" aria-label={PROFILE.name}>
                    {PROFILE.name.split(' ').map((word, w) => (
                        <span className="hero__word" key={w} aria-hidden="true">
                            {[...word].map((ch, i) => (
                                <motion.span key={i} initial={{ y: '105%', rotate: 6 }} animate={{ y: 0, rotate: 0 }}
                                    transition={{ duration: 0.8, delay: 0.25 + w * 0.22 + i * 0.045, ease: [0.16, 1, 0.3, 1] }}>
                                    {ch}
                                </motion.span>
                            ))}
                        </span>
                    ))}
                </h1>

                <motion.p className="hero__tagline" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, delay: 0.85, ease: EASE }}>
                    {PROFILE.tagline}
                </motion.p>

                <ul className="proof" aria-label="Fall 2026 hackathon results">
                    {PROFILE.proof.map((item, i) => (
                        <motion.li key={item.to} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55, delay: 1.05 + i * 0.1, ease: EASE }}>
                            <button type="button" onClick={e => enter(e, `/hexagons?t=${item.to}`, 'keep')}>
                                <span className="proof__place">{item.place}</span>
                                <span className="proof__label">{item.label}</span>
                            </button>
                        </motion.li>
                    ))}
                </ul>

                <motion.div className="hero__cta" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, delay: 1.4, ease: EASE }}>
                    <button type="button" className="btn" onClick={e => enter(e)}>
                        <Icon name="sound" size={19} />Enter the board
                    </button>
                    <button type="button" className="textlink" onClick={e => enter(e, '/hexagons', 'muted')}>or enter muted</button>
                    <p className="hero__hint">Sound on is worth it: every tile is a note.</p>
                </motion.div>
            </section>

            <section className="nest" ref={nestRef} aria-label="The six fields of the board">
                <div className="nest__world" style={{ transform: `scale(${scale})` }}>
                    {CLUSTER.map((t, i) => (
                        <motion.div
                            key={t.id}
                            className="slot"
                            style={{ left: t.x, top: t.y, zIndex: t.r + 20 }}
                            initial={{ scale: 0, opacity: 0, y: 60 }}
                            animate={{ scale: 1, opacity: 1, y: 0 }}
                            transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.5 + i * 0.09 }}
                        >
                            <div className="bob" style={{ animationDelay: `${-i * 0.9}s` }}>
                                <Tile tile={t} onActivate={openTile} onHover={hover} />
                            </div>
                        </motion.div>
                    ))}
                </div>
            </section>
        </main>
    )
}

export default LandingPage
