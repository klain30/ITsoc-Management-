import { cn } from '@/lib/cn';

/*
 * Decorative circuit traces in the style of the ITSoc cover photo: straight
 * runs with 45° bends, ending in nodes. Drawn in currentColor so the caller
 * sets the hue and opacity; a few nodes pulse like the cover's lit dots.
 */
const TRACES = [
  'M0 40 H120 L150 70 H260',
  'M40 0 V30 L70 60 V120',
  'M0 150 H60 L90 120 H180 L210 150 H330',
  'M200 0 V40 L230 70 H400',
  'M400 120 H320 L290 90 V30',
  'M120 200 V170 L150 140 H230',
  'M260 200 V180 L290 150 H400',
  'M340 0 V20 L360 40 H400',
];

const NODES: { x: number; y: number; lit?: boolean; delay?: number }[] = [
  { x: 260, y: 70, lit: true },
  { x: 70, y: 120 },
  { x: 330, y: 150, lit: true, delay: 1.1 },
  { x: 290, y: 30 },
  { x: 230, y: 140, lit: true, delay: 2.2 },
  { x: 120, y: 40 },
  { x: 180, y: 120 },
  { x: 360, y: 40, lit: true, delay: 0.6 },
];

export function CircuitPattern({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 400 200" preserveAspectRatio="xMaxYMid slice" fill="none" aria-hidden className={cn('pointer-events-none', className)}>
      <g stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" opacity="0.55">
        {TRACES.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      {NODES.map((node) => (
        <circle
          key={`${node.x}-${node.y}`}
          cx={node.x}
          cy={node.y}
          r={node.lit ? 3.5 : 2.5}
          fill="currentColor"
          className={node.lit ? 'animate-node' : undefined}
          style={node.lit && node.delay ? { animationDelay: `${node.delay}s` } : undefined}
        />
      ))}
    </svg>
  );
}
