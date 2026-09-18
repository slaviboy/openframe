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

import type { PathCommand } from '@/core/geometry/corners';
import type { Id } from '@/core/ids/ids';
import type { SceneNode, TextNode } from '@/core/schema/document';
import type { Editor } from '../editor';
import type { FontLoader } from '@/core/text/glyph-paths';
import { textOutline } from '../commands/outline-text';

/** What a text layer's outline depends on: change any of it and the glyphs have to be read again. */
function signatureOf(node: TextNode): string {
  return JSON.stringify([
    node.characters,
    node.fontName,
    node.fontSize,
    node.letterSpacing,
    node.lineHeight,
    node.paragraphSpacing,
    node.textAlignHorizontal,
    node.textAlignVertical,
    node.textCase,
    node.textAutoResize,
    node.size.width,
    node.size.height,
    node.styleRuns,
  ]);
}

/**
 * Glyph outlines of text layers, kept ready for the things that need them while a frame is being drawn.
 *
 * A boolean group combines its children's outlines as the frame is painted, and a text layer's glyphs come from a
 * font file that has to be fetched and parsed — which a frame cannot wait for. So the outlines are worked out off to
 * the side: `get` answers at once with what is already in hand (null until then, which leaves the layer's box being
 * combined, as before), and asks for anything missing; when an outline arrives the canvas is asked to draw again,
 * and the next frame combines the real glyphs.
 */
export class GlyphOutlineCache {
  private readonly outlines = new Map<Id, { readonly signature: string; readonly commands: readonly PathCommand[] }>();
  private readonly pending = new Set<Id>();
  private loader: Promise<FontLoader> | null = null;

  /** `fonts` reads the font files; it is a seam so tests need not pull the rendering engine in. */
  constructor(
    private readonly editor: Editor,
    private readonly fonts: () => Promise<FontLoader> = () =>
      import('@/engine/text/outline-font').then(({ bundledFontLoader }) => bundledFontLoader((family: string) => this.editor.textLayout?.fontBytesOf?.(family) ?? null)),
  ) {}

  /** The outlines of a text layer if they are ready; null while they are not, asking for them the first time. */
  get(node: SceneNode): readonly PathCommand[] | null {
    if (node.type !== 'TEXT' || node.characters === '') return null;
    const signature = signatureOf(node);
    const held = this.outlines.get(node.id);
    if (held?.signature === signature) return held.commands;
    void this.load(node, signature);
    return null;
  }

  /** Forgets everything read so far, which is what a new document needs. */
  clear(): void {
    this.outlines.clear();
    this.pending.clear();
  }

  /** Reads a layer's glyphs once, then asks for a redraw so the next frame can use them. */
  private async load(node: TextNode, signature: string): Promise<void> {
    if (this.pending.has(node.id)) return;
    this.pending.add(node.id);
    try {
      // The font reader is fetched on demand: nothing needs it until a text layer is inside a boolean group.
      this.loader ??= this.fonts();
      const load = await this.loader;
      const commands = await textOutline(this.editor, node, load);
      // The layer may have been edited while the font was being read, in which case this answer is already stale.
      const current = this.editor.doc.get(node.id);
      if (commands && current?.type === 'TEXT' && signatureOf(current) === signature) {
        this.outlines.set(node.id, { signature, commands });
        this.editor.requestRender();
      }
    } catch {
      // A font that cannot be read leaves the layer contributing its box, which is what it did before.
    } finally {
      this.pending.delete(node.id);
    }
  }
}
