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

import { keyOnTop, makeFrame } from '@/core/document/factory';
import type { FramePreset } from '@/core/document/frame-presets';
import type { Id } from '@/core/ids/ids';
import type { Vec2 } from '@/core/math/vec';
import type { SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import { containerAt, nextLayerName, parentToLocal, roundPoint } from '../tools/draw-helpers';

/**
 * Frame tool presets: a frame of the preset's size centered on a world point (inside the frame there), named after the
 * preset. One undo step; the frame is selected and the Move tool returns.
 */
export function placeFramePreset(editor: Editor, preset: FramePreset, world: Vec2): Id {
  editor.scene.ensure(editor.pageId);
  const parent = containerAt(editor, world);
  const origin = roundPoint(parentToLocal(editor, parent)({ x: world.x - preset.width / 2, y: world.y - preset.height / 2 }));
  const id = editor.ids.next();
  editor.history.run('Create frame', (tx) =>
    tx.create(makeFrame({ id, parent: { id: parent, key: keyOnTop(editor.doc, parent) }, name: nextLayerName(editor, preset.name), x: origin.x, y: origin.y, width: preset.width, height: preset.height })),
  );
  editor.state.select([id]);
  editor.state.setTool('move');
  return id;
}

/** Changes frames to a preset's size (the Frame dropdown). One undo step; false when none of the layers is a frame. */
export function resizeFramesToPreset(editor: Editor, ids: readonly Id[], preset: FramePreset): boolean {
  const frames = ids.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node?.type === 'FRAME');
  if (frames.length === 0) return false;
  editor.history.run('Resize frame', (tx) => frames.forEach((frame) => tx.set(frame.id, 'size', { width: preset.width, height: preset.height })));
  return true;
}
