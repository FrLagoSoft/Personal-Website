import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { initAudio, playBgMusic } from '../utils/audio'

const HEX  = "133,0 266,76.5 266,229.5 133,306 0,229.5 0,76.5"
const HEXS = "66,0 133,38.25 133,114.75 66,153 0,114.75 0,38.25"

const childHexes = [
    { x: '-5.6vw',  y: '-8.3vw',  delay: 12.3 },
    { x: '10.4vw',  y: '-5.6vw',  delay: 12.6 },
    { x: '13.2vw',  y: '8.3vw',   delay: 12.9 },
    { x: '-4.2vw',  y: '13.2vw',  delay: 13.2 },
]

function IntroPage() {
    const navigate = useNavigate()

    return (
        <div className="fixed inset-0 flex">

            {/* ── Left — dark, text ── */}
            <div className="flex flex-col justify-center gap-[clamp(2rem,6vh,5rem)] w-1/2"
                 style={{ backgroundColor: '#8AA891',
                          padding: 'clamp(1.5rem, 3.5vw, 3.5rem) clamp(1.5rem, 4.5vw, 4rem)' }}>

                {/* Name */}
                <motion.div
                    initial={{ opacity: 0, x: -16 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.7, delay: 0.1 }}
                >
                    <h1 style={{ color: '#FFFFFF', fontFamily: 'Inria Serif',
                                 fontStyle: 'italic', fontSize: 'clamp(1.8rem, 4vw, 4rem)',
                                 lineHeight: 1, fontWeight: 'bold' }}>
                        Before you go in
                    </h1>
                </motion.div>

                {/* Instructions */}
                <motion.div
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.7, delay: 0.5 }}
                    style={{ color: '#010101', fontFamily: 'Inria Serif',
                            lineHeight: 2 }}
                >
                    <p style={{ fontSize: 'clamp(1rem, 2.5vw, 2rem)', color: '#BFEDC1', marginBottom: '0.75rem' }}>
                        Stuff that you should know:
                    </p>
                    <p style={{ fontSize: 'clamp(0.85rem, 1.75vw, 1.5rem)' }}>Click a hexagon to expand its topic,</p>
                    <p style={{ fontSize: 'clamp(0.85rem, 1.75vw, 1.5rem)' }}>Click any child hex to read more,</p>
                    <p style={{ fontSize: 'clamp(0.85rem, 1.75vw, 1.5rem)' }}>And then drag to explore the full grid!</p>
                    <p style={{ fontSize: 'clamp(0.85rem, 1.75vw, 1.5rem)' }}>No zooming in required!</p>
                </motion.div>

                {/* Enter */}
                <motion.button
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.6, delay: 1.0 }}
                    whileHover={{ x: 6 }}
                    onClick={() => { initAudio(); playBgMusic(); navigate('/hexagons') }}
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer',
                             color: '#BFEDC1', fontFamily: 'Inria Serif', 
                             fontWeight: 'bold', textDecoration: 'underline',
                             fontSize: 'clamp(1rem, 2.5vw, 2rem)',
                             textAlign: 'left' }}
                >
                    Lets begin!
                </motion.button>
            </div>

            {/* ── Right — green, animated hex demo ── */}
            <div className="relative flex items-center justify-center w-1/2"
                 style={{ backgroundColor: '#0A0F0A' }}>

                {/* Faint watermark hex in background */}
                <svg viewBox="0 0 266 306"
                     style={{ position: 'absolute', opacity: 0.8, width: '29vw', height: '33.4vw' }}>
                    <polygon points={HEX} fill="#5BD765" />
                </svg>

                {/* Main hex */}
                <motion.svg
                    viewBox="0 0 266 306"
                    style={{ position: 'relative', zIndex: 1, width: '14vw', height: '16.1vw' }}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                >
                    <polygon points={HEX} fill="#9DE7A3" />
                </motion.svg>

                {/* Child hexes — loop in and out to show expansion */}
                {childHexes.map((c, i) => (
                    <motion.svg
                        key={i}
                        viewBox="0 0 133 153"
                        style={{ position: 'absolute',
                                 width: '7vw', height: '8.05vw',
                                 left: `calc(50% + ${c.x})`,
                                 top:  `calc(50% + ${c.y})`,
                                 zIndex: 2 }}
                        initial={{ opacity: 0, scale: 0.6 }}
                        animate={{ opacity: [0, 1, 1, 0], scale: [0.6, 1, 1, 0.6] }}
                        transition={{
                            duration: 2.5, delay: c.delay,
                            repeat: Infinity, repeatDelay: 2,
                            times: [0, 0.2, 0.75, 1], ease: 'easeOut'
                        }}
                    >
                        <polygon points={HEXS} fill="#DFF6E0" stroke="#9DE7A3" strokeWidth="3" />
                    </motion.svg>
                ))}
            </div>

        </div>
    )
}

export default IntroPage
