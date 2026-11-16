import { useSyncExternalStore } from 'react'
import { prefs } from '@/shared/state/prefs.js'

// The weather over the board.
//
// One weather at a time, each staying for about five minutes, then blending
// into the next over a few seconds. The order is random, and never the same
// one twice in a row. Everything that reacts to the weather (the field, the
// particle layer, the mascot, the sound) reads it from here, so they all agree.
//
//   weather.get()            { id, prev, since, windDir, running, changes }
//   weather.amount('rain')   0 → 1: how much of that weather is in the air right now
//   weather.wind()           { dir, force }: which way it blows and how hard (0 → 1)
//   weather.next()           skip to another weather
//   weather.on('impact', fn) listen for a moment: 'change', 'impact', 'thunder'

// To add a weather: add it here, then give it a look in HexField.jsx (GRADE),
// particles in WeatherLayer.jsx, and a reaction in the mascot.
export const WEATHERS = {
    sunny: { label: 'Sunny', icon: 'sun', night: false },
    windy: { label: 'Windy', icon: 'wind', night: false },
    rain: { label: 'Rain', icon: 'rain', night: false },
    snow: { label: 'Snow', icon: 'snow', night: false },
    stars: { label: 'Starry night', icon: 'moon', night: true },
    meteors: { label: 'Meteor shower', icon: 'meteor', night: true },
    aurora: { label: 'Aurora', icon: 'aurora', night: true },
}
export const WEATHER_IDS = Object.keys(WEATHERS)

export const FADE_MS = 8000            // how long one weather takes to blend into the next
const STAY_MS = 5 * 60 * 1000          // how long each weather stays

// How windy each weather is: [steady breeze, extra during a gust], both 0 → 1.
const WIND = { windy: [0.35, 0.65], rain: [0.22, 0.08], snow: [0.1, 0.06] }

const clamp01 = v => Math.min(1, Math.max(0, v))

let state = { id: 'sunny', prev: 'sunny', since: -1e9, windDir: 1, running: false, changes: 0 }
const listeners = new Set()
const handlers = {}
let stay = STAY_MS, stayThisTime = STAY_MS, elapsed = 0, timer = 0, bag = []
let planned = null                     // the weather the board will open on, once that is decided
const gust = { dir: 1, force: 0 }

function change(id, quiet = false) {
    if (!WEATHERS[id] || id === state.id) return
    const prev = state.id
    state = { ...state, prev, id, since: performance.now(), windDir: Math.random() < 0.5 ? -1 : 1, changes: state.changes + (quiet ? 0 : 1) }
    elapsed = 0
    stayThisTime = stay * (0.9 + Math.random() * 0.2)
    listeners.forEach(fn => fn())
    weather.emit('change', { id, prev, quiet })
}

// The next weather comes out of a shuffled bag, so every one gets its turn
// before any comes round again.
function draw() {
    for (;;) {
        if (!bag.length) bag = WEATHER_IDS.filter(id => id !== state.id).sort(() => Math.random() - 0.5)
        const id = bag.pop()
        if (id !== state.id) return id
    }
}

export const weather = {
    get: () => state,
    subscribe(fn) {
        listeners.add(fn)
        return () => listeners.delete(fn)
    },

    // 0 → 1: how far the current weather has blended in.
    mix: (now = performance.now()) => clamp01((now - state.since) / FADE_MS),

    // 0 → 1: how much of one weather is in the air (the outgoing one fades as the incoming one grows).
    amount(id, now = performance.now()) {
        const m = weather.mix(now)
        return (state.id === id ? m : 0) + (state.prev === id && state.prev !== state.id ? 1 - m : 0)
    },

    // Wind right now. Gusts swell and die on a slow, irregular rhythm that
    // depends only on the clock, so everything that asks gets the same gust.
    wind(now = performance.now()) {
        let steady = 0, extra = 0
        for (const id in WIND) {
            const a = weather.amount(id, now)
            if (a) { steady += WIND[id][0] * a; extra += WIND[id][1] * a }
        }
        const swell = Math.max(0, Math.sin(now / 2600 + 1.7 * Math.sin(now / 6100)))
        gust.dir = state.windDir
        gust.force = steady + extra * swell * swell
        return gust
    },

    // Which weather the board will open on. Decided the first time anyone asks
    // (the landing page does, to start the right music) and kept until the board
    // has opened. First-time visitors get a clear day to learn the board in.
    plan: () => (planned ??= prefs.get().coached ? WEATHER_IDS[Math.floor(Math.random() * WEATHER_IDS.length)] : 'sunny'),

    // Begin the cycle (the board page calls this when it opens).
    //   id    weather to open on (optional; otherwise the planned one)
    //   stay  milliseconds per weather (optional; five minutes if left out)
    start({ id, stay: ms } = {}) {
        stay = ms || STAY_MS
        stayThisTime = stay
        elapsed = 0
        state = { ...state, running: true }
        change(id ?? weather.plan(), true)
        planned = null
        clearInterval(timer)
        timer = setInterval(() => {
            if (document.hidden) return            // the clock only runs while someone is looking
            elapsed += 1000
            if (elapsed >= stayThisTime) change(draw())
        }, 1000)
    },

    // End the cycle and clear the sky (the board page calls this when it closes).
    stop() {
        clearInterval(timer)
        change('sunny', true)
        state = { ...state, running: false }
        listeners.forEach(fn => fn())
    },

    next: () => change(draw()),
    set: id => change(id),

    on(type, fn) {
        (handlers[type] ??= new Set()).add(fn)
        return () => handlers[type].delete(fn)
    },
    emit(type, data) {
        handlers[type]?.forEach(fn => fn(data))
    },
}

// Re-renders a component when the weather changes. Returns its id ('rain', …).
export const useWeather = () => useSyncExternalStore(weather.subscribe, () => state.id)

// Test hook for the dev server only: try `__weather.set('meteors')` in the console.
if (import.meta.env.DEV && typeof window !== 'undefined') window.__weather = weather
