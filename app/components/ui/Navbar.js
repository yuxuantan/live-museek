
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSearch, faMusic, faMapPin, faHome, faChartColumn } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useState } from 'react';
import LiveMuseekLogo from './LiveMuseekLogo';
import { isLocalhostHostname } from '../../refreshAccess';

const Navbar = () => {
    const pathname = usePathname();
    const [showInsights, setShowInsights] = useState(false);

    useEffect(() => {
        setShowInsights(isLocalhostHostname(window.location.hostname));
    }, []);

    const navItems = [
        { href: '/', label: 'Home', icon: faHome },
        { href: '/seek-events', label: 'Seek Events', icon: faSearch },
        { href: '/seek-buskers', label: 'Seek Buskers', icon: faMusic },
        { href: '/seek-locations', label: 'Locations', icon: faMapPin },
    ];
    if (showInsights) {
        navItems.push({ href: '/insights', label: 'Insights', icon: faChartColumn });
    }

    const isActive = (pathnameToMatch) => pathname === pathnameToMatch ? 'underline' : '';

    return (
        <nav className="bg-gray-800 fixed top-0 inset-x-0">
            <div className="md:hidden inset-x-0 bottom-0 bg-gray-800 text-white flex justify-evenly py-2 fixed w-full">
                {navItems.map((item) => (
                    <Link key={item.href} href={item.href} className={`flex flex-col items-center ${isActive(item.href)}`}>
                        <FontAwesomeIcon icon={item.icon} size="lg" className="hover:text-red-500" />
                        <span className="text-xs">{item.label}</span>
                    </Link>
                ))}
            </div>

            <div className="hidden md:flex justify-between items-center p-4">
                <Link href="/" className="flex items-center gap-3 text-white text-3xl font-bold hover:no-underline">
                    <LiveMuseekLogo compact iconOnly />
                    <span>Live Museek Hub</span>
                </Link>
                <div className="space-x-4 flex items-center text-xl">
                    {navItems.filter((item) => item.href !== '/').map((item) => (
                        <Link key={item.href} href={item.href} className={`text-white ${isActive(item.href)}`}>
                            {item.label}
                        </Link>
                    ))}
                </div>
            </div>
        </nav>
    );
};

export default Navbar;
