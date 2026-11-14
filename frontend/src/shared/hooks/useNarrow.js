import { useEffect, useState } from 'react'

// True while the window is phone-sized. Re-renders when that changes.
export function useNarrow(query = '(max-width: 760px)') {
    const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches)
    useEffect(() => {
        const mq = window.matchMedia(query)
        const on = () => setNarrow(mq.matches)
        mq.addEventListener('change', on)
        return () => mq.removeEventListener('change', on)
    }, [query])
    return narrow
}
