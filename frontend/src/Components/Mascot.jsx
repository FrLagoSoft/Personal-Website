import { useEffect, useId, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { mascot } from '../lib/mascot.js'
import { audio } from '../lib/audio.js'
import { prefs } from '../lib/prefs.js'
import { LINES, pick } from '../data/mascot.js'

// The mascot: a dog with a hexagon for a body, drawn from Gabriel's sketch.
//
// Nothing here is a looping keyframe animation. The dog is a small physical
// puppet that is simulated every frame:
//   - WALKING uses a real step cycle. A foot is planted and stays put while
//     the body travels over it, then lifts and swings forward faster than it
//     pushed. The body's height comes from the legs (whichever foot is lowest
//     is on the ground), so the bob in its walk is a result, not a sine wave.
//   - Every loose part (head, paws, lean, squash) hangs off the body on its
//     own spring, so it arrives late and overshoots: start, stop, land and
//     turn all get follow-through for free.
//   - It pays attention. The eye follows the pointer, glances at whatever you
//     click, blinks, looks around when left alone, fidgets, sits, falls
//     asleep, and wakes with a start. You can pet it, or pick it up and drop it.
//
// Pages talk to it through lib/mascot.js. What it says lives in data/mascot.js.

const NS = 'http://www.w3.org/2000/svg'
const TAU = Math.PI * 2
const rad = d => (d * Math.PI) / 180
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const lerp = (a, b, t) => a + (b - a) * t

// ── The drawing, in the puppet's own units (origin on the ground, y up = negative)
const BODY = '-63,-194 22,-217 78,-160 62,-69 -10,-49 -86,-107'
const HEAD = '-3,-262 48,-160 -54,-160'
const LEG = '0,-8 37,72 -36,72'              // hip at (0,0), sole along y = 72
const HIP_FRONT = [38, -72], HIP_BACK = [-24, -72]
const PAW = 'M-17,-19 L17,-19 Q30,-19 23,-7 L7,21 Q0,31 -7,21 L-23,-7 Q-30,-19 -17,-19 Z'
const PAW_BACK = { x: -107, y: -127, r: 0 }, PAW_FRONT = { x: 103, y: -150, r: -24 }
const STRIDE = 105                            // units travelled per full step cycle
const GRAVITY = 2300                          // px / s²

const spring = (o, target, k, d, dt) => {
    o.v += (-k * (o.x - target) - d * o.v) * dt
    o.x += o.v * dt
}
const S = (x = 0) => ({ x, v: 0 })

// Angle and lift of one leg at point u (0-1) of its step cycle.
// 0 → 0.6: planted, swept back by the body passing over it.
// 0.6 → 1: lifted and swung forward again.
function legPose(u, reach, lift) {
    u -= Math.floor(u)
    if (u < 0.6) return [lerp(-reach, reach, u / 0.6), 0]
    const w = (u - 0.6) / 0.4
    return [lerp(reach, -reach, w * w * (3 - 2 * w)), Math.sin(Math.PI * w) * lift]
}

// How far below its hip a leg reaches, given its angle (degrees), lift and length.
function legDrop(angle, lift, length) {
    const a = rad(angle), sole = 72 * length
    return Math.max(37 * Math.sin(a) + sole * Math.cos(a), -36 * Math.sin(a) + sole * Math.cos(a)) - lift
}

// Builds the puppet and starts it running. `wrap` and `bubble` are the two
// elements rendered by <Mascot /> below; every part inside them is found by its
// data-part name. Returns the puppet's state and a function that stops it.
function startRig(wrap, bubble) {
    const el = { wrap, bubble }
    for (const node of [...wrap.querySelectorAll('[data-part]'), ...bubble.querySelectorAll('[data-part]')]) el[node.dataset.part] = node
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const narrowQuery = window.matchMedia('(max-width: 760px)')
    let scale = 0.52                         // screen px per puppet unit
    const pointer = { x: innerWidth / 2, y: innerHeight / 2, movedAt: 0 }

    const st = {
        x: -140, y: 0, vx: 0, vy: 0, grounded: true, held: null,
        target: null, run: false, dir: 1, min: 70, max: innerWidth - 70, home: 170,
        facing: S(1), lean: S(), squash: S(1), headRot: S(), headY: S(), gait: S(), sit: S(),
        pupilX: S(), pupilY: S(), mouth: S(), legFront: S(), legBack: S(),
        pawBack: { x: S(PAW_BACK.x), y: S(PAW_BACK.y), r: S(PAW_BACK.r) },
        pawFront: { x: S(PAW_FRONT.x), y: S(PAW_FRONT.y), r: S(PAW_FRONT.r) },
        phase: 0, stripe: 0, lastVx: 0,
        blinkAt: performance.now() + 1500, blink: -1,
        mood: '', moodUntil: 0, look: null, glance: null, glanceAt: 0, turnAt: 0,
        gesture: null, sitting: false, asleep: false, nextZ: 0,
        nextFidget: performance.now() + 5000, lastInput: performance.now(),
        crouch: 0, jump: 0, wasHeld: false,
        speech: null, hidden: false,
    }

    // ── Little things it does ───────────────────────────────────────────
    const emote = (char, kind = '') => {
        const t = document.createElementNS(NS, 'text')
        t.textContent = char
        t.setAttribute('x', 92 * st.dir)       // beside the head, clear of the speech bubble
        t.setAttribute('y', -214)
        t.setAttribute('class', `mascot__emote ${kind}`)
        el.emotes.appendChild(t)
        setTimeout(() => t.remove(), 1400)
    }
    const feel = (mood, ms) => { st.mood = mood; st.moodUntil = performance.now() + ms }
    const gesture = (type, dur) => { st.gesture = { type, t: 0, dur } }
    const jump = (power = 520) => {
        if (!st.grounded || st.crouch > 0 || st.held) return
        st.crouch = 0.11          // anticipation: squash down before leaving the ground
        st.jump = power
    }
    const walkTo = (x, run = false) => {
        st.target = clamp(x, st.min, st.max)
        st.run = run
        st.sitting = false
    }
    const wake = () => {
        st.lastInput = performance.now()
        if (!st.asleep) return
        st.asleep = false
        st.sitting = false
        emote('!', 'is-alert')
        feel('surprised', 700)
        jump(360)
        say(pick(LINES.woken), { low: true })
    }

    // ── Speech ──────────────────────────────────────────────────────────
    function say(text, { sticky = false, low = false } = {}) {
        if (!text) return
        if (low && st.speech?.sticky) return       // small talk never interrupts a lesson
        st.speech = { text, shown: calm ? text.length : 0, sticky, pause: 0, doneAt: 0 }
        st.sitting = false
        el.ghost.textContent = text
        el.typed.textContent = calm ? text : ''
        el.bubble.dataset.show = 'true'
        if (!st.gesture) gesture('nod', 0.5)
    }
    function hush() {
        st.speech = null
        delete el.bubble.dataset.show
    }
    function speak(now, dt) {
        const sp = st.speech
        if (!sp) return false
        if (sp.shown < sp.text.length) {
            sp.pause -= dt
            if (sp.pause > 0) return false
            const before = Math.floor(sp.shown)
            sp.shown = Math.min(sp.text.length, sp.shown + dt * 46)
            const after = Math.floor(sp.shown)
            if (after !== before) {
                el.typed.textContent = sp.text.slice(0, after)
                const ch = sp.text[after - 1]
                if ('.!?'.includes(ch)) sp.pause = 0.24
                else if (ch === ',' || ch === ':') sp.pause = 0.12
                else if (after % 3 === 0 && ch !== ' ') audio.blip()
            }
            if (sp.shown >= sp.text.length) sp.doneAt = now
            return true
        }
        if (!sp.sticky && now - sp.doneAt > Math.max(2600, sp.text.length * 55)) hush()
        return false
    }

    // ── Instructions from the pages ─────────────────────────────────────
    const unbind = mascot.bind(ev => {
        if (ev.type === 'say') say(ev.text, ev)
        else if (ev.type === 'hush') hush()
        else if (ev.type === 'hop') jump(380)
        else if (ev.type === 'cheer') {
            feel('happy', ev.big ? 3200 : 1800)
            gesture('cheer', ev.big ? 1.6 : 1)
            jump(ev.big ? 700 : 540)
            emote('✦', 'is-spark')
            if (ev.big) setTimeout(() => { emote('✦', 'is-spark'); jump(560) }, 620)
            audio.yip()
        } else if (ev.type === 'look') {
            st.look = { x: ev.x, y: ev.y, until: performance.now() + ev.ms }
            if (Math.abs(ev.x - st.x) > 90 && st.target === null) st.dir = Math.sign(ev.x - st.x)
        } else if (ev.type === 'go') walkTo(ev.x, ev.run)
        else if (ev.type === 'range') {
            st.min = ev.min; st.max = Math.max(ev.min, ev.max)
            if (st.x < st.min || st.x > st.max) walkTo(clamp(st.x, st.min, st.max), true)
        } else if (ev.type === 'hide') {
            st.hidden = ev.hidden
            el.wrap.dataset.hidden = ev.hidden || ''
            if (ev.hidden) hush()
        }
    })

    // Writes an attribute only when its value actually changed.
    const last = new Map()
    const put = (node, name, value) => {
        const key = node.dataset.part + name
        if (last.get(key) === value) return
        last.set(key, value)
        node.setAttribute(name, value)
    }

    // ── One frame of the simulation ─────────────────────────────────────
    function update(now, dt) {
        const idle = st.grounded && !st.held && st.target === null && st.crouch <= 0
        const typing = speak(now, dt)
        if (st.mood && now > st.moodUntil) st.mood = ''
        if (st.look && now > st.look.until) st.look = null
        if (st.gesture && (st.gesture.t += dt) > st.gesture.dur) st.gesture = null
        const g = st.gesture
        const env = g ? Math.sin(Math.PI * clamp(g.t / g.dur, 0, 1)) : 0

        // Falls asleep if nobody has moved for a while.
        if (!st.asleep && idle && !st.speech && now - st.lastInput > 50000) { st.asleep = true; st.sitting = true }
        if (st.asleep && now > st.nextZ) { emote('z', 'is-z'); st.nextZ = now + 1900 }

        // Left alone, it finds things to do.
        if (idle && !st.asleep && !st.speech && !g && now > st.nextFidget && !calm) {
            st.nextFidget = now + 4200 + Math.random() * 6500
            const act = pick(st.sitting ? ['stand', 'stand', 'look'] : ['wave', 'sniff', 'tap', 'look', 'hop', 'stretch', 'wander', 'wander', 'sit'])
            if (act === 'wander') walkTo(st.x + (Math.random() - 0.5) * 520)
            else if (act === 'sit') st.sitting = true
            else if (act === 'stand') st.sitting = false
            else if (act === 'hop') jump(330)
            else gesture(act, { wave: 1.5, sniff: 1.3, tap: 1.1, look: 1.8, stretch: 1.3 }[act])
        }

        // ── Movement ────────────────────────────────────────────────────
        if (st.held) {
            st.vx *= Math.exp(-dt * 6)
        } else if (!st.grounded) {
            st.vy -= GRAVITY * dt
            st.y += st.vy * dt
            st.x += st.vx * dt
            st.vx *= Math.exp(-dt * 1.2)
            if (st.x < st.min) { st.x = st.min; st.vx = Math.abs(st.vx) * 0.4 }
            if (st.x > st.max) { st.x = st.max; st.vx = -Math.abs(st.vx) * 0.4 }
            if (st.y <= 0) {                       // landing: the harder the fall, the deeper the squash
                st.y = 0; st.grounded = true
                st.squash.v -= clamp(-st.vy / 300, 0.8, 3.6)
                audio.step(clamp(-st.vy / 900, 0.3, 1))
                st.vy = 0; st.vx *= 0.3
                if (st.wasHeld) {
                    st.wasHeld = false
                    gesture('shake', 0.7)
                    say(pick(LINES.dropped), { low: true })
                }
            }
        } else {
            if (st.crouch > 0 && (st.crouch -= dt) <= 0) { st.vy = st.jump; st.grounded = false }
            let want = 0
            if (st.target !== null && !st.asleep && st.crouch <= 0) {
                const dx = st.target - st.x
                const top = (st.run ? 340 : 150) * (scale / 0.52)
                want = clamp(dx * 5, -top, top)
                if (Math.abs(dx) < 2) { st.target = null; want = 0 }
            }
            st.vx += clamp(want - st.vx, -1000 * dt, 1000 * dt)
            st.x = clamp(st.x + st.vx * dt, Math.min(st.min, st.x), Math.max(st.max, st.x))
            if (Math.abs(st.vx) > 14) st.dir = Math.sign(st.vx)
        }

        // Standing still, it turns to face the pointer, but only once it has settled there.
        if (idle && !st.asleep && Math.abs(pointer.x - st.x) > 150 && Math.sign(pointer.x - st.x) !== st.dir) {
            if (!st.turnAt) st.turnAt = now + 900
            else if (now > st.turnAt) { st.dir = Math.sign(pointer.x - st.x); st.turnAt = 0 }
        } else st.turnAt = 0
        spring(st.facing, st.dir, 240, 24, dt)

        // ── Step cycle ──────────────────────────────────────────────────
        const speed = Math.abs(st.vx) / scale                          // units / s
        const walking = st.grounded && !st.held
        spring(st.gait, walking ? clamp(speed / 200, 0, 1.3) : 0, 70, 15, dt)
        const gait = st.gait.x
        const before = Math.floor(st.phase * 2)
        if (walking) st.phase += (speed * dt) / (STRIDE * Math.max(0.55, gait))
        if (Math.floor(st.phase * 2) !== before && gait > 0.2) {       // a foot just came down
            st.squash.v -= 0.5 * gait
            audio.step(0.22 * gait)
        }
        const reach = (st.run ? 33 : 26) * Math.min(gait, 1.2)
        let [frontA, frontLift] = legPose(st.phase, reach, 17 * gait)
        let [backA, backLift] = legPose(st.phase + 0.5, reach, 17 * gait)

        // ── Pose on top of the walk: sitting, jumping, dangling, tapping ─
        spring(st.sit, st.sitting || st.asleep ? 1 : 0, 90, 14, dt)
        let frontExtra = -32 * st.sit.x, backExtra = 32 * st.sit.x
        if (st.held) {
            const swing = clamp(-st.vx * st.dir * 0.05, -38, 38)
            frontExtra = swing + Math.sin(now * 0.012) * 9; backExtra = swing - Math.sin(now * 0.012) * 9
        } else if (!st.grounded) { frontExtra = -20; backExtra = 20 }
        if (g?.type === 'tap') { const tap = Math.abs(Math.sin(g.t * 15)); frontExtra -= 8 + 10 * tap * env; frontLift += 7 * tap * env }
        spring(st.legFront, frontExtra, 160, 15, dt)
        spring(st.legBack, backExtra, 160, 15, dt)
        frontA += st.legFront.x; backA += st.legBack.x
        const legLen = 1 - 0.42 * st.sit.x

        // Whichever foot reaches lowest is the one on the ground: that sets the body's height.
        const bodyY = st.grounded && !st.held
            ? 72 - Math.max(legDrop(frontA, frontLift, legLen), legDrop(backA, backLift, legLen))
            : 0

        // ── Springy secondary motion ────────────────────────────────────
        const accel = ((st.vx - st.lastVx) / Math.max(dt, 0.001)) * st.dir
        st.lastVx = st.vx
        spring(st.lean, clamp(speed * 0.022, 0, 9) + clamp(accel * 0.006, -7, 7), 110, 12, dt)
        const roll = 2.6 * gait * Math.sin(TAU * st.phase)

        let squashTo = 1 + (st.asleep ? 0.035 * Math.sin(now * 0.0012) : 0.018 * Math.sin(now * 0.0021))
        if (st.crouch > 0) squashTo -= 0.2
        if (!st.grounded) squashTo += clamp(st.vy / 2600, -0.1, 0.16)
        if (g?.type === 'stretch') squashTo += g.t < g.dur * 0.55 ? -0.15 * env : 0.12 * env
        if (g?.type === 'nod') squashTo -= 0.05 * env
        spring(st.squash, squashTo, 200, 13, dt)
        const sy = clamp(st.squash.x, 0.6, 1.4), sx = 1 / Math.sqrt(sy)  // keeps its volume as it squashes

        // Where it is looking.
        let lookAt
        if (st.held) lookAt = { x: st.x + st.dir * 200, y: innerHeight }
        else if (st.look) lookAt = st.look
        else if (g?.type === 'sniff') lookAt = { x: st.x + st.dir * 60, y: innerHeight }
        else if (now - pointer.movedAt < 3500) lookAt = pointer
        else {
            if (now > st.glanceAt) {                // nobody is moving: its eye wanders
                st.glanceAt = now + 1200 + Math.random() * 2400
                st.glance = Math.random() < 0.3 ? null : { x: st.x + (Math.random() - 0.5) * 900, y: innerHeight * (0.3 + Math.random() * 0.6) }
            }
            lookAt = st.glance
        }
        const eyeX = st.x + st.facing.x * 11 * scale, eyeY = innerHeight - 30 - st.y - 192 * scale
        let px = 0, py = 0, tilt = 0
        if (lookAt) {
            const dx = (lookAt.x - eyeX) * Math.sign(st.facing.x || 1), dy = lookAt.y - eyeY
            const dist = Math.hypot(dx, dy) || 1
            const reachEye = Math.min(4.6, dist / 45)
            px = (dx / dist) * reachEye; py = (dy / dist) * reachEye
            tilt = clamp((dy / dist) * 9, -7, 9) * (dx > 0 ? 1 : -0.4)
        }
        spring(st.pupilX, px, 320, 28, dt)
        spring(st.pupilY, py, 320, 28, dt)

        let headTo = -roll * 0.5 + tilt + (st.asleep ? 13 : 0)
        if (typing) headTo += Math.sin(now * 0.012) * 3
        if (g?.type === 'sniff') headTo += 18 * env + Math.sin(g.t * 30) * 2.5 * env
        if (g?.type === 'look') headTo += Math.sin((g.t / g.dur) * TAU) * 11
        if (g?.type === 'shake') headTo += Math.sin(g.t * 44) * 15 * (1 - g.t / g.dur)
        if (g?.type === 'nod') headTo += 9 * env
        spring(st.headRot, headTo, 130, 13, dt)
        spring(st.headY, (1 - sy) * -46 + (g?.type === 'sniff' ? 9 * env : 0), 170, 12, dt)

        // Blinking.
        if (st.blink < 0 && now > st.blinkAt) {
            st.blink = 0
            st.blinkAt = now + (Math.random() < 0.14 ? 260 : 1700 + Math.random() * 4300)
        }
        let lid = 0
        if (st.blink >= 0) {
            st.blink += dt
            lid = st.blink < 0.07 ? st.blink / 0.07 : 1 - (st.blink - 0.07) / 0.09
            if (st.blink > 0.16) { st.blink = -1; lid = 0 }
        }
        if (st.mood === 'happy') lid = Math.max(lid, 0.42)
        if (st.asleep) lid = 1
        const eyeOpen = clamp(1 - lid, 0.06, 1) * (st.mood === 'surprised' || st.held ? 1.2 : 1)

        spring(st.mouth, typing ? 0.45 + 0.55 * Math.sin(now * 0.028) : st.mood === 'surprised' || st.held ? 0.85 : 0, 320, 22, dt)
        const open = clamp(st.mouth.x, 0, 1), smile = st.mood === 'happy' ? 1 : 0.5

        // Paws: floaty, they trail behind when it moves and swing against the legs.
        const swingPaw = 13 * gait * Math.sin(TAU * st.phase), drag = clamp(speed * 0.045, 0, 24)
        const paw = (p, rest, sign, i) => {
            let tx = rest.x - drag + sign * swingPaw, ty = rest.y + 5 * gait * Math.cos(2 * TAU * st.phase) + 16 * st.sit.x + bodyY
            let tr = rest.r + sign * swingPaw * 0.8
            ty += Math.sin(now * 0.0017 + i * 2.1) * 3.5                // they never quite hold still
            if (!st.grounded) ty -= 30
            if (st.held) { ty -= 34 + Math.sin(now * 0.03 + i * 3) * 12; tr += Math.sin(now * 0.025 + i) * 30 }
            if (g?.type === 'cheer') { ty -= 78 * env; tr += sign * 25 * env }
            if (i === 1) {
                if (typing) { ty -= 20 + Math.sin(now * 0.008) * 7; tr += Math.sin(now * 0.011) * 12 }
                if (g?.type === 'wave') { tx += 16 * env; ty -= 62 * env; tr += Math.sin(g.t * 17) * 30 * env }
            }
            spring(p.x, tx, 85, 10, dt); spring(p.y, ty, 85, 10, dt); spring(p.r, tr, 85, 10, dt)
        }
        paw(st.pawBack, PAW_BACK, -1, 0)
        paw(st.pawFront, PAW_FRONT, 1, 1)

        // The stripes ripple along its side, faster when it runs.
        st.stripe += dt * (1.3 + speed * 0.02)
        const wave = y0 => {
            let d = ''
            for (let x = -96; x <= 92; x += 12) d += `${x === -96 ? 'M' : 'L'}${x},${(y0 - 0.07 * x + (6 + 3 * gait) * Math.sin(x * 0.045 - st.stripe)).toFixed(1)}`
            return d
        }

        // ── Write the pose to the page ──────────────────────────────────
        const flip = Math.abs(st.facing.x) < 0.08 ? 0.08 * Math.sign(st.facing.x || 1) : st.facing.x
        el.wrap.style.transform = `translate3d(${st.x.toFixed(1)}px,${(-st.y).toFixed(1)}px,0)`
        put(el.flip, 'transform', `scale(${flip.toFixed(3)},1)`)
        put(el.shadow, 'cy', (5 + st.y / scale).toFixed(1))   // the shadow stays on the floor
        put(el.shadow, 'rx', 72 * clamp(1 - st.y / 420, 0.45, 1))
        put(el.shadow, 'opacity', 0.24 * clamp(1 - st.y / 500, 0.3, 1))
        const lift = bodyY.toFixed(1), tiltAll = (st.lean.x + roll).toFixed(2)
        put(el.body, 'transform', `translate(0,${lift}) rotate(${tiltAll},0,-72) translate(0,-49) scale(${sx.toFixed(3)},${sy.toFixed(3)}) translate(0,49)`)
        put(el.legFront, 'transform', `translate(${HIP_FRONT[0]},${(HIP_FRONT[1] + bodyY - frontLift).toFixed(1)}) rotate(${frontA.toFixed(1)}) scale(1,${legLen.toFixed(3)})`)
        put(el.legBack, 'transform', `translate(${HIP_BACK[0]},${(HIP_BACK[1] + bodyY - backLift).toFixed(1)}) rotate(${backA.toFixed(1)}) scale(1,${legLen.toFixed(3)})`)
        put(el.head, 'transform', `translate(0,${st.headY.x.toFixed(1)}) rotate(${st.headRot.x.toFixed(2)},-3,-172)`)
        put(el.eye, 'transform', `translate(9,-193) scale(1,${eyeOpen.toFixed(3)})`)
        put(el.pupil, 'transform', `translate(${st.pupilX.x.toFixed(2)},${st.pupilY.x.toFixed(2)})`)
        put(el.mouth, 'd', `M-15,-176 Q10,${-172 - 4 * smile} 35,-177 Q12,${(-170 + 9 * smile + 16 * open).toFixed(1)} -15,-176 Z`)
        put(el.pawBack, 'transform', `translate(${st.pawBack.x.x.toFixed(1)},${st.pawBack.y.x.toFixed(1)}) rotate(${st.pawBack.r.x.toFixed(1)})`)
        put(el.pawFront, 'transform', `translate(${st.pawFront.x.x.toFixed(1)},${st.pawFront.y.x.toFixed(1)}) rotate(${st.pawFront.r.x.toFixed(1)})`)
        put(el.stripeA, 'd', wave(-142))
        put(el.stripeB, 'd', wave(-119))

        // The speech bubble rides above its head and stays on screen.
        if (st.speech) {
            const bw = el.bubble.offsetWidth
            const bx = clamp(st.x - bw / 2 + st.dir * 14, 10, innerWidth - bw - 10)
            el.bubble.style.transform = `translate3d(${bx.toFixed(0)}px,${(-(st.y + 278 * scale + 34)).toFixed(0)}px,0)`
            el.bubble.style.setProperty('--tail', `${clamp(st.x - bx, 26, bw - 26).toFixed(0)}px`)
        }
        return !idle || typing || g || st.gait.x > 0.02
    }

    // ── Frame loop: every frame while something is happening, 24 a second when it is just breathing
    let raf = 0, then = performance.now(), lively = true
    const frame = now => {
        raf = requestAnimationFrame(frame)
        if (!lively && now - then < 40) return
        const dt = Math.min((now - then) / 1000, 1 / 20)
        then = now
        lively = update(now, dt)
    }

    // ── Touch: press to pet, drag to pick up ────────────────────────────
    let pats = 0
    const down = e => {
        e.preventDefault()
        audio.unlock()
        wake()
        st.held = null
        const grab = { id: e.pointerId, sx: e.clientX, sy: e.clientY, dx: st.x - e.clientX, dy: st.y + e.clientY, moved: false, px: e.clientX, py: e.clientY, t: performance.now(), vx: 0, vy: 0 }
        el.hit.setPointerCapture(e.pointerId)
        const move = ev => {
            if (!grab.moved && Math.hypot(ev.clientX - grab.sx, ev.clientY - grab.sy) > 7) {
                grab.moved = true
                st.held = grab; st.grounded = false; st.target = null; st.sitting = false
                el.wrap.dataset.held = 'true'
                emote('!', 'is-alert')
                say(pick(LINES.lifted), { low: true })
            }
            if (!grab.moved) return
            const now = performance.now(), dt = Math.max(now - grab.t, 1) / 1000
            grab.vx = lerp(grab.vx, (ev.clientX - grab.px) / dt, 0.4)
            grab.vy = lerp(grab.vy, (ev.clientY - grab.py) / dt, 0.4)
            grab.px = ev.clientX; grab.py = ev.clientY; grab.t = now
            st.x = clamp(grab.dx + ev.clientX, 30, innerWidth - 30)
            st.y = Math.max(0, grab.dy - ev.clientY)
            st.vx = grab.vx
            if (Math.abs(grab.vx) > 60) st.dir = Math.sign(grab.vx)
        }
        const up = () => {
            el.hit.removeEventListener('pointermove', move)
            el.hit.removeEventListener('pointerup', up)
            el.hit.removeEventListener('pointercancel', up)
            delete el.wrap.dataset.held
            if (grab.moved) {                              // let go: it falls, or flies if thrown
                st.held = null; st.wasHeld = true
                st.vx = clamp(grab.vx, -900, 900)
                st.vy = clamp(-grab.vy, -400, 900)
                if (st.y <= 0) { st.y = 0.01 }
                return
            }
            feel('happy', 1700)                            // a press without a drag is a pat
            emote('♥', 'is-heart')
            jump(360)
            audio.yip()
            // Every other pat it offers a hint for the page it is on, if there is one to give.
            const hint = ++pats % 2 === 0 && mascot.hint?.()
            if (hint) say(hint, { low: true })
            else if (prefs.earn('pet') || hint === null || Math.random() < 0.6) say(pick(LINES.pet), { low: true })
        }
        el.hit.addEventListener('pointermove', move)
        el.hit.addEventListener('pointerup', up)
        el.hit.addEventListener('pointercancel', up)
    }

    const onPointerMove = e => { pointer.x = e.clientX; pointer.y = e.clientY; pointer.movedAt = performance.now(); wake() }
    const onPointerDown = e => {
        wake()
        if (!el.wrap.contains(e.target)) st.look = { x: e.clientX, y: e.clientY, until: performance.now() + 900 }
    }
    const onBubble = () => {
        const sp = st.speech
        if (sp && sp.shown < sp.text.length) { sp.shown = sp.text.length; sp.doneAt = performance.now(); el.typed.textContent = sp.text }
        else hush()
    }
    const onSize = () => {
        scale = narrowQuery.matches ? 0.38 : 0.52
        el.wrap.style.setProperty('--size', `${300 * scale}px`)
        st.max = Math.min(st.max, innerWidth - 40)
    }
    const onVisibility = () => {
        cancelAnimationFrame(raf)
        if (!document.hidden) { then = performance.now(); raf = requestAnimationFrame(frame) }
    }

    onSize()
    raf = requestAnimationFrame(frame)
    el.hit.addEventListener('pointerdown', down)
    el.bubble.addEventListener('click', onBubble)
    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('keydown', wake)
    window.addEventListener('resize', onSize)
    document.addEventListener('visibilitychange', onVisibility)
    if (import.meta.env.DEV) window.__mascot = st
    const stop = () => {
        cancelAnimationFrame(raf)
        unbind()
        el.hit.removeEventListener('pointerdown', down)
        el.bubble.removeEventListener('click', onBubble)
        window.removeEventListener('pointermove', onPointerMove)
        window.removeEventListener('pointerdown', onPointerDown)
        window.removeEventListener('keydown', wake)
        window.removeEventListener('resize', onSize)
        document.removeEventListener('visibilitychange', onVisibility)
        el.emotes.replaceChildren()
    }
    return { st, stop }
}

function Mascot() {
    const clipId = useId()
    const { pathname } = useLocation()
    const wrapRef = useRef(null)
    const bubbleRef = useRef(null)
    const rig = useRef(null)

    useEffect(() => {
        const { st, stop } = startRig(wrapRef.current, bubbleRef.current)
        rig.current = st
        return stop
    }, [])

    // Each page has a spot it calls home. Changing page sends it trotting there.
    useEffect(() => {
        const st = rig.current
        if (!st) return
        const narrow = window.matchMedia('(max-width: 760px)').matches
        const board = pathname.startsWith('/hexagons')
        st.min = narrow ? 50 : 70
        st.max = innerWidth - (narrow ? 50 : 70)
        st.home = board ? (narrow ? 120 : 190) : narrow ? innerWidth - 70 : innerWidth * 0.43
        st.target = st.home
        st.run = st.x > -100                     // strolls in the first time, runs between pages after that
        st.sitting = false
    }, [pathname])

    return (
        <>
            <div className="mascot" ref={wrapRef}>
                <svg viewBox="-150 -300 300 320" aria-hidden="true">
                    <defs>
                        <clipPath id={clipId}><polygon points={BODY} /></clipPath>
                    </defs>
                    <ellipse data-part="shadow" className="mascot__shadow" cx="0" cy="5" rx="72" ry="9" />
                    <g data-part="flip">
                        <g data-part="hit" className="mascot__hit">
                            <g data-part="body">
                                <polygon className="mascot__fill" points={BODY} />
                                <g clipPath={`url(#${clipId})`} className="mascot__stripes">
                                    <path data-part="stripeA" />
                                    <path data-part="stripeB" />
                                </g>
                                <polygon className="mascot__line" points={BODY} />
                                <g data-part="head">
                                    <polygon className="mascot__fill mascot__line" points={HEAD} />
                                    <g data-part="eye">
                                        <ellipse cx="-3" cy="-2" rx="9" ry="13" fill="#fff" />
                                        <g data-part="pupil">
                                            <ellipse cx="2" cy="1" rx="8.5" ry="11.5" fill="#0E1512" />
                                            <circle cx="0" cy="-4" r="2.4" fill="#fff" />
                                        </g>
                                    </g>
                                    <path className="mascot__curl" d="M-28,-173 q3,-5 6,0 t6,0" />
                                    <path data-part="mouth" className="mascot__mouth" />
                                </g>
                            </g>
                            <polygon data-part="legBack" className="mascot__fill mascot__line" points={LEG} />
                            <polygon data-part="legFront" className="mascot__fill mascot__line" points={LEG} />
                            <path data-part="pawBack" className="mascot__fill mascot__line" d={PAW} />
                            <path data-part="pawFront" className="mascot__fill mascot__line" d={PAW} />
                        </g>
                    </g>
                    <g data-part="emotes" />
                </svg>
            </div>
            <div className="bubble" ref={bubbleRef} role="status" aria-live="polite">
                <span className="bubble__ghost" data-part="ghost" aria-hidden="true" />
                <span className="bubble__text" data-part="typed" />
            </div>
        </>
    )
}

export default Mascot
