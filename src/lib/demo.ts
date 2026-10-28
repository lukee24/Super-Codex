import { getEfforts, normalizeEffort, getModel, type Effort, type Language, type Speed } from './catalog';

export interface DemoFile { path: string; before: string; after: string }
export interface DemoStep {
  id: string;
  label: string;
  kind: 'thinking' | 'file' | 'terminal' | 'test' | 'git';
  duration: number;
}
export interface DemoResponse { text: string; steps: DemoStep[]; files: DemoFile[] }
export interface DemoInput {
  prompt: string;
  modelId: string;
  effort: Effort;
  language: Language;
  history?: { role: 'user' | 'assistant'; content: string }[];
}

export const simulationDelay = (milliseconds: number, speed: Speed): number => Math.max(16, Math.round(milliseconds / speed));
export const streamChunkSize = (speed: Speed): number => Math.max(2, Math.ceil(speed * 1.5));

const approaches: Record<string, { zh: string; en: string }> = {
  astra: { zh: '先明确假设，再分解问题，最后检查结论是否成立。', en: 'Start with assumptions, break down the problem, then check the conclusion.' },
  sol: { zh: '先完成最有用的一小步，再让结果更顺手。', en: 'Start with the most useful small step, then make the result easier to use.' },
  terra: { zh: '从可靠的基础开始：清晰的接口、边界条件和可重复的验证。', en: 'Build on reliable foundations: clear interfaces, edge cases, and repeatable checks.' },
  cinder: { zh: '先做一个能看到、能点击的原型，让想法尽快落地。', en: 'Make a visible, clickable prototype first so the idea has something concrete to test.' },
  glyph: { zh: '先打磨命名和表达，让每个界面元素都有清楚的含义。', en: 'Refine names and wording first so every interface element has a clear meaning.' },
  helio: { zh: '可以把它想成搭积木：先认清每块积木的用途，再把它们连起来。', en: 'Think of it as building with blocks: understand each block, then connect them.' },
  vector: { zh: '先列出输入、输出与约束，再选择步骤最少、复杂度可控的路径。', en: 'List inputs, outputs, and constraints, then choose a short path with predictable complexity.' },
  sable: { zh: '先检查最容易出错的地方：空输入、失败路径、权限与恢复方式。', en: 'Inspect likely failure points first: empty input, failure paths, permissions, and recovery.' },
  axiom: { zh: '从定义开始：什么是输入，什么算成功，哪些条件必须始终成立。', en: 'Begin with definitions: what is the input, what counts as success, and what must remain true?' },
  helix: { zh: '我会并排比较两个方向：轻量原型和可扩展实现，再按需求选择。', en: 'Compare two directions side by side: a lightweight prototype and an extensible implementation.' },
  crest: { zh: '按交付拆成三个里程碑：可用、可验证、可维护。', en: 'Organize delivery into three milestones: usable, verifiable, and maintainable.' },
  lattice: { zh: '先梳理组件、状态和数据流，找到它们之间最重要的连接。', en: 'Map components, state, and data flow to identify the most important connections.' },
  strata: { zh: '分三层展开：用户体验、内部实现、验证与维护。', en: 'Work through three layers: user experience, implementation, then validation and maintenance.' },
  meridian: { zh: '把产品目标、设计体验与工程约束放在一起，找到它们共同支持的方向。', en: 'Combine the product goal, design experience, and engineering constraints into one coherent direction.' },
  vanta: { zh: '关键只有一个：先验证最重要的假设，再增加细节。', en: 'Focus on one thing: validate the most important assumption before adding detail.' },
  apex: { zh: '把它串成完整体验：明确目标，构建原型，验证行为，再打磨细节。', en: 'Connect the whole experience: define the goal, build a prototype, verify behavior, then refine the details.' },
};

const personaStages: Record<string, { kind: DemoStep['kind']; duration: number; zh: string; en: string }> = {
  astra: { kind: 'thinking', duration: 1100, zh: '推导输入与状态约束', en: 'derive input and state constraints' },
  sol: { kind: 'file', duration: 430, zh: '整理最小可用交互', en: 'shape the smallest useful interaction' },
  terra: { kind: 'test', duration: 980, zh: '检查重复操作与边界', en: 'check repeated actions and boundaries' },
  cinder: { kind: 'file', duration: 320, zh: '搭建可点击原型', en: 'assemble a clickable prototype' },
  glyph: { kind: 'file', duration: 660, zh: '打磨命名与界面文案', en: 'refine naming and interface copy' },
  helio: { kind: 'thinking', duration: 840, zh: '逐步解释状态变化', en: 'explain state transitions step by step' },
  vector: { kind: 'terminal', duration: 560, zh: '分析更新路径与复杂度', en: 'inspect update paths and complexity' },
  sable: { kind: 'test', duration: 1250, zh: '审查失败路径与恢复方式', en: 'review failure paths and recovery' },
  axiom: { kind: 'test', duration: 1170, zh: '验证状态不变量', en: 'verify state invariants' },
  helix: { kind: 'thinking', duration: 1050, zh: '比较两种实现方案', en: 'compare two implementation approaches' },
  crest: { kind: 'git', duration: 790, zh: '整理里程碑与交付检查', en: 'organize milestones and delivery checks' },
  lattice: { kind: 'thinking', duration: 940, zh: '梳理组件依赖与数据流', en: 'map component dependencies and data flow' },
  strata: { kind: 'file', duration: 1290, zh: '检查体验、实现与验证三层', en: 'inspect experience, implementation, and validation layers' },
  meridian: { kind: 'thinking', duration: 1130, zh: '交叉检查设计与工程约束', en: 'cross-check design and engineering constraints' },
  vanta: { kind: 'terminal', duration: 380, zh: '定位关键约束，压缩变更范围', en: 'isolate the key constraint and narrow the change' },
  apex: { kind: 'test', duration: 1480, zh: '串联原型、验证与交付预览', en: 'connect prototype, validation, and delivery preview' },
};

/** Offline, deterministic entertainment. This never executes code or claims a real tool result. */
export function createDemoResponse({ prompt, modelId, effort, language, history = [] }: DemoInput): DemoResponse {
  const persona = getModel(modelId);
  const zh = language === 'zh';
  const depth = Math.max(0, getEfforts(persona.generation).indexOf(normalizeEffort(effort,persona.generation)));
  const cleanPrompt = prompt.trim().replace(/\s+/g, ' ').slice(0, 240);
  const prior = [...history].reverse().find(item => item.role === 'user' && item.content.trim() !== prompt.trim());
  const followsUp = /继续|再|上面|之前|这个|它|continue|previous|that|this|again|also|more/i.test(prompt) && prior;
  const coding = /代码|编程|组件|网页|网站|应用|修复|测试|终端|git|code|build|app\b|component|website|fix|test|terminal|react|python|script/i.test(prompt);
  const writing = /写作|文案|诗|邮件|总结|write|poem|email|summari|story/i.test(prompt) && !coding;
  const greeting = /^(你好|嗨|hello|hi|hey|早上好|晚上好|谢谢|thanks)[！!。.\s]*$/i.test(prompt.trim());
  const approach = approaches[persona.id][language];
  const concept = zh ? `GPT-${persona.version} ${persona.name} · 概念风格` : `GPT-${persona.version} ${persona.name} · concept persona`;
  const disclaimer = zh ? '离线 Demo · 以下为预设演示，不是真实 AI 推理或执行结果。' : 'Offline Demo · This is a scripted preview, not live AI reasoning or execution.';
  const context = followsUp ? (zh ? `\n\n延续上一条需求「${prior.content.slice(0, 100)}」的上下文。` : `\n\nContinuing the earlier request: “${prior.content.slice(0, 100)}”.`) : '';
  let body: string;
  const files: DemoFile[] = [];
  if (greeting) {
    body = zh ? `你好！我是 ${persona.name} 的概念演示风格。${approach}\n\n可以试试「创建一个计数器组件」或「演示一次代码审查」。连接官方 Codex 后，就能获得真实的自由对话。` : `Hello! This is the ${persona.name} concept persona. ${approach}\n\nTry “Build a counter component” or “Show a code review demo”. Connect official Codex for live, open-ended conversation.`;
  } else if (coding) {
    const label = zh ? '计数器' : 'Counter';
    const code = `import { useState } from 'react';\n\nexport function Counter() {\n  const [count, setCount] = useState(0);\n  return (\n    <section aria-label="${label}">\n      <output aria-live="polite">{count}</output>\n      <button onClick={() => setCount(value => value + 1)}>\n        +1\n      </button>\n      <button onClick={() => setCount(0)}>Reset</button>\n    </section>\n  );\n}\n`;
    files.push({ path: 'src/components/Counter.tsx', before: `export function Counter() {\n  return <div>0</div>;\n}\n`, after: code });
    if (depth >= 2) files.push({ path: 'src/components/Counter.test.tsx', before: '', after: `// ${persona.name} concept demonstration — not executed\nimport { render, screen, fireEvent } from '@testing-library/react';\nimport { expect, test } from 'vitest';\nimport { Counter } from './Counter';\n\ntest('increments and resets the counter', () => {\n  render(<Counter />);\n  fireEvent.click(screen.getByRole('button', { name: '+1' }));\n  expect(screen.getByRole('status').textContent).toBe('1');\n  fireEvent.click(screen.getByRole('button', { name: 'Reset' }));\n  expect(screen.getByRole('status').textContent).toBe('0');\n});\n` });
    const fence = '```';
    body = zh ? `收到需求：「${cleanPrompt}」。${context}\n\n${approach}\n\n这次离线演示使用一个 React 计数器展示代码、Diff 和任务流程；它不是针对任意需求自动生成的实现。\n\n${fence}tsx\n${code.trim()}\n${fence}` : `Request: “${cleanPrompt}”.${context}\n\n${approach}\n\nThis offline preview uses a React counter to demonstrate code, diffs, and a task workflow; it is not an implementation generated for every possible request.\n\n${fence}tsx\n${code.trim()}\n${fence}`;
    if (depth >= 2) body += zh ? '\n\n演示验证点：点击递增、重置归零、读屏状态更新。测试文件会出现在模拟 Diff 中，实际测试并未运行。' : '\n\nExample checks: increment, reset, and accessible status updates. A test file appears in the simulated diff; no tests were actually run.';
    if (depth >= 4) body += zh ? '\n\n进一步检查：快速连续点击应保留每次更新；重复重置应保持幂等；键盘焦点应清晰可见。' : '\n\nFurther checks: rapid clicks should preserve each update; repeated resets should be idempotent; keyboard focus should remain visible.';
    if (depth >= 5) body += zh ? '\n\nUltra 演示附加：先独立验证状态转换，再检查界面与持久化的边界。这一档增加预设内容和动画阶段，不代表真实模型能力。' : '\n\nUltra preview: verify state transitions independently, then inspect UI and persistence boundaries. This level adds scripted content and animation stages, not real model capability.';
    if (depth === 6) body += zh ? '\n\nUltimate 概念演示：追加一次独立的交付复核和整体一致性检查。这仍是本地预设，不代表官方存在更高推理等级。' : '\n\nUltimate concept preview: add an independent delivery review and consistency check. This is a local preset, not an official higher reasoning level.';
  } else if (writing) {
    body = zh ? `写作需求：「${cleanPrompt}」。${context}\n\n${approach}\n\n示例草稿：\n\n> 一个想法，不必从完美开始。把第一步写下来，让下一个动作变得清楚；在每一次尝试里，逐渐找到更好的答案。\n\n这是展示 ${persona.name} 表达方式的固定范例。连接 Codex 后可以围绕你的实际主题生成和修改内容。` : `Writing request: “${cleanPrompt}”.${context}\n\n${approach}\n\nSample draft:\n\n> An idea does not have to start perfectly. Write down the first step and make the next action clear. Each small attempt can bring a better answer into view.\n\nThis is a fixed example of the ${persona.name} voice. Connect Codex to draft and revise content for your actual subject.`;
  } else {
    body = zh ? `你的问题：「${cleanPrompt}」。${context}\n\n${approach}\n\n当前是离线预设演示，因此我不能对这个任意问题提供真实模型答案。你可以连接官方 Codex 进行自由对话，或输入「演示生成 React 组件」来体验完整的模拟执行流程。` : `Your question: “${cleanPrompt}”.${context}\n\n${approach}\n\nThis is an offline scripted demo, so I cannot provide a live model answer to an arbitrary question. Connect official Codex for open-ended conversation, or try “Demo a React component” to explore the simulated execution workflow.`;
  }
  const thinkingDuration = [180, 450, 900, 1600, 2400, 3400, 4400][depth];
  const steps: DemoStep[] = [{ id: 'think', kind: 'thinking', label: zh ? `模拟思考 · ${persona.name} · ${effort}` : `Simulated thinking · ${persona.name} · ${effort}`, duration: thinkingDuration }];
  if(depth===6)steps.push({id:'ultimate-review',kind:'thinking',label:zh?'模拟 Ultimate · 交叉复核整体一致性':'Simulated Ultimate · cross-check overall consistency',duration:1400});
  if (coding) {
    if (depth >= 3) steps.push({ id: 'inspect', kind: 'terminal', label: zh ? '模拟终端 · 读取项目结构' : 'Simulated terminal · inspect project structure', duration: 800 });
    const personaStage = personaStages[persona.id];
    steps.push({ id: `persona-${persona.id}`, kind: personaStage.kind, label: zh ? `模拟 ${persona.name} · ${personaStage.zh}` : `Simulated ${persona.name} · ${personaStage.en}`, duration: personaStage.duration });
    steps.push({ id: 'file', kind: 'file', label: zh ? '模拟修改 · Counter.tsx' : 'Simulated edit · Counter.tsx', duration: 1100 });
    if (depth >= 2) steps.push({ id: 'test', kind: 'test', label: zh ? '模拟测试 · 计数与重置场景' : 'Simulated tests · increment and reset scenarios', duration: 1200 });
    if (depth >= 4) steps.push({ id: 'review', kind: 'thinking', label: zh ? '模拟审查 · 边界与可访问性' : 'Simulated review · boundaries and accessibility', duration: 1000 });
    steps.push({ id: 'git', kind: 'git', label: zh ? '模拟 Git · 准备变更摘要' : 'Simulated Git · prepare change summary', duration: 600 });
  }
  return { text: `${disclaimer}\n\n${concept}\n\n${body}`, steps, files };
}

