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

import { keyOnTop, makeText } from '@/core/document/factory';
import type { Id } from '@/core/ids/ids';
import { hitTestDeepest } from '@/core/scene/hit-test';
import type { TextNode, VectorNode } from '@/core/schema/document';
import { caret } from '@/core/text/text-editing';
import type { Editor } from '../editor';
import { beginTextEdit, newTextEditKey } from '../interactions/text-edit';
import type { CursorKind, PointerInfo, Tool, ToolEnvironment } from './types';

/** The vector layer under the pointer, which text can be placed on. */
function vectorAt(editor: Editor, world: { x: number; y: number }): VectorNode | null {
  const tolerance = 8 / editor.state.viewport.zoom;
  const id = hitTestDeepest(editor.doc, editor.scene, editor.pageId, world, { tolerance });
  const node = id === null ? undefined : editor.doc.get(id);
  return node?.type === 'VECTOR' ? node : null;
}

/**
 * Text on a path: clicking a vector layer's path adds a text layer that follows it and starts editing. The text takes
 * the path's place on the canvas — the two share a transform, so the text is laid along the path as it is drawn — and
 * the fills and effects of the layer it was placed on, as the reference does.
 */
export class TextPathTool implements Tool {
  readonly id = 'textOnPath' as const;
  private hover: Id | null = null;

  constructor(private readonly env: ToolEnvironment) {}

  get active(): boolean {
    return false;
  }

  cursor(): CursorKind {
    return 'text';
  }

  pointerMove(p: PointerInfo): void {
    const { editor } = this.env;
    const path = vectorAt(editor, p.world);
    const next = path?.id ?? null;
    if (next === this.hover) return;
    this.hover = next;
    editor.state.setHover(next);
  }

  pointerDown(p: PointerInfo): void {
    if (p.button !== 0) return;
    const { editor } = this.env;
    editor.scene.ensure(editor.pageId);
    const path = vectorAt(editor, p.world);
    if (!path) return;
    const id = editor.ids.next();
    const base = makeText({ id, parent: { id: path.parent.id, key: keyOnTop(editor.doc, path.parent.id) }, name: 'Text', x: 0, y: 0, width: 0, height: 0 });
    const node: TextNode = {
      ...base,
      // The text sits where the path sits, so the path's own coordinates lay it out.
      transform: [...path.transform] as TextNode['transform'],
      size: { width: path.size.width, height: path.size.height },
      textAutoResize: 'NONE',
      fills: path.fills.map((paint) => ({ ...paint })),
      ...(path.effects && path.effects.length > 0 ? { effects: path.effects.map((effect) => ({ ...effect })) } : {}),
      textPath: { pathId: path.id, start: 0, flipped: false },
    };
    const key = newTextEditKey();
    editor.history.run('Create text on path', (tx) => tx.create({ ...node, autoRename: true }), { mergeKey: key });
    editor.state.setTool('move');
    beginTextEdit(editor, id, { created: true, key, selection: caret(0) });
  }

  pointerUp(): void {
    // The text layer is made on the press, as the Text tool does for a click.
  }

  cancel(): boolean {
    return false;
  }
}
