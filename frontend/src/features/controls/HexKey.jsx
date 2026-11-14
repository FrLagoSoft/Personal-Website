import Icon from '@/shared/ui/Icon.jsx'
import { audio } from '@/features/sound'

// The controls that float above the board are small hexagonal keys with
// thickness, built the same way as the tiles, and they sit together as a piece
// of honeycomb instead of a row of buttons.

export function HexKey({ icon, label, on, at, onClick, onHint, children, tone }) {
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
