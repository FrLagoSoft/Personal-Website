import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import Icon from '@/shared/ui/Icon.jsx'
import { CATEGORIES } from '@/content/content.js'
import './index-drawer.css'

// A plain, searchable list of every tile, for people who would rather read
// than explore, and for keyboard and screen-reader users.
export default function IndexDrawer({ visited, onPick, onClose }) {
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
