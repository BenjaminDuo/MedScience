import React, { useState } from 'react';
import {
  FlaskConical,
  Dna,
  Search,
  Atom,
  BarChart3,
  Stethoscope,
  BookOpen,
  Activity,
  Play,
  CheckCircle,
  Sparkles,
} from 'lucide-react';
import { useAgent } from '../../context/AgentContext';
import { useNav } from '../../context/NavContext';
import { useLanguage } from '../../context/LanguageContext';

interface SkillItem {
  id: string;
  category: string;
  categoryIcon: React.ElementType;
  name: string;
  nameZh: string;
  summary: string;
  summaryZh: string;
  sopSteps: string[];
  sopStepsZh: string[];
  sampleInquiry: string;
  sampleInquiryZh: string;
  connectors: string[];
}

const skillsCatalog: SkillItem[] = [
  // 1. Molecular Biology & Structural Genomics
  {
    id: 'alphafold-structure-analysis',
    category: 'Molecular Biology',
    categoryIcon: Dna,
    name: 'AlphaFold Structure & Domain Analysis',
    nameZh: 'AlphaFold 结构与结构域分析',
    summary: 'Predicts full-length 3D structure, calculates pLDDT confidence scores, and identifies cryptic druggable pockets.',
    summaryZh: '预测全长三维结构，计算 pLDDT 置信度评分，并识别潜在的可成药隐蔽口袋。',
    sopSteps: ['Fetch UniProt sequence', 'Query AlphaFold DB / ColabFold', 'Calculate per-residue pLDDT', 'Identify disordered loops'],
    sopStepsZh: ['获取 UniProt 序列', '查询 AlphaFold DB / ColabFold', '计算逐残基 pLDDT', '识别无序环区'],
    sampleInquiry: 'Fetch AlphaFold 3D structure for TYK2 (P29597) and evaluate pLDDT confidence in JH2 pseudokinase domain.',
    sampleInquiryZh: '获取 TYK2（P29597）的 AlphaFold 三维结构，并评估 JH2 假激酶结构域的 pLDDT 置信度。',
    connectors: ['UniProtKB', 'AlphaFoldDB', 'PyMOL'],
  },
  {
    id: 'crispr-off-target-screen',
    category: 'Molecular Biology',
    categoryIcon: Dna,
    name: 'CRISPR Guide RNA Off-Target Predictor',
    nameZh: 'CRISPR 向导 RNA 脱靶预测',
    summary: 'Screens sgRNA sequences for genome-wide cutting specificity, mismatch penalties, and chromatin accessibility.',
    summaryZh: '筛查 sgRNA 序列的全基因组切割特异性、错配罚分与染色质可及性。',
    sopSteps: ['Extract 20nt protospacer', 'Scan PAM (NGG) sites in GRCh38', 'Calculate CFD mismatch matrix', 'Output off-target table'],
    sopStepsZh: ['提取 20nt 原间隔序列', '在 GRCh38 中扫描 PAM（NGG）位点', '计算 CFD 错配矩阵', '输出脱靶位点表'],
    sampleInquiry: 'Screen CRISPR sgRNA guides targeting human STAT4 exon 3 and score potential genomic off-targets.',
    sampleInquiryZh: '筛查靶向人类 STAT4 外显子 3 的 CRISPR sgRNA 向导，并对潜在的基因组脱靶位点打分。',
    connectors: ['Ensembl', 'NCBI BLAST', 'UCSC Browser'],
  },
  {
    id: 'uniprot-target-profiler',
    category: 'Molecular Biology',
    categoryIcon: Dna,
    name: 'UniProt Target & PTM Annotation',
    nameZh: 'UniProt 靶点与翻译后修饰注释',
    summary: 'Retrieves active catalytic residues, post-translational modifications, and pathogenic disease variants.',
    summaryZh: '获取活性催化残基、翻译后修饰位点及致病性疾病变异。',
    sopSteps: ['Query UniProtKB REST API', 'Parse catalytic triad & active site', 'Map ClinVar missense variants', 'Construct topology'],
    sopStepsZh: ['查询 UniProtKB REST API', '解析催化三联体与活性位点', '映射 ClinVar 错义变异', '构建跨膜拓扑结构'],
    sampleInquiry: 'Profile human JAK1 (P23458) active kinase domain residues, phosphorylation sites, and known drug-resistant mutations.',
    sampleInquiryZh: '分析人类 JAK1（P23458）激酶结构域的活性残基、磷酸化位点及已知耐药突变。',
    connectors: ['UniProtKB', 'ClinVar', 'InterPro'],
  },
  {
    id: 'protein-msa-conservation',
    category: 'Molecular Biology',
    categoryIcon: Dna,
    name: 'Clustal-Omega MSA & Residue Conservation',
    nameZh: 'Clustal-Omega 多序列比对与残基保守性',
    summary: 'Performs multiple sequence alignment across orthologs and computes Shannon entropy conservation.',
    summaryZh: '对直系同源序列进行多序列比对，并计算香农熵保守性评分。',
    sopSteps: ['Collect orthologous FASTA sequences', 'Run Clustal-Omega MSA', 'Score residue conservation', 'Highlight invariant motifs'],
    sopStepsZh: ['收集直系同源 FASTA 序列', '运行 Clustal-Omega 多序列比对', '计算残基保守性评分', '标注高度保守基序'],
    sampleInquiry: 'Perform multiple sequence alignment for human, mouse, and rat IL-23R to locate conserved binding motifs.',
    sampleInquiryZh: '对人、小鼠、大鼠的 IL-23R 进行多序列比对，定位保守的结合基序。',
    connectors: ['EMBL-EBI ClustalW', 'NCBI RefSeq'],
  },

  // 2. Cheminformatics & Drug Discovery
  {
    id: 'chembl-target-docking',
    category: 'Cheminformatics',
    categoryIcon: Atom,
    name: 'ChEMBL Bioactivity & IC50 Mining',
    nameZh: 'ChEMBL 生物活性与 IC50 挖掘',
    summary: 'Extracts experimental binding affinities, Ki/Kd constants, and selectivity indexes from peer-reviewed assays.',
    summaryZh: '从同行评审的实验数据中提取结合亲和力、Ki/Kd 常数及选择性指数。',
    sopSteps: ['Query ChEMBL Target API', 'Filter bioactivity measurements', 'Normalize pChEMBL values', 'Generate structure-activity plot'],
    sopStepsZh: ['查询 ChEMBL Target API', '筛选生物活性数据', '归一化 pChEMBL 数值', '生成构效关系图'],
    sampleInquiry: 'Extract all small molecules with IC50 < 50nM against TYK2 JH2 domain from ChEMBL database.',
    sampleInquiryZh: '从 ChEMBL 数据库中提取所有对 TYK2 JH2 结构域 IC50 < 50nM 的小分子。',
    connectors: ['ChEMBL v33', 'PubChem', 'RDKit'],
  },
  {
    id: 'pubchem-substructure-search',
    category: 'Cheminformatics',
    categoryIcon: Atom,
    name: 'PubChem Substructure & Tanimoto Similarity',
    nameZh: 'PubChem 子结构与 Tanimoto 相似度搜索',
    summary: 'Performs 2D fingerprint hashing, Morgan substructure scans, and Tanimoto coefficient clustering.',
    summaryZh: '执行二维指纹哈希、Morgan 子结构扫描与 Tanimoto 系数聚类。',
    sopSteps: ['Parse SMILES/InChIKey', 'Generate Morgan 2048-bit fingerprints', 'Compute pairwise Tanimoto scores', 'Cluster scaffolds'],
    sopStepsZh: ['解析 SMILES/InChIKey', '生成 Morgan 2048 位指纹', '计算两两 Tanimoto 相似度', '对骨架进行聚类'],
    sampleInquiry: 'Screen PubChem for compounds sharing >0.85 Tanimoto similarity with deucravacitinib (CID 134821691).',
    sampleInquiryZh: '在 PubChem 中筛选与 deucravacitinib（CID 134821691）Tanimoto 相似度 >0.85 的化合物。',
    connectors: ['PubChem PUG-REST', 'RDKit'],
  },
  {
    id: 'admet-property-profiler',
    category: 'Cheminformatics',
    categoryIcon: Atom,
    name: 'ADMET Pharmacokinetics & QSAR Profiler',
    nameZh: 'ADMET 药代动力学与 QSAR 分析',
    summary: 'Evaluates Lipinski Rule of 5, hERG cardiac toxicity liability, blood-brain barrier permeability, and CYP metabolism.',
    summaryZh: '评估 Lipinski 五规则、hERG 心脏毒性风险、血脑屏障通透性及 CYP 代谢情况。',
    sopSteps: ['Calculate MW, LogP, TPSA, HBD/HBA', 'Predict CYP450 inhibition profiles', 'Estimate oral bioavailability', 'Flag toxicophores'],
    sopStepsZh: ['计算分子量、LogP、TPSA、HBD/HBA', '预测 CYP450 抑制谱', '估算口服生物利用度', '标记潜在毒性基团'],
    sampleInquiry: 'Predict ADMET properties, Lipinski compliance, and CYP3A4 metabolic stability for kinase inhibitor lead candidate.',
    sampleInquiryZh: '预测某激酶抑制剂先导化合物的 ADMET 性质、Lipinski 符合度及 CYP3A4 代谢稳定性。',
    connectors: ['SwissADME API', 'RDKit'],
  },

  // 3. Biostatistics & Bioinformatics
  {
    id: 'differential-expression-deseq2',
    category: 'Bioinformatics',
    categoryIcon: BarChart3,
    name: 'RNA-seq Differential Expression (DESeq2)',
    nameZh: 'RNA-seq 差异表达分析（DESeq2）',
    summary: 'Applies negative binomial generalized linear models, Wald tests, and Benjamini-Hochberg FDR correction.',
    summaryZh: '采用负二项广义线性模型、Wald 检验及 Benjamini-Hochberg FDR 校正。',
    sopSteps: ['Load raw count matrix', 'Estimate dispersion parameters', 'Execute DESeq2 GLM Wald test', 'Generate volcano and MA plots'],
    sopStepsZh: ['加载原始计数矩阵', '估计离散度参数', '执行 DESeq2 GLM Wald 检验', '生成火山图与 MA 图'],
    sampleInquiry: 'Perform differential gene expression analysis on hepatic MASLD RNA-seq dataset with FDR < 0.05 cutoff.',
    sampleInquiryZh: '对肝脏 MASLD RNA-seq 数据集进行差异基因表达分析，FDR 截断值为 0.05。',
    connectors: ['DESeq2', 'Python StatsModels', 'BioPython'],
  },
  {
    id: 'single-cell-clustering',
    category: 'Bioinformatics',
    categoryIcon: BarChart3,
    name: 'Single-Cell Transcriptomics (Scanpy/Seurat)',
    nameZh: '单细胞转录组分析（Scanpy/Seurat）',
    summary: 'Automates cell QC, highly variable gene selection, PCA dimensionality reduction, and Leiden clustering.',
    summaryZh: '自动完成细胞质控、高变基因筛选、PCA 降维与 Leiden 聚类。',
    sopSteps: ['Filter low-quality droplets', 'SCTransform / LogNormalize', 'Run UMAP & Leiden clustering', 'Annotate cell types via markers'],
    sopStepsZh: ['过滤低质量液滴', 'SCTransform / LogNormalize 标准化', '运行 UMAP 与 Leiden 聚类', '基于标志基因注释细胞类型'],
    sampleInquiry: 'Run single-cell RNA-seq clustering on 10x Genomics PBMC dataset to identify pathogenic CD4+ T cell clusters.',
    sampleInquiryZh: '对 10x Genomics PBMC 数据集进行单细胞 RNA-seq 聚类，以识别致病性 CD4+ T 细胞亚群。',
    connectors: ['Scanpy', 'AnnData', 'Ensembl'],
  },
  {
    id: 'gsea-pathway-enrichment',
    category: 'Bioinformatics',
    categoryIcon: BarChart3,
    name: 'GSEA Pathway Enrichment & Reactome',
    nameZh: 'GSEA 通路富集与 Reactome 分析',
    summary: 'Maps gene lists to KEGG, Reactome, and GO terms with hypergeometric enrichment tests.',
    summaryZh: '将基因列表映射到 KEGG、Reactome 与 GO 条目，并进行超几何富集检验。',
    sopSteps: ['Extract ranked gene list', 'Query Reactome Knowledgebase', 'Calculate Normalized Enrichment Scores', 'Plot GSEA running sum'],
    sopStepsZh: ['提取排序基因列表', '查询 Reactome 知识库', '计算标准化富集分数', '绘制 GSEA 运行和曲线'],
    sampleInquiry: 'Perform GSEA pathway enrichment on upregulated genes to identify activated inflammatory pathways.',
    sampleInquiryZh: '对上调基因进行 GSEA 通路富集分析，以识别被激活的炎症通路。',
    connectors: ['Reactome', 'QuickGO', 'MSigDB'],
  },

  // 4. Clinical & Pharmacovigilance
  {
    id: 'clinical-trial-eligibility-matching',
    category: 'Clinical & Trials',
    categoryIcon: Stethoscope,
    name: 'ClinicalTrials.gov Protocol & Cohort Matching',
    nameZh: 'ClinicalTrials.gov 方案与队列匹配',
    summary: 'Queries ClinicalTrials.gov API v2, parses inclusion/exclusion criteria, and maps trial phases and endpoints.',
    summaryZh: '查询 ClinicalTrials.gov API v2，解析入组/排除标准，并映射试验分期与终点指标。',
    sopSteps: ['Query NCT identifier or condition', 'Parse structured eligibility text', 'Extract primary/secondary endpoints', 'Synthesize cohort summary'],
    sopStepsZh: ['查询 NCT 编号或适应症', '解析结构化入组条件文本', '提取主要/次要终点', '汇总队列摘要'],
    sampleInquiry: 'Retrieve Phase III trial protocols for resmetirom in NASH/MASH (NCT03900429) and summarize inclusion criteria.',
    sampleInquiryZh: '检索 resmetirom 治疗 NASH/MASH 的 III 期试验方案（NCT03900429），并总结入组标准。',
    connectors: ['ClinicalTrials.gov API v2', 'MeSH'],
  },
  {
    id: 'faers-adverse-event-analytics',
    category: 'Clinical & Trials',
    categoryIcon: Stethoscope,
    name: 'openFDA FAERS Pharmacovigilance Analytics',
    nameZh: 'openFDA FAERS 药物警戒分析',
    summary: 'Mines FDA Adverse Event Reporting System to compute Proportional Reporting Ratios (PRR) and disproportionality.',
    summaryZh: '挖掘 FDA 不良事件报告系统，计算报告比值比（PRR）及不成比例信号。',
    sopSteps: ['Query openFDA drug/event API', 'Count co-occurrence contingency tables', 'Calculate PRR and Chi-square statistics', 'Plot safety signal chart'],
    sopStepsZh: ['查询 openFDA 药物/事件 API', '统计共现列联表', '计算 PRR 与卡方统计量', '绘制安全信号图'],
    sampleInquiry: 'Calculate disproportionality signal scores (PRR) for hepatic adverse events associated with GLP-1 receptor agonists in FAERS.',
    sampleInquiryZh: '计算 FAERS 中 GLP-1 受体激动剂相关肝脏不良事件的不成比例信号分数（PRR）。',
    connectors: ['openFDA FAERS', 'RxNorm', 'DailyMed'],
  },
  {
    id: 'evidence-verification-gate',
    category: 'Clinical & Trials',
    categoryIcon: Stethoscope,
    name: 'Pre-Adoption Evidence Verifier Gate',
    nameZh: '证据采纳前验证关卡',
    summary: 'Codex-style formal patch verification checking physical/mathematical bounds (p in [0,1], IC50 > 0, HU bounds).',
    summaryZh: '采用 Codex 式形式化补丁校验，检查物理/数学边界（p∈[0,1]、IC50>0、HU 范围等）。',
    sopSteps: ['Intercept tool output payload', 'Check numerical intervals & boundary safety', 'Verify source database integrity', 'Mint verified EV-xxx record'],
    sopStepsZh: ['拦截工具输出数据', '检查数值区间与边界安全性', '核验来源数据库完整性', '生成已验证的 EV-xxx 证据记录'],
    sampleInquiry: 'Verify experimental p-values and binding affinity bounds from newly ingested clinical dataset.',
    sampleInquiryZh: '对新导入的临床数据集，核验其 p 值与结合亲和力是否在合理边界内。',
    connectors: ['EvidenceVerifier', 'HookRegistry'],
  },

  // 5. Literature Mining & Synthesis
  {
    id: 'pubmed-literature-mining',
    category: 'Literature Mining',
    categoryIcon: BookOpen,
    name: 'PubMed & OpenAlex Systematic Mining',
    nameZh: 'PubMed 与 OpenAlex 系统性文献挖掘',
    summary: 'Executes Boolean mesh queries across NCBI PubMed, bioRxiv, medRxiv, and OpenAlex scholarly graph.',
    summaryZh: '在 NCBI PubMed、bioRxiv、medRxiv 及 OpenAlex 学术图谱中执行 MeSH 布尔检索。',
    sopSteps: ['Construct MeSH Boolean query', 'Fetch article abstracts & metadata', 'Extract key quantitative findings', 'Index citation anchors'],
    sopStepsZh: ['构建 MeSH 布尔检索式', '获取文章摘要与元数据', '提取关键定量结论', '建立引文索引锚点'],
    sampleInquiry: 'Search PubMed for 2024-2025 peer-reviewed trials evaluating TYK2 JH2 allosteric inhibitors in systemic lupus.',
    sampleInquiryZh: '检索 2024-2025 年评估 TYK2 JH2 变构抑制剂治疗系统性红斑狼疮的同行评审试验文献。',
    connectors: ['PubMed E-utilities', 'Europe PMC', 'OpenAlex'],
  },
  {
    id: 'prisma-meta-analysis-synthesizer',
    category: 'Literature Mining',
    categoryIcon: BookOpen,
    name: 'PRISMA-2020 Systematic Review Synthesizer',
    nameZh: 'PRISMA-2020 系统综述合成',
    summary: 'Extracts study characteristics, calculates pooled Odds Ratios / Hazard Ratios with Mantel-Haenszel random effects.',
    summaryZh: '提取研究特征，采用 Mantel-Haenszel 随机效应模型计算合并 OR/HR 值。',
    sopSteps: ['Screen records against inclusion criteria', 'Extract effect sizes (OR/RR/HR)', 'Compute I^2 heterogeneity statistic', 'Generate PRISMA flowchart'],
    sopStepsZh: ['依据纳入标准筛选文献', '提取效应量（OR/RR/HR）', '计算 I² 异质性统计量', '生成 PRISMA 流程图'],
    sampleInquiry: 'Synthesize systematic literature review on SGLT2 inhibitor renal outcomes following PRISMA-2020 guidelines.',
    sampleInquiryZh: '按照 PRISMA-2020 指南，对 SGLT2 抑制剂肾脏结局的系统性文献进行综述合成。',
    connectors: ['PubMed', 'Cochrane Library', 'Meta-Analysis Engine'],
  },
  {
    id: 'manuscript-formatting',
    category: 'Literature Mining',
    categoryIcon: BookOpen,
    name: 'Nature / Cell Scientific Manuscript Formatter',
    nameZh: 'Nature / Cell 学术论文格式化',
    summary: 'Compiles verified research evidence into structured academic manuscripts with IEEE/Nature citation formatting.',
    summaryZh: '将已验证的研究证据整理为结构化学术论文，并按 IEEE/Nature 格式生成引文。',
    sopSteps: ['Aggregate verified EV-xxx evidence', 'Structure Abstract, Intro, Methods, Results, Discussion', 'Format LaTeX equations & figure callouts', 'Generate bibliography'],
    sopStepsZh: ['汇总已验证的 EV-xxx 证据', '组织摘要、引言、方法、结果、讨论结构', '排版 LaTeX 公式与图表标注', '生成参考文献列表'],
    sampleInquiry: 'Format current research findings into a structured Nature Biotechnology style brief communication draft.',
    sampleInquiryZh: '将当前研究成果整理为 Nature Biotechnology 风格的简讯（brief communication）初稿。',
    connectors: ['FileEditorTool', 'LaTeX Engine', 'EvidenceTracker'],
  },

  // 6. Medical Imaging & Reproducibility
  {
    id: 'dicom-volumetric-radiomics',
    category: 'Imaging & Multimodal',
    categoryIcon: Activity,
    name: 'DICOM CT/MRI Volumetric Radiomics',
    nameZh: 'DICOM CT/MRI 三维影像组学',
    summary: 'Extracts 3D voxel HU arrays inside sandbox, measures lesion volume, and computes spatial texture descriptors.',
    summaryZh: '在沙盒内提取三维体素 HU 值数组，测量病灶体积并计算空间纹理特征。',
    sopSteps: ['Read DICOM image slice headers', 'Calibrate Hounsfield Units (-1024 to +3071)', '3D volumetric segmentation', 'Compute radiomic feature matrix'],
    sopStepsZh: ['读取 DICOM 影像切片头信息', '校准 Hounsfield 单位（-1024 至 +3071）', '进行三维体积分割', '计算影像组学特征矩阵'],
    sampleInquiry: 'Process liver CT scan DICOM series to measure hepatic volume and compute steatosis attenuation density.',
    sampleInquiryZh: '处理肝脏 CT 扫描 DICOM 序列，测量肝脏体积并计算脂肪变性的衰减密度。',
    connectors: ['pydicom', 'SimpleITK', 'Kernel Sandbox'],
  },
  {
    id: 'synthetic-dataset-generator',
    category: 'Imaging & Multimodal',
    categoryIcon: Activity,
    name: 'Statistical Mock & Benchmark Data Generator',
    nameZh: '统计模拟与基准数据生成器',
    summary: 'Generates grounded, biologically coherent synthetic benchmarks with realistic covariance matrices.',
    summaryZh: '生成具有真实协方差结构、生物学上自洽的合成基准数据集。',
    sopSteps: ['Define biological parameter distributions', 'Sample multivariate Gaussian copula', 'Inject known ground truth signals', 'Export CSV with data dictionary'],
    sopStepsZh: ['定义生物学参数分布', '采样多元高斯 Copula', '注入已知真值信号', '导出带数据字典的 CSV 文件'],
    sampleInquiry: 'Generate a synthetic 1,000-patient pharmacokinetic cohort dataset with realistic clearance and volume of distribution.',
    sampleInquiryZh: '生成包含 1000 名患者的合成药代动力学队列数据集，清除率与分布容积均符合真实生理范围。',
    connectors: ['NumPy', 'Pandas', 'SciPy'],
  },
  {
    id: 'sandbox-protocol-validator',
    category: 'Imaging & Multimodal',
    categoryIcon: Activity,
    name: 'Kernel Sandbox Protocol & Privacy Gate',
    nameZh: '内核沙盒协议与隐私防护关卡',
    summary: 'Enforces macOS Seatbelt / Linux bwrap isolation, guaranteeing zero unapproved transmission of clinical EHR/DICOM.',
    summaryZh: '强制执行 macOS Seatbelt / Linux bwrap 隔离机制，确保未经批准的临床 EHR/DICOM 数据零外传。',
    sopSteps: ['Spawn isolated execution sandbox', 'Enforce memory and CPU constraints', 'Block unapproved outbound egress', 'Audit output artifacts'],
    sopStepsZh: ['启动隔离执行沙盒', '限制内存与 CPU 用量', '阻断未经批准的对外访问', '审计输出产物'],
    sampleInquiry: 'Run high-throughput statistical simulation inside isolated kernel sandbox with hardware execution monitoring.',
    sampleInquiryZh: '在隔离内核沙盒中运行高通量统计模拟，并进行硬件执行监控。',
    connectors: ['macOS Seatbelt', 'Linux bubblewrap', 'ClinicalDataGate'],
  },
];

export const SkillsCatalogView: React.FC = () => {
  const { submitPrompt } = useAgent();
  const { setActiveSection } = useNav();

  const { t, language } = useLanguage();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');

  const categories = ['All', 'Molecular Biology', 'Cheminformatics', 'Bioinformatics', 'Clinical & Trials', 'Literature Mining', 'Imaging & Multimodal'];
  const categoryZhMap: Record<string, string> = {
    'All': '全部',
    'Molecular Biology': '分子生物学',
    'Cheminformatics': '化学信息学',
    'Bioinformatics': '生物信息学',
    'Clinical & Trials': '临床与试验',
    'Literature Mining': '文献挖掘',
    'Imaging & Multimodal': '影像与多模态',
  };
  const catLabel = (cat: string) => (language === 'zh' ? categoryZhMap[cat] || cat : cat);

  const filteredSkills = skillsCatalog.filter((skill) => {
    const matchesCat = selectedCategory === 'All' || skill.category === selectedCategory;
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      skill.name.toLowerCase().includes(q) ||
      skill.nameZh.includes(searchQuery) ||
      skill.summary.toLowerCase().includes(q) ||
      skill.summaryZh.includes(searchQuery) ||
      skill.connectors.some((c) => c.toLowerCase().includes(q));
    return matchesCat && matchesSearch;
  });

  const handleLaunchSkill = async (skill: SkillItem) => {
    const inquiry = language === 'zh' ? skill.sampleInquiryZh : skill.sampleInquiry;
    setActiveSection('home');
    await submitPrompt(inquiry);
  };

  return (
    <div className="flex-1 h-full overflow-y-auto p-6 sm:p-10 max-w-[1200px] mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-border">
        <div className="text-left">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-accent/10 text-accent">
              <FlaskConical size={22} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight text-text-primary">{t('Scientific Skills (19 SOPs)', '科研技能 (19 项 SOP)')}</h2>
              <p className="text-sm text-text-secondary mt-0.5">
                {t('Domain-specific computational protocols, molecular databases, and clinical verification pipelines.', '面向特定领域的计算流程、分子数据库与临床验证流水线。')}
              </p>
            </div>
          </div>
        </div>

        <span className="text-xs font-mono px-3 py-1.5 rounded-lg bg-bg-surface border border-border text-accent">
          {t('19 Skills Loaded & Verified', '已加载并验证 19 项技能')}
        </span>
      </div>

      {/* Category Pills & Search */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 my-6">
        <div className="flex flex-wrap gap-1.5">
          {categories.map((cat) => {
            const isSelected = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  isSelected
                    ? 'bg-accent text-white shadow-xs font-semibold'
                    : 'bg-bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                }`}
              >
                {catLabel(cat)}
              </button>
            );
          })}
        </div>

        <div className="relative max-w-xs w-full">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder={t('Search skills, databases...', '搜索技能、数据库…')}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-bg-surface border border-border focus:border-accent text-xs text-text-primary placeholder:text-text-muted"
          />
        </div>
      </div>

      {/* Skills Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredSkills.map((skill) => {
          const CatIcon = skill.categoryIcon;
          return (
            <div
              key={skill.id}
              className="flex flex-col justify-between p-4 rounded-xl bg-bg-surface border border-border hover:border-accent/40 transition-all shadow-xs group"
            >
              <div className="space-y-2.5 text-left">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
                    <CatIcon size={12} />
                    <span>{catLabel(skill.category)}</span>
                  </span>
                </div>

                <h3 className="text-[14.5px] font-semibold text-text-primary group-hover:text-accent transition-colors leading-snug">
                  {language === 'zh' ? skill.nameZh : skill.name}
                </h3>

                <p className="text-xs text-text-secondary leading-relaxed">
                  {language === 'zh' ? skill.summaryZh : skill.summary}
                </p>

                {/* SOP Steps preview */}
                <div className="pt-2 space-y-1 border-t border-border-subtle">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-text-muted">
                    {t('Execution SOP:', '执行步骤：')}
                  </span>
                  <div className="space-y-0.5">
                    {(language === 'zh' ? skill.sopStepsZh : skill.sopSteps).map((step, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[11px] text-text-muted">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                        <span className="truncate">{step}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Connectors */}
                <div className="flex flex-wrap gap-1 pt-1">
                  {skill.connectors.map((c) => (
                    <span
                      key={c}
                      className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted border border-border-subtle"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>

              {/* Action Button */}
              <div className="mt-4 pt-3 border-t border-border-subtle">
                <button
                  onClick={() => handleLaunchSkill(skill)}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-bg-elevated hover:bg-accent hover:text-white border border-border hover:border-transparent text-text-primary text-xs font-semibold transition-all group/btn"
                >
                  <Play size={13} className="text-accent group-hover/btn:text-white" />
                  <span>{t('Execute with Agent', '交由智能体执行')}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
