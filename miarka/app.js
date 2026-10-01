const fileInput = document.getElementById('file');
const cameraInput = document.getElementById('cameraFile');
const fileNameEl = document.getElementById('fileName');
const inputCanvas = document.getElementById('inputCanvas');
const warpedCanvas = document.getElementById('warpedCanvas');
const canvasesEl = document.getElementById('canvases');
const resultEl = document.getElementById('result');
const autoBtn = document.getElementById('autoDetectBtn');
const manualCornersBtn = document.getElementById('manualCornersBtn');
const sampleBtn = document.getElementById('sampleBtn');
const customSizeFields = document.getElementById('customSizeFields');
const customLong = document.getElementById('customLong');
const customShort = document.getElementById('customShort');
const cardPrivacy = document.getElementById('cardPrivacy');
const measurementPanel = document.getElementById('measurementPanel');
const calibrationSummary = document.getElementById('calibrationSummary');
const referencePreviewTitle = document.getElementById('referencePreviewTitle');
const canvasHelp = document.getElementById('canvasHelp');
const measureWidthBtn = document.getElementById('measureWidthBtn');
const measureHeightBtn = document.getElementById('measureHeightBtn');
const clearMeasuresBtn = document.getElementById('clearMeasuresBtn');
const widthResult = document.getElementById('widthResult');
const heightResult = document.getElementById('heightResult');
const areaResult = document.getElementById('areaResult');
const sendAreaBtn = document.getElementById('sendAreaBtn');
const brickSizeFields = document.getElementById('brickSizeFields');
const brickFace = document.getElementById('brickFace');
const knownLengthFields = document.getElementById('knownLengthFields');
const knownLength = document.getElementById('knownLength');
const referenceTip = document.getElementById('referenceTip');
const referencePreviewCard = document.getElementById('referencePreviewCard');
const measurementWarning = document.getElementById('measurementWarning');
const qualityNote = document.getElementById('qualityNote');
const swapReferenceBtn = document.getElementById('swapReferenceBtn');
const exportPhotoBtn = document.getElementById('exportPhotoBtn');
const inputFrame = document.getElementById('inputFrame');
const zoomValue = document.getElementById('zoomValue');
const undoPointBtn = document.getElementById('undoPointBtn');

let currentImage = null;
let activeObjectUrl = null;
let referenceCorners = null;
let activeGeometry = null;
let manualCornerMode = false;
let manualCorners = [];
let measureMode = null;
let measurePoints = { width: [], height: [] };
let measuredMm = { width: null, height: null };
let calibrationVersion = 0;
let autoRunning = false;
let referenceSidesSwapped = false;
let zoom = 1;
let pointerAction = null;
const dimensionDrafts = new Map();
const MAX_FILE_BYTES = 30 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 60 * 1000 * 1000;
const SUPPORTED_IMAGE_TYPES = new Set(Array.of('image/jpeg', 'image/png', 'image/webp'));
const brickSizes = {
  'uk-face': { width: 215, height: 65 }, 'uk-top': { width: 215, height: 102.5 },
  'uk-end': { width: 102.5, height: 65 }, 'pl-face': { width: 250, height: 65 },
  'pl-top': { width: 250, height: 120 }, 'pl-end': { width: 120, height: 65 },
};

function isSupportedImageFile(file) {
  const type = (file.type || '').toLowerCase();
  if (SUPPORTED_IMAGE_TYPES.has(type)) return true;
  return !type && /\.(?:jpe?g|png|webp)$/i.test(file.name || '');
}

function releaseWorkingImage() {
  if (currentImage && typeof currentImage.getContext === 'function') {
    currentImage.width = 1;
    currentImage.height = 1;
  }
  currentImage = null;
  inputCanvas.width = 1;
  inputCanvas.height = 1;
}

function setStatus(message, tone = '') {
  resultEl.textContent = message;
  resultEl.className = ('status ' + tone).trim();
}

function selectedReferenceType() {
  return document.querySelector('input[name="referenceType"]:checked').value;
}

function referenceSpec() {
  const type = selectedReferenceType();
  const presets = {
    a4: { label: 'A4', longSideMm: 297, shortSideMm: 210, minAreaShare: 0.02 },
    a5: { label: 'A5', longSideMm: 210, shortSideMm: 148, minAreaShare: 0.01 },
    card: { label: 'karta ID-1', longSideMm: 85.6, shortSideMm: 53.98, minAreaShare: 0.003 },
  };
  if (presets[type]) return { key: type, aspectTolerance: 0.42, ...presets[type] };
  if (type === 'line') {
    const length = Number(knownLength.value);
    return Number.isFinite(length) && length > 0
      ? { key: type, label: 'znany odcinek', longSideMm: length, shortSideMm: null } : null;
  }
  const longSideMm = Number(customLong.value), shortSideMm = Number(customShort.value);
  if (!Number.isFinite(longSideMm) || !Number.isFinite(shortSideMm) || longSideMm <= 0 || shortSideMm <= 0) return null;
  const labels = { brick: 'wybrana powierzchnia cegły', block: 'pustak lub płytka', custom: 'własny prostokąt' };
  return { key: type, label: labels[type], longSideMm: Math.max(longSideMm, shortSideMm),
    shortSideMm: Math.min(longSideMm, shortSideMm), minAreaShare: 0.004, aspectTolerance: 0.42 };
}

function syncImageControls() {
  autoBtn.disabled = !currentImage || autoRunning || selectedReferenceType() === 'line';
  manualCornersBtn.disabled = !currentImage;
  undoPointBtn.disabled = !(manualCornerMode ? manualCorners.length : measureMode ? measurePoints[measureMode].length : false);
}

function updateZoom(next = zoom) {
  zoom = Math.max(1, Math.min(6, next));
  const fitWidth = Math.min(inputCanvas.width, inputFrame.clientWidth - 2);
  inputCanvas.style.width = Math.max(1, fitWidth * zoom) + 'px';
  inputCanvas.style.height = 'auto';
  zoomValue.textContent = Math.round(zoom * 100) + '%';
}

function resetCalibration() {
  calibrationVersion++;
  referenceSidesSwapped = false;
  pointerAction = null;
  inputCanvas.classList.remove('is-interactive');
  referencePreviewCard.classList.remove('is-hidden');
  warpedCanvas.getContext('2d').clearRect(0, 0, warpedCanvas.width, warpedCanvas.height);
  qualityNote.textContent = '';
  referenceCorners = null;
  activeGeometry = null;
  manualCornerMode = false;
  manualCorners = [];
  measureMode = null;
  measurePoints = { width: [], height: [] };
  measuredMm = { width: null, height: null };
  measurementPanel.classList.add('is-hidden');
  widthResult.textContent = '—';
  heightResult.textContent = '—';
  areaResult.textContent = '—';
  sendAreaBtn.disabled = true;
  delete sendAreaBtn.dataset.area;
  drawInputOverlay();
  syncImageControls();
}

function applyBrickSize() {
  const size = brickSizes[brickFace.value];
  customLong.value = size.width;
  customShort.value = size.height;
  dimensionDrafts.set('brick', { width: String(size.width), height: String(size.height) });
}

function updateReferenceUi() {
  const type = selectedReferenceType();
  customSizeFields.classList.toggle('is-hidden', !Array.of('brick', 'block', 'custom').includes(type));
  brickSizeFields.classList.toggle('is-hidden', type !== 'brick');
  knownLengthFields.classList.toggle('is-hidden', type !== 'line');
  cardPrivacy.hidden = type !== 'card';
  if (type === 'brick') applyBrickSize();
  else if (type === 'custom' || type === 'block') {
    const draft = dimensionDrafts.get(type);
    customLong.value = draft?.width || '';
    customShort.value = draft?.height || '';
  }
  const tips = {
    brick: 'Wymiary cegieł są nominalne i zależą od formatu. Sprawdź swój egzemplarz, popraw wartości poniżej i wskaż tylko wybraną powierzchnię, bez fugi. Cegła w ścianie skaluje tę ścianę; jej górna powierzchnia nad podłogą nie skaluje podłogi.',
    block: 'Pustaki i płytki nie mają jednego wspólnego rozmiaru. Wpisz rzeczywiste wymiary widocznej prostokątnej powierzchni z pomiaru lub specyfikacji produktu.',
    custom: 'Użyj dokładnych wymiarów widocznego prostokąta. Telefon wymaga wymiarów konkretnego modelu bez etui; przypadkowa książka lub pudełko nie ma standardowego rozmiaru.',
    line: 'Znany odcinek działa przy zdjęciu na wprost, w jednej płaszczyźnie. Nie koryguje perspektywy. Dla monet wpisz średnicę konkretnej monety. Do zdjęcia pod kątem wybierz prostokąt i cztery narożniki.',
  };
  referenceTip.textContent = tips[type] || '';
  referenceTip.classList.toggle('is-hidden', !tips[type]);
  manualCornersBtn.textContent = type === 'line' ? 'Wskaż 2 końce znanego odcinka' : 'Wskaż 4 narożniki ręcznie';
  resetCalibration();
  if (currentImage) setStatus('Wzorzec zmieniony. Skalibruj zdjęcie ponownie.', 'is-warning');
}

document.querySelectorAll('input[name="referenceType"]').forEach((input) => {
  input.addEventListener('change', updateReferenceUi);
});
brickFace.addEventListener('change', () => { applyBrickSize(); resetCalibration(); });
for (const input of Array.of(customLong, customShort)) {
  input.addEventListener('input', () => {
    dimensionDrafts.set(selectedReferenceType(), { width: customLong.value, height: customShort.value });
    resetCalibration();
  });
}
knownLength.addEventListener('input', resetCalibration);
document.getElementById('zoomInBtn').addEventListener('click', () => updateZoom(zoom + 0.5));
document.getElementById('zoomOutBtn').addEventListener('click', () => updateZoom(zoom - 0.5));
document.getElementById('resetZoomBtn').addEventListener('click', () => updateZoom(1));
window.addEventListener('resize', () => updateZoom());
undoPointBtn.addEventListener('click', () => {
  if (manualCornerMode) manualCorners.pop();
  else if (measureMode) measurePoints[measureMode].pop();
  drawInputOverlay();
  syncImageControls();
});

function loadImageFile(file) {
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = null;
  releaseWorkingImage();
  fileNameEl.textContent = file.name || 'Wybrane zdjęcie';
  canvasesEl.classList.add('is-hidden');
  resetCalibration();
  if (!isSupportedImageFile(file)) {
    setStatus('Obsługiwane są zdjęcia JPG, PNG i WebP. Wybierz zwykłe zdjęcie zamiast SVG, GIF lub dokumentu.', 'is-error');
    return;
  }
  if (!Number.isFinite(file.size) || file.size <= 0) {
    setStatus('Plik jest pusty albo nie można odczytać jego rozmiaru.', 'is-error');
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    setStatus('Zdjęcie przekracza 30 MB. Wybierz mniejszy plik.', 'is-error');
    return;
  }
  setStatus('Wczytuję zdjęcie…');

  const img = new Image();
  img.decoding = 'async';
  const objectUrl = URL.createObjectURL(file);
  activeObjectUrl = objectUrl;
  img.src = objectUrl;

  img.onload = () => {
    if (activeObjectUrl !== objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    activeObjectUrl = null;

    const naturalWidth = img.naturalWidth;
    const naturalHeight = img.naturalHeight;
    const pixels = naturalWidth * naturalHeight;
    if (!Number.isFinite(pixels) || naturalWidth <= 0 || naturalHeight <= 0) {
      img.onload = null;
      img.onerror = null;
      setStatus('Nie udało się odczytać wymiarów zdjęcia.', 'is-error');
      return;
    }
    if (pixels > MAX_IMAGE_PIXELS) {
      img.onload = null;
      img.onerror = null;
      setStatus('Zdjęcie ma zbyt wysoką rozdzielczość do bezpiecznej pracy na telefonie. Użyj zdjęcia do 60 megapikseli albo zmniejsz je przed wczytaniem.', 'is-error');
      return;
    }

    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
    const targetWidth = Math.max(1, Math.round(naturalWidth * scale));
    const targetHeight = Math.max(1, Math.round(naturalHeight * scale));
    const workingImage = document.createElement('canvas');
    workingImage.width = targetWidth;
    workingImage.height = targetHeight;
    workingImage.getContext('2d').drawImage(img, 0, 0, targetWidth, targetHeight);
    img.onload = null;
    img.onerror = null;

    inputCanvas.width = targetWidth;
    inputCanvas.height = targetHeight;
    currentImage = workingImage;
    drawInputOverlay();
    canvasesEl.classList.remove('is-hidden');
    syncImageControls();
    updateZoom(1);
    setStatus(selectedReferenceType() === 'line'
      ? 'Zdjęcie gotowe. Wskaż dwa końce znanego odcinka.'
      : 'Zdjęcie gotowe. Spróbuj automatu albo wskaż cztery narożniki ręcznie.', 'is-success');
  };

  img.onerror = () => {
    if (activeObjectUrl !== objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    activeObjectUrl = null;
    fileNameEl.textContent = 'Nie udało się wczytać pliku';
    setStatus('Nie udało się otworzyć zdjęcia. Spróbuj JPG, PNG lub WebP zamiast HEIC.', 'is-error');
  };
}

function drawLine(ctx, points, color, label) {
  if (!points.length) return;

  ctx.save();
  ctx.lineWidth = Math.max(3, inputCanvas.width / 500);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.font = Math.max(18, inputCanvas.width / 45) + 'px system-ui';

  points.forEach((point) => {
    ctx.beginPath();
    ctx.arc(point.x, point.y, Math.max(7, inputCanvas.width / 170), 0, Math.PI * 2);
    ctx.fill();
  });

  if (points.length === 2) {
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    ctx.lineTo(points[1].x, points[1].y);
    ctx.stroke();
    const midX = (points[0].x + points[1].x) / 2;
    const midY = (points[0].y + points[1].y) / 2;
    ctx.fillText(label, midX + 10, midY - 10);
  }

  ctx.restore();
}

function drawBaseImage() {
  const ctx = inputCanvas.getContext('2d');
  ctx.clearRect(0, 0, inputCanvas.width, inputCanvas.height);
  if (currentImage) {
    ctx.drawImage(currentImage, 0, 0, inputCanvas.width, inputCanvas.height);
  }
}

function drawInputOverlay() {
  drawBaseImage();
  const ctx = inputCanvas.getContext('2d');

  if (referenceCorners) {
    ctx.save();
    ctx.strokeStyle = '#38bdf8';
    ctx.fillStyle = '#38bdf8';
    ctx.lineWidth = Math.max(3, inputCanvas.width / 500);
    ctx.beginPath();
    referenceCorners.forEach((point, index) => {
      if (index === 0) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    });
    ctx.closePath();
    ctx.stroke();
    referenceCorners.forEach((point, index) => {
      ctx.font = Math.max(18, inputCanvas.width / 45) + 'px system-ui';
      ctx.fillText(String(index + 1), point.x + 12, point.y - 12);
      ctx.beginPath();
      ctx.arc(point.x, point.y, Math.max(7, inputCanvas.width / 170), 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.restore();
  }

  if (manualCorners.length) {
    drawLine(ctx, manualCorners.slice(0, 2), '#f59e0b', 'wzorzec');
    if (manualCorners.length > 2) {
      ctx.save();
      ctx.fillStyle = '#f59e0b';
      manualCorners.forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, Math.max(7, inputCanvas.width / 170), 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }
  }

  drawLine(ctx, measurePoints.width, '#22c55e', measuredMm.width ? widthResult.textContent : 'szerokość');
  drawLine(ctx, measurePoints.height, '#f97316', measuredMm.height ? heightResult.textContent : 'wysokość');
}

function canvasPointFromEvent(event) {
  const rect = inputCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * inputCanvas.width / rect.width,
    y: (event.clientY - rect.top) * inputCanvas.height / rect.height,
  };
}

function applyReferenceCorners(corners, preserveMeasures = false, automatic = false) {
  const spec = referenceSpec();
  if (!spec) throw new Error('Podaj poprawne wymiary wzorca.');
  const ordered = spec.key === 'line' ? corners.map((p) => ({ ...p })) : orderCorners(corners);
  let geometry;
  if (spec.key === 'line') {
    if (ordered.length !== 2) throw new Error('Wskaż dwa końce znanego odcinka.');
    mapImagePointsToReference(ordered, ordered, spec.longSideMm, 0);
    geometry = { widthMm: spec.longSideMm, heightMm: 0, kind: 'line' };
  } else {
    geometry = referenceOutputGeometry(ordered, spec.longSideMm, spec.shortSideMm, 4);
    if (referenceSidesSwapped) {
      const width = geometry.widthMm;
      geometry.widthMm = geometry.heightMm;
      geometry.heightMm = width;
    }
    createReferenceTransform(ordered, geometry.widthMm, geometry.heightMm);
    const previewScale = Math.min(4, 720 / Math.max(geometry.widthMm, geometry.heightMm));
    warpedCanvas.width = Math.max(2, Math.round(geometry.widthMm * previewScale));
    warpedCanvas.height = Math.max(2, Math.round(geometry.heightMm * previewScale));
    drawBaseImage();
    warpReference(inputCanvas, ordered, warpedCanvas);
  }
  referenceCorners = ordered;
  activeGeometry = geometry;
  referencePreviewCard.classList.toggle('is-hidden', spec.key === 'line');
  swapReferenceBtn.classList.toggle('is-hidden', spec.key === 'line' || spec.longSideMm === spec.shortSideMm);
  referencePreviewTitle.textContent = 'Wyprostowany wzorzec: ' + spec.label;
  calibrationSummary.textContent = spec.key === 'line'
    ? 'Skala odcinka: ' + spec.longSideMm.toFixed(2) + ' mm. Bez korekcji perspektywy.'
    : 'Kalibracja: ' + spec.label + '. Bok 1–2: ' + geometry.widthMm.toFixed(2) +
      ' mm; bok 2–3: ' + geometry.heightMm.toFixed(2) + ' mm. Sprawdź przypisanie boków na zdjęciu.';
  measurementWarning.textContent = spec.key === 'line'
    ? 'Ten tryb zakłada zdjęcie na wprost i jednakową skalę. Nie koryguje perspektywy. Sprawdź drugi znany wymiar; jeśli się nie zgadza, użyj czterech narożników.'
    : 'Wzorzec i mierzone punkty muszą leżeć na jednej płaszczyźnie. Karta na podłodze nie skaluje ściany. Sprawdź drugi znany wymiar przed użyciem wyniku.';
  const shortestEdge = Math.min(...ordered.map((p, i) => pointDistance(p, ordered.at((i + 1) % ordered.length))));
  const relativeEdge = shortestEdge / Math.max(inputCanvas.width, inputCanvas.height);
  qualityNote.textContent = shortestEdge < 40 || relativeEdge < 0.03
    ? 'Mały wzorzec zwiększa wpływ błędu punktów. Zrób bliższe zdjęcie albo użyj większego przedmiotu.'
    : 'Powiększ zdjęcie, aby dokładnie dopasować punkty. Po kalibracji możesz przeciągać narożniki i końce pomiarów.';
  measurementPanel.classList.remove('is-hidden');
  manualCornerMode = false;
  manualCorners = Array.of();
  measureMode = null;
  if (!preserveMeasures) {
    measurePoints = { width: Array.of(), height: Array.of() };
    measuredMm = { width: null, height: null };
    widthResult.textContent = '—';
    heightResult.textContent = '—';
    areaResult.textContent = '—';
    sendAreaBtn.disabled = true;
    delete sendAreaBtn.dataset.area;
  } else {
    for (const key of Array.of('width', 'height')) {
      if (measurePoints[key].length === 2) measureDistance(key);
    }
  }
  canvasHelp.textContent = 'Wybierz szerokość albo wysokość i wskaż dwa końce odcinka. Punkty możesz przeciągać.';
  setStatus(automatic ? 'Automat proponuje wzorzec. Sprawdź zaznaczony prostokąt i przypisanie boków przed pomiarem.'
    : 'Wzorzec skalibrowany. Możesz mierzyć odcinki na tej samej płaszczyźnie.', automatic ? 'is-warning' : 'is-success');
  inputCanvas.classList.add('is-interactive');
  syncImageControls();
  drawInputOverlay();
}

swapReferenceBtn.addEventListener('click', () => {
  calibrationVersion++;
  const old = referenceSidesSwapped;
  try {
    referenceSidesSwapped = !old;
    applyReferenceCorners(referenceCorners, true);
  } catch (error) {
    referenceSidesSwapped = old;
    setStatus(error.message, 'is-error');
  }
});

function handleImageInput(event) {
  const file = event.target.files.item(0);
  if (file) loadImageFile(file);
  event.target.value = '';
}

fileInput.addEventListener('change', handleImageInput);
cameraInput.addEventListener('change', handleImageInput);

sampleBtn.addEventListener('click', async () => {
  document.querySelector('input[name="referenceType"][value="a4"]').checked = true;
  updateReferenceUi();
  sampleBtn.disabled = true;
  setStatus('Wczytuję przykładowe zdjęcie A4…');
  const version = calibrationVersion;

  try {
    const response = await fetch('sample-a4.jpg');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const blob = await response.blob();
    if (version !== calibrationVersion) return;
    loadImageFile(new File([blob], 'wzorzec-miarka-a4.jpg', { type: blob.type }));
  } catch (error) {
    console.error(error);
    setStatus('Nie udało się wczytać wzorca. Spróbuj ponownie.', 'is-error');
  } finally {
    sampleBtn.disabled = false;
  }
});

autoBtn.addEventListener('click', async () => {
  if (!currentImage || autoRunning) return;
  const spec = referenceSpec();
  if (!spec || spec.key === 'line') {
    setStatus('Podaj poprawne wymiary prostokątnego wzorca albo wybierz tryb ręczny odcinka.', 'is-warning');
    return;
  }
  const version = calibrationVersion;
  const image = currentImage;
  autoRunning = true;
  syncImageControls();
  autoBtn.textContent = 'Uruchamiam automat…';
  setStatus('Uruchamiam automatyczne wykrywanie. Pomiar ręczny jest dostępny od razu.');
  try {
    await ensureOpenCv();
    if (version !== calibrationVersion || image !== currentImage) return;
    setStatus('Szukam prostokąta. Sprawdź potem, czy zaznaczony wzorzec jest właściwy.');
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    if (version !== calibrationVersion || image !== currentImage) return;
    const scan = document.createElement('canvas');
    const scale = Math.min(1, 1200 / Math.max(inputCanvas.width, inputCanvas.height));
    scan.width = Math.max(1, Math.round(inputCanvas.width * scale));
    scan.height = Math.max(1, Math.round(inputCanvas.height * scale));
    scan.getContext('2d').drawImage(currentImage, 0, 0, scan.width, scan.height);
    const corners = await detectReference(scan, spec.longSideMm / spec.shortSideMm, {
      minAreaShare: spec.minAreaShare, aspectTolerance: spec.aspectTolerance,
    });
    if (version !== calibrationVersion || image !== currentImage) return;
    if (!corners) {
      setStatus('Automat nie znalazł wzorca. Wskaż jego cztery narożniki ręcznie.', 'is-warning');
      return;
    }
    referenceSidesSwapped = false;
    applyReferenceCorners(corners.map((p) => ({ x: p.x * inputCanvas.width / scan.width, y: p.y * inputCanvas.height / scan.height })), false, true);
  } catch (error) {
    console.error(error);
    if (version === calibrationVersion && image === currentImage) {
      setStatus('Nie udało się uruchomić automatu. Wskaż wzorzec ręcznie — ten tryb nie wymaga OpenCV.', 'is-error');
    }
  } finally {
    autoRunning = false;
    autoBtn.textContent = 'Wykryj wzorzec automatycznie';
    syncImageControls();
  }
});

manualCornersBtn.addEventListener('click', () => {
  if (!currentImage) return;
  if (!referenceSpec()) {
    setStatus('Najpierw wpisz poprawne wymiary wybranego wzorca.', 'is-error');
    return;
  }
  resetCalibration();
  manualCornerMode = true;
  manualCorners = [];
  const count = selectedReferenceType() === 'line' ? 2 : 4;
  canvasHelp.textContent = count === 2 ? 'Wskaż dwa końce znanego odcinka.' : 'Wskaż cztery narożniki widocznej powierzchni. Kolejność nie ma znaczenia.';
  setStatus('Tryb ręczny: pozostało ' + count + ' punktów. Powiększ zdjęcie dla dokładności.', 'is-warning');
  inputCanvas.classList.add('is-interactive');
  syncImageControls();
  inputFrame.scrollIntoView({ block: 'center', behavior: 'instant' });
});

function measureDistance(key) {
  const points = measurePoints[key];
  if (!referenceCorners || !activeGeometry || points.length !== 2) return;

  let distanceMm;
  try {
    const mapped = mapImagePointsToReference(referenceCorners, points, activeGeometry.widthMm, activeGeometry.heightMm);
    distanceMm = Math.hypot(mapped.at(1).x - mapped.at(0).x, mapped.at(1).y - mapped.at(0).y);
    if (!Number.isFinite(distanceMm) || distanceMm <= 0) throw new Error('Wskaż dwa różne końce odcinka.');
  } catch (error) {
    measuredMm[key] = null;
    (key === 'width' ? widthResult : heightResult).textContent = '—';
    updateArea();
    setStatus(error.message, 'is-error');
    return false;
  }
  measuredMm[key] = distanceMm;
  const target = key === 'width' ? widthResult : heightResult;
  target.textContent = distanceMm >= 1000
    ? (distanceMm / 1000).toFixed(3) + ' m'
    : distanceMm.toFixed(1) + ' mm';

  updateArea();
  return true;
}

function updateArea() {
  if (!measuredMm.width || !measuredMm.height) {
    areaResult.textContent = '—';
    sendAreaBtn.disabled = true;
    delete sendAreaBtn.dataset.area;
    return;
  }

  const areaM2 = measuredMm.width * measuredMm.height / 1000000;
  if (!Number.isFinite(areaM2) || areaM2 <= 0) {
    areaResult.textContent = '—';
    sendAreaBtn.disabled = true;
    delete sendAreaBtn.dataset.area;
    return;
  }
  areaResult.textContent = areaM2.toFixed(2) + ' m²';
  sendAreaBtn.dataset.area = areaM2.toFixed(3);
  sendAreaBtn.disabled = false;
}

function beginMeasure(key) {
  if (!referenceCorners || !activeGeometry) {
    setStatus('Najpierw skalibruj wzorzec.', 'is-warning');
    return;
  }

  calibrationVersion++;
  measureMode = key;
  measurePoints[key] = [];
  measuredMm[key] = null;
  (key === 'width' ? widthResult : heightResult).textContent = '—';
  updateArea();
  inputCanvas.classList.add('is-interactive');
  const label = key === 'width' ? 'szerokości' : 'wysokości';
  canvasHelp.textContent = 'Kliknij pierwszy i drugi koniec ' + label + '.';
  setStatus('Pomiar ' + label + ': wskaż dwa punkty na zdjęciu.', 'is-warning');
  syncImageControls();
  drawInputOverlay();
  inputFrame.scrollIntoView({ block: 'center', behavior: 'instant' });
}

measureWidthBtn.addEventListener('click', () => beginMeasure('width'));
measureHeightBtn.addEventListener('click', () => beginMeasure('height'));

clearMeasuresBtn.addEventListener('click', () => {
  measureMode = null;
  measurePoints = { width: [], height: [] };
  measuredMm = { width: null, height: null };
  widthResult.textContent = '—';
  heightResult.textContent = '—';
  areaResult.textContent = '—';
  sendAreaBtn.disabled = true;
  delete sendAreaBtn.dataset.area;
  inputCanvas.classList.add('is-interactive');
  canvasHelp.textContent = 'Wybierz szerokość albo wysokość, następnie kliknij dwa końce mierzonego odcinka na zdjęciu.';
  syncImageControls();
  drawInputOverlay();
});

function addCanvasPoint(point) {
  if (manualCornerMode) {
    manualCorners.push(point);
    const count = selectedReferenceType() === 'line' ? 2 : 4;
    if (manualCorners.length === count) {
      try { applyReferenceCorners(manualCorners); }
      catch (error) {
        manualCorners.pop();
        setStatus(error.message + ' Popraw punkty lub wskaż ostatni narożnik ponownie.', 'is-error');
      }
    } else setStatus('Pozostało ' + (count - manualCorners.length) + ' punktów wzorca.', 'is-warning');
  } else if (measureMode) {
    const key = measureMode;
    const points = measurePoints[key];
    points.push(point);
    if (points.length === 2) {
      const valid = measureDistance(key);
      measureMode = null;
      if (valid) {
        canvasHelp.textContent = 'Odcinek zapisany. Możesz przeciągać punkty lub zmierzyć drugi bok.';
        setStatus('Odcinek zmierzony. Pole powierzchni wymaga szerokości i wysokości prostokąta.', 'is-success');
      }
    }
  }
  syncImageControls();
  drawInputOverlay();
}

inputCanvas.addEventListener('pointerdown', (event) => {
  if (!currentImage || (event.pointerType === 'mouse' && event.button !== 0)) return;
  const point = canvasPointFromEvent(event);
  const threshold = 14 * inputCanvas.width / inputCanvas.getBoundingClientRect().width;
  let handle = null;
  if (!manualCornerMode && !measureMode) {
    const groups = Array.of({ key: 'reference', points: referenceCorners || Array.of() },
      { key: 'width', points: measurePoints.width }, { key: 'height', points: measurePoints.height });
    let best = threshold;
    for (const group of groups) group.points.forEach((candidate, index) => {
      const distance = pointDistance(candidate, point);
      if (distance < best) { best = distance; handle = { key: group.key, index, original: { ...candidate } }; }
    });
  }
  pointerAction = { handle, clientX: event.clientX, clientY: event.clientY,
    scrollLeft: inputFrame.scrollLeft, scrollTop: inputFrame.scrollTop, moved: false };
  if (handle) calibrationVersion++;
  inputCanvas.setPointerCapture(event.pointerId);
});

inputCanvas.addEventListener('pointermove', (event) => {
  if (!pointerAction) return;
  const action = pointerAction;
  const dx = event.clientX - action.clientX, dy = event.clientY - action.clientY;
  if (Math.hypot(dx, dy) > 5) action.moved = true;
  if (action.handle) {
    const point = canvasPointFromEvent(event);
    point.x = Math.max(0, Math.min(inputCanvas.width - 1, point.x));
    point.y = Math.max(0, Math.min(inputCanvas.height - 1, point.y));
    const points = action.handle.key === 'reference' ? referenceCorners : measurePoints[action.handle.key];
    points.splice(action.handle.index, 1, point);
    drawInputOverlay();
  } else if (action.moved) {
    inputFrame.scrollLeft = action.scrollLeft - dx;
    inputFrame.scrollTop = action.scrollTop - dy;
  }
});

function finishPointer(event, cancelled = false) {
  if (!pointerAction) return;
  const action = pointerAction;
  pointerAction = null;
  if (action.handle) {
    const handle = action.handle;
    const points = handle.key === 'reference' ? referenceCorners : measurePoints[handle.key];
    if (cancelled) points.splice(handle.index, 1, handle.original);
    try {
      if (handle.key === 'reference') applyReferenceCorners(referenceCorners, true);
      else measureDistance(handle.key);
    } catch (error) {
      points.splice(handle.index, 1, handle.original);
      applyReferenceCorners(referenceCorners, true);
      setStatus(error.message, 'is-error');
    }
    drawInputOverlay();
  } else if (!cancelled && !action.moved) addCanvasPoint(canvasPointFromEvent(event));
  if (inputCanvas.hasPointerCapture(event.pointerId)) inputCanvas.releasePointerCapture(event.pointerId);
}
inputCanvas.addEventListener('pointerup', (event) => finishPointer(event));
inputCanvas.addEventListener('pointercancel', (event) => finishPointer(event, true));

exportPhotoBtn.addEventListener('click', () => {
  if (!currentImage || !activeGeometry) return;
  const output = document.createElement('canvas');
  const captionHeight = Math.max(130, Math.round(inputCanvas.width / 9));
  output.width = inputCanvas.width;
  output.height = inputCanvas.height + captionHeight;
  const ctx = output.getContext('2d');
  drawInputOverlay();
  ctx.drawImage(inputCanvas, 0, 0);
  ctx.fillStyle = '#08111f';
  ctx.fillRect(0, inputCanvas.height, output.width, captionHeight);
  ctx.fillStyle = '#f8fafc';
  ctx.font = Math.max(16, Math.round(output.width / 55)) + 'px system-ui';
  const lines = Array.of('Profito — pomiar orientacyjny ze zdjęcia',
    'Szerokość: ' + widthResult.textContent + ' | Wysokość: ' + heightResult.textContent + ' | Pole: ' + areaResult.textContent,
    'Wzorzec: ' + referenceSpec().label + ' | Jedna płaszczyzna; wynik sprawdź miarką.');
  lines.forEach((line, index) => ctx.fillText(line, 18, inputCanvas.height + captionHeight * (index + 1) / 4, output.width - 36));
  output.toBlob((blob) => {
    if (!blob) { setStatus('Nie udało się zapisać zdjęcia.', 'is-error'); return; }
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'pomiar-profito.png';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }, 'image/png');
});

sendAreaBtn.addEventListener('click', () => {
  if (sendAreaBtn.disabled || !currentImage || !activeGeometry) return;
  const area = Number(sendAreaBtn.dataset.area);
  if (!Number.isFinite(area) || area <= 0) return;
  try {
    localStorage.setItem('profitoMeasuredAreaM2', area.toFixed(3));
  } catch (error) {
    console.warn(error);
  }
  window.location.href = '/?area=' + encodeURIComponent(area.toFixed(3)) + '#planner';
});

updateReferenceUi();
