import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { Check, ChevronDown, ChevronRight, RotateCcw } from 'lucide-react';
import { getEfforts, normalizeEffort, MODELS, SPEEDS, type Effort, type Language, type Speed } from '../lib/catalog';
import { EffortVisual } from './EffortVisual';
import { SpeedGlyph } from './SpeedGlyph';
import './model-controls.css';

export interface UnifiedModelOption {
  key: string;
  name: string;
  generation: number;
  conceptId?: string;
  /** A screenshot name is a pending preference, never a callable model ID. */
  referenceName?: string;
  /** Present only when the connected Codex catalog returned this ID. */
  officialId?: string;
}

export interface ModelControlsProps {
  language: Language;
  modelId: string;
  effort: Effort;
  speed: Speed;
  onModelChange: (modelId: string) => void;
  onEffortChange: (effort: Effort) => void;
  onSpeedChange: (speed: Speed) => void;
  connected?: boolean;
  live?: boolean;
  realModels?: { id: string; name: string }[];
  realModel?: string;
  onRealModelChange?: (model: string) => void;
  onConnect?: () => void;
  referenceModel?: string;
  onReferenceSelect?: (name: string) => void;
  /** The visible model selection is independent of the underlying real model. */
  selectionKey?: string;
  onSelectionChange?: (option: UnifiedModelOption) => void;
}

type OpenMenu = 'models' | 'effort' | 'speed' | null;
const modelLabel = (model: typeof MODELS[number]) => `GPT-${model.version.endsWith('.0') ? model.version.slice(0, -2) : model.version} ${model.name}`;
export const SCREENSHOT_REFERENCE_MODELS = [
  'GPT-6.1 Sol', 'GPT-6 Astra', 'GPT-6.1 Terra', 'GPT-6 Sol', 'GPT-6 Luna',
  'GPT-5.6 Sol', 'GPT-5.6 Terra', 'GPT-5.6 Luna',
] as const;

export function normalizeModelName(name: string): string {
  return name.normalize('NFKC').trim().replace(/\s+/g, ' ').replace(/^(GPT[- ]?\d+)\.0(?=\s|$)/i, '$1').toLowerCase();
}

function numericVersion(name: string): number {
  return Number(name.match(/\bGPT[- ]?(\d+(?:\.\d+)?)/i)?.[1] ?? 0);
}

/** Merge identical names without turning screenshot references into real IDs. */
export function getUnifiedModelOptions(realModels: { id: string; name: string }[] = []): UnifiedModelOption[] {
  const byName = new Map<string, UnifiedModelOption>();
  for (const concept of MODELS) {
    const name = modelLabel(concept);
    byName.set(normalizeModelName(name), { key: `concept:${concept.id}`, name, generation: concept.generation, conceptId: concept.id });
  }
  for (const name of SCREENSHOT_REFERENCE_MODELS) {
    const normalized = normalizeModelName(name);
    const previous = byName.get(normalized);
    byName.set(normalized, { ...previous, key: `reference:${name}`, name, generation: Math.floor(numericVersion(name)), referenceName: name });
  }
  for (const official of realModels) {
    const normalized = normalizeModelName(official.name);
    const previous = byName.get(normalized);
    if (previous?.officialId) continue;
    byName.set(normalized, { ...previous, key: `official:${official.id}`, name: previous?.name ?? official.name, generation: previous?.generation ?? (Math.floor(numericVersion(official.name)) || 6), officialId: official.id });
  }
  const referenceOrder = new Map<string, number>(SCREENSHOT_REFERENCE_MODELS.map((name, index) => [normalizeModelName(name), index]));
  return [...byName.values()].sort((a, b) => numericVersion(b.name) - numericVersion(a.name)
    || (referenceOrder.get(normalizeModelName(a.name)) ?? 99) - (referenceOrder.get(normalizeModelName(b.name)) ?? 99)
    || a.name.localeCompare(b.name));
}

export function matchesModelSelection(option: UnifiedModelOption, key: string): boolean {
  if (option.key === key) return true;
  if (key.startsWith('concept:')) return option.conceptId === key.slice(8);
  if (key.startsWith('official:')) return option.officialId === key.slice(9);
  return key.startsWith('reference:') && normalizeModelName(option.name) === normalizeModelName(key.slice(10));
}

export function ModelControls({ language, modelId, effort, speed, onModelChange, onEffortChange, onSpeedChange, connected = false, live = true, realModels = [], realModel = '', onRealModelChange, referenceModel = '', onReferenceSelect, selectionKey, onSelectionChange }: ModelControlsProps) {
  const [open, setOpen] = useState<OpenMenu>(null);
  const [localSelection, setLocalSelection] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLButtonElement>(null);
  const effortRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement | null>(null);
  const id = useId();
  const model = MODELS.find(item => item.id === modelId) ?? MODELS[0];
  const options = getUnifiedModelOptions(connected ? realModels : []);
  const inferredKey = referenceModel && !connected ? `reference:${referenceModel}` : connected && live && realModel ? `official:${realModel}` : `concept:${model.id}`;
  const selectedKey = selectionKey ?? localSelection ?? inferredKey;
  const selected = options.find(option => matchesModelSelection(option, selectedKey));
  const activeModelLabel = selected?.name ?? modelLabel(model);
  const generation = selected?.generation ?? model.generation;
  const efforts = getEfforts(generation);
  const displayedEffort = normalizeEffort(effort, generation);
  const effortIndex = Math.max(0, efforts.indexOf(displayedEffort));
  const progress = effortIndex / Math.max(1, efforts.length - 1);
  const t = (zh: string, en: string) => language === 'zh' ? zh : en;

  function close(restoreFocus = false) {
    setOpen(null);
    if (restoreFocus) openerRef.current?.focus();
  }
  function toggle(menu: Exclude<OpenMenu, null>, trigger: HTMLButtonElement | null) {
    openerRef.current = trigger;
    setOpen(current => current === menu ? null : menu);
  }
  function selectModel(option: UnifiedModelOption) {
    setLocalSelection(option.key);
    if (onSelectionChange) onSelectionChange(option);
    else {
      if (option.conceptId) onModelChange(option.conceptId);
      if (option.officialId) onRealModelChange?.(option.officialId);
      else if (option.referenceName) onReferenceSelect?.(option.referenceName);
    }
    close(true);
  }

  useEffect(() => {
    if (!open) return;
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(null);
    }
    document.addEventListener('pointerdown', outside);
    const frame = requestAnimationFrame(() => {
      if (open === 'models') {
        // Open at the highest version rather than scrolling to a lower selection.
        rootRef.current?.querySelector<HTMLElement>('.native-model-menu')?.focus({ preventScroll: true });
        return;
      }
      const target = open === 'effort'
        ? rootRef.current?.querySelector<HTMLInputElement>('.native-effort-range')
        : rootRef.current?.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="true"]:not(:disabled)');
      target?.focus({ preventScroll: true });
    });
    return () => { document.removeEventListener('pointerdown', outside); cancelAnimationFrame(frame); };
  }, [open]);

  function keyboard(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (event.key === 'Tab' && open) { close(true); return; }
    if (open !== 'models' && open !== 'speed') return;
    const items = Array.from(rootRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]:not(:disabled)') ?? []);
    const index = items.indexOf(document.activeElement as HTMLButtonElement);
    const next = event.key === 'ArrowDown' ? (index + 1) % items.length
      : event.key === 'ArrowUp' ? (index - 1 + items.length) % items.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : -1;
    if (next < 0 || !items.length) return;
    event.preventDefault();
    items[next].focus({ preventScroll: true });
    items[next].scrollIntoView({ block: 'nearest' });
  }

  return <div className="native-model-controls" ref={rootRef} data-open={!!open} data-speed={speed} data-effort={displayedEffort.replace(' ', '-').toLowerCase()} data-generation={generation} onKeyDown={keyboard}>
    <button type="button" className="native-speed-indicator" data-testid="speed-indicator" title={t('演示速度 · 不影响真实服务', 'Demo speed · does not change the real service')} aria-label={t('选择演示速度', 'Choose demo speed')} aria-haspopup="menu" aria-expanded={open === 'speed'} aria-controls={open === 'speed' ? `${id}-speed` : undefined} onClick={() => toggle('speed', effortRef.current)}><SpeedGlyph speed={speed} size={14} showMultiplier/></button>
    <button ref={modelRef} type="button" className="native-model-trigger" data-testid="model-selector" title={connected&&live?`${t('显示型号','Display model')}: ${activeModelLabel} · ${t('实际模型','Actual model')}: ${realModels.find(m=>m.id===realModel)?.name||t('官方默认','Official default')}`:t('选择模型', 'Choose model')} aria-label={t('选择模型', 'Choose model')} aria-haspopup="menu" aria-expanded={open === 'models'} aria-controls={open === 'models' ? `${id}-models` : undefined} onClick={() => toggle('models', modelRef.current)}>{activeModelLabel}</button>
    <button ref={effortRef} type="button" className="native-effort-trigger" data-testid="effort-selector" title={t('选择推理深度预设', 'Choose a reasoning depth preset')} aria-label={t('选择推理深度', 'Choose reasoning depth')} aria-haspopup="dialog" aria-expanded={open === 'effort'} aria-controls={open === 'effort' ? `${id}-effort` : undefined} onClick={() => toggle('effort', effortRef.current)}><span>{displayedEffort}</span><ChevronDown size={10} strokeWidth={1.5}/></button>

    {open === 'models' && <div className="native-control-popover native-model-menu" id={`${id}-models`} role="menu" tabIndex={-1} aria-label={t('选择模型', 'Choose model')}>
      <div className="native-menu-heading"><span>{t('选择模型', 'Choose model')}</span></div>
      <div className="native-model-options">{options.map(option => <button key={option.key} type="button" role="menuitemradio" aria-checked={selected ? selected.key === option.key : false} tabIndex={-1} className="native-model-option" data-model-key={option.key} data-selection-key={option.key} data-version={numericVersion(option.name)} data-model-id={option.conceptId} data-reference-model={option.referenceName} data-official-model-id={option.officialId} onClick={() => selectModel(option)}><span>{option.name}</span>{selected?.key === option.key && <Check size={13} strokeWidth={1.4}/>}</button>)}</div>
    </div>}

    {open === 'effort' && <div className="native-control-popover native-effort-menu" id={`${id}-effort`} role="dialog" aria-label={t('推理深度预设', 'Reasoning depth preset')}>
      <button className="native-effort-speed" type="button" data-testid="speed-selector" title={t('演示速度 · 不影响真实服务', 'Demo speed · does not change the real service')} aria-label={t('选择演示速度', 'Choose demo speed')} aria-haspopup="menu" onClick={() => toggle('speed', effortRef.current)}><SpeedGlyph speed={speed} size={14}/></button>
      <div className="native-effort-heading"><strong>{displayedEffort}</strong><button type="button" onClick={() => toggle('models', modelRef.current)}>{activeModelLabel}<ChevronRight size={10}/></button></div>
      <button className="native-effort-reset" type="button" title={t('恢复 High 预设', 'Restore High preset')} aria-label={t('恢复默认推理深度', 'Restore default reasoning depth')} onClick={() => onEffortChange('High')}><RotateCcw size={14} strokeWidth={1.5}/></button>
      <div className="native-effort-slider" data-progress={progress}>
        <EffortVisual effort={displayedEffort} speed={speed} generation={generation} progress={progress}/>
        <div className="native-effort-stops" aria-hidden="true">{efforts.map(item => <i key={item}/>)}</div>
        <input className="native-effort-range" data-testid="effort-range" type="range" min={0} max={efforts.length - 1} step={1} value={effortIndex} aria-label={t('推理深度', 'Reasoning depth')} aria-valuetext={displayedEffort} title={t('演示推理等级，不代表真实模型性能', 'Demo reasoning levels, not real model performance')} onChange={event => onEffortChange(efforts[Number(event.target.value)])}/>
      </div>
    </div>}

    {open === 'speed' && <div className="native-control-popover native-speed-menu" id={`${id}-speed`} role="menu" aria-label={t('演示速度', 'Demo speed')}>
      <div className="native-menu-heading"><span>{t('演示速度', 'Demo speed')}</span><small>{t('仅本地演示', 'Demo only')}</small></div>
      {SPEEDS.map(item => <button type="button" role="menuitemradio" aria-checked={item === speed} tabIndex={-1} className="native-model-option" key={item} onClick={() => { onSpeedChange(item); close(true); }}><span>{item === 1 ? 'Normal' : `${item}×`}</span>{item === speed && <Check size={13} strokeWidth={1.4}/>}</button>)}
    </div>}
  </div>;
}

export default ModelControls;
