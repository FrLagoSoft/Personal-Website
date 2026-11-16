// Hex geometry and the automatic board layout.
//
// Tiles are pointy-top hexagons on an axial (q, r) grid. The centre tile is
// (0, 0). Each category sits on one of the six neighbours and owns the 60°
// wedge that starts on its axis, so two categories can never collide however
// many tiles they hold.

import { CATEGORIES, ME } from '@/content/content.js'
import { clamp } from '@/shared/utils/math.js'

export const HEX_W = 266
export const HEX_H = 306
export const STEP_X = 276 // centre-to-centre along a row (tile width + 10px gutter)
export const STEP_Y = 239 // row pitch (STEP_X × √3 / 2)
export const HEX_POINTS = '133,0 266,76.5 266,229.5 133,306 0,229.5 0,76.5'

// Clockwise from east, in screen space (y grows downwards).
export const DIRS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]]

export const toPixel = (q, r) => ({ x: STEP_X * (q + r / 2), y: STEP_Y * r })
export const hexDist = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2
export { clamp } // kept here too, for older imports

// Which of the six wedges a cell falls in (-1 for the centre).
export function wedgeOf(q, r) {
    if (!q && !r) return -1
    const { x, y } = toPixel(q, r)
    let deg = (Math.atan2(y, x) * 180) / Math.PI
    if (deg < 0) deg += 360
    return Math.floor(((deg + 1) % 360) / 60)
}

// Cell number `b` (0 … ring-1) of ring `ring` in a wedge. Ring 1 is the
// category tile itself; its tiles fill ring 2, then ring 3, and so on.
export function wedgeCell(dir, ring, b) {
    const [aq, ar] = DIRS[dir]
    const [bq, br] = DIRS[(dir + 1) % 6]
    const a = ring - b
    return { q: a * aq + b * bq, r: a * ar + b * br }
}

// The first `count` cells of a wedge, nearest ring first.
function wedgeCells(dir, count) {
    const out = []
    for (let ring = 2; out.length < count; ring++) {
        for (let b = 0; b < ring && out.length < count; b++) out.push(wedgeCell(dir, ring, b))
    }
    return out
}

// Corner points of a tile-sized hexagon shrunk inwards by `d` px, as an array
// of [x, y] in the tile's own 266 × 306 box. Used for the border ornaments.
export function hexInset(d) {
    const a = HEX_W / 2 - d
    const r = HEX_H / 2 - d / Math.cos(Math.PI / 6)
    const cx = HEX_W / 2, cy = HEX_H / 2
    return [[cx, cy - r], [cx + a, cy - r / 2], [cx + a, cy + r / 2], [cx, cy + r], [cx - a, cy + r / 2], [cx - a, cy - r / 2]]
}

function build() {
    const tiles = [{ kind: 'me', id: ME.id, q: 0, r: 0, x: 0, y: 0, data: ME }]
    for (const cat of CATEGORIES) {
        const [q, r] = DIRS[cat.dir]
        tiles.push({ kind: 'cat', id: cat.id, cat, q, r, ...toPixel(q, r), data: cat })
        wedgeCells(cat.dir, cat.entries.length).forEach((cell, order) => {
            const entry = cat.entries[order]
            tiles.push({ kind: 'entry', id: entry.id, cat, order, ...cell, ...toPixel(cell.q, cell.r), data: entry })
        })
    }
    return tiles
}

export const TILES = build()
export const TILE_BY_ID = Object.fromEntries(TILES.map(t => [t.id, t]))
export const cellKey = (q, r) => q * 1000 + r
// Every cell that can ever hold a tile, so the background knows where not to put icons.
export const TILE_CELLS = new Set(TILES.map(t => cellKey(t.q, t.r)))
export const ENTRY_COUNT = TILES.filter(t => t.kind === 'entry').length

// The hex cell nearest to a point on the board: its grid position and its centre.
export function nearestCell(x, y) {
    const r = Math.round(y / STEP_Y)
    const q = Math.round(x / STEP_X - r / 2)
    return { q, r, ...toPixel(q, r) }
}

// Bounding box (world px) of a set of tiles.
export function boundsOf(tiles) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const t of tiles) {
        x0 = Math.min(x0, t.x - HEX_W / 2); x1 = Math.max(x1, t.x + HEX_W / 2)
        y0 = Math.min(y0, t.y - HEX_H / 2); y1 = Math.max(y1, t.y + HEX_H / 2)
    }
    return { x0, x1, y0, y1, w: x1 - x0, h: y1 - y0, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 }
}
