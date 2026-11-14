// Size of one hex key, and where a key sits in a honeycomb of them.
export const KEY_W = 54, KEY_H = 62, GAP = 5

// Position of a key in a honeycomb: column, row (odd rows shift half a key).
export const slot = (col, row) => ({ left: col * (KEY_W + GAP) + (row % 2 ? (KEY_W + GAP) / 2 : 0), top: row * (KEY_H * 0.75 + GAP) })
