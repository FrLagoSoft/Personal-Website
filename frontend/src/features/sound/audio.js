// Sound engine. Everything is synthesized with the Web Audio API, so there are
// no audio files to load, license or keep in sync.
//
// The music is a slow generative pad in D major. Every tile sound is drawn
// from the D major pentatonic scale, so whatever the visitor clicks, and in
// whatever order, it lands in key with the music underneath.

import { prefs } from '@/shared/state/prefs.js'

const mtof = m => 440 * 2 ** ((m - 69) / 12)

// D major pentatonic, three octaves: D E F# A B
const PENTA = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86]

// [sub bass, ...pad voices] as MIDI notes: Dmaj9, Bm11, Gmaj9, Asus
const CHORDS = [
    [38, 50, 57, 64, 66],
    [35, 47, 54, 62, 64],
    [43, 50, 57, 59, 66],
    [33, 45, 52, 59, 62],
]
const CHORD_LEN = 12 // seconds between chord changes

let ctx = null
let master, sfxBus, musicBus, reverb, noiseBuf
let musicOn = false
let timer = null
let nextChord = 0
let nextSparkle = 0
let chordIndex = 0
let lastTick = 0

function makeNoise(seconds) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate)
    const d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    return buf
}

// A soft synthetic room: decaying stereo noise used as a reverb impulse.
function makeImpulse(seconds) {
    const len = ctx.sampleRate * seconds
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch)
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3.2
    }
    return buf
}

function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)()

    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -14
    limiter.knee.value = 12
    limiter.ratio.value = 6
    limiter.attack.value = 0.004
    limiter.release.value = 0.2
    limiter.connect(ctx.destination)

    master = ctx.createGain()
    master.gain.value = 0.9
    master.connect(limiter)

    sfxBus = ctx.createGain()
    sfxBus.gain.value = 1
    sfxBus.connect(master)

    musicBus = ctx.createGain()
    musicBus.gain.value = 0
    musicBus.connect(master)

    reverb = ctx.createConvolver()
    reverb.buffer = makeImpulse(2.8)
    const wet = ctx.createGain()
    wet.gain.value = 0.55
    reverb.connect(wet)
    wet.connect(master)

    const sfxSend = ctx.createGain()
    sfxSend.gain.value = 0.2
    sfxBus.connect(sfxSend)
    sfxSend.connect(reverb)

    const musicSend = ctx.createGain()
    musicSend.gain.value = 0.7
    musicBus.connect(musicSend)
    musicSend.connect(reverb)

    noiseBuf = makeNoise(1)
}

// ── Voices ───────────────────────────────────────────────────────────────────

// Mallet-like pluck: a sine with a quick bright partial two octaves up.
function pluck(midi, t, vel = 0.2, dest = sfxBus, length = 0.9) {
    const f = mtof(midi)
    const out = ctx.createGain()
    out.gain.setValueAtTime(0.0001, t)
    out.gain.exponentialRampToValueAtTime(vel, t + 0.005)
    out.gain.exponentialRampToValueAtTime(0.0001, t + length)
    out.connect(dest)

    const body = ctx.createOscillator()
    body.type = 'sine'
    body.frequency.value = f
    body.connect(out)

    const bright = ctx.createOscillator()
    bright.type = 'sine'
    bright.frequency.value = f * 4
    const brightGain = ctx.createGain()
    brightGain.gain.setValueAtTime(0.3, t)
    brightGain.gain.exponentialRampToValueAtTime(0.001, t + 0.14)
    bright.connect(brightGain)
    brightGain.connect(out)

    body.start(t); bright.start(t)
    body.stop(t + length + 0.05); bright.stop(t + 0.2)
}

// The physical "tock" of a tile going down.
function tock(t, vel = 0.3) {
    const osc = ctx.createOscillator()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(210, t)
    osc.frequency.exponentialRampToValueAtTime(92, t + 0.07)
    const g = ctx.createGain()
    g.gain.setValueAtTime(vel, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13)
    osc.connect(g); g.connect(sfxBus)
    osc.start(t); osc.stop(t + 0.15)

    const click = ctx.createBufferSource()
    click.buffer = noiseBuf
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'; bp.frequency.value = 2600; bp.Q.value = 1.4
    const cg = ctx.createGain()
    cg.gain.setValueAtTime(vel * 0.45, t)
    cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03)
    click.connect(bp); bp.connect(cg); cg.connect(sfxBus)
    click.start(t, Math.random() * 0.5, 0.05)
}

// Filtered-noise sweep for panels and page transitions.
function whoosh(t, up = true, dur = 0.42, vel = 0.1) {
    const src = ctx.createBufferSource()
    src.buffer = noiseBuf
    src.loop = true
    const bp = ctx.createBiquadFilter()
    bp.type = 'bandpass'; bp.Q.value = 0.9
    bp.frequency.setValueAtTime(up ? 320 : 2600, t)
    bp.frequency.exponentialRampToValueAtTime(up ? 2600 : 320, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(vel, t + dur * 0.4)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(bp); bp.connect(g); g.connect(sfxBus)
    src.start(t); src.stop(t + dur + 0.05)
}

// One sustained pad note: two detuned saws through a low-pass, slow fade in/out.
function padVoice(midi, t, dur, level, cutoff) {
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'; lp.Q.value = 0.4
    lp.frequency.setValueAtTime(cutoff * 0.6, t)
    lp.frequency.linearRampToValueAtTime(cutoff, t + dur * 0.5)
    lp.frequency.linearRampToValueAtTime(cutoff * 0.6, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0.0001, t)
    g.gain.linearRampToValueAtTime(level, t + 4)
    g.gain.setValueAtTime(level, t + dur - 4.5)
    g.gain.linearRampToValueAtTime(0.0001, t + dur)
    lp.connect(g); g.connect(musicBus)
    for (const cents of [-7, 7]) {
        const o = ctx.createOscillator()
        o.type = 'sawtooth'
        o.frequency.value = mtof(midi)
        o.detune.value = cents
        o.connect(lp)
        o.start(t); o.stop(t + dur + 0.1)
    }
}

function scheduleChord(t) {
    const [sub, ...voices] = CHORDS[chordIndex % CHORDS.length]
    chordIndex++
    const dur = CHORD_LEN + 5 // overlaps the next chord, so changes crossfade
    const s = ctx.createOscillator()
    s.type = 'sine'
    s.frequency.value = mtof(sub)
    const sg = ctx.createGain()
    sg.gain.setValueAtTime(0.0001, t)
    sg.gain.linearRampToValueAtTime(0.11, t + 3)
    sg.gain.setValueAtTime(0.11, t + dur - 4)
    sg.gain.linearRampToValueAtTime(0.0001, t + dur)
    s.connect(sg); sg.connect(musicBus)
    s.start(t); s.stop(t + dur + 0.1)
    voices.forEach((m, i) => padVoice(m, t, dur, 0.03, 520 + i * 170))
}

function tickMusic() {
    if (!ctx || !musicOn) return
    const now = ctx.currentTime
    while (nextChord < now + 1.5) {
        scheduleChord(Math.max(nextChord, now + 0.05))
        nextChord = Math.max(nextChord, now) + CHORD_LEN
    }
    if (nextSparkle < now + 0.5) {
        const note = PENTA[5 + Math.floor(Math.random() * 6)]
        pluck(note, Math.max(nextSparkle, now + 0.05), 0.045, musicBus, 1.8)
        nextSparkle = Math.max(nextSparkle, now) + 2.5 + Math.random() * 5
    }
}

function applyMusic() {
    if (!ctx) return
    const want = prefs.get().music === true
    const now = ctx.currentTime
    musicBus.gain.cancelScheduledValues(now)
    musicBus.gain.setValueAtTime(musicBus.gain.value, now)
    if (want) {
        musicBus.gain.linearRampToValueAtTime(0.6, now + 3)
        if (!musicOn) {
            musicOn = true
            nextChord = now + 0.1
            nextSparkle = now + 3
            tickMusic()
            timer = setInterval(tickMusic, 400)
        }
    } else {
        musicBus.gain.linearRampToValueAtTime(0, now + 1)
        musicOn = false
        clearInterval(timer)
    }
}

const ready = () => ctx && ctx.state === 'running' && prefs.get().sfx

// ── Public API ───────────────────────────────────────────────────────────────

export const audio = {
    // Must be called from a click or key press: browsers only start audio then.
    unlock() {
        if (!prefs.get().sfx && prefs.get().music !== true) return
        if (!ctx) build()
        if (ctx.state === 'suspended') ctx.resume()
        applyMusic()
    },

    setSfx(on) { prefs.set({ sfx: on }); if (on) audio.unlock() },
    setMusic(on) { prefs.set({ music: on }); if (on) audio.unlock(); else applyMusic() },

    hover() {
        if (!ready()) return
        const now = performance.now()
        if (now - lastTick < 55) return
        lastTick = now
        const t = ctx.currentTime
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.value = 1320
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.022, t)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.035)
        o.connect(g); g.connect(sfxBus)
        o.start(t); o.stop(t + 0.05)
    },

    press() { if (ready()) tock(ctx.currentTime, 0.28) },

    // One tuned note. `i` can be any integer: it wraps around the scale.
    note(i, vel = 0.2) {
        if (!ready()) return
        pluck(PENTA[((i % PENTA.length) + PENTA.length) % PENTA.length], ctx.currentTime, vel)
    },

    // A run of notes, timed to match the tiles animating in or out. The voice
    // (0-5, one per category) changes where the run starts and how it climbs,
    // so each field has its own little phrase.
    arp(count, up = true, voice = 0, step = 0.055) {
        if (!ready()) return
        const t = ctx.currentTime
        const stride = voice % 2 ? 2 : 1
        for (let k = 0; k < count; k++) {
            const i = up ? k : count - 1 - k
            const note = PENTA[(voice + i * stride) % PENTA.length] - (voice > 3 ? 12 : 0)
            pluck(note, t + k * step, up ? 0.15 : 0.09, sfxBus, up ? 0.9 : 0.5)
        }
    },

    // Three notes rolled together: for a tile that deserves more than one.
    chime(i) {
        if (!ready()) return
        const t = ctx.currentTime
        pluck(PENTA[i % PENTA.length], t, 0.18)
        pluck(PENTA[(i + 2) % PENTA.length], t + 0.07, 0.16)
        pluck(PENTA[(i + 4) % PENTA.length], t + 0.14, 0.14, sfxBus, 1.4)
    },

    // The mascot's voice: one tiny blip every few letters, pitched at random
    // within the scale so speech sounds like a tune, not a beep.
    blip() {
        if (!ready()) return
        const t = ctx.currentTime
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.setValueAtTime(mtof(PENTA[4 + Math.floor(Math.random() * 4)]), t)
        o.frequency.exponentialRampToValueAtTime(mtof(PENTA[5]) * 1.02, t + 0.05)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.045, t)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
        o.connect(g); g.connect(sfxBus)
        o.start(t); o.stop(t + 0.08)
    },

    // A paw touching the ground. Very quiet: felt more than heard.
    step(vel = 0.25) {
        if (!ready()) return
        const t = ctx.currentTime
        const src = ctx.createBufferSource()
        src.buffer = noiseBuf
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'; lp.frequency.value = 520
        const g = ctx.createGain()
        g.gain.setValueAtTime(vel * 0.16, t)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06)
        src.connect(lp); lp.connect(g); g.connect(sfxBus)
        src.start(t, Math.random() * 0.5, 0.07)
    },

    // A happy two-note yip.
    yip() {
        if (!ready()) return
        const t = ctx.currentTime
        pluck(PENTA[6], t, 0.13, sfxBus, 0.25)
        pluck(PENTA[8], t + 0.09, 0.15, sfxBus, 0.4)
    },

    panel(open) {
        if (!ready()) return
        whoosh(ctx.currentTime, open, open ? 0.34 : 0.26, 0.06)
    },

    wipe() { if (ready()) whoosh(ctx.currentTime, true, 0.7, 0.11) },

    // The big moment: full board, or every tile explored.
    bloom() {
        if (!ready()) return
        const t = ctx.currentTime
        const notes = [50, 57, 62, 66, 69, 74, 76, 81, 86]
        notes.forEach((m, k) => pluck(m, t + k * 0.06, 0.16, sfxBus, 2.4))
        whoosh(t, true, 0.9, 0.08)
    },
}

// Go quiet when the tab is in the background.
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (!ctx) return
        if (document.hidden) ctx.suspend()
        else if (prefs.get().sfx || prefs.get().music === true) ctx.resume()
    })
}

// Test hook for the dev server only.
if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__audio = { state: () => ctx?.state ?? 'none', ctx: () => ctx, master: () => master }
}
