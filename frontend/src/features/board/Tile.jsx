import { memo } from 'react'
import Icon from '@/shared/ui/Icon.jsx'
import { HEX_POINTS, hexInset } from './layout.js'
import { portrait, tilePhoto } from '@/content/photos.js'
import { audio } from '@/features/sound'
import './tile.css'

// One physical tile: a hexagon with thickness. It rises when hovered, goes
// down when pressed, and stays down while its category is open. All of that
// is CSS (see tile.css), so React only re-renders a tile when its state
// actually changes.
//
// How the thickness works: `tile__mover` holds the top face and, hanging below
// it, a wall that is longer than it ever needs to be. Moving the mover up or
// down is all a hover or a press does. `tile__base` is a fixed window whose
// bottom edge is the tile's footprint, so however far the wall hangs down, it
// is cut off where the tile meets the board.
//
// `tile` comes from layout.js: { kind: 'me' | 'cat' | 'entry', id, cat, data }.

const pts = d => hexInset(d).map(p => p.join(',')).join(' ')
// A point part of the way along one edge of an inset hexagon.
const along = (d, edge, t) => {
    const p = hexInset(d), a = p[edge], b = p[(edge + 1) % 6]
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
}

// Each category has its own border, drawn inside the edge of its tile and,
// more lightly, on every tile that belongs to it.
//   reeded     the milled edge of a medal            (hackathons)
//   blueprint  dashed construction lines and marks   (projects)
//   circuit    traces and solder pads                (toolkit)
//   staff      music-staff lines with notes          (off the clock)
//   diploma    the double rule of a certificate      (education)
//   stitch     saddle stitching on a briefcase       (experience)
const ORNAMENTS = {
    reeded: full => (
        <>
            <polygon points={pts(15)} strokeWidth="9" strokeDasharray="2.4 4.6" />
            {full && <polygon points={pts(25)} strokeWidth="1.6" />}
        </>
    ),
    blueprint: full => (
        <>
            <polygon points={pts(15)} strokeWidth="1.8" strokeDasharray="11 7" />
            {full && hexInset(15).map(([x, y], i) => (
                <path key={i} strokeWidth="1.8" d={`M${x - 9},${y} h18 M${x},${y - 9} v18`} />
            ))}
        </>
    ),
    circuit: full => (
        <>
            {/* pathLength 600 = 100 per side: a trace, a gap, a trace along every edge */}
            <polygon points={pts(15)} strokeWidth="2.4" pathLength="600" strokeDasharray="30 40 30 0" />
            {hexInset(15).map(([x, y], i) => <circle key={i} cx={x} cy={y} r={full ? 5.5 : 4} fill="currentColor" stroke="none" />)}
            {full && [0, 1, 2, 3, 4, 5].map(i => {
                const [x, y] = along(15, i, 0.3), [x2, y2] = along(15, i, 0.7)
                return <path key={i} strokeWidth="2.4" d={`M${x},${y} m-3,0 a3,3 0 1 0 6,0 a3,3 0 1 0 -6,0 M${x2},${y2} m-3,0 a3,3 0 1 0 6,0 a3,3 0 1 0 -6,0`} />
            })}
        </>
    ),
    staff: full => (
        <>
            {(full ? [11, 16, 21, 26] : [12, 18]).map(d => <polygon key={d} points={pts(d)} strokeWidth="1.3" />)}
            {full && [[0, 0.3, 16], [0, 0.62, 21], [3, 0.35, 11], [3, 0.7, 21], [1, 0.5, 16], [4, 0.5, 26]].map(([edge, t, d], i) => {
                const [x, y] = along(d, edge, t)
                return <ellipse key={i} cx={x} cy={y} rx="5.2" ry="4" fill="currentColor" stroke="none" transform={`rotate(-20 ${x} ${y})`} />
            })}
        </>
    ),
    diploma: full => (
        <>
            <polygon points={pts(12)} strokeWidth="3.6" />
            <polygon points={pts(20)} strokeWidth="1.2" />
            {full && [0, 3].map(i => {
                const [x, y] = hexInset(31)[i]
                return <path key={i} fill="currentColor" stroke="none" d={`M${x},${y - 8} l6,8 -6,8 -6,-8 Z`} />
            })}
        </>
    ),
    stitch: full => (
        <>
            <polygon points={pts(16)} strokeWidth="3.2" strokeDasharray="10 9" strokeLinecap="round" />
            {full && <polygon points={pts(8)} strokeWidth="1.2" />}
        </>
    ),
}

function Tile({ tile, open = false, selected = false, visited = true, fresh = false, nudge = false, progress, onActivate, onHover, tabIndex }) {
    const { kind, data, cat } = tile
    const colors = (kind === 'cat' ? data : cat)?.colors
    const border = (kind === 'cat' ? data : cat)?.border
    const photo = kind === 'me' ? portrait : tilePhoto(tile.id)

    const style = kind === 'me' ? undefined : kind === 'cat'
        ? { '--face': colors.face, '--rim': colors.wall, '--wall': colors.wall, '--wall2': colors.wall2, '--ink': colors.ink, '--accent': colors.ink }
        : { '--cat': colors.face, '--wall': colors.wall, '--wall2': colors.wall2, '--accent': colors.deep }

    const label = kind === 'cat'
        ? `${data.label}, ${data.entries.length} tiles, ${open ? 'open' : 'closed'}`
        : kind === 'me' ? 'About Gabriel Lago' : `${data.title}${data.kicker ? `, ${data.kicker}` : ''}`

    return (
        <button
            type="button"
            className="tile"
            data-kind={kind}
            data-open={open || undefined}
            data-selected={selected || undefined}
            data-visited={kind === 'entry' && visited ? true : undefined}
            data-fresh={fresh || undefined}
            data-nudge={nudge || undefined}
            data-medal={data.medal}
            data-photo={photo ? true : undefined}
            style={style}
            tabIndex={tabIndex}
            aria-label={label}
            aria-pressed={kind === 'cat' ? open : undefined}
            onClick={e => onActivate?.(tile, e)}
            onPointerEnter={e => { if (e.pointerType === 'mouse') { audio.hover(); onHover?.(tile) } }}
            onPointerLeave={() => onHover?.(null)}
        >
            <span className="tile__shadow" />
            <span className="tile__base">
                <span className="tile__mover">
                    <span className="tile__wall" />
                    <span className="tile__face">
                        <span className="tile__top">
                            {photo && <img className="tile__photo" src={photo} alt="" draggable="false" />}
                            {border && !photo && (
                                <svg className="tile__ornament" viewBox="0 0 266 306" aria-hidden="true">
                                    {ORNAMENTS[border]?.(kind === 'cat')}
                                </svg>
                            )}
                            {kind === 'cat' && (
                                <>
                                    <Icon name={data.icon} size={40} strokeWidth={1.6} />
                                    <span className="tile__title">{data.label}</span>
                                    <span className="tile__meta">{progress ?? `${data.entries.length} tiles`}</span>
                                </>
                            )}
                            {kind === 'entry' && (
                                <>
                                    <span className="tile__kicker">
                                        {data.medal && <Icon name="trophy" size={14} strokeWidth={2.2} />}
                                        {data.kicker}
                                    </span>
                                    <span className="tile__title">{data.tile}</span>
                                    {data.wip && <span className="tile__wip">In progress</span>}
                                </>
                            )}
                            {kind === 'me' && (
                                <span className="tile__plate">
                                    <span className="tile__kicker">{data.kicker}</span>
                                    <span className="tile__title">{data.tile}</span>
                                </span>
                            )}
                        </span>
                    </span>
                </span>
            </span>
            <svg className="tile__ring" viewBox="0 0 266 306" aria-hidden="true">
                <polygon points={HEX_POINTS} />
            </svg>
            {kind === 'entry' && !visited && <span className="tile__pip" />}
        </button>
    )
}

export default memo(Tile)
