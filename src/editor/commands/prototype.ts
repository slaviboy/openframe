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

import type { Transaction } from '@/core/history/history';
import type { Id } from '@/core/ids/ids';
import { DEFAULT_OVERLAY, flowForNewConnection, flowsOf, nextFlowName } from '@/core/prototype/flows';
import { makeReaction, topLevelFrame, triggerAllowed } from '@/core/prototype/reactions';
import type { FlowStartingPoint, OverlaySettings, PageNode, Reaction, SceneNode } from '@/core/schema/document';
import type { Editor } from '../editor';

const reactionsOf = (node: SceneNode | undefined): readonly Reaction[] => node?.reactions ?? [];

/** The layers among `ids` (pages, the document and resources have no interactions). */
function layers(editor: Editor, ids: readonly Id[]): SceneNode[] {
  return ids.map((id) => editor.doc.get(id)).filter((node): node is SceneNode => node !== undefined && 'transform' in node);
}

/** A connection between two frames that had none starts a flow at the first frame. */
function startFlowForConnection(tx: Transaction, nodeId: Id, reaction: Reaction, index: number): void {
  const found = flowForNewConnection(tx.store, nodeId, reaction, index);
  if (!found) return;
  const page = tx.store.getOrThrow(found.pageId) as PageNode;
  tx.set(found.pageId, 'flowStartingPoints', [...(page.flowStartingPoints ?? []), found.flow]);
}

/**
 * Adds an interaction to each layer (in bulk for several): its first free trigger navigates to `destinationId`
 * instantly. One undo step; false when there are no layers.
 */
export function addInteraction(editor: Editor, ids: readonly Id[], destinationId: Id | null = null, navigation: 'NAVIGATE' | 'CHANGE_TO' = 'NAVIGATE'): boolean {
  const targets = layers(editor, ids);
  if (targets.length === 0) return false;
  editor.history.run('Add interaction', (tx) =>
    targets.forEach((node) => {
      const current = reactionsOf(tx.store.get(node.id) as SceneNode);
      const reaction = makeReaction(current, destinationId, navigation);
      startFlowForConnection(tx, node.id, reaction, current.length);
      tx.set(node.id, 'reactions', [...current, reaction]);
    }),
  );
  return true;
}

/**
 * Replaces an interaction of layers (its trigger, actions and animation). Layers that can't take the trigger (it would
 * repeat one they have) keep theirs. One undo step.
 */
export function updateInteraction(editor: Editor, ids: readonly Id[], index: number, reaction: Reaction): boolean {
  const targets = layers(editor, ids).filter((node) => reactionsOf(node)[index] !== undefined);
  if (targets.length === 0) return false;
  editor.history.run('Change interaction', (tx) =>
    targets.forEach((node) => {
      const current = reactionsOf(tx.store.get(node.id) as SceneNode);
      const trigger = triggerAllowed(current, reaction.trigger.type, index) ? reaction.trigger : current[index]!.trigger;
      const next = { ...reaction, trigger };
      startFlowForConnection(tx, node.id, next, index);
      tx.set(
        node.id,
        'reactions',
        current.map((existing, i) => (i === index ? next : existing)),
      );
    }),
  );
  return true;
}

/** Removes an interaction from layers. One undo step. */
export function removeInteraction(editor: Editor, ids: readonly Id[], index: number): boolean {
  const targets = layers(editor, ids).filter((node) => reactionsOf(node)[index] !== undefined);
  if (targets.length === 0) return false;
  editor.history.run('Remove interaction', (tx) =>
    targets.forEach((node) => {
      const next = reactionsOf(tx.store.get(node.id) as SceneNode).filter((_, i) => i !== index);
      tx.set(node.id, 'reactions', next.length > 0 ? next : undefined);
    }),
  );
  return true;
}

/** A connection on the canvas: one action of one interaction on a hotspot. */
export interface ConnectionRef {
  readonly sourceId: Id;
  readonly reactionIndex: number;
  readonly actionIndex: number;
}

/** Points connections at another destination (dragging them to a frame). One undo step; false when none applies. */
export function setConnectionsDestination(editor: Editor, refs: readonly ConnectionRef[], destinationId: Id): boolean {
  const applicable = refs.filter((ref) => {
    const action = (editor.doc.get(ref.sourceId) as SceneNode | undefined)?.reactions?.[ref.reactionIndex]?.actions[ref.actionIndex];
    return action?.type === 'NODE';
  });
  if (applicable.length === 0) return false;
  editor.history.run('Change destination', (tx) => {
    for (const ref of applicable) {
      const reactions = reactionsOf(tx.store.get(ref.sourceId) as SceneNode);
      tx.set(
        ref.sourceId,
        'reactions',
        reactions.map((reaction, r) =>
          r === ref.reactionIndex ? { ...reaction, actions: reaction.actions.map((action, a) => (a === ref.actionIndex && action.type === 'NODE' ? { ...action, destinationId } : action)) } : reaction,
        ),
      );
    }
  });
  return true;
}

/**
 * Removes connections (dragging them off onto empty canvas): their actions go, and an interaction left without actions
 * goes with them. One undo step.
 */
export function removeConnections(editor: Editor, refs: readonly ConnectionRef[]): boolean {
  const bySource = new Map<Id, ConnectionRef[]>();
  for (const ref of refs) bySource.set(ref.sourceId, [...(bySource.get(ref.sourceId) ?? []), ref]);
  const applicable = [...bySource].filter(([sourceId, list]) => list.some((ref) => (editor.doc.get(sourceId) as SceneNode | undefined)?.reactions?.[ref.reactionIndex]?.actions[ref.actionIndex] !== undefined));
  if (applicable.length === 0) return false;
  editor.history.run('Remove connection', (tx) => {
    for (const [sourceId, list] of applicable) {
      const reactions = reactionsOf(tx.store.get(sourceId) as SceneNode)
        .map((reaction, r) => ({ ...reaction, actions: reaction.actions.filter((_, a) => !list.some((ref) => ref.reactionIndex === r && ref.actionIndex === a)) }))
        .filter((reaction) => reaction.actions.length > 0);
      tx.set(sourceId, 'reactions', reactions.length > 0 ? reactions : undefined);
    }
  });
  return true;
}

/** The page a top-level frame is on; null for layers that aren't top-level frames. */
function framePage(editor: Editor, frameId: Id): PageNode | null {
  if (topLevelFrame(editor.doc, frameId) !== frameId) return null;
  const pageId = editor.doc.pageOf(frameId);
  const page = pageId === null ? undefined : editor.doc.get(pageId);
  return page?.type === 'PAGE' ? page : null;
}

/** Makes a top-level frame a flow starting point (Flow 1, Flow 2, …). One undo step; false when it can't be one or is one. */
export function addFlowStartingPoint(editor: Editor, frameId: Id): boolean {
  const page = framePage(editor, frameId);
  if (!page) return false;
  const flows = flowsOf(editor.doc, page.id);
  if (flows.some((flow) => flow.nodeId === frameId)) return false;
  editor.history.run('Add flow starting point', (tx) => tx.set(page.id, 'flowStartingPoints', [...flows, { nodeId: frameId, name: nextFlowName(flows) }]));
  return true;
}

/** Renames or describes the flow starting at a frame (an empty name keeps the old one). One undo step. */
export function updateFlowStartingPoint(editor: Editor, frameId: Id, patch: { readonly name?: string; readonly description?: string }): boolean {
  const page = framePage(editor, frameId);
  if (!page) return false;
  const flows = flowsOf(editor.doc, page.id);
  const flow = flows.find((candidate) => candidate.nodeId === frameId);
  if (!flow) return false;
  const name = patch.name?.trim() || flow.name;
  const description = patch.description === undefined ? flow.description : patch.description.trim();
  const next: FlowStartingPoint = { nodeId: frameId, name, ...(description ? { description } : {}) };
  editor.history.run('Change flow', (tx) => tx.set(page.id, 'flowStartingPoints', flows.map((candidate) => (candidate === flow ? next : candidate))));
  return true;
}

/** Removes the flow starting at a frame. One undo step. */
export function removeFlowStartingPoint(editor: Editor, frameId: Id): boolean {
  const page = framePage(editor, frameId);
  if (!page) return false;
  const flows = flowsOf(editor.doc, page.id);
  if (!flows.some((flow) => flow.nodeId === frameId)) return false;
  const next = flows.filter((flow) => flow.nodeId !== frameId);
  editor.history.run('Remove flow starting point', (tx) => tx.set(page.id, 'flowStartingPoints', next.length > 0 ? next : undefined));
  return true;
}

/** Sets the device prototypes on a page play in (null for none). One undo step. */
export function setPrototypeDevice(editor: Editor, pageId: Id, device: PageNode['prototypeDevice'] | null): boolean {
  if (editor.doc.get(pageId)?.type !== 'PAGE') return false;
  editor.history.run('Change prototype device', (tx) => tx.set(pageId, 'prototypeDevice', device ?? undefined));
  return true;
}

/** Sets the color behind prototypes on a page in presentation view (null for the canvas color). One undo step. */
export function setPrototypeBackground(editor: Editor, pageId: Id, color: PageNode['prototypeBackground'] | null): boolean {
  if (editor.doc.get(pageId)?.type !== 'PAGE') return false;
  editor.history.run('Change prototype background', (tx) => tx.set(pageId, 'prototypeBackground', color ?? undefined));
  return true;
}

/** Sets frames' scroll overflow (No scrolling clears it). One undo step; false when none of the layers is a frame. */
export function setOverflowDirection(editor: Editor, ids: readonly Id[], direction: NonNullable<SceneNode['overflowDirection']>): boolean {
  const frames = layers(editor, ids).filter((node) => node.type === 'FRAME');
  if (frames.length === 0) return false;
  editor.history.run('Change overflow', (tx) => frames.forEach((node) => tx.set(node.id, 'overflowDirection', direction === 'NONE' ? undefined : direction)));
  return true;
}

/** Sets how layers move when their frame scrolls (Scroll with parent clears it). One undo step. */
export function setScrollBehavior(editor: Editor, ids: readonly Id[], behavior: NonNullable<SceneNode['scrollBehavior']>): boolean {
  const targets = layers(editor, ids);
  if (targets.length === 0) return false;
  editor.history.run('Change scroll position', (tx) => targets.forEach((node) => tx.set(node.id, 'scrollBehavior', behavior === 'SCROLLS' ? undefined : behavior)));
  return true;
}

/** Changes how a frame shows as an overlay (position, closing when clicking outside, background). One undo step. */
export function setOverlaySettings(editor: Editor, frameId: Id, patch: Partial<OverlaySettings>): boolean {
  const node = layers(editor, [frameId])[0];
  if (!node) return false;
  editor.history.run('Change overlay', (tx) => tx.set(frameId, 'overlay', { ...(node.overlay ?? DEFAULT_OVERLAY), ...patch }));
  return true;
}
