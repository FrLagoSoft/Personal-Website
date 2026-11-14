// Everything the mascot says. Edit freely: plain strings, or functions where a
// number or a name gets filled in. Where there is a list, one is picked at random.
//
// The mascot has no name yet. Give it one here and it will introduce itself.
export const MASCOT_NAME = ''

const me = MASCOT_NAME ? `I'm ${MASCOT_NAME}.` : 'I live on this board.'

export const LINES = {
    // Landing page
    landing: `Hi! ${me} Press “Enter the board” and I'll show you round.`,

    // First visit to the board, one step at a time.
    tutorial: [
        `Hi! ${me} See the six coloured tiles? Press one to open it.`,
        'Look, they came out. Press any of them to read the story behind it.',
        'That is all there is to it. Drag to look around, scroll or pinch to zoom. Press me if you ever want a hint.',
    ],

    // The "?" key.
    help: 'Press a coloured tile to open it. Press a tile that comes out to read it. Drag to move, scroll or pinch to zoom.\nKeys:  /  index   ← →  next tile   F  fit   M  music   Esc  close',

    welcomeBack: (seen, total) => `Welcome back! You have read ${seen} of ${total} so far.`,

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
    pet: ['Hehe.', 'Right there. That is the spot.', 'Six sides, one eye, all dog.', 'Woof. I think that is what I say.', 'Go on, I will keep up with you.'],
    lifted: ['Whoa!', 'Hey, hey, hey!', 'I can see the whole board from here!'],
    dropped: ['Again?', 'Okay. I am fine. I am fine.', 'Soft landing. Mostly.'],
    woken: ['Huh? I am up. I am up.', 'I was resting my eye.'],

    // Controls
    musicOn: 'Oh, I like this one.',
    musicOff: 'Quiet is good too.',
    index: 'Everything, in one list. For when you would rather read than wander.',
}

export const pick = list => (Array.isArray(list) ? list[Math.floor(Math.random() * list.length)] : list)
