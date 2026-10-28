import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Anchor, Archive, ArrowLeft, ArrowUpRight, AtSign, Bell, Check, ChevronDown,
  ChevronRight, CircleHelp, CircleUserRound, Code2, Copy, Download, FolderClosed,
  Gauge, GitBranch, Globe, Keyboard, KeyRound, Laptop, Mic, MousePointer2,
  PanelTop, Search, Settings, Shield, ShieldCheck, Smile, Sun, Terminal,
  UserRound, UserRoundCheck, ScanLine, type LucideIcon,
} from 'lucide-react';
import { EFFORTS, getEfforts, MODELS, PLANS, SPEEDS, type Effort, type Language, type Speed } from '../lib/catalog';
import type { AppState } from '../lib/storage';
import './settings-page.css';

export interface SettingsPageProps {
  state: AppState;
  onPatch: (patch: Partial<AppState>) => void;
  status: { connected: boolean; account?: { email?: string; planType?: string } };
  realModels: { id: string; name: string }[];
  realModel: string;
  onRealModelChange: (model: string) => void;
  onConnect: () => void;
  onExport: () => void;
  onReset: () => void;
  onClose: () => void;
  onPlans?: () => void;
  onProfile: () => void;
}

type Tab = 'general' | 'notifications' | 'import' | 'profile' | 'appearance' | 'account' | 'archived' | 'parental' | 'trusted' | 'voice' | 'storage' | 'configuration' | 'personalization' | 'mini' | 'shortcuts' | 'usage' | 'data' | 'plugins' | 'passwords' | 'computer' | 'appshots' | 'browser' | 'cloud' | 'hooks' | 'worktrees' | 'environments' | 'git' | 'about';
type Category = { id: Tab; zh: string; en: string; icon: LucideIcon; external?: boolean };
const groups: { zh: string; en: string; items: Category[] }[] = [
  { zh: '个人', en: 'Personal', items: [
    { id: 'general', zh: '常规', en: 'General', icon: Settings },
    { id: 'notifications', zh: '通知', en: 'Notifications', icon: Bell },
    { id: 'import', zh: '导入', en: 'Import', icon: Download },
    { id: 'profile', zh: '个人资料', en: 'Profile', icon: CircleUserRound, external: true },
    { id: 'appearance', zh: '外观', en: 'Appearance', icon: Sun },
    { id: 'account', zh: '账户', en: 'Account', icon: CircleUserRound },
    { id: 'archived', zh: '已归档的聊天', en: 'Archived chats', icon: Archive },
    { id: 'parental', zh: '家长控制', en: 'Parental controls', icon: UserRound },
    { id: 'trusted', zh: '受信任联系人', en: 'Trusted contact', icon: UserRoundCheck },
    { id: 'voice', zh: '语音', en: 'Voice', icon: Mic },
    { id: 'storage', zh: '存储', en: 'Storage', icon: FolderClosed },
    { id: 'configuration', zh: '配置', en: 'Configuration', icon: ShieldCheck },
    { id: 'personalization', zh: '个性化', en: 'Personalization', icon: Gauge },
    { id: 'mini', zh: 'Mini 与虚拟宠物', en: 'Mini & virtual pets', icon: Smile },
    { id: 'shortcuts', zh: '键盘快捷键', en: 'Keyboard shortcuts', icon: Keyboard },
    { id: 'usage', zh: '使用情况和计费', en: 'Usage & billing', icon: Gauge },
    { id: 'data', zh: '数据管理', en: 'Data controls', icon: Shield },
  ] },
  { zh: '集成', en: 'Integrations', items: [
    { id: 'plugins', zh: '插件', en: 'Plugins', icon: AtSign },
    { id: 'passwords', zh: '密码', en: 'Passwords', icon: KeyRound },
    { id: 'computer', zh: '电脑操控', en: 'Computer use', icon: MousePointer2 },
    { id: 'appshots', zh: '应用快照', en: 'Appshots', icon: ScanLine },
    { id: 'browser', zh: '浏览器', en: 'Browser', icon: PanelTop },
    { id: 'cloud', zh: '云电脑', en: 'Cloud computer', icon: Laptop },
  ] },
  { zh: '编码', en: 'Coding', items: [
    { id: 'hooks', zh: '钩子', en: 'Hooks', icon: Anchor },
    { id: 'worktrees', zh: '工作树', en: 'Worktrees', icon: GitBranch },
    { id: 'environments', zh: '环境', en: 'Environments', icon: Terminal },
    { id: 'git', zh: 'Git', en: 'Git', icon: GitBranch },
    { id: 'about', zh: '关于', en: 'About', icon: CircleHelp },
  ] },
];

const preferenceKey = 'super-codex-ui-preferences-v1';
const defaults = {
  defaultPermission: true, fullPermission: true, editor: 'VS Code', shell: 'PowerShell',
  closeConfirm: 'shortcut', completeView: false, bottomPanel: false, autoArchive: 'never',
  accent: 'white', font: 'system', notifications: true, compactNotifications: false,
};
function loadPreferences() {
  try {
    const source = JSON.parse(localStorage.getItem(preferenceKey) ?? '{}');
    return Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, typeof source?.[key] === typeof value ? source[key] : value])) as typeof defaults;
  } catch { return { ...defaults }; }
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return <button type="button" className={`sp-switch ${checked ? 'is-on' : ''}`} role="switch" aria-label={label} aria-checked={checked} onClick={onChange}><span /></button>;
}
function Row({ title, description, children, className = '', preview = false }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string; preview?: boolean }) {
  return <div className={`sp-row ${className}`}><div className="sp-row-copy"><div className="sp-row-title">{title}{preview && <span className="sp-demo-label">DEMO</span>}</div>{description && <div className="sp-description">{description}</div>}</div><div className="sp-row-control">{children}</div></div>;
}
function Group({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`sp-group ${className}`}>{children}</div>;
}

export default function SettingsPage({ state, onPatch, status, realModels, realModel, onRealModelChange, onConnect, onExport, onReset, onClose, onPlans, onProfile }: SettingsPageProps) {
  const [tab, setTab] = useState<Tab>('general');
  const [query, setQuery] = useState('');
  const [preferences, setPreferences] = useState(loadPreferences);
  const [advanced, setAdvanced] = useState(false);
  const [usageTab, setUsageTab] = useState<'overview' | 'analytics'>('overview');
  const [notice, setNotice] = useState('');
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const content = useRef<HTMLElement>(null);
  const lang = state.language;
  const t = (zh: string, en: string) => lang === 'zh' ? zh : en;
  const model = MODELS.find(item => item.id === state.modelId) ?? MODELS[0];
  const plan = PLANS.find(item => item.id === state.planId) ?? PLANS[0];
  const active = groups.flatMap(group => group.items).find(item => item.id === tab)!;
  const dark = state.theme === 'dark' || state.theme === 'system' && systemDark;
  const patchPreference = (patch: Partial<typeof defaults>) => setPreferences(previous => ({ ...previous, ...patch }));
  useEffect(() => { try { localStorage.setItem(preferenceKey, JSON.stringify(preferences)); } catch { /* Preview preferences remain usable without persistence. */ } }, [preferences]);
  useEffect(() => { content.current?.scrollTo({ top: 0 }); setNotice(''); }, [tab]);
  useEffect(() => { const media = window.matchMedia('(prefers-color-scheme: dark)'); const change = () => setSystemDark(media.matches); media.addEventListener('change', change); return () => media.removeEventListener('change', change); }, []);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer); }, [notice]);
  const demoNotice = () => setNotice(t('这是本地界面预览，不会更改系统或官方账户。', 'This is a local interface preview. System and official account settings are unchanged.'));
  const languageControl = <select aria-label="Language" value={lang} onChange={event => onPatch({ language: event.target.value as Language })}><option value="zh">简体中文</option><option value="en">English</option></select>;
  const note = <p className="sp-footnote">{t('非官方概念演示。标有 DEMO 的设置只影响本地界面预览，不授予系统权限。', 'Unofficial concept demo. Settings marked DEMO affect local previews and grant no system permissions.')}</p>;

  const connection = <>
    <section className="sp-section"><h2>{t('ChatGPT 连接', 'ChatGPT connection')}</h2><Group>
      <Row title={t('账户连接', 'Account connection')} description={status.connected ? t('已检测到官方 Codex 连接。实际访问受账户权限限制。', 'Official Codex connection detected. Account entitlements apply.') : t('尚未连接。Windows 桌面版通过本地 Codex CLI 使用官方登录。', 'Not connected. The Windows app uses official sign-in through local Codex CLI.')}><button className="sp-button" onClick={onConnect}>{t('管理连接', 'Manage connection')}<ArrowUpRight size={12} /></button></Row>
      <Row title={t('真实底层模型', 'Actual model')} description={t('与概念风格预设分开；模型目录不保证账户可用性。', 'Separate from concept styles; the catalog does not guarantee entitlement.')}><select aria-label={t('真实底层模型', 'Actual model')} value={realModel} onChange={event => onRealModelChange(event.target.value)} disabled={!realModels.length}><option value="">{t('官方默认', 'Official default')}</option>{realModels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Row>
    </Group></section>
    <p className="sp-footnote">{t('网页版本仅提供 Demo。真实回复速度由服务决定，Ultra 与速度倍率不代表真实模型性能。', 'The web version provides Demo only. Real response speed is controlled by the service; Ultra and multipliers do not represent model performance.')}</p>
  </>;

  return <div className={`settings-page ${dark ? 'sp-dark' : 'sp-light'}`} data-testid="settings-page">
    <aside className="sp-sidebar" aria-label={t('设置导航', 'Settings navigation')}>
      <div className="sp-sidebar-heading"><h2>{t('设置', 'Settings')}</h2><button className="sp-close" aria-label={t('关闭设置', 'Close settings')} title={t('返回工作区', 'Back to workspace')} onClick={onClose}><ArrowLeft size={16} /></button></div>
      <label className="sp-search"><Search size={14} /><input aria-label={t('搜索设置', 'Search settings')} placeholder={t('搜索', 'Search')} value={query} onChange={event => setQuery(event.target.value)} /></label>
      <nav className="sp-categories">{groups.map(group => {
        const filtered = group.items.filter(item => !query || `${item.zh} ${item.en}`.toLowerCase().includes(query.toLowerCase()));
        if (!filtered.length) return null;
        return <div className="sp-nav-group" key={group.en}><div className="sp-category-label">{group[lang]}</div>{filtered.map(item => { const Icon = item.icon; return <button type="button" className={`sp-category ${tab === item.id ? 'is-active' : ''}`} aria-current={tab === item.id ? 'page' : undefined} data-testid={`settings-tab-${item.id}`} onClick={() => item.id === 'profile' ? onProfile() : setTab(item.id)} key={item.id}><Icon size={15} strokeWidth={1.6} /><span>{item[lang]}</span>{item.external && <ArrowUpRight size={13} className="sp-external" />}</button>; })}</div>;
      })}{query && !groups.some(group => group.items.some(item => `${item.zh} ${item.en}`.toLowerCase().includes(query.toLowerCase()))) && <p className="sp-search-empty">{t('未找到设置', 'No matching settings')}</p>}</nav>
    </aside>
    <main className="sp-main" ref={content}>
      <div className="sp-content"><h1>{active[lang]}</h1>
        {tab === 'general' && <>
          <section className="sp-section"><h2>{t('权限', 'Permissions')}</h2><Group className="sp-permissions">
            <Row title={t('默认权限', 'Default permissions')} preview description={t('演示任务可以读取和编辑模拟工作区中的文件。需要时，可以显示额外访问权限请求。', 'Demo tasks can read and edit simulated workspace files, and display additional access requests when needed.')}><Toggle label={t('默认权限（演示）', 'Default permissions (demo)')} checked={preferences.defaultPermission} onChange={() => patchPreference({ defaultPermission: !preferences.defaultPermission })} /></Row>
            <Row title={t('完整访问权限', 'Full access')} preview className="sp-full-permission" description={t('此开关仅模拟权限界面，不会授予真实文件、终端或网络权限，也不会修改官方 Codex 的安全设置。真实连接继续使用应用已有的权限策略。这里展示的终端、文件修改、测试与 Git 操作都属于本地演示。', 'This switch previews the permission interface. It grants no real file, terminal, or network access and does not change official Codex security settings. The connection keeps its existing policy. Terminal, file changes, tests, and Git actions shown here remain local simulations.')}><Toggle label={t('完整访问权限（演示）', 'Full access (demo)')} checked={preferences.fullPermission} onChange={() => patchPreference({ fullPermission: !preferences.fullPermission })} /></Row>
          </Group></section>
          <section className="sp-section"><h2>{t('常规', 'General')}</h2><Group>
            <Row title={t('项目外聊天文件夹', 'Folder for chats outside projects')} description={t('本地演示聊天的默认存储位置。', 'Default storage for local demo chats.')}><span className="sp-path">{t('此设备 / 本地存储', 'This device / local storage')}</span><button className="sp-button" onClick={demoNotice}>{t('更改', 'Change')}</button></Row>
            <Row title={t('默认文件打开位置', 'Default file opener')} description={t('默认打开文件和文件夹的位置', 'Default location for opening files and folders')}><select aria-label={t('默认文件打开位置', 'Default file opener')} value={preferences.editor} onChange={event => patchPreference({ editor: event.target.value })}><option>VS Code</option><option>Cursor</option><option>{t('系统默认', 'System default')}</option></select></Row>
            <Row title={t('集成终端 Shell', 'Integrated terminal shell')} description={t('选择要在模拟终端中显示的 Shell', 'Choose the shell displayed in the simulated terminal')}><select aria-label={t('集成终端 Shell', 'Integrated terminal shell')} value={preferences.shell} onChange={event => patchPreference({ shell: event.target.value })}><option>PowerShell</option><option>Command Prompt</option><option>Git Bash</option></select></Row>
            <Row title={t('语言', 'Language')} description={t('应用界面语言', 'Application interface language')}>{languageControl}</Row>
            <Row title={t('关闭窗口前确认', 'Confirm before closing window')} description={t('演示关闭标签页时的确认偏好', 'Preview the confirmation preference for closing tabs')}><select aria-label={t('关闭窗口前确认', 'Confirm before closing window')} value={preferences.closeConfirm} onChange={event => patchPreference({ closeConfirm: event.target.value })}><option value="shortcut">{t('仅在使用“关闭”快捷键时', 'Only with the close shortcut')}</option><option value="always">{t('始终', 'Always')}</option><option value="never">{t('从不', 'Never')}</option></select></Row>
            <Row title={t('默认使用完整视图', 'Use full view by default')} description={t('新建聊天时，将聊天和内容显示在同一个标签页栏中', 'Keep chat and content in the same tab bar for new chats')}><Toggle label={t('默认使用完整视图（演示）', 'Use full view by default (demo)')} checked={preferences.completeView} onChange={() => patchPreference({ completeView: !preferences.completeView })} /></Row>
            <Row title={t('登录时启动', 'Launch at login')} description={t('查看启动偏好演示', 'Preview startup preferences')}><button className="sp-button" onClick={demoNotice}>{t('打开“启动应用”', 'Open startup apps')}</button></Row>
            <Row title={t('底部面板', 'Bottom panel')} description={t('在应用标题栏中显示底部面板控件', 'Show bottom panel controls in the application title bar')}><Toggle label={t('底部面板（演示）', 'Bottom panel (demo)')} checked={preferences.bottomPanel} onChange={() => patchPreference({ bottomPanel: !preferences.bottomPanel })} /></Row>
            <Row title={t('自动归档不活跃的聊天', 'Automatically archive inactive chats')} description={t('预览将一段时间未活动的本地聊天归档', 'Preview archiving local chats after a period of inactivity')}><select aria-label={t('自动归档不活跃的聊天', 'Automatically archive inactive chats')} value={preferences.autoArchive} onChange={event => patchPreference({ autoArchive: event.target.value })}><option value="never">{t('永不', 'Never')}</option><option value="7">{t('7 天', '7 days')}</option><option value="30">{t('30 天', '30 days')}</option></select></Row>
          </Group></section>{note}
        </>}

        {tab === 'appearance' && <>
          <section className="sp-section"><h2>{t('视觉风格', 'Visual style')}</h2><Group className="sp-mode-group"><Row title={t('模式', 'Mode')}><div className="sp-theme-options">{(['system', 'light', 'dark'] as const).map(mode => <button key={mode} className={`sp-theme-preview ${state.theme === mode ? 'is-selected' : ''}`} aria-label={mode === 'system' ? t('跟随系统', 'System') : mode === 'light' ? t('浅色', 'Light') : t('深色', 'Dark')} aria-pressed={state.theme === mode} title={mode === 'system' ? t('跟随系统', 'System') : mode === 'light' ? t('浅色', 'Light') : t('深色', 'Dark')} onClick={() => onPatch({ theme: mode })}><div className={`sp-mini-window sp-mini-${mode}`}><div className="sp-mini-top" /><div className="sp-mini-sidebar"><i /><i /><i /></div><div className="sp-mini-body"><i /><i /><i /><i /><b /></div>{mode === 'system' && <div className="sp-mini-dark-half"><i /><i /><i /><b /></div>}</div></button>)}</div></Row></Group>
          <Group className="sp-appearance-properties"><Row title={t('主题', 'Theme')}><button className="sp-small-icon" title={t('导出演示主题', 'Export demo theme')} aria-label={t('导出演示主题', 'Export demo theme')} onClick={demoNotice}><Download size={17} /></button><button className="sp-small-icon" title={t('复制主题', 'Copy theme')} aria-label={t('复制主题', 'Copy theme')} onClick={async () => { try { await navigator.clipboard.writeText(JSON.stringify({ theme: state.theme, accent: preferences.accent })); setNotice(t('主题设置已复制', 'Theme settings copied')); } catch { demoNotice(); } }}><Copy size={17} /></button><button className="sp-theme-name" onClick={demoNotice}><span>Aa</span>ChatGPT<ChevronDown size={13} /></button></Row>
            <Row title={t('强调色', 'Accent color')}><div className="sp-accent-select"><i style={{ background: preferences.accent === 'blue' ? '#438cf8' : dark ? '#fff' : '#272727' }} /><select aria-label={t('强调色', 'Accent color')} value={preferences.accent} onChange={event => patchPreference({ accent: event.target.value })}><option value="white">{t('白色', 'White')}</option><option value="blue">{t('蓝色（演示）', 'Blue (demo)')}</option></select></div></Row>
            <Row title={t('背景', 'Background')}><button className="sp-color-chip" onClick={demoNotice}><i style={{ background: dark ? '#181818' : '#FFFFFF' }} />{dark ? '#181818' : '#FFFFFF'}</button></Row>
            <Row title={t('前景', 'Foreground')}><button className="sp-color-chip" onClick={demoNotice}><i style={{ background: dark ? '#FFFFFF' : '#202123' }} />{dark ? '#FFFFFF' : '#202123'}</button></Row>
            <Row title={t('字体', 'Font')}><select aria-label={t('字体', 'Font')} value={preferences.font} onChange={event => { patchPreference({ font: event.target.value }); demoNotice(); }}><option value="system">{t('系统', 'System')}</option><option value="segoe">Segoe UI</option><option value="yahei">Microsoft YaHei UI</option></select></Row>
          </Group></section>
          <button className="sp-advanced" onClick={() => setAdvanced(!advanced)} aria-expanded={advanced}>{t('高级', 'Advanced')}<ChevronRight size={13} className={advanced ? 'is-open' : ''} /></button>
          {advanced && <Group><Row title={t('语言', 'Language')} description={t('立即应用到整个界面', 'Applied instantly throughout the app')}>{languageControl}</Row><Row title={t('界面动画', 'Interface animations')} description={t('切换、流式文字与过渡效果', 'Transitions and streaming text')}><Toggle label={t('界面动画', 'Interface animations')} checked={state.animations} onChange={() => onPatch({ animations: !state.animations })} /></Row></Group>}
        </>}

        {tab === 'profile' && <><section className="sp-section"><h2>{t('账户信息', 'Account information')}</h2><Group><Row title={t('电子邮箱','Email')}><span>{status.account?.email || t('不可用','Unavailable')}</span></Row><Row title={t('账户套餐','Account plan')}><span>{status.account?.planType || t('不可用','Unavailable')}</span></Row><Row title={t('连接状态','Connection')}><button className="sp-button" onClick={onConnect}>{status.connected?t('已连接','Connected'):t('连接 ChatGPT','Connect ChatGPT')}</button></Row></Group></section><p className="sp-footnote">{t('个人资料界面尚无原版参考；显示的信息以连接返回的数据为准。','No original profile reference is available. Information shown comes from the connection.')}</p></>}
        {(tab === 'account' || tab === 'configuration') && connection}
        {tab === 'personalization' && <><section className="sp-section"><h2>{t('概念模型偏好', 'Concept model preferences')}</h2><Group>
          <Row title={t('默认概念型号', 'Default concept model')} description={t('控制回答风格，不作为真实 API 模型名称。', 'Controls response style, not the actual API model identifier.')}><select aria-label={t('默认概念型号', 'Default concept model')} value={model.id} onChange={event => onPatch({ modelId: event.target.value })}>{MODELS.map(item => <option key={item.id} value={item.id}>GPT-{item.version} {item.name}</option>)}</select></Row>
          <Row title={t('推理深度预设', 'Reasoning depth preset')} description={t('Ultra 为娱乐演示，不代表真实推理能力。', 'Ultra is an entertainment preset, not a real capability claim.')}><select aria-label={t('推理深度预设', 'Reasoning depth preset')} value={state.effort} onChange={event => onPatch({ effort: event.target.value as Effort })}>{getEfforts(MODELS.find(m=>m.id===state.modelId)?.generation??6).map(effort => <option key={effort}>{effort}</option>)}</select></Row>
          <Row title={t('演示速度', 'Demo speed')} description={t('影响模拟执行和预设文字，不会加速真实服务。', 'Changes simulation playback, not actual service speed.')}><select aria-label={t('演示速度', 'Demo speed')} value={state.speed} onChange={event => onPatch({ speed: Number(event.target.value) as Speed })}>{SPEEDS.map(speed => <option key={speed} value={speed}>{speed === 1 ? 'Normal' : `${speed}×`}</option>)}</select></Row>
        </Group></section><div className="sp-style-preview"><strong>GPT-{model.version} {model.name}</strong><p>{model.style[lang]}</p></div>{note}</>}

        {(tab === 'data' || tab === 'storage' || tab === 'import') && <><section className="sp-section"><h2>{t('本地数据', 'Local data')}</h2><Group>
          <Row title={t('本地对话', 'Local conversations')} description={`${state.chats.length} ${t('个任务 · 保存在此设备', 'tasks · saved on this device')}`}><button className="sp-button" onClick={onExport}><Download size={13} />{t('导出', 'Export')}</button></Row>
          <Row title={t('重置记录', 'Reset history')} description={`${state.resetCount} ${t('次本地模拟重置', 'local demo resets')}`}><button className="sp-button" onClick={onReset}>{t('打开重置器', 'Open resetter')}</button></Row>
        </Group></section>{state.resetHistory.length > 0 && <section className="sp-section"><h2>{t('最近重置', 'Recent resets')}</h2><Group className="sp-history">{state.resetHistory.slice(0, 8).map(record => <div key={record.id}><time>{new Date(record.at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</time><span>{record.before.session}% → 100%</span></div>)}</Group></section>}{tab === 'import' && <p className="sp-footnote">{t('此版本提供历史导出；导入外部聊天尚未实现。', 'This version supports exporting history. Importing external chats is not implemented.')}</p>}{note}</>}

        {tab === 'usage' && <div className="sp-usage"><div className="sp-usage-tabs" role="tablist" aria-label={t('用量视图', 'Usage views')}><button role="tab" aria-selected={usageTab === 'overview'} className={usageTab === 'overview' ? 'is-active' : ''} onClick={() => setUsageTab('overview')}>{t('概览', 'Overview')}</button><button role="tab" aria-selected={usageTab === 'analytics'} className={usageTab === 'analytics' ? 'is-active' : ''} onClick={() => setUsageTab('analytics')}>{t('分析', 'Analytics')}</button></div>
          {usageTab === 'overview' ? <>
            <section className="sp-usage-section"><h2>{t('当前套餐', 'Current plan')}</h2><p>{t('你的演示套餐仅保存在本机。此页面不会变更真实 ChatGPT 订阅或额度。', 'Your demo plan is stored locally. This page does not change a real ChatGPT subscription or limits.')}</p><Group><Row title={`${plan.name} · ${t('模拟会员', 'Demo membership')}`} description={t(`展示价格 $${plan.price} / 月 · 实际支付 $0`, `Display price $${plan.price} / month · charged $0`)}><button className="sp-button" onClick={onPlans ?? demoNotice}>{t('查看套餐', 'View plans')}</button></Row></Group></section>
            <section className="sp-usage-section"><h2>{t('套餐限额', 'Plan limits')}</h2><p>{t('本地对话与模拟执行共享演示额度。不会读取、修改或重置真实 OpenAI 账户额度。', 'Local chats and simulations share demo limits. Real OpenAI account limits are not read, changed, or reset.')}</p><div className="sp-usage-quota"><strong>{t('每周模拟限额', 'Weekly demo limit')}</strong><div><span>{t('本地额度 · 可随时重置', 'Local limits · reset at any time')}</span><span>{t('剩余', 'Remaining')} {state.quotas.weekly}%</span></div><button className="sp-quota-track" title={t('打开本地额度重置器', 'Open local quota resetter')} aria-label={t('打开本地额度重置器', 'Open local quota resetter')} onClick={onReset}><span style={{ width: `${state.quotas.weekly}%` }} /></button></div></section>
            <section className="sp-usage-section"><h2>{t('最近的套餐用量', 'Recent plan usage')}</h2><p>{t('本地演示额度的消耗情况', 'Consumption of local simulated limits')}</p><div className="sp-usage-chart"><strong>{state.quotas.weekly}%</strong>{state.resetHistory.length ? <div className="sp-usage-local-history">{state.resetHistory.slice(0, 3).map(record => <div key={record.id}><time>{new Date(record.at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}</time><span>{record.before.weekly}% → 100%</span></div>)}</div> : <span className="sp-usage-chart-placeholder">{t('暂无本地额度历史记录', 'No local limit history yet')}</span>}</div><button className="sp-usage-history-link" onClick={() => setTab('data')}>{t('查看用量历史', 'View usage history')}<ArrowUpRight size={12} /></button></section>
            <section className="sp-usage-section"><h2>{t('额度', 'Credits')}</h2><p>{t('使用机械重置器即可免费恢复全部本地额度。无需付款，不影响真实账户。', 'Use the mechanical resetter to restore all local limits for free. No payment; real accounts are unaffected.')}</p><Group><Row title={t('Tibo 全球重置器', 'Tibo global reset')} description={`${state.resetCount} ${t('次本地重置 · 无限使用', 'local resets · unlimited uses')}`}><button className="sp-button" onClick={onReset}>{t('打开重置器', 'Open resetter')}</button></Row></Group></section>
          </> : <section className="sp-usage-section"><h2>{t('本地演示分析', 'Local demo analytics')}</h2><p>{t('以下统计来自此设备保存的聊天与重置记录，不是官方账户数据。', 'These statistics come from chats and resets saved on this device, not official account data.')}</p><Group><Row title={t('聊天总数', 'Total chats')}><span>{state.chats.length}</span></Row><Row title={t('本地消息', 'Local messages')}><span>{state.chats.reduce((count, chat) => count + chat.messages.length, 0)}</span></Row><Row title={t('当前时段剩余额度', 'Session limit remaining')}><span>{state.quotas.session}%</span></Row><Row title={t('已完成的本地重置', 'Completed local resets')}><span>{state.resetCount}</span></Row></Group></section>}{note}
        </div>}

        {tab === 'notifications' && <><section className="sp-section"><h2>{t('通知偏好', 'Notification preferences')}</h2><Group><Row title={t('任务完成通知', 'Task completion notifications')} preview description={t('预览通知开关，不请求系统通知权限。', 'Preview only; no system notification permission is requested.')}><Toggle label={t('任务完成通知（演示）', 'Task completion notifications (demo)')} checked={preferences.notifications} onChange={() => patchPreference({ notifications: !preferences.notifications })} /></Row><Row title={t('简洁通知', 'Compact notifications')} preview><Toggle label={t('简洁通知（演示）', 'Compact notifications (demo)')} checked={preferences.compactNotifications} onChange={() => patchPreference({ compactNotifications: !preferences.compactNotifications })} /></Row></Group></section>{note}</>}
        {tab === 'voice' && <><section className="sp-section"><h2>{t('声音', 'Sound')}</h2><Group><Row title={t('机械音效', 'Mechanical sound')} description={t('重置器的本地操作反馈', 'Local audio feedback from the resetter')}><Toggle label={t('机械音效', 'Mechanical sound')} checked={state.sound} onChange={() => onPatch({ sound: !state.sound })} /></Row></Group></section><p className="sp-footnote">{t('实时语音与听写在此版本中仅为界面演示。', 'Live voice and dictation are interface demonstrations in this version.')}</p></>}
        {tab === 'shortcuts' && <section className="sp-section"><h2>{t('工作区', 'Workspace')}</h2><Group><Row title={t('新聊天', 'New chat')}><kbd>Ctrl N</kbd></Row><Row title={t('搜索聊天', 'Search chats')}><kbd>Ctrl K</kbd></Row><Row title={t('关闭菜单或设置', 'Close menu or settings')}><kbd>Esc</kbd></Row><Row title={t('发送消息', 'Send message')}><kbd>Enter</kbd></Row><Row title={t('消息换行', 'New line')}><kbd>Shift Enter</kbd></Row></Group></section>}
        {tab === 'archived' && <section className="sp-section"><h2>{t('已归档的本地聊天', 'Archived local chats')}</h2><Group>{state.chats.filter(chat => chat.archived).length ? state.chats.filter(chat => chat.archived).map(chat => <Row key={chat.id} title={chat.title} description={new Date(chat.updatedAt).toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US')}><button className="sp-button" onClick={() => onPatch({ chats: state.chats.map(item => item.id === chat.id ? { ...item, archived: false } : item) })}>{t('恢复', 'Restore')}</button></Row>) : <div className="sp-empty">{t('没有已归档的聊天。', 'No archived chats.')}</div>}</Group></section>}
        {tab === 'about' && <><section className="sp-section"><h2>Super Codex</h2><Group><Row title={t('版本', 'Version')}><span>0.1.0</span></Row><Row title={t('项目性质', 'Project')}><span>{t('非官方概念演示', 'Unofficial concept demo')}</span></Row><Row title={t('官方接入文档', 'Official integration documentation')}><a className="sp-button" href="https://learn.chatgpt.com/docs/app-server" target="_blank" rel="noreferrer">Codex app-server<ArrowUpRight size={13} /></a></Row></Group></section><p className="sp-footnote">{t('概念型号、Ultra、速度倍率、虚构会员及额度重置均为娱乐设定，不代表 OpenAI 的真实产品或账户权益。', 'Concept models, Ultra, multipliers, fictional memberships, and resets are entertainment presets, not OpenAI products or account entitlements.')}</p><p className="sp-footnote">Not affiliated with, endorsed by, or sponsored by OpenAI.</p></>}
        {!['general','profile','appearance','account','configuration','personalization','data','storage','import','usage','notifications','voice','shortcuts','archived','about'].includes(tab) && <><section className="sp-section"><h2>{t('界面预览', 'Interface preview')}</h2><Group><div className="sp-empty"><active.icon size={24} strokeWidth={1.4} /><strong>{active[lang]}</strong><p>{t('此设置页保留参考客户端的导航与交互。当前版本未实现此服务，也不会更改你的系统或官方账户设置。', 'This page preserves the reference client navigation. This service is not implemented and does not change your system or official account settings.')}</p><button className="sp-button" onClick={() => setTab('general')}>{t('返回常规', 'Back to General')}</button></div></Group></section>{note}</>}
        {notice && <div className="sp-notice" role="status"><Check size={14} />{notice}</div>}
      </div>
    </main>
  </div>;
}

