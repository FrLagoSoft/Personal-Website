const SFX_FILES = {
    select:      'sfx-select.mp3',
    expand:      'sfx-expand.mp3',
    collapse:    'sfx-collapse.mp3',
    panelOpen:   'sfx-panel-open.mp3',
    panelClose:  'sfx-panel-close.mp3',
    click:       'wii-keyboard-click-3.mp3',
}

const BASE = '/assets/audio/'

let ctx = null
let bgMusic = null
const sfxBuffers = {}

function getCtx() {
    if (!ctx) ctx = new AudioContext()
    return ctx
}

async function loadBuffer(name) {
    if (sfxBuffers[name]) return
    const file = SFX_FILES[name]
    if (!file) return
    try {
        const res = await fetch(BASE + file)
        const raw = await res.arrayBuffer()
        sfxBuffers[name] = await getCtx().decodeAudioData(raw)
    } catch (e) {}
}

export async function initAudio() {
    bgMusic = new Audio(BASE + 'bg-music.mp3')
    bgMusic.loop = true
    bgMusic.volume = 0.35
    await Promise.all(Object.keys(SFX_FILES).map(loadBuffer))
}

export function playBgMusic() {
    if (!bgMusic) return
    bgMusic.play().catch(() => {})
}

export function pauseBgMusic() {
    if (!bgMusic) return
    bgMusic.pause()
}

export function playSFX(name, volume = 0.7) {
    if (!sfxBuffers[name]) {
        loadBuffer(name).then(() => sfxBuffers[name] && _play(sfxBuffers[name], volume))
        return
    }
    _play(sfxBuffers[name], volume)
}

function _play(buffer, volume) {
    const ac = getCtx()
    const source = ac.createBufferSource()
    source.buffer = buffer
    const gain = ac.createGain()
    gain.gain.value = volume
    source.connect(gain)
    gain.connect(ac.destination)
    source.start(0)
}
