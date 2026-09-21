import React, { useState, useEffect } from 'react';
import { X, Moon, Sun, Keyboard, Check, User, Languages } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { useNav } from '../../context/NavContext';
import { useUser } from '../../context/UserContext';
import { useLanguage } from '../../context/LanguageContext';

/**
 * Account, Appearance, and Hotkeys only -- Model & API, Execution Runtime,
 * and Guardrail Hooks used to live here as tabs too, but have moved out
 * into their own sidebar pages (see ModelConfigView / GuardrailHooksView),
 * reachable from the sidebar's "配置" (Configuration) section instead of
 * this modal. Opened from the sidebar's bottom user-profile button.
 */
export const SettingsModal: React.FC = () => {
  const { isSettingsOpen, setIsSettingsOpen } = useNav();
  const { user, updateUser } = useUser();
  const { t, language, setLanguage } = useLanguage();
  const { desktopTheme, setDesktopTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<'account' | 'appearance' | 'shortcuts'>('account');

  // Account editing state
  const [userNameInput, setUserNameInput] = useState(user.name);
  const [userPlanInput, setUserPlanInput] = useState(user.plan);
  const [userInstitutionInput, setUserInstitutionInput] = useState(user.institution || '');
  const [userSpecialtyInput, setUserSpecialtyInput] = useState(user.specialty || '');
  const [accountSaveMsg, setAccountSaveMsg] = useState('');

  // Sync account form when modal opens
  useEffect(() => {
    if (isSettingsOpen) {
      setUserNameInput(user.name);
      setUserPlanInput(user.plan);
      setUserInstitutionInput(user.institution || '');
      setUserSpecialtyInput(user.specialty || '');
      setAccountSaveMsg('');
    }
  }, [isSettingsOpen, user]);

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    updateUser({
      name: userNameInput.trim() || 'Researcher',
      plan: userPlanInput.trim() || 'Community Edition',
      institution: userInstitutionInput.trim(),
      specialty: userSpecialtyInput.trim(),
    });
    setAccountSaveMsg(t('User profile updated successfully!', '用户资料已更新成功！'));
    setTimeout(() => setAccountSaveMsg(''), 3000);
  };

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 select-none">
      <div className="w-full max-w-[640px] rounded-2xl bg-bg-surface border border-border shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h3 className="text-[17px] font-bold text-text-primary">{t('MedScience Settings', 'MedScience 设置')}</h3>
            <p className="text-xs text-text-muted mt-0.5">
              {t('Researcher account, appearance & hotkeys', '研究者账户、外观与快捷键设置')}
            </p>
          </div>
          <button
            onClick={() => setIsSettingsOpen(false)}
            className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-bg-elevated/40 px-6 pt-2 overflow-x-auto">
          {[
            { id: 'account', label: 'Account', labelZh: '账户', icon: User },
            { id: 'appearance', label: 'Appearance', labelZh: '外观', icon: Sun },
            { id: 'shortcuts', label: 'Hotkeys', labelZh: '快捷键', icon: Keyboard },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold border-b-2 transition-all whitespace-nowrap ${
                  isActive
                    ? 'border-accent text-accent'
                    : 'border-transparent text-text-muted hover:text-text-primary'
                }`}
              >
                <Icon size={14} />
                <span>{language === 'zh' ? tab.labelZh : tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="p-6 space-y-5 max-h-[540px] overflow-y-auto">
          {/* TAB: ACCOUNT & USER PROFILE */}
          {activeTab === 'account' && (
            <form onSubmit={handleSaveAccount} className="space-y-4">
              <div className="flex items-center gap-4 p-4 bg-bg-elevated/60 rounded-xl border border-border">
                <div className="w-14 h-14 rounded-xl bg-accent/20 border border-accent/40 flex items-center justify-center text-accent text-lg font-bold shadow-inner">
                  {user.avatar || 'RE'}
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-text-primary">{user.name}</h4>
                  <p className="text-xs text-text-muted">{user.plan} • {user.institution || t('Individual Workstation', '个人工作站')}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    {t('Researcher / Scientist Name', '研究者 / 科学家姓名')}
                  </label>
                  <input
                    type="text"
                    value={userNameInput}
                    onChange={(e) => setUserNameInput(e.target.value)}
                    placeholder={t('e.g. Dr. Alex Vance', '例如：张伟 博士')}
                    className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    {t('Workstation Plan / License', '工作站方案 / 许可')}
                  </label>
                  <input
                    type="text"
                    value={userPlanInput}
                    onChange={(e) => setUserPlanInput(e.target.value)}
                    placeholder={t('e.g. Academic Pro', '例如：学术专业版')}
                    className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    {t('Institution / Laboratory', '机构 / 实验室')}
                  </label>
                  <input
                    type="text"
                    value={userInstitutionInput}
                    onChange={(e) => setUserInstitutionInput(e.target.value)}
                    placeholder={t('e.g. Biomedical Institute', '例如：生物医学研究所')}
                    className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-secondary mb-1">
                    {t('Primary Scientific Domain', '主要研究领域')}
                  </label>
                  <input
                    type="text"
                    value={userSpecialtyInput}
                    onChange={(e) => setUserSpecialtyInput(e.target.value)}
                    placeholder={t('e.g. Immunology & Oncology', '例如：免疫学与肿瘤学')}
                    className="w-full bg-bg-surface border border-border rounded-lg px-3 py-2 text-xs text-text-primary focus:outline-none focus:border-accent"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                {accountSaveMsg && (
                  <span className="text-xs text-emerald-400 font-medium">{accountSaveMsg}</span>
                )}
                <div className="ml-auto">
                  <button
                    type="submit"
                    className="px-4 py-2 bg-accent text-accent-foreground font-semibold rounded-lg text-xs hover:bg-accent/90 transition-colors shadow-xs"
                  >
                    {t('Save Account Profile', '保存账户资料')}
                  </button>
                </div>
              </div>
            </form>
          )}

          {/* TAB: WORKSTATION APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                  {t('Language', '语言')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setLanguage('zh')}
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-medium transition-all ${
                      language === 'zh'
                        ? 'border-accent bg-accent/10 text-text-primary ring-1 ring-accent/30 shadow-xs'
                        : 'border-border bg-bg-elevated hover:bg-bg-hover text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-bg-surface text-accent">
                        <Languages size={18} />
                      </div>
                      <span className="font-semibold text-sm">中文</span>
                    </div>
                    {language === 'zh' && <Check size={16} className="text-accent" />}
                  </button>

                  <button
                    onClick={() => setLanguage('en')}
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-medium transition-all ${
                      language === 'en'
                        ? 'border-accent bg-accent/10 text-text-primary ring-1 ring-accent/30 shadow-xs'
                        : 'border-border bg-bg-elevated hover:bg-bg-hover text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-bg-surface text-accent">
                        <Languages size={18} />
                      </div>
                      <span className="font-semibold text-sm">English</span>
                    </div>
                    {language === 'en' && <Check size={16} className="text-accent" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-3">
                  {t('Color Theme', '配色主题')}
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setDesktopTheme('dark')}
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-medium transition-all ${
                      desktopTheme === 'dark'
                        ? 'border-accent bg-accent/10 text-text-primary ring-1 ring-accent/30 shadow-xs'
                        : 'border-border bg-bg-elevated hover:bg-bg-hover text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-bg-surface text-accent">
                        <Moon size={18} />
                      </div>
                      <div className="text-left">
                        <span className="block font-semibold text-sm">{t('Desktop Dark', '深色模式')}</span>
                        <span className="text-[11px] text-text-muted">{t('High-contrast scientific matrix', '高对比度科研配色')}</span>
                      </div>
                    </div>
                    {desktopTheme === 'dark' && <Check size={16} className="text-accent" />}
                  </button>

                  <button
                    onClick={() => setDesktopTheme('light')}
                    className={`flex items-center justify-between p-3.5 rounded-xl border text-xs font-medium transition-all ${
                      desktopTheme === 'light'
                        ? 'border-accent bg-accent/10 text-text-primary ring-1 ring-accent/30 shadow-xs'
                        : 'border-border bg-bg-elevated hover:bg-bg-hover text-text-secondary'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-bg-surface text-accent">
                        <Sun size={18} />
                      </div>
                      <div className="text-left">
                        <span className="block font-semibold text-sm">{t('Desktop Light', '浅色模式')}</span>
                        <span className="text-[11px] text-text-muted">{t('Paper precision & journal reading', '纸质质感，适合阅读文献')}</span>
                      </div>
                    </div>
                    {desktopTheme === 'light' && <Check size={16} className="text-accent" />}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: KEYBOARD SHORTCUTS */}
          {activeTab === 'shortcuts' && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-2">
                {t('Workstation Hotkeys', '工作站快捷键')}
              </label>
              {[
                { key: '⌘ K / Ctrl K', action: t('Open Global Command Palette', '打开全局命令面板') },
                { key: '⌘ N / Ctrl N', action: t('Start New Research Session', '开始新的研究会话') },
                { key: 'Enter', action: t('Submit Inquiry to Agent', '向智能体提交问题') },
                { key: 'Shift + Enter', action: t('Insert Newline in Composer', '在输入框中换行') },
              ].map((shortcut, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-bg-elevated/40 border border-border text-xs"
                >
                  <span className="text-text-secondary">{shortcut.action}</span>
                  <kbd className="px-2 py-1 rounded-md bg-bg-surface border border-border font-mono text-[11px] text-accent">
                    {shortcut.key}
                  </kbd>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
