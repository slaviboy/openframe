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

import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results', 'docs-mirror'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.worker } },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      // `noUncheckedIndexedAccess` is enabled; non-null assertions document invariants
      // that the type system cannot express (e.g. index within bounds).
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' },
      ],
      // Network access is forbidden in app code; import/export uses local File APIs only.
      'no-restricted-globals': [
        'error',
        { name: 'fetch', message: 'Openframe must not perform network requests.' },
        { name: 'XMLHttpRequest', message: 'Openframe must not perform network requests.' },
        { name: 'WebSocket', message: 'Openframe must not perform network requests.' },
        { name: 'EventSource', message: 'Openframe must not perform network requests.' },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'navigator', property: 'sendBeacon', message: 'No telemetry.' },
        { object: 'window', property: 'fetch', message: 'Openframe must not perform network requests.' },
      ],
    },
  },
  {
    files: ['src/pwa/sw.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    // The Google Fonts library and the Material Symbols set ship with the app, under public/. They are far
    // too large to inline as modules the way the bundled fonts are — the library alone is hundreds of
    // megabytes — so they are read from the app's own origin when a family or an icon is picked, and the
    // service worker caches each one as it is asked for, exactly as it already does for the CJK subsets.
    // Same-origin reads of what shipped with the app; no request ever leaves it.
    files: ['src/ui/fonts/google-fonts.ts', 'src/ui/icons/material-symbols.ts'],
    rules: { 'no-restricted-globals': 'off' },
  },
);
