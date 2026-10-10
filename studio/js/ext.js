// Talks to the Dictate Chrome extension through its bridge content script.

export class Extension extends EventTarget {
  constructor() {
    super();
    this.connected = false;
    this.version = null;
    this.pending = new Map();
    this.nextId = 1;
    window.addEventListener('message', (e) => {
      if (e.source !== window || e.data?.__dictate !== 'ext') return;
      const { type, id, payload, error } = e.data;
      if (type === 'hello') {
        const first = !this.connected;
        this.connected = true;
        this.version = payload?.version || null;
        if (first) this.dispatchEvent(new CustomEvent('change', { detail: { connected: true } }));
      } else if (type === 'push') {
        this.dispatchEvent(new CustomEvent('push', { detail: payload }));
      } else if (type === 'reply' && this.pending.has(id)) {
        const { resolve, reject, timer } = this.pending.get(id);
        clearTimeout(timer);
        this.pending.delete(id);
        error ? reject(new Error(error)) : resolve(payload);
      }
    });
    // The bridge loads after the page, so keep knocking for a while.
    let tries = 0;
    const knock = () => {
      if (this.connected || tries++ > 20) return;
      window.postMessage({ __dictate: 'studio', type: 'ping' }, '*');
      setTimeout(knock, 500);
    };
    knock();
  }

  recheck() {
    this.connected = false;
    window.postMessage({ __dictate: 'studio', type: 'ping' }, '*');
  }

  call(type, payload = {}) {
    if (!this.connected) return Promise.reject(new Error('Extension not connected'));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Extension did not answer'));
      }, 5000);
      this.pending.set(id, { resolve, reject, timer });
      window.postMessage({ __dictate: 'studio', type, id, payload }, '*');
    });
  }
}
