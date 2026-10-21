import { useState } from 'react';

export type IllustrationId = 'hero' | 'screw' | 'scara' | 'ik3dof' | 'trajectory' | 'dynamics' | 'fuzzy' | 'neural' | 'linreg' | 'kmeans' | 'obstacle' | 'linefollower' | 'pipeline';

interface Props {
  id: IllustrationId | string;
  className?: string;
  alt?: string;
}

const C = { ink: '#1C1B19', cobalt: '#2F5FD0', tomato: '#E5533D', mustard: '#F2B33D', leaf: '#3F9B57', paper: '#FFFFFF', beige: '#EFEBE3' };
const S = { stroke: C.ink, strokeWidth: 4, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const hatch = (x: number, y: number, n = 4, len = 10, gap = 5) => Array.from({ length: n }, (_, i) => <line key={i} x1={x + i * gap} y1={y} x2={x + i * gap - len * 0.5} y2={y + len} stroke={C.ink} strokeWidth={1.8} strokeLinecap="round" />);

/** Hand-drawn-style fallback drawings, one per experiment (viewBox 200 × 160). */
function Fallback({ id }: { id: string }) {
  switch (id) {
    case 'hero':
      return (
        <g {...S}>
          <rect x="28" y="120" width="60" height="14" rx="4" fill={C.beige} />
          <line x1="58" y1="120" x2="80" y2="62" stroke={C.cobalt} strokeWidth="11" />
          <line x1="80" y1="62" x2="132" y2="48" stroke={C.tomato} strokeWidth="9" />
          <circle cx="58" cy="120" r="7" fill={C.paper} />
          <circle cx="80" cy="62" r="6" fill={C.paper} />
          <path d="M132 48 l14 -10 M132 48 l14 10" stroke={C.ink} strokeWidth="5" />
          <circle cx="164" cy="48" r="16" fill={C.mustard} />
          <path d="M156 48 h16 M164 40 v16" stroke={C.ink} strokeWidth="2.5" />
          <circle cx="164" cy="48" r="24" fill="none" strokeDasharray="4 6" strokeWidth="2" />
          {hatch(34, 123, 4, 8, 6)}
          <path d="M20 140 h160" strokeWidth="3" />
        </g>
      );
    case 'screw':
      return (
        <g {...S}>
          <rect x="84" y="20" width="32" height="112" rx="10" fill={C.beige} />
          <path d="M84 44 q16 10 32 0 M84 64 q16 10 32 0 M84 84 q16 10 32 0 M84 104 q16 10 32 0" strokeWidth="3" />
          <path d="M100 132 l-14 -10 h28 z" fill={C.cobalt} />
          <path d="M140 60 a 40 40 0 1 1 -8 -32" fill="none" stroke={C.tomato} strokeWidth="5" />
          <path d="M132 24 l6 8 l-10 2 z" fill={C.tomato} stroke={C.tomato} />
          <line x1="100" y1="8" x2="100" y2="20" stroke={C.mustard} strokeWidth="6" />
          {hatch(88, 26, 3, 7, 7)}
        </g>
      );
    case 'scara':
      return (
        <g {...S}>
          <rect x="22" y="118" width="46" height="18" rx="5" fill={C.beige} />
          <rect x="38" y="42" width="14" height="80" rx="4" fill={C.beige} />
          <line x1="45" y1="48" x2="110" y2="48" stroke={C.cobalt} strokeWidth="12" />
          <line x1="110" y1="48" x2="164" y2="66" stroke={C.tomato} strokeWidth="10" />
          <circle cx="110" cy="48" r="7" fill={C.paper} />
          <line x1="164" y1="66" x2="164" y2="118" stroke={C.leaf} strokeWidth="7" />
          <path d="M156 118 h16 M158 118 v10 M170 118 v10" strokeWidth="4" />
          <circle cx="164" cy="136" r="5" fill={C.mustard} />
          {hatch(26, 121, 4, 8, 7)}
        </g>
      );
    case 'ik3dof':
      return (
        <g {...S}>
          <circle cx="40" cy="130" r="9" fill={C.beige} />
          <line x1="40" y1="130" x2="70" y2="70" stroke={C.cobalt} strokeWidth="11" />
          <line x1="70" y1="70" x2="128" y2="60" stroke={C.tomato} strokeWidth="9" />
          <line x1="128" y1="60" x2="150" y2="36" stroke={C.leaf} strokeWidth="7" />
          <circle cx="70" cy="70" r="6" fill={C.paper} />
          <circle cx="128" cy="60" r="6" fill={C.paper} />
          <circle cx="156" cy="30" r="14" fill="none" stroke={C.mustard} strokeWidth="5" />
          <path d="M156 10 v10 M156 40 v10 M136 30 h10 M166 30 h10" stroke={C.mustard} strokeWidth="4" />
          <path d="M40 150 h120" strokeWidth="3" />
          {hatch(60, 142, 5, 7, 8)}
        </g>
      );
    case 'trajectory':
      return (
        <g {...S}>
          <path d="M24 120 C 60 20, 110 150, 172 44" fill="none" stroke={C.cobalt} strokeWidth="6" />
          <path d="M172 44 l-16 2 M172 44 l-4 16" stroke={C.cobalt} strokeWidth="6" />
          <circle cx="24" cy="120" r="9" fill={C.leaf} />
          <circle cx="66" cy="60" r="7" fill={C.mustard} />
          <circle cx="110" cy="108" r="7" fill={C.mustard} />
          <circle cx="150" cy="70" r="7" fill={C.tomato} />
          <path d="M24 140 h150" strokeWidth="3" strokeDasharray="6 6" />
          {hatch(120, 128, 4, 8, 7)}
        </g>
      );
    case 'dynamics':
      return (
        <g {...S}>
          <path d="M60 22 h80" strokeWidth="5" />
          {hatch(66, 10, 8, 10, 10)}
          <circle cx="100" cy="24" r="7" fill={C.paper} />
          <line x1="100" y1="24" x2="140" y2="100" stroke={C.cobalt} strokeWidth="10" />
          <circle cx="146" cy="110" r="16" fill={C.tomato} />
          <path d="M100 24 a 60 60 0 0 1 12 60" fill="none" strokeDasharray="4 6" strokeWidth="2.5" />
          <path d="M46 60 v50 M46 110 l-8 -12 M46 110 l8 -12" stroke={C.leaf} strokeWidth="5" />
          <text x="34" y="54" fontFamily="IBM Plex Mono, monospace" fontSize="14" fill={C.ink} stroke="none">g</text>
        </g>
      );
    case 'fuzzy':
      return (
        <g {...S}>
          <path d="M20 130 h160" strokeWidth="3" />
          <path d="M24 130 l40 -84 l40 84" fill={C.cobalt} fillOpacity="0.85" />
          <path d="M60 130 l40 -84 l40 84" fill={C.mustard} fillOpacity="0.85" />
          <path d="M96 130 l40 -84 l40 84" fill={C.tomato} fillOpacity="0.85" />
          <line x1="104" y1="40" x2="104" y2="130" strokeDasharray="5 5" strokeWidth="2.5" />
          <circle cx="104" cy="92" r="6" fill={C.leaf} />
          {hatch(24, 136, 6, 6, 10)}
        </g>
      );
    case 'neural':
      return (
        <g {...S}>
          {[[36, 50], [36, 110], [100, 36], [100, 80], [100, 124], [164, 80]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="13" fill={i < 2 ? C.beige : i === 5 ? C.tomato : C.cobalt} />
          ))}
          {[[36, 50, 100, 36], [36, 50, 100, 80], [36, 50, 100, 124], [36, 110, 100, 36], [36, 110, 100, 80], [36, 110, 100, 124], [100, 36, 164, 80], [100, 80, 164, 80], [100, 124, 164, 80]].map(([a, b, c, d], i) => (
            <line key={i} x1={a} y1={b} x2={c} y2={d} strokeWidth={i % 3 === 0 ? 4 : 2} stroke={i % 2 ? C.ink : C.mustard} />
          ))}
        </g>
      );
    case 'linreg':
      return (
        <g {...S}>
          <path d="M24 136 v-116 M24 136 h152" strokeWidth="3" />
          {[[44, 110], [64, 100], [84, 104], [104, 84], [124, 70], [144, 72], [160, 52]].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="6" fill={i % 2 ? C.cobalt : C.mustard} />
          ))}
          <line x1="36" y1="120" x2="170" y2="46" stroke={C.tomato} strokeWidth="5" />
          {hatch(130, 122, 4, 7, 8)}
          <text x="150" y="34" fontFamily="IBM Plex Mono, monospace" fontSize="13" fill={C.ink} stroke="none">y=mx+c</text>
        </g>
      );
    case 'kmeans':
      return (
        <g {...S}>
          {[[50, 56], [60, 42], [40, 44], [56, 70], [36, 62]].map(([x, y], i) => <circle key={'a' + i} cx={x} cy={y} r="6" fill={C.cobalt} />)}
          {[[130, 50], [146, 40], [150, 60], [134, 68], [120, 60]].map(([x, y], i) => <circle key={'b' + i} cx={x} cy={y} r="6" fill={C.tomato} />)}
          {[[90, 116], [106, 110], [100, 130], [82, 128], [112, 126]].map(([x, y], i) => <circle key={'c' + i} cx={x} cy={y} r="6" fill={C.leaf} />)}
          {[[48, 55], [136, 55], [98, 122]].map(([x, y], i) => <path key={'x' + i} d={`M${x - 9} ${y - 9} l18 18 M${x + 9} ${y - 9} l-18 18`} strokeWidth="5" />)}
          <circle cx="48" cy="55" r="26" fill="none" strokeDasharray="4 5" strokeWidth="2" />
          <circle cx="136" cy="55" r="26" fill="none" strokeDasharray="4 5" strokeWidth="2" />
          <circle cx="98" cy="122" r="26" fill="none" strokeDasharray="4 5" strokeWidth="2" />
        </g>
      );
    case 'obstacle':
      return (
        <g {...S}>
          <circle cx="60" cy="96" r="26" fill={C.cobalt} />
          <circle cx="60" cy="96" r="7" fill={C.paper} />
          <path d="M60 96 h26" strokeWidth="5" />
          <path d="M86 90 l50 -40 M86 96 h60 M86 102 l50 40" stroke={C.mustard} strokeWidth="3" strokeDasharray="6 5" />
          <rect x="136" y="26" width="36" height="30" rx="4" fill={C.beige} />
          <circle cx="156" cy="96" r="12" fill={C.tomato} />
          <rect x="138" y="124" width="34" height="24" rx="4" fill={C.beige} />
          {hatch(140, 30, 4, 8, 8)}
          {hatch(142, 128, 4, 8, 8)}
        </g>
      );
    case 'linefollower':
      return (
        <g {...S}>
          <path d="M14 112 C 60 60, 100 160, 186 92" fill="none" strokeWidth="9" />
          <rect x="74" y="78" width="52" height="36" rx="8" fill={C.tomato} />
          <rect x="70" y="86" width="8" height="20" rx="2" fill={C.ink} />
          <rect x="122" y="86" width="8" height="20" rx="2" fill={C.ink} />
          <circle cx="86" cy="118" r="5" fill={C.mustard} />
          <circle cx="100" cy="118" r="5" fill={C.mustard} />
          <circle cx="114" cy="118" r="5" fill={C.mustard} />
          <path d="M100 78 v-14 M92 64 h16" stroke={C.cobalt} strokeWidth="4" />
        </g>
      );
    case 'pipeline':
      return (
        <g {...S}>
          <path d="M20 136 h160" strokeWidth="3" />
          <line x1="48" y1="130" x2="70" y2="70" stroke={C.cobalt} strokeWidth="11" />
          <line x1="70" y1="70" x2="124" y2="86" stroke={C.tomato} strokeWidth="9" />
          <circle cx="48" cy="130" r="8" fill={C.beige} />
          <circle cx="70" cy="70" r="6" fill={C.paper} />
          <path d="M124 86 l10 12 M124 86 l-2 16" strokeWidth="5" />
          {[[150, 118], [160, 110], [168, 122], [156, 128]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r="5" fill={C.leaf} />)}
          <path d="M20 60 h40 v30 h-40 z" fill={C.mustard} />
          {hatch(24, 64, 4, 8, 8)}
        </g>
      );
    default:
      return (
        <g {...S}>
          <rect x="50" y="40" width="100" height="80" rx="12" fill={C.beige} />
          {hatch(58, 48, 5, 10, 10)}
        </g>
      );
  }
}

/**
 * Experiment illustration: loads /illustrations/<id>.png and falls back to a
 * hand-drawn-style SVG with a subtle displacement filter when the file is missing.
 */
export default function Illustration({ id, className = '', alt = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
  if (!failed) return <img src={`${base}illustrations/${id}.png`} alt={alt} className={['object-contain', className].join(' ')} onError={() => setFailed(true)} draggable={false} />;
  const fid = `sketch-${id}`;
  return (
    <svg viewBox="0 0 200 160" className={className} role="img" aria-label={alt || id}>
      <defs>
        <filter id={fid} x="-5%" y="-5%" width="110%" height="110%">
          <feTurbulence type="fractalNoise" baseFrequency="0.035" numOctaves="2" seed="7" result="noise" />
          <feDisplacementMap in="SourceGraphic" in2="noise" scale="2.2" xChannelSelector="R" yChannelSelector="G" />
        </filter>
      </defs>
      <g filter={`url(#${fid})`}>
        <Fallback id={id} />
      </g>
    </svg>
  );
}
