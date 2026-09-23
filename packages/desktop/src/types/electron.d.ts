import type { MedScienceApi } from '../runtime/apiClient';

declare global {
  interface Window {
    /** Installed by runtime/apiClient.ts at startup (Electron IPC or the loopback web bridge). */
    medscience?: MedScienceApi;
  }
}

export {};
