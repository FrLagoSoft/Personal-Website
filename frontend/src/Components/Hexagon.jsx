import { motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useState, useEffect, memo } from 'react'

const CLIP = 'polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)'

function Hexagon({ color, borderColor, label, glowColor, onClick, important, data, textColor = '#000000', flip = false, visitedSet = null, selected = false, floating = false, wip = false }) {
    const effectiveBorderColor = (visitedSet && !visitedSet.has(data?.label)) ? '#FFFFFF' : borderColor
    const [pressed, setPressed] = useState(false)
    const [flipped, setFlipped] = useState(false)
    const [glowEnabled, setGlowEnabled] = useState(false)

    useEffect(() => {
        const t = setTimeout(() => setGlowEnabled(true), 12000)
        return () => clearTimeout(t)
    }, [])
    const liftY = useMotionValue(0)

    const lineHeight = useTransform(liftY, [-14, 0], [14, 0])
    const lineTop = useTransform(liftY, [-14, 0], [215.5, 229.5])
    const lineCenterTop = useTransform(liftY, [-14, 0], [289, 303])

    useEffect(() => {
        animate(liftY, selected ? 10 : 0, { duration: 0.2 })
    }, [selected])

    useEffect(() => {
        if (!floating) return
        let cancelled = false
        animate(liftY, -10, { duration: 1.8, ease: 'easeInOut' }).then(() => {
            if (cancelled) return
            animate(liftY, 0, { duration: 1.8, ease: 'easeInOut' })
        })
        return () => { cancelled = true }
    }, [floating])

    function handleHoverStart() {
        if (!pressed && !selected && !floating) animate(liftY, -14, { duration: 0.2 })
    }

    function handleHoverEnd() {
        if (!pressed && !selected && !floating) animate(liftY, 0, { duration: 0.2 })
    }

    function handlePressStart() {
        if (selected) return
        setPressed(true)
        animate(liftY, 10, { duration: 0.2 })
    }

    function handlePressEnd() {
        if (selected) return
        setPressed(false)
        animate(liftY, 0, { duration: 0.2 })
    }

    function handleTap() {
        if (flip) setFlipped(f => !f)
        onClick && onClick(data)
    }

    function handlePressEndWithFlip() {
        setPressed(false)
        animate(liftY, 0, { duration: 0.2 })
        if (flip) setFlipped(f => !f)
        onClick && onClick(data)
    }

    return (
        <motion.div
            className="relative w-[266px] h-[326px] cursor-pointer"
            animate={flip ? { rotateY: flipped ? 360 : 0 } : undefined}
            transition={{ duration: 0.6, ease: 'easeInOut' }}
        >

            {/* Slice 2 — deepest */}
            <div
                className="absolute w-[266px] h-[306px]"
                style={{ top: '20px', clipPath: CLIP, backgroundColor: effectiveBorderColor, opacity: 0.45, zIndex: 2 }}
            />

            {/* Slice 1 — middle */}
            <div
                className="absolute w-[266px] h-[306px]"
                style={{ top: '10px', clipPath: CLIP, backgroundColor: effectiveBorderColor, opacity: 0.65, zIndex: 3 }}
            />

            {/* Wall hex — fixed base */}
            <div
                className="absolute w-[266px] h-[306px] flex items-center justify-center"
                style={{ top: '0px', clipPath: CLIP, backgroundColor: effectiveBorderColor, zIndex: 4 }}
            >
                <div
                    className="w-[260px] h-[300px]"
                    style={{ clipPath: CLIP, backgroundColor: color, transition: 'background-color 0.6s ease' }}
                />
            </div>

            {/* Left edge line */}
            <motion.div
                className="absolute"
                style={{ left: '0px', top: lineTop, width: '3px', height: lineHeight, backgroundColor: effectiveBorderColor, zIndex: 4, opacity: 0.9 }}
            />

            {/* Right edge line */}
            <motion.div
                className="absolute"
                style={{ right: '0px', top: lineTop, width: '3px', height: lineHeight, backgroundColor: effectiveBorderColor, zIndex: 4, opacity: 0.9 }}
            />

            {/* Center line */}
            <motion.div
                className="absolute"
                style={{ left: '131.5px', top: lineCenterTop, width: '3px', height: lineHeight, backgroundColor: effectiveBorderColor, zIndex: 4, opacity: 0.9 }}
            />

            {/* Main hex — cascades last */}
            <motion.div
                className="absolute w-[266px] h-[306px] flex items-center justify-center"
                style={{ top: '0px', clipPath: CLIP, backgroundColor: effectiveBorderColor, zIndex: 5, y: liftY }}
                animate={{
                    filter: (pressed || selected)
                        ? `drop-shadow(0px 0px 8px ${glowColor})`
                        : (important && glowEnabled) ? `drop-shadow(0px 0px 15px ${glowColor})` : 'none'
                }}
                transition={{ duration: 0.4 }}
                onHoverStart={handleHoverStart}
                onHoverEnd={handleHoverEnd}
                onPointerDown={handlePressStart}
                onPointerUp={flip ? handlePressEndWithFlip : handlePressEnd}
                onPointerLeave={() => setTimeout(handlePressEnd, 100)}
                onTap={!flip ? handleTap : undefined}
            >
                <div
                    className="w-[260px] h-[300px] flex items-center justify-center"
                    style={{ clipPath: CLIP, backgroundColor: color, position: 'relative', overflow: 'hidden', transition: 'background-color 0.6s ease' }}
                >
                    <p className="font-['Inria_Serif'] font-bold italic text-center text-2xl px-10" style={{ color: data?.textColor || textColor }}>{label}</p>
                    {wip && (
                        <div style={{
                            position: 'absolute',
                            top: '200px',
                            right: '-25px',
                            width: '300px',
                            height: '30px',
                            backgroundColor: '#F59E0B',
                            color: '#000',
                            fontSize: '24px',
                            fontWeight: 'bold',
                            fontFamily: 'Inria Serif',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transform: 'rotate(0deg)',
                            letterSpacing: '0.2em',
                            zIndex: 10,
                        }}>
                            WIP
                        </div>
                    )}
                </div>
            </motion.div>

        </motion.div>
    )
}

function areEqual(prev, next) {
    return (
        prev.color       === next.color       &&
        prev.borderColor === next.borderColor &&
        prev.glowColor   === next.glowColor   &&
        prev.important   === next.important   &&
        prev.selected    === next.selected    &&
        prev.floating    === next.floating    &&
        prev.onClick     === next.onClick     &&
        (prev.visitedSet?.has(prev.data?.label)) === (next.visitedSet?.has(next.data?.label))
    )
}

export default memo(Hexagon, areEqual)
