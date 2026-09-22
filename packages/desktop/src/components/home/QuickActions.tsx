import React, { useState } from 'react';
import { BookOpen, BarChart2, FlaskConical, Code2, Sparkles, X, ArrowRight } from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useLanguage } from '../../context/LanguageContext';
import { useNav } from '../../context/NavContext';

/**
 * A single free-text question asked before a quick-start session is
 * launched. Answers are concatenated into the first prompt -- there is no
 * separate "intake form" data structure downstream, this is purely a
 * convenience so the user doesn't have to write the whole research brief
 * as one paragraph in the composer.
 */
interface QuickStartQuestion {
  key: string;
  labelEn: string;
  labelZh: string;
  placeholderEn: string;
  placeholderZh: string;
  required?: boolean;
}

interface QuickStartDef {
  id: string;
  labelEn: string;
  labelZh: string;
  icon: React.ElementType;
  sessionType: 'chat' | 'research';
  /** Only meaningful when sessionType === 'research' -- ChatEngine ignores it. */
  researchProfileId?: string;
  questions: QuickStartQuestion[];
  /** Builds the first prompt from the answers (keyed by question.key). */
  buildPrompt: (answers: Record<string, string>, t: (en: string, zh: string) => string) => string;
}

const QUICK_STARTS: QuickStartDef[] = [
  {
    id: 'qa-lit',
    labelEn: 'Literature Review',
    labelZh: '文献综述',
    icon: BookOpen,
    sessionType: 'research',
    researchProfileId: 'literature-review',
    questions: [
      {
        key: 'topic',
        labelEn: 'Review topic',
        labelZh: '综述主题',
        placeholderEn: 'e.g. Recent therapeutic targets for autoimmune diseases',
        placeholderZh: '例如：自身免疫疾病的最新治疗靶点',
        required: true,
      },
      {
        key: 'timeRange',
        labelEn: 'Time range (optional)',
        labelZh: '时间范围（可选）',
        placeholderEn: 'e.g. last 5 years',
        placeholderZh: '例如：近 5 年',
      },
    ],
    buildPrompt: (a, t) => {
      const timeRange = a.timeRange?.trim();
      return (
        t(`Conduct a systematic literature review on: ${a.topic}.`, `请围绕以下主题进行系统性文献综述：${a.topic}。`) +
        (timeRange
          ? ' ' + t(`Focus on the time range: ${timeRange}.`, `请重点关注时间范围：${timeRange}。`)
          : '')
      );
    },
  },
  {
    id: 'qa-data',
    labelEn: 'Data Analysis',
    labelZh: '数据分析',
    icon: BarChart2,
    sessionType: 'research',
    researchProfileId: 'general',
    questions: [
      {
        key: 'dataset',
        labelEn: 'Dataset / file(s)',
        labelZh: '数据集 / 文件',
        placeholderEn: 'e.g. GSE181283 scRNA-seq dataset',
        placeholderZh: '例如：GSE181283 单细胞 RNA 测序数据集',
        required: true,
      },
      {
        key: 'question',
        labelEn: 'What do you want to find out?',
        labelZh: '想要分析的问题',
        placeholderEn: 'e.g. Differential gene expression and pathway enrichment',
        placeholderZh: '例如：差异基因表达与通路富集分析',
        required: true,
      },
    ],
    buildPrompt: (a, t) =>
      t(
        `Analyze the following dataset: ${a.dataset}. Specifically: ${a.question}.`,
        `请分析以下数据集：${a.dataset}。具体分析目标：${a.question}。`
      ),
  },
  {
    id: 'qa-exp',
    labelEn: 'Experiment Design',
    labelZh: '实验设计',
    icon: FlaskConical,
    sessionType: 'research',
    researchProfileId: 'general',
    questions: [
      {
        key: 'goal',
        labelEn: 'Research target / goal',
        labelZh: '研究对象 / 目标',
        placeholderEn: 'e.g. CRISPR-Cas9 knockout validation for STAT4 in primary human T-cells',
        placeholderZh: '例如：在原代人 T 细胞中对 STAT4 进行 CRISPR-Cas9 敲除验证',
        required: true,
      },
      {
        key: 'constraints',
        labelEn: 'Existing conditions / resources (optional)',
        labelZh: '已有条件 / 资源（可选）',
        placeholderEn: 'e.g. available cell lines, equipment, budget',
        placeholderZh: '例如：现有细胞系、设备、预算',
      },
    ],
    buildPrompt: (a, t) => {
      const constraints = a.constraints?.trim();
      return (
        t(`Design an experiment for: ${a.goal}.`, `请针对以下目标设计实验方案：${a.goal}。`) +
        (constraints
          ? ' ' + t(`Existing conditions/resources: ${constraints}.`, `已有条件/资源：${constraints}。`)
          : '')
      );
    },
  },
  {
    id: 'qa-code',
    labelEn: 'Code Assistant',
    labelZh: '代码助手',
    icon: Code2,
    sessionType: 'chat',
    questions: [
      {
        key: 'task',
        labelEn: 'What do you need written?',
        labelZh: '需要编写的脚本/任务',
        placeholderEn: 'e.g. Train a GNN for molecular property prediction',
        placeholderZh: '例如：训练一个用于分子属性预测的 GNN 模型',
        required: true,
      },
      {
        key: 'stack',
        labelEn: 'Language / libraries (optional)',
        labelZh: '语言 / 库（可选）',
        placeholderEn: 'e.g. Python, PyTorch Geometric, Scanpy',
        placeholderZh: '例如：Python、PyTorch Geometric、Scanpy',
      },
    ],
    buildPrompt: (a, t) => {
      const stack = a.stack?.trim();
      return (
        t(`Write code for: ${a.task}.`, `请编写代码完成以下任务：${a.task}。`) +
        (stack ? ' ' + t(`Use: ${stack}.`, `使用：${stack}。`) : '')
      );
    },
  },
];

export const QuickActions: React.FC = () => {
  const { startQuickSession } = useAgent();
  const { t, language } = useLanguage();
  const { setActiveSection } = useNav();

  const [activeDef, setActiveDef] = useState<QuickStartDef | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const openModal = (def: QuickStartDef) => {
    setAnswers({});
    setActiveDef(def);
  };

  const closeModal = () => {
    if (submitting) return;
    setActiveDef(null);
    setAnswers({});
  };

  const canSubmit =
    !!activeDef && activeDef.questions.every((q) => !q.required || (answers[q.key] || '').trim().length > 0);

  const handleSubmit = async () => {
    if (!activeDef || !canSubmit || submitting) return;
    const prompt = activeDef.buildPrompt(answers, t);
    setSubmitting(true);
    try {
      await startQuickSession(prompt, activeDef.sessionType, activeDef.researchProfileId || 'general');
      setActiveDef(null);
      setAnswers({});
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2.5 mt-3 select-none">
        {QUICK_STARTS.map((def) => {
          const Icon = def.icon;
          const label = language === 'zh' ? def.labelZh : def.labelEn;
          return (
            <button
              key={def.id}
              onClick={() => openModal(def)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-bg-surface hover:bg-bg-hover hover:border-accent/40 text-text-secondary hover:text-text-primary text-[12.5px] font-medium transition-all group shadow-sm"
            >
              <Icon size={14} className="text-text-muted group-hover:text-accent transition-colors" />
              <span>{label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setActiveSection('skills')}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-bg-surface hover:bg-bg-hover hover:border-accent/40 text-text-secondary hover:text-text-primary text-[12.5px] font-medium transition-all group shadow-sm"
        >
          <Sparkles size={14} className="text-text-muted group-hover:text-accent transition-colors" />
          <span>{t('More', '更多')}</span>
        </button>
      </div>

      {activeDef && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
          <div className="w-full max-w-[480px] rounded-2xl bg-bg-surface border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <activeDef.icon size={16} className="text-accent" />
                <h3 className="text-[14.5px] font-semibold text-text-primary">
                  {language === 'zh' ? activeDef.labelZh : activeDef.labelEn}
                </h3>
              </div>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="px-5 py-4 flex flex-col gap-3.5 max-h-[60vh] overflow-y-auto">
              {activeDef.questions.map((q) => (
                <div key={q.key} className="flex flex-col gap-1.5">
                  <label className="text-xs font-medium text-text-secondary">
                    {language === 'zh' ? q.labelZh : q.labelEn}
                    {q.required && <span className="text-red-400 ml-0.5">*</span>}
                  </label>
                  <input
                    autoFocus={activeDef.questions[0].key === q.key}
                    type="text"
                    value={answers[q.key] || ''}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.key]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && canSubmit) handleSubmit();
                    }}
                    placeholder={language === 'zh' ? q.placeholderZh : q.placeholderEn}
                    className="w-full px-3 py-2 rounded-lg border border-border-subtle bg-bg-elevated text-[13px] text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/50 focus:border-accent/50 transition-colors"
                  />
                </div>
              ))}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-border bg-bg-elevated/40">
              <button
                onClick={closeModal}
                disabled={submitting}
                className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
              >
                {t('Cancel', '取消')}
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? t('Starting…', '启动中…') : t('Start', '开始')}
                {!submitting && <ArrowRight size={13} />}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
