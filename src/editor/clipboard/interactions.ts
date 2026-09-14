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

import { z } from 'zod';
import { ReactionSchema, type Reaction, type SceneNode } from '@/core/schema/document';
import { parseUntrustedJson } from '@/core/serialize/safe-json';
import { canonicalStringify } from '@/core/serialize/serialize';
import type { Editor } from '../editor';
import { ClipboardError, fromBase64, toBase64 } from './payload';

const HTML_MARKER = 'data-openframe-interactions';

/** Copied interaction details: whole interactions (trigger and actions). */
const InteractionsPayloadSchema = z.object({
  kind: z.literal('interactions'),
  reactions: z.array(ReactionSchema).min(1).max(64),
});

/** The interactions of the connections selected on the canvas, each once and in the order selected; null when none is selected. */
export function copiedInteractions(editor: Editor): Reaction[] | null {
  const seen = new Set<string>();
  const reactions: Reaction[] = [];
  for (const ref of editor.state.getSnapshot().selectedConnections) {
    const key = `${ref.sourceId}\0${ref.reactionIndex}`;
    const reaction = (editor.doc.get(ref.sourceId) as SceneNode | undefined)?.reactions?.[ref.reactionIndex];
    if (!reaction || seen.has(key)) continue;
    seen.add(key);
    reactions.push(reaction);
  }
  return reactions.length > 0 ? reactions : null;
}

export function encodeInteractionsHtml(reactions: readonly Reaction[]): string {
  return `<meta charset="utf-8"><div ${HTML_MARKER}="v1:${toBase64(canonicalStringify({ kind: 'interactions', reactions }))}">${reactions.length === 1 ? 'Interaction' : 'Interactions'}</div>`;
}

/** Reads interaction details from clipboard HTML: null when absent; throws ClipboardError when damaged or invalid. */
export function decodeInteractionsHtml(html: string): Reaction[] | null {
  const marker = new RegExp(`${HTML_MARKER}="([^"]*)"`).exec(html);
  if (!marker) return null;
  const value = /^v1:([A-Za-z0-9+/]+={0,2})$/.exec(marker[1]!);
  if (!value) throw new ClipboardError('Clipboard content is damaged');
  let raw: unknown;
  try {
    raw = parseUntrustedJson(fromBase64(value[1]!));
  } catch {
    throw new ClipboardError('Clipboard content is damaged');
  }
  const parsed = InteractionsPayloadSchema.safeParse(raw);
  if (!parsed.success) throw new ClipboardError('Clipboard content is not valid Openframe data');
  return parsed.data.reactions;
}
