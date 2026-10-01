// Manual calibration remains available while this optional detector loads or fails.
let openCvPromise = null;
function ensureOpenCv(timeoutMs = 25000) {
  const ready = (module) => module && typeof module.imread === 'function' && typeof module.Mat === 'function';
  // Legacy OpenCV modules are self-resolving thenables. Never pass one as
  // a native Promise result: Promise assimilation would loop indefinitely.
  if (ready(globalThis.cv)) return Promise.resolve();
  if (openCvPromise) return openCvPromise;
  const pending = new Promise((resolve, reject) => {
    let finished = false, awaitedModule = null;
    let script = Array.from(document.scripts).find((item) => item.dataset.opencvLoader === 'true');
    if (script?.dataset.opencvLoaded === 'true' && !ready(globalThis.cv)) {
      script.remove();
      script = null;
    }
    const finish = (error, module) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearInterval(poll);
      script?.removeEventListener('load', onLoad);
      script?.removeEventListener('error', onError);
      if (error) {
        script?.remove();
        if (!ready(globalThis.cv)) globalThis.cv = undefined;
        reject(error);
      } else {
        globalThis.cv = module;
        resolve();
      }
    };
    const checkReady = () => {
      if (finished) return;
      const module = globalThis.cv;
      if (ready(module)) { finish(null, module); return; }
      if (module && typeof module.then === 'function' && module !== awaitedModule) {
        awaitedModule = module;
        module.then((resolved) => {
          if (ready(resolved)) finish(null, resolved);
        }, (error) => {
          if (!finished && globalThis.cv === module) globalThis.cv = undefined;
          finish(error);
        });
      }
    };
    const onLoad = () => {
      if (script) script.dataset.opencvLoaded = 'true';
      checkReady();
    };
    const onError = () => {
      finish(new Error('Nie udało się pobrać automatycznego wykrywania.'));
    };
    const deadline = setTimeout(() => finish(new Error('Automatyczne wykrywanie uruchamia się zbyt długo. Możesz wskazać wzorzec ręcznie.')), timeoutMs);
    const poll = setInterval(checkReady, 50);
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.13.0/opencv.js';
      script.async = true;
      script.referrerPolicy = 'no-referrer';
      script.dataset.opencvLoader = 'true';
      script.addEventListener('load', onLoad);
      script.addEventListener('error', onError);
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', onLoad);
      script.addEventListener('error', onError);
    }
    checkReady();
  });
  const shared = pending.then(
    () => { if (openCvPromise === shared) openCvPromise = null; },
    (error) => { if (openCvPromise === shared) openCvPromise = null; throw error; },
  );
  openCvPromise = shared;
  return shared;
}
