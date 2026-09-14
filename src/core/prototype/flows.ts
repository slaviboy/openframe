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
import type { Vec2 } from '../math/vec';
import type { FlowStartingPoint, OverlaySettings, PageNode, Reaction, SceneNode, Size } from '../schema/document';
import { topLevelFrame } from './reactions';

export const DEFAULT_OVERLAY: OverlaySettings = { position: 'CENTER', closeOnClickOutside: false, background: null };
/** The background an overlay gets when one is added: black at 25%. */
export const DEFAULT_OVERLAY_BACKGROUND = { r: 0, g: 0, b: 0, a: 0.25 };

export const OVERLAY_POSITION_LABELS: Readonly<Record<OverlaySettings['position'], string>> = {
  CENTER: 'Center',
  TOP_LEFT: 'Top left',
  TOP_CENTER: 'Top center',
  TOP_RIGHT: 'Top right',
  BOTTOM_LEFT: 'Bottom left',
  BOTTOM_CENTER: 'Bottom center',
  BOTTOM_RIGHT: 'Bottom right',
  MANUAL: 'Manual',
};

/** The page's flows whose starting points are still top-level frames on it. */
export function flowsOf(store: DocumentStore, pageId: Id): FlowStartingPoint[] {
  const page = store.get(pageId);
  if (page?.type !== 'PAGE') return [];
  return (page.flowStartingPoints ?? []).filter((flow) => topLevelFrame(store, flow.nodeId) === flow.nodeId && store.pageOf(flow.nodeId) === pageId);
}

/** The name a new flow gets: Flow 1, Flow 2, … (the first number not taken). */
export function nextFlowName(flows: readonly FlowStartingPoint[]): string {
  const taken = new Set(flows.map((flow) => flow.name));
  let n = 1;
  while (taken.has(`Flow ${n}`)) n++;
  return `Flow ${n}`;
}

export const overlaySettings = (node: SceneNode | undefined): OverlaySettings => node?.overlay ?? DEFAULT_OVERLAY;

/** Where an overlay sits over the screen (in the screen's coordinates), by its position setting. */
export function overlayOrigin(position: OverlaySettings['position'], screen: Size, overlay: Size): Vec2 {
  const centerX = (screen.width - overlay.width) / 2;
  const right = screen.width - overlay.width;
  const bottom = screen.height - overlay.height;
  switch (position) {
    case 'TOP_LEFT':
      return { x: 0, y: 0 };
    case 'TOP_CENTER':
      return { x: centerX, y: 0 };
    case 'TOP_RIGHT':
      return { x: right, y: 0 };
    case 'BOTTOM_LEFT':
      return { x: 0, y: bottom };
    case 'BOTTOM_CENTER':
      return { x: centerX, y: bottom };
    case 'BOTTOM_RIGHT':
      return { x: right, y: bottom };
    default:
      return { x: centerX, y: (screen.height - overlay.height) / 2 };
  }
}

function forEachReaction(store: DocumentStore, pageId: Id, visit: (nodeId: Id, reaction: Reaction, index: number) => void): void {
  const walk = (id: Id) => {
    const node = store.get(id);
    if (node && 'transform' in node) node.reactions?.forEach((reaction, index) => visit(id, reaction, index));
    store.children(id).forEach(walk);
  };
  walk(pageId);
}

/** Whether a frame is opened as an overlay (or swapped in for one) by an interaction on the page. */
export function isOverlayDestination(store: DocumentStore, pageId: Id, frameId: Id): boolean {
  let found = false;
  forEachReaction(store, pageId, (_, reaction) => {
    for (const action of reaction.actions) {
      if (action.type === 'NODE' && (action.navigation === 'OVERLAY' || action.navigation === 'SWAP') && action.destinationId && topLevelFrame(store, action.destinationId) === frameId) found = true;
    }
  });
  return found;
}

/**
 * Whether a top-level frame is part of a connection between frames: an interaction in it leads to another frame, or one
 * elsewhere leads to it. `except` leaves out one interaction (the one being changed).
 */
export function frameConnected(store: DocumentStore, pageId: Id, frameId: Id, except?: { readonly nodeId: Id; readonly index: number }): boolean {
  let connected = false;
  forEachReaction(store, pageId, (nodeId, reaction, index) => {
    if (connected || (except && except.nodeId === nodeId && except.index === index)) return;
    const source = topLevelFrame(store, nodeId);
    for (const action of reaction.actions) {
      if (action.type !== 'NODE' || action.navigation === 'SCROLL_TO' || action.navigation === 'CHANGE_TO' || !action.destinationId) continue;
      const destination = topLevelFrame(store, action.destinationId);
      if (!destination || destination === source) continue;
      if (source === frameId || destination === frameId) connected = true;
    }
  });
  return connected;
}

/**
 * The flow a new connection starts: when an interaction on a layer leads to another frame and neither frame had a
 * connection yet, the layer's top-level frame becomes a flow starting point (unless it is one). Null otherwise.
 */
export function flowForNewConnection(store: DocumentStore, nodeId: Id, reaction: Reaction, index: number): { readonly pageId: Id; readonly flow: FlowStartingPoint } | null {
  const source = topLevelFrame(store, nodeId);
  if (!source) return null;
  const pageId = store.pageOf(source);
  const page = pageId ? store.get(pageId) : undefined;
  if (!pageId || page?.type !== 'PAGE') return null;
  const destinations = reaction.actions
    .map((action) => (action.type === 'NODE' && action.navigation !== 'SCROLL_TO' && action.navigation !== 'CHANGE_TO' && action.destinationId ? topLevelFrame(store, action.destinationId) : null))
    .filter((id): id is Id => id !== null && id !== source);
  if (destinations.length === 0) return null;
  const except = { nodeId, index };
  if (frameConnected(store, pageId, source, except) || destinations.some((id) => frameConnected(store, pageId, id, except))) return null;
  const flows = flowsOf(store, pageId);
  if (flows.some((flow) => flow.nodeId === source)) return null;
  return { pageId, flow: { nodeId: source, name: nextFlowName(flows) } };
}

export type { PageNode };
