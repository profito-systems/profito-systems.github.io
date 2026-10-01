import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const root = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const required = Array.of(
  'index.html',
  'style.css',
  'google0ad6223d442a6e87.html',
  'miarka/index.html',
  'miarka/styles.css',
  'miarka/app.js',
  'miarka/sample-a4.jpg',
  'miarka/src/cv/detectA4.js',
  'miarka/src/cv/warp.js',
  'miarka/src/cv/opencv-loader.js',
  'marketing/source/marketing-pack.json',
  'marketing/generated/marketing-pack.md',
  'marketing/generated/review-manifest.json',
  'docs/MARKETING_RECOVERY.md',
  'assets/work_013.jpg',
  'assets/work_167.jpg',
  'assets/work_208.jpg',
  'assets/work_249.jpg',
  'assets/work_101.jpg',
  'assets/work_106.jpg',
  'assets/work_111.jpg',
  'assets/work_151.jpg',
);

const missing = required.filter((relativePath) => !fs.existsSync(path.join(root, relativePath)));
if (missing.length) throw new Error(`Missing required files: ${missing.join(', ')}`);

if (fs.existsSync(path.join(root, 'google0ad6223d442a6e87(1).html'))) {
  throw new Error('Duplicate Google verification file with suffix (1) must not be published.');
}

for (const relativePath of Array.of(
  'miarka/app.js',
  'miarka/src/cv/detectA4.js',
  'miarka/src/cv/warp.js',
  'miarka/src/cv/opencv-loader.js',
)) {
  new vm.Script(fs.readFileSync(path.join(root, relativePath), 'utf8'), { filename: relativePath });
}

for (const htmlPath of Array.of('index.html', 'miarka/index.html')) {
  const absoluteHtmlPath = path.join(root, htmlPath);
  const html = fs.readFileSync(absoluteHtmlPath, 'utf8');
  const references = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g), (match) => match[1]);

  for (const reference of references) {
    if (/^(?:https?:|data:|mailto:|tel:|#)/.test(reference)) continue;
    const cleanReference = reference.split(/[?#]/, 1)[0];
    let target = cleanReference.startsWith('/')
      ? path.join(root, cleanReference.slice(1))
      : path.resolve(path.dirname(absoluteHtmlPath), cleanReference);
    if (cleanReference.endsWith('/')) target = path.join(target, 'index.html');
    if (!fs.existsSync(target)) throw new Error(`${htmlPath} references missing file: ${reference}`);
  }
}

const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const id of Array.of('calcForm', 'areaResult', 'quoteForm', 'quoteStatus', 'quoteOutput', 'copyQuote')) {
  if (!indexHtml.includes(`id="${id}"`)) throw new Error(`Homepage is missing required element: ${id}`);
}
if (/<form[^>]+action=/i.test(indexHtml)) throw new Error('Homepage forms must remain local-only.');
if (/fetch\s*\(|XMLHttpRequest|sendBeacon/i.test(indexHtml)) throw new Error('Homepage must not send form data.');

const inlineScripts = Array.from(indexHtml.matchAll(/<script>([\s\S]*?)<\/script>/g), (match) => match[1]);
for (const script of inlineScripts) new vm.Script(script, { filename: 'index.html inline script' });

const localizationScript = inlineScripts.find((script) => script.includes('const translations ='));
if (!localizationScript) throw new Error('Homepage localization script is missing.');
const translationStart = localizationScript.indexOf('const translations =');
const translationEnd = localizationScript.indexOf("let currentLang = 'en';");
if (translationStart < 0 || translationEnd < translationStart) throw new Error('Unable to inspect homepage translations.');
const localizationContext = {};
vm.createContext(localizationContext);
vm.runInContext(
  localizationScript.slice(translationStart, translationEnd) + '\nglobalThis.translationsForCheck = translations;',
  localizationContext,
  { filename: 'index.html translations' },
);
const translationsForCheck = localizationContext.translationsForCheck;
const supportedLanguages = Array.of('en', 'pl', 'de', 'fr', 'es');
const localizationKeys = new Set(Array.from(
  indexHtml.matchAll(/data-i18n(?:-(?:aria|alt|content))?="([^"]+)"/g),
  (match) => match[1],
));
for (const language of supportedLanguages) {
  if (!translationsForCheck[language]) throw new Error(`Homepage is missing ${language} translations.`);
  for (const key of localizationKeys) {
    if (!translationsForCheck[language][key]) throw new Error(`Homepage translation ${language} is missing key: ${key}`);
  }
  if (!indexHtml.includes(`data-lang="${language}"`)) throw new Error(`Homepage language switcher is missing: ${language}`);
}
if (!localizationScript.includes('navigator.languages')) throw new Error('Homepage must detect the browser preferred language.');
if (!localizationScript.includes("localStorage.setItem(languageStorageKey")) throw new Error('Homepage must remember a manual language choice.');
if (!localizationScript.includes('setLanguage(detectPreferredLanguage())')) throw new Error('Homepage must initialize from the preferred language.');

const miarkaHtml = fs.readFileSync(path.join(root, 'miarka/index.html'), 'utf8');
if (miarkaHtml.includes('src="https://docs.opencv.org/')) throw new Error('Production Miarka must lazy-load OpenCV.');
for (const id of Array.of('file', 'cameraFile', 'fileName', 'sampleBtn', 'autoDetectBtn', 'manualCornersBtn', 'measurementPanel', 'measureWidthBtn', 'measureHeightBtn', 'sendAreaBtn', 'result', 'inputCanvas', 'warpedCanvas', 'knownLength', 'brickFace', 'zoomInBtn', 'swapReferenceBtn', 'exportPhotoBtn')) {
  if (!miarkaHtml.includes(`id="${id}"`)) throw new Error(`Miarka is missing required element: ${id}`);
}

console.log(`Site check passed with ${required.length} required files.`);
