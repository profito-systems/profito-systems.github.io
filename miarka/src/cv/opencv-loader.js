// Manual calibration remains available while this optional detector loads or fails.
let openCvPromise = null;
function ensureOpenCv(timeoutMs = 25000) {
  const ready = (module) => module && typeof module.imread === 'function' && typeof module.Mat === 'function';
  // Legacy OpenCV modules are self-resolving thenables. Never pass one as
  // a native Promise result: Promise assimilation would loop indefinitely.
  if (ready(globalThis.cv)) return Promise.resolve();
  if (openCvPromise) return openCvPromise;
  let retryableNetworkFailure = false;
  const pending = new Promise((resolve, reject) => {
    let finished = false, awaitedModule = null;
    let script = Array.from(document.scripts).find((item) => item.dataset.opencvLoader === 'true');
    const finish = (error, module) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearInterval(poll);
      script?.removeEventListener('load', checkReady);
      script?.removeEventListener('error', onError);
      if (error) {
        if (retryableNetworkFailure) script?.remove();
        reject(error);
      } else {
        globalThis.cv = module;
        resolve();
      }
    };
    const checkReady = () => {
      const module = globalThis.cv;
      if (ready(module)) { finish(null, module); return; }
      if (module && typeof module.then === 'function' && module !== awaitedModule) {
        awaitedModule = module;
        module.then((resolved) => {
          if (ready(resolved)) finish(null, resolved);
        }, (error) => {
          if (!finished && globalThis.cv === module) globalThis.cv = undefined;
          retryableNetworkFailure = true;
          finish(error);
        });
      }
    };
    const onError = () => {
      retryableNetworkFailure = true;
      finish(new Error('Nie udało się pobrać automatycznego wykrywania.'));
    };
    const deadline = setTimeout(() => finish(new Error('Automatyczne wykrywanie uruchamia się zbyt długo. Możesz wskazać wzorzec ręcznie.')), timeoutMs);
    const poll = setInterval(checkReady, 50);
    if (!script) {
      script = document.createElement('script');
      script.src = 'https://docs.opencv.org/4.13.0/opencv.js';
      script.async = true;
      script.dataset.opencvLoader = 'true';
      script.addEventListener('load', checkReady);
      script.addEventListener('error', onError);
      document.head.appendChild(script);
    } else {
      script.addEventListener('load', checkReady);
      script.addEventListener('error', onError);
    }
    checkReady();
  });
  openCvPromise = pending.catch((error) => { openCvPromise = null; throw error; });
  return openCvPromise;
}
