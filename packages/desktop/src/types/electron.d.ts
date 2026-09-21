import type { MedScienceDesktopAPI } from '../../electron/preload';

declare global {
  interface Window {
    medscience?: MedScienceDesktopAPI;
  }
}

export {};
