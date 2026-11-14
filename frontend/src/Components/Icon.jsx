// One small line-icon set, drawn on a 24px grid, so every glyph on the site
// shares the same weight.
const PATHS = {
    trophy: 'M8 4h8v4a4 4 0 0 1-8 0V4z M8 5.5H5A3 3 0 0 0 8 9 M16 5.5h3A3 3 0 0 1 16 9 M12 12v4 M9 20h6 M10 16h4v4h-4z',
    cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z M12 12l8-4.5 M12 12v9 M12 12L4 7.5',
    briefcase: 'M4 8h16v11H4z M9 8V5h6v3 M4 13h16',
    terminal: 'M4 5h16v14H4z M7.5 9.5l3 2.5-3 2.5 M12.5 14.5h4',
    cap: 'M2.5 9.5L12 5l9.5 4.5L12 14 2.5 9.5z M6.5 11.5V16c1.5 1.6 3.4 2.4 5.5 2.4s4-.8 5.5-2.4v-4.5 M21.5 9.5v5',
    note: 'M9 18V6l10-2v12 M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z',
    noteOff: 'M9 18V6l10-2v12 M9 18a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M19 16a2.5 2.5 0 1 1-5 0 2.5 2.5 0 0 1 5 0z M3 3l18 18',
    list: 'M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01',
    sound: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4z M15.5 9a4 4 0 0 1 0 6 M18 6.5a7.5 7.5 0 0 1 0 11',
    soundOff: 'M4 9.5h3.5L12 6v12l-4.5-3.5H4z M16 9.5l5 5 M21 9.5l-5 5',
    help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z M9.4 9.2a2.8 2.8 0 1 1 4.3 2.4c-1 .6-1.7 1.2-1.7 2.4 M12 17h.01',
    plus: 'M12 5v14 M5 12h14',
    minus: 'M5 12h14',
    fit: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
    close: 'M6 6l12 12 M18 6L6 18',
    left: 'M15 5l-7 7 7 7',
    right: 'M9 5l7 7-7 7',
    external: 'M14 4h6v6 M20 4l-9 9 M18 14v6H4V6h6',
    check: 'M5 12.5l4.5 4.5L19 7.5',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14z M20 20l-4-4',
    hand: 'M9 11V5.5a1.5 1.5 0 0 1 3 0V10 M12 10V4.5a1.5 1.5 0 0 1 3 0V10 M15 10V6.5a1.5 1.5 0 0 1 3 0V14a6 6 0 0 1-6 6h-1a5 5 0 0 1-4.2-2.3L4 13.5a1.5 1.5 0 0 1 2.5-1.6L9 14.5V11',
    move: 'M12 3v18 M3 12h18 M12 3l-3 3 M12 3l3 3 M12 21l-3-3 M12 21l3-3 M3 12l3-3 M3 12l3 3 M21 12l-3-3 M21 12l-3 3',
    mail: 'M3.5 6h17v12h-17z M3.5 7l8.5 6 8.5-6',
}

function Icon({ name, size = 20, strokeWidth = 1.8, className }) {
    return (
        <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <path d={PATHS[name]} />
        </svg>
    )
}

export default Icon
