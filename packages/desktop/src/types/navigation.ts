export type NavSection =
  | 'home'
  | 'sessions'
  | 'teams'
  | 'skills'
  | 'evidence'
  | 'files'
  | 'model-config'
  | 'guardrails';

export interface NavItem {
  id: NavSection;
  label: string;
  iconName: string;
  badge?: string;
  description?: string;
}
