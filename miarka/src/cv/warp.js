function warpReference(inputCanvas, corners, warpedCanvas) {
  const src = cv.imread(inputCanvas);
  const dst = new cv.Mat();
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    corners[0].x, corners[0].y,
    corners[1].x, corners[1].y,
    corners[2].x, corners[2].y,
    corners[3].x, corners[3].y,
  ]);

  const width = warpedCanvas.width;
  const height = warpedCanvas.height;
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    width - 1, 0,
    width - 1, height - 1,
    0, height - 1,
  ]);

  const transform = cv.getPerspectiveTransform(srcTri, dstTri);
  cv.warpPerspective(src, dst, transform, new cv.Size(width, height));
  cv.imshow(warpedCanvas, dst);

  srcTri.delete();
  dstTri.delete();
  transform.delete();
  src.delete();
  dst.delete();
}

function warpToA4(inputCanvas, corners, warpedCanvas) {
  warpReference(inputCanvas, corners, warpedCanvas);
}

function mapImagePointsToReference(corners, points, widthMm, heightMm) {
  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    corners[0].x, corners[0].y,
    corners[1].x, corners[1].y,
    corners[2].x, corners[2].y,
    corners[3].x, corners[3].y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    widthMm, 0,
    widthMm, heightMm,
    0, heightMm,
  ]);
  const transform = cv.getPerspectiveTransform(srcTri, dstTri);
  const sourcePoints = cv.matFromArray(points.length, 1, cv.CV_32FC2, points.flatMap((point) => [point.x, point.y]));
  const mappedPoints = new cv.Mat();

  cv.perspectiveTransform(sourcePoints, mappedPoints, transform);

  const result = [];
  for (let i = 0; i < points.length; i++) {
    const point = mappedPoints.floatPtr(i, 0);
    result.push({ x: point[0], y: point[1] });
  }

  srcTri.delete();
  dstTri.delete();
  transform.delete();
  sourcePoints.delete();
  mappedPoints.delete();

  return result;
}
