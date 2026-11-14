import { HexKey } from './HexKey.jsx'
import { KEY_W, KEY_H, slot } from './honeycomb.js'
import './controls.css'

// Zoom in and out, bottom right (hidden on phones, where pinch does it).
export default function ZoomKeys({ onIn, onOut }) {
    return (
        <div className="comb comb--zoom" style={{ width: slot(0, 1).left + KEY_W, height: slot(0, 1).top + KEY_H + 8 }}>
            <HexKey at={slot(0, 0)} icon="plus" label="Zoom in" onClick={onIn} />
            <HexKey at={slot(0, 1)} icon="minus" label="Zoom out" onClick={onOut} />
        </div>
    )
}
