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

import { arcContains } from '../geometry/arc';
import type { DocumentStore } from '../document/store';
import type { ChangeSet } from '../history/history';
import type { Id } from '../ids/ids';
import { apply, IDENTITY, invert, multiply, type Matrix } from '../math/matrix';
import { containsPoint, expand, transformRect, type Rect } from '../math/rect';
import { SpatialIndex } from '../math/spatial-index';
import type { Vec2 } from '../math/vec';
import { effectOutset } from '../effects/effects';
import { distanceToSegment, lineCapSize, pointInPolygon, polygonPoints, starPoints } from '../geometry/shapes';
import { flattenPath, rectangleCorners, resolveCornerRadii, roundedPolygon } from '../geometry/corners';
import { networkOutlines } from '../vector/vector-network';
import { strokeChain, variableWidthOutline } from '../vector/vector-width';
import { capOfEnd, isMarkerCap, openEnds } from '../vector/vector-caps';
import { hasGeometry, isSceneNode, type Node, type SceneNode, type StrokeCap } from '../schema/document';

export const matrixOf = (t: readonly number[]): Matrix => ({ a: t[0]!, b: t[1]!, c: t[2]!, d: t[3]!, e: t[4]!, f: t[5]! });

/** How far a node's painted stroke extends beyond its geometry. */
export function strokeOutset(node: Node): number {
  if (!hasGeometry(node) || node.strokes.every((p) => !p.visible)) return 0;
  if (node.type === 'LINE') {
    const marker = (cap: StrokeCap) => cap !== 'NONE' && cap !== 'ROUND' && cap !== 'SQUARE';
    const half = node.strokeWeight / 2;
    return marker(node.startCap) || marker(node.endCap) ? half + lineCapSize(node.strokeWeight) / 2 : half;
  }
  // An end point drawn as its own artwork — an arrowhead, a circle, a diamond — reaches past the path's end.
  if (node.type === 'VECTOR' && !node.strokeDashes && !node.strokeWidths?.length) {
    const marked = openEnds(node.vectorNetwork).some((end) => isMarkerCap(capOfEnd(node.vectorNetwork.vertices[end.vertex], node.endpointCap)));
    if (marked) return node.strokeWeight / 2 + lineCapSize(node.strokeWeight) / 2;
  }
  const individual = 'individualStrokeWeights' in node ? node.individualStrokeWeights : undefined;
  // A stroke whose width varies reaches as far as its widest point.
  const varying = node.type === 'VECTOR' ? node.strokeWidths : undefined;
  const weight = individual
    ? Math.max(individual.top, individual.right, individual.bottom, individual.left)
    : varying?.length
      ? Math.max(node.strokeWeight, ...varying.map((point) => point.width))
      : node.strokeWeight;
  switch (node.strokeAlign) {
    case 'INSIDE':
      return 0;
    case 'CENTER':
      return weight / 2;
    case 'OUTSIDE':
      return weight;
  }
}

interface Entry {
  world: Matrix;
  /** Axis-aligned world bounds of the node's own geometry. */
  bounds: Rect;
  /** Bounds including stroke outset (used for culling and invalidation). */
  paintBounds: Rect;
}

/** Fields whose change affects world transforms or bounds of a node's subtree. */
const GEOMETRY_FIELDS: ReadonlySet<string> = new Set(['transform', 'size', 'strokes', 'strokeWeight', 'strokeAlign', 'startCap', 'endCap', 'endpointCap', 'individualStrokeWeights', 'effects']);

/**
 * Derived per-page geometry: world transforms, world bounds, and a spatial index for
 * culling, marquee selection and hit testing.
 *
 * Updates are incremental when the owner reports document changes via `applyChange`
 * (the editor forwards every history ChangeSet): geometry edits recompute only the edited
 * subtrees, and the spatial tree is rebuilt lazily on the next query. Structural changes
 * (create, delete, reparent) and unreported revisions fall back to a full rebuild.
 */
export class SceneIndex {
  private entries = new Map<Id, Entry>();
  private spatial = new SpatialIndex<Id>().build();
  private spatialDirty = false;
  private builtRev = -1;
  private builtPage: Id | null = null;
  private fullDirty = true;
  private reportedSinceBuild = false;
  private readonly dirtyRoots = new Set<Id>();

  constructor(private readonly store: DocumentStore) {}

  /** Records a document change so the next `ensure()` can update incrementally. */
  applyChange(change: Pick<ChangeSet, 'nodes' | 'structural'>): void {
    this.reportedSinceBuild = true;
    if (change.structural.size > 0) {
      this.fullDirty = true;
      return;
    }
    for (const [id, fields] of change.nodes) {
      if (fields.has('$created') || fields.has('$deleted') || fields.has('parent')) {
        this.fullDirty = true;
        return;
      }
      for (const field of fields) {
        if (GEOMETRY_FIELDS.has(field)) {
          this.dirtyRoots.add(id);
          break;
        }
      }
    }
  }

  ensure(pageId: Id): void {
    const rev = this.store.rev;
    if (this.builtRev === rev && this.builtPage === pageId) return;
    const incremental = !this.fullDirty && this.reportedSinceBuild && this.builtPage === pageId;
    if (incremental) this.updateDirtySubtrees(pageId);
    else this.rebuild(pageId);
    this.builtRev = rev;
    this.builtPage = pageId;
    this.fullDirty = false;
    this.reportedSinceBuild = false;
    this.dirtyRoots.clear();
  }

  worldTransform(id: Id): Matrix {
    return this.entries.get(id)?.world ?? this.computeWorld(id);
  }

  worldBounds(id: Id): Rect | null {
    return this.entries.get(id)?.bounds ?? null;
  }

  paintBounds(id: Id): Rect | null {
    return this.entries.get(id)?.paintBounds ?? null;
  }

  /** Node ids whose paint bounds intersect a world rect (unordered). */
  query(rect: Rect): Id[] {
    if (this.spatialDirty) this.rebuildSpatial();
    return this.spatial.search(rect);
  }

  /** World transform computed by walking ancestors (used for nodes outside the built page). */
  computeWorld(id: Id): Matrix {
    const chain: SceneNode[] = [];
    let cur = this.store.get(id);
    while (cur && isSceneNode(cur)) {
      chain.push(cur);
      cur = this.store.get(cur.parent.id);
    }
    return chain.reverse().reduce((m, n) => multiply(m, matrixOf(n.transform)), IDENTITY);
  }

  /** Point in a node's local coordinate space, or null if its transform is singular. */
  toLocal(id: Id, world: Vec2): Vec2 | null {
    const inv = invert(this.worldTransform(id));
    return inv ? apply(inv, world) : null;
  }

  private rebuild(pageId: Id): void {
    this.entries = new Map();
    for (const child of this.store.children(pageId)) this.visit(child, IDENTITY);
    this.rebuildSpatial();
  }

  private updateDirtySubtrees(pageId: Id): void {
    for (const id of this.dirtyRoots) {
      // Nodes on other pages (or already removed) are not part of this index.
      if (!this.entries.has(id) || !this.store.has(id)) continue;
      const parent = this.store.parentOf(id);
      const parentWorld = parent === null || parent === pageId ? IDENTITY : (this.entries.get(parent)?.world ?? this.computeWorld(parent));
      this.visit(id, parentWorld);
    }
    this.spatialDirty = true;
  }

  private visit(id: Id, parentWorld: Matrix): void {
    const node = this.store.get(id);
    if (!node || !isSceneNode(node)) return;
    const world = multiply(parentWorld, matrixOf(node.transform));
    const local: Rect = { x: 0, y: 0, width: node.size.width, height: node.size.height };
    const bounds = transformRect(world, local);
    const outset = strokeOutset(node) + effectOutset(isSceneNode(node) ? node.effects : undefined);
    const paintBounds = outset > 0 ? transformRect(world, expand(local, outset)) : bounds;
    this.entries.set(id, { world, bounds, paintBounds });
    for (const child of this.store.children(id)) this.visit(child, world);
  }

  private rebuildSpatial(): void {
    const spatial = new SpatialIndex<Id>();
    for (const [id, entry] of this.entries) spatial.add(id, entry.paintBounds);
    this.spatial = spatial.build();
    this.spatialDirty = false;
  }
}

/** Precise containment test in a node's local space. `tolerance` is in world units. */
export function nodeContainsLocal(node: SceneNode, p: Vec2, tolerance: number): boolean {
  const { width: w, height: h } = node.size;
  switch (node.type) {
    case 'GROUP':
    case 'BOOLEAN_OPERATION':
      return false;
    // Sections, slices and text layers are picked anywhere in their box, like the reference editor.
    case 'SECTION':
    case 'SLICE':
    case 'TEXT':
      return containsPoint({ x: -tolerance, y: -tolerance, width: w + tolerance * 2, height: h + tolerance * 2 }, p);
    case 'LINE':
      return distanceToSegment(p, { x: 0, y: 0 }, { x: w, y: 0 }) <= node.strokeWeight / 2 + tolerance;
    case 'POLYGON':
    case 'STAR': {
      if (!containsPoint({ x: -tolerance, y: -tolerance, width: w + tolerance * 2, height: h + tolerance * 2 }, p)) return false;
      const points = node.type === 'POLYGON' ? polygonPoints(w, h, node.pointCount) : starPoints(w, h, node.pointCount, node.innerRadius);
      if (pointInPolygon(p, points)) return true;
      if (tolerance <= 0) return false;
      return points.some((a, i) => distanceToSegment(p, a, points[(i + 1) % points.length]!) <= tolerance);
    }
    case 'VECTOR': {
      const widths = node.strokeWidths;
      const widest = widths?.length ? Math.max(node.strokeWeight, ...widths.map((point) => point.width)) : node.strokeWeight;
      const reach = widest / 2 + tolerance;
      if (!containsPoint({ x: -reach, y: -reach, width: w + reach * 2, height: h + reach * 2 }, p)) return false;
      const outlines = networkOutlines(node.vectorNetwork);
      if (outlines.fills.some((polygon) => pointInPolygon(p, polygon))) return true;
      // A stroke whose width varies is hit where it is actually drawn, not within a width it only reaches in places.
      const chain = widths?.length && !node.strokeDashes ? strokeChain(node.vectorNetwork) : null;
      if (chain) {
        let inside = false;
        for (const polygon of variableWidthOutline(chain, widths!, node.strokeWeight)) if (pointInPolygon(p, polygon)) inside = !inside;
        if (inside) return true;
        if (tolerance <= 0) return false;
        return variableWidthOutline(chain, widths!, node.strokeWeight).some((polygon) =>
          polygon.some((a, i) => distanceToSegment(p, polygon[(i + polygon.length - 1) % polygon.length]!, a) <= tolerance),
        );
      }
      return outlines.strokes.some(({ points, closed }) =>
        points.some((a, i) => (i > 0 && distanceToSegment(p, points[i - 1]!, a) <= reach) || (closed && i === points.length - 1 && distanceToSegment(p, a, points[0]!) <= reach)),
      );
    }
    case 'ELLIPSE': {
      if (node.arcData) return arcContains(w, h, node.arcData, p, tolerance);
      const rx = w / 2 + tolerance;
      const ry = h / 2 + tolerance;
      if (rx <= 0 || ry <= 0) return false;
      const dx = (p.x - w / 2) / rx;
      const dy = (p.y - h / 2) / ry;
      return dx * dx + dy * dy <= 1;
    }
    case 'FRAME':
    case 'RECTANGLE': {
      if (!containsPoint({ x: -tolerance, y: -tolerance, width: w + tolerance * 2, height: h + tolerance * 2 }, p)) return false;
      const radii = resolveCornerRadii(node);
      if (node.cornerSmoothing && Math.max(radii.topLeft, radii.topRight, radii.bottomRight, radii.bottomLeft) > 0) {
        // Smoothed corners: test against the flattened outline.
        const corners = rectangleCorners(w, h, radii);
        const outline = flattenPath(roundedPolygon(corners.points, corners.radii, node.cornerSmoothing));
        if (pointInPolygon(p, outline)) return true;
        return tolerance > 0 && outline.some((a, i) => distanceToSegment(p, a, outline[(i + 1) % outline.length]!) <= tolerance);
      }
      const maxR = Math.min(w, h) / 2;
      const corner = (cx: number, cy: number, r: number) => {
        const rr = Math.min(r, maxR);
        const dx = p.x - cx;
        const dy = p.y - cy;
        return dx * dx + dy * dy <= (rr + tolerance) ** 2;
      };
      const tl = Math.min(radii.topLeft, maxR);
      const tr = Math.min(radii.topRight, maxR);
      const br = Math.min(radii.bottomRight, maxR);
      const bl = Math.min(radii.bottomLeft, maxR);
      if (p.x < tl && p.y < tl) return corner(tl, tl, tl);
      if (p.x > w - tr && p.y < tr) return corner(w - tr, tr, tr);
      if (p.x > w - br && p.y > h - br) return corner(w - br, h - br, br);
      if (p.x < bl && p.y > h - bl) return corner(bl, h - bl, bl);
      return true;
    }
  }
}
