import type { CSSProperties, ReactNode } from 'react';

export type IconName =
  | 'spark' | 'bolt' | 'chart' | 'pie' | 'search' | 'bell' | 'sparkles'
  | 'arrowRight' | 'arrowUp' | 'check' | 'plus' | 'minus' | 'sun' | 'moon'
  | 'twitter' | 'discord' | 'github' | 'instagram' | 'target' | 'book' | 'shield' | 'chat' | 'grid';

interface Props {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  style?: CSSProperties;
}

const PATHS: Record<IconName, ReactNode> = {
  spark: (
    <>
      <path d="M3 17 L8 11 L12 14 L17 7 L21 11" />
      <circle cx="21" cy="11" r="1.6" fill="currentColor" stroke="none" />
    </>
  ),
  bolt: <path d="M13 3 L5 14 H12 L11 21 L19 10 H12 L13 3 Z" />,
  chart: (
    <>
      <path d="M4 20 V6" />
      <path d="M4 20 H20" />
      <path d="M8 16 V12" />
      <path d="M12 16 V8" />
      <path d="M16 16 V14" />
    </>
  ),
  pie: (
    <>
      <path d="M12 3 A9 9 0 1 0 21 12 H12 Z" />
      <path d="M14 3.3 A9 9 0 0 1 20.7 10" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20 L16 16" />
    </>
  ),
  bell: (
    <>
      <path d="M6 16 H18 L17 14 V10 A5 5 0 0 0 7 10 V14 L6 16 Z" />
      <path d="M10 19 A2 2 0 0 0 14 19" />
    </>
  ),
  sparkles: (
    <>
      <path d="M12 3 L13.5 9.5 L20 11 L13.5 12.5 L12 19 L10.5 12.5 L4 11 L10.5 9.5 Z" />
      <path d="M19 4 L19.6 6 L21.6 6.6 L19.6 7.2 L19 9.2 L18.4 7.2 L16.4 6.6 L18.4 6 Z" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12 H19" />
      <path d="M13 6 L19 12 L13 18" />
    </>
  ),
  arrowUp: (
    <>
      <path d="M12 19 V5" />
      <path d="M6 11 L12 5 L18 11" />
    </>
  ),
  check: <path d="M5 12.5 L10 17 L19 7" />,
  plus: (
    <>
      <path d="M12 5 V19" />
      <path d="M5 12 H19" />
    </>
  ),
  minus: <path d="M5 12 H19" />,
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3 V5" /><path d="M12 19 V21" />
      <path d="M3 12 H5" /><path d="M19 12 H21" />
      <path d="M5.6 5.6 L7 7" /><path d="M17 17 L18.4 18.4" />
      <path d="M5.6 18.4 L7 17" /><path d="M17 7 L18.4 5.6" />
    </>
  ),
  moon: <path d="M20 14.5 A8 8 0 1 1 9.5 4 A6.5 6.5 0 0 0 20 14.5 Z" />,
  twitter: <path d="M4 4 L11 13 L4 20 H6 L12 14 L17 20 H20 L12.5 11 L19.5 4 H17.5 L11.5 10 L7 4 Z" fill="currentColor" stroke="none" />,
  discord: <path d="M7 8 C9 7 11 6.5 12 6.5 C13 6.5 15 7 17 8 C18.5 11 19 14 18.5 17 C17 18 15.5 18.5 14 19 L13 17.5 C13.8 17.3 14.5 17 15 16.5 M7 8 C5.5 11 5 14 5.5 17 C7 18 8.5 18.5 10 19 L11 17.5 C10.2 17.3 9.5 17 9 16.5 M10 13 A1 1 0 0 0 10 14 M14 13 A1 1 0 0 0 14 14" />,
  github: <path d="M12 3 A9 9 0 0 0 9 20.5 V18 C6 18.5 5.5 16.5 5.5 16.5 C5 15.5 4.5 15 4.5 15 C3.5 14.5 4.5 14.5 4.5 14.5 C5.5 14.5 6 15.5 6 15.5 C7 17 8.5 16.5 9 16.5 C9 15.8 9.3 15.3 9.7 15 C7.5 14.8 5.2 14 5.2 10.5 C5.2 9.5 5.6 8.7 6.1 8.1 C6 7.8 5.7 6.9 6.2 5.6 C6.2 5.6 7 5.3 9 6.5 A9 9 0 0 1 15 6.5 C17 5.3 17.8 5.6 17.8 5.6 C18.3 6.9 18 7.8 17.9 8.1 C18.4 8.7 18.8 9.5 18.8 10.5 C18.8 14 16.5 14.8 14.3 15 C14.7 15.4 15 16 15 17 V20.5 A9 9 0 0 0 12 3 Z" />,
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17" cy="7" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  book: (
    <>
      <path d="M4 5 C7 4 9 4.5 12 6 C15 4.5 17 4 20 5 V19 C17 18 15 18.5 12 20 C9 18.5 7 18 4 19 Z" />
      <path d="M12 6 V20" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 L20 6 V12 C20 16 16.5 19 12 21 C7.5 19 4 16 4 12 V6 Z" />
      <path d="M9 12 L11 14 L15 10" />
    </>
  ),
  chat: <path d="M4 18 V7 A3 3 0 0 1 7 4 H17 A3 3 0 0 1 20 7 V14 A3 3 0 0 1 17 17 H9 L4 21 Z" />,
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </>
  ),
};

export function Icon({ name, size = 18, stroke = 1.6, className, style }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
