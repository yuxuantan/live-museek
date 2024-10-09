
'use client'; // Mark this page as a client component if it manages state or effects
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faMusic, faUser, faMapPin, faHome } from '@fortawesome/free-solid-svg-icons';
import { useState } from 'react';


const Navbar = () => {
    const [showDropdown, setShowDropdown] = useState(false);
    const { user, logout } = useAuth();
    const pathname = usePathname();

    // Function to apply active styles
    const isActive = (pathnameToMatch) => pathname === pathnameToMatch ? 'underline' : '';

    return (
        <nav className="bg-gray-800 fixed top-0 inset-x-0">
            {/* Mobile Bottom Navbar */}
            <div className="md:hidden inset-x-0 bottom-0 bg-gray-800 text-white flex justify-evenly py-2 fixed w-full">
                <Link href="/" className={`flex flex-col items-center ${isActive('/')}`}>
                    <FontAwesomeIcon icon={faHome} size="lg" className="hover:text-red-500" />
                    <span className="text-xs">Home</span>
                </Link>
                <Link href="/seek-events" className={`flex flex-col items-center ${isActive('/seek-events')}`}>
                    <FontAwesomeIcon icon={faSearch} size="lg" className="hover:text-red-500" />
                    <span className="text-xs">Seek Events</span>
                </Link>
                <Link href="/seek-buskers" className={`flex flex-col items-center ${isActive('/seek-buskers')}`}>
                    <FontAwesomeIcon icon={faMusic} size="lg" className="hover:text-red-500" />
                    <span className="text-xs">Seek Buskers</span>
                </Link>
                <Link href="/seek-locations" className={`flex flex-col items-center ${isActive('/seek-locations')}`}>
                    <FontAwesomeIcon icon={faMapPin} size="lg" className="hover:text-red-500" />
                    <span className="text-xs">Locations</span>
                </Link>
                {/* {user ? (
                    <div className="relative">
                        {showDropdown && (
                            <div className="absolute bottom-10 right-0 mt-2 bg-black rounded-md shadow-lg">
                                <Link href="/profile" className={`block px-4 py-2 ${isActive('/profile')}`}>Profile</Link>
                                <button onClick={logout} className="block px-4 py-2 color-black">Logout</button>
                            </div>
                        )}
                        <button className="flex flex-col items-center" onClick={() => setShowDropdown(!showDropdown)}>
                            <FontAwesomeIcon icon={faUser} size="lg" className="hover:text-red-500" />
                            <span className="text-xs">Profile</span>
                        </button>
                    </div>
                ) : (
                    <Link href="/login" className={`flex flex-col items-center ${isActive('/login')}`}>
                        <FontAwesomeIcon icon={faUser} size="lg" className="" />
                        <span className="text-xs">Login</span>
                    </Link>
                )} */}
            </div>

            {/* Desktop Top Navbar */}
            <div className="hidden md:flex justify-between items-center p-4">
                <Link href="/" className="text-white text-3xl font-bold">Live Museek Hub</Link>
                <div className="space-x-4 flex items-center text-xl">
                    <Link href="/seek-events" className={`text-white ${isActive('/seek-events')}`}>Seek Events</Link>
                    <Link href="/seek-buskers" className={`text-white ${isActive('/seek-buskers')}`}>Seek Buskers</Link>
                    <Link href="/seek-locations" className={`text-white ${isActive('/seek-locations')}`}>Seek Locations</Link>
                    {/* placeholder login btn */}
                    {/* {user ? (
                        // profile
                        <div className="">
                            <button className="hover:underline" onMouseEnter={() => setShowDropdown(!showDropdown)}>
                                <FontAwesomeIcon icon={faUser} size="xl" className="px-4 hover:text-gray-500" />
                            </button>
                            {showDropdown && (
                                <div className="absolute right-2 mt-2 bg-black rounded-md shadow-lg">
                                    <Link href="/profile" className={`block px-4 py-2 ${isActive('/profile')}`}>Profile</Link>
                                    <button onClick={logout} className="block px-4 py-2 hover:underline">Logout</button>
                                </div>
                            )}
                        </div>
                    ) : (
                        <Link href="/login" className={`text-white ${isActive('/login')}`}>Login</Link>
                    )} */}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
