import React, { createContext, useContext, useEffect } from 'react';

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  resolved: 'light',
});

export function ThemeProvider({ children }) {
  useEffect(() => {
    try {
      localStorage.setItem('kite-theme', 'light');
    } catch (e) {}
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.remove('dark');
    document.documentElement.classList.add('light');
  }, []);

  return React.createElement(
    ThemeContext.Provider,
    { value: { theme: 'light', setTheme: () => {}, resolved: 'light' } },
    children
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

export default useTheme;
