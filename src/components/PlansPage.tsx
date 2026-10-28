import { useRef, useState } from 'react';
import { ArrowLeft, Check, Sparkles, MessageCircle, Images, Brain, AudioLines, Megaphone, BriefcaseBusiness, GitBranch, CircleDollarSign, Telescope, Orbit, RefreshCw, SlidersHorizontal, Minus, Square, X } from 'lucide-react';
import { PLANS, type Language } from '../lib/catalog';
import CodexGlyph from './CodexGlyph';
import './plans-page.css';

export default function PlansPage({language,currentPlan,onBuy,onClose}:{language:Language;currentPlan:string;onBuy:(id:string)=>void;onClose:()=>void}){
  const [tier,setTier]=useState('pro-100'),[section,setSection]=useState<'reference'|'fictional'>('reference');const concept=useRef<HTMLElement>(null),reference=useRef<HTMLDivElement>(null);
  const t=(zh:string,en:string)=>language==='zh'?zh:en;
  const icons=[MessageCircle,Images,Brain,AudioLines,Megaphone,GitBranch,BriefcaseBusiness,CircleDollarSign,Check];
  const proIcons=[Telescope,Orbit,CodexGlyph,Brain,RefreshCw,SlidersHorizontal,Check];
  function card(id:string){const p=PLANS.find(p=>p.id===id)!;const pro=id.startsWith('pro-')&&!p.fictional;
    const headline=p.fictional?p.name:id==='go'?t('更多使用权限','More access'):id==='plus'?t('你的 AI 助手','Your AI assistant'):t('前沿智能','Frontier intelligence');
    const subtitle=p.fictional?p.description[language]:id==='go'?t('使用更多核心智能额度，写作、了解、创建和聊天都更多。','More core intelligence for writing, learning, creating, and chatting.'):id==='plus'?t('不止于对话，让 AI 在你喜爱的应用中与你一起执行操作。','Go beyond conversation with an AI assistant for your work.'):t('面向在整个工作日都依赖我们最强智能的用户。','For those who rely on powerful intelligence throughout the day.');
    return <article key={id} className={`replica-plan ${pro?'pro-plan':''} ${p.fictional?'concept-plan':''}`} data-testid={`plan-${p.id}`}>
      <div className="replica-plan-top"><h2>{pro?'Pro':p.name}</h2>{pro&&<div className="pro-tiers" aria-label={t('Pro 档位','Pro tier')}>{['pro-100','pro-200','pro-500'].map(id=><button key={id} aria-label={`Pro ${id.split('-')[1]}`} aria-pressed={tier===id} className={tier===id?'active':''} onClick={()=>setTier(id)}>{id.split('-')[1]}</button>)}</div>}{p.fictional&&<span className="fictional-label">{t('虚构','FICTIONAL')}</span>}</div>
      <h3>{headline}</h3><p className="replica-plan-summary">{subtitle}</p>
      <button className="replica-plan-buy" onClick={()=>onBuy(p.id)}>{pro&&<Sparkles size={17} fill="currentColor"/>}{t('免费模拟购买','Simulate for free')}{currentPlan===p.id&&<span> · {t('当前','Current')}</span>}</button>
      <div className="replica-price"><span>$</span>{p.price}<small> / {t('月','mo')}</small></div>
      <ul>{p.features[language].map((feature,index)=>{const Icon=(pro?proIcons:icons)[index%(pro?proIcons:icons).length];return <li key={feature}><Icon size={19}/><span>{feature}</span></li>;})}</ul>
      <div className="replica-plan-note">{t('非官方模拟。实际支付 $0，不创建任何订阅。','Unofficial simulation. Charged $0. No subscription is created.')}<br/><button onClick={()=>onBuy(p.id)}>{t('免费体验本地演示权益','Try the local demo benefits')}</button></div>
    </article>;
  }
  return <div className="replica-plans-page">
    <header className="plans-native-bar"><button aria-label={t('关闭','Close')} onClick={onClose}><ArrowLeft size={16}/>{t('返回 Super Codex','Back to Super Codex')}</button><strong>{t('非官方演示 · 所有购买免费 · 不影响官方账户','UNOFFICIAL DEMO · ALL PURCHASES FREE · NO ACCOUNT CHANGES')}</strong><div>{(['minimize','maximize','close'] as const).map((action,i)=><button key={action} aria-label={action} onClick={()=>action==='close'?onClose():window.superCodex?.windowAction(action)}>{i===0?<Minus size={12}/>:i===1?<Square size={10}/>:<X size={15}/>}</button>)}</div></header>
    <div className="replica-plans-scroll"><h1>{t('升级套餐','Upgrade your plan')}</h1><div className="plan-category-tabs"><button className={section==='reference'?'active':''} onClick={()=>{setSection('reference');reference.current?.scrollIntoView({behavior:'smooth',block:'start'});}}>{t('参考套餐','Reference plans')}</button><button className={section==='fictional'?'active':''} onClick={()=>{setSection('fictional');concept.current?.scrollIntoView({behavior:'smooth',block:'start'});}}>{t('虚构会员','Fictional plans')}</button></div>
      <div className="replica-plans-grid" ref={reference}>{card('go')}{card('plus')}{card(tier)}</div>
      <article className="free-plan-row" data-testid="plan-free"><div><strong>Free</strong><p>{t('免费本地体验','Free local experience')}</p></div><span>$0 / {t('月','mo')}</span><button onClick={()=>onBuy('free')}>{t('免费模拟购买','Simulate for free')}</button></article>
      <section className="fictional-plans-section" ref={concept}><h2>{t('虚构会员','Fictional memberships')}</h2><p>{t('以下四个套餐仅为 Super Codex 的娱乐设定，月费为展示价格。','These four memberships are Super Codex entertainment presets. Monthly prices are illustrative.')}</p><div className="replica-plans-grid">{PLANS.filter(p=>p.fictional).map(p=>card(p.id))}</div></section>
      <div className="replica-plan-comparison"><h2>{t('演示功能对比','Demo feature comparison')}</h2><table><thead><tr><th>{t('功能','Feature')}</th><th>{t('参考套餐','Reference plans')}</th><th>{t('虚构会员','Fictional plans')}</th></tr></thead><tbody>{[t('16 个概念型号','16 concept models'),t('六档推理与最高 50× 演示速度','Six reasoning presets and up to 50× demo speed'),t('无限次本地模拟额度重置','Unlimited local demo quota resets'),t('ChatGPT 连接（以真实账户权限为准）','ChatGPT connection (actual account access applies)')].map(text=><tr key={text}><td>{text}</td><td><Check size={16}/></td><td><Check size={16}/></td></tr>)}</tbody></table></div>
    </div>
  </div>;
}
