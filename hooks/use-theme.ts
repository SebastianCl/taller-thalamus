'use client';

import { useCallback, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const THEME_STORAGE_KEY = 'taller-3d-theme';

function normalizeTheme(value: string | null): Theme {
  return value === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    let storedTheme: Theme = 'light';
    try {
      storedTheme = normalizeTheme(
        window.localStorage.getItem(THEME_STORAGE_KEY),
      );
    } catch {
      // Private browsing modes may deny access to localStorage.
    }
    // oxlint-disable-next-line react/react-compiler -- Hydrate the browser-only preference after the server's light-theme markup.
    setTheme(storedTheme);
    applyTheme(storedTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((currentTheme) => {
      const nextTheme: Theme = currentTheme === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
      } catch {
        // Keep the in-memory theme working when persistence is unavailable.
      }
      applyTheme(nextTheme);
      return nextTheme;
    });
  }, []);

  return { theme, toggleTheme };
}
