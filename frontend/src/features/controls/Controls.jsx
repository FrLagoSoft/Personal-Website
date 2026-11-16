import { useState } from 'react'
import Icon from '@/shared/ui/Icon.jsx'
import { usePrefs } from '@/shared/state/prefs.js'
import { audio } from '@/features/sound'
import { mascot, LINES } from '@/features/mascot'
import { useWeather, WEATHERS } from '@/features/weather'
import { HexKey } from './HexKey.jsx'
import { KEY_W, KEY_H, slot } from './honeycomb.js'
import './controls.css'

// The main cluster of keys, top right: index, sound, music, fit, help, and the
// weather (which shows what it is doing now, and moves it on when pressed).

// Three bars that dance while the music plays.
const Equalizer = () => <span className="eq" aria-hidden="true"><i /><i /><i /></span>

export default function Controls({ onIndex, onFit, onHelp, onWeather }) {
    const p = usePrefs()
    const sky = WEATHERS[useWeather()]
    const musicOn = p.music === true
    const [hint, setHint] = useState(null)
    const toggleMusic = () => {
        audio.setMusic(!musicOn)
        mascot.say(musicOn ? LINES.musicOff : LINES.musicOn, { low: true })
    }
    return (
        <div className="comb comb--controls" style={{ width: slot(2, 1).left + KEY_W, height: slot(0, 1).top + KEY_H + 8 }}>
            <HexKey at={slot(0, 0)} icon="list" label="Index of every tile" onClick={onIndex} onHint={setHint} />
            <HexKey at={slot(1, 0)} icon={p.sfx ? 'sound' : 'soundOff'} label={p.sfx ? 'Sound effects: on' : 'Sound effects: off'} on={p.sfx} onClick={() => audio.setSfx(!p.sfx)} onHint={setHint} />
            <HexKey at={slot(2, 0)} label={musicOn ? 'Music: on' : 'Music: off'} on={musicOn} onClick={toggleMusic} onHint={setHint}>
                {musicOn ? <Equalizer /> : <Icon name="noteOff" size={21} strokeWidth={2} />}
            </HexKey>
            <HexKey at={slot(0, 1)} icon="fit" label="Fit the board to the screen" onClick={onFit} onHint={setHint} />
            <HexKey at={slot(1, 1)} icon="help" label="How this works" onClick={onHelp} onHint={setHint} />
            <HexKey at={slot(2, 1)} icon={sky.icon} label={`Weather: ${sky.label}. Press to change it`} onClick={onWeather} onHint={setHint} tone={sky.night ? 'ink' : undefined} />
            <span className="comb__hint" data-show={hint ? true : undefined}>{hint}</span>
        </div>
    )
}
