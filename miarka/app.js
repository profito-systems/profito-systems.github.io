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

let currentImage = null;
let activeObjectUrl = null;
let referenceCorners = null;
let activeGeometry = null;
let manualCornerMode = false;
let manualCorners = [];
let measureMode = null;
let measurePoints = { width: [], height: [] };
let measuredMm = { width: null, height: null };

function setStatus(message, tone = '') {
  resultEl.textContent = message;
  resultEl.className = ('status ' + tone).trim();
}

function selectedReferenceType() {
  return document.querySelector('input[name="referenceType"]:checked').value;
}

function referenceSpec() {
  const type = selectedReferenceType();

  if (type === 'card') {
    return {
      key: 'card',
      label: 'karta ID-1',
      longSideMm: 85.6,
      shortSideMm: 53.98,
      minAreaShare: 0.003,
      aspectTolerance: 0.38,
    };
  }

  if (type === 'custom') {
    const longSideMm = Number(customLong.value);
    const shortSideMm = Number(customShort.value);
    if (!Number.isFinite(longSideMm) || !Number.isFinite(shortSideMm) || longSideMm <= 0 || shortSideMm <= 0) {
      return null;
    }
    return {
      key: 'custom',
      label: 'własny wzorzec',
      longSideMm: Math.max(longSideMm, shortSideMm),
      shortSideMm: Math.min(longSideMm, shortSideMm),
      minAreaShare: 0.004,
      aspectTolerance: 0.42,
    };
  }

  return {
    key: 'a4',
    label: 'A4',
    longSideMm: 297,
    shortSideMm: 210,
    minAreaShare: 0.02,
    aspectTolerance: 0.42,
  };
}

function resetCalibration() {
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
  drawInputOverlay();
}

function updateReferenceUi() {
  const type = selectedReferenceType();
  customSizeFields.classList.toggle('is-hidden', type !== 'custom');
  cardPrivacy.hidden = type !== 'card';
  resetCalibration();
  if (currentImage) {
    setStatus('Wzorzec zmieniony. Uruchom wykrywanie ponownie.', 'is-warning');
  }
}

document.querySelectorAll('input[name="referenceType"]').forEach((input) => {
  input.addEventListener('change', updateReferenceUi);
});
customLong.addEventListener('input', resetCalibration);
customShort.addEventListener('input', resetCalibration);

function loadImageFile(file) {
  currentImage = null;
  autoBtn.disabled = true;
  manualCornersBtn.disabled = true;
  fileNameEl.textContent = file.name;
  setStatus('Wczytuję zdjęcie…');
  resetCalibration();

  const img = new Image();
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  const objectUrl = URL.createObjectURL(file);
  activeObjectUrl = objectUrl;
  img.src = objectUrl;

  img.onload = () => {
    if (activeObjectUrl !== objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    activeObjectUrl = null;

    const maxSide = 1800;
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    inputCanvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    inputCanvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

    currentImage = img;
    drawInputOverlay();
    autoBtn.disabled = false;
    manualCornersBtn.disabled = false;
    canvasesEl.classList.remove('is-hidden');
    setStatus('Zdjęcie gotowe. Spróbuj automatu albo wskaż cztery narożniki ręcznie.', 'is-success');
  };

  img.onerror = () => {
    if (activeObjectUrl !== objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    activeObjectUrl = null;
    fileNameEl.textContent = 'Nie udało się wczytać pliku';
    setStatus('Nie udało się otworzyć zdjęcia. Wybierz inny plik.', 'is-error');
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
    referenceCorners.forEach((point) => {
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

  drawLine(ctx, measurePoints.width, '#22c55e', 'szerokość');
  drawLine(ctx, measurePoints.height, '#f97316', 'wysokość');
}

function canvasPointFromEvent(event) {
  const rect = inputCanvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * inputCanvas.width / rect.width,
    y: (event.clientY - rect.top) * inputCanvas.height / rect.height,
  };
}

function applyReferenceCorners(corners) {
  const spec = referenceSpec();
  if (!spec) {
    setStatus('Podaj poprawne wymiary własnego wzorca.', 'is-error');
    return;
  }

  referenceCorners = orderCorners(corners);
  activeGeometry = referenceOutputGeometry(
    referenceCorners,
    spec.longSideMm,
    spec.shortSideMm,
    4,
  );

  warpedCanvas.width = activeGeometry.widthPixels;
  warpedCanvas.height = activeGeometry.heightPixels;
  drawBaseImage();
  warpReference(inputCanvas, referenceCorners, warpedCanvas);

  referencePreviewTitle.textContent = 'Wyprostowany wzorzec: ' + spec.label;
  calibrationSummary.textContent =
    'Kalibracja: ' + spec.label + ', ' +
    activeGeometry.widthMm.toFixed(2) + ' × ' +
    activeGeometry.heightMm.toFixed(2) + ' mm, orientacja ' +
    activeGeometry.orientation + '.';

  measurementPanel.classList.remove('is-hidden');
  manualCornerMode = false;
  manualCorners = [];
  measurePoints = { width: [], height: [] };
  measuredMm = { width: null, height: null };
  widthResult.textContent = '—';
  heightResult.textContent = '—';
  areaResult.textContent = '—';
  sendAreaBtn.disabled = true;
  canvasHelp.textContent = 'Wybierz szerokość albo wysokość, następnie kliknij dwa końce mierzonego odcinka na zdjęciu.';
  setStatus('Wzorzec skalibrowany. Możesz teraz mierzyć odcinki na tej samej płaszczyźnie.', 'is-success');
  drawInputOverlay();
}

function handleImageInput(event) {
  const file = event.target.files.item(0);
  if (file) loadImageFile(file);
}

fileInput.addEventListener('change', handleImageInput);
cameraInput.addEventListener('change', handleImageInput);

sampleBtn.addEventListener('click', async () => {
  document.querySelector('input[name="referenceType"][value="a4"]').checked = true;
  updateReferenceUi();
  sampleBtn.disabled = true;
  setStatus('Wczytuję przykładowe zdjęcie A4…');

  try {
    const response = await fetch('sample-a4.jpg');
    if (!response.ok) throw new Error('HTTP ' + response.status);
    const blob = await response.blob();
    loadImageFile(new File([blob], 'wzorzec-miarka-a4.jpg', { type: blob.type }));
  } catch (error) {
    console.error(error);
    setStatus('Nie udało się wczytać wzorca. Spróbuj ponownie.', 'is-error');
  } finally {
    sampleBtn.disabled = false;
  }
});

autoBtn.addEventListener('click', async () => {
  if (!currentImage) {
    setStatus('Najpierw wybierz zdjęcie z urządzenia.', 'is-warning');
    return;
  }

  const spec = referenceSpec();
  if (!spec) {
    setStatus('Podaj poprawne wymiary własnego wzorca.', 'is-error');
    return;
  }

  if (typeof cv === 'undefined' || !cv.imread || typeof detectReference !== 'function' || typeof warpReference !== 'function') {
    setStatus('Moduł pomiarowy jeszcze się uruchamia. Odczekaj chwilę i spróbuj ponownie.', 'is-warning');
    return;
  }

  autoBtn.disabled = true;
  autoBtn.textContent = 'Wykrywam wzorzec…';
  setStatus('Szukam prostokąta o proporcjach wybranego wzorca…');

  try {
    drawBaseImage();
    const targetRatio = spec.longSideMm / spec.shortSideMm;
    const corners = await detectReference(inputCanvas, targetRatio, {
      minAreaShare: spec.minAreaShare,
      aspectTolerance: spec.aspectTolerance,
    });

    if (!corners) {
      setStatus('Automat nie znalazł wiarygodnego wzorca. Użyj trybu ręcznego i wskaż jego cztery narożniki.', 'is-warning');
      return;
    }

    applyReferenceCorners(corners);
  } catch (error) {
    console.error(error);
    setStatus('Wystąpił błąd podczas analizy. Spróbuj trybu ręcznego.', 'is-error');
  } finally {
    autoBtn.disabled = false;
    autoBtn.textContent = 'Wykryj wzorzec automatycznie';
  }
});

manualCornersBtn.addEventListener('click', () => {
  if (!currentImage) return;
  resetCalibration();
  manualCornerMode = true;
  manualCorners = [];
  canvasHelp.textContent = 'Kliknij cztery narożniki wzorca. Kolejność nie ma znaczenia.';
  setStatus('Tryb ręczny: wskaż cztery narożniki wzorca na zdjęciu.', 'is-warning');
  inputCanvas.classList.add('is-interactive');
});

function measureDistance(key) {
  const points = measurePoints[key];
  if (!referenceCorners || !activeGeometry || points.length !== 2) return;

  const mapped = mapImagePointsToReference(
    referenceCorners,
    points,
    activeGeometry.widthMm,
    activeGeometry.heightMm,
  );
  const distanceMm = Math.hypot(
    mapped[1].x - mapped[0].x,
    mapped[1].y - mapped[0].y,
  );

  measuredMm[key] = distanceMm;
  const target = key === 'width' ? widthResult : heightResult;
  target.textContent = distanceMm >= 1000
    ? (distanceMm / 1000).toFixed(3) + ' m'
    : distanceMm.toFixed(1) + ' mm';

  updateArea();
}

function updateArea() {
  if (!measuredMm.width || !measuredMm.height) {
    areaResult.textContent = '—';
    sendAreaBtn.disabled = true;
    return;
  }

  const areaM2 = measuredMm.width * measuredMm.height / 1000000;
  areaResult.textContent = areaM2.toFixed(2) + ' m²';
  sendAreaBtn.dataset.area = areaM2.toFixed(3);
  sendAreaBtn.disabled = false;
}

function beginMeasure(key) {
  if (!referenceCorners || !activeGeometry) {
    setStatus('Najpierw skalibruj wzorzec.', 'is-warning');
    return;
  }

  measureMode = key;
  measurePoints[key] = [];
  measuredMm[key] = null;
  updateArea();
  inputCanvas.classList.add('is-interactive');
  const label = key === 'width' ? 'szerokości' : 'wysokości';
  canvasHelp.textContent = 'Kliknij pierwszy i drugi koniec ' + label + '.';
  setStatus('Pomiar ' + label + ': wskaż dwa punkty na zdjęciu.', 'is-warning');
  drawInputOverlay();
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
  inputCanvas.classList.remove('is-interactive');
  canvasHelp.textContent = 'Wybierz szerokość albo wysokość, następnie kliknij dwa końce mierzonego odcinka na zdjęciu.';
  drawInputOverlay();
});

inputCanvas.addEventListener('click', (event) => {
  if (!currentImage) return;
  const point = canvasPointFromEvent(event);

  if (manualCornerMode) {
    manualCorners.push(point);
    drawInputOverlay();

    if (manualCorners.length === 4) {
      const corners = orderCorners(manualCorners);
      applyReferenceCorners(corners);
      inputCanvas.classList.remove('is-interactive');
    }
    return;
  }

  if (!measureMode) return;

  const points = measurePoints[measureMode];
  if (points.length >= 2) points.length = 0;
  points.push(point);
  drawInputOverlay();

  if (points.length === 2) {
    measureDistance(measureMode);
    measureMode = null;
    inputCanvas.classList.remove('is-interactive');
    canvasHelp.textContent = 'Pomiar zapisany. Możesz zmierzyć drugi bok albo powtórzyć pomiar.';
    setStatus('Odcinek zmierzony. Dla pola powierzchni zmierz jeszcze drugi bok.', 'is-success');
  }
});

sendAreaBtn.addEventListener('click', () => {
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
