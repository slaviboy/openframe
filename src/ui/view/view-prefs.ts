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

import type { CommandDefinition } from '@/editor/commands/registry';
import { Observable } from '@/editor/stores/observable';

/** Per-device view preferences (not part of the document), persisted in localStorage like the theme. */
export interface ViewPrefs {
  /** Rulers along the top and left canvas edges; ruler guides are shown and editable only with rulers on. */
  readonly rulers: boolean;
  /** Outline mode: every layer drawn as a hairline outline, without fills, effects or clipping. */
  readonly outlines: boolean;
  /** In outline mode, also outline hidden layers. */
  readonly outlineHidden: boolean;
  /** Outline every mask in green. */
  readonly maskOutlines: boolean;
  /** One-pixel grid, drawn at 400% zoom and above. */
  readonly pixelGrid: boolean;
  /** Layout guides on frames (they still apply to snapping and constraints when hidden). */
  readonly layoutGuides: boolean;
  /** Moving, resizing and drawing land on whole pixels. */
  readonly snapToPixelGrid: boolean;
  /** Text captions on properties panel fields. */
  readonly propertyLabels: boolean;
  /** Typing converts character sequences (->, (c), straight quotes …) to symbols. */
  readonly smartSymbols: boolean;
  /** Misspelled words in text being edited are underlined, with suggestions on right-click. */
  readonly spellCheck: boolean;
  /** Arrow-key nudge distance, in canvas pixels. */
  readonly nudgeSmall: number;
  /** Shift + arrow-key nudge distance, in canvas pixels. */
  readonly nudgeBig: number;
  /** The mode the editor opens in. */
  readonly mode: 'design' | 'draw' | 'motion' | 'dev';
  /** Dev Mode: the language its code is shown in, and copied as. */
  readonly codeLanguage: CodeLanguage;
  /** Dev Mode: the unit that code carries its sizes in. */
  readonly codeUnit: CodeUnit;
  /** Dev Mode: how the design's sizes are scaled into the code; 0 means the unit's own scale. */
  readonly codeScale: number;
}

type BooleanPref = { [K in keyof ViewPrefs]: ViewPrefs[K] extends boolean ? K : never }[keyof ViewPrefs];
type NumberPref = { [K in keyof ViewPrefs]: ViewPrefs[K] extends number ? K : never }[keyof ViewPrefs];

import { CODE_LANGUAGE_LABELS, CODE_UNITS, type CodeLanguage, type CodeUnit } from '@/core/dev/code-gen';

const STORAGE_KEY = 'openframe.view';
export const VIEW_PREF_DEFAULTS: ViewPrefs = {
  rulers: false,
  outlines: false,
  outlineHidden: false,
  maskOutlines: false,
  pixelGrid: true,
  layoutGuides: true,
  snapToPixelGrid: true,
  propertyLabels: false,
  smartSymbols: false,
  spellCheck: true,
  nudgeSmall: 1,
  nudgeBig: 10,
  mode: 'design',
  codeLanguage: 'CSS',
  codeUnit: 'px',
  codeScale: 0,
};

/** Nudge amounts must be positive, finite and at most 10,000 px. */
export const isValidNudge = (value: number): boolean => Number.isFinite(value) && value > 0 && value <= 10_000;

function readStored(): ViewPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return VIEW_PREF_DEFAULTS;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return VIEW_PREF_DEFAULTS;
    const record = parsed as Record<string, unknown>;
    const flag = (key: BooleanPref): boolean => (typeof record[key] === 'boolean' ? (record[key] as boolean) : VIEW_PREF_DEFAULTS[key]);
    const amount = (key: NumberPref): number => {
      const value = record[key];
      return typeof value === 'number' && isValidNudge(value) ? value : VIEW_PREF_DEFAULTS[key];
    };
    return {
      rulers: flag('rulers'),
      outlines: flag('outlines'),
      outlineHidden: flag('outlineHidden'),
      maskOutlines: flag('maskOutlines'),
      pixelGrid: flag('pixelGrid'),
      layoutGuides: flag('layoutGuides'),
      snapToPixelGrid: flag('snapToPixelGrid'),
      propertyLabels: flag('propertyLabels'),
      smartSymbols: flag('smartSymbols'),
      spellCheck: flag('spellCheck'),
      nudgeSmall: amount('nudgeSmall'),
      nudgeBig: amount('nudgeBig'),
      mode: record['mode'] === 'draw' || record['mode'] === 'motion' || record['mode'] === 'dev' ? record['mode'] : VIEW_PREF_DEFAULTS.mode,
      codeLanguage: typeof record['codeLanguage'] === 'string' && record['codeLanguage'] in CODE_LANGUAGE_LABELS ? (record['codeLanguage'] as CodeLanguage) : VIEW_PREF_DEFAULTS.codeLanguage,
      codeUnit: typeof record['codeUnit'] === 'string' && record['codeUnit'] in CODE_UNITS ? (record['codeUnit'] as CodeUnit) : VIEW_PREF_DEFAULTS.codeUnit,
      codeScale: typeof record['codeScale'] === 'number' && record['codeScale'] >= 0 && record['codeScale'] <= 100 ? record['codeScale'] : VIEW_PREF_DEFAULTS.codeScale,
    };
  } catch {
    return VIEW_PREF_DEFAULTS;
  }
}

class ViewPrefsStore extends Observable<ViewPrefs> {
  set(patch: Partial<ViewPrefs>): void {
    this.setState(patch);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
    } catch {
      // Storage unavailable: the preference still applies for this session.
    }
  }

  toggle(key: BooleanPref): void {
    const patch: Partial<ViewPrefs> = { [key]: !this.state[key] };
    this.set(patch);
  }
}

export const viewPrefs = new ViewPrefsStore(readStored());

export const VIEW_PREF_COMMANDS: CommandDefinition[] = [
  {
    id: 'view.toggleRulers',
    label: 'Rulers',
    category: 'View',
    shortcuts: ['Shift+R'],
    checked: () => viewPrefs.getSnapshot().rulers,
    run: () => viewPrefs.toggle('rulers'),
  },
  {
    id: 'view.toggleOutlines',
    label: 'Show outlines',
    category: 'View',
    shortcuts: ['Mod+Shift+O'],
    checked: () => viewPrefs.getSnapshot().outlines,
    run: () => viewPrefs.toggle('outlines'),
  },
  {
    id: 'view.toggleOutlineHidden',
    label: 'Include hidden layers in outlines',
    category: 'View',
    checked: () => viewPrefs.getSnapshot().outlineHidden,
    run: () => viewPrefs.toggle('outlineHidden'),
  },
  {
    id: 'view.toggleMaskOutlines',
    label: 'Mask outlines',
    category: 'View',
    checked: () => viewPrefs.getSnapshot().maskOutlines,
    run: () => viewPrefs.toggle('maskOutlines'),
  },
  {
    id: 'view.togglePixelGrid',
    label: 'Pixel grid',
    category: 'View',
    shortcuts: ["Mod+'"],
    checked: () => viewPrefs.getSnapshot().pixelGrid,
    run: () => viewPrefs.toggle('pixelGrid'),
  },
  {
    id: 'view.toggleLayoutGuides',
    label: 'Layout guides',
    category: 'View',
    shortcuts: ['Shift+G'],
    checked: () => viewPrefs.getSnapshot().layoutGuides,
    run: () => viewPrefs.toggle('layoutGuides'),
  },
  {
    id: 'view.toggleSnapToPixelGrid',
    label: 'Snap to pixel grid',
    category: 'View',
    shortcuts: ["Mod+Shift+'"],
    checked: () => viewPrefs.getSnapshot().snapToPixelGrid,
    run: () => viewPrefs.toggle('snapToPixelGrid'),
  },
  {
    id: 'view.togglePropertyLabels',
    label: 'Property labels',
    category: 'View',
    checked: () => viewPrefs.getSnapshot().propertyLabels,
    run: () => viewPrefs.toggle('propertyLabels'),
  },
  {
    id: 'preferences.smartSymbols',
    label: 'Use smart quotes/symbols',
    category: 'View',
    checked: () => viewPrefs.getSnapshot().smartSymbols,
    run: () => viewPrefs.toggle('smartSymbols'),
  },
  {
    id: 'preferences.spellCheck',
    label: 'Check spelling',
    category: 'View',
    checked: () => viewPrefs.getSnapshot().spellCheck,
    run: () => viewPrefs.toggle('spellCheck'),
  },
];
