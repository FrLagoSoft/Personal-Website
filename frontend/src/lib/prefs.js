// Small persisted store: sound choices, which tiles were opened, whether the
// how-to card was dismissed. Survives reloads through localStorage and still
// works (in memory) when storage is blocked.

import { useSyncExternalStore } from 'react'

const KEY = 'gl.board.v2'
// music: null means "never chosen", so we do not start music uninvited.
// feats: one-off moments the mascot has already celebrated (so it does not repeat itself).
const DEFAULTS = { sfx: true, music: null, coached: false, visited: [], feats: [] }

function load() {
    try {
        return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
    } catch {
        return { ...DEFAULTS }
    }
}

let state = load()
const listeners = new Set()

export const prefs = {
    get: () => state,
    set(patch) {
        state = { ...state, ...patch }
        try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage blocked: keep in memory */ }
        listeners.forEach(fn => fn())
    },
    visit(id) {
        if (!state.visited.includes(id)) prefs.set({ visited: [...state.visited, id] })
    },
    // Returns true the first time a feat is earned, false ever after.
    earn(feat) {
        if (state.feats.includes(feat)) return false
        prefs.set({ feats: [...state.feats, feat] })
        return true
    },
    subscribe(fn) {
        listeners.add(fn)
        return () => listeners.delete(fn)
    },
}

export const usePrefs = () => useSyncExternalStore(prefs.subscribe, prefs.get)
