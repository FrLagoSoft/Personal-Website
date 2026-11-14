import { HexKey } from './HexKey.jsx'
import './controls.css'

// Back to the landing page, top left.
export default function HomeKey({ onHome }) {
    return (
        <div className="homekey">
            <HexKey icon="left" label="Back to the front page" onClick={onHome} tone="ink" />
            <span className="homekey__name">Gabriel Lago</span>
        </div>
    )
}
