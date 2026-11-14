import { useCallback, useLayoutEffect, useRef } from 'react'

// A function whose identity never changes but which always runs the latest
// version of `fn`. Lets memoised children (the tiles) skip re-rendering when
// only the handler's closure changed.
export function useStableCallback(fn) {
    const ref = useRef(fn)
    useLayoutEffect(() => { ref.current = fn })
    return useCallback((...args) => ref.current(...args), [])
}
