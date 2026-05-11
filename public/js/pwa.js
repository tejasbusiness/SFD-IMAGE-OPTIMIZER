class PWAInstallManager {
  constructor() {
    this.deferredPrompt = null;
    this.promptEl = document.getElementById('pwaInstallPrompt');
    this.yesBtn = document.getElementById('pwaInstallYes');
    this.noBtn = document.getElementById('pwaInstallNo');
    this.backdropEl = document.getElementById('pwaInstallBackdrop');

    this.init();
  }

  init() {
    this.registerServiceWorker();

    // Already installed as standalone — do nothing
    if (this.isStandalone()) return;

    const dismissed = localStorage.getItem('pwa-prompt-dismissed');

    if (this.isIOS()) {
      if (!dismissed) {
        setTimeout(() => this.showIOSPrompt(), 2500);
      }
      return;
    }

    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      if (!dismissed) {
        setTimeout(() => this.showPrompt(), 2500);
      }
    });

    window.addEventListener('appinstalled', () => {
      this.hidePrompt();
      localStorage.setItem('pwa-prompt-dismissed', 'installed');
    });

    this.yesBtn?.addEventListener('click', () => this.handleInstall());
    this.noBtn?.addEventListener('click', () => this.handleDismiss());
    this.backdropEl?.addEventListener('click', () => this.handleDismiss());
  }

  isStandalone() {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true
    );
  }

  isIOS() {
    return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  }

  showPrompt() {
    if (!this.promptEl) return;
    this.promptEl.removeAttribute('aria-hidden');
    // Force reflow so transition plays
    void this.promptEl.offsetWidth;
    this.promptEl.classList.add('pwa-visible');
  }

  hidePrompt() {
    if (!this.promptEl) return;
    this.promptEl.classList.remove('pwa-visible');
    this.promptEl.setAttribute('aria-hidden', 'true');
  }

  showIOSPrompt() {
    const iosPrompt = document.getElementById('pwaIOSPrompt');
    if (!iosPrompt) return;
    const backdrop = document.getElementById('pwaIOSBackdrop');
    const dismissBtn = document.getElementById('pwaIOSDismiss');

    iosPrompt.removeAttribute('aria-hidden');
    void iosPrompt.offsetWidth;
    iosPrompt.classList.add('pwa-visible');

    backdrop?.addEventListener('click', () => {
      iosPrompt.classList.remove('pwa-visible');
      localStorage.setItem('pwa-prompt-dismissed', 'true');
    });

    dismissBtn?.addEventListener('click', () => {
      iosPrompt.classList.remove('pwa-visible');
      localStorage.setItem('pwa-prompt-dismissed', 'true');
    });
  }

  async handleInstall() {
    if (!this.deferredPrompt) return;
    this.hidePrompt();
    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    this.deferredPrompt = null;
    localStorage.setItem('pwa-prompt-dismissed', outcome === 'accepted' ? 'installed' : 'true');
  }

  handleDismiss() {
    this.hidePrompt();
    localStorage.setItem('pwa-prompt-dismissed', 'true');
  }

  registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/service-worker.js')
          .catch((err) => console.warn('Service Worker registration failed:', err));
      });
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new PWAInstallManager();
});
