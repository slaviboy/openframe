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

/**
 * Openframe document schema, format version 1.
 *
 * The schema is the single source of truth for document types (`z.infer`) and for
 * validation at trust boundaries (file load, import, paste, migration output).
 * It is NOT run on every edit; ops are validated by construction and dev builds
 * assert structural invariants after each commit.
 *
 * Adding a new optional field or a new union member is backwards compatible and does
 * not require a version bump. Renaming/removing fields or changing semantics does.
 */
import { EXPORT_FORMATS } from '../export/export-settings';
import { z } from 'zod';
import { IMAGE_HASH_PATTERN } from '../image/hash';

// The app ships a strict Content-Security-Policy without 'unsafe-eval'. zod's JIT parser
// probes `new Function`, which CSP reports as a violation even though the error is caught;
// jitless mode skips the probe and uses the interpreted parser.
z.config({ jitless: true });

export const FORMAT_NAME = 'openframe';
export const FORMAT_VERSION = 1;

const finite = z.number().refine(Number.isFinite, 'must be a finite number');
const unit = z.number().min(0).max(1);
export const IdSchema = z.string().regex(/^[0-9a-z]{1,12}:[0-9]+$/, 'invalid id');
export const FractionalKeySchema = z.string().regex(/^[0-9A-Za-z]*[1-9A-Za-z]$/, 'invalid order key');

export const ColorSchema = z.object({ r: unit, g: unit, b: unit, a: unit });

/** Parent-relative affine transform [a, b, c, d, tx, ty] (Canvas/DOMMatrix order). */
export const TransformSchema = z.tuple([finite, finite, finite, finite, finite, finite]);

export const SizeSchema = z.object({ width: z.number().min(0), height: z.number().min(0) });

export const BlendModeSchema = z.enum([
  'PASS_THROUGH',
  'NORMAL',
  'DARKEN',
  'MULTIPLY',
  'PLUS_DARKER',
  'COLOR_BURN',
  'LIGHTEN',
  'SCREEN',
  'PLUS_LIGHTER',
  'COLOR_DODGE',
  'OVERLAY',
  'SOFT_LIGHT',
  'HARD_LIGHT',
  'DIFFERENCE',
  'EXCLUSION',
  'HUE',
  'SATURATION',
  'COLOR',
  'LUMINOSITY',
]);

/** How big an export is: a multiple of the layer's size, or a fixed width or height in pixels (keeping the aspect ratio). */
export const ExportConstraintSchema = z.object({
  type: z.enum(['SCALE', 'WIDTH', 'HEIGHT']),
  value: z.number().positive().max(100_000),
});
export type ExportConstraint = z.infer<typeof ExportConstraintSchema>;

/** One export configuration of a layer (the Export section): format, file name suffix and size. */
export const ExportSettingSchema = z.object({
  format: z.enum(EXPORT_FORMATS),
  suffix: z.string().max(200),
  constraint: ExportConstraintSchema,
});
export type ExportSetting = z.infer<typeof ExportSettingSchema>;

/** Prototype easing: a bezier or spring preset, or a custom curve or spring. */
export const PrototypeEasingSchema = z.union([
  z.object({ type: z.enum(['LINEAR', 'EASE_IN', 'EASE_OUT', 'EASE_IN_AND_OUT', 'EASE_IN_BACK', 'EASE_OUT_BACK', 'EASE_IN_AND_OUT_BACK', 'GENTLE', 'QUICK', 'BOUNCY', 'SLOW']) }),
  z.object({ type: z.literal('CUSTOM_CUBIC_BEZIER'), x1: z.number().min(0).max(1), y1: z.number().min(-10).max(10), x2: z.number().min(0).max(1), y2: z.number().min(-10).max(10) }),
  z.object({ type: z.literal('CUSTOM_SPRING'), stiffness: z.number().positive().max(10_000), damping: z.number().min(0).max(1000), mass: z.number().positive().max(100) }),
]);
export type PrototypeEasing = z.infer<typeof PrototypeEasingSchema>;

const transitionDuration = z.number().int().min(1).max(10_000);

/** How a prototype moves to its destination (the interaction's animation). */
export const PrototypeTransitionSchema = z.union([
  z.object({ type: z.literal('INSTANT') }),
  z.object({ type: z.enum(['DISSOLVE', 'SMART_ANIMATE']), easing: PrototypeEasingSchema, duration: transitionDuration }),
  z.object({
    type: z.enum(['MOVE_IN', 'MOVE_OUT', 'PUSH', 'SLIDE_IN', 'SLIDE_OUT']),
    direction: z.enum(['LEFT', 'RIGHT', 'TOP', 'BOTTOM']),
    /** Animate matching layers: smart animate layers that match between the frames. */
    matchLayers: z.boolean(),
    easing: PrototypeEasingSchema,
    duration: transitionDuration,
  }),
]);
export type PrototypeTransition = z.infer<typeof PrototypeTransitionSchema>;

/** What starts an interaction. */
export const PrototypeTriggerSchema = z.union([
  /** ON_MEDIA_END: when the video of the layer's video fill ends. */
  z.object({ type: z.enum(['ON_CLICK', 'ON_DRAG', 'ON_HOVER', 'ON_PRESS', 'MOUSE_ENTER', 'MOUSE_LEAVE', 'MOUSE_DOWN', 'MOUSE_UP', 'ON_MEDIA_END']) }),
  /** After delay, in milliseconds. */
  z.object({ type: z.literal('AFTER_TIMEOUT'), timeout: z.number().int().min(0).max(600_000) }),
  /** A key or a combination of keys (KeyboardEvent codes, modifiers first). */
  z.object({ type: z.literal('ON_KEY_DOWN'), keys: z.array(z.string().min(1).max(32)).min(1).max(6) }),
  /** When video hits: the time in the layer's video (in seconds) at which the interaction starts. */
  z.object({ type: z.literal('ON_MEDIA_HIT'), mediaHitTime: z.number().min(0).max(86_400) }),
]);
export type PrototypeTrigger = z.infer<typeof PrototypeTriggerSchema>;

/** An action of a Conditional: its blocks in order — `if` conditions, then an optional `else` (a null condition). */
export interface ConditionalAction {
  type: 'CONDITIONAL';
  blocks: { condition: string | null; actions: PrototypeAction[] }[];
}

/** Set variable: the variable (null until chosen) and the expression its new value comes from. */
const SetVariableActionSchema = z.object({ type: z.literal('SET_VARIABLE'), variableId: IdSchema.nullable(), expression: z.string().max(10_000) });
/** Set variable mode: the collection and the mode the page switches it to (null until chosen). */
const SetVariableModeActionSchema = z.object({ type: z.literal('SET_VARIABLE_MODE'), collectionId: IdSchema.nullable(), modeId: z.string().min(1).max(64).nullable() });
const ConditionalActionSchema = z.object({
  type: z.literal('CONDITIONAL'),
  blocks: z
    .array(z.object({ condition: z.string().max(10_000).nullable(), actions: z.array(z.lazy(() => PrototypeActionSchema)).max(32) }))
    .min(1)
    .max(16),
});

/** A video action: plays, pauses, mutes or unmutes the video of a layer's video fill, jumps in it or sets its time. */
const MediaActionSchema = z.object({
  type: z.literal('UPDATE_MEDIA_RUNTIME'),
  /** The layer with the video fill; null until one is chosen. */
  destinationId: IdSchema.nullable(),
  mediaAction: z.enum(['PLAY', 'PAUSE', 'TOGGLE_PLAY_PAUSE', 'MUTE', 'UNMUTE', 'TOGGLE_MUTE_UNMUTE', 'SKIP_FORWARD', 'SKIP_BACKWARD', 'SKIP_TO']),
  /** Seconds to jump forward or backward by, or the time to set the video to. */
  amount: z.number().min(0).max(86_400).optional(),
});

/** What an interaction does. */
export const PrototypeActionSchema: z.ZodType<PrototypeAction> = z.union([
  SetVariableActionSchema,
  SetVariableModeActionSchema,
  ConditionalActionSchema,
  MediaActionSchema,
  z.object({
    type: z.literal('NODE'),
    /** CHANGE_TO (interactive components) switches the instance the hotspot is in to the destination variant. */
    navigation: z.enum(['NAVIGATE', 'OVERLAY', 'SWAP', 'SCROLL_TO', 'CHANGE_TO']),
    /** The destination layer; null until one is chosen. */
    destinationId: IdSchema.nullable(),
    transition: PrototypeTransitionSchema,
    /** State management: reset the destination's scroll position. */
    resetScrollPosition: z.boolean().optional(),
    /** State management: restart the destination's videos from the beginning, in their original play state. */
    resetVideoPosition: z.boolean().optional(),
    /** Open or swap an overlay positioned manually: the overlay's top-left relative to the hotspot's top-left. */
    overlayRelativePosition: z.object({ x: z.number().finite(), y: z.number().finite() }).optional(),
    /** State management: interactive components in the destination go back to the variants set on the canvas. */
    resetInteractiveComponents: z.boolean().optional(),
  }),
  z.object({ type: z.enum(['BACK', 'CLOSE']) }),
  z.object({ type: z.literal('URL'), url: z.string().max(4096) }),
]);
export type PrototypeAction =
  | {
      type: 'NODE';
      navigation: 'NAVIGATE' | 'OVERLAY' | 'SWAP' | 'SCROLL_TO' | 'CHANGE_TO';
      destinationId: string | null;
      transition: PrototypeTransition;
      resetScrollPosition?: boolean | undefined;
      resetVideoPosition?: boolean | undefined;
      overlayRelativePosition?: { x: number; y: number } | undefined;
      resetInteractiveComponents?: boolean | undefined;
    }
  | { type: 'BACK' | 'CLOSE' }
  | { type: 'URL'; url: string }
  | z.infer<typeof SetVariableActionSchema>
  | z.infer<typeof SetVariableModeActionSchema>
  | z.infer<typeof MediaActionSchema>
  | ConditionalAction;
export type MediaAction = z.infer<typeof MediaActionSchema>['mediaAction'];

/** A prototype interaction: a trigger and the actions it runs, in order. */
export const ReactionSchema = z.object({
  trigger: PrototypeTriggerSchema,
  actions: z.array(PrototypeActionSchema).min(1).max(32),
});
export type Reaction = z.infer<typeof ReactionSchema>;

/** Where a prototype flow starts: a top-level frame, with the flow's name and description. */
export const FlowStartingPointSchema = z.object({
  nodeId: IdSchema,
  name: z.string().max(200),
  description: z.string().max(10_000).optional(),
});
export type FlowStartingPoint = z.infer<typeof FlowStartingPointSchema>;

/** How a frame shows when an interaction opens it as an overlay (set on the overlay, not the connection). */
export const OverlaySettingsSchema = z.object({
  /** MANUAL: where each interaction opening the overlay places it, relative to the layer it is on. */
  position: z.enum(['CENTER', 'TOP_LEFT', 'TOP_CENTER', 'TOP_RIGHT', 'BOTTOM_LEFT', 'BOTTOM_CENTER', 'BOTTOM_RIGHT', 'MANUAL']),
  /** Close when clicking outside the overlay. */
  closeOnClickOutside: z.boolean(),
  /** The background added behind the overlay (its alpha is the opacity); null for none. */
  background: ColorSchema.nullable(),
});
export type OverlaySettings = z.infer<typeof OverlaySettingsSchema>;

/** A reference to a variable: a variable's value that follows another variable, or a property bound to a variable. */
export const VariableAliasSchema = z.object({ type: z.literal('VARIABLE_ALIAS'), id: IdSchema });

export const SolidPaintSchema = z.object({
  type: z.literal('SOLID'),
  color: ColorSchema,
  opacity: unit,
  visible: z.boolean(),
  blendMode: BlendModeSchema,
  /** The color variable the color comes from, while it is applied. */
  boundVariables: z.object({ color: VariableAliasSchema }).optional(),
});

export const GradientStopSchema = z.object({ position: unit, color: ColorSchema });

/**
 * Gradient paints. Gradients are defined in a unit gradient space — linear runs from (0, 0.5)
 * to (1, 0.5); radial, angular and diamond are centered at (0.5, 0.5) with radius 0.5 — and
 * `gradientTransform` maps that space onto the layer's unit square (0–1 on both axes), so the
 * identity is a left-to-right linear gradient or a centered radial one filling the layer.
 */
const gradientPaint = <T extends 'GRADIENT_LINEAR' | 'GRADIENT_RADIAL' | 'GRADIENT_ANGULAR' | 'GRADIENT_DIAMOND'>(type: T) =>
  z.object({
    type: z.literal(type),
    gradientStops: z.array(GradientStopSchema).min(2).max(64),
    gradientTransform: TransformSchema,
    opacity: unit,
    visible: z.boolean(),
    blendMode: BlendModeSchema,
  });

export const LinearGradientPaintSchema = gradientPaint('GRADIENT_LINEAR');
export const RadialGradientPaintSchema = gradientPaint('GRADIENT_RADIAL');
export const AngularGradientPaintSchema = gradientPaint('GRADIENT_ANGULAR');
export const DiamondGradientPaintSchema = gradientPaint('GRADIENT_DIAMOND');

export const ImageScaleModeSchema = z.enum(['FILL', 'FIT', 'CROP', 'TILE']);

const adjustment = z.number().min(-1).max(1);

/** Image adjustments, each −1–1 (the inspector shows −100–100); absent means 0. */
export const ImageFiltersSchema = z
  .object({
    exposure: adjustment,
    contrast: adjustment,
    saturation: adjustment,
    temperature: adjustment,
    tint: adjustment,
    highlights: adjustment,
    shadows: adjustment,
  })
  .partial();

/**
 * Image fill. Image bytes live outside the document in a content-addressed store keyed by
 * `imageHash` (lowercase hex SHA-256). A paint without a hash is a placeholder waiting for an
 * image (drawn as a checkerboard).
 */
export const ImagePaintSchema = z.object({
  type: z.literal('IMAGE'),
  imageHash: z.string().regex(IMAGE_HASH_PATTERN).optional(),
  /** Pixel size of the stored image. */
  imageSize: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
  scaleMode: ImageScaleModeSchema,
  /** CROP: maps the layer's unit square into the image's unit square. */
  imageTransform: TransformSchema.optional(),
  /** TILE: tile size as a multiple of the image's pixel size (default 1). */
  scalingFactor: z.number().positive().optional(),
  /** Clockwise quarter turns of the image within the layer (FILL, FIT, TILE); absent means 0. */
  rotation: z.union([z.literal(90), z.literal(180), z.literal(270)]).optional(),
  /** An animated GIF: the frame the canvas shows, counted from 0 (absent means the first). Presentation view plays it. */
  gifFrame: z.number().int().min(1).max(9999).optional(),
  /** Non-destructive color adjustments; absent when all are 0. */
  filters: ImageFiltersSchema.optional(),
  opacity: unit,
  visible: z.boolean(),
  blendMode: BlendModeSchema,
});

/**
 * Video fill. Placed like an image fill; `videoHash` keys the video's bytes in the same content-addressed store, and
 * `imageHash` its poster (the first frame as a PNG), which the canvas draws while the video isn't playing.
 */
export const VideoPaintSchema = z.object({
  type: z.literal('VIDEO'),
  videoHash: z.string().regex(IMAGE_HASH_PATTERN),
  imageHash: z.string().regex(IMAGE_HASH_PATTERN).optional(),
  /** Pixel size of the video. */
  imageSize: z.object({ width: z.number().int().positive(), height: z.number().int().positive() }).optional(),
  scaleMode: ImageScaleModeSchema,
  imageTransform: TransformSchema.optional(),
  scalingFactor: z.number().positive().optional(),
  rotation: z.union([z.literal(90), z.literal(180), z.literal(270)]).optional(),
  /** Presentation view: whether the video plays when its frame shows (absent means it does). */
  autoplay: z.boolean().optional(),
  /** Presentation view: whether the video starts over when it ends. */
  loop: z.boolean().optional(),
  /** Presentation view: whether the video plays without sound. */
  muted: z.boolean().optional(),
  opacity: unit,
  visible: z.boolean(),
  blendMode: BlendModeSchema,
});

/**
 * Pattern fill: tiles the content of another layer (`sourceNodeId`, absent until chosen). Tiles are
 * the source's size × `scalingFactor` plus `spacing`; hexagonal tiles offset every other row
 * (horizontal) or column (vertical) by half a tile. `horizontalAlignment` anchors the tile grid to the
 * layer's left edge, center or right edge.
 */
export const PatternPaintSchema = z.object({
  type: z.literal('PATTERN'),
  sourceNodeId: IdSchema.optional(),
  tileType: z.enum(['RECTANGULAR', 'HORIZONTAL_HEXAGONAL', 'VERTICAL_HEXAGONAL']),
  scalingFactor: z.number().min(0.01).max(100),
  spacing: z.object({ x: z.number().min(0).max(10000), y: z.number().min(0).max(10000) }),
  horizontalAlignment: z.enum(['START', 'CENTER', 'END']),
  opacity: unit,
  visible: z.boolean(),
  blendMode: BlendModeSchema,
});

export const PaintSchema = z.discriminatedUnion('type', [
  SolidPaintSchema,
  ImagePaintSchema,
  VideoPaintSchema,
  PatternPaintSchema,
  LinearGradientPaintSchema,
  RadialGradientPaintSchema,
  AngularGradientPaintSchema,
  DiamondGradientPaintSchema,
]);

const ShadowFields = {
  /** Shadow color; its alpha is the shadow opacity. */
  color: ColorSchema,
  offset: z.object({ x: finite, y: finite }),
  /** Blur radius in pixels. */
  radius: z.number().min(0),
  /** Grows (positive) or shrinks (negative) the shadow before blurring. */
  spread: finite,
  visible: z.boolean(),
  blendMode: BlendModeSchema,
};

export const DropShadowEffectSchema = z.object({
  type: z.literal('DROP_SHADOW'),
  ...ShadowFields,
  /** Show the shadow through transparent parts of the layer (otherwise the layer's silhouette knocks it out). */
  showShadowBehindNode: z.boolean(),
});
export const InnerShadowEffectSchema = z.object({ type: z.literal('INNER_SHADOW'), ...ShadowFields });
/**
 * Blur settings. Uniform blurs use `radius` everywhere. Progressive blurs ramp from `startRadius`
 * at `startOffset` to `radius` at `endOffset`; offsets are fractions (0–1) of the layer's width and height.
 */
const BlurFields = {
  radius: z.number().min(0),
  visible: z.boolean(),
  blurType: z.enum(['NORMAL', 'PROGRESSIVE']).optional(),
  startRadius: z.number().min(0).optional(),
  startOffset: z.object({ x: unit, y: unit }).optional(),
  endOffset: z.object({ x: unit, y: unit }).optional(),
};
export const LayerBlurEffectSchema = z.object({ type: z.literal('LAYER_BLUR'), ...BlurFields });
export const BackgroundBlurEffectSchema = z.object({ type: z.literal('BACKGROUND_BLUR'), ...BlurFields });

/**
 * Noise: random pixels over the layer's content. `noiseSize` is the pixel size in design pixels and
 * `density` the share of pixels that get noise. Mono uses `color` (alpha = opacity), duo `color` and
 * `secondaryColor`, multi random colors at `opacity`.
 */
export const NoiseEffectSchema = z.object({
  type: z.literal('NOISE'),
  noiseType: z.enum(['MONOTONE', 'DUOTONE', 'MULTITONE']),
  noiseSize: z.number().min(0.1).max(100),
  density: unit,
  color: ColorSchema,
  secondaryColor: ColorSchema,
  opacity: unit,
  visible: z.boolean(),
  blendMode: BlendModeSchema,
});

/** Texture: roughens the layer's edges by up to `radius` pixels, with grain of `noiseSize`; `clipToShape` keeps it inside the layer. */
export const TextureEffectSchema = z.object({
  type: z.literal('TEXTURE'),
  noiseSize: z.number().min(0.1).max(100),
  radius: z.number().min(0).max(100),
  clipToShape: z.boolean(),
  visible: z.boolean(),
});

/**
 * Glass: bends and frosts what is behind the layer inside its shape. `radius` is the frost blur,
 * `refraction` (0–1) and `depth` (px from the edge inward) shape the lens-like edge, `dispersion`
 * (0–1) splits colors along it, and a light from `lightAngle` degrees (0 = from the right,
 * 90 = from the top) highlights the edges with `lightIntensity`, spread by `splay`.
 */
export const GlassEffectSchema = z.object({
  type: z.literal('GLASS'),
  lightIntensity: unit,
  lightAngle: z.number().min(-180).max(180),
  refraction: unit,
  depth: z.number().min(0).max(1000),
  dispersion: unit,
  radius: z.number().min(0).max(1000),
  splay: unit,
  visible: z.boolean(),
});

export const EffectSchema = z.discriminatedUnion('type', [
  DropShadowEffectSchema,
  InnerShadowEffectSchema,
  LayerBlurEffectSchema,
  BackgroundBlurEffectSchema,
  NoiseEffectSchema,
  TextureEffectSchema,
  GlassEffectSchema,
]);

export const StrokeAlignSchema = z.enum(['INSIDE', 'CENTER', 'OUTSIDE']);

export const CornerRadiiSchema = z.object({
  topLeft: z.number().min(0),
  topRight: z.number().min(0),
  bottomRight: z.number().min(0),
  bottomLeft: z.number().min(0),
});

const ParentRefSchema = z.object({ id: IdSchema, key: FractionalKeySchema });

/**
 * A layer's constraint on one axis: MIN keeps its distance to the left/top edge, MAX to the right/bottom,
 * STRETCH to both (resizing it), CENTER to the center, and SCALE keeps its position and size proportional.
 */
export const ConstraintSchema = z.enum(['MIN', 'MAX', 'CENTER', 'STRETCH', 'SCALE']);
/** Resizing inside auto layout: `HUG` (auto layout frames) or `FILL` (children of auto layout frames). Absent means fixed. */
export const LayoutSizingSchema = z.enum(['HUG', 'FILL']);

/** Variables bound to a layer's properties, by property; the properties hold the resolved values. */
export const BoundVariablesSchema = z
  .record(z.string().min(1).max(64), VariableAliasSchema)
  .refine((bindings) => Object.keys(bindings).length <= 64, 'Too many bound variables');
/** Variable modes set on a layer or page, by collection id; collections not listed are Auto. */
export const ExplicitVariableModesSchema = z.record(IdSchema, z.string().min(1).max(64)).refine((modes) => Object.keys(modes).length <= 256, 'Too many variable modes');

const BaseNodeFields = {
  id: IdSchema,
  name: z.string().max(10_000),
  parent: ParentRefSchema,
  visible: z.boolean(),
  locked: z.boolean(),
};

const SceneFields = {
  ...BaseNodeFields,
  transform: TransformSchema,
  size: SizeSchema,
  /**
   * Motion: the point a layer turns and scales around, as a share of its own box (0–1 in each direction). Absent means
   * the middle.
   */
  anchor: z.object({ x: z.number().min(-10).max(10), y: z.number().min(-10).max(10) }).optional(),
  opacity: unit,
  blendMode: BlendModeSchema,
  /** Shadows and blurs, in paint order. Absent when the layer has none. */
  effects: z.array(EffectSchema).max(64).optional(),
  /** The effect style the effects come from, while it is applied. */
  effectStyleId: IdSchema.optional(),
  /** Variables bound to this layer's properties (see `BINDABLE_FIELDS`); the properties hold the resolved values. */
  boundVariables: BoundVariablesSchema.optional(),
  /** Variable modes set on this layer, by collection id; its children inherit them unless they set their own. */
  explicitVariableModes: ExplicitVariableModesSchema.optional(),
  /** Export configurations (the Export section), in order. Absent when the layer has none. */
  exportSettings: z.array(ExportSettingSchema).max(64).optional(),
  /** Prototype interactions starting on this layer (the Prototype tab), in order. Absent when the layer has none. */
  reactions: z.array(ReactionSchema).max(64).optional(),
  /** How this frame shows when an interaction opens it as an overlay. Absent means the defaults. */
  overlay: OverlaySettingsSchema.optional(),
  /** A frame's scroll overflow in prototypes: which way content beyond its bounds scrolls. Absent means no scrolling. */
  overflowDirection: z.enum(['NONE', 'HORIZONTAL', 'VERTICAL', 'BOTH']).optional(),
  /** How the layer moves when the frame it's in scrolls. Absent means it scrolls with its parent. */
  scrollBehavior: z.enum(['SCROLLS', 'FIXED', 'STICKY_SCROLLS']).optional(),
  /** Inside a main component or variant: the component properties (by name) this layer's visibility and text, or for a nested instance its component, follow. */
  componentPropertyReferences: z
    .object({
      visible: z.string().min(1).max(200).optional(),
      characters: z.string().min(1).max(200).optional(),
      mainComponent: z.string().min(1).max(200).optional(),
      slot: z.string().min(1).max(200).optional(),
    })
    .optional(),
  /** Constrain proportions: width and height edits keep the aspect ratio. Absent means off. */
  constrainProportions: z.boolean().optional(),
  /** How the layer responds when its parent frame is resized. Absent means left and top. */
  constraints: z.object({ horizontal: ConstraintSchema, vertical: ConstraintSchema }).optional(),
  /** Horizontal resizing in auto layout (text hugs through `textAutoResize`). Absent means fixed. */
  layoutSizingHorizontal: LayoutSizingSchema.optional(),
  /** Vertical resizing in auto layout. Absent means fixed. */
  layoutSizingVertical: LayoutSizingSchema.optional(),
  /** Size limits for auto layout frames and their children. Absent means no limit. */
  minWidth: z.number().min(0).max(100_000).optional(),
  maxWidth: z.number().min(0).max(100_000).optional(),
  minHeight: z.number().min(0).max(100_000).optional(),
  maxHeight: z.number().min(0).max(100_000).optional(),
  /** Ignore auto layout: the child keeps its own position (and constraints) inside an auto layout frame. */
  layoutPositioning: z.literal('ABSOLUTE').optional(),
  /** Grid auto layout children: columns and rows the child spans (absent means 1). */
  gridColumnSpan: z.number().int().min(1).max(1000).optional(),
  gridRowSpan: z.number().int().min(1).max(10_000).optional(),
  /** Grid auto layout children with manual positioning: the 0-based column and row of the child's cell. */
  gridColumn: z.number().int().min(0).max(1000).optional(),
  gridRow: z.number().int().min(0).max(10_000).optional(),
  /** Alignment within a grid cell. Absent means left and top. */
  gridChildHorizontalAlign: z.enum(['CENTER', 'MAX']).optional(),
  gridChildVerticalAlign: z.enum(['CENTER', 'MAX']).optional(),
  /** Used as a mask: masks the siblings above it, up to the next mask. Absent means not a mask. */
  isMask: z.boolean().optional(),
  /** How a mask reveals content; absent means ALPHA. */
  maskType: z.enum(['ALPHA', 'VECTOR', 'LUMINANCE']).optional(),
  /** Inside a component instance: the layer of the main component this layer mirrors. */
  source: IdSchema.optional(),
  /** Inside a component instance: fields changed on this layer, kept when the main component changes. */
  overrides: z.array(z.string().max(100)).max(200).optional(),
};

export const StrokeJoinSchema = z.enum(['MITER', 'BEVEL', 'ROUND']);
export const DashCapSchema = z.enum(['NONE', 'ROUND', 'SQUARE']);
export const IndividualStrokeWeightsSchema = z.object({
  top: z.number().min(0),
  right: z.number().min(0),
  bottom: z.number().min(0),
  left: z.number().min(0),
});

/** A hand-drawn, bumpy stroke: how many bumps it has, how far they go, and how rounded rather than jagged they are. */
export const DynamicStrokeSchema = z.object({
  frequency: z.number().min(0).max(100),
  wiggle: z.number().min(0).max(100),
  smoothen: z.number().min(0).max(100),
});

const GeometryFields = {
  fills: z.array(PaintSchema).max(256),
  strokes: z.array(PaintSchema).max(256),
  /** The color style the fills come from, while it is applied. */
  fillStyleId: IdSchema.optional(),
  /** The color style the strokes come from, while it is applied. */
  strokeStyleId: IdSchema.optional(),
  strokeWeight: z.number().min(0),
  strokeAlign: StrokeAlignSchema,
  /** Dash pattern as alternating dash and gap lengths; absent for a solid stroke. */
  strokeDashes: z.array(z.number().min(0)).min(2).max(32).optional(),
  /** Cap of each dash; absent means NONE. */
  strokeCap: DashCapSchema.optional(),
  /** Corner join; absent means MITER. */
  strokeJoin: StrokeJoinSchema.optional(),
  /** Miter joins become bevels at corners sharper than this angle, in degrees; absent means 28.96. */
  strokeMiterAngle: z.number().min(0).max(180).optional(),
  /** Dynamic stroke: a hand-drawn, bumpy stroke. Absent for a plain one. */
  dynamicStroke: DynamicStrokeSchema.optional(),
  /** The custom brush the stroke is painted with, while one is applied. */
  brushId: IdSchema.optional(),
};

const CornerFields = {
  cornerRadius: z.number().min(0),
  /** Present only when corners are edited independently. */
  cornerRadii: CornerRadiiSchema.optional(),
  /** Corner smoothing (0–1, 0.6 is the iOS preset); absent means circular corners. */
  cornerSmoothing: unit.optional(),
  /** Per-side stroke weights (frames and rectangles); present only when sides differ from `strokeWeight`. */
  individualStrokeWeights: IndividualStrokeWeightsSchema.optional(),
};

export const DocumentNodeSchema = z.object({
  id: z.literal('0:0'),
  type: z.literal('DOCUMENT'),
  name: z.string(),
  /** How color values are interpreted and rendered; absent means sRGB. */
  colorProfile: z.enum(['SRGB', 'DISPLAY_P3']).optional(),
  /** The frame set as the file's thumbnail (Set as thumbnail); absent means the thumbnail shows the first page. */
  thumbnailNodeId: IdSchema.optional(),
});

/**
 * Ruler guide. `X` guides are vertical lines at x = offset; `Y` guides are horizontal lines
 * at y = offset. Page guides use world coordinates; frame guides use the frame's local space.
 */
export const GuideSchema = z.object({ axis: z.enum(['X', 'Y']), offset: finite });
const GuidesField = z.array(GuideSchema).max(10_000).optional();

/** The properties Motion animates: a layer's place, its size, how far it is turned, and how visible it is. */
export const AnimatedPropertySchema = z.enum(['x', 'y', 'width', 'height', 'rotation', 'opacity']);

/** How an animation moves from one keyframe to the next: a prototype easing, or Hold, which waits and then jumps. */
export const KeyframeEasingSchema = z.union([PrototypeEasingSchema, z.object({ type: z.literal('HOLD') })]);

/** A value a layer's property takes at a moment in the animation. */
export const KeyframeSchema = z.object({
  /** Milliseconds from the animation's start. */
  time: z.number().int().min(0).max(600_000),
  value: z.number().finite(),
  /** The easing from this keyframe to the next; absent means a straight line. */
  easing: KeyframeEasingSchema.optional(),
});

/** One property of one layer over time: its keyframes, earliest first. */
export const AnimationTrackSchema = z.object({
  nodeId: IdSchema,
  property: AnimatedPropertySchema,
  keyframes: z.array(KeyframeSchema).min(1).max(1000),
});

/** A page's animation: how long it runs, how it plays, and the tracks it holds. */
export const PageAnimationSchema = z.object({
  /** Milliseconds; a new animation is 2000 ms long. */
  duration: z.number().int().min(1).max(600_000),
  playback: z.enum(['LOOP', 'ONCE', 'PING_PONG']),
  tracks: z.array(AnimationTrackSchema).max(2000),
});

export const PageNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('PAGE'),
  backgroundColor: ColorSchema,
  /** Motion: the animation on this page. Absent until something is animated. */
  animation: PageAnimationSchema.optional(),
  /** Canvas guides. Absent when the page has none. */
  guides: GuidesField,
  /** Variable modes set on the page, by collection id. */
  explicitVariableModes: ExplicitVariableModesSchema.optional(),
  /** Prototype flows on the page: their starting points, in order. Absent when the page has none. */
  flowStartingPoints: z.array(FlowStartingPointSchema).max(256).optional(),
  /**
   * The device prototypes on the page play in: a device preset (by id) in portrait or landscape (`CCW_90`), with its
   * model (the color of its body, black when absent), a custom size that fits the window, or the full presentation.
   * Absent means no device.
   */
  prototypeDevice: z
    .object({
      type: z.enum(['PRESET', 'CUSTOM', 'PRESENTATION', 'NONE']),
      presetId: z.string().max(100).optional(),
      rotation: z.enum(['NONE', 'CCW_90']),
      model: z.enum(['BLACK', 'SILVER', 'GOLD', 'BLUE']).optional(),
    })
    .optional(),
  /** The color behind prototypes on the page in presentation view. Absent means the page's canvas color. */
  prototypeBackground: ColorSchema.optional(),
});

/**
 * Layout guide on a frame. `GRID` is a uniform grid of `sectionSize` squares. `COLUMNS` and `ROWS`
 * divide the frame's width or height: `count` bands (null is Auto: as many as fit) separated by
 * `gutterSize`. With `STRETCH` alignment bands share the space left by `offset` margins on both sides;
 * with `MIN`, `CENTER` or `MAX` they are `sectionSize` wide and start `offset` from that side.
 */
export const LayoutGuideSchema = z.object({
  pattern: z.enum(['GRID', 'COLUMNS', 'ROWS']),
  visible: z.boolean(),
  color: ColorSchema,
  sectionSize: z.number().min(1).max(100_000),
  count: z.number().int().min(1).max(1000).nullable(),
  alignment: z.enum(['MIN', 'CENTER', 'MAX', 'STRETCH']),
  gutterSize: z.number().min(0).max(100_000),
  offset: z.number().min(0).max(100_000),
});

/** A grid track size: fixed pixels, a fraction (fr) of the free space, or hugging its cells. */
export const GridTrackSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('FIXED'), value: z.number().min(0).max(100_000) }),
  z.object({ type: z.literal('FLEX'), value: z.number().min(0.01).max(1000) }),
  z.object({ type: z.literal('HUG') }),
]);

/**
 * A component property: boolean properties drive layer visibility, text properties the text of text layers, and
 * instance swap properties which component a nested instance is (with preferred components to swap to).
 */
export const ComponentPropertyDefinitionSchema = z.discriminatedUnion('type', [
  // Boolean and text properties' default values can follow a variable (resolved in the component's variable modes).
  z.object({ type: z.literal('BOOLEAN'), defaultValue: z.boolean(), boundVariables: z.object({ defaultValue: VariableAliasSchema }).optional() }),
  z.object({ type: z.literal('TEXT'), defaultValue: z.string().max(1_000_000), boundVariables: z.object({ defaultValue: VariableAliasSchema }).optional() }),
  z.object({ type: z.literal('INSTANCE_SWAP'), defaultValue: IdSchema, preferredValues: z.array(IdSchema).max(1000).optional() }),
  // A slot: a frame in the component whose content instances can change (no default value; the frame's layers are the default content).
  z.object({
    type: z.literal('SLOT'),
    description: z.string().max(10_000).optional(),
    preferredValues: z.array(IdSchema).max(1000).optional(),
    minLayers: z.number().int().min(0).max(10_000).optional(),
    maxLayers: z.number().int().min(0).max(10_000).optional(),
    onlyPreferred: z.literal(true).optional(),
    showEmpty: z.literal(true).optional(),
    fillCounterAxis: z.literal(true).optional(),
  }),
]);
export type ComponentPropertyDefinition = z.infer<typeof ComponentPropertyDefinitionSchema>;

export const FrameNodeSchema = z.object({
  ...SceneFields,
  ...GeometryFields,
  ...CornerFields,
  type: z.literal('FRAME'),
  clipsContent: z.boolean(),
  /** Present when the frame is a main component (Create component, ⌥⌘K). */
  component: z
    .object({
      /** Component configuration: a description and a documentation link for collaborators. */
      description: z.string().max(10_000).optional(),
      link: z.string().max(2_000).optional(),
    })
    .optional(),
  /** Present when the frame is a component set: the container of a component's variants. */
  componentSet: z
    .object({
      description: z.string().max(10_000).optional(),
      link: z.string().max(2_000).optional(),
    })
    .optional(),
  /** Main components and component sets: their component properties by name, in creation order. */
  componentPropertyDefinitions: z.record(z.string().min(1).max(200), ComponentPropertyDefinitionSchema).optional(),
  /** Present when the frame is an instance of a main component. */
  instance: z.object({ mainId: IdSchema }).optional(),
  /** A nested instance in a main component whose component properties the component's instances show with their own. */
  isExposedInstance: z.literal(true).optional(),
  /** Frame guides (for frames directly on the page or in a section). Absent when none. */
  guides: GuidesField,
  /** Layout guides, drawn over the frame's contents. Absent when none. */
  layoutGuides: z.array(LayoutGuideSchema).max(100).optional(),
  /** The layout guide style the layout guides come from, while it is applied. */
  gridStyleId: IdSchema.optional(),
  /** Auto layout flow of the children, in layer order (first child first). Absent means freeform. */
  layoutMode: z.enum(['HORIZONTAL', 'VERTICAL', 'GRID']).optional(),
  /** Horizontal auto layout only: children that overflow continue on the next line. */
  layoutWrap: z.literal(true).optional(),
  paddingTop: z.number().min(0).max(100_000).optional(),
  paddingRight: z.number().min(0).max(100_000).optional(),
  paddingBottom: z.number().min(0).max(100_000).optional(),
  paddingLeft: z.number().min(0).max(100_000).optional(),
  /** Gap between children along the flow (may be negative). Absent means 0. */
  itemSpacing: z.number().min(-100_000).max(100_000).optional(),
  /** Gap between wrapped lines. Absent means 0. */
  counterAxisSpacing: z.number().min(-100_000).max(100_000).optional(),
  /** Packing along the flow, or an Auto gap (`SPACE_*`). Absent means start. */
  primaryAxisAlignItems: z.enum(['CENTER', 'MAX', 'SPACE_BETWEEN', 'SPACE_AROUND', 'SPACE_EVENLY']).optional(),
  /** Alignment across the flow. Absent means start. */
  counterAxisAlignItems: z.enum(['CENTER', 'MAX', 'BASELINE']).optional(),
  /** Canvas stacking: the first child is drawn on top. Absent means the last child is on top. */
  itemReverseZIndex: z.literal(true).optional(),
  /** Inside strokes are excluded from the layout. Absent means they take up room like padding. */
  strokesIncludedInLayout: z.literal(false).optional(),
  /** Grid auto layout: one size per column (at least one). */
  gridColumnSizes: z.array(GridTrackSchema).min(1).max(1000).optional(),
  /** Grid auto layout: explicit rows; absent means Auto (as many 1fr rows as the cells need). */
  gridRowSizes: z.array(GridTrackSchema).min(1).max(10_000).optional(),
  gridColumnGap: z.number().min(0).max(100_000).optional(),
  gridRowGap: z.number().min(0).max(100_000).optional(),
  /** Grid auto layout: children keep their own cells instead of filling cells in layer order. */
  gridAutoPositioning: z.literal(false).optional(),
});

/**
 * A transform on a group: its contents are repeated without adding layers, around a center (radial) or along a line
 * (linear). Apply transforms turns the copies into real layers.
 */
export const RepeatTransformSchema = z.object({
  kind: z.enum(['RADIAL', 'LINEAR']),
  /** How many copies there are, the original included. */
  count: z.number().int().min(1).max(200),
  /** LINEAR: how far apart the copies sit, in the group's units. */
  spacing: z.number().min(-100_000).max(100_000),
  /** LINEAR: the line the copies run along; absent means horizontal. */
  direction: z.enum(['HORIZONTAL', 'VERTICAL']).optional(),
  /** RADIAL: the angle the copies spread over, in degrees; absent means the full circle. */
  angle: z.number().min(-3600).max(3600).optional(),
});

export const GroupNodeSchema = z.object({ ...SceneFields, type: z.literal('GROUP'), repeat: RepeatTransformSchema.optional() });

export const RectangleNodeSchema = z.object({
  ...SceneFields,
  ...GeometryFields,
  ...CornerFields,
  type: z.literal('RECTANGLE'),
});

/**
 * Arc of an ellipse (arc handles): filled from `startingAngle` to `endingAngle` — radians, clockwise on
 * screen from the right-hand point, up to a full turn either way — and hollowed into a ring by
 * `innerRadius` (0–1 of the radius).
 */
export const ArcDataSchema = z.object({
  startingAngle: z.number(),
  endingAngle: z.number(),
  innerRadius: z.number().min(0).max(1),
});

export const EllipseNodeSchema = z.object({
  ...SceneFields,
  ...GeometryFields,
  type: z.literal('ELLIPSE'),
  /** Present once the ellipse is an arc, pie or ring. */
  arcData: ArcDataSchema.optional(),
});

const PointCountSchema = z.number().int().min(3).max(60);

/** Regular polygon; vertices are scaled so their bounds fill the layer box. */
export const PolygonNodeSchema = z.object({
  ...SceneFields,
  ...GeometryFields,
  type: z.literal('POLYGON'),
  pointCount: PointCountSchema,
  /** Rounds every vertex; absent means sharp corners. */
  cornerRadius: z.number().min(0).optional(),
  /** Corner smoothing (0–1); absent means circular corners. */
  cornerSmoothing: unit.optional(),
});

/** Star; `innerRadius` is the inner/outer radius ratio. */
export const StarNodeSchema = z.object({
  ...SceneFields,
  ...GeometryFields,
  type: z.literal('STAR'),
  pointCount: PointCountSchema,
  innerRadius: unit,
  /** Rounds every vertex; absent means sharp corners. */
  cornerRadius: z.number().min(0).optional(),
  /** Corner smoothing (0–1); absent means circular corners. */
  cornerSmoothing: unit.optional(),
});

export const StrokeCapSchema = z.enum(['NONE', 'ROUND', 'SQUARE', 'LINE_ARROW', 'TRIANGLE_ARROW', 'CIRCLE_FILLED', 'DIAMOND_FILLED']);

/**
 * Straight line from local (0,0) to (width, 0); direction comes from the transform and the
 * height is always 0. Lines are stroked on center and have independent end caps.
 */
export const LineNodeSchema = z.object({
  ...SceneFields,
  ...GeometryFields,
  type: z.literal('LINE'),
  startCap: StrokeCapSchema,
  endCap: StrokeCapSchema,
});

const VectorPointSchema = z.object({ x: finite, y: finite });

/**
 * Vector network: vertices joined by straight or curved segments in any direction (branches
 * allowed), plus closed regions that can be filled. A segment's tangents are the offsets of its
 * Bézier control points from its start and end vertices (zero for straight segments); a region
 * lists loops of segment indices. Coordinates are in the layer's local space.
 */
export const VectorNetworkSchema = z.object({
  vertices: z.array(VectorPointSchema).max(100_000),
  segments: z
    .array(z.object({ start: z.number().int().min(0), end: z.number().int().min(0), tangentStart: VectorPointSchema, tangentEnd: VectorPointSchema }))
    .max(100_000),
  /** Closed regions that can be filled; a region's own `fills` (Paint tool) replace the layer's fills inside it. */
  regions: z
    .array(
      z.object({
        loops: z.array(z.array(z.number().int().min(0)).min(1)).min(1),
        windingRule: z.enum(['NONZERO', 'EVENODD']),
        fills: z.array(PaintSchema).max(256).optional(),
      }),
    )
    .max(10_000),
});

/** A vector layer (Pen, Pencil): a vector network whose geometry fills the layer box; resizing scales the network. */
export const VectorNodeSchema = z.object({
  ...SceneFields,
  ...GeometryFields,
  type: z.literal('VECTOR'),
  vectorNetwork: VectorNetworkSchema,
  /** Cap of the network's open ends; absent means NONE. */
  endpointCap: StrokeCapSchema.optional(),
  /**
   * Width points of a variable-width stroke (Variable width tool): each a position (0–1 of the path's
   * length) and the stroke's full width there, in any order. Absent means the uniform stroke weight.
   */
  strokeWidths: z
    .array(z.object({ position: z.number().min(0).max(1), width: z.number().min(0) }))
    .max(1000)
    .optional(),
});

/**
 * Boolean group: its children's outlines combined by `booleanOperation` — union, subtract (the bottom
 * layer minus the ones above), intersect or exclude — painted with the group's own fills, strokes and
 * effects. The children stay editable.
 */
export const BooleanOperationNodeSchema = z.object({
  ...SceneFields,
  ...GeometryFields,
  type: z.literal('BOOLEAN_OPERATION'),
  booleanOperation: z.enum(['UNION', 'SUBTRACT', 'INTERSECT', 'EXCLUDE']),
});

/**
 * Canvas region that organizes layers. Sections live on the page or inside other sections
 * (never in frames or groups), do not clip, and are never rotated or flipped.
 */
export const SectionNodeSchema = z.object({ ...SceneFields, ...GeometryFields, type: z.literal('SECTION') });

/** Export region. Slices are not rendered; only content within their bounds is exported. */
export const SliceNodeSchema = z.object({ ...SceneFields, type: z.literal('SLICE') });

/** A font by family and style name (e.g. `{ family: 'Inter', style: 'Semi Bold Italic' }`). */
export const FontNameSchema = z.object({ family: z.string().min(1).max(200), style: z.string().min(1).max(200) });
/** Line height: the font's own (AUTO), a fixed size in pixels, or a percentage of the font size. */
export const LineHeightSchema = z.discriminatedUnion('unit', [
  z.object({ unit: z.literal('AUTO') }),
  z.object({ unit: z.literal('PIXELS'), value: z.number().min(0).max(100_000) }),
  z.object({ unit: z.literal('PERCENT'), value: z.number().min(0).max(100_000) }),
]);
/** Extra space between characters, in pixels or as a percentage of the font size. */
export const LetterSpacingSchema = z.object({ unit: z.enum(['PIXELS', 'PERCENT']), value: z.number().min(-100_000).max(100_000) });
export const TextAlignHorizontalSchema = z.enum(['LEFT', 'CENTER', 'RIGHT', 'JUSTIFIED']);
export const TextAlignVerticalSchema = z.enum(['TOP', 'CENTER', 'BOTTOM']);
/**
 * Resizing: WIDTH_AND_HEIGHT (auto width — the box fits the text, lines break only at line breaks),
 * HEIGHT (auto height — fixed width, text wraps and the height fits), NONE (fixed size — text wraps
 * and may overflow) and TRUNCATE (fixed size, overflowing text ends in an ellipsis).
 */
export const TextAutoResizeSchema = z.enum(['WIDTH_AND_HEIGHT', 'HEIGHT', 'NONE', 'TRUNCATE']);

/** Underline or strikethrough. */
export const TextDecorationSchema = z.enum(['NONE', 'UNDERLINE', 'STRIKETHROUGH']);
/** Letter case, applied when displaying (the characters stay as typed); small caps uses the font's `smcp` feature. */
export const TextCaseSchema = z.enum(['ORIGINAL', 'UPPER', 'LOWER', 'TITLE', 'SMALL_CAPS']);

/** A paragraph's list: none, bulleted (unordered) or numbered (ordered). */
export const ListTypeSchema = z.enum(['NONE', 'UNORDERED', 'ORDERED']);

/** A link on text: a web address (http or https). */
export const HyperlinkSchema = z.object({
  type: z.literal('URL'),
  value: z
    .string()
    .max(2048)
    .regex(/^https?:\/\/\S+$/i, 'Links must be http or https addresses'),
});

/** OpenType features turned on (true) or off (false) by four-character tag; absent tags use the font's default. */
export const OpenTypeFeaturesSchema = z.record(z.string().regex(/^[a-z0-9]{4}$/), z.boolean()).refine((features) => Object.keys(features).length <= 256, 'Too many OpenType features');

/** Variable font axis values by four-character axis tag (e.g. `wght`, `wdth`, `GRAD`); absent axes use the style or font default. */
export const FontVariationsSchema = z.record(z.string().regex(/^[A-Za-z0-9 ]{4}$/), z.number().finite()).refine((axes) => Object.keys(axes).length <= 64, 'Too many font variation axes');

/** A paragraph's direction: detected from its first letter (AUTO), left to right, or right to left. */
export const TextDirectionSchema = z.enum(['AUTO', 'LTR', 'RTL']);

/** Where a paragraph's lines break: as many words as fit (AUTO), evenly balanced lines, or no orphaned last word (PRETTY). */
export const WrapStyleSchema = z.enum(['AUTO', 'BALANCE', 'PRETTY']);

/** How an underline is drawn. */
export const DecorationStyleSchema = z.enum(['SOLID', 'DOTTED', 'WAVY']);

/** Properties a range of characters can override in a text layer (mixed styles). */
export const TextStyleOverridesSchema = z.object({
  fontName: FontNameSchema.optional(),
  fontSize: z.number().min(1).max(10_000).optional(),
  lineHeight: LineHeightSchema.optional(),
  letterSpacing: LetterSpacingSchema.optional(),
  fills: z.array(PaintSchema).max(256).optional(),
  textDecoration: TextDecorationSchema.optional(),
  textCase: TextCaseSchema.optional(),
  /** List properties of the paragraphs whose style comes from these characters. */
  listType: ListTypeSchema.optional(),
  indentation: z.number().int().min(1).max(5).optional(),
  /** A link on these characters; null removes a link the layer has. */
  hyperlink: HyperlinkSchema.nullable().optional(),
  openTypeFeatures: OpenTypeFeaturesSchema.optional(),
  fontVariations: FontVariationsSchema.optional(),
  /** Direction of the paragraphs whose style comes from these characters. */
  textDirection: TextDirectionSchema.optional(),
  /** Wrap style of the paragraphs whose style comes from these characters. */
  wrapStyle: WrapStyleSchema.optional(),
  /** Underline details; null thickness or color means the font's thickness or the text color. */
  decorationStyle: DecorationStyleSchema.optional(),
  decorationThickness: z.number().min(0.1).max(1000).nullable().optional(),
  decorationOffset: z.number().min(-1000).max(1000).optional(),
  decorationSkipInk: z.boolean().optional(),
  decorationColor: ColorSchema.nullable().optional(),
});
/** Overrides on the characters [start, end) (UTF-16 offsets). */
export const TextStyleRunSchema = z.object({ start: z.number().int().min(0), end: z.number().int().min(1), style: TextStyleOverridesSchema });

/** Text layer. Fills color the glyphs; `size` follows `textAutoResize`. */
export const TextNodeSchema = z.object({
  ...SceneFields,
  ...GeometryFields,
  type: z.literal('TEXT'),
  characters: z.string().max(1_000_000),
  /**
   * Text on a path: the vector layer whose path the text follows (the two share a transform, so the path is read in
   * this layer's own space), where along it the text starts (0–1), and whether it sits on the other side.
   */
  textPath: z.object({ pathId: IdSchema, start: z.number().min(0).max(1), flipped: z.boolean() }).optional(),
  fontName: FontNameSchema,
  /** The text style the typography comes from, while it is applied. */
  textStyleId: IdSchema.optional(),
  fontSize: z.number().min(1).max(10_000),
  lineHeight: LineHeightSchema,
  letterSpacing: LetterSpacingSchema,
  textAlignHorizontal: TextAlignHorizontalSchema,
  textAlignVertical: TextAlignVerticalSchema,
  textAutoResize: TextAutoResizeSchema,
  /** The layer name follows the first line of the text until the layer is renamed. Absent means off. */
  autoRename: z.boolean().optional(),
  /** Mixed styles: sorted, non-overlapping overrides of the layer's style on character ranges. Absent when uniform. */
  styleRuns: z.array(TextStyleRunSchema).max(100_000).optional(),
  /** Absent means no decoration. */
  textDecoration: TextDecorationSchema.optional(),
  /** Absent means as typed. */
  textCase: TextCaseSchema.optional(),
  /** Text beyond this many lines is cut off with an ellipsis (auto height or truncated boxes). Absent means no limit. */
  maxLines: z.number().int().min(1).max(10_000).optional(),
  /** Space between paragraphs, in pixels. Absent means 0. */
  paragraphSpacing: z.number().min(0).max(10_000).optional(),
  /** First-line indent of every paragraph, in pixels (left-aligned and justified text only). Absent means 0. */
  paragraphIndent: z.number().min(0).max(10_000).optional(),
  /** Default list type of paragraphs (style runs override it per paragraph). Absent means no list. */
  listType: ListTypeSchema.optional(),
  /** Default list indentation level, 1–5. Absent means 1. */
  indentation: z.number().int().min(1).max(5).optional(),
  /** Space between consecutive list items, in pixels. Absent means 0. */
  listSpacing: z.number().min(0).max(10_000).optional(),
  /** A link on the whole text (style runs can link parts of it). */
  hyperlink: HyperlinkSchema.optional(),
  /** OpenType features of the whole text (style runs can override them per character). */
  openTypeFeatures: OpenTypeFeaturesSchema.optional(),
  /** Variable font axis values of the whole text (style runs can override them per character). */
  fontVariations: FontVariationsSchema.optional(),
  /** Default direction of paragraphs (style runs override it per paragraph). Absent means detected. */
  textDirection: TextDirectionSchema.optional(),
  /** Default wrap style of paragraphs (style runs override it per paragraph). Absent means AUTO. */
  wrapStyle: WrapStyleSchema.optional(),
  /** List markers hang outside the text box, so item text aligns with its edge. Absent means false. */
  hangingList: z.boolean().optional(),
  /** An opening quotation mark starting a paragraph hangs outside the text box. Absent means false. */
  hangingPunctuation: z.boolean().optional(),
  /** Vertical trim: in auto layout the text takes up only the space from its first line's cap height to its last baseline. */
  leadingTrim: z.literal('CAP_HEIGHT').optional(),
  /** Underline style. Absent means SOLID. */
  decorationStyle: DecorationStyleSchema.optional(),
  /** Underline thickness in pixels. Absent means the font's own. */
  decorationThickness: z.number().min(0.1).max(1000).optional(),
  /** Underline distance below the font's own position, in pixels. Absent means 0. */
  decorationOffset: z.number().min(-1000).max(1000).optional(),
  /** The underline skips where glyphs cross it. Absent means true. */
  decorationSkipInk: z.boolean().optional(),
  /** Underline color. Absent means the text's color. */
  decorationColor: ColorSchema.optional(),
});

/**
 * A local style: named properties layers reuse. Color styles hold paints (for fills or strokes), text styles typography (not
 * alignment), effect styles effects, and layout guide styles layout guides. Styles are children of the document.
 */
/**
 * A custom brush, made from a closed vector layer: its shape, and how that shape follows a stroke — stretched along its
 * length, or repeated along it.
 */
export const BrushNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('BRUSH'),
  brushKind: z.enum(['STRETCH', 'SCATTER']),
  vectorNetwork: VectorNetworkSchema,
  /** The size the shape was made at, which its outline is measured against. */
  size: SizeSchema,
});

export const StyleNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('STYLE'),
  styleType: z.enum(['FILL', 'TEXT', 'EFFECT', 'GRID']),
  /** Shown when hovering over the style in the style picker. */
  description: z.string().max(10_000).optional(),
  paints: z.array(PaintSchema).max(256).optional(),
  effects: z.array(EffectSchema).max(64).optional(),
  layoutGuides: z.array(LayoutGuideSchema).max(100).optional(),
  fontName: FontNameSchema.optional(),
  fontSize: z.number().min(1).max(10_000).optional(),
  lineHeight: LineHeightSchema.optional(),
  letterSpacing: LetterSpacingSchema.optional(),
  paragraphSpacing: z.number().min(0).max(10_000).optional(),
  paragraphIndent: z.number().min(0).max(10_000).optional(),
  listSpacing: z.number().min(0).max(10_000).optional(),
  textCase: TextCaseSchema.optional(),
  textDecoration: TextDecorationSchema.optional(),
  openTypeFeatures: OpenTypeFeaturesSchema.optional(),
  fontVariations: FontVariationsSchema.optional(),
  leadingTrim: z.literal('CAP_HEIGHT').optional(),
  hangingPunctuation: z.boolean().optional(),
});

/** A variable's value in a mode: a value of its type, or an alias to another variable of that type. */
export const VariableValueSchema = z.union([VariableAliasSchema, ColorSchema, z.number().finite(), z.string().max(100_000), z.boolean()]);

/**
 * A variable collection: a set of variables and modes (the first mode is the default). A child of the document. An
 * extended collection uses the variables, modes and order of the collection it extends, with its own overriding values.
 */
export const VariableCollectionNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('VARIABLE_COLLECTION'),
  modes: z
    .array(z.object({ modeId: z.string().min(1).max(64), name: z.string().min(1).max(200) }))
    .min(1)
    .max(40),
  /** An extended collection: the collection it extends. */
  extendsCollectionId: IdSchema.optional(),
  /** In an extended collection: values overriding the parent collection's, by variable id, then mode id. */
  variableOverrides: z.record(IdSchema, z.record(z.string().min(1).max(64), VariableValueSchema)).optional(),
});

/** A variable: one value per mode of its collection (its parent), a value or an alias to a variable of the same type. */
export const VariableNodeSchema = z.object({
  ...BaseNodeFields,
  type: z.literal('VARIABLE'),
  resolvedType: z.enum(['COLOR', 'FLOAT', 'STRING', 'BOOLEAN']),
  valuesByMode: z.record(z.string().min(1).max(64), VariableValueSchema),
  description: z.string().max(10_000).optional(),
  /** The properties the variable is offered for; absent means all supported properties. */
  scopes: z.array(z.string().min(1).max(64)).max(64).optional(),
  /** Names of the variable in code, per platform. */
  codeSyntax: z.object({ WEB: z.string().min(1).max(1000).optional(), ANDROID: z.string().min(1).max(1000).optional(), iOS: z.string().min(1).max(1000).optional() }).optional(),
});

export const NodeSchema = z.discriminatedUnion('type', [
  DocumentNodeSchema,
  PageNodeSchema,
  StyleNodeSchema,
  BrushNodeSchema,
  VariableCollectionNodeSchema,
  VariableNodeSchema,
  FrameNodeSchema,
  GroupNodeSchema,
  RectangleNodeSchema,
  EllipseNodeSchema,
  PolygonNodeSchema,
  StarNodeSchema,
  LineNodeSchema,
  VectorNodeSchema,
  BooleanOperationNodeSchema,
  SectionNodeSchema,
  SliceNodeSchema,
  TextNodeSchema,
]);

export const DocumentMetaSchema = z.object({
  name: z.string().max(1_000),
  createdAt: z.string(),
  appVersion: z.string(),
});

export const DocumentSchema = z.object({
  format: z.literal(FORMAT_NAME),
  version: z.literal(FORMAT_VERSION),
  meta: DocumentMetaSchema,
  nodes: z.record(IdSchema, NodeSchema),
});

export type Color = z.infer<typeof ColorSchema>;
export type Transform = z.infer<typeof TransformSchema>;
export type Size = z.infer<typeof SizeSchema>;
export type BlendMode = z.infer<typeof BlendModeSchema>;
export type Paint = z.infer<typeof PaintSchema>;
export type SolidPaint = z.infer<typeof SolidPaintSchema>;
export type GradientStop = z.infer<typeof GradientStopSchema>;
export type GradientPaint = Extract<Paint, { gradientStops: readonly GradientStop[] }>;
export type GradientType = GradientPaint['type'];
export const isGradientPaint = (paint: Paint): paint is GradientPaint => paint.type.startsWith('GRADIENT_');
export type ImagePaint = z.infer<typeof ImagePaintSchema>;
export type VideoPaint = z.infer<typeof VideoPaintSchema>;
export type ImageScaleMode = z.infer<typeof ImageScaleModeSchema>;
export type ImageFilters = z.infer<typeof ImageFiltersSchema>;
export type PatternPaint = z.infer<typeof PatternPaintSchema>;
export type StrokeAlign = z.infer<typeof StrokeAlignSchema>;
export type StrokeJoin = z.infer<typeof StrokeJoinSchema>;
export type DynamicStroke = z.infer<typeof DynamicStrokeSchema>;
export type Effect = z.infer<typeof EffectSchema>;
export type EffectType = Effect['type'];
export type ShadowEffect = Extract<Effect, { offset: unknown }>;
export type DashCap = z.infer<typeof DashCapSchema>;
export type IndividualStrokeWeights = z.infer<typeof IndividualStrokeWeightsSchema>;
/** Default miter angle (degrees), matching a miter limit of about 4. */
export const DEFAULT_MITER_ANGLE = 28.96;
export type Guide = z.infer<typeof GuideSchema>;
export type LayoutGuide = z.infer<typeof LayoutGuideSchema>;
export type GridTrack = z.infer<typeof GridTrackSchema>;
export type CornerRadii = z.infer<typeof CornerRadiiSchema>;
export type DocumentNode = z.infer<typeof DocumentNodeSchema>;
export type PageNode = z.infer<typeof PageNodeSchema>;
export type RepeatTransform = z.infer<typeof RepeatTransformSchema>;
export type AnimatedProperty = z.infer<typeof AnimatedPropertySchema>;
export type Keyframe = z.infer<typeof KeyframeSchema>;
export type KeyframeEasing = z.infer<typeof KeyframeEasingSchema>;
export type AnimationTrack = z.infer<typeof AnimationTrackSchema>;
export type PageAnimation = z.infer<typeof PageAnimationSchema>;
export type StyleNode = z.infer<typeof StyleNodeSchema>;
export type BrushNode = z.infer<typeof BrushNodeSchema>;
export type BrushKind = BrushNode['brushKind'];
export type VariableCollectionNode = z.infer<typeof VariableCollectionNodeSchema>;
export type VariableNode = z.infer<typeof VariableNodeSchema>;
export type FrameNode = z.infer<typeof FrameNodeSchema>;
export type GroupNode = z.infer<typeof GroupNodeSchema>;
export type RectangleNode = z.infer<typeof RectangleNodeSchema>;
export type EllipseNode = z.infer<typeof EllipseNodeSchema>;
export type PolygonNode = z.infer<typeof PolygonNodeSchema>;
export type StarNode = z.infer<typeof StarNodeSchema>;
export type LineNode = z.infer<typeof LineNodeSchema>;
export type VectorNode = z.infer<typeof VectorNodeSchema>;
export type VectorNetworkData = z.infer<typeof VectorNetworkSchema>;
export type BooleanOperationNode = z.infer<typeof BooleanOperationNodeSchema>;
export type BooleanOperation = BooleanOperationNode['booleanOperation'];
export type ArcData = z.infer<typeof ArcDataSchema>;
export type StrokeCap = z.infer<typeof StrokeCapSchema>;
export type SectionNode = z.infer<typeof SectionNodeSchema>;
export type SliceNode = z.infer<typeof SliceNodeSchema>;
export type FontName = z.infer<typeof FontNameSchema>;
export type LineHeight = z.infer<typeof LineHeightSchema>;
export type LetterSpacing = z.infer<typeof LetterSpacingSchema>;
export type TextAlignHorizontal = z.infer<typeof TextAlignHorizontalSchema>;
export type TextAlignVertical = z.infer<typeof TextAlignVerticalSchema>;
export type TextAutoResize = z.infer<typeof TextAutoResizeSchema>;
export type TextDecoration = z.infer<typeof TextDecorationSchema>;
export type TextCase = z.infer<typeof TextCaseSchema>;
export type ListType = z.infer<typeof ListTypeSchema>;
export type Hyperlink = z.infer<typeof HyperlinkSchema>;
export type OpenTypeFeatures = Readonly<z.infer<typeof OpenTypeFeaturesSchema>>;
export type FontVariations = Readonly<z.infer<typeof FontVariationsSchema>>;
export type TextDirection = z.infer<typeof TextDirectionSchema>;
export type WrapStyle = z.infer<typeof WrapStyleSchema>;
export type Constraint = z.infer<typeof ConstraintSchema>;
export type DecorationStyle = z.infer<typeof DecorationStyleSchema>;
export type TextNode = z.infer<typeof TextNodeSchema>;
export type SceneNode = FrameNode | GroupNode | RectangleNode | EllipseNode | PolygonNode | StarNode | LineNode | VectorNode | BooleanOperationNode | SectionNode | SliceNode | TextNode;
export type Node = z.infer<typeof NodeSchema>;
export type NodeType = Node['type'];
export type DocumentMeta = z.infer<typeof DocumentMetaSchema>;
export type SerializedDocument = z.infer<typeof DocumentSchema>;

export const isSceneNode = (n: Node): n is SceneNode =>
  n.type !== 'DOCUMENT' && n.type !== 'PAGE' && n.type !== 'STYLE' && n.type !== 'VARIABLE_COLLECTION' && n.type !== 'VARIABLE';
export const hasGeometry = (n: Node): n is FrameNode | RectangleNode | EllipseNode | PolygonNode | StarNode | LineNode | VectorNode | BooleanOperationNode | SectionNode | TextNode =>
  n.type === 'FRAME' ||
  n.type === 'RECTANGLE' ||
  n.type === 'ELLIPSE' ||
  n.type === 'VECTOR' ||
  n.type === 'BOOLEAN_OPERATION' ||
  n.type === 'POLYGON' ||
  n.type === 'STAR' ||
  n.type === 'LINE' ||
  n.type === 'SECTION' ||
  n.type === 'TEXT';
export const isContainer = (n: Node): boolean =>
  n.type === 'DOCUMENT' || n.type === 'PAGE' || n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'BOOLEAN_OPERATION' || n.type === 'SECTION';
