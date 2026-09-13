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

/**
 * Colors and metrics for on-canvas editor chrome (drawn with Canvas 2D, so CSS
 * variables are not available). Values mirror src/ui/tokens.css.
 */
export interface ChromeTheme {
  readonly selection: string;
  readonly selectionFill: string;
  /** Snapping guide lines and ⌥ measurements. */
  readonly guide: string;
  /** Equal-spacing indicators while moving. */
  readonly spacing: string;
  readonly component: string;
  readonly handleFill: string;
  readonly labelText: string;
  readonly frameTitle: string;
  readonly frameTitleSelected: string;
  /** Section title pill background and text. */
  readonly sectionTitleFill: string;
  readonly sectionTitleText: string;
  readonly rulerBackground: string;
  readonly rulerBorder: string;
  readonly rulerTick: string;
  readonly rulerText: string;
  /** Band marking the selection's extent on the rulers. */
  readonly rulerHighlight: string;
  readonly rulerFont: string;
  /** Ruler guide lines (selected and hovered guides use `selection`). */
  readonly rulerGuide: string;
  /** One-pixel grid lines at high zoom. */
  readonly pixelGrid: string;
  readonly font: string;
  readonly handleSize: number;
  readonly hoverWidth: number;
  readonly selectionWidth: number;
}

const base = {
  selection: '#0d99ff',
  selectionFill: 'rgba(13, 153, 255, 0.08)',
  guide: '#f24822',
  spacing: '#e0249a',
  component: '#9747ff',
  handleFill: '#ffffff',
  labelText: '#ffffff',
  frameTitleSelected: '#0d99ff',
  font: '500 11px "Inter Variable", Inter, system-ui, sans-serif',
  handleSize: 7,
  hoverWidth: 1.5,
  selectionWidth: 1,
} as const;

const rulerBase = {
  rulerHighlight: 'rgba(13, 153, 255, 0.18)',
  rulerFont: '10px "Inter Variable", Inter, system-ui, sans-serif',
  rulerGuide: '#f24822',
} as const;

export const LIGHT_CHROME: ChromeTheme = {
  ...base,
  ...rulerBase,
  frameTitle: 'rgba(0, 0, 0, 0.5)',
  sectionTitleFill: '#e6e6e6',
  sectionTitleText: '#1e1e1e',
  rulerBackground: '#ffffff',
  rulerBorder: 'rgba(0, 0, 0, 0.1)',
  rulerTick: 'rgba(0, 0, 0, 0.3)',
  rulerText: 'rgba(0, 0, 0, 0.5)',
  pixelGrid: 'rgba(0, 0, 0, 0.08)',
};
export const DARK_CHROME: ChromeTheme = {
  ...base,
  ...rulerBase,
  frameTitle: 'rgba(255, 255, 255, 0.55)',
  sectionTitleFill: '#383838',
  sectionTitleText: '#ffffff',
  rulerBackground: '#2c2c2c',
  rulerBorder: 'rgba(255, 255, 255, 0.1)',
  rulerTick: 'rgba(255, 255, 255, 0.3)',
  rulerText: 'rgba(255, 255, 255, 0.55)',
  pixelGrid: 'rgba(255, 255, 255, 0.08)',
};
