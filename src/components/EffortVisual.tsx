import type { CSSProperties } from 'react';
import { getEfforts, normalizeEffort, type Effort, type Speed } from '../lib/catalog';
import './effort-visual.css';

/** Local decorative effect. Future generations and Ultimate are fictional
 * presentation presets, independent of the actual model's capabilities. */
export function EffortVisual({ effort, speed, generation, progress }: {effort:Effort;speed:Speed;generation:number;progress?:number}) {
  const levels=getEfforts(generation);
  const level=Math.max(0,levels.indexOf(normalizeEffort(effort,generation)));
  const tier=generation>=10?10:generation>=9?9:generation>=8?8:generation>=7?7:6;
  const fraction=Math.max(0,Math.min(1,progress??level/(levels.length-1)));
  const count=level===0?0:Math.min(32,3+level*2+Math.max(0,tier-6)*3);
  const duration=Math.max(1.15,(7-level*.54)/Math.max(1,Math.log2(speed+1)*.55));
  const vars={'--ev-duration':`${duration}s`,'--ev-progress':fraction,'--ev-intensity':.45+level*.09} as CSSProperties;
  return <span aria-hidden="true" className="effort-visual" data-generation={tier} data-level={level} data-progress={fraction} data-effect={['','','','','','','drift','ribbon','lattice','orbit','corona'][tier]} style={vars}>
    <span className="effort-visual-field"/>
    <span className="effort-visual-pattern"/>
    <span className="effort-visual-flow"/>
    {tier===7&&<span className="effort-ribbons"><i/><i/></span>}
    {tier===9&&<span className="effort-orbits"><i/><i/></span>}
    {tier===10&&<span className="effort-corona"/>}
    {Array.from({length:count},(_,i)=>{
      const x=3+((i*43+19)%93),y=17+((i*31+13)%66);
      return <i key={i} className="effort-particle" style={{left:`${x}%`,top:`${y}%`,width:i%7===0?2.4:i%3===0?1.8:1.2,height:i%7===0?2.4:i%3===0?1.8:1.2,animationDelay:`${-((i*137)%780)/100}s`,'--ev-drift':`${9+(i%4)*4}px`,'--ev-lift':`${(i%3-1)*3}px`} as CSSProperties}/>;
    })}
    {tier>=8&&level>=3&&<span className="effort-visual-shimmer"/>}
  </span>;
}
