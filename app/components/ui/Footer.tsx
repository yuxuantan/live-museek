import Link from 'next/link';
import LiveMuseekLogo from './LiveMuseekLogo';

const Footer = () => (
  <footer className="border-t border-white/10 bg-[#090c19] pb-24 pt-12 md:pb-10">
    <div className="site-container">
      <div className="flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
        <div>
          <Link href="/" aria-label="LiveMuseek home" className="inline-flex hover:no-underline">
            <LiveMuseekLogo compact />
          </Link>
          <p className="mt-4 max-w-md text-sm leading-6 text-slate-400">
            Connecting audiences with live music and helping musicians share their performance schedules.
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-3 text-sm font-semibold text-slate-300">
          <Link href="/#about" className="transition-colors hover:text-white">About</Link>
          <Link href="/seek-events" className="transition-colors hover:text-white">Events</Link>
          <Link href="/seek-buskers" className="transition-colors hover:text-white">Musicians</Link>
          <a href="mailto:jacetyx@gmail.com" className="transition-colors hover:text-white">Contact</a>
        </div>
      </div>
      <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs leading-5 text-slate-500 md:flex-row md:items-center md:justify-between">
        <p>LiveMuseek is a work-in-progress product of Alphaquest Management Private Limited.</p>
        <p>Created by Jace · jacetyx@gmail.com</p>
      </div>
    </div>
  </footer>
);

export default Footer;
