'use client'; // Mark this page as a client component if it manages state or effects

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const Navbar = () => {
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
                    <div className="space-x-4">
                        <Link href="/events" className={`px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 text-gray-300 ${isActive('/events')}`}>
                            Events
                        </Link>
                        <Link href="/musicians" className={`px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 text-gray-300 ${isActive('/musicians')}`}>
                            Musicians
                        </Link>
                        <Link href="/events/create" className={`px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 text-gray-300 ${isActive('/events/create')}`}>
                            Create Event
                        </Link>
                    </div>
                    <Link href="/login" className="px-3 py-2 rounded text-sm font-medium hover:bg-blue-700">
                        Login
                    </Link>
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
