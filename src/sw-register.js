export function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      registration.update().catch(() => {});
    } catch (error) {
      if (import.meta.env.DEV) console.warn('[FaceUp] Service Worker indisponível:', error);
    }
  });
}
