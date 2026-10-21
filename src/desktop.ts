export type DesktopState = {
  phase: 'starting' | 'ready' | 'error';
  message: string;
  chromeAvailable: boolean;
  version?: string;
  webOrigin?: string;
  encryptedSession?: boolean;
};
type DesktopAPI = {
  platform: string;
  webOrigin: string;
  getState: () => Promise<DesktopState>;
  setDraftState: (state: { dirty: boolean; busy: boolean }) => void;
  openWeb: () => Promise<void>;
  copyText: (value: string) => Promise<void>;
  storage: { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<void>; removeItem: (key: string) => Promise<void> };
  onCommand: (callback: (command: string) => void) => () => void;
};
declare global { interface Window { callaDesktop?: DesktopAPI } }
export const desktop = window.callaDesktop;
export const IS_DESKTOP = !!desktop;
export const copyText = (value: string) => desktop ? desktop.copyText(value) : navigator.clipboard.writeText(value);
if (IS_DESKTOP) document.documentElement.dataset.desktop = 'true';
