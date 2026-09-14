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

import { describe, expect, test } from 'vitest';
import { springDurationMs } from '../anim/easing';
import { createEmptyDocument, keyOnTop, makeFrame, makeRectangle } from '../document/factory';
import { History } from '../history/history';
import { IdGenerator } from '../ids/ids';
import { ReactionSchema, type Reaction } from '../schema/document';
import {
  destinationCandidates,
  makeAction,
  makeEasing,
  makeReaction,
  makeTransition,
  nextTrigger,
  reactionSummary,
  toEasing,
  topLevelFrame,
  transitionDurationMs,
  triggerAllowed,
} from './reactions';

const click: Reaction = { trigger: { type: 'ON_CLICK' }, actions: [{ type: 'BACK' }] };
const hover: Reaction = { trigger: { type: 'ON_HOVER' }, actions: [{ type: 'BACK' }] };

describe('prototype interactions', () => {
  test('a layer has each trigger once, except keys and drags; On click and While hovering exclude each other', () => {
    expect(triggerAllowed([click], 'ON_CLICK')).toBe(false);
    expect(triggerAllowed([click], 'ON_CLICK', 0)).toBe(true);
    expect(triggerAllowed([click], 'ON_HOVER')).toBe(false);
    expect(triggerAllowed([hover], 'ON_CLICK')).toBe(false);
    expect(triggerAllowed([click], 'MOUSE_ENTER')).toBe(true);
    const keys: Reaction = { trigger: { type: 'ON_KEY_DOWN', keys: ['Enter'] }, actions: [{ type: 'BACK' }] };
    expect(triggerAllowed([keys, keys], 'ON_KEY_DOWN')).toBe(true);
    // New interactions take the first trigger there is room for.
    expect(nextTrigger([])).toEqual({ type: 'ON_CLICK' });
    expect(nextTrigger([click])).toEqual({ type: 'ON_DRAG' });
    expect(makeReaction([], 'f1')).toEqual({ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', navigation: 'NAVIGATE', destinationId: 'f1', transition: { type: 'INSTANT' } }] });
  });

  test('changing the action or animation keeps the settings the new one has', () => {
    const navigate = makeAction('NAVIGATE');
    const overlay = makeAction('OVERLAY', { ...navigate, destinationId: 'd' } as typeof navigate);
    expect(overlay).toMatchObject({ navigation: 'OVERLAY', destinationId: 'd' });
    expect(makeAction('URL')).toEqual({ type: 'URL', url: '' });
    expect(makeAction('BACK', overlay)).toEqual({ type: 'BACK' });
    // Scroll to keeps only the animations it has: instant, or animated.
    const pushing = { ...navigate, transition: makeTransition('PUSH') } as typeof navigate;
    expect(makeAction('SCROLL_TO', pushing)).toMatchObject({ transition: { type: 'SMART_ANIMATE', easing: { type: 'EASE_OUT' }, duration: 300 } });

    const push = makeTransition('PUSH');
    expect(push).toEqual({ type: 'PUSH', direction: 'LEFT', matchLayers: false, easing: { type: 'EASE_OUT' }, duration: 300 });
    const dissolve = makeTransition('DISSOLVE', { ...push, direction: 'TOP', duration: 500 } as typeof push);
    expect(dissolve).toEqual({ type: 'DISSOLVE', easing: { type: 'EASE_OUT' }, duration: 500 });
    expect(makeTransition('SLIDE_IN', { ...push, direction: 'TOP' } as typeof push)).toMatchObject({ direction: 'TOP' });
  });

  test('easings: presets and custom curves and springs', () => {
    expect(toEasing({ type: 'EASE_IN' })).toEqual({ type: 'bezier', x1: 0.42, y1: 0, x2: 1, y2: 1 });
    expect(makeEasing('CUSTOM_CUBIC_BEZIER', { type: 'EASE_IN' })).toEqual({ type: 'CUSTOM_CUBIC_BEZIER', x1: 0.42, y1: 0, x2: 1, y2: 1 });
    expect(makeEasing('CUSTOM_SPRING', { type: 'BOUNCY' })).toEqual({ type: 'CUSTOM_SPRING', stiffness: 600, damping: 15, mass: 1 });
    expect(makeEasing('CUSTOM_SPRING', { type: 'LINEAR' })).toEqual({ type: 'CUSTOM_SPRING', stiffness: 100, damping: 15, mass: 1 });
    // A spring lasts until it settles.
    expect(transitionDurationMs({ type: 'DISSOLVE', easing: { type: 'QUICK' }, duration: 300 })).toBe(springDurationMs(300, 20, 1));
    expect(transitionDurationMs({ type: 'DISSOLVE', easing: { type: 'LINEAR' }, duration: 450 })).toBe(450);
    expect(transitionDurationMs({ type: 'INSTANT' })).toBe(0);
  });

  test('destinations: other top-level frames, or layers in the same frame for Scroll to', () => {
    const ids = new IdGenerator('p');
    const store = createEmptyDocument({ name: 'D', now: 'n', appVersion: 't', ids });
    const page = store.pages()[0]!;
    const history = new History({ store, captureMeta: () => null, restoreMeta: () => undefined });
    const init = (id: string, parent: string, name: string) => ({ id, parent: { id: parent, key: keyOnTop(store, parent) }, name, x: 0, y: 0, width: 10, height: 10 });
    history.run('Build', (tx) => {
      tx.create(makeFrame(init('home', page, 'Home')));
      tx.create(makeFrame(init('card', 'home', 'Card')));
      tx.create(makeRectangle(init('button', 'card', 'Button')));
      tx.create(makeFrame(init('about', page, 'About')));
      tx.create(makeRectangle(init('loose', page, 'Loose')));
    });
    expect(topLevelFrame(store, 'button')).toBe('home');
    expect(topLevelFrame(store, 'home')).toBe('home');
    expect(topLevelFrame(store, 'loose')).toBeNull();
    expect(destinationCandidates(store, 'button', 'NAVIGATE')).toEqual(['about']);
    expect(destinationCandidates(store, 'loose', 'OVERLAY')).toEqual(['home', 'about']);
    expect(destinationCandidates(store, 'button', 'SCROLL_TO')).toEqual(['card', 'button']);

    const reaction = makeReaction([], 'about');
    expect(reactionSummary(store, reaction)).toBe('On click: Navigate to About');
    expect(reactionSummary(store, { trigger: { type: 'AFTER_TIMEOUT', timeout: 800 }, actions: [{ type: 'URL', url: '' }, { type: 'BACK' }] })).toBe('After delay: Open link No link +1');
  });

  test('the schema checks durations, delays and keys', () => {
    expect(ReactionSchema.safeParse(makeReaction([])).success).toBe(true);
    expect(ReactionSchema.safeParse({ trigger: { type: 'ON_CLICK' }, actions: [] }).success).toBe(false);
    expect(ReactionSchema.safeParse({ trigger: { type: 'ON_KEY_DOWN', keys: [] }, actions: [{ type: 'BACK' }] }).success).toBe(false);
    expect(ReactionSchema.safeParse({ trigger: { type: 'ON_CLICK' }, actions: [{ type: 'NODE', navigation: 'NAVIGATE', destinationId: null, transition: { type: 'DISSOLVE', easing: { type: 'LINEAR' }, duration: 0 } }] }).success).toBe(false);
  });
});
