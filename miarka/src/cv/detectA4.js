async function detectReference(canvas, targetAspectRatio, options = {}) {
  return new Promise((resolve) => {
    let src;
    let gray;
    let contours;
    let hierarchy;

    try {
      src = cv.imread(canvas);
      gray = new cv.Mat();

      cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
      cv.GaussianBlur(gray, gray, new cv.Size(5, 5), 0);
      cv.Canny(gray, gray, 45, 145);

      contours = new cv.MatVector();
      hierarchy = new cv.Mat();
      cv.findContours(gray, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      const minAreaShare = Number.isFinite(options.minAreaShare) ? options.minAreaShare : 0.01;
      const maxAreaShare = Number.isFinite(options.maxAreaShare) ? options.maxAreaShare : 0.98;
      const aspectTolerance = Number.isFinite(options.aspectTolerance) ? options.aspectTolerance : 0.42;
      const imageArea = src.rows * src.cols;
      let bestCorners = null;
      let bestScore = 0;

      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const peri = cv.arcLength(cnt, true);
        const epsilonFactors = [0.015, 0.025, 0.04, 0.06];

        for (const epsilonFactor of epsilonFactors) {
          const approx = new cv.Mat();
          cv.approxPolyDP(cnt, approx, epsilonFactor * peri, true);

          if (approx.rows === 4 && cv.isContourConvex(approx)) {
            const area = Math.abs(cv.contourArea(approx));
            const corners = orderCorners(cornersFromContour(approx));
            const aspectRatio = quadrilateralAspectRatio(corners);
            const areaShare = area / imageArea;
            const aspectError = Math.abs(aspectRatio - targetAspectRatio) / targetAspectRatio;
            const credible =
              areaShare >= minAreaShare &&
              areaShare <= maxAreaShare &&
              aspectError <= aspectTolerance;

            if (credible) {
              const shapeScore = Math.max(0.12, 1 - aspectError);
              const score = area * shapeScore;
              if (score > bestScore) {
                bestScore = score;
                bestCorners = corners;
              }
            }
          }

          approx.delete();
        }

        cnt.delete();
      }

      resolve(bestCorners);
    } catch (error) {
      console.error(error);
      resolve(null);
    } finally {
      if (hierarchy) hierarchy.delete();
      if (contours) contours.delete();
      if (gray) gray.delete();
      if (src) src.delete();
    }
  });
}

async function detectA4(canvas) {
  return detectReference(canvas, 297 / 210, {
    minAreaShare: 0.025,
    aspectTolerance: 0.4,
  });
}

function cornersFromContour(contour) {
  const corners = [];
  for (let i = 0; i < 4; i++) {
    const point = contour.intPtr(i, 0);
    corners.push({ x: point[0], y: point[1] });
  }
  return corners;
}

function pointDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function quadrilateralAspectRatio(corners) {
  const width = (
    pointDistance(corners[0], corners[1]) +
    pointDistance(corners[3], corners[2])
  ) / 2;
  const height = (
    pointDistance(corners[0], corners[3]) +
    pointDistance(corners[1], corners[2])
  ) / 2;
  const shorterSide = Math.min(width, height);
  return shorterSide > 0 ? Math.max(width, height) / shorterSide : Number.POSITIVE_INFINITY;
}

function referenceOutputGeometry(corners, longSideMm, shortSideMm, pixelsPerMillimetre = 4) {
  const averageWidth = (
    pointDistance(corners[0], corners[1]) +
    pointDistance(corners[3], corners[2])
  ) / 2;
  const averageHeight = (
    pointDistance(corners[0], corners[3]) +
    pointDistance(corners[1], corners[2])
  ) / 2;
  const landscape = averageWidth > averageHeight;
  const widthMm = landscape ? longSideMm : shortSideMm;
  const heightMm = landscape ? shortSideMm : longSideMm;

  return {
    orientation: landscape ? 'pozioma' : 'pionowa',
    widthMm,
    heightMm,
    widthPixels: Math.max(1, Math.round(widthMm * pixelsPerMillimetre)),
    heightPixels: Math.max(1, Math.round(heightMm * pixelsPerMillimetre)),
  };
}

function orderCorners(points) {
  const center = points.reduce((acc, p) => ({ x: acc.x + p.x / points.length, y: acc.y + p.y / points.length }), { x: 0, y: 0 });
  const pts = points.map((p) => ({ x: p.x, y: p.y }));
  pts.sort((a, b) => Math.atan2(a.y - center.y, a.x - center.x) - Math.atan2(b.y - center.y, b.x - center.x));
  let start = 0;
  pts.forEach((p, index) => {
    const first = pts.at(start);
    if (p.x + p.y < first.x + first.y || (p.x + p.y === first.x + first.y && p.y < first.y)) start = index;
  });
  return pts.slice(start).concat(pts.slice(0, start));
}
