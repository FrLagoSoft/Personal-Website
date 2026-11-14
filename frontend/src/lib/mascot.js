// Remote control for the mascot. Any page can call these; the <Mascot />
// component (mounted once, in App.jsx) carries them out.
//
//   mascot.say('Hello!')                  speak (types out in a speech bubble)
//   mascot.say('Hello!', { sticky: true }) stays until replaced or dismissed
//   mascot.cheer()                         jump for joy
//   mascot.lookAt(x, y)                    glance at a point on screen
//   mascot.goTo(x)                         walk to a screen x position
//   mascot.range(left, right)              the strip of floor it may walk on
//   mascot.hide(true)                      duck out of the way
//   mascot.hint = () => 'Try the …'        what it suggests when the visitor presses it

let handler = null
const waiting = []

function send(type, data) {
    const event = { type, ...data }
    if (handler) handler(event)
    else waiting.push(event) // the mascot is not on stage yet: deliver when it is
}

export const mascot = {
    hint: null,
    bind(fn) {
        handler = fn
        waiting.splice(0).forEach(fn)
        return () => { if (handler === fn) handler = null }
    },
    say: (text, opts) => send('say', { text, ...opts }),
    hush: () => send('hush'),
    cheer: (big = false) => send('cheer', { big }),
    hop: () => send('hop'),
    lookAt: (x, y, ms = 1600) => send('look', { x, y, ms }),
    goTo: (x, run = false) => send('go', { x, run }),
    range: (min, max) => send('range', { min, max }),
    hide: hidden => send('hide', { hidden }),
}
