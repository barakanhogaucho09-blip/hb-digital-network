const AUTO_LOCK_MS = 3 * 60 * 1000; // 3 minutes idle -> lock

async function hashPin(pin) {
  const enc = new TextEncoder().encode('hbdn_salt_' + pin);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const Auth = {
  _lockTimer: null,
  _unlocked: false,

  async isPinSet() {
    const rec = await DB.get('settings', 'pin_hash');
    return !!(rec && rec.value);
  },

  async setPin(pin) {
    if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN must be 4-6 digits');
    const hash = await hashPin(pin);
    await DB.put('settings', { key: 'pin_hash', value: hash });
    this._unlocked = true;
    this.resetIdleTimer();
  },

  async verifyPin(pin) {
    const rec = await DB.get('settings', 'pin_hash');
    if (!rec) return false;
    const hash = await hashPin(pin);
    const ok = hash === rec.value;
    if (ok) { this._unlocked = true; this.resetIdleTimer(); }
    return ok;
  },

  async changePin(oldPin, newPin) {
    const ok = await this.verifyPin(oldPin);
    if (!ok) throw new Error('Old PIN is incorrect');
    await this.setPin(newPin);
  },

  isUnlocked() { return this._unlocked; },

  lock() {
    this._unlocked = false;
    if (window.App) App.showLockScreen();
  },

  logout() {
    this._unlocked = false;
    clearTimeout(this._lockTimer);
    if (window.App) App.showLockScreen();
  },

  resetIdleTimer() {
    clearTimeout(this._lockTimer);
    this._lockTimer = setTimeout(() => this.lock(), AUTO_LOCK_MS);
  },

  attachIdleListeners() {
    ['click', 'touchstart', 'keydown', 'scroll'].forEach(evt => {
      document.addEventListener(evt, () => { if (this._unlocked) this.resetIdleTimer(); }, { passive: true });
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this._unlocked) this.resetIdleTimer();
    });
  }
};

window.Auth = Auth;
