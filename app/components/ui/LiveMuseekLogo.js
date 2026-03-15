'use client';

import { useId } from 'react';

const LiveMuseekLogo = ({ compact = false, iconOnly = false }) => {
  const gradientId = useId().replace(/:/g, '');
  const iconSizeClass = compact ? 'h-10 w-10' : 'h-12 w-12';
  const titleSizeClass = compact ? 'text-base' : 'text-xl';
  const badgeSizeClass = compact ? 'text-[9px] px-2 py-0.5' : 'text-[10px] px-2.5 py-1';
  const icon = (
    <svg
      viewBox="0 0 84 84"
      aria-hidden="true"
      className={`${iconSizeClass} shrink-0 drop-shadow-[0_12px_28px_rgba(248,36,174,0.28)]`}
    >
      <defs>
        <linearGradient id={`${gradientId}-bg`} x1="10" y1="8" x2="72" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1D2445" />
          <stop offset="0.48" stopColor="#11172E" />
          <stop offset="1" stopColor="#0A1020" />
        </linearGradient>
        <linearGradient id={`${gradientId}-pin`} x1="22" y1="16" x2="60" y2="68" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FF8A66" />
          <stop offset="0.55" stopColor="#F824AE" />
          <stop offset="1" stopColor="#7A5CFF" />
        </linearGradient>
        <radialGradient id={`${gradientId}-record`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(42 35) rotate(90) scale(17)">
          <stop offset="0" stopColor="#FFE8F6" />
          <stop offset="0.3" stopColor="#FFD2EA" />
          <stop offset="0.31" stopColor="#171D36" />
          <stop offset="0.68" stopColor="#0E1327" />
          <stop offset="1" stopColor="#070B16" />
        </radialGradient>
      </defs>

      <rect
        x="6"
        y="6"
        width="72"
        height="72"
        rx="22"
        fill={`url(#${gradientId}-bg)`}
        stroke="rgba(255,255,255,0.14)"
        strokeWidth="1.2"
      />
      <path
        d="M42 15C29.3 15 19.5 24.4 19.5 36.5C19.5 52.8 42 69.2 42 69.2C42 69.2 64.5 52.8 64.5 36.5C64.5 24.4 54.7 15 42 15Z"
        fill={`url(#${gradientId}-pin)`}
      />
      <path
        d="M42 18.8C31.4 18.8 23.4 26.7 23.4 36.5C23.4 48.7 39.5 61.7 42 63.7C44.5 61.7 60.6 48.7 60.6 36.5C60.6 26.7 52.6 18.8 42 18.8Z"
        fill="rgba(255,255,255,0.12)"
      />
      <circle cx="42" cy="35" r="16.2" fill={`url(#${gradientId}-record)`} />
      <circle cx="42" cy="35" r="10.5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.2" />
      <circle cx="42" cy="35" r="4.2" fill="#F8D4EA" />
      <circle cx="42" cy="35" r="1.7" fill="#101327" />
      <path
        d="M56.2 26.2C61 28.8 64 33.7 64 39.1"
        fill="none"
        stroke="#FFE0F1"
        strokeWidth="2.6"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path
        d="M59.8 21.2C66.3 24.8 70.4 31.5 70.4 39.1"
        fill="none"
        stroke="#7BE2FF"
        strokeWidth="2.4"
        strokeLinecap="round"
        opacity="0.92"
      />
      <path
        d="M27.4 23.5L30.1 18.5L33 23.5L38.1 26.1L33 28.8L30.1 33.8L27.4 28.8L22.4 26.1L27.4 23.5Z"
        fill="#FFE082"
        opacity="0.95"
      />
      <circle cx="61.8" cy="56.8" r="3.5" fill="#7BE2FF" opacity="0.9" />
    </svg>
  );

  if (iconOnly) {
    return icon;
  }

  return (
    <div className="flex items-center gap-3">
      {icon}

      <div className="min-w-0">
        <div className={`flex items-center gap-2 ${titleSizeClass} leading-none`}>
          <span className="font-black uppercase tracking-[0.2em] text-white">Live</span>
          <span className="font-black uppercase tracking-[0.12em] text-fuchsia-200">Museek</span>
          <span className={`rounded-full border border-fuchsia-300/35 bg-fuchsia-400/15 font-semibold uppercase tracking-[0.32em] text-fuchsia-100 ${badgeSizeClass}`}>
            Hub
          </span>
        </div>
      </div>
    </div>
  );
};

export default LiveMuseekLogo;
