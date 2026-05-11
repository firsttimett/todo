const SERVICE_WORKER_POLICY_NAME = 'nnow-sw';
const SERVICE_WORKER_URL = '/sw.js';
const SERVICE_WORKER_SCOPE = '/';

type TrustedTypesPolicy = {
  createScriptURL: (url: string) => unknown;
};

type TrustedTypesFactory = {
  createPolicy: (
    name: string,
    rules: {
      createScriptURL: (url: string) => string;
    },
  ) => TrustedTypesPolicy;
};

type TrustedTypesGlobal = typeof globalThis & {
  trustedTypes?: TrustedTypesFactory;
};

let serviceWorkerPolicy: TrustedTypesPolicy | undefined;

function getServiceWorkerScriptUrl(): string {
  const { trustedTypes } = globalThis as TrustedTypesGlobal;

  if (!trustedTypes) {
    return SERVICE_WORKER_URL;
  }

  serviceWorkerPolicy ??= trustedTypes.createPolicy(SERVICE_WORKER_POLICY_NAME, {
    createScriptURL: (url) => {
      if (url !== SERVICE_WORKER_URL) {
        throw new TypeError(`Unexpected service worker URL: ${url}`);
      }

      return url;
    },
  });

  // TypeScript's DOM lib in this project does not expose TrustedScriptURL,
  // but Chromium accepts this object for service worker registration.
  return serviceWorkerPolicy.createScriptURL(SERVICE_WORKER_URL) as string;
}

export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) {
    return;
  }

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(getServiceWorkerScriptUrl(), { scope: SERVICE_WORKER_SCOPE })
      .catch((error: unknown) => {
        if (import.meta.env.DEV) {
          console.warn('Service worker registration failed.', error);
        }
      });
  });
}
