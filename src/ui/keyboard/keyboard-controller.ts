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

import type { Editor } from '@/editor/editor';
import { Keymap } from '@/editor/keymap/keymap';
import type { ToolManager } from '@/editor/tools/tool-manager';

export const IS_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

const isEditableTarget = (target: EventTarget | null): boolean => {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
};

/** Plain keys that operate focused widgets (lists, trees, buttons) unless focus is on the canvas. */
const NAVIGATION_KEYS: ReadonlySet<string> = new Set(['Tab', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/** Focus is on the canvas or nowhere in particular (the page body). */
const isCanvasContext = (target: EventTarget | null): boolean =>
  target === null ||
  target === document.body ||
  target === document.documentElement ||
  (target instanceof Element && target.closest('[data-canvas-host]') !== null);

/** Focused controls where Space/Enter activate the control rather than the hand tool. */
const isActivatableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement && target.closest('button,[role=button],[role=menuitem],[role=menuitemradio],[role=option],[role=tab]') !== null;

/**
 * Global keyboard handling for the canvas context: command shortcuts from the registry,
 * Space for the temporary hand tool, Escape to cancel gestures or deselect, and modifier
 * tracking for in-progress gestures.
 *
 * Listens in the bubble phase on window, so focused widgets (text inputs, the layers tree,
 * menus) handle their own keys first and stop propagation for keys they consume.
 */
export class KeyboardController {
  private readonly keymap = new Keymap(IS_MAC);
  private readonly shortcutListeners = new Set<(commandId: string) => void>();
  private spaceDown = false;

  constructor(
    private readonly editor: Editor,
    private readonly tools: ToolManager,
    private readonly target: Window = window,
  ) {
    const defaults = new Map(editor.commands.all().filter((c) => c.shortcuts?.length).map((c) => [c.id, c.shortcuts!]));
    this.keymap.setBindings(defaults);
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  /** Notified after a keyboard shortcut runs a command (e.g. to highlight used shortcuts). */
  onShortcut(listener: (commandId: string) => void): () => void {
    this.shortcutListeners.add(listener);
    return () => this.shortcutListeners.delete(listener);
  }

  dispose(): void {
    this.shortcutListeners.clear();
    this.target.removeEventListener('keydown', this.onKeyDown);
    this.target.removeEventListener('keyup', this.onKeyUp);
    this.target.removeEventListener('blur', this.onBlur);
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    this.tools.modifiersChanged({ shift: e.shiftKey, alt: e.altKey, mod: IS_MAC ? e.metaKey : e.ctrlKey, ctrl: e.ctrlKey });
    if (isEditableTarget(e.target)) return;

    if (e.defaultPrevented) return;
    if (e.code === 'Space') {
      if (isActivatableTarget(e.target)) return;
      e.preventDefault();
      if (!this.spaceDown && !e.repeat) {
        this.spaceDown = true;
        this.editor.state.springTool('hand');
      }
      return;
    }

    if (e.key === 'Escape' && this.tools.cancel()) {
      e.preventDefault();
      this.editor.requestRender();
      return;
    }
    // Delete discards images waiting in Place image (instead of deleting the selection).
    if ((e.key === 'Delete' || e.key === 'Backspace') && this.tools.imageTool.pending.length > 0 && this.tools.cancel()) {
      e.preventDefault();
      return;
    }

    const candidates = this.keymap.resolveAll(e);
    if (candidates.length === 0) return;
    // Plain navigation keys belong to the focused widget unless focus is on the canvas.
    if (NAVIGATION_KEYS.has(e.key) && !e.metaKey && !e.ctrlKey && !e.altKey && !isCanvasContext(e.target)) return;
    // Several commands may share a key (Return selects children or places an object): run the first enabled one.
    // A key whose commands can't run is left to the browser (e.g. Tab keeps moving focus).
    const commandId = candidates.find((id) => this.editor.commands.isEnabled(id));
    if (!commandId) return;
    // Tool shortcuts and most commands are ignored while a pointer gesture is active.
    if (this.tools.tool.active && !commandId.startsWith('view.')) return;
    e.preventDefault();
    if (this.editor.commands.run(commandId)) for (const listener of this.shortcutListeners) listener(commandId);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.tools.modifiersChanged({ shift: e.shiftKey, alt: e.altKey, mod: IS_MAC ? e.metaKey : e.ctrlKey, ctrl: e.ctrlKey });
    if (e.code === 'Space' && this.spaceDown) {
      this.spaceDown = false;
      if (!this.tools.tool.active) this.editor.state.releaseSpring();
    }
  };

  private readonly onBlur = (): void => {
    if (this.spaceDown) {
      this.spaceDown = false;
      this.editor.state.releaseSpring();
    }
  };
}
