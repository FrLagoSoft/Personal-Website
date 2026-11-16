// Sound engine. By default everything is synthesized with the Web Audio API,
// so the site works with no audio files at all. Any sound can be replaced by a
// real file: see files.js.
//
// The built-in music is a slow generative pad in D major. Every tile sound is
// drawn from the D major pentatonic scale, so whatever the visitor clicks, and
// in whatever order, it lands in key with the music underneath.
//
// The WEATHER changes how all of it sounds: which music plays, how the effects
// are filtered, and what is in the air behind them. See WEATHER_SOUND below.

import { prefs } from '@/shared/state/prefs.js'
import { FILES, VOLUME } from './files.js'

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

// How each weather colours the sound.
//   low, high   the sound effects pass through a filter that removes
//               everything above `low` Hz and below `high` Hz
//   drive       distortion on the effects: 0 = clean, 1 = heavy
//   room        how much echo the effects get, 0 → 1
//   air         the noise in the background: [filter shape, Hz, loudness], or null for silence
//   pad         brightness of the built-in music (1 = normal)
const WEATHER_SOUND = {
    sunny: { low: 20000, high: 20, drive: 0, room: 0.2, air: null, pad: 1 },
    windy: { low: 7000, high: 420, drive: 0, room: 0.3, air: ['bandpass', 520, 0.07], pad: 0.9 },
    rain: { low: 3500, high: 20, drive: 0.55, room: 0.4, air: ['highpass', 500, 0.235], pad: 0.8 },
    snow: { low: 2600, high: 20, drive: 0, room: 0.06, air: ['bandpass', 300, 0.02], pad: 0.7 },
    stars: { low: 9000, high: 20, drive: 0, room: 0.55, air: null, pad: 0.75 },
    meteors: { low: 12000, high: 20, drive: 0.15, room: 0.75, air: ['lowpass', 110, 0.1], pad: 0.85 },
    aurora: { low: 7000, high: 20, drive: 0, room: 0.7, air: null, pad: 1.15 },
}

let ctx = null
let master, sfxBus, musicBus, reverb, noiseBuf
let musicOn = false
let timer = null
let nextChord = 0
let nextSparkle = 0
let chordIndex = 0
let lastTick = 0
let airTimer = 0
let mood = 'sunny'          // the weather the sound effects are coloured by (see audio.setWeather)
let tune = 'sunny'          // the weather the music is chosen for (the same, except just before the board opens)
let fxHigh, fxLow, fxDrive, sfxSend           // what every sound effect passes through
let airFilter, airGain, airSweep, airSwell    // the background noise of the weather

// ── Custom sound files (see files.js) ────────────────────────────────────────
const buffers = {}          // name → decoded sound, or false if it failed to load
const loading = {}
const decks = []            // the two players the music files run on (see "MUSIC FILES" below)
let live = -1               // which deck carries the current track (-1: nothing yet)
const places = new Map()    // track → how many seconds in it was when it last stopped

function load(name) {
    return (loading[name] ??= fetch(FILES[name])
        .then(r => r.arrayBuffer())
        .then(raw => ctx.decodeAudioData(raw))
        .then(buf => (buffers[name] = buf))
        .catch(() => (buffers[name] = false)))
}

// Plays the custom file for `name` if there is one, and returns true.
// Returns false when there is none, so the caller plays the built-in sound.
// `rate` shifts the pitch (2 = an octave up). The first time a sound is used it
// may still be loading; it plays as soon as it is ready.
function sample(name, { rate = 1, gain = 1 } = {}) {
    if (!FILES[name] || buffers[name] === false) return false
    const go = () => {
        const src = ctx.createBufferSource()
        src.buffer = buffers[name]
        src.playbackRate.value = rate
        const g = ctx.createGain()
        g.gain.value = (VOLUME[name] ?? VOLUME.default) * gain
        src.connect(g)
        g.connect(sfxBus)
        src.start()
    }
    if (buffers[name]) go()
    else load(name).then(buf => buf && go())
    return true
}

// Pitch for a pitched sample: the file is treated as the note D (MIDI 74).
const rateFor = midi => 2 ** ((midi - 74) / 12)

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

    // Every sound effect goes through two filters and a distortion stage on its
    // way out. In clear weather they do nothing; the weather turns them up.
    sfxBus = ctx.createGain()
    sfxBus.gain.value = 1
    fxHigh = ctx.createBiquadFilter()
    fxHigh.type = 'highpass'; fxHigh.frequency.value = 20
    fxLow = ctx.createBiquadFilter()
    fxLow.type = 'lowpass'; fxLow.frequency.value = 20000
    fxDrive = ctx.createWaveShaper()
    sfxBus.connect(fxHigh); fxHigh.connect(fxLow); fxLow.connect(fxDrive); fxDrive.connect(master)

    musicBus = ctx.createGain()
    musicBus.gain.value = 0
    musicBus.connect(master)

    reverb = ctx.createConvolver()
    reverb.buffer = makeImpulse(2.8)
    const wet = ctx.createGain()
    wet.gain.value = 0.55
    reverb.connect(wet)
    wet.connect(master)

    sfxSend = ctx.createGain()
    sfxSend.gain.value = 0.2
    fxDrive.connect(sfxSend)
    sfxSend.connect(reverb)

    const musicSend = ctx.createGain()
    musicSend.gain.value = 0.7
    musicBus.connect(musicSend)
    musicSend.connect(reverb)

    noiseBuf = makeNoise(1)

    // The air: a long loop of noise that the weather filters into rain, wind or
    // a far-off rumble. A very slow wave sweeps the filter and swells the
    // volume, which is what makes wind sound like wind.
    const air = ctx.createBufferSource()
    air.buffer = makeNoise(4)
    air.loop = true
    airFilter = ctx.createBiquadFilter()
    airGain = ctx.createGain()
    airGain.gain.value = 0
    air.connect(airFilter); airFilter.connect(airGain); airGain.connect(master)
    const slow = ctx.createOscillator()
    slow.frequency.value = 0.13
    airSweep = ctx.createGain(); airSweep.gain.value = 0
    airSwell = ctx.createGain(); airSwell.gain.value = 0
    slow.connect(airSweep); airSweep.connect(airFilter.frequency)
    slow.connect(airSwell); airSwell.connect(airGain.gain)
    air.start(); slow.start()
    airTimer = setInterval(airTick, 900)
    applyWeather()

    // Start fetching every custom sound effect now, so they are ready when needed.
    for (const name in FILES) if (!name.startsWith('music')) load(name)

    makeDecks()
}

// A soft-clipping curve for the distortion stage: the higher `amount`, the grittier.
// Quiet sounds pass through at their own volume and only the loud peaks get
// squashed, which is where the grit comes from. (The first version of this
// curve also multiplied quiet sounds by about 17, so in the rain every click
// came out as a huge bass thump.)
function driveCurve(amount) {
    const g = 1 + amount * 4, curve = new Float32Array(257)
    for (let i = 0; i < 257; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(g * x) / g }
    return curve
}

// Sets the filters, the echo and the background air for the current weather.
function applyWeather() {
    if (!ctx) return
    const s = WEATHER_SOUND[mood] ?? WEATHER_SOUND.sunny
    const t = ctx.currentTime
    fxLow.frequency.setTargetAtTime(s.low, t, 0.8)
    fxHigh.frequency.setTargetAtTime(s.high, t, 0.8)
    fxDrive.curve = s.drive ? driveCurve(s.drive) : null
    sfxSend.gain.setTargetAtTime(s.room, t, 0.8)
    const loud = s.air && prefs.get().sfx ? s.air[2] : 0
    if (s.air) {
        airFilter.type = s.air[0]
        airFilter.frequency.setTargetAtTime(s.air[1], t, 0.6)
        airSweep.gain.setTargetAtTime(s.air[1] * (mood === 'windy' ? 0.45 : 0.08), t, 0.6)
    }
    airSwell.gain.setTargetAtTime(loud * (mood === 'windy' ? 0.6 : 0.15), t, 1.5)
    airGain.gain.setTargetAtTime(loud, t, 1.5)
}

// The small sounds of a quiet night: crickets under the stars, and now and
// then a high, far-away note under the aurora.
function airTick() {
    if (!ready() || document.hidden) return
    const t = ctx.currentTime + Math.random() * 0.4
    if (mood === 'stars' && Math.random() < 0.5) {
        const pitch = 3900 + Math.random() * 500
        for (let k = 0; k < 3 + Math.floor(Math.random() * 2); k++) {
            const o = ctx.createOscillator()
            o.frequency.value = pitch
            const g = ctx.createGain()
            g.gain.setValueAtTime(0.0001, t + k * 0.075)
            g.gain.exponentialRampToValueAtTime(0.011, t + k * 0.075 + 0.012)
            g.gain.exponentialRampToValueAtTime(0.0001, t + k * 0.075 + 0.05)
            o.connect(g); g.connect(sfxBus)
            o.start(t + k * 0.075); o.stop(t + k * 0.075 + 0.06)
        }
    } else if (mood === 'aurora' && Math.random() < 0.3) {
        pluck(PENTA[6 + Math.floor(Math.random() * 5)], t, 0.03, sfxBus, 3.2)
    }
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
    const bright = (WEATHER_SOUND[mood] ?? WEATHER_SOUND.sunny).pad
    voices.forEach((m, i) => padVoice(m, t, dur, 0.03, (520 + i * 170) * bright))
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

// MUSIC FILES. Each weather can have its own track (music-rain.mp3,
// music-meteors.mp3, …), or several (music-rain-2.mp3, music-rain-storm.mp3):
// one is picked each time that weather arrives, and not the one it played last
// time. A weather without any uses music.mp3 (or music-2.mp3, music-3.mp3 …),
// and if there is none of those either, the built-in music. Tracks stream
// through an <audio> element instead of being loaded whole, and are only
// downloaded when first needed.
// The names are matched loosely, since they are typed by hand: "music-rain",
// "music_rain", "Music Rain 2" and "music-rain-storm" all count as rain.
const tracksFor = id => Object.keys(FILES).filter(name => new RegExp(`^music[-_ ]${id}(?![a-z])`).test(name))
const anyWeather = () => Object.keys(FILES).filter(name => /^music([-_ ]?\d+)?$/.test(name))
const lastPlayed = {}       // weather → the track it played last time
let playing = null          // { mood, name }: the track chosen for the current weather

function musicName() {
    if (playing?.tune !== tune) {
        let pool = tracksFor(tune)
        if (!pool.length) pool = anyWeather()
        if (pool.length > 1) pool = pool.filter(name => name !== lastPlayed[tune])
        const name = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
        if (name) lastPlayed[tune] = name
        playing = { tune, name }
    }
    return playing.name
}

// THE TWO DECKS. The files play on two <audio> elements, like a DJ's two
// turntables: one carries the current track while the next is brought up on
// the other, and they cross over. Both are created once, inside the visitor's
// first click or key press. That matters on iPhones, where a player that was
// not created during a touch is never allowed to make a sound.
function makeDecks() {
    for (let i = 0; i < 2; i++) {
        const el = new Audio()
        el.loop = true
        el.preload = 'auto'
        const gain = ctx.createGain()
        gain.gain.value = 0
        ctx.createMediaElementSource(el).connect(gain)
        gain.connect(master)
        const deck = { el, gain, url: null, stop: 0 }
        // A file that will not load or play is forgotten, and the music falls back
        // to the next best thing: another track, or the built-in music.
        el.addEventListener('error', () => {
            if (!deck.url) return
            for (const name in FILES) if (FILES[name] === deck.url) delete FILES[name]
            deck.url = null
            playing = null
            applyMusic()
        })
        decks.push(deck)
    }
}

function ramp(deck, level, secs) {
    const now = ctx.currentTime
    deck.gain.gain.cancelScheduledValues(now)
    deck.gain.gain.setValueAtTime(deck.gain.gain.value, now)
    deck.gain.gain.linearRampToValueAtTime(level, now + secs)
}

// Fades a deck out, then pauses it and notes how far through the track it was,
// so the track picks up from there the next time it is wanted.
function retire(deck, secs) {
    if (!deck.url || deck.el.paused) return
    ramp(deck, 0, secs)
    clearTimeout(deck.stop)
    deck.stop = setTimeout(() => {
        places.set(deck.url, deck.el.currentTime)
        deck.el.pause()
    }, secs * 1000 + 100)
}

// Brings a track up: on the deck it is already on, or else on the free deck
// while the other fades out.
function bringIn(url, level) {
    let deck = decks[live]
    if (deck?.url !== url) {
        if (deck) retire(deck, 2)
        live = live === 0 ? 1 : 0
        deck = decks[live]
        clearTimeout(deck.stop)                      // it may still have been fading out an older track
        if (deck.url && !deck.el.paused) places.set(deck.url, deck.el.currentTime)
        deck.gain.gain.cancelScheduledValues(ctx.currentTime)
        deck.gain.gain.setValueAtTime(0, ctx.currentTime)
        deck.url = url
        deck.el.src = url
        const from = places.get(url) || 0
        if (from) {
            deck.el.addEventListener('loadedmetadata', () => {
                if (deck.url === url && from < deck.el.duration - 10) deck.el.currentTime = from
            }, { once: true })
        }
    }
    clearTimeout(deck.stop)
    // The fade-in starts when the sound actually does, not while the file is still arriving.
    deck.el.play().then(() => { if (deck.url === url) ramp(deck, level, 2.5) }).catch(() => {})
}

function applyMusic() {
    if (!ctx) return
    const want = prefs.get().music === true
    const name = want ? musicName() : null
    const url = name ? FILES[name] : null
    if (url) bringIn(url, VOLUME[name] ?? VOLUME.music)
    else decks.forEach(deck => retire(deck, 1))
    builtInMusic(want && !url)
}

function builtInMusic(want) {
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

    setSfx(on) { prefs.set({ sfx: on }); if (on) audio.unlock(); applyWeather() },

    // The weather changed: switch the music, the filters and the air to match.
    setWeather(id) {
        mood = tune = id
        applyWeather()
        applyMusic()
    },

    // Chooses the music for a weather that has not arrived yet. The landing page
    // uses it so the right track is already playing as the board opens, instead
    // of starting one track and swapping it a second later.
    cue(id) {
        tune = id
        applyMusic()
    },

    // A rumble a moment after the flash, as if from some way off.
    thunder() {
        if (!ready() || sample('thunder')) return
        const t = ctx.currentTime + 0.25 + Math.random() * 0.5
        const crack = ctx.createBufferSource()
        crack.buffer = noiseBuf
        const bp = ctx.createBiquadFilter()
        bp.type = 'bandpass'; bp.frequency.value = 1400; bp.Q.value = 0.6
        const cg = ctx.createGain()
        cg.gain.setValueAtTime(0.0001, t)
        cg.gain.exponentialRampToValueAtTime(0.3, t + 0.006)
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.3)
        crack.connect(bp); bp.connect(cg); cg.connect(sfxBus)
        crack.start(t); crack.stop(t + 0.35)

        const roll = ctx.createBufferSource()
        roll.buffer = noiseBuf
        roll.loop = true
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'
        lp.frequency.setValueAtTime(240, t)
        lp.frequency.exponentialRampToValueAtTime(55, t + 2.4)
        const rg = ctx.createGain()
        rg.gain.setValueAtTime(0.0001, t)
        rg.gain.exponentialRampToValueAtTime(0.55, t + 0.08)
        rg.gain.exponentialRampToValueAtTime(0.0001, t + 2.8)
        roll.connect(lp); lp.connect(rg); rg.connect(sfxBus)
        roll.start(t); roll.stop(t + 2.9)
    },

    // A meteor lands: a low thud, a burst of grit, and a bell. `i` picks the
    // bell's note, so a shower of them plays a slow tune.
    impact(i = 0) {
        if (!ready()) return
        const midi = PENTA[((i % PENTA.length) + PENTA.length) % PENTA.length]
        if (sample('impact', { rate: rateFor(midi) })) return
        const t = ctx.currentTime
        const o = ctx.createOscillator()
        o.frequency.setValueAtTime(130, t)
        o.frequency.exponentialRampToValueAtTime(38, t + 0.22)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.5, t)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4)
        o.connect(g); g.connect(sfxBus)
        o.start(t); o.stop(t + 0.45)
        const grit = ctx.createBufferSource()
        grit.buffer = noiseBuf
        const lp = ctx.createBiquadFilter()
        lp.type = 'lowpass'; lp.frequency.value = 900
        const gg = ctx.createGain()
        gg.gain.setValueAtTime(0.22, t)
        gg.gain.exponentialRampToValueAtTime(0.0001, t + 0.14)
        grit.connect(lp); lp.connect(gg); gg.connect(sfxBus)
        grit.start(t, Math.random() * 0.5, 0.16)
        pluck(midi, t + 0.02, 0.17, sfxBus, 2.4)
        pluck(midi - 12, t + 0.02, 0.1, sfxBus, 1.6)
    },
    setMusic(on) { prefs.set({ music: on }); if (on) audio.unlock(); else applyMusic() },

    hover() {
        if (!ready()) return
        const now = performance.now()
        if (now - lastTick < 55) return
        lastTick = now
        if (sample('hover')) return
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

    press() { if (ready() && !sample('press')) tock(ctx.currentTime, 0.28) },

    // The visitor presses "Enter the board".
    enter() { if (ready() && !sample('enter')) tock(ctx.currentTime, 0.28) },

    // One tuned note. `i` can be any integer: it wraps around the scale.
    note(i, vel = 0.2) {
        if (!ready()) return
        const midi = PENTA[((i % PENTA.length) + PENTA.length) % PENTA.length]
        if (sample('note', { rate: rateFor(midi), gain: vel / 0.2 })) return
        pluck(midi, ctx.currentTime, vel)
    },

    // A run of notes, timed to match the tiles animating in or out. The voice
    // (0-5, one per category) changes where the run starts and how it climbs,
    // so each field has its own little phrase.
    arp(count, up = true, voice = 0, step = 0.055) {
        if (!ready() || sample(up ? 'open' : 'close')) return
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
        if (!ready() || sample('prize')) return
        const t = ctx.currentTime
        pluck(PENTA[i % PENTA.length], t, 0.18)
        pluck(PENTA[(i + 2) % PENTA.length], t + 0.07, 0.16)
        pluck(PENTA[(i + 4) % PENTA.length], t + 0.14, 0.14, sfxBus, 1.4)
    },

    // The mascot's voice: one tiny blip every few letters, pitched at random
    // within the scale so speech sounds like a tune, not a beep.
    blip() {
        if (!ready()) return
        const midi = PENTA[4 + Math.floor(Math.random() * 4)]
        if (sample('voice', { rate: rateFor(midi) })) return
        const t = ctx.currentTime
        const o = ctx.createOscillator()
        o.type = 'triangle'
        o.frequency.setValueAtTime(mtof(midi), t)
        o.frequency.exponentialRampToValueAtTime(mtof(PENTA[5]) * 1.02, t + 0.05)
        const g = ctx.createGain()
        g.gain.setValueAtTime(0.045, t)
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07)
        o.connect(g); g.connect(sfxBus)
        o.start(t); o.stop(t + 0.08)
    },

    // A paw touching the ground. Very quiet: felt more than heard.
    step(vel = 0.25) {
        if (!ready() || sample('step', { gain: vel / 0.25 })) return
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
        if (!ready() || sample('yip')) return
        const t = ctx.currentTime
        pluck(PENTA[6], t, 0.13, sfxBus, 0.25)
        pluck(PENTA[8], t + 0.09, 0.15, sfxBus, 0.4)
    },

    panel(open) {
        if (!ready() || sample(open ? 'panel-open' : 'panel-close')) return
        whoosh(ctx.currentTime, open, open ? 0.34 : 0.26, 0.06)
    },

    wipe() { if (ready() && !sample('wipe')) whoosh(ctx.currentTime, true, 0.7, 0.11) },

    // The big moment: full board, or every tile explored.
    bloom() {
        if (!ready() || sample('celebrate')) return
        const t = ctx.currentTime
        const notes = [50, 57, 62, 66, 69, 74, 76, 81, 86]
        notes.forEach((m, k) => pluck(m, t + k * 0.06, 0.16, sfxBus, 2.4))
        whoosh(t, true, 0.9, 0.08)
    },
}

// Go quiet when the tab is in the background, and pick up again when it returns.
function onVisibility() {
    if (!ctx) return
    if (document.hidden) {
        ctx.suspend()
        for (const deck of decks) {
            clearTimeout(deck.stop)
            if (deck.url && !deck.el.paused) { places.set(deck.url, deck.el.currentTime); deck.el.pause() }
        }
    } else {
        if (prefs.get().sfx || prefs.get().music === true) ctx.resume()
        applyMusic()
    }
}
if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

// DEVELOPMENT ONLY. While `npm run dev` is running, saving this file (or adding
// a sound file) swaps in a fresh copy of this whole engine. The old copy has to
// switch itself off first, or its music carries on underneath the new copy's:
// two copies of the same song, out of step. The deployed site never swaps code,
// so none of this runs there.
if (import.meta.hot) {
    const before = import.meta.hot.data           // what the copy we are replacing left for us
    if (before.mood) { mood = before.mood; tune = before.tune }
    if (before.wasOn) queueMicrotask(() => audio.unlock())   // carry on playing without waiting for a click
    import.meta.hot.dispose(data => {
        data.mood = mood; data.tune = tune; data.wasOn = !!ctx
        document.removeEventListener('visibilitychange', onVisibility)
        clearInterval(timer); clearInterval(airTimer)
        for (const deck of decks) { clearTimeout(deck.stop); deck.el.pause(); deck.el.removeAttribute('src'); deck.el.load() }
        ctx?.close()
    })
}

// Test hook for the dev server only.
if (import.meta.env.DEV && typeof window !== 'undefined') {
    window.__audio = { state: () => ctx?.state ?? 'none', ctx: () => ctx, master: () => master, files: FILES, buffers, mood: () => mood, track: () => playing?.name ?? null, tracks: () => decks.filter(d => d.url).map(d => ({ file: decodeURIComponent(d.url.split('/').pop().split('?')[0]), playing: !d.el.paused, volume: +d.gain.gain.value.toFixed(2), at: +d.el.currentTime.toFixed(1) })), music: () => decks.find(d => d.url && !d.el.paused)?.el ?? null }
}
