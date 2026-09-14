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
import { apply } from '../math/matrix';
import type { Vec2 } from '../math/vec';
import { nodeContainsLocal, type SceneIndex } from '../scene/scene-index';
import type { PrototypeAction, PrototypeTransition, Reaction, SceneNode } from '../schema/document';
import { topLevelFrame, type TriggerType } from './reactions';

/**
 * The prototype player: what presentation view shows and how interactions change it. Pure state: the view renders the
 * state and plays the effects (transitions, links, scrolling) each step returns.
 */
export interface PlayerState {
  readonly pageId: Id;
  /** The screen: the top-level frame shown. */
  readonly frameId: Id;
  /** Screens navigated from, oldest first, for Back. */
  readonly history: readonly Id[];
  /** Open overlays, bottom to top. */
  readonly overlays: readonly Id[];
  /** While hovering or pressing: the state to return to when the pointer leaves the hotspot or is released. */
  readonly temporary: { readonly nodeId: Id; readonly trigger: 'ON_HOVER' | 'ON_PRESS'; readonly restore: PlayerState } | null;
}

export type PlayerEffect =
  /** Show `to` (a screen, or an overlay above the screen) coming from `from`, with the transition. */
  | { readonly type: 'transition'; readonly from: Id | null; readonly to: Id; readonly overlay: boolean; readonly transition: PrototypeTransition; readonly resetScroll?: boolean }
  | { readonly type: 'closeOverlay'; readonly id: Id }
  | { readonly type: 'scrollTo'; readonly nodeId: Id; readonly transition: PrototypeTransition }
  | { readonly type: 'openUrl'; readonly url: string };

export interface PlayerStep {
  readonly state: PlayerState;
  readonly effects: readonly PlayerEffect[];
}

const INSTANT: PrototypeTransition = { type: 'INSTANT' };
const FRAME_TYPES: ReadonlySet<string> = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);

const sceneNode = (store: DocumentStore, id: Id): SceneNode | undefined => {
  const node = store.get(id);
  return node && 'transform' in node ? node : undefined;
};

/** Top-level frames on the page, in reading order (top to bottom, then left to right). */
function pageFrames(store: DocumentStore, pageId: Id): Id[] {
  return store
    .children(pageId)
    .map((id) => sceneNode(store, id))
    .filter((node): node is SceneNode => node !== undefined && node.visible && FRAME_TYPES.has(node.type))
    .sort((a, b) => a.transform[5] - b.transform[5] || a.transform[4] - b.transform[4])
    .map((node) => node.id);
}

function hasReactionsWithin(store: DocumentStore, id: Id): boolean {
  if ((sceneNode(store, id)?.reactions?.length ?? 0) > 0) return true;
  return store.children(id).some((child) => hasReactionsWithin(store, child));
}

/** Screens a destination of an interaction on the page leads to. */
function destinationsOn(store: DocumentStore, pageId: Id): Set<Id> {
  const out = new Set<Id>();
  const visit = (id: Id) => {
    for (const reaction of sceneNode(store, id)?.reactions ?? []) {
      for (const action of reaction.actions) {
        if (action.type === 'NODE' && action.destinationId && action.navigation !== 'SCROLL_TO') {
          const frame = topLevelFrame(store, action.destinationId);
          if (frame) out.add(frame);
        }
      }
    }
    store.children(id).forEach(visit);
  };
  visit(pageId);
  return out;
}

/**
 * The screens presentation view moves between with the arrows: the frames with interactions or that interactions lead
 * to, or when the page has no interactions, every top-level frame on the page.
 */
export function presentableFrames(store: DocumentStore, pageId: Id): Id[] {
  const frames = pageFrames(store, pageId);
  const destinations = destinationsOn(store, pageId);
  const connected = frames.filter((id) => destinations.has(id) || hasReactionsWithin(store, id));
  return connected.length > 0 ? connected : frames;
}

/** The player at the start: on `startId`'s top-level frame, or the first frame on the page. Null when there is none. */
export function startPlayer(store: DocumentStore, pageId: Id, startId?: Id | null): PlayerState | null {
  const start = startId ? topLevelFrame(store, startId) : null;
  const frameId = start ?? presentableFrames(store, pageId)[0] ?? null;
  return frameId ? { pageId, frameId, history: [], overlays: [], temporary: null } : null;
}

/** The frames shown, bottom to top: the screen and its overlays. */
export const shownFrames = (state: PlayerState): Id[] => [state.frameId, ...state.overlays];

/**
 * The layers under a point of a shown frame (in the frame's own coordinates), deepest first and ending with the frame.
 * Hidden layers are skipped, clipping frames hide what's outside them, and a boolean group counts as one layer.
 */
export function hitTest(store: DocumentStore, index: SceneIndex, frameId: Id, point: Vec2): Id[] {
  const world = apply(index.worldTransform(frameId), point);
  const visit = (id: Id): Id[] | null => {
    const node = sceneNode(store, id);
    if (!node || !node.visible) return null;
    const local = index.toLocal(id, world);
    const inside = local !== null && nodeContainsLocal(node, local, 0);
    if ('clipsContent' in node && node.clipsContent && !inside) return null;
    if (node.type !== 'BOOLEAN_OPERATION') {
      const children = store.children(id);
      for (let i = children.length - 1; i >= 0; i--) {
        const hit = visit(children[i]!);
        if (hit) return [...hit, id];
      }
    }
    return inside && node.type !== 'GROUP' ? [id] : null;
  };
  return visit(frameId) ?? [];
}

/** Whether pressed keys (modifiers and a key code) match a Keyboard trigger. */
export function keysMatch(trigger: readonly string[], pressed: readonly string[]): boolean {
  return trigger.length === pressed.length && trigger.every((key) => pressed.includes(key));
}

/** The first interaction with the trigger along a hit chain (the deepest layer that has one), with its layer. */
export function findReaction(store: DocumentStore, chain: readonly Id[], type: TriggerType, keys?: readonly string[]): { readonly nodeId: Id; readonly reaction: Reaction } | null {
  for (const nodeId of chain) {
    const reaction = sceneNode(store, nodeId)?.reactions?.find((candidate) => candidate.trigger.type === type && (candidate.trigger.type !== 'ON_KEY_DOWN' || (keys !== undefined && keysMatch(candidate.trigger.keys, keys))));
    if (reaction) return { nodeId, reaction };
  }
  return null;
}

const SAFE_LINK = /^(https?:|mailto:)/i;

function runAction(store: DocumentStore, state: PlayerState, action: PrototypeAction, effects: PlayerEffect[]): PlayerState {
  switch (action.type) {
    case 'URL':
      if (SAFE_LINK.test(action.url.trim())) effects.push({ type: 'openUrl', url: action.url.trim() });
      return state;
    case 'BACK': {
      const previous = state.history.at(-1);
      if (!previous || !store.has(previous)) return state;
      effects.push({ type: 'transition', from: state.frameId, to: previous, overlay: false, transition: INSTANT });
      return { ...state, frameId: previous, history: state.history.slice(0, -1), overlays: [] };
    }
    case 'CLOSE': {
      const top = state.overlays.at(-1);
      if (!top) return state;
      effects.push({ type: 'closeOverlay', id: top });
      return { ...state, overlays: state.overlays.slice(0, -1) };
    }
    case 'NODE': {
      const destination = action.destinationId;
      if (!destination || !sceneNode(store, destination)) return state;
      if (action.navigation === 'SCROLL_TO') {
        effects.push({ type: 'scrollTo', nodeId: destination, transition: action.transition });
        return state;
      }
      const frame = topLevelFrame(store, destination);
      if (!frame) return state;
      // State management: the destination's scroll position starts over.
      const reset = action.resetScrollPosition ? { resetScroll: true } : {};
      if (action.navigation === 'OVERLAY') {
        if (state.overlays.includes(frame) || frame === state.frameId) return state;
        effects.push({ type: 'transition', from: null, to: frame, overlay: true, transition: action.transition, ...reset });
        return { ...state, overlays: [...state.overlays, frame] };
      }
      if (action.navigation === 'SWAP' && state.overlays.length > 0) {
        // The new overlay replaces the top one; swaps aren't recorded in the history.
        effects.push({ type: 'transition', from: state.overlays.at(-1)!, to: frame, overlay: true, transition: action.transition, ...reset });
        return { ...state, overlays: [...state.overlays.slice(0, -1), frame] };
      }
      if (frame === state.frameId && state.overlays.length === 0) return state;
      effects.push({ type: 'transition', from: state.frameId, to: frame, overlay: false, transition: action.transition, ...reset });
      // Swap overlay from a screen replaces the screen without recording it in the history.
      const history = action.navigation === 'SWAP' ? state.history : [...state.history, state.frameId];
      return { ...state, frameId: frame, history, overlays: [] };
    }
  }
}

/** Runs an interaction's actions in order. */
export function runReaction(store: DocumentStore, state: PlayerState, reaction: Reaction): PlayerStep {
  const effects: PlayerEffect[] = [];
  let next = state;
  for (const action of reaction.actions) next = runAction(store, next, action, effects);
  return { state: next, effects };
}

/**
 * Starts While hovering or While pressing: runs the interaction, remembering the state to return to when `endTemporary`
 * is called (the pointer leaves the hotspot, or is released).
 */
export function beginTemporary(store: DocumentStore, state: PlayerState, nodeId: Id, reaction: Reaction): PlayerStep {
  const trigger = reaction.trigger.type;
  if (state.temporary || (trigger !== 'ON_HOVER' && trigger !== 'ON_PRESS')) return { state, effects: [] };
  const step = runReaction(store, state, reaction);
  return { state: { ...step.state, temporary: { nodeId, trigger, restore: state } }, effects: step.effects };
}

/** Ends While hovering or While pressing, returning to where it started. */
export function endTemporary(state: PlayerState): PlayerStep {
  if (!state.temporary) return { state, effects: [] };
  const { restore } = state.temporary;
  const effects: PlayerEffect[] = [];
  for (const overlay of state.overlays.filter((id) => !restore.overlays.includes(id)).reverse()) effects.push({ type: 'closeOverlay', id: overlay });
  if (restore.frameId !== state.frameId) effects.push({ type: 'transition', from: state.frameId, to: restore.frameId, overlay: false, transition: INSTANT });
  return { state: restore, effects };
}

/** After delay interactions of the shown frames and the layers in them. */
export function delayedReactions(store: DocumentStore, state: PlayerState): { readonly nodeId: Id; readonly reaction: Reaction; readonly timeout: number }[] {
  const out: { nodeId: Id; reaction: Reaction; timeout: number }[] = [];
  const visit = (id: Id) => {
    const node = sceneNode(store, id);
    if (!node || !node.visible) return;
    for (const reaction of node.reactions ?? []) if (reaction.trigger.type === 'AFTER_TIMEOUT') out.push({ nodeId: id, reaction, timeout: reaction.trigger.timeout });
    store.children(id).forEach(visit);
  };
  shownFrames(state).forEach(visit);
  return out;
}

/** Keyboard interactions matching pressed keys on the shown frames (the top overlay first). */
export function keyReaction(store: DocumentStore, state: PlayerState, keys: readonly string[]): { readonly nodeId: Id; readonly reaction: Reaction } | null {
  for (const frame of shownFrames(state).reverse()) {
    const chain: Id[] = [];
    const visit = (id: Id) => {
      const node = sceneNode(store, id);
      if (!node || !node.visible) return;
      chain.push(id);
      store.children(id).forEach(visit);
    };
    visit(frame);
    const found = findReaction(store, chain.reverse(), 'ON_KEY_DOWN', keys);
    if (found) return found;
  }
  return null;
}

/** Moves to the next or previous presentable screen (the arrows), closing overlays; null at either end. */
export function stepScreen(store: DocumentStore, state: PlayerState, delta: 1 | -1): PlayerStep | null {
  const frames = presentableFrames(store, state.pageId);
  const next = frames[frames.indexOf(state.frameId) + delta];
  if (!next) return null;
  return {
    state: { ...state, frameId: next, history: [...state.history, state.frameId], overlays: [], temporary: null },
    effects: [{ type: 'transition', from: state.frameId, to: next, overlay: false, transition: INSTANT }],
  };
}

/** Layers with interactions in a shown frame (Show hints on click highlights them). */
export function hotspots(store: DocumentStore, frameId: Id): Id[] {
  const out: Id[] = [];
  const visit = (id: Id) => {
    const node = sceneNode(store, id);
    if (!node || !node.visible) return;
    if ((node.reactions?.length ?? 0) > 0 && id !== frameId) out.push(id);
    store.children(id).forEach(visit);
  };
  visit(frameId);
  return out;
}
