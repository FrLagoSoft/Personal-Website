// Photo catalog. Drop image files into src/photos/ and they show up by name.
// See src/photos/README.md for the naming rules.

const files = import.meta.glob('../photos/*.{jpg,jpeg,png,webp,avif,gif}', { eager: true, query: '?url', import: 'default' })

const byName = {}
for (const [path, url] of Object.entries(files)) {
    const name = path.split('/').pop().replace(/\.[^.]+$/, '').toLowerCase()
    byName[name] = url
}

export const portrait = byName.portrait || null

// Photo printed on the hexagon itself: <id>-tile.jpg
export const tilePhoto = id => byName[`${id}-tile`] || null

// Gallery in the side panel: <id>-1.jpg, <id>-2.jpg, ...
export function galleryFor(id) {
    const out = []
    for (let i = 1; byName[`${id}-${i}`]; i++) out.push(byName[`${id}-${i}`])
    return out
}
