export const WARP_LANDMARKS = [
  10, 21, 54, 58, 67, 93, 103, 109, 127, 132, 136, 148, 149, 150, 152, 162, 172, 176,
  234, 251, 263, 284, 288, 297, 323, 332, 338, 356, 361, 365, 377, 378, 379, 389, 397,
  400, 454, 33, 133, 362, 70, 105, 334, 300, 1, 4, 5, 6, 168, 197, 195, 2,
  61, 78, 13, 14, 308, 291, 17, 0, 37, 267, 87, 317,
];

const EPSILON = 1e-6;

function area(a, b, c) {
  return ((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) / 2;
}

function circumcircleContains(a, b, c, point) {
  const ax = a.x - point.x; const ay = a.y - point.y;
  const bx = b.x - point.x; const by = b.y - point.y;
  const cx = c.x - point.x; const cy = c.y - point.y;
  const determinant = (ax * ax + ay * ay) * (bx * cy - cx * by)
    - (bx * bx + by * by) * (ax * cy - cx * ay)
    + (cx * cx + cy * cy) * (ax * by - bx * ay);
  return area(a, b, c) > 0 ? determinant > EPSILON : determinant < -EPSILON;
}

export function triangulate(points) {
  if (!Array.isArray(points) || points.length < 3) return [];
  const clean = points.map((point) => ({ x: Number(point.x), y: Number(point.y) }));
  if (clean.some((point) => !Number.isFinite(point.x) || !Number.isFinite(point.y))) return [];
  const xs = clean.map((point) => point.x); const ys = clean.map((point) => point.y);
  const minX = Math.min(...xs); const minY = Math.min(...ys);
  const span = Math.max(Math.max(...xs) - minX, Math.max(...ys) - minY, 1);
  const superStart = clean.length;
  clean.push(
    { x: minX - span * 20, y: minY - span },
    { x: minX + span / 2, y: minY + span * 20 },
    { x: minX + span * 20, y: minY - span },
  );
  let triangles = [[superStart, superStart + 1, superStart + 2]];
  for (let index = 0; index < points.length; index += 1) {
    const bad = triangles.filter(([a, b, c]) => circumcircleContains(clean[a], clean[b], clean[c], clean[index]));
    const edges = new Map();
    for (const triangle of bad) {
      for (const [a, b] of [[triangle[0], triangle[1]], [triangle[1], triangle[2]], [triangle[2], triangle[0]]]) {
        const key = a < b ? `${a}:${b}` : `${b}:${a}`;
        if (edges.has(key)) edges.delete(key); else edges.set(key, [a, b]);
      }
    }
    const badSet = new Set(bad);
    triangles = triangles.filter((triangle) => !badSet.has(triangle));
    for (const [a, b] of edges.values()) {
      if (Math.abs(area(clean[a], clean[b], clean[index])) > EPSILON) triangles.push([a, b, index]);
    }
  }
  return triangles.filter((triangle) => triangle.every((index) => index < points.length));
}

export function affineFromTriangles(source, target) {
  const [s0, s1, s2] = source; const [t0, t1, t2] = target;
  const denominator = s0.x * (s1.y - s2.y) + s1.x * (s2.y - s0.y) + s2.x * (s0.y - s1.y);
  if (!Number.isFinite(denominator) || Math.abs(denominator) < EPSILON) throw new Error('Triângulo de origem degenerado.');
  const coefficient = (v0, v1, v2) => ({
    x: (v0 * (s1.y - s2.y) + v1 * (s2.y - s0.y) + v2 * (s0.y - s1.y)) / denominator,
    y: (v0 * (s2.x - s1.x) + v1 * (s0.x - s2.x) + v2 * (s1.x - s0.x)) / denominator,
    offset: (v0 * (s1.x * s2.y - s2.x * s1.y) + v1 * (s2.x * s0.y - s0.x * s2.y) + v2 * (s0.x * s1.y - s1.x * s0.y)) / denominator,
  });
  const x = coefficient(t0.x, t1.x, t2.x); const y = coefficient(t0.y, t1.y, t2.y);
  return { a: x.x, b: y.x, c: x.y, d: y.y, e: x.offset, f: y.offset };
}

function selectedPoints(points) {
  return WARP_LANDMARKS.map((index) => points[index]);
}

export function validateWarpLandmarks(sourcePoints, targetPoints) {
  if (!sourcePoints || !targetPoints) return false;
  const source = selectedPoints(sourcePoints); const target = selectedPoints(targetPoints);
  if ([...source, ...target].some((point) => !point || !Number.isFinite(point.x) || !Number.isFinite(point.y))) return false;
  const sourceEyes = Math.hypot(sourcePoints[263].x - sourcePoints[33].x, sourcePoints[263].y - sourcePoints[33].y);
  const targetEyes = Math.hypot(targetPoints[263].x - targetPoints[33].x, targetPoints[263].y - targetPoints[33].y);
  return sourceEyes > 8 && targetEyes > 8 && targetEyes / sourceEyes > 0.2 && targetEyes / sourceEyes < 5;
}

export function createMeshWarp(sourceImage, targetWidth, targetHeight, sourcePoints, targetPoints) {
  if (!validateWarpLandmarks(sourcePoints, targetPoints)) throw new Error('Landmarks insuficientes para a malha.');
  const source = selectedPoints(sourcePoints); const target = selectedPoints(targetPoints);
  const triangles = triangulate(target);
  if (triangles.length < 35) throw new Error('A triangulação facial ficou incompleta.');
  const canvas = document.createElement('canvas'); canvas.width = targetWidth; canvas.height = targetHeight;
  const context = canvas.getContext('2d');
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  let rendered = 0;
  for (const indexes of triangles) {
    const sourceTriangle = indexes.map((index) => source[index]);
    const targetTriangle = indexes.map((index) => target[index]);
    if (Math.abs(area(...sourceTriangle)) < 0.5 || Math.abs(area(...targetTriangle)) < 0.5) continue;
    const matrix = affineFromTriangles(sourceTriangle, targetTriangle);
    context.save();
    context.beginPath(); context.moveTo(targetTriangle[0].x, targetTriangle[0].y);
    context.lineTo(targetTriangle[1].x, targetTriangle[1].y); context.lineTo(targetTriangle[2].x, targetTriangle[2].y);
    context.closePath(); context.clip();
    context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
    context.drawImage(sourceImage, 0, 0); context.restore(); rendered += 1;
  }
  if (rendered < 30) throw new Error('Poucos triângulos faciais puderam ser renderizados.');
  return canvas;
}
