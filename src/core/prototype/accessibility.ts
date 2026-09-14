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

import type { DocumentStore } from '../document/store';
import type { Id } from '../ids/ids';
import { isAutoLayoutFrame } from '../layout/auto-layout';
import type { SceneNode, TextNode } from '../schema/document';
import { paragraphRanges, paragraphStyleOffset } from '../text/paragraphs';
import { textSegments, textStyleAt } from '../text/style-runs';

/** A stretch of text: a link when it has an address. */
export interface TextPart {
  readonly text: string;
  readonly href?: string;
}

/** A list in a text layer: its items, each with the lists nested under it (deeper indentation). */
export interface TextList {
  readonly ordered: boolean;
  readonly items: readonly { readonly parts: readonly TextPart[]; readonly lists: readonly TextList[] }[];
}

/** A text layer's content as read: paragraphs, and bulleted or numbered lists. */
export type TextBlock = { readonly type: 'paragraph'; readonly parts: readonly TextPart[] } | { readonly type: 'list'; readonly list: TextList };

/**
 * Accessible prototypes: what a screen reader finds in a screen. Top-level frames, components and instances are
 * sections labelled with their layer names; layers with an On click interaction are links (Navigate to, Open link) or
 * buttons (any other action); shapes with an image fill are images named after the layer; text layers are text.
 */
export type AccessibleNode =
  | { readonly kind: 'section'; readonly nodeId: Id; readonly label: string; readonly children: readonly AccessibleNode[] }
  | { readonly kind: 'link' | 'button' | 'image'; readonly nodeId: Id; readonly label: string }
  | { readonly kind: 'text'; readonly nodeId: Id; readonly text: string; readonly blocks: readonly TextBlock[] };

/** Shapes that show an image fill as an image (frames and groups hold layers instead). */
const SHAPE_TYPES: ReadonlySet<SceneNode['type']> = new Set(['RECTANGLE', 'ELLIPSE', 'POLYGON', 'STAR', 'VECTOR', 'BOOLEAN_OPERATION']);

const scene = (store: DocumentStore, id: Id): SceneNode | undefined => {
  const node = store.get(id);
  return node && 'transform' in node && node.visible ? node : undefined;
};

/** The text in a layer and the layers in it, in order. */
function textIn(store: DocumentStore, id: Id): string {
  const parts: string[] = [];
  const visit = (current: Id) => {
    const node = scene(store, current);
    if (!node) return;
    if (node.type === 'TEXT' && node.characters.trim()) parts.push(node.characters.trim());
    store.children(current).forEach(visit);
  };
  visit(id);
  return parts.join(' ');
}

/** Link for On click Navigate to and Open link; button for any other On click action; null without On click. */
function interactionKind(node: SceneNode): 'link' | 'button' | null {
  const first = node.reactions?.find((reaction) => reaction.trigger.type === 'ON_CLICK')?.actions[0];
  if (!first) return null;
  return (first.type === 'NODE' && first.navigation === 'NAVIGATE') || first.type === 'URL' ? 'link' : 'button';
}

/** A layer's children as they are read: an auto layout frame's in layout order, others top layer first (as the Layers panel lists them). */
function readingOrder(store: DocumentStore, node: SceneNode): Id[] {
  const children = store.children(node.id);
  return isAutoLayoutFrame(node) ? [...children] : [...children].reverse();
}

interface ListItemDraft {
  readonly ordered: boolean;
  readonly level: number;
  readonly parts: readonly TextPart[];
}

type MutableList = { ordered: boolean; items: { parts: readonly TextPart[]; lists: TextList[] }[] };

/** Consecutive list paragraphs as lists: items at the same level and kind share a list; deeper items nest under the item before them. */
function nestLists(items: readonly ListItemDraft[]): TextList[] {
  let at = 0;
  const build = (level: number): MutableList[] => {
    const lists: MutableList[] = [];
    while (at < items.length && items[at]!.level >= level) {
      const item = items[at]!;
      if (item.level > level) {
        const nested = build(item.level);
        const previous = lists.at(-1)?.items.at(-1);
        if (previous) previous.lists.push(...nested);
        else lists.push(...nested);
        continue;
      }
      at++;
      const current = lists.at(-1);
      const entry = { parts: item.parts, lists: [] as TextList[] };
      if (current && current.ordered === item.ordered) current.items.push(entry);
      else lists.push({ ordered: item.ordered, items: [entry] });
    }
    return lists;
  };
  return build(Math.min(...items.map((item) => item.level)));
}

/** A text layer's paragraphs and lists (by each paragraph's list type and indentation), with its links. */
export function textBlocks(node: TextNode): TextBlock[] {
  const segments = textSegments(node);
  const partsIn = (start: number, end: number): TextPart[] => {
    const parts: TextPart[] = [];
    for (const segment of segments) {
      const from = Math.max(start, segment.start);
      const to = Math.min(end, segment.end);
      if (to <= from) continue;
      const text = node.characters.slice(from, to);
      const href = segment.hyperlink?.value;
      const previous = parts.at(-1);
      if (previous && previous.href === href) parts[parts.length - 1] = { ...previous, text: previous.text + text };
      else parts.push(href ? { text, href } : { text });
    }
    return parts;
  };
  const blocks: TextBlock[] = [];
  let items: ListItemDraft[] = [];
  const flush = () => {
    if (items.length > 0) for (const list of nestLists(items)) blocks.push({ type: 'list', list });
    items = [];
  };
  for (const range of paragraphRanges(node.characters)) {
    const parts = partsIn(range.start, range.end);
    const style = textStyleAt(node, paragraphStyleOffset(range));
    if (style.listType !== 'NONE' && parts.length > 0) {
      items.push({ ordered: style.listType === 'ORDERED', level: style.indentation, parts });
      continue;
    }
    flush();
    if (parts.some((part) => part.text.trim())) blocks.push({ type: 'paragraph', parts });
  }
  flush();
  return blocks;
}

/** What a screen reader finds in a top-level frame (itself a section). */
export function accessibleContent(store: DocumentStore, frameId: Id): AccessibleNode[] {
  const visit = (id: Id): AccessibleNode[] => {
    const node = scene(store, id);
    if (!node) return [];
    const interactive = interactionKind(node);
    if (interactive) return [{ kind: interactive, nodeId: id, label: textIn(store, id) || node.name }];
    if (node.type === 'TEXT') return node.characters.trim() ? [{ kind: 'text', nodeId: id, text: node.characters, blocks: textBlocks(node) }] : [];
    if (SHAPE_TYPES.has(node.type) && 'fills' in node && node.fills.some((paint) => paint.type === 'IMAGE' && paint.visible)) return [{ kind: 'image', nodeId: id, label: node.name }];
    const children = readingOrder(store, node).flatMap(visit);
    const labelled = id === frameId || (node.type === 'FRAME' && Boolean(node.component || node.componentSet || node.instance));
    return labelled ? [{ kind: 'section', nodeId: id, label: node.name, children }] : children;
  };
  return visit(frameId);
}
