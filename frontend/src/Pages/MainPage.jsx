import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {FaLinkedin, FaGithub, FaTwitter, FaInstagram, FaFacebook, FaTiktok} from 'react-icons/fa'
import { FaYoutube } from 'react-icons/fa6'
import { useNavigate } from 'react-router-dom'

const images = [
    '#BFEDC1',
    '#9DE7A3',
    '#AAACB0',
    '#BFC1C4',
    '#D5D6D8',
]

function MainPage() {
    const navigate = useNavigate()
    const [currentIndex, setCurrentIndex] = useState(0)

useEffect(() => {
    const interval = setInterval(() => {
        setCurrentIndex(prev => prev + 1)}, 6000)

        return () => clearInterval(interval) 

    }, [])

    return (

        <section className="flex h-[1024px] overflow-hidden">

            {/* The left container for pics*/}
            <div className="flex-1 h-[1024px] bg-[#EEFBEF]"></div>


            {/*Pictures*/}
            <div className="absolute top-[17%] right-[17%] overflow-hidden w-[1810px]"> 
                <motion.div
                    className="flex flex-row gap-[30px]"
                    animate={{ x: -currentIndex * (550 + 30) }}
                    transition={{ duration: 3.5, ease: 'linear' }}
                >
                    {[...Array(20)].flatMap(() => images).map((color, i) => (
                        <div
                            key={i}
                            className="w-[550px] h-[660px] rounded-[24px] border-[8px] border-[#D5D6D8] flex-shrink-0 flex items-center justify-center"
                            style={{ backgroundColor: color }}
                        >
                            <p className="font-['Inria_Serif'] font-bold italic text-3xl text-center text-black opacity-40">COOL PIC YAAAAAA</p>
                        </div>
                    ))}
                </motion.div>
            </div>


            {/* This is the right side. */}
            <div className="relative w-[640px] h-[1024px]">

                {/* And this should be the back */}
                <div className="absolute inset-0 bg-[#8AA891]"></div>

                {/* The middle */}
                <div className="absolute top-0 bottom-0 left-0 right-0 ml-auto w-[620px] bg-[#B6C9BB]"></div>

                {/* The Front */}
                <div className="absolute flex flex-col top-0 bottom-0 left-0 right-0 ml-auto w-[600px] bg-[#D0DCD3]">
                    {/*Learning about this stuff, but this should be the title */}
                    <h1 className="pt-[40px] font-extrabold text-5xl font-['Inria_Serif'] text-center">Gabriel's<br />Personal Website</h1>

                    <hr className="w-[80%] border-t border-[#8AA891] mx-auto top-2 mt-4" />

                    <p className="pt-[40px] font-light text-center px-20 italic font-['Inria_Serif'] text-2xl">Hello! This is my personal website that contains the projects I’m doing, alongside my talents, extracurricular activities and general information regarding me as a person. <br /> <br /> All of this website was created by me. The website will showcase and reflect over some of my general design language and preferred architecture over web development.  </p>
                
                   <h2 className="pt-[50px] font-bold italic font-['Inria_Serif'] text-3xl text-center">Links & Social Media</h2>
                
                {/* The social media icons */}
                
                <div className="absolute flex flex-row items-center justify-center gap-5 top-[63%] w-[600px]">

                    <a href ="https://www.linkedin.com/in/gabrielthelago" 
                    target="_blank" 
                    className="w-[80px] h-[80px] bg-[#8AA891] rounded-[24px] flex items-center justify-center  cursor-pointer"> 
                        <FaLinkedin size={60} className="justify-center text-black hover:text-[#EED6EB] transition-colors duration-900" />
                    </a>

                    <a className="w-[80px] h-[80px] bg-[#8AA891] rounded-[24px] flex items-center justify-center cursor-pointer"
                    href = "https://github.com/FrLagoSoft"
                    target = "_blank" >
                        
                        <FaGithub size={60} className="justify-center text-black hover:text-[#EED6EB] transition-colors duration-900" />
                    </a>

                    <a className="w-[80px] h-[80px] bg-[#8AA891] rounded-[24px] flex items-center justify-center cursor-pointer"
                    href = "https://instagram.com/lakesofit"
                    target = "_blank" >
                        <FaInstagram size={60} className="justify-center text-black hover:text-[#EED6EB] transition-colors duration-900" />
                    </a>

                    <a className="w-[80px] h-[80px] bg-[#8AA891] rounded-[24px] flex items-center justify-center cursor-pointer"
                    href = "https://www.youtube.com/channel/UCvvz4L3fBLfGAf9X3sVrN-g"
                    target = "_blank">
                        <FaYoutube size={60} className="justify-center text-black hover:text-[#EED6EB] transition-colors duration-900" />
                    </a>

                    <a className="w-[80px] h-[80px] bg-[#8AA891] rounded-[24px] flex items-center justify-center cursor-pointer"
                    href = "https://www.youtube.com/channel/UCvvz4L3fBLfGAf9X3sVrN-g"
                    target = "_blank">
                        <FaTiktok size={60} className="justify-center text-black hover:text-[#EED6EB] transition-colors duration-900" />
                    </a>

                </div>

                    {/* The Navigate Button */}
                    
                <div className="absolute flex flex-row items-center justify-center gap-5 top-[78%] w-[600px]"> 
                <button 
                onClick={() => navigate('/intro')}
                className="w-[200px] h-[100px] cursor-pointer bg-gradient-to-r from-[#A1BAA7] to-[#B6C9BB] rounded-[24px] border-4 border-[#D0DCD3] hover:border-[#97BA9F] transition-all duration-300">
                <p className="text-4xl italic font-['Inria_Serif'] font-bold">Dive in</p>
                </button>
                </div>

                </div>

                
                
            </div>

        </section>
    )
}
export default MainPage;
