import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Icon from '@/shared/ui/Icon.jsx'
import { galleryFor, portrait } from '@/content/photos.js'
import '@/shared/ui/buttons.css'
import './detail-panel.css'

const CONFETTI = Array.from({ length: 16 }, (_, i) => {
    const angle = (i / 16) * Math.PI * 2 + (i % 2) * 0.3
    const reach = 70 + ((i * 37) % 60)
    return { dx: Math.cos(angle) * reach, dy: Math.sin(angle) * reach - 30, spin: (i % 2 ? 1 : -1) * (120 + i * 20), delay: (i % 5) * 0.03 }
})

// The story behind one tile. Slides in from the right on wide screens and up
// from the bottom on phones.
function DetailPanel({ tile, narrow, firstVisit, position, onClose, onPrev, onNext }) {
    const { data, cat, kind } = tile
    const photos = useMemo(() => galleryFor(tile.id), [tile.id])
    const [zoom, setZoom] = useState(null) // { id, src }: remembered per tile so it closes when the tile changes
    const zoomed = zoom?.id === tile.id ? zoom.src : null
    const bodyRef = useRef(null)
    const closeRef = useRef(null)

    useEffect(() => { bodyRef.current?.scrollTo({ top: 0 }) }, [tile.id])

    useEffect(() => { closeRef.current?.focus({ preventScroll: true }) }, [])

    const colors = cat?.colors ?? { face: '#10231A', ink: '#FFFFFF', deep: '#1F6B3A' }
    const paragraphs = data.body ?? []
    const from = narrow ? { y: '100%' } : { x: '100%' }

    return (
        <motion.aside
            className="panel"
            data-narrow={narrow || undefined}
            style={{ '--face': colors.face, '--ink': colors.ink, '--accent': colors.deep }}
            role="dialog"
            aria-label={data.title}
            initial={{ ...from, opacity: 0.6 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={{ ...from, opacity: 0.6 }}
            transition={{ type: 'spring', stiffness: 260, damping: 30 }}
        >
            <header className="panel__head" key={tile.id}>
                <svg className="panel__pattern" viewBox="0 0 240 200" aria-hidden="true">
                    {[[150, 30, 70], [215, 120, 54], [120, 150, 36]].map(([x, y, r], i) => (
                        <polygon key={i} fill="none" stroke="currentColor" strokeWidth="1.5"
                            points={[0, 1, 2, 3, 4, 5].map(k => {
                                const a = Math.PI / 6 + (k * Math.PI) / 3
                                return `${x + Math.cos(a) * r},${y + Math.sin(a) * r}`
                            }).join(' ')} />
                    ))}
                </svg>
                {data.medal && firstVisit && (
                    <span className="confetti" aria-hidden="true">
                        {CONFETTI.map((c, i) => (
                            <i key={i} style={{ '--dx': `${c.dx}px`, '--dy': `${c.dy}px`, '--spin': `${c.spin}deg`, animationDelay: `${c.delay}s` }} />
                        ))}
                    </span>
                )}
                <div className="panel__bar">
                    <span className="panel__crumb">{kind === 'me' ? 'About' : cat.label}{position ? ` · ${position}` : ''}</span>
                    <span className="panel__nav">
                        {onPrev && <button type="button" className="iconbtn" onClick={onPrev} aria-label="Previous tile"><Icon name="left" size={18} /></button>}
                        {onNext && <button type="button" className="iconbtn" onClick={onNext} aria-label="Next tile"><Icon name="right" size={18} /></button>}
                        <button type="button" className="iconbtn" ref={closeRef} onClick={onClose} aria-label="Close panel"><Icon name="close" size={18} /></button>
                    </span>
                </div>
                <motion.div
                    className="panel__titles"
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, delay: 0.08, ease: [0.2, 0.8, 0.2, 1] }}
                >
                    {kind === 'me' && portrait && <img className="panel__portrait" src={portrait} alt="Gabriel Lago" />}
                    {data.kicker && (
                        <p className="panel__kicker">
                            {data.medal && <Icon name="trophy" size={15} strokeWidth={2.2} />}
                            {data.kicker}
                        </p>
                    )}
                    <h2 className="panel__title">{data.title}</h2>
                    {(data.role || data.when) && (
                        <p className="panel__when">{[data.role, data.when].filter(Boolean).join(' · ')}</p>
                    )}
                </motion.div>
            </header>

            <div className="panel__body" ref={bodyRef} key={`${tile.id}-body`}>
                <p className="panel__lead">{data.lead}</p>
                {paragraphs.map((p, i) => <p key={i} className="panel__text">{p}</p>)}

                {data.points?.length > 0 && (
                    <ul className="panel__points">
                        {data.points.map((p, i) => (
                            <motion.li key={i} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }}
                                transition={{ duration: 0.35, delay: 0.16 + i * 0.06 }}>
                                {p}
                            </motion.li>
                        ))}
                    </ul>
                )}

                {photos.length > 0 && (
                    <div className="panel__photos">
                        {photos.map((src, i) => (
                            <button type="button" key={src} onClick={() => setZoom({ id: tile.id, src })} aria-label={`Open photo ${i + 1}`}>
                                <img src={src} alt="" loading="lazy" />
                            </button>
                        ))}
                    </div>
                )}
                {import.meta.env.DEV && photos.length === 0 && (
                    <p className="panel__devhint">
                        Only you see this (dev mode): add photos here by dropping
                        <code> src/content/photos/{tile.id}-1.jpg</code>, <code>{tile.id}-2.jpg</code>…
                    </p>
                )}

                {data.stack?.length > 0 && (
                    <ul className="panel__stack" aria-label="Technologies">
                        {data.stack.map(s => <li key={s}>{s}</li>)}
                    </ul>
                )}

                {data.links?.length > 0 && (
                    <div className="panel__links">
                        {data.links.map(l => (
                            <a key={l.href} href={l.href} target="_blank" rel="noopener noreferrer">
                                {l.label}<Icon name="external" size={15} />
                            </a>
                        ))}
                    </div>
                )}
            </div>

            {zoomed && (
                <button type="button" className="lightbox" onClick={() => setZoom(null)} aria-label="Close photo">
                    <img src={zoomed} alt="" />
                </button>
            )}
        </motion.aside>
    )
}

export default DetailPanel
