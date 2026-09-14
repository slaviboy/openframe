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

import type { SpellChecker } from '@/core/text/spelling';

let pending: Promise<SpellChecker> | null = null;

/**
 * The English spell checker: nspell with the bundled Hunspell dictionary, loaded once in its own
 * chunk (the dictionary is imported as text, never fetched).
 */
export function loadSpellChecker(): Promise<SpellChecker> {
  pending ??= Promise.all([import('nspell'), import('dictionary-en-files/index.aff?raw'), import('dictionary-en-files/index.dic?raw')])
    .then(([{ default: nspell }, { default: aff }, { default: dic }]) => {
      const spell = nspell(aff, dic);
      return { correct: (word: string) => spell.correct(word), suggest: (word: string) => spell.suggest(word) };
    })
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}
