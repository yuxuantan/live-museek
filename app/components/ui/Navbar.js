
'use client'; // Mark this page as a client component if it manages state or effects
import Link from 'next/link';
import { usePathname } from 'next/navigation';
// import { useAuth } from '../../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faMusic, faUser } from '@fortawesome/free-solid-svg-icons';




const Navbar = () => {
    
    const pathname = usePathname();

    // Function to apply active styles
    const isActive = (pathnameToMatch) => pathname === pathnameToMatch ? 'underline text-red-500' : '';

    return (
        <nav className="bg-gray-800 fixed top-0 inset-x-0">
            {/* Mobile Bottom Navbar */}
            <div className="md:hidden inset-x-0 bottom-0 bg-gray-800 text-white flex justify-evenly py-2 fixed w-full">
            <Link href="/seek-events" className={`flex flex-col items-center ${isActive('/seek-events')}`}>
                <FontAwesomeIcon icon={faSearch} size="lg" />
                <span className="text-xs">Seek Events</span>
            </Link>
            <Link href="/seek-buskers" className={`flex flex-col items-center ${isActive('/seek-buskers')}`}>
                <FontAwesomeIcon icon={faMusic} size="lg" />
                <span className="text-xs">Seek Buskers</span>
            </Link>
            <Link href="#" className={`flex flex-col items-center ${isActive('/login')}`}>
                <FontAwesomeIcon icon={faUser} size="lg" />
                <span className="text-xs">Login</span>
            </Link>
            </div>  

            {/* Desktop Top Navbar */}
            <div className="hidden md:flex justify-between items-center p-4">
                <Link href="/" className="text-white text-2xl font-bold">Live Museek Hub</Link>
                <div className="space-x-4">
                    <Link href="/seek-events" className={`text-white ${isActive('/seek-events')}`}>Seek Events</Link>
                    <Link href="/seek-buskers" className={`text-white ${isActive('/seek-buskers')}`}>Seek Buskers</Link>
                    {/* placeholder login btn */}
                    <Link href="/login" className={`text-white ${isActive('/login')}`}>Login</Link>

                </div>
            </div>
        </nav>
        );
};

export default Navbar;
