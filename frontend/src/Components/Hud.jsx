import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Icon from './Icon.jsx'
import { CATEGORIES } from '../data/content.js'
import { ENTRY_COUNT } from '../lib/hex.js'
import { usePrefs } from '../lib/prefs.js'
import { audio } from '../lib/audio.js'
import { mascot } from '../lib/mascot.js'
import { LINES } from '../data/mascot.js'

// The controls that float above the board. They are small hexagonal keys with
// thickness, built the same way as the tiles, and they sit together as a piece
// of honeycomb instead of a row of buttons.

const KEY_W = 54, KEY_H = 62, GAP = 5
// Position of a key in a honeycomb: column, row (odd rows shift half a key).
const slot = (col, row) => ({ left: col * (KEY_W + GAP) + (row % 2 ? (KEY_W + GAP) / 2 : 0), top: row * (KEY_H * 0.75 + GAP) })

function HexKey({ icon, label, on, at, onClick, onHint, children, tone }) {
    return (
        <button
            type="button"
            className="hexkey"
            style={at}
            data-on={on === undefined ? undefined : on}
            data-tone={tone}
            aria-label={label}
            aria-pressed={on}
            onClick={e => { audio.unlock(); audio.press(); onClick?.(e) }}
            onPointerEnter={() => onHint?.(label)}
            onPointerLeave={() => onHint?.(null)}
            onFocus={() => onHint?.(label)}
            onBlur={() => onHint?.(null)}
        >
            <span className="hexkey__wall" />
            <span className="hexkey__face">
                <span className="hexkey__top">{children ?? <Icon name={icon} size={21} strokeWidth={2} />}</span>
            </span>
        </button>
    )
}

// Three bars that dance while the music plays.
const Equalizer = () => <span className="eq" aria-hidden="true"><i /><i /><i /></span>

export function Controls({ onIndex, onFit, onHelp }) {
    const p = usePrefs()
    const musicOn = p.music === true
    const [hint, setHint] = useState(null)
    const toggleMusic = () => {
        audio.setMusic(!musicOn)
        mascot.say(musicOn ? LINES.musicOff : LINES.musicOn, { low: true })
    }
    return (
        <div className="comb comb--controls" style={{ width: slot(2, 0).left + KEY_W, height: slot(0, 1).top + KEY_H + 8 }}>
            <HexKey at={slot(0, 0)} icon="list" label="Index of every tile" onClick={onIndex} onHint={setHint} />
            <HexKey at={slot(1, 0)} icon={p.sfx ? 'sound' : 'soundOff'} label={p.sfx ? 'Sound effects: on' : 'Sound effects: off'} on={p.sfx} onClick={() => audio.setSfx(!p.sfx)} onHint={setHint} />
            <HexKey at={slot(2, 0)} label={musicOn ? 'Music: on' : 'Music: off'} on={musicOn} onClick={toggleMusic} onHint={setHint}>
                {musicOn ? <Equalizer /> : <Icon name="noteOff" size={21} strokeWidth={2} />}
            </HexKey>
            <HexKey at={slot(0, 1)} icon="fit" label="Fit the board to the screen" onClick={onFit} onHint={setHint} />
            <HexKey at={slot(1, 1)} icon="help" label="How this works" onClick={onHelp} onHint={setHint} />
            <span className="comb__hint" data-show={hint ? true : undefined}>{hint}</span>
        </div>
    )
}

export function HomeKey({ onHome }) {
    return (
        <div className="homekey">
            <HexKey icon="left" label="Back to the front page" onClick={onHome} tone="ink" />
            <span className="homekey__name">Gabriel Lago</span>
        </div>
    )
}

export function ZoomKeys({ onIn, onOut }) {
    return (
        <div className="comb comb--zoom" style={{ width: slot(0, 1).left + KEY_W, height: slot(0, 1).top + KEY_H + 8 }}>
            <HexKey at={slot(0, 0)} icon="plus" label="Zoom in" onClick={onIn} />
            <HexKey at={slot(0, 1)} icon="minus" label="Zoom out" onClick={onOut} />
        </div>
    )
}

// How much of the board has been read: a hexagon whose outline fills in. It
// sits where the mascot stands, and opens the index.
export function Progress({ count, onClick }) {
    const done = count >= ENTRY_COUNT
    return (
        <button type="button" className="tally" data-done={done || undefined} onClick={onClick}
            aria-label={`${count} of ${ENTRY_COUNT} tiles read. Open the index.`}>
            <svg viewBox="0 0 80 92" aria-hidden="true">
                <polygon className="tally__bed" points="40,3 77,24.5 77,67.5 40,89 3,67.5 3,24.5" />
                <polygon className="tally__fill" points="40,3 77,24.5 77,67.5 40,89 3,67.5 3,24.5" pathLength="100"
                    strokeDasharray={`${(count / ENTRY_COUNT) * 100} 100`} />
            </svg>
            <span className="tally__count">{count}</span>
            <span className="tally__total">of {ENTRY_COUNT}</span>
        </button>
    )
}

// A plain, searchable list of every tile, for people who would rather read
// than explore, and for keyboard and screen-reader users.
export function IndexDrawer({ visited, onPick, onClose }) {
    const [query, setQuery] = useState('')
    const inputRef = useRef(null)
    useEffect(() => { inputRef.current?.focus() }, [])

    const groups = useMemo(() => {
        const q = query.trim().toLowerCase()
        return CATEGORIES.map(cat => ({
            cat,
            entries: cat.entries.filter(e => !q
                || [e.title, e.tile, e.kicker, e.lead, cat.label, ...(e.stack ?? [])].join(' ').toLowerCase().includes(q)),
        })).filter(g => g.entries.length)
    }, [query])

    return (
        <>
            <motion.div className="scrim" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.aside className="drawer" role="dialog" aria-label="Index of every tile"
                initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }}
                transition={{ type: 'spring', stiffness: 280, damping: 32 }}>
                <div className="drawer__head">
                    <h2>Index</h2>
                    <button type="button" className="iconbtn iconbtn--dark" onClick={onClose} aria-label="Close index"><Icon name="close" size={18} /></button>
                </div>
                <label className="drawer__search">
                    <Icon name="search" size={17} />
                    <input ref={inputRef} type="search" value={query} onChange={e => setQuery(e.target.value)}
                        placeholder="Search: python, hackathon, AWS…" aria-label="Search tiles" />
                </label>
                <div className="drawer__list">
                    {groups.length === 0 && <p className="drawer__empty">Nothing matches “{query}”.</p>}
                    {groups.map(({ cat, entries }) => (
                        <section key={cat.id} style={{ '--face': cat.colors.face, '--accent': cat.colors.deep }}>
                            <h3><i />{cat.label}</h3>
                            <ul>
                                {entries.map(e => (
                                    <li key={e.id}>
                                        <button type="button" onClick={() => onPick(e.id)}>
                                            <span className="drawer__name">{e.title}</span>
                                            <span className="drawer__kicker">{e.kicker}</span>
                                            {visited.has(e.id) && <Icon name="check" size={15} className="drawer__check" />}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    ))}
                </div>
            </motion.aside>
        </>
    )
}
