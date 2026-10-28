import { Sparkles, Zap } from 'lucide-react';
import type { Speed } from '../lib/catalog';

/** One shared decorative mark is used by the composer and reasoning popup. */
export function SpeedGlyph({ speed, size=14, showMultiplier=false }: {speed:Speed;size?:number;showMultiplier?:boolean}) {
  const count = speed === 1 || speed === 2 ? 1 : speed === 5 ? 2 : speed === 10 ? 3 : speed === 20 ? 4 : 3;
  return <span className="speed-glyph" data-speed-glyph={speed}>
    <span className="speed-symbol" aria-hidden="true">
      {speed === 50 && <Sparkles className="speed-sparkles" size={size} strokeWidth={1.5}/>}
      {Array.from({length:count},(_,i)=><Zap key={i} size={speed === 50 ? size*4/7 : count>1 ? size*5/7 : size} fill="currentColor" strokeWidth={1.5}/>)}
    </span>
    {showMultiplier && speed>1 && <span className="speed-multiplier">{speed}×</span>}
  </span>;
}
