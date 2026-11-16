// Custom sound files. Drop audio files into ./files/ named after the moment
// they belong to (see files/README.md) and they replace the built-in
// synthesized sound for that moment. No code changes needed: a file that is
// not there simply falls back to the built-in sound.

const found = import.meta.glob('./files/*.{mp3,ogg,wav,m4a,aac,webm,opus,flac}', { eager: true, query: '?url', import: 'default' })

export const FILES = {}
for (const [path, url] of Object.entries(found)) {
    FILES[path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase()] = url
}

// How loud each file plays, from 0 (silent) to 1 (as loud as the file is).
// Stock library tracks are mastered loud, so most start well below 1.
// Turn one up or down here if it sits wrong next to the others.
export const VOLUME = {
    music: 0.25,                // every music track, unless it has a line of its own:
    // 'music-rain': 0.3,       // … like this (use the file's name, without .mp3)
    'music-sunny': 0.2,
    thunder: 0.8,
    impact: 0.6,
    enter: 0.8,
    wipe: 0.6,
    hover: 0.25,
    press: 0.6,
    note: 0.55,
    open: 0.6,
    close: 0.5,
    prize: 0.7,
    celebrate: 0.7,
    'panel-open': 0.45,
    'panel-close': 0.4,
    voice: 0.35,
    step: 0.35,
    yip: 0.6,
    default: 0.6,
}
