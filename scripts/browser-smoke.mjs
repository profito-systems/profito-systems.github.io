import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { pathToFileURL } from 'node:url';

const root = path.resolve(process.argv.at(2) || process.cwd());
const production = fs.existsSync(path.join(root, 'miarka'));
const siteRoot = path.join(root, production ? 'miarka' : 'public');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.jpg': 'image/jpeg' };
const server = http.createServer((request, response) => {
  const url = new URL(request.url, 'http://localhost');
  let requested = decodeURIComponent(url.pathname);
  if (requested === '/') requested = '/index.html';
  const sitePrefix = '/__site/';
  const filename = production && requested.startsWith(sitePrefix)
    ? path.join(root, requested.slice(sitePrefix.length))
    : !production && requested.startsWith('/src/')
      ? path.join(root, requested)
      : path.join(siteRoot, requested);
  if (!filename.startsWith(root + path.sep) || !fs.existsSync(filename) || fs.statSync(filename).isDirectory()) {
    response.writeHead(404); response.end(); return;
  }
  response.setHeader('Content-Type', mime[path.extname(filename)] || 'application/octet-stream');
  response.end(fs.readFileSync(filename));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_EXECUTABLE_PATH
  ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
const fixture = fs.readFileSync(path.join(siteRoot, 'sample-a4.jpg'));
const unsupportedFixture = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="1000" height="800" fill="#334155"/></svg>');
const failures = Array.of();
const assertLength = (text, expected) => assert.ok(Math.abs(Number.parseFloat(text) - expected) < 1, text + ' differs from ' + expected + 'mm by more than touch-coordinate tolerance');

try {
  if (production) {
    const polishPage = await browser.newPage({ locale: 'pl-PL', viewport: { width: 390, height: 844 } });
    polishPage.on('pageerror', (error) => failures.push(error.message));
    await polishPage.goto(origin + '/__site/index.html');
    assert.equal(await polishPage.locator('html').getAttribute('lang'), 'pl');
    assert.equal(await polishPage.locator('[data-i18n="nav_planner"]').textContent(), 'Zaplanuj projekt');
    assert.equal(await polishPage.locator('[data-lang="pl"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await polishPage.locator('[data-lang="fr"]').count(), 1);

    await polishPage.locator('[data-lang="de"]').click();
    assert.equal(await polishPage.locator('html').getAttribute('lang'), 'de');
    assert.equal(await polishPage.evaluate(() => localStorage.getItem('profitoLanguage')), 'de');
    await polishPage.reload();
    assert.equal(await polishPage.locator('html').getAttribute('lang'), 'de', 'manual language choice must survive reload');
    await polishPage.close();

    const frenchPage = await browser.newPage({ locale: 'fr-FR', viewport: { width: 390, height: 844 } });
    frenchPage.on('pageerror', (error) => failures.push(error.message));
    await frenchPage.goto(origin + '/__site/index.html');
    assert.equal(await frenchPage.locator('html').getAttribute('lang'), 'fr');
    assert.equal(await frenchPage.locator('[data-i18n="planner_title"]').textContent(), 'Comprendre le chantier avant de demander un devis');
    await frenchPage.close();

    const fallbackPage = await browser.newPage({ locale: 'it-IT', viewport: { width: 390, height: 844 } });
    fallbackPage.on('pageerror', (error) => failures.push(error.message));
    await fallbackPage.goto(origin + '/__site/index.html');
    assert.equal(await fallbackPage.locator('html').getAttribute('lang'), 'en');
    await fallbackPage.close();
    console.log('Homepage language detection and manual override passed');
  }
  for (const viewport of Array.of({ width: 1280, height: 900 }, { width: 390, height: 844 }, { width: 320, height: 740 })) {
    const page = await browser.newPage({ viewport, hasTouch: viewport.width < 500, isMobile: viewport.width < 500 });
    page.on('pageerror', (error) => failures.push(error.message));
    let detectorRequests = 0;
    await page.route('https://docs.opencv.org/**', (route) => { detectorRequests++; return route.abort(); });
    await page.goto(origin);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false, 'horizontal overflow');
    await page.getByText('Własny prostokąt', { exact: true }).click();
    await page.locator('#customLong').fill('300');
    await page.locator('#customShort').fill('200');
    await page.locator('#file').setInputFiles({ name: 'reference.jpg', mimeType: 'image/jpeg', buffer: fixture });
    await page.waitForFunction(() => !document.getElementById('manualCornersBtn').disabled);
    assert.equal(await page.evaluate(() => currentImage instanceof HTMLCanvasElement), true, 'loaded photo should be retained only as a bounded working canvas');
    const imageHeightOverWidth = await page.evaluate(() => inputCanvas.height / inputCanvas.width);
    const clickPoint = async (x, y) => {
      const canvas = page.locator('#inputCanvas');
      const box = await canvas.boundingBox();
      if (viewport.width < 500) await canvas.tap({ position: { x: x * box.width / 1000, y: y * box.height / 800 } });
      else await canvas.click({ position: { x: x * box.width / 1000, y: y * box.height / 800 } });
    };
    const calibrate = async () => {
      await page.locator('#manualCornersBtn').click();
      for (const point of Array.of({ x: 500, y: 180 }, { x: 100, y: 100 }, { x: 500, y: 100 }, { x: 100, y: 180 })) {
        await clickPoint(point.x, point.y);
      }
      assert.equal(await page.locator('#measurementPanel').isVisible(), true);
    };
    const measure = async () => {
      await page.locator('#measureWidthBtn').click();
      await clickPoint(100, 100); await clickPoint(900, 100);
      await page.locator('#measureHeightBtn').click();
      await clickPoint(100, 100); await clickPoint(100, 260);
    };
    await calibrate();
    await measure();
    assertLength(await page.locator('#widthResult').textContent(), 600);
    assertLength(await page.locator('#heightResult').textContent(), 400);
    assert.equal(await page.locator('#areaResult').textContent(), '0.24 m²');
    assert.equal(await page.locator('#sendAreaBtn').isEnabled(), true);
    assert.equal(detectorRequests, 0, 'manual measurement must not download OpenCV');
    await page.locator('#clearMeasuresBtn').click();
    assert.equal(await page.locator('#sendAreaBtn').isEnabled(), false);
    assert.equal(await page.locator('#sendAreaBtn').getAttribute('data-area'), null);
    await measure();

    await page.locator('#swapReferenceBtn').click();
    assertLength(await page.locator('#widthResult').textContent(), 400);
    assertLength(await page.locator('#heightResult').textContent(), 600);
    await page.locator('#swapReferenceBtn').click();

    if (viewport.width === 1280) {
      await page.locator('#inputCanvas').scrollIntoViewIfNeeded();
      const box = await page.locator('#inputCanvas').boundingBox();
      await page.mouse.move(box.x + 900 * box.width / 1000, box.y + 100 * box.height / 800);
      await page.mouse.down();
      await page.mouse.move(box.x + 800 * box.width / 1000, box.y + 100 * box.height / 800, { steps: 5 });
      await page.mouse.up();
      assertLength(await page.locator('#widthResult').textContent(), 525);
      await measure();
    }

    await page.locator('#zoomInBtn').click();
    assert.equal(await page.locator('#zoomValue').textContent(), '150%');
    await page.locator('#resetZoomBtn').click();
    assert.equal(await page.locator('#zoomValue').textContent(), '100%');

    const downloadPromise = page.waitForEvent('download');
    await page.locator('#exportPhotoBtn').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'pomiar-profito.png');
    assert.equal(await download.failure(), null);

    // Failure and retry both restore the button; manual mode remains functional.
    await page.locator('#autoDetectBtn').click();
    await page.waitForFunction(() => document.getElementById('result').textContent.includes('Nie udało się uruchomić'));
    assert.equal(await page.locator('#autoDetectBtn').isEnabled(), true);
    await page.locator('#autoDetectBtn').click();
    await page.waitForFunction(() => !document.getElementById('autoDetectBtn').disabled);
    assert.equal(detectorRequests, 2);
    await calibrate();
    await measure();
    assert.equal(await page.locator('#areaResult').textContent(), '0.24 m²');

    await page.getByText('Cegła', { exact: true }).click();
    await page.locator('#brickFace').selectOption('uk-top');
    assert.equal(await page.locator('#customLong').inputValue(), '215');
    assert.equal(await page.locator('#customShort').inputValue(), '102.5');
    await page.locator('#brickFace').selectOption('pl-face');
    assert.equal(await page.locator('#customLong').inputValue(), '250');
    assert.equal(await page.locator('#customShort').inputValue(), '65');
    await page.getByText('Pustak lub płytka', { exact: true }).click();
    assert.equal(await page.locator('#customLong').inputValue(), '');
    await page.locator('#manualCornersBtn').click();
    assert.equal(await page.locator('#result').textContent(), 'Najpierw wpisz poprawne wymiary wybranego wzorca.');
    assert.equal(await page.locator('#measurementPanel').isVisible(), false);

    await page.getByText('Znany odcinek', { exact: true }).click();
    await page.locator('#knownLength').fill('100');
    await page.locator('#manualCornersBtn').click();
    await clickPoint(100, 100);
    await page.locator('#undoPointBtn').click();
    await clickPoint(100, 100);
    await clickPoint(200, 100);
    assert.equal(await page.locator('#referencePreviewCard').isVisible(), false);
    assert.equal(await page.locator('#autoDetectBtn').isEnabled(), false);
    await measure();
    assertLength(await page.locator('#widthResult').textContent(), 800);
    assertLength(await page.locator('#heightResult').textContent(), 200 * imageHeightOverWidth);

    // Changing dimensions invalidates old results and the planner handoff.
    await page.locator('#knownLength').fill('200');
    assert.equal(await page.locator('#measurementPanel').isVisible(), false);
    assert.equal(await page.locator('#sendAreaBtn').isEnabled(), false);

    for (const preset of Array.of(
      { label: 'Karta standardowa ID-1', width: 171.2, height: 107.96 },
      { label: 'Kartka A4', width: 594, height: 420 },
      { label: 'Kartka A5', width: 420, height: 296 },
    )) {
      await page.getByText(preset.label, { exact: true }).click();
      await calibrate(); await measure();
      assertLength(await page.locator('#widthResult').textContent(), preset.width);
      assertLength(await page.locator('#heightResult').textContent(), preset.height);
    }

    if (process.env.MIARKA_SCREENSHOT_PATH && viewport.width === 390) {
      await page.getByText('Własny prostokąt', { exact: true }).click();
      await calibrate(); await measure();
      await page.screenshot({ path: process.env.MIARKA_SCREENSHOT_PATH, fullPage: true });
    }
    // Unsupported active content must be rejected and invalidate the previous result.
    await page.locator('#file').setInputFiles({
      name: 'unsupported.svg', mimeType: 'image/svg+xml', buffer: unsupportedFixture,
    });
    assert.match(await page.locator('#result').textContent(), /JPG, PNG i WebP/);
    assert.equal(await page.locator('#canvases').isVisible(), false);
    assert.equal(await page.locator('#measurementPanel').isVisible(), false);
    assert.equal(await page.locator('#sendAreaBtn').getAttribute('data-area'), null);

    // Rejecting a new oversized photo must remove the previous result everywhere.
    await page.locator('#file').setInputFiles({
      name: 'oversized.jpg', mimeType: 'image/jpeg', buffer: Buffer.alloc(31 * 1024 * 1024),
    });
    assert.match(await page.locator('#result').textContent(), /30 MB/);
    assert.equal(await page.locator('#fileName').textContent(), 'oversized.jpg');
    assert.equal(await page.locator('#canvases').isVisible(), false);
    assert.equal(await page.locator('#measurementPanel').isVisible(), false);
    assert.equal(await page.locator('#sendAreaBtn').isEnabled(), false);
    assert.equal(await page.locator('#areaResult').textContent(), '—');
    assert.equal(await page.locator('#sendAreaBtn').getAttribute('data-area'), null);
    await page.locator('#file').setInputFiles({ name: 'valid-again.jpg', mimeType: 'image/jpeg', buffer: fixture });
    await page.waitForFunction(() => !document.getElementById('manualCornersBtn').disabled);
    await page.getByText('Własny prostokąt', { exact: true }).click();
    await calibrate(); await measure();
    assert.equal(await page.locator('#areaResult').textContent(), '0.24 m²');
    console.log('Browser smoke passed: ' + viewport.width + 'px, ' + (viewport.width < 500 ? 'touch' : 'mouse'));
    await page.close();
  }
  // A loaded but aborted runtime must execute a replacement script on retry.
  const retryPage = await browser.newPage();
  retryPage.on('pageerror', (error) => failures.push(error.message));
  let runtimeRequests = 0;
  await retryPage.route('https://docs.opencv.org/**', (route) => {
    runtimeRequests++;
    return route.fulfill({ contentType: 'text/javascript', body: runtimeRequests === 1
      ? 'globalThis.cv = { aborted: true };'
      : 'globalThis.cv = { imread() {}, Mat() {} };' });
  });
  await retryPage.goto(origin);
  const retryResult = await retryPage.evaluate(async () => {
    let timedOut = false;
    try { await ensureOpenCv(1000); } catch (error) { timedOut = error.message.includes('zbyt długo'); }
    const staleScripts = Array.from(document.scripts).filter((script) => script.dataset.opencvLoader === 'true').length;
    await ensureOpenCv(3000);
    return { timedOut, staleScripts, ready: typeof cv.imread === 'function' };
  });
  assert.equal(retryResult.timedOut, true);
  assert.equal(retryResult.staleScripts, 0);
  assert.equal(retryResult.ready, true);
  assert.equal(runtimeRequests, 2);
  const recoveredAfterLoss = await retryPage.evaluate(async () => {
    globalThis.cv = undefined;
    await ensureOpenCv(3000);
    return typeof cv.imread === 'function' && typeof cv.Mat === 'function';
  });
  assert.equal(recoveredAfterLoss, true);
  assert.equal(runtimeRequests, 3);
  console.log('OpenCV retries after timeout and after a previously ready runtime disappears');
  await retryPage.close();
  if (process.env.OPENCV_TEST_SCRIPT) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on('pageerror', (error) => failures.push(error.message));
    let requests = 0;
    await page.route('https://docs.opencv.org/**', (route) => {
      requests++;
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(process.env.OPENCV_TEST_SCRIPT) });
    });
    await page.goto(origin);
    assert.equal(requests, 0);
    await page.locator('#sampleBtn').click();
    await page.waitForFunction(() => !document.getElementById('manualCornersBtn').disabled);
    await page.locator('#autoDetectBtn').click();
    await page.waitForFunction(() => !document.getElementById('autoDetectBtn').disabled, null, { timeout: 30000 });
    assert.equal(await page.locator('#measurementPanel').isVisible(), true, 'real OpenCV must detect sample');
    assert.ok((await page.locator('#result').textContent()).includes('Automat proponuje wzorzec'));
    assert.equal(requests, 1);
    const difference = await page.evaluate(() => {
      const corners = Array.of({ x: 140, y: 100 }, { x: 500, y: 130 }, { x: 430, y: 420 }, { x: 170, y: 360 });
      const points = Array.of({ x: 240, y: 200 }, { x: 600, y: 300 });
      const actual = mapImagePointsToReference(corners, points, 300, 200);
      const source = cv.matFromArray(4, 1, cv.CV_32FC2, corners.flatMap((p) => Array.of(p.x, p.y)));
      const target = cv.matFromArray(4, 1, cv.CV_32FC2, Array.of(0, 0, 300, 0, 300, 200, 0, 200));
      const matrix = cv.getPerspectiveTransform(source, target);
      const input = cv.matFromArray(2, 1, cv.CV_32FC2, points.flatMap((p) => Array.of(p.x, p.y)));
      const output = new cv.Mat();
      try {
        cv.perspectiveTransform(input, output, matrix);
        return Math.max(...actual.map((p, index) => Math.hypot(p.x - output.data32F.at(index * 2), p.y - output.data32F.at(index * 2 + 1))));
      } finally {
        output.delete(); input.delete(); matrix.delete(); target.delete(); source.delete();
      }
    });
    assert.ok(difference < 0.001, 'manual homography must agree with OpenCV perspectiveTransform');
    console.log('Real OpenCV 4.13.0 detection passed on the bundled A4 sample');
    await page.close();

    // A delayed detector must never overwrite a manual calibration or newer measurements.
    const racePage = await browser.newPage();
    racePage.on('pageerror', (error) => failures.push(error.message));
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    await racePage.route('https://docs.opencv.org/**', async (route) => {
      await gate;
      return route.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(process.env.OPENCV_TEST_SCRIPT) });
    });
    await racePage.goto(origin);
    await racePage.locator('#sampleBtn').click();
    await racePage.waitForFunction(() => !document.getElementById('manualCornersBtn').disabled);
    await racePage.locator('#autoDetectBtn').click();
    await racePage.locator('#manualCornersBtn').click();
    await racePage.evaluate(() => {
      for (const point of Array.of({ x: 30, y: 32 }, { x: 643, y: 32 }, { x: 655, y: 885 }, { x: 26, y: 892 })) addCanvasPoint(point);
    });
    const manualSummary = await racePage.locator('#calibrationSummary').textContent();
    release();
    await racePage.waitForFunction(() => !document.getElementById('autoDetectBtn').disabled, null, { timeout: 30000 });
    assert.equal(await racePage.locator('#calibrationSummary').textContent(), manualSummary);
    assert.ok(!(await racePage.locator('#result').textContent()).includes('Automat proponuje'));
    console.log('Delayed OpenCV leaves newer manual calibration intact');
    await racePage.close();
  }
  assert.deepEqual(failures, Array.of(), 'uncaught browser errors');
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
