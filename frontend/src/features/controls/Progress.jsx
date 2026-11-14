import { ENTRY_COUNT } from '@/features/board'
import './controls.css'

// How much of the board has been read: a hexagon whose outline fills in. It
// sits where the mascot stands, and opens the index.
export default function Progress({ count, onClick }) {
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
