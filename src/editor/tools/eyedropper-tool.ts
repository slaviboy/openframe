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

import { toHex6 } from '@/core/color/color';
import { solid } from '@/core/document/factory';
import type { Vec2 } from '@/core/math/vec';
import { hasGeometry, type Color, type SceneNode } from '@/core/schema/document';
import { selectedSceneNodes } from '../commands/selection-helpers';
import type { Editor } from '../editor';
import type { ToolId } from '../stores/editor-store';
import type { CursorKind, PointerInfo, Tool, ToolEnvironment } from './types';

/** The color under the pointer while the eyedropper is active, for the loupe. */
export interface EyedropperSample {
  readonly screen: Vec2;
  readonly color: Color;
  /** The device pixels around it, `size` on a side, RGBA a byte each — what the loupe magnifies. */
  readonly region: { readonly size: number; readonly pixels: Uint8Array } | null;
  /** Whether clicking copies the color rather than applying it, which is what Dev Mode does. */
  readonly copies: boolean;
}

/** How far around the pointer the loupe reads, in device pixels: an 11×11 square, as the reference shows. */
export const LOUPE_RADIUS = 5;

/**
 * Applies a sampled color to every selected layer as one undo step: the top visible solid fill
 * takes the color (strokes for lines), or a solid fill is added when there is none.
 */
export function applyColorToSelection(editor: Editor, color: Color): boolean {
  const nodes = selectedSceneNodes(editor)
    .map((id) => editor.doc.getOrThrow(id) as SceneNode)
    .filter(hasGeometry);
  if (nodes.length === 0) return false;
  const opaque = { ...color, a: 1 };
  editor.history.run('Apply sampled color', (tx) => {
    for (const node of nodes) {
      const field = node.type === 'LINE' ? 'strokes' : 'fills';
      const paints = node[field];
      let top = -1;
      for (let i = paints.length - 1; i >= 0; i--) {
        if (paints[i]!.visible && paints[i]!.type === 'SOLID') {
          top = i;
          break;
        }
      }
      tx.set(node.id, field, top >= 0 ? paints.map((p, i) => (i === top && p.type === 'SOLID' ? { ...p, color: opaque } : p)) : [...paints, solid(opaque)]);
    }
  });
  return true;
}

/**
 * Eyedropper (I): shows the rendered color under the pointer and, on click, applies it to the
 * selection, then returns to the Move tool. When a caller asks for a color (`pick`, used by the
 * color picker), the click resolves that request instead and the previous tool comes back.
 * Escape or switching tools cancels.
 */
export class EyedropperTool implements Tool {
  readonly id = 'eyedropper' as const;
  readonly active = false;
  sample: EyedropperSample | null = null;
  private pending: ((color: Color | null) => void) | null = null;
  private returnTool: ToolId = 'move';

  constructor(private readonly env: ToolEnvironment) {}

  /** Starts the eyedropper for a caller; resolves with the clicked color, or null when canceled. */
  pick(returnTool: ToolId): Promise<Color | null> {
    this.resolve(null);
    this.returnTool = returnTool;
    return new Promise((resolve) => {
      this.pending = resolve;
      this.env.editor.state.setTool('eyedropper');
    });
  }

  cursor(): CursorKind {
    return 'eyedropper';
  }

  pointerMove(p: PointerInfo): void {
    const { editor } = this.env;
    const color = editor.sampleCanvasPixel?.(p.screen) ?? null;
    const region = color ? (editor.sampleCanvasRegion?.(p.screen, LOUPE_RADIUS) ?? null) : null;
    this.sample = color ? { screen: p.screen, color, region, copies: this.copies() } : null;
    editor.requestRender();
  }

  /**
   * Dev Mode reads the design rather than editing it, so there the eyedropper is the reference's
   * **Copy colors**: clicking puts the color on the clipboard. Everywhere else it paints the selection.
   * A caller waiting on `pick` always wins, since it asked for the color itself.
   */
  private copies(): boolean {
    return this.pending === null && this.env.editor.state.getSnapshot().mode === 'dev';
  }

  pointerDown(p: PointerInfo): void {
    if (p.button !== 0) return;
    const { editor } = this.env;
    const color = editor.sampleCanvasPixel?.(p.screen) ?? null;
    if (!color) return;
    const copies = this.copies();
    this.sample = null;
    if (this.pending) {
      const resolve = this.pending;
      this.pending = null;
      editor.state.setTool(this.returnTool);
      resolve(color);
      return;
    }
    if (copies) {
      // Dev Mode hands the color over rather than painting with it, which is what its label promises.
      void navigator.clipboard?.writeText(`#${toHex6(color).toUpperCase()}`).catch(() => undefined);
      editor.state.setTool('move');
      return;
    }
    applyColorToSelection(editor, color);
    editor.state.setTool('move');
  }

  pointerUp(): void {}

  cancel(): boolean {
    const { editor } = this.env;
    const wasActive = this.pending !== null || editor.state.getSnapshot().tool === 'eyedropper';
    const back = this.pending ? this.returnTool : 'move';
    this.leave();
    if (editor.state.getSnapshot().tool === 'eyedropper') editor.state.setTool(back);
    return wasActive;
  }

  /** The tool was switched away: cancel any pending request and hide the loupe. */
  leave(): void {
    this.resolve(null);
    this.sample = null;
    this.env.editor.requestRender();
  }

  private resolve(color: Color | null): void {
    const resolve = this.pending;
    this.pending = null;
    resolve?.(color);
  }
}
