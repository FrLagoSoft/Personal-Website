import { createContext, useContext } from 'react'

// Shared handle for the page transition (see PageWipe.jsx):
//   const go = useWipe()
//   go('/hexagons', { x: event.clientX, y: event.clientY })
export const WipeContext = createContext(() => {})
export const useWipe = () => useContext(WipeContext)
