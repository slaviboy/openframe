# Prototyping and Animation

Prototype playback (milestone M10) and the Motion timeline (M12) share one animation core. This document covers what is implemented and the design of what remains.

## Implemented

### Easing core: [`src/core/anim/easing.ts`](../src/core/anim/easing.ts)

| Easing | Implementation |
|---|---|
| Bezier presets: linear, ease in, ease out, ease in and out, ease in back, ease out back, ease in and out back | CSS `cubic-bezier` solver (see below) |
| Custom bezier | Same solver with arbitrary control points. Handle y values may leave [0, 1] to overshoot. |
| Hold (Motion) | Stays at 0 until t = 1, then jumps to 1 |
| Springs: gentle, quick, bouncy, slow, custom (stiffness, damping, mass) | Analytic damped harmonic oscillator covering the under-, critically- and over-damped cases |

**Bezier solver.** Newton–Raphson iterations, with a bisection fallback when the slope is nearly flat.

**Spring duration.** A spring's duration is derived from physics, as the documentation describes for custom springs. It is the time after which the position stays within 0.001 of the target (`springDurationMs`).

**Tests** ([`easing.test.ts`](../src/core/anim/easing.test.ts)):
- symmetry of ease in and out
- overshoot of the back curves
- monotonicity of ease in
- spring endpoints
- bouncy overshoots and slow doesn't
- heavier mass settles later

The spring preset parameters are this implementation's interpretation, because the reference documentation doesn't publish numbers. They are tuned to the documented character of each preset and recorded here so later changes are deliberate.

### Expression language: [`src/core/prototype/expressions.ts`](../src/core/prototype/expressions.ts)

This is the language of the *Set variable* value and *Conditional* conditions.

```
or        := and ( 'or' and )*
and       := compare ( 'and' compare )*
compare   := additive ( ('=='|'!='|'>'|'<'|'>='|'<=') additive )?
additive  := term ( ('+'|'-') term )*
term      := unary ( ('*'|'/') unary )*
unary     := ('!'|'not'|'-') unary | primary
primary   := number | "string" | 'string' | true | false | {Variable} | {Variable:Mode} | '(' or ')'
```

**Semantics**
- `+` concatenates strings when either side is a string. Otherwise it adds numbers.
- Numbers are compared numerically. `==` and `!=` compare values of different types by their string form.
- Division by zero yields 0, so prototypes never crash while playing.
- `{Name:Mode}` reads a variable's value in a specific mode (see *Variable modes in prototypes* in the reference documentation).
- Bare identifiers are rejected with the hint "wrap text in quotes", which mirrors how the editor shows invalid expressions.
- Errors carry a source position so the UI can mark the invalid part.

There is no `eval`: the parser builds a typed AST and the evaluator interprets it.

## Design of the prototype runtime (M10)

### State

```ts
interface PlayerState {
  flowId: Id | null;
  screen: Id;                          // current top-level frame
  history: Id[];                       // for Back
  overlays: { frame: Id; position: OverlayPosition; closeOnOutside: boolean; background: Color | null }[];
  scroll: Record<Id, { x: number; y: number }>;
  variables: Record<Id, ExprValue>;     // runtime values; the document is never mutated
  modes: Record<Id, Id>;                // collection → active mode (Set variable mode)
  instanceVariants: Record<Id, Id>;     // interactive components (Change to)
  transitions: ActiveTransition[];
}
```

`step(state, event) → { state, effects }` is a pure reducer in `core/prototype`. The presentation view renders the resolved screen, open overlays and in-flight transitions with the same scene renderer the editor uses.

### Events and matching

**Triggers**
- click/tap
- drag
- while hovering
- while pressing
- key/gamepad
- mouse enter, leave, down, up
- after delay
- video hits a time, video ends

**Matching.** An event bubbles from the deepest layer under the pointer to the first ancestor that has a matching reaction.

**Documented limits per object**
- Only one each of click, hover, press, mouse enter/leave/down/up, after delay and video end.
- Click and while-hovering can't coexist.
- Key, drag and video-hits triggers are unlimited.

### Actions

Actions run top to bottom, and order matters:
- navigate to, back, scroll to, open link
- open, close, swap overlay
- set variable, set variable mode
- conditional (if / else)
- video play/pause, mute, seek, jump
- change to

### Transitions

- instant, dissolve, smart animate, move in/out, push, slide in/out
- directions: left, right, up, down
- duration 1–10,000 ms, with the easing core above

**Smart animate**
- Layers are matched by name plus hierarchy position.
- Position, size, rotation, opacity and fills (solid ↔ gradient ↔ image) are interpolated.
- Unmatched layers dissolve.
- Unsupported property changes (shadows, shape morphs) fall back to dissolve, as documented.

### State memorization

- Scroll position, component state and video state persist per screen.
- Matching layers share that state across screens: same name and parents, or top-level frames with a common `Prefix /`.
- Each interaction can reset it.

## Design of the Motion timeline (M12)

**Keyframes**
- Keyframes live on animatable property paths from the property registry.
- Each keyframe is `{ t, value, easing }`.

**Preset clips** ("Spin", …) expand into generated tracks when sampled.

**Sampling**
- `sample(timeline, t) → overrides per node` feeds the editor's resolve stage in Motion mode.
- The same function drives animated export (MP4/WebM through WebCodecs, GIF, animated SVG with CSS keyframes).

**Other properties**
- The anchor point shifts the rotation and scale pivot.
- A motion path moves position along a vector path by arc length.
- Path trim animates stroke start and end via CanvasKit `makeTrimmed`.
