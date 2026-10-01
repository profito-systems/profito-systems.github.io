import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';

const root = process.argv.at(2) || process.cwd();
const cvRoot = fs.existsSync(path.join(root, 'miarka')) ? path.join(root, 'miarka/src/cv') : path.join(root, 'src/cv');
const geometry = {};
vm.createContext(geometry);
vm.runInContext(fs.readFileSync(path.join(cvRoot, 'detectA4.js'), 'utf8'), geometry);
vm.runInContext(fs.readFileSync(path.join(cvRoot, 'warp.js'), 'utf8'), geometry);
const p = (x, y) => ({ x, y });
const near = (actual, expected, tolerance = 1e-6) => assert.ok(Math.abs(actual - expected) <= tolerance, actual + ' != ' + expected);

test('manual homography recovers lengths and area from a tilted plane without cv', () => {
  // Independent synthetic camera projection. Reference and measurements share a plane.
  const photo = (x, y) => {
    const denominator = 1 + 0.0004 * x + 0.0006 * y;
    return p((1.8 * x + 0.2 * y + 100) / denominator, (0.1 * x + 1.5 * y + 70) / denominator);
  };
  const corners = Array.of(photo(0, 0), photo(300, 0), photo(300, 200), photo(0, 200));
  const mapped = geometry.mapImagePointsToReference(corners,
    Array.of(photo(30, 20), photo(1530, 20), photo(30, 820)), 300, 200);
  const width = Math.hypot(mapped.at(1).x - mapped.at(0).x, mapped.at(1).y - mapped.at(0).y);
  const height = Math.hypot(mapped.at(2).x - mapped.at(0).x, mapped.at(2).y - mapped.at(0).y);
  near(width, 1500);
  near(height, 800);
  near(width * height / 1e6, 1.2);
  assert.equal(geometry.cv, undefined);
});

test('all 24 orders of rotated corners retain four distinct corners', () => {
  const points = Array.of(p(200, 10), p(350, 160), p(200, 310), p(50, 160));
  function permutations(items) {
    if (items.length < 2) return Array.of(items);
    return items.flatMap((item, index) => permutations(items.filter((_, i) => i !== index)).map((rest) => Array.of(item, ...rest)));
  }
  for (const permutation of permutations(points)) {
    const ordered = geometry.orderCorners(permutation);
    assert.equal(new Set(ordered.map((point) => point.x + ':' + point.y)).size, 4);
    geometry.validateReferenceCorners(ordered);
    const mapped = geometry.mapImagePointsToReference(ordered, ordered, 100, 100);
    near(mapped.at(2).x, 100);
    near(mapped.at(2).y, 100);
  }
});

test('reject duplicates, collinear points, concave quadrilaterals and invalid sizes', () => {
  for (const points of Array.of(
    Array.of(p(0, 0), p(0, 0), p(100, 100), p(0, 100)),
    Array.of(p(0, 0), p(10, 0), p(20, 0), p(30, 0)),
    Array.of(p(0, 0), p(100, 0), p(20, 20), p(0, 100)),
  )) assert.throws(() => geometry.createReferenceTransform(geometry.orderCorners(points), 100, 100));
  assert.throws(() => geometry.createReferenceTransform(Array.of(p(0, 0), p(100, 0), p(100, 100), p(0, 100)), -1, 100));
});

test('known segment accepts any known length without pretending to correct perspective', () => {
  const corners = Array.of(p(10, 20), p(110, 20));
  const mapped = geometry.mapImagePointsToReference(corners, Array.of(p(10, 20), p(210, 20), p(10, 320)), 50, 0);
  near(mapped.at(1).x, 100);
  near(mapped.at(2).y, 150);
  assert.throws(() => geometry.mapImagePointsToReference(Array.of(p(0, 0), p(1, 0)), Array.of(p(10, 10)), 50, 0));
});

function loaderHarness() {
  const scripts = Array.of();
  const context = { setTimeout, clearTimeout, setInterval, clearInterval, Promise, console };
  context.document = {
    scripts,
    createElement() {
      const listeners = new Map();
      return {
        dataset: {},
        addEventListener(name, fn) { listeners.set(name, fn); },
        removeEventListener(name, fn) { if (listeners.get(name) === fn) listeners.delete(name); },
        dispatch(name) { listeners.get(name)?.(); },
        remove() { const index = scripts.indexOf(this); if (index >= 0) scripts.splice(index, 1); },
      };
    },
    head: { appendChild(script) { scripts.push(script); } },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(cvRoot, 'opencv-loader.js'), 'utf8'), context);
  return { context, scripts, module: { imread() {}, Mat() {} } };
}

test('script load alone does not complete readiness; delayed runtime and shared callers work', async () => {
  const { context, scripts, module } = loaderHarness();
  const first = context.ensureOpenCv(1000);
  assert.equal(first, context.ensureOpenCv(1000));
  assert.equal(scripts.length, 1);
  let finished = false;
  first.then(() => { finished = true; });
  scripts.at(0).dispatch('load');
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(finished, false);
  context.cv = module;
  await first;
  assert.equal(context.cv, module);
});

test('promise-valued cv is unwrapped before it is used', async () => {
  const { context, scripts, module } = loaderHarness();
  let resolveModule;
  context.cv = new Promise((resolve) => { resolveModule = resolve; });
  const waiting = context.ensureOpenCv(1000);
  scripts.at(0).dispatch('load');
  resolveModule(module);
  await waiting;
  assert.equal(context.cv, module);
  assert.equal(context.cv, module);
});

test('legacy OpenCV self-resolving thenable never enters a Promise assimilation loop', async () => {
  const { context, scripts } = loaderHarness();
  const legacy = {
    then(onReady) {
      setTimeout(() => {
        legacy.imread = () => {};
        legacy.Mat = () => {};
        onReady(legacy);
      }, 10);
      return legacy;
    },
  };
  context.cv = legacy;
  const waiting = context.ensureOpenCv(1000);
  scripts.at(0).dispatch('load');
  assert.equal(await waiting, undefined);
  assert.equal(context.cv, legacy);
  assert.equal(await context.ensureOpenCv(1000), undefined);
});

test('network failure removes stale script and the next attempt can succeed', async () => {
  const { context, scripts, module } = loaderHarness();
  const failed = context.ensureOpenCv(1000);
  scripts.at(0).dispatch('error');
  await assert.rejects(failed);
  assert.equal(scripts.length, 0);
  const retry = context.ensureOpenCv(1000);
  assert.equal(scripts.length, 1);
  context.cv = module;
  scripts.at(0).dispatch('load');
  await retry;
  assert.equal(context.cv, module);
});

test('readiness timeout removes the aborted module and executes a new script on retry', async () => {
  const { context, scripts, module } = loaderHarness();
  context.cv = { aborted: true };
  const waiting = context.ensureOpenCv(30);
  const firstScript = scripts.at(0);
  firstScript.dispatch('load');
  await assert.rejects(waiting, /zbyt długo/);
  assert.equal(scripts.length, 0);
  assert.equal(context.cv, undefined);
  const retry = context.ensureOpenCv(1000);
  assert.equal(scripts.length, 1);
  assert.notEqual(scripts.at(0), firstScript);
  context.cv = module;
  scripts.at(0).dispatch('load');
  await retry;
  assert.equal(context.cv, module);
});

test('late rejection from a timed-out module cannot remove the retry script or clear its runtime', async () => {
  const { context, scripts, module } = loaderHarness();
  let rejectOldModule;
  context.cv = new Promise((_, reject) => { rejectOldModule = reject; });
  const waiting = context.ensureOpenCv(30);
  scripts.at(0).dispatch('load');
  await assert.rejects(waiting, /zbyt długo/);
  const retry = context.ensureOpenCv(1000);
  const retryScript = scripts.at(0);
  context.cv = module;
  rejectOldModule(new Error('late aborted runtime'));
  await Promise.resolve();
  assert.equal(context.cv, module);
  assert.equal(scripts.at(0), retryScript);
  retryScript.dispatch('load');
  await retry;
});

test('rejected runtime promise cannot poison subsequent attempts', async () => {
  const { context, scripts, module } = loaderHarness();
  context.cv = Promise.reject(new Error('wasm download failed'));
  await assert.rejects(context.ensureOpenCv(1000));
  assert.equal(context.cv, undefined);
  assert.equal(scripts.length, 0);
  const retry = context.ensureOpenCv(1000);
  context.cv = module;
  scripts.at(0).dispatch('load');
  await retry;
  assert.equal(context.cv, module);
});

function appHarness() {
  const elements = new Map();
  const images = Array.of();
  const revoked = Array.of();
  const canvasContext = new Proxy({}, { get: () => () => {} });
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      const listeners = new Map();
      elements.set(id, {
        textContent: '', value: '', dataset: {}, style: {}, disabled: false,
        width: 1000, height: 800, clientWidth: 1000,
        classList: {
          add: (name) => classes.add(name), remove: (name) => classes.delete(name),
          contains: (name) => classes.has(name),
          toggle(name, on) { if (on) classes.add(name); else classes.delete(name); },
        },
        addEventListener: (name, handler) => listeners.set(name, handler),
        dispatch: (name) => listeners.get(name)?.(),
        getContext: () => canvasContext,
      });
    }
    return elements.get(id);
  }
  const context = {
    console, setTimeout, clearTimeout,
    document: {
      getElementById: element,
      querySelector: () => ({ value: 'a4' }),
      querySelectorAll: () => Array.of(),
    },
    window: { addEventListener() {}, location: { href: '' } },
    URL: { createObjectURL: () => 'blob:' + images.length, revokeObjectURL: (url) => revoked.push(url) },
    Image: class { constructor() { this.naturalWidth = 1000; this.naturalHeight = 800; images.push(this); } },
    localStorage: { setItem() { throw new Error('Invalidated result must not be transferred'); } },
  };
  vm.createContext(context);
  const appPath = path.join(root, fs.existsSync(path.join(root, 'miarka')) ? 'miarka/app.js' : 'public/app.js');
  vm.runInContext(fs.readFileSync(appPath, 'utf8'), context);
  return { context, element, images, revoked, evaluate: (code) => vm.runInContext(code, context) };
}

test('oversized upload clears the previous photo, measurement, export and planner handoff', () => {
  const app = appHarness();
  app.evaluate('currentImage = { old: true }; activeGeometry = { widthMm: 300, heightMm: 200 }; measuredMm = { width: 600, height: 400 }; updateArea();');
  assert.equal(app.element('sendAreaBtn').disabled, false);
  const version = app.evaluate('calibrationVersion');
  app.context.loadImageFile({ name: 'oversized.jpg', size: 31 * 1024 * 1024 });
  assert.equal(app.evaluate('currentImage'), null);
  assert.equal(app.evaluate('activeGeometry'), null);
  assert.equal(app.evaluate('calibrationVersion'), version + 1);
  assert.equal(app.element('canvases').classList.contains('is-hidden'), true);
  assert.equal(app.element('measurementPanel').classList.contains('is-hidden'), true);
  assert.equal(app.element('sendAreaBtn').disabled, true);
  assert.equal(app.element('sendAreaBtn').dataset.area, undefined);
  assert.equal(app.element('areaResult').textContent, '—');
  assert.equal(app.element('fileName').textContent, 'oversized.jpg');
  assert.match(app.element('result').textContent, /30 MB/);
  app.element('exportPhotoBtn').dispatch('click');
  app.element('sendAreaBtn').dispatch('click');
  assert.equal(app.context.window.location.href, '');
});

test('oversized selection cancels in-flight image callbacks and a later valid photo can load', () => {
  const app = appHarness();
  app.context.loadImageFile({ name: 'pending.jpg', size: 1000 });
  const pending = app.images.at(0);
  app.context.loadImageFile({ name: 'oversized.jpg', size: 31 * 1024 * 1024 });
  assert.ok(app.revoked.includes(pending.src));
  pending.onload();
  pending.onerror();
  assert.equal(app.evaluate('currentImage'), null);
  assert.match(app.element('result').textContent, /30 MB/);
  app.context.loadImageFile({ name: 'valid.jpg', size: 1000 });
  const valid = app.images.at(-1);
  valid.onload();
  assert.equal(app.evaluate('currentImage'), valid);
  assert.equal(app.element('manualCornersBtn').disabled, false);
  assert.equal(app.element('canvases').classList.contains('is-hidden'), false);
  assert.equal(app.element('sendAreaBtn').disabled, true);
});
