import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext({
  theme: 'system',
  setTheme: () => {},
  resolved: 'light',
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => {
    try {
      return localStorage.getItem('cognifaculty-theme') || 'system';
    } catch {
      return 'system';
    }
  });

  const [resolved, setResolved] = useState(() => {
    if (typeof window === 'undefined') return 'light';
    const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  });

  const setTheme = (newTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem('cognifaculty-theme', newTheme);
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const applyTheme = () => {
      const systemDark = mediaQuery.matches;
      const res = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
      setResolved(res);
      document.documentElement.setAttribute('data-theme', res);
    };

    applyTheme();

    const handleChange = () => {
      if (theme === 'system') {
        applyTheme();
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  return React.createElement(
    ThemeContext.Provider,
    { value: { theme, setTheme, resolved } },
    children
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}

export default useTheme;
