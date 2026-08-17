import Link from 'next/link';
import {
  ArrowRight,
  CalendarDays,
  Mail,
  MapPin,
  Mic2,
  Music2,
  Sparkles,
} from 'lucide-react';

const discoveryLinks = [
  {
    href: '/seek-events',
    title: 'Find a performance',
    description: 'See who is playing, when they start, and where to catch them.',
    icon: CalendarDays,
    accent: 'from-fuchsia-500/20 to-pink-400/5',
  },
  {
    href: '/seek-buskers',
    title: 'Meet the musicians',
    description: 'Explore local performers and follow their upcoming schedules.',
    icon: Mic2,
    accent: 'from-violet-500/20 to-indigo-400/5',
  },
  {
    href: '/seek-locations',
    title: 'Explore live music spots',
    description: 'Browse busking locations and plan your next live music stop.',
    icon: MapPin,
    accent: 'from-cyan-500/20 to-sky-400/5',
  },
];

export default function HomePage() {
  return (
    <div className="overflow-hidden">
      <section className="hero-section relative isolate min-h-[calc(100svh-5rem)] overflow-hidden">
        <div className="absolute inset-0 bg-[url('/hero-image.jpg')] bg-cover bg-center" />
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,10,23,0.96)_0%,rgba(13,16,38,0.88)_48%,rgba(16,19,39,0.55)_100%)]" />
        <div className="absolute -left-28 top-16 h-80 w-80 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-96 w-96 rounded-full bg-violet-500/20 blur-3xl" />

        <div className="site-container relative flex min-h-[calc(100svh-5rem)] items-center py-20 sm:py-24">
          <div className="max-w-3xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white/90 backdrop-blur-md">
              <Sparkles className="h-4 w-4 text-fuchsia-300" aria-hidden="true" />
              Built for Singapore&apos;s live music community
            </div>
            <h1 className="max-w-3xl text-balance text-5xl font-black tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
              Know where the music is.
            </h1>
            <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-200 sm:text-xl">
              Discover live performances near you, explore local musicians, and find the next place worth stopping for.
            </p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <Link href="/seek-events" className="button-primary group">
                Explore live events
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
              </Link>
              <Link href="/seek-buskers" className="button-secondary">
                Browse musicians
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="discover-heading" className="relative py-20 sm:py-24">
        <div className="site-container">
          <div className="max-w-2xl">
            <p className="eyebrow">Start exploring</p>
            <h2 id="discover-heading" className="section-title">
              Live music, without the guesswork
            </h2>
            <p className="section-copy">
              Go straight to the schedule, the artist, or the place—whatever helps you decide what to see next.
            </p>
          </div>

          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {discoveryLinks.map(({ href, title, description, icon: Icon, accent }) => (
              <Link key={href} href={href} className="feature-card group">
                <div className={`absolute inset-0 bg-gradient-to-br ${accent} opacity-70 transition-opacity group-hover:opacity-100`} />
                <div className="relative">
                  <span className="mb-8 inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/10 text-fuchsia-200">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <h3 className="text-xl font-bold text-white">{title}</h3>
                  <p className="mt-3 leading-7 text-slate-300">{description}</p>
                  <span className="mt-7 inline-flex items-center gap-2 text-sm font-bold text-fuchsia-200">
                    Explore <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section id="about" aria-labelledby="about-heading" className="scroll-mt-24 border-y border-white/10 bg-white/[0.035] py-20 sm:py-24">
        <div className="site-container grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
          <div>
            <p className="eyebrow">About LiveMuseek</p>
            <h2 id="about-heading" className="section-title">
              A shared schedule for the live music community
            </h2>
            <p className="section-copy">
              LiveMuseek connects audiences with live music and gives musicians a place to share when and where they are performing. The goal is simple: make local performances easier to find and help artists stay connected with the people who want to hear them.
            </p>
            <div className="mt-7 inline-flex items-center gap-2 rounded-full border border-amber-300/25 bg-amber-300/10 px-4 py-2 text-sm font-semibold text-amber-100">
              <span className="h-2 w-2 rounded-full bg-amber-300" />
              Work in progress — features and information may change
            </div>
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <article className="info-card">
              <Music2 className="h-6 w-6 text-fuchsia-300" aria-hidden="true" />
              <h3 className="mt-6 text-xl font-bold text-white">For audiences</h3>
              <p className="mt-3 leading-7 text-slate-300">
                Find performances by date, musician, or location and spend less time searching for what is happening nearby.
              </p>
            </article>
            <article className="info-card">
              <Mic2 className="h-6 w-6 text-violet-300" aria-hidden="true" />
              <h3 className="mt-6 text-xl font-bold text-white">For musicians</h3>
              <p className="mt-3 leading-7 text-slate-300">
                Share your performance schedule in one discoverable place so audiences know where to find you next.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section aria-labelledby="creator-heading" className="py-20 sm:py-24">
        <div className="site-container">
          <div className="creator-panel">
            <div className="max-w-2xl">
              <p className="eyebrow">Behind the product</p>
              <h2 id="creator-heading" className="mt-3 text-3xl font-black tracking-tight text-white sm:text-4xl">
                Created by Jace
              </h2>
              <p className="mt-4 max-w-xl text-lg leading-8 text-slate-300">
                Interested in LiveMuseek, or in working together on Singapore&apos;s digital busking experience? I&apos;d be glad to hear from you.
              </p>
            </div>
            <a href="mailto:jacetyx@gmail.com" className="button-primary shrink-0">
              <Mail className="h-4 w-4" aria-hidden="true" />
              Contact Jace
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
