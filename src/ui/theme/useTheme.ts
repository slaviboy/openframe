/*
 * Copyright (C) 2026 Stanislav Georgiev
 * https://github.com/slaviboy
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { useEffect, useSyncExternalStore } from 'react';
import { themeStore, type ResolvedTheme } from './theme-store';

/**
 * The active theme: the user's preference (System, Light or Dark). System follows the
 * operating system and falls back to dark when it doesn't prefer light.
 */
export function useThemePreference(): ResolvedTheme {
  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: light)');
    const sync = () => themeStore.setSystem(query.matches ? 'light' : 'dark');
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  const theme = useSyncExternalStore(themeStore.subscribe, () => themeStore.resolved());
  useEffect(() => {
    document.documentElement.dataset['theme'] = theme;
  }, [theme]);
  return theme;
}
