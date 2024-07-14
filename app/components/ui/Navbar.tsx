'use client'; // Mark this page as a client component if it manages state or effects

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import { useState } from 'react';

const Navbar = () => {
    const { user, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    // logout and redirect
    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut()
        logout();
        window.location.href = '/';
    };

    const pathname = usePathname();

    // Function to apply active styles
    const isActive = (pathnameToMatch: string) => pathname === pathnameToMatch ? 'underline' : '';
    return (
        <nav className="">
            <div className="">
                <div className="flex justify-between h-16 items-center">
                    <Link href="/" className="text-white text-4xl font-bold hover:text-gray-300 flex flex-row items-center">
                        <img src="/logo.png" alt="logo" className="h-10 w-10 mr-1" />
                        LiveMuseek
                    </Link>

                    <div className="flex md:hidden">
                        <button onClick={() => setIsOpen(!isOpen)} className="text-gray-300 hover:text-white focus:outline-none focus:text-white">
                            <svg className="h-6 w-6" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                {isOpen ? (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                                ) : (
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
                                )}
                            </svg>
                        </button>
                    </div>

                    <div className="hidden md:flex md:items-center md:space-x-4">
                        {user ? (
                            <>
                                <Link href="/musician" className={`px-3 py-2 rounded text-sm font-medium text-gray-100 ${isActive('/musician')}`}>
                                    Edit profile
                                </Link>
                                <Link href="/musician/edit-events" className={`px-3 py-2 rounded text-sm font-medium text-gray-100 ${isActive('/musician/edit-events')}`}>
                                    Create events
                                </Link>
                                <Link href="/update-password" className={`px-3 py-2 rounded text-sm font-medium text-gray-100 ${isActive('/update-password')}`}>
                                    Update password
                                </Link>
                                <button onClick={handleLogout} className="px-3 py-2 rounded text-sm font-medium text-gray-100">
                                    Logout
                                </button>
                            </>
                        ) : (
                            <>
                                <Link href="/seek-events" className={`px-3 py-2 rounded text-sm font-medium text-gray-100 ${isActive('/seek-events')}`}>
                                    Seek Events
                                </Link>
                                <Link href="/seek-musicians" className={`px-3 py-2 rounded text-sm font-medium text-gray-100 ${isActive('/seek-musicians')}`}>
                                    Seek Musicians
                                </Link>
                                <Link href="/login" className={`px-3 py-2 rounded text-sm font-medium text-gray-100 ${isActive('/login')}`}>
                                    Login/ Signup
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {isOpen && (
                <div className="fixed inset-0 z-40 bg-gray-800 bg-opacity-75 flex flex-col items-end">
                    <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => setIsOpen(false)}></div>
                    <div className="relative z-50 p-4 w-full max-w-xs bg-gray-800 text-white">
                        {user ? (
                            <>
                                <Link href="/musician" className={`block px-3 py-2 rounded text-sm font-medium ${isActive('/musician')}`} onClick={() => setIsOpen(false)}>
                                    Edit profile
                                </Link>
                                <Link href="/musician/edit-events" className={`block px-3 py-2 rounded text-sm font-medium ${isActive('/musician/edit-events')}`} onClick={() => setIsOpen(false)}>
                                    Create events
                                </Link>
                                <Link href="/update-password" className={`block px-3 py-2 rounded text-sm font-medium ${isActive('/update-password')}`} onClick={() => setIsOpen(false)}>
                                    Update password
                                </Link>
                                <button onClick={() => { handleLogout(); setIsOpen(false); }} className="block w-full text-left px-3 py-2 rounded text-sm font-medium">
                                    Logout
                                </button>
                            </>
                        ) : (
                            <>
                                <Link href="/seek-events" className={`block px-3 py-2 rounded text-sm font-medium ${isActive('/seek-events')}`} onClick={() => setIsOpen(false)}>
                                    Seek Events
                                </Link>
                                <Link href="/seek-musicians" className={`block px-3 py-2 rounded text-sm font-medium ${isActive('/seek-musicians')}`} onClick={() => setIsOpen(false)}>
                                    Seek Musicians
                                </Link>
                                <Link href="/login" className={`block px-3 py-2 rounded text-sm font-medium ${isActive('/login')}`} onClick={() => setIsOpen(false)}>
                                    Login/ Signup
                                </Link>
                            </>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
};

export default Navbar;
