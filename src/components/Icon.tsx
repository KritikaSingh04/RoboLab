import type { Experiment } from '../experiments/registry';

type Name = Experiment['icon'];

interface Props {
  name: Name;
  className?: string;
}

/** Small inline SVG icons, one per experiment. Stroke follows `currentColor`. */
export default function Icon({ name, className = 'h-6 w-6' }: Props) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    viewBox: '0 0 24 24',
    'aria-hidden': true,
  };
  switch (name) {
    case 'screw':
      return (
        <svg {...common}>
          <path d="M12 3v18" />
          <path d="M7 7c3 1.5 7 1.5 10 0M7 11c3 1.5 7 1.5 10 0M7 15c3 1.5 7 1.5 10 0" />
          <path d="M12 3l-2 2M12 3l2 2" />
        </svg>
      );
    case 'scara':
      return (
        <svg {...common}>
          <circle cx="4" cy="19" r="2" />
          <path d="M4 17V8h7" />
          <path d="M11 8h7v5" />
          <path d="M18 13v7" />
          <circle cx="11" cy="8" r="1.5" />
        </svg>
      );
    case 'arm':
      return (
        <svg {...common}>
          <circle cx="4" cy="20" r="2" />
          <path d="M4 18l5-8" />
          <path d="M9 10l7 1" />
          <path d="M16 11l3-5" />
          <circle cx="19" cy="6" r="1.5" />
        </svg>
      );
    case 'path':
      return (
        <svg {...common}>
          <path d="M3 18c4 0 4-12 9-12s5 12 9 12" />
          <circle cx="3" cy="18" r="1.5" />
          <circle cx="21" cy="18" r="1.5" />
        </svg>
      );
    case 'dynamics':
      return (
        <svg {...common}>
          <path d="M12 4v4" />
          <circle cx="12" cy="4" r="1.5" />
          <path d="M12 8l5 9" />
          <circle cx="17" cy="17" r="2.5" />
          <path d="M8 12a6 6 0 0 0 0 0" />
          <path d="M9 7a5 5 0 0 1 6 0" strokeDasharray="2 2" />
        </svg>
      );
    case 'fuzzy':
      return (
        <svg {...common}>
          <path d="M3 18l4-10 4 10" />
          <path d="M9 18l4-10 4 10" />
          <path d="M13 18l4-10 4 10" />
          <path d="M3 18h18" />
        </svg>
      );
    case 'neural':
      return (
        <svg {...common}>
          <circle cx="4" cy="7" r="2" />
          <circle cx="4" cy="17" r="2" />
          <circle cx="12" cy="5" r="2" />
          <circle cx="12" cy="12" r="2" />
          <circle cx="12" cy="19" r="2" />
          <circle cx="20" cy="12" r="2" />
          <path d="M6 7l4-1M6 7l4 4M6 7l4 10M6 17l4-4M6 17l4 1M6 17l4-11M14 5l4 6M14 12h4M14 19l4-6" strokeWidth={1} />
        </svg>
      );
    case 'python':
      return (
        <svg {...common}>
          <path d="M9 3h6a2 2 0 0 1 2 2v4H9a2 2 0 0 0-2 2v2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h4z" />
          <path d="M15 21H9a2 2 0 0 1-2-2v-4h8a2 2 0 0 0 2-2v-2h2a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2h-4z" />
          <circle cx="11" cy="6" r="0.6" fill="currentColor" />
          <circle cx="13" cy="18" r="0.6" fill="currentColor" />
        </svg>
      );
    case 'cluster':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="1.5" />
          <circle cx="5" cy="11" r="1.5" />
          <circle cx="9" cy="11" r="1.5" />
          <circle cx="17" cy="6" r="1.5" />
          <circle cx="19" cy="10" r="1.5" />
          <circle cx="15" cy="10" r="1.5" />
          <circle cx="12" cy="18" r="1.5" />
          <circle cx="9" cy="20" r="1.5" />
          <circle cx="15" cy="20" r="1.5" />
          <path d="M7 10l0 0M17 8l0 0M12 19l0 0" strokeWidth={3} />
        </svg>
      );
    case 'obstacle':
      return (
        <svg {...common}>
          <rect x="3" y="14" width="7" height="6" rx="1.5" />
          <path d="M10 17h3" />
          <path d="M13 17l3-3M13 17l3 3" strokeDasharray="1.5 1.5" />
          <rect x="16" y="4" width="5" height="5" rx="1" />
          <circle cx="19" cy="15" r="2" />
        </svg>
      );
    case 'pipeline':
      return (
        <svg {...common}>
          <circle cx="5" cy="6" r="2" />
          <circle cx="12" cy="6" r="2" />
          <circle cx="19" cy="6" r="2" />
          <path d="M7 6h3M14 6h3" />
          <path d="M12 8v4" />
          <path d="M12 12l-6 6" />
          <path d="M6 18l4 1" />
          <rect x="14" y="15" width="6" height="5" rx="1" />
        </svg>
      );
    case 'line':
      return (
        <svg {...common}>
          <path d="M2 18c5 0 5-8 10-8s5 8 10 8" />
          <rect x="9" y="7" width="6" height="5" rx="1" />
          <path d="M10 12v2M14 12v2" />
        </svg>
      );
  }
}
