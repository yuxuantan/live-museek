'use client'; // Mark this page as a client component if it manages state or effects

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';

const Navbar = () => {
    const { user, logout} = useAuth();

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
            {/* add public/logo.png */}
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div className="flex justify-between h-16 items-center">
                    <Link href="/" className="text-white text-lg font-bold hover:text-gray-300 flex flex-row items-center">
                        <img src="/logo.png" alt="logo" className="h-10 w-10 mr-1" />
                        Live Music Hub
                    </Link>
                    
                    {user ? (
                        <>
                            <div className="space-x-4">
                                <Link href="/musician" className={`px-3 py-2 rounded text-sm font-medium text-gray-100 ${isActive('/musician')}`}>
                                    Edit profile
                                </Link>
                                <Link href="/musician/edit-events" className={`px-3 py-2 rounded text-sm font-medium text-gray-100 ${isActive('/musician/edit-events')}`}>
                                    Create events
                                </Link>
                                {/* update password */}
                                <Link href="/update-password" className={`px-3 py-2 rounded text-sm font-medium text-gray-100 ${isActive('/update-password')}`}>
                                    Update password
                                </Link>
                            </div>
                            <button onClick={handleLogout} className="px-3 py-2 rounded text-sm font-medium">
                                Logout
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="space-x-4">

                                <Link href="/discover-events" className={`px-3 py-2 rounded text-sm font-medium text-gray-100 ${isActive('/discover-events')}`}>
                                    Events
                                </Link>
                                <Link href="/discover-musicians" className={`px-3 py-2 rounded text-sm font-medium text-gray-100 ${isActive('/discover-musicians')}`}>
                                    Search Musicians
                                </Link>
                            </div>
                            <Link href="/login" className={`px-3 py-2 rounded text-sm font-medium text-gray-300 underline-offset-8 ${isActive('/login')}`}>
                                Login
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
