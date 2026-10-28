import { Files, Clock, Atom, Compass, GitPullRequest, LayoutDashboard, Sparkles, ChevronRight } from 'lucide-react';
import type { Language } from '../lib/catalog';
import type { NavigationRoute } from './Chrome';
import './navigation-page.css';

/** These local-only pages keep native destinations distinct. They have no cloud data or backend. */
export function NavigationPage({route,language,onModels,onAutomations,onSkills,onDiff,onSearch}:{route:NavigationRoute;language:Language;onModels:()=>void;onAutomations:()=>void;onSkills:()=>void;onDiff:()=>void;onSearch:()=>void}){
  const zh=language==='zh'; const t=(a:string,b:string)=>zh?a:b;
  const pages={
    spaces:{Icon:Files,title:t('资料空间','Spaces'),message:t('在这里查看资料空间。','View your spaces here.'),note:t('本地演示不连接资料空间，真实页面内容未导入。','Local demo only. Your real spaces are not connected or imported.')},
    scheduled:{Icon:Clock,title:t('定时任务','Scheduled tasks'),message:t('管理定时任务。','Manage your scheduled tasks.'),note:t('本地演示不会读取或运行真实定时任务。','Local demo only. No real scheduled tasks are read or run.')},
    plugins:{Icon:Atom,title:t('插件','Plugins'),message:t('发现和管理插件。','Discover and manage plugins.'),note:t('本地演示不会读取、安装或启用真实插件。','Local demo only. Real plugins are not read, installed, or enabled.')},
    explore:{Icon:Compass,title:t('探索','Explore'),message:t('探索功能。','Explore features.'),note:t('以下内容是 Super Codex 的本地演示入口。','The following entries are local Super Codex demos.')},
    review:{Icon:GitPullRequest,title:t('代码审查','Code review'),message:t('审查代码变更。','Review code changes.'),note:t('仅展示本地模拟差异，不连接代码托管账户。','Displays simulated local diffs only. No code hosting account is connected.')},
    sites:{Icon:LayoutDashboard,title:t('站点','Sites'),message:t('查看站点。','View sites.'),note:t('本地演示不连接或发布真实站点。','Local demo only. No real sites are connected or published.')},
  };const page=pages[route],Icon=page.Icon;
  return <section className="native-destination" aria-label={page.title}>
    <header className="native-destination-header"><strong>{page.title}</strong><span>{t('本地演示','Local demo')}</span></header>
    <div className="native-destination-body"><Icon size={36} strokeWidth={1.3}/><h1>{page.title}</h1><p>{page.message}</p><small>{page.note}</small>
      <div className="native-destination-actions">
        {route==='spaces'&&<button onClick={onSearch}>{t('搜索本地对话','Search local chats')}<ChevronRight size={14}/></button>}
        {route==='scheduled'&&<button onClick={onAutomations}>{t('查看模拟自动化','View simulated automations')}<ChevronRight size={14}/></button>}
        {route==='plugins'&&<button onClick={onSkills}>{t('查看演示技能','View demo skills')}<ChevronRight size={14}/></button>}
        {route==='explore'&&<><button onClick={onModels}><Sparkles size={15}/>{t('未来模型实验室','Future model lab')}<ChevronRight size={14}/></button><button onClick={onSkills}>{t('演示技能','Demo skills')}<ChevronRight size={14}/></button><button onClick={onAutomations}>{t('模拟自动化','Simulated automations')}<ChevronRight size={14}/></button></>}
        {route==='review'&&<button onClick={onDiff}>{t('查看模拟更改','View simulated changes')}<ChevronRight size={14}/></button>}
      </div>
    </div>
  </section>;
}
