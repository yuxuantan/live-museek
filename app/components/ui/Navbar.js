
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
        { href: '/seek-events', label: 'Events', icon: faSearch },
        { href: '/seek-buskers', label: 'Musicians', icon: faMusic },
        { href: '/seek-locations', label: 'Places', icon: faMapPin },
    ];
    if (showInsights) {
        navItems.push({ href: '/insights', label: 'Insights', icon: faChartColumn });
    }

    const isActive = (pathnameToMatch) => pathnameToMatch === '/'
        ? pathname === '/'
        : pathname.startsWith(pathnameToMatch);

    return (
        <>
            <nav aria-label="Mobile navigation" className="fixed inset-x-0 bottom-0 z-50 flex w-full justify-evenly border-t border-white/10 bg-[#090c19]/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 text-white backdrop-blur-xl md:hidden">
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        aria-current={isActive(item.href) ? 'page' : undefined}
                        className={`flex min-w-16 flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-slate-400 transition-colors hover:no-underline ${isActive(item.href) ? 'bg-white/10 text-fuchsia-200' : 'hover:text-white'}`}
                    >
                        <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                        <span className="text-[11px] font-semibold">{item.label}</span>
                    </Link>
                ))}
            </nav>

            <nav aria-label="Primary navigation" className="fixed inset-x-0 top-0 z-50 hidden border-b border-white/10 bg-[#090c19]/90 backdrop-blur-xl md:block">
                <div className="site-container flex h-20 items-center justify-between">
                    <Link href="/" aria-label="LiveMuseek home" className="flex items-center gap-3 text-white hover:no-underline">
                        <LiveMuseekLogo compact iconOnly />
                        <span className="text-lg font-black tracking-tight">LiveMuseek</span>
                    </Link>
                    <div className="flex items-center gap-1 text-sm font-semibold">
                        {navItems.filter((item) => item.href !== '/').map((item) => (
                            <Link
                                key={item.href}
                                href={item.href}
                                aria-current={isActive(item.href) ? 'page' : undefined}
                                className={`rounded-full px-4 py-2.5 transition-colors hover:no-underline ${isActive(item.href) ? 'bg-white/10 text-fuchsia-200' : 'text-slate-300 hover:bg-white/5 hover:text-white'}`}
                            >
                                {item.label}
                            </Link>
                        ))}
                        <Link href="/#about" className="rounded-full px-4 py-2.5 text-slate-300 transition-colors hover:bg-white/5 hover:text-white hover:no-underline">
                            About
                        </Link>
                    </div>
                </div>
            </nav>
        </>
    );
};

export default Navbar;
