// Homography on one physical plane; manual calibration has no OpenCV dependency.
function validateReferenceCorners(corners) {
  if (corners.length !== 4 || corners.some((p) => !Number.isFinite(p.x) || !Number.isFinite(p.y))) {
    throw new Error('Wskaż cztery różne narożniki prostokąta.');
  }
  let direction = 0, twiceArea = 0;
  corners.forEach((a, index) => {
    const b = corners.at((index + 1) % 4), c = corners.at((index + 2) % 4);
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.hypot(b.x - a.x, b.y - a.y) < 4 || Math.abs(cross) < 1e-6 || (direction && Math.sign(cross) !== direction)) {
      throw new Error('Narożniki muszą tworzyć wypukły prostokąt. Powiększ zdjęcie i popraw punkty.');
    }
    direction = Math.sign(cross);
    twiceArea += a.x * b.y - b.x * a.y;
  });
  if (Math.abs(twiceArea) < 50) throw new Error('Wzorzec jest zbyt mały. Zrób bliższe zdjęcie.');
}

function projectReferencePoint(matrix, x, y) {
  const divisor = matrix.g * x + matrix.h * y + matrix.i;
  if (!Number.isFinite(divisor) || Math.abs(divisor) < 1e-10) {
    throw new Error('Punkt leży przy granicy perspektywy. Zrób zdjęcie bardziej na wprost.');
  }
  return { x: (matrix.a * x + matrix.b * y + matrix.c) / divisor,
    y: (matrix.d * x + matrix.e * y + matrix.f) / divisor, divisor };
}

function invertReferenceMatrix(m) {
  const result = {
    a: m.e * m.i - m.f * m.h, b: m.c * m.h - m.b * m.i, c: m.b * m.f - m.c * m.e,
    d: m.f * m.g - m.d * m.i, e: m.a * m.i - m.c * m.g, f: m.c * m.d - m.a * m.f,
    g: m.d * m.h - m.e * m.g, h: m.b * m.g - m.a * m.h, i: m.a * m.e - m.b * m.d,
  };
  const determinant = m.a * result.a + m.b * result.d + m.c * result.g;
  if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) {
    throw new Error('Nie można skalibrować tych narożników. Wskaż je ponownie.');
  }
  for (const key of Object.keys(result)) result[key] /= determinant;
  return result;
}

function createReferenceTransform(corners, widthMm, heightMm) {
  validateReferenceCorners(corners);
  if (!(Number.isFinite(widthMm) && widthMm > 0 && Number.isFinite(heightMm) && heightMm > 0)) {
    throw new Error('Podaj dwa dodatnie wymiary wzorca.');
  }
  const origin = { x: Math.min(...corners.map((p) => p.x)), y: Math.min(...corners.map((p) => p.y)) };
  const scale = Math.max(...corners.map((p) => Math.max(p.x - origin.x, p.y - origin.y)));
  const normalized = corners.map((p) => ({ x: (p.x - origin.x) / scale, y: (p.y - origin.y) / scale }));
  const p0 = normalized.at(0), p1 = normalized.at(1), p2 = normalized.at(2), p3 = normalized.at(3);
  const dx1 = p1.x - p2.x, dx2 = p3.x - p2.x, dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y, dy2 = p3.y - p2.y, dy3 = p0.y - p1.y + p2.y - p3.y;
  let g = 0, h = 0;
  if (Math.abs(dx3) + Math.abs(dy3) > 1e-12) {
    const denominator = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(denominator) < 1e-10) throw new Error('Perspektywa wzorca jest zbyt silna. Zrób zdjęcie bardziej na wprost.');
    g = (dx3 * dy2 - dx2 * dy3) / denominator;
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  }
  const forward = { a: p1.x - p0.x + g * p1.x, b: p3.x - p0.x + h * p3.x, c: p0.x,
    d: p1.y - p0.y + g * p1.y, e: p3.y - p0.y + h * p3.y, f: p0.y, g, h, i: 1 };
  const inverse = invertReferenceMatrix(forward);
  const center = normalized.reduce((acc, p) => ({ x: acc.x + p.x / 4, y: acc.y + p.y / 4 }), { x: 0, y: 0 });
  const centerSign = Math.sign(projectReferencePoint(inverse, center.x, center.y).divisor);
  return {
    toImage(u, v) {
      const p = projectReferencePoint(forward, u, v);
      return { x: p.x * scale + origin.x, y: p.y * scale + origin.y };
    },
    toReference(point) {
      const p = projectReferencePoint(inverse, (point.x - origin.x) / scale, (point.y - origin.y) / scale);
      if (Math.sign(p.divisor) !== centerSign || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
        throw new Error('Punkt jest poza zakresem perspektywy. Wybierz bliższy wzorzec.');
      }
      return { x: p.x * widthMm, y: p.y * heightMm };
    },
  };
}

function warpReference(inputCanvas, corners, warpedCanvas) {
  const transform = createReferenceTransform(corners, 1, 1);
  const previewScale = Math.min(1, 720 / Math.max(warpedCanvas.width, warpedCanvas.height));
  warpedCanvas.width = Math.max(2, Math.round(warpedCanvas.width * previewScale));
  warpedCanvas.height = Math.max(2, Math.round(warpedCanvas.height * previewScale));
  const source = inputCanvas.getContext('2d').getImageData(0, 0, inputCanvas.width, inputCanvas.height).data;
  const ctx = warpedCanvas.getContext('2d');
  const output = ctx.createImageData(warpedCanvas.width, warpedCanvas.height);
  for (let y = 0; y < warpedCanvas.height; y++) {
    for (let x = 0; x < warpedCanvas.width; x++) {
      const p = transform.toImage(x / (warpedCanvas.width - 1), y / (warpedCanvas.height - 1));
      const sourceX = Math.max(0, Math.min(inputCanvas.width - 1, Math.round(p.x)));
      const sourceY = Math.max(0, Math.min(inputCanvas.height - 1, Math.round(p.y)));
      const offset = (sourceY * inputCanvas.width + sourceX) * 4;
      output.data.set(source.subarray(offset, offset + 4), (y * warpedCanvas.width + x) * 4);
    }
  }
  ctx.putImageData(output, 0, 0);
}

function warpToA4(inputCanvas, corners, warpedCanvas) { warpReference(inputCanvas, corners, warpedCanvas); }

function mapImagePointsToReference(corners, points, widthMm, heightMm) {
  if (corners.length === 2) {
    const origin = corners.at(0);
    const pixelLength = Math.hypot(corners.at(1).x - origin.x, corners.at(1).y - origin.y);
    if (pixelLength < 4 || !Number.isFinite(widthMm) || widthMm <= 0) throw new Error('Odcinek skali jest zbyt krótki lub ma nieprawidłowy wymiar.');
    return points.map((p) => ({ x: (p.x - origin.x) * widthMm / pixelLength, y: (p.y - origin.y) * widthMm / pixelLength }));
  }
  const transform = createReferenceTransform(corners, widthMm, heightMm);
  return points.map((p) => transform.toReference(p));
}
