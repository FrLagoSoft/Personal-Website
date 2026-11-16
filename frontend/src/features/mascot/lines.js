// Everything the mascot says. Edit freely: plain strings, or functions where a
// number or a name gets filled in. Where there is a list, one is picked at random.
//
// The mascot has no name yet. Give it one here and it will introduce itself.
export const MASCOT_NAME = 'Seymour'

const me = MASCOT_NAME ? `I'm ${MASCOT_NAME}.` : 'I live on this board. Quite lonely, I know. I am an extension of the guy you see on your right.'

export const LINES = {
    // Landing page
    landing: `Hi! ${me} Press “Enter the board” and I'll show you round.`,

    // First visit to the board, one step at a time.
    tutorial: [
        `Hi! ${me} so, you see any of those six coloured tiles? Press one to open it! Promise it's worth it`,
        'Look, more hexagons came out! Press any of them to read the story behind them. I hope you have a good computer!',
        'That is all there is to it, although there are secrets! Drag to look around, scroll or pinch to zoom. Press me if you ever want a hint on anything...teehee',
    ],

    // The "?" key.
    help: 'Press a coloured "parent" hexagon to open it. Press a "child" hexagon that comes out of it to read it. Drag to move, scroll or pinch to zoom.\nKeys:  /  index   ← →  next tile   F  fit   M  music   Esc  close',

    welcomeBack: (seen, total) => `Welcome back! You have read ${seen} of ${total} hexagons so far.`,

    // First time each category is opened: label and blurb come from content.js.
    opened: (label, blurb) => `${label}. ${blurb}`,

    // Reading progress
    firstTile: 'That is your first one! The hexagon by my feet keeps count.',
    medal: ['A podium finish! Read this one slowly.', 'This one came home with a prize.'],
    fieldDone: label => `Every tile in ${label}, read. That field is all yours now.`,
    half: (seen, total) => `Halfway there: ${seen} of ${total}!`,
    all: total => `All ${total}. You read every single one. Thank you. Really.`,
    fullBoard: 'All six open at once! Look at the colours mix.',

    // Nudges when the visitor has gone quiet.
    hintField: label => `Have you opened ${label} yet?`,
    hintLeft: left => `${left} tiles still unread. No rush.`,

    // Being touched
    pet: ['Teehe.', 'Right there, that is the spot!', 'Six sides, all hexagony, for you!', 'Woof.', 'I am growing rather tired of this.', 'Did you know I can do a backflip? Find the hidden key!'],
    lifted: ['Whoa!!!!!!', 'Hey, Hey!, HEYYY!', 'I can see the whole board from here!', 'I think Im gonna be sick...'],
    dropped: ['Can we go again?', 'Okay... I am fine...', 'Soft landing. Dork.'],
    woken: ['Huh?', 'I was resting my eye...', 'In life, the only thing that is certain is that I will always be here for you.'],

    // Controls
    musicOn: 'Oh, you are gonna LOVE this one! I promise!', 
    musicOff: 'Being quiet is respectable too. I guess. ',
    index: 'Here is everything that I am, on a singular list. Enjoy!',

    // The weather. One of these when it changes; thunder and meteors have their own.
    weather: {
        sunny: ['The sun is back! gotta get my shades on.', 'Clear skies. I can dry off my "fur"!'],
        windy: ['whoa, Whoa, WHOAA! Hold on to something!', 'It is so Windyyyyyyy!'],
        rain: ['Rain! Good thing I brought this...', 'Here it comes... lets get my umbrella up!'],
        snow: ['Snow! I LOVE the snow!', 'It is snowing! Looks like my Scarf is ready!'],
        stars: ['Quiet... The stars are out. ', 'Night already? Look up!'],
        meteors: ['Meteor shower! Getting my hard hat on.', 'Incoming!!! Mind your tiles!!'],
        aurora: ['Oh my..... Look at the sky!', 'The lights are out tonight!'],
    },
    thunder: ['YIKES!', 'That was close...', 'I am not scared... YOU are scared!!!'],
    impact: ['Ooh, nice one!', 'Did you see that?!', 'That one played a note!'],

    // The hidden key (B).
    flip: ['TA-DA!', 'Told you I could!'],
}

export const pick =list => (Array.isArray(list) ? list[Math.floor(Math.random() * list.length)] : list)
