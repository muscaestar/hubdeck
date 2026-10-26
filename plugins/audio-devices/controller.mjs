import { imageUri, keySvg } from './visuals.mjs';

// The only source of truth is a successful inventory from the host. A failed/timed-out read
// must never be presented as "disconnected", and a click must never optimistically turn green.
export class AudioDevices {
  constructor(send, presets, now = Date.now) {
    this.send = send;
    this.presets = presets;
    this.now = now;
    this.contexts = new Map();
    this.inventory = null;
    this.readError = false;
    this.query = null;
    this.switching = null;
    this.sequence = 0;
  }

  device(settings = {}) {
    const preset = this.presets[settings.preset ?? 'bravia'];
    if (!preset) return null;
    return {
      kind: preset.kind ?? 'output',
      label: settings.label?.trim() || preset.label,
      id: settings.deviceId?.trim() || preset.deviceId || '',
      name: preset.name || '',
    };
  }

  status(settings) {
    const d = this.device(settings);
    if (!d || (!d.id && !d.name)) return { state: 'unconfigured', label: d?.label ?? '音频设备' };
    if (!this.inventory || this.readError) return { state: this.readError ? 'error' : 'loading', label: d.label };
    const list = d.kind === 'input' ? this.inventory.inputs : this.inventory.outputs;
    // With a stored id there is deliberately no name fallback. Without an id, an EXACT and
    // unique name is allowed for first-time setup only; ambiguous names cannot switch anything.
    const matches = list.filter((a) => d.id ? a.id === d.id : a.name === d.name);
    if (matches.length > 1) return { state: 'unconfigured', label: d.label };
    const endpoint = matches[0];
    return { state: endpoint ? (endpoint.default ? 'default' : 'connected') : 'disconnected', label: d.label, endpoint, kind: d.kind };
  }

  render() {
    for (const [context, entry] of this.contexts) {
      const s = this.status(entry.settings);
      const pending = this.switching?.context === context;
      const signature = JSON.stringify([s.state, s.label, pending]);
      if (signature === entry.sent) continue;
      this.send({ event: 'setImage', context, image: imageUri(keySvg(s.label, s.state, pending)) });
      // Text is baked into the SVG. This also clears a title inherited from the saved look.
      this.send({ event: 'setTitle', context, title: '' });
      entry.sent = signature;
    }
  }

  poll() {
    if (!this.contexts.size || this.query) return;
    this.query = { id: `read-${++this.sequence}`, at: this.now() };
    this.send({ event: 'getAudioDevices', requestId: this.query.id });
  }

  tick() {
    if (this.query && this.now() - this.query.at >= 3000) {
      this.query = null;
      this.readError = true;
    }
    if (this.switching && this.now() - this.switching.at >= 5000) {
      this.switching = null;
      this.readError = true;
      this.feedback('切换未确认，请重试');
    }
    this.render();
    this.poll();
  }

  feedback(caption) {
    this.send({ event: 'showFeedback', caption });
  }

  message(m) {
    switch (m.event) {
      case 'willAppear':
        this.contexts.set(m.context, { settings: m.settings ?? {}, sent: null });
        this.render();
        this.poll();
        break;
      case 'willDisappear':
        this.contexts.delete(m.context);
        break;
      case 'audioDevices':
        if (m.requestId !== this.query?.id) break;
        this.query = null;
        if (m.error || !Array.isArray(m.outputs) || !Array.isArray(m.inputs)) {
          this.readError = true;
        } else {
          this.inventory = { outputs: m.outputs, inputs: m.inputs };
          this.readError = false;
        }
        this.render();
        break;
      case 'keyDown': {
        const entry = this.contexts.get(m.context);
        if (!entry || this.switching) break;
        const s = this.status(entry.settings);
        if (!s.endpoint || this.readError) {
          this.feedback(s.state === 'disconnected' ? `${s.label} 未连接` : '设备状态不可用，请稍后重试');
          this.poll();
          break;
        }
        // Re-selecting an already default output is harmless but unnecessary. It should not
        // overwrite a separately configured communications default just by pressing a green key.
        if (s.state === 'default') {
          this.feedback(`${s.label} 已是默认输出`);
          break;
        }
        const requestId = `switch-${++this.sequence}`;
        this.switching = { id: requestId, at: this.now(), context: m.context };
        this.send({ event: 'setAudioDevice', requestId, kind: s.kind, deviceId: s.endpoint.id });
        this.render();
        break;
      }
      case 'audioDeviceResult':
        if (m.requestId !== this.switching?.id) break;
        this.switching = null;
        if (!m.ok) this.feedback('切换失败，请检查设备连接');
        // Invalidate any inventory requested before the switch, and read back the real result.
        this.query = null;
        this.poll();
        this.render();
        break;
      case 'error':
        this.query = null;
        this.switching = null;
        this.readError = true;
        this.render();
        break;
    }
  }
}
