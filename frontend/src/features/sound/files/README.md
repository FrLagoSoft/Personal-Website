# Custom sounds

Drop audio files in this folder, named after the moment they belong to.
Each one replaces the built-in synthesized sound for that moment; anything
you leave out keeps the built-in sound. Accepted: mp3, ogg, wav, m4a, aac,
webm, opus, flac (mp3 is the safe choice for every browser).

| File name                    | When it plays                                                     |
| ---------------------------- | ----------------------------------------------------------------- |
| `music.mp3`                  | Background music, looped. Fades in and out with the music key     |
| `music-<weather>.mp3`        | Music for one weather only (see below)                            |
| `enter.mp3`                  | The visitor presses **Enter the board** on the landing page       |
| `wipe.mp3`                   | The hexagon transition between pages                              |
| `hover.mp3`                  | The pointer moves onto a tile (keep it tiny: it plays a lot)      |
| `press.mp3`                  | A category tile or a control key is pressed                       |
| `open.mp3` / `close.mp3`     | A category opens / closes                                         |
| `note.mp3`                   | A tile is opened to read. Pitched up and down the scale per tile  |
| `prize.mp3`                  | A hackathon-winning tile is opened                                |
| `celebrate.mp3`              | Big moments: all six fields open, a field fully read, every tile  |
| `panel-open.mp3` / `panel-close.mp3` | The story panel slides in / out                           |
| `voice.mp3`                  | The mascot talking, one blip per few letters. Pitched at random   |
| `step.mp3`                   | The mascot's footsteps (very quiet)                               |
| `yip.mp3`                    | The mascot when it is petted or cheers                            |
| `thunder.mp3`                | Lightning during rain                                             |
| `impact.mp3`                 | A meteor landing. Pitched, so a shower plays a tune               |

Volumes for each are in `../files.js` (`VOLUME`), if one sits too loud or quiet.

## Music for each weather

The board has weather, and each one can have its own track. Name the file
after the weather and it plays, with a crossfade, whenever that weather is up:

`music-sunny.mp3` · `music-windy.mp3` · `music-rain.mp3` · `music-snow.mp3` ·
`music-stars.mp3` · `music-meteors.mp3` · `music-aurora.mp3`

The name only has to start with `music` and the weather: capitals, spaces and
underscores are fine (`Music Rain.mp3`, `music_rain.mp3`).

**Several tracks for one weather:** add anything after the weather's name:
`music-rain-2.mp3`, `music-rain-storm.mp3`. One is picked each time that
weather arrives, and never the one it played the time before.

A weather with no track of its own plays `music.mp3` (you can have several of
those too: `music-2.mp3`, `music-3.mp3`); with none of those either, it plays
the built-in music. Each track remembers its place, so a rain track picks up
where it left off the next time it plays. A track is only downloaded the first
time it is needed.

To change a track, replace the file (same name) or delete it. If one is too
loud or quiet next to the others, give it its own line in `VOLUME` in
`../files.js`.

The weather also changes how the sound effects sound, whether they are your
files or the built-in ones: muffled and gritty in rain, thin in wind, soft and
dry in snow, echoing at night. Those settings are `WEATHER_SOUND` in `../audio.js`.

**Pitched sounds** (`note`, `voice`): use a short, clean one-shot. It is treated
as the note D and shifted to other notes from there, so a single pluck becomes
a melody.

**Music**: a track that loops cleanly works best. Keep it under ~5 MB
(a 3-minute mp3 at 192 kbps is about 4 MB), since every visitor downloads it.

Browsers never play sound before the visitor's first click or key press, so
`enter.mp3` and the music start on the **Enter the board** click, not on page load.
