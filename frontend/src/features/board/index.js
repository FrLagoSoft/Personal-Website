// The board feature: tiles, the canvas field under them, the story panel, and the camera.
export { default as Tile } from './Tile.jsx'
export { default as HexField } from './HexField.jsx'
export { default as DetailPanel } from './DetailPanel.jsx'
export { useCamera } from './useCamera.js'
// The board's geometry: where every tile sits, and the hex measurements.
export { TILES, TILE_BY_ID, ENTRY_COUNT, HEX_W, HEX_H, STEP_X, STEP_Y, boundsOf, nearestCell } from './layout.js'
