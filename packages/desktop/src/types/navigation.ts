export type NavSection =
  | 'home'
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
