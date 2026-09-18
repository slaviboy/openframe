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

import { useSyncExternalStore } from 'react';
import { CODE_UNITS, type CodeLanguage, type CodeOptions } from '@/core/dev/code-gen';
import { viewPrefs } from '../../view/view-prefs';

/**
 * The code preferences, which are kept per device so Copy as code follows the panel. Its own module so
 * the sections that read it — the code wells, the preferences row and MCP's example prompt — need not
 * import one another.
 */
export function useCodePrefs() {
  const prefs = useSyncExternalStore(viewPrefs.subscribe, () => viewPrefs.getSnapshot());
  const language: CodeLanguage = prefs.codeLanguage;
  const units = CODE_UNITS[language];
  const unit = units.includes(prefs.codeUnit) ? prefs.codeUnit : units[0]!;
  const scale = prefs.codeScale > 0 ? prefs.codeScale : null;
  const options: CodeOptions = { language, unit, ...(scale === null ? {} : { scale }) };
  return { language, unit, units, scale, options };
}
