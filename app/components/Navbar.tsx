'use client'; // Mark this page as a client component if it manages state or effects

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../contexts/AuthContext';

const Navbar = () => {
    const { isLoggedIn, login, logout } = useAuth();

    // logout and redirect
    const handleLogout = () => {
        logout();
        window.location.href = '/';
    };

    const pathname = usePathname();

    // Function to apply active styles
    const isActive = (pathnameToMatch) => pathname === pathnameToMatch ? 'bg-blue-900' : '';

    return (
        <nav className="bg-blue-800 text-white shadow-lg">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                    <Link href="/" className="text-white text-lg font-bold hover:text-gray-300">
                        Live Music Hub
                    </Link>
                    {isLoggedIn ? (
                        <>
                            <div className="space-x-4">
                                <Link href="/musicians/dashboard" className={`px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 text-gray-100 ${isActive('/musicians/dashboard')}`}>
                                    Edit profile
                                </Link>
                                <Link href="/events/create" className={`px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 text-gray-100 ${isActive('/events/create')}`}>
                                    Create events
                                </Link>
                            </div>
                            <button onClick={handleLogout} className="hover:bg-blue-700 px-3 py-2 rounded text-sm font-medium">
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="space-x-4">

                                <Link href="/events" className={`px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 text-gray-100 ${isActive('/events')}`}>
                                    Events
                                </Link>
                                <Link href="/musicians" className={`px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 text-gray-100 ${isActive('/musicians')}`}>
                                    Search Musicians
                                </Link>
                            </div>
                            <Link href="/musicians/login" className="px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 text-gray-300">
                                Musician Login
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
