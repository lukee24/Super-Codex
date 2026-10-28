export type Language = 'zh' | 'en';
export type Localized<T = string> = Record<Language, T>;
export const EFFORTS = ['Instant', 'Low', 'Medium', 'High', 'Extra High', 'Ultra'] as const;
export const ALL_EFFORTS = [...EFFORTS, 'Ultimate'] as const;
export type Effort = typeof ALL_EFFORTS[number];
/** Ultimate is a local presentation preset for the GPT-10 concept only. */
export const getEfforts = (generation: number): readonly Effort[] => generation >= 10 ? ALL_EFFORTS : EFFORTS;
export function normalizeEffort(effort: unknown, generation: number): Effort {
  if (effort === 'Ultimate') return generation >= 10 ? 'Ultimate' : 'Ultra';
  return EFFORTS.includes(effort as typeof EFFORTS[number]) ? effort as Effort : 'High';
}
export const SPEEDS = [1, 2, 5, 10, 20, 50] as const;
export type Speed = typeof SPEEDS[number];

export interface Model {
  id: string;
  name: string;
  version: string;
  generation: number;
  description: Localized;
  style: Localized;
  capabilities: Localized<string[]>;
  color: string;
}

const model = (id: string, name: string, version: string, generation: number,
  zh: string, en: string, styleZh: string, styleEn: string,
  zhCaps: string[], enCaps: string[], color: string): Model => ({
  id, name, version, generation, description: { zh, en }, style: { zh: styleZh, en: styleEn },
  capabilities: { zh: zhCaps, en: enCaps }, color,
});

/** Fictional personas, never API model identifiers or claims of future availability. */
export const MODELS: Model[] = [
  model('astra', 'Astra', '6.0', 6, '深入思考，清晰解释。', 'Deep thinking. Clear explanations.', '严谨、循序渐进，先说明假设再得出结论。', 'Methodical and explicit: state assumptions, reason carefully, then conclude.', ['复杂推理', '研究分析', '架构设计'], ['Complex reasoning', 'Research', 'Architecture'], '#9775b5'),
  model('sol', 'Sol', '6.1', 6, '让每一天的工作更轻松。', 'An everyday creative workhorse.', '亲切、务实，给出简短可执行的建议。', 'Warm and practical, with concise, actionable suggestions.', ['日常编程', '快速问答', '协作写作'], ['Everyday coding', 'Quick answers', 'Collaborative writing'], '#d3a267'),
  model('terra', 'Terra', '6.1', 6, '稳健实现，关注每个边界。', 'Grounded engineering. Reliable results.', '稳定、工程化，优先可维护性、边界条件和验证。', 'Grounded engineering that prioritizes maintainability, edge cases, and verification.', ['代码审查', '可靠性', '重构'], ['Code review', 'Reliability', 'Refactoring'], '#7c9c81'),
  model('cinder', 'Cinder', '6.2', 6, '把灵感变成第一个原型。', 'Turn a spark into a first prototype.', '直接、有冲劲，以最小原型和快速迭代组织回答。', 'Energetic and direct, organized around a minimal prototype and fast iteration.', ['快速原型', '创意探索', '前端开发'], ['Rapid prototypes', 'Ideation', 'Frontend'], '#c87962'),
  model('glyph', 'Glyph', '6.3', 6, '精确表达，优雅的细节。', 'Precise words. Thoughtful details.', '精炼、注重命名与表达，用精确示例消除歧义。', 'Precise and language-aware, using careful naming and concrete examples.', ['文案创作', '类型系统', '界面细节'], ['Writing', 'Type systems', 'UI craft'], '#8896c3'),
  model('helio', 'Helio', '6.5', 6, '把复杂想法解释得明白。', 'Make complex ideas feel clear.', '耐心、直观，用类比和分步骤教学解释复杂概念。', 'Patient and intuitive, teaching through analogies and small steps.', ['学习辅导', '概念解释', '文档'], ['Tutoring', 'Explanations', 'Documentation'], '#c2a34d'),
  model('vector', 'Vector', '6.8', 6, '找到最短的实现路径。', 'Find the shortest path to a solution.', '紧凑、量化，强调约束、复杂度和性能取舍。', 'Compact and quantitative, emphasizing constraints, complexity, and performance.', ['算法', '性能分析', '数据处理'], ['Algorithms', 'Performance', 'Data processing'], '#5e9da4'),
  model('sable', 'Sable', '7.0', 7, '谨慎审视，发现隐藏风险。', 'A careful eye for hidden risks.', '冷静、审慎，先梳理风险与未知，再提出验证步骤。', 'Calm and cautious: identify risks and unknowns, then propose verification.', ['风险分析', '安全审查', '故障排查'], ['Risk analysis', 'Security review', 'Debugging'], '#8d879b'),
  model('axiom', 'Axiom', '7.2', 7, '从第一性原理开始。', 'Start from first principles.', '逻辑严密，以定义、前提和可检验结论组织内容。', 'Logically structured around definitions, premises, and testable conclusions.', ['数学推导', '系统设计', '逻辑验证'], ['Mathematics', 'Systems design', 'Logical validation'], '#9299ae'),
  model('helix', 'Helix', '7.5', 7, '并行探索不同的可能。', 'Explore several possibilities at once.', '探索式、善于对比，提出多个方案并解释选择依据。', 'Exploratory and comparative, offering alternatives and explaining the choice.', ['多方案探索', '跨领域思考', '产品构想'], ['Alternative solutions', 'Cross-domain thinking', 'Product concepts'], '#a891ba'),
  model('crest', 'Crest', '7.9', 7, '把全局目标拆成可执行的步骤。', 'Translate the big picture into next steps.', '全局视角、结果导向，明确里程碑、依赖与交付标准。', 'Outcome-focused and strategic, with milestones, dependencies, and acceptance criteria.', ['项目规划', '任务编排', '复杂交付'], ['Project planning', 'Orchestration', 'Complex delivery'], '#789e9a'),
  model('lattice', 'Lattice', '8.0', 8, '看见系统之间的联系。', 'See how systems connect.', '结构化、关联式，绘制组件、数据流与约束之间的关系。', 'Structural and relational, mapping components, data flows, and constraints.', ['系统建模', '依赖分析', '知识关联'], ['System modeling', 'Dependency analysis', 'Knowledge connections'], '#7e9bb6'),
  model('strata', 'Strata', '8.5', 8, '逐层深入，保持清晰。', 'Go deeper, one clear layer at a time.', '分层、细致，从概览逐步深入实现、验证和维护。', 'Layered and detailed, moving from overview to implementation, validation, and maintenance.', ['深度分析', '大型代码库', '分层架构'], ['Deep analysis', 'Large codebases', 'Layered architecture'], '#ad937b'),
  model('meridian', 'Meridian', '9.0', 9, '跨越领域，连接想法。', 'Connect ideas across disciplines.', '综合、开放，把不同领域的线索整合成一致的判断。', 'Integrative and open-minded, combining evidence across disciplines.', ['跨领域研究', '全局规划', '多语言协作'], ['Cross-domain research', 'Strategic planning', 'Multilingual work'], '#8d9f7a'),
  model('vanta', 'Vanta', '9.5', 9, '在噪声中找到关键。', 'Find the signal in the noise.', '简洁、敏锐，压缩冗余，突出最关键的约束和下一步。', 'Concise and incisive, cutting noise to surface the key constraint and next action.', ['信息提炼', '复杂调试', '决策支持'], ['Synthesis', 'Complex debugging', 'Decision support'], '#8e8a9b'),
  model('apex', 'Apex', '10.0', 10, '关于未来协作的大胆想象。', 'An ambitious vision of future collaboration.', '全面、富有想象力，把创意、实现和验证衔接成完整方案。', 'Comprehensive and imaginative, connecting ideas, implementation, and verification.', ['端到端构想', '创意工程', '综合规划'], ['End-to-end concepts', 'Creative engineering', 'Comprehensive planning'], '#b19461'),
];

export interface Plan {
  id: string;
  name: string;
  price: number;
  fictional: boolean;
  description: Localized;
  features: Localized<string[]>;
  quota: number;
}
const plan = (id: string, name: string, price: number, fictional: boolean, quota: number,
  zh: string, en: string, zhFeatures: string[], enFeatures: string[]): Plan => ({
  id, name, price, fictional, quota, description: { zh, en }, features: { zh: zhFeatures, en: enFeatures },
});

/** User-supplied reference prices. All purchases are free local simulations. */
export const PLANS: Plan[] = [
  plan('free', 'Free', 0, false, 50, '探索灵感的起点', 'A starting point for your ideas', ['基础演示额度', '全部 16 个概念型号', '无限使用本地重置器'], ['Basic demo allowance', 'All 16 concept personas', 'Unlimited local resets']),
  plan('go', 'Go', 8, false, 100, '为日常灵感留出更多空间', 'More room for everyday ideas', ['Free 的全部演示功能', '2× 本地演示额度', '模拟文件与终端'], ['All Free demo features', '2× local demo allowance', 'Simulated files and terminal']),
  plan('plus', 'Plus', 20, false, 250, '把更多想法变成现实', 'Bring more ideas to life', ['Go 的全部演示功能', '5× 本地演示额度', '增强任务动画与历史'], ['All Go demo features', '5× local demo allowance', 'Enhanced task animations and history']),
  plan('pro-100', 'Pro 100', 100, false, 1000, '为专注的工作流准备', 'For focused workflows', ['Plus 的全部演示功能', '20× 本地演示额度', '高级演示任务编排'], ['All Plus demo features', '20× local demo allowance', 'Advanced simulated orchestration']),
  plan('pro-200', 'Pro 200', 200, false, 2000, '为更复杂的项目留出空间', 'Room for more complex projects', ['Pro 100 的全部演示功能', '40× 本地演示额度', '完整演示执行视图'], ['All Pro 100 demo features', '40× local demo allowance', 'Full simulated execution view']),
  plan('pro-500', 'Pro 500', 500, false, 5000, '为密集创作而设', 'For intensive creative work', ['Pro 200 的全部演示功能', '100× 本地演示额度', '扩展的本地演示容量'], ['All Pro 200 demo features', '100× local demo allowance', 'Expanded local demo capacity']),
  plan('pro-max', 'Pro Max', 799, true, 7990, '更大胆的概念体验', 'An even bolder concept experience', ['全部基础演示功能', '159.8× 本地演示额度', 'Pro Max 虚构会员标识'], ['All standard demo features', '159.8× local demo allowance', 'Fictional Pro Max membership badge']),
  plan('ultra', 'Ultra', 999, true, 9990, '把想象力推向新高度', 'Take imagination further', ['Pro Max 的全部演示功能', '199.8× 本地演示额度', 'Ultra 虚构会员标识'], ['All Pro Max demo features', '199.8× local demo allowance', 'Fictional Ultra membership badge']),
  plan('infinity', 'Infinity', 1999, true, 19990, '让演示继续下去', 'Keep the demo going', ['Ultra 的全部演示功能', '399.8× 本地演示额度', 'Infinity 虚构会员标识'], ['All Ultra demo features', '399.8× local demo allowance', 'Fictional Infinity membership badge']),
  plan('ultimate', 'Ultimate', 3999, true, 39990, '概念演示的完整体验', 'The complete concept experience', ['Infinity 的全部演示功能', '799.8× 本地演示额度', 'Ultimate 虚构会员标识'], ['All Infinity demo features', '799.8× local demo allowance', 'Fictional Ultimate membership badge']),
];

export const getModel = (id: string): Model => MODELS.find(item => item.id === id) ?? MODELS[1];
export const getPlan = (id: string): Plan => PLANS.find(item => item.id === id) ?? PLANS[0];
export const effortLabel = (effort: Effort, language: Language): string => language === 'en' ? effort : ({
  Instant: '即时', Low: '低', Medium: '中', High: '高', 'Extra High': '超高', Ultra: '极致', Ultimate: '终极',
} as Record<Effort, string>)[effort];
