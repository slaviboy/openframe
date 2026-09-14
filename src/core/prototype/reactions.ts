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

import { bezierPreset, springDurationMs, springPreset, type Easing } from '../anim/easing';
import type { DocumentStore } from '../document/store';
import { isComponentSet, variantsOf } from '../document/variants';
import type { Id } from '../ids/ids';
import type { PrototypeAction, PrototypeEasing, PrototypeTransition, PrototypeTrigger, Reaction } from '../schema/document';

export type TriggerType = PrototypeTrigger['type'];
export type ActionKind = Extract<PrototypeAction, { type: 'NODE' }>['navigation'] | Exclude<PrototypeAction['type'], 'NODE'>;
export type TransitionType = PrototypeTransition['type'];
export type EasingType = PrototypeEasing['type'];
export type TransitionDirection = Extract<PrototypeTransition, { direction: string }>['direction'];

/** Triggers in the order the interaction details list them. */
export const TRIGGER_TYPES: readonly TriggerType[] = ['ON_CLICK', 'ON_DRAG', 'ON_HOVER', 'ON_PRESS', 'ON_KEY_DOWN', 'MOUSE_ENTER', 'MOUSE_LEAVE', 'MOUSE_DOWN', 'MOUSE_UP', 'AFTER_TIMEOUT'];

export const TRIGGER_LABELS: Readonly<Record<TriggerType, string>> = {
  ON_CLICK: 'On click',
  ON_DRAG: 'On drag',
  ON_HOVER: 'While hovering',
  ON_PRESS: 'While pressing',
  ON_KEY_DOWN: 'Keyboard',
  MOUSE_ENTER: 'Mouse enter',
  MOUSE_LEAVE: 'Mouse leave',
  MOUSE_DOWN: 'Mouse down',
  MOUSE_UP: 'Mouse up',
  AFTER_TIMEOUT: 'After delay',
};

/** Triggers a layer can have any number of; it can have each other trigger once. */
export const REPEATABLE_TRIGGERS: ReadonlySet<TriggerType> = new Set(['ON_KEY_DOWN', 'ON_DRAG']);

export const ACTION_KINDS: readonly ActionKind[] = ['NAVIGATE', 'BACK', 'SCROLL_TO', 'URL', 'OVERLAY', 'SWAP', 'CLOSE', 'CHANGE_TO'];

export const ACTION_LABELS: Readonly<Record<ActionKind, string>> = {
  NAVIGATE: 'Navigate to',
  BACK: 'Back',
  SCROLL_TO: 'Scroll to',
  URL: 'Open link',
  OVERLAY: 'Open overlay',
  SWAP: 'Swap overlay',
  CLOSE: 'Close overlay',
  CHANGE_TO: 'Change to',
};

/**
 * The component set whose variants a Change to from a layer switches between: the set of the variant the layer is in,
 * or of the variant the nearest instance around it was made from; null when neither applies.
 */
export function variantSetOf(store: DocumentStore, id: Id): Id | null {
  const setOf = (variantId: Id): Id | null => {
    const setId = store.parentOf(variantId);
    const set = setId === null ? undefined : store.get(setId);
    return set && 'transform' in set && isComponentSet(set) ? setId : null;
  };
  for (let current: Id | null = id; current !== null; current = store.parentOf(current)) {
    const node = store.get(current);
    if (!node || !('transform' in node)) return null;
    if (node.type === 'FRAME' && node.instance) {
      const set = setOf(node.instance.mainId);
      if (set) return set;
    }
    const set = setOf(current);
    if (set) return set;
  }
  return null;
}

export const TRANSITION_TYPES: readonly TransitionType[] = ['INSTANT', 'DISSOLVE', 'SMART_ANIMATE', 'MOVE_IN', 'MOVE_OUT', 'PUSH', 'SLIDE_IN', 'SLIDE_OUT'];

export const TRANSITION_LABELS: Readonly<Record<TransitionType, string>> = {
  INSTANT: 'Instant',
  DISSOLVE: 'Dissolve',
  SMART_ANIMATE: 'Smart animate',
  MOVE_IN: 'Move in',
  MOVE_OUT: 'Move out',
  PUSH: 'Push',
  SLIDE_IN: 'Slide in',
  SLIDE_OUT: 'Slide out',
};

export const DIRECTIONS: readonly TransitionDirection[] = ['LEFT', 'RIGHT', 'TOP', 'BOTTOM'];
export const DIRECTION_LABELS: Readonly<Record<TransitionDirection, string>> = { LEFT: 'Left', RIGHT: 'Right', TOP: 'Up', BOTTOM: 'Down' };

export const EASING_TYPES: readonly EasingType[] = ['LINEAR', 'EASE_IN', 'EASE_OUT', 'EASE_IN_AND_OUT', 'EASE_IN_BACK', 'EASE_OUT_BACK', 'EASE_IN_AND_OUT_BACK', 'CUSTOM_CUBIC_BEZIER', 'GENTLE', 'QUICK', 'BOUNCY', 'SLOW', 'CUSTOM_SPRING'];

export const EASING_LABELS: Readonly<Record<EasingType, string>> = {
  LINEAR: 'Linear',
  EASE_IN: 'Ease in',
  EASE_OUT: 'Ease out',
  EASE_IN_AND_OUT: 'Ease in and out',
  EASE_IN_BACK: 'Ease in back',
  EASE_OUT_BACK: 'Ease out back',
  EASE_IN_AND_OUT_BACK: 'Ease in and out back',
  CUSTOM_CUBIC_BEZIER: 'Custom bezier',
  GENTLE: 'Gentle',
  QUICK: 'Quick',
  BOUNCY: 'Bouncy',
  SLOW: 'Slow',
  CUSTOM_SPRING: 'Custom spring',
};

export const DEFAULT_TRANSITION_DURATION = 300;
export const DEFAULT_EASING: PrototypeEasing = { type: 'EASE_OUT' };
export const DEFAULT_DELAY_MS = 800;

/** Whether a layer's interactions (leaving out the one at `exceptIndex`) leave room for another with this trigger. */
export function triggerAllowed(reactions: readonly Reaction[], type: TriggerType, exceptIndex = -1): boolean {
  if (REPEATABLE_TRIGGERS.has(type)) return true;
  const others = reactions.filter((_, index) => index !== exceptIndex).map((reaction) => reaction.trigger.type);
  if (others.includes(type)) return false;
  // On click can't be combined with While hovering.
  if (type === 'ON_CLICK' && others.includes('ON_HOVER')) return false;
  if (type === 'ON_HOVER' && others.includes('ON_CLICK')) return false;
  return true;
}

/** A trigger of the type, with its default settings. */
export function makeTrigger(type: TriggerType): PrototypeTrigger {
  if (type === 'AFTER_TIMEOUT') return { type, timeout: DEFAULT_DELAY_MS };
  if (type === 'ON_KEY_DOWN') return { type, keys: ['Enter'] };
  return { type };
}

/** The trigger a new interaction gets: the first one the layer has room for. */
export function nextTrigger(reactions: readonly Reaction[]): PrototypeTrigger {
  return makeTrigger(TRIGGER_TYPES.find((type) => triggerAllowed(reactions, type)) ?? 'ON_KEY_DOWN');
}

/** A new interaction: On click navigates to the destination instantly. */
export function makeReaction(reactions: readonly Reaction[], destinationId: Id | null = null, navigation: Extract<PrototypeAction, { type: 'NODE' }>['navigation'] = 'NAVIGATE'): Reaction {
  return { trigger: nextTrigger(reactions), actions: [{ type: 'NODE', navigation, destinationId, transition: { type: 'INSTANT' } }] };
}

export const actionKind = (action: PrototypeAction): ActionKind => (action.type === 'NODE' ? action.navigation : action.type);

/** An action of the kind, keeping the previous action's destination and animation where the new kind has them. */
export function makeAction(kind: ActionKind, previous?: PrototypeAction): PrototypeAction {
  if (kind === 'BACK' || kind === 'CLOSE') return { type: kind };
  if (kind === 'URL') return { type: 'URL', url: previous?.type === 'URL' ? previous.url : '' };
  const node = previous?.type === 'NODE' ? previous : null;
  let transition: PrototypeTransition = node?.transition ?? { type: 'INSTANT' };
  // Scroll to is instant or animated.
  if (kind === 'SCROLL_TO' && transition.type !== 'INSTANT' && transition.type !== 'SMART_ANIMATE') transition = makeTransition('SMART_ANIMATE', transition);
  return { type: 'NODE', navigation: kind, destinationId: node?.destinationId ?? null, transition };
}

const easingOf = (transition: PrototypeTransition | undefined) => (transition && transition.type !== 'INSTANT' ? transition.easing : DEFAULT_EASING);
const durationOf = (transition: PrototypeTransition | undefined) => (transition && transition.type !== 'INSTANT' ? transition.duration : DEFAULT_TRANSITION_DURATION);

/** A transition of the type, keeping the previous transition's easing, duration and direction. */
export function makeTransition(type: TransitionType, previous?: PrototypeTransition): PrototypeTransition {
  if (type === 'INSTANT') return { type };
  const easing = easingOf(previous);
  const duration = durationOf(previous);
  if (type === 'DISSOLVE' || type === 'SMART_ANIMATE') return { type, easing, duration };
  const direction = previous && 'direction' in previous ? previous.direction : 'LEFT';
  const matchLayers = previous && 'matchLayers' in previous ? previous.matchLayers : false;
  return { type, direction, matchLayers, easing, duration };
}

/** Whether the transition moves in a direction. */
export const hasDirection = (transition: PrototypeTransition): transition is Extract<PrototypeTransition, { direction: string }> => 'direction' in transition;

export const isSpringEasing = (easing: PrototypeEasing): boolean => ['GENTLE', 'QUICK', 'BOUNCY', 'SLOW', 'CUSTOM_SPRING'].includes(easing.type);

/** An easing of the type: custom curves start from the previous easing's curve (or ease out), custom springs from Gentle. */
export function makeEasing(type: EasingType, previous: PrototypeEasing = DEFAULT_EASING): PrototypeEasing {
  if (type === 'CUSTOM_CUBIC_BEZIER') {
    const curve = toEasing(previous);
    const [x1, y1, x2, y2] = curve.type === 'bezier' ? [curve.x1, curve.y1, curve.x2, curve.y2] : [0, 0, 0.58, 1];
    return { type, x1, y1, x2, y2 };
  }
  if (type === 'CUSTOM_SPRING') {
    const spring = toEasing(previous);
    return spring.type === 'spring' ? { type, stiffness: spring.stiffness, damping: spring.damping, mass: spring.mass } : { type, ...springParameters('GENTLE') };
  }
  return { type };
}

const BEZIER_NAMES = {
  LINEAR: 'linear',
  EASE_IN: 'ease-in',
  EASE_OUT: 'ease-out',
  EASE_IN_AND_OUT: 'ease-in-and-out',
  EASE_IN_BACK: 'ease-in-back',
  EASE_OUT_BACK: 'ease-out-back',
  EASE_IN_AND_OUT_BACK: 'ease-in-and-out-back',
} as const;
const SPRING_NAMES = { GENTLE: 'gentle', QUICK: 'quick', BOUNCY: 'bouncy', SLOW: 'slow' } as const;

function springParameters(type: keyof typeof SPRING_NAMES) {
  const spring = springPreset(SPRING_NAMES[type]) as Extract<Easing, { type: 'spring' }>;
  return { stiffness: spring.stiffness, damping: spring.damping, mass: spring.mass };
}

/** The easing curve the prototype runtime evaluates. */
export function toEasing(easing: PrototypeEasing): Easing {
  switch (easing.type) {
    case 'CUSTOM_CUBIC_BEZIER':
      return { type: 'bezier', x1: easing.x1, y1: easing.y1, x2: easing.x2, y2: easing.y2 };
    case 'CUSTOM_SPRING':
      return { type: 'spring', stiffness: easing.stiffness, damping: easing.damping, mass: easing.mass };
    case 'GENTLE':
    case 'QUICK':
    case 'BOUNCY':
    case 'SLOW':
      return springPreset(SPRING_NAMES[easing.type]);
    default:
      return bezierPreset(BEZIER_NAMES[easing.type]);
  }
}

/** How long a transition takes: its duration, or for a spring, until the spring settles. */
export function transitionDurationMs(transition: PrototypeTransition): number {
  if (transition.type === 'INSTANT') return 0;
  const easing = toEasing(transition.easing);
  return easing.type === 'spring' ? springDurationMs(easing.stiffness, easing.damping, easing.mass) : transition.duration;
}

/** Layer types a prototype can navigate to at the top level of a page. */
const FRAME_TYPES: ReadonlySet<string> = new Set(['FRAME', 'COMPONENT', 'COMPONENT_SET', 'INSTANCE']);

/** The top-level frame a layer is in (the layer itself when it is one); null when it isn't in one. */
export function topLevelFrame(store: DocumentStore, id: Id): Id | null {
  let node = store.get(id);
  while (node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
    const parent = store.get(node.parent.id);
    if (parent?.type === 'PAGE') return FRAME_TYPES.has(node.type) ? node.id : null;
    node = parent;
  }
  return null;
}

function pageOf(store: DocumentStore, id: Id): Id | null {
  let node = store.get(id);
  while (node && node.type !== 'DOCUMENT') {
    if (node.type === 'PAGE') return node.id;
    node = store.get(node.parent.id);
  }
  return null;
}

/**
 * Where an interaction from the hotspot can go: for Scroll to, the layers in the hotspot's top-level frame; for the
 * other actions with a destination, the other top-level frames on its page.
 */
export function destinationCandidates(store: DocumentStore, hotspotId: Id, kind: ActionKind): Id[] {
  if (kind === 'CHANGE_TO') {
    // Change to: the variants of the component set the hotspot's variant (or instance) belongs to.
    const setId = variantSetOf(store, hotspotId);
    return setId ? variantsOf(store, setId).map((variant) => variant.id) : [];
  }
  const own = topLevelFrame(store, hotspotId);
  if (kind === 'SCROLL_TO') {
    if (!own) return [];
    const out: Id[] = [];
    const visit = (id: Id) => {
      for (const child of store.children(id)) {
        out.push(child);
        visit(child);
      }
    };
    visit(own);
    return out;
  }
  const page = pageOf(store, hotspotId);
  if (!page) return [];
  return store.children(page).filter((id) => id !== own && FRAME_TYPES.has(store.get(id)?.type ?? ''));
}

/** A one-line description of an interaction, as the Interactions section lists it (e.g. "On click: Navigate to Home"). */
export function reactionSummary(store: DocumentStore, reaction: Reaction): string {
  const [first] = reaction.actions;
  const action = first ? actionKind(first) : null;
  let target = '';
  if (first?.type === 'NODE') target = first.destinationId ? (store.get(first.destinationId)?.name ?? 'None') : 'None';
  if (first?.type === 'URL') target = first.url || 'No link';
  const more = reaction.actions.length > 1 ? ` +${reaction.actions.length - 1}` : '';
  return `${TRIGGER_LABELS[reaction.trigger.type]}: ${action ? ACTION_LABELS[action] : ''}${target ? ` ${target}` : ''}${more}`;
}
