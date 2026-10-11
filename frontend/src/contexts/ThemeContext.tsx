import { createContext, useCallback, useContext, useMemo, useState, ReactNode } from 'react';

export type Mode = 'urban' | 'rural';

interface ThemeContextType {
  mode: Mode;
  toggleMode: () => void;
  setMode: (mode: Mode) => void;
  colors: {
    primary: string;
    background: string;
    text: string;
    textSecondary: string;
  };
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const urbanColors = {
  primary: '#0676c8',
  background: '#f0f7fc',
  text: '#000000',
  textSecondary: '#333333',
};

const ruralColors = {
  primary: '#32a854',
  background: '#f0faf3',
  text: '#000000',
  textSecondary: '#333333',
};

const STORAGE_KEY = 'indra.mode';

/** The URL wins (deep links to /gramin/* open in Gramin mode); otherwise the last used mode. */
function initialMode(): Mode {
  if (typeof window === 'undefined') return 'urban';
  if (window.location.pathname.startsWith('/gramin')) return 'rural';
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'rural' ? 'rural' : 'urban';
  } catch {
    return 'urban';
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<Mode>(initialMode);

  const setMode = useCallback((next: Mode) => {
    setModeState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // private mode / blocked storage: the toggle still works for this session
    }
  }, []);

  const toggleMode = useCallback(() => setMode(mode === 'urban' ? 'rural' : 'urban'), [mode, setMode]);

  const value = useMemo<ThemeContextType>(
    () => ({ mode, toggleMode, setMode, colors: mode === 'urban' ? urbanColors : ruralColors }),
    [mode, toggleMode, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }
  return context;
}
