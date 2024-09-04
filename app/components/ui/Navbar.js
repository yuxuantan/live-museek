'use client'; // Mark this page as a client component if it manages state or effects

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../supabaseClient';
import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faMusic, faUser } from '@fortawesome/free-solid-svg-icons';

const Navbar = () => {
    const { user, logout } = useAuth();
    const [isOpen, setIsOpen] = useState(false);

    // logout and redirect
    const handleLogout = async () => {
        const { error } = await supabase.auth.signOut();
        logout();
        window.location.href = '/';
    };

    const pathname = usePathname();

    // Function to apply active styles
    const isActive = (pathnameToMatch) => pathname === pathnameToMatch ? 'underline' : '';

    return (
        <nav className="bg-gray-800">

            {/* Mobile Bottom Navbar */}
            <div className="md:hidden fixed inset-x-0 bottom-0 bg-gray-800 text-white flex justify-around py-2">
                <Link href="/seek-events" className={`flex flex-col items-center ${isActive('/seek-events')}`}>
                    <FontAwesomeIcon icon={faSearch} size="lg" />
                    <span className="text-xs">Seek Events</span>
                </Link>
                <Link href="/seek-musicians" className={`flex flex-col items-center ${isActive('/seek-musicians')}`}>
                    <FontAwesomeIcon icon={faMusic} size="lg" />
                    <span className="text-xs">Seek Musicians</span>
                </Link>
                <Link href="/login" className={`flex flex-col items-center ${isActive('/login')}`}>
                    <FontAwesomeIcon icon={faUser} size="lg" />
                    <span className="text-xs">Login</span>
                </Link>
            </div>
        </nav>
    );
};

export default Navbar;
