import test from 'node:test';
import assert from 'node:assert/strict';
import { AudioDevices } from './controller.mjs';
import { keySvg } from './visuals.mjs';

const presets = {
  bravia: { label: 'BRAVIA', kind: 'output', deviceId: 'bravia-id' },
  'inzone-game': { label: 'INZONE-Game', kind: 'output', deviceId: 'game-id' },
};
const endpoint = (id, isDefault = false, name = id) => ({ id, name, default: isDefault });
function fixture() {
  const sent = [];
  let now = 0;
  const c = new AudioDevices((m) => sent.push(m), presets, () => now);
  const appear = (context, preset) => c.message({ event: 'willAppear', context, settings: { preset } });
  const inventory = (outputs, extra = {}) => c.message({ event: 'audioDevices', requestId: c.query?.id, outputs, inputs: [], ...extra });
  return { c, sent, appear, inventory, advance: (ms) => { now += ms; c.tick(); } };
}

test('both keys follow the actual default, including changes made outside the plugin', () => {
  const { c, sent, appear, inventory } = fixture();
  appear('keys.0', 'bravia');
  appear('keys.1', 'inzone-game');
  inventory([endpoint('bravia-id', true), endpoint('game-id')]);
  assert.equal(c.status({ preset: 'bravia' }).state, 'default');
  assert.equal(c.status({ preset: 'inzone-game' }).state, 'connected');
  sent.length = 0;
  c.poll();
  inventory([endpoint('game-id', true)]);
  assert.equal(c.status({ preset: 'bravia' }).state, 'disconnected');
  assert.equal(c.status({ preset: 'inzone-game' }).state, 'default');
  assert.equal(sent.filter((m) => m.event === 'setImage').length, 2);
  assert.equal(sent.filter((m) => m.event === 'setAudioDevice').length, 0);
});

test('an offline preset never switches to Chat or Hands-Free, even with similar names', () => {
  const { c, sent, appear, inventory } = fixture();
  appear('keys.0', 'inzone-game');
  inventory([endpoint('chat-id', true, 'INZONE H9 II - Chat')]);
  c.message({ event: 'keyDown', context: 'keys.0' });
  assert.equal(c.status({ preset: 'inzone-game' }).state, 'disconnected');
  assert.equal(sent.filter((m) => m.event === 'setAudioDevice').length, 0);
});

test('press switches an exact id once, and green waits for the post-switch inventory', () => {
  const { c, sent, appear, inventory } = fixture();
  appear('keys.0', 'inzone-game');
  inventory([endpoint('bravia-id', true), endpoint('game-id')]);
  c.poll();
  const staleRead = c.query.id;
  c.message({ event: 'keyDown', context: 'keys.0' });
  c.message({ event: 'keyDown', context: 'keys.0' });
  const requests = sent.filter((m) => m.event === 'setAudioDevice');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].deviceId, 'game-id');
  assert.equal(requests[0].kind, 'output');
  assert.equal(c.status({ preset: 'inzone-game' }).state, 'connected');
  c.message({ event: 'audioDeviceResult', requestId: requests[0].requestId, ok: true });
  assert.equal(c.status({ preset: 'inzone-game' }).state, 'connected');
  c.message({ event: 'audioDevices', requestId: staleRead, outputs: [], inputs: [] });
  assert.equal(c.status({ preset: 'inzone-game' }).state, 'connected');
  inventory([endpoint('game-id', true)]);
  assert.equal(c.status({ preset: 'inzone-game' }).state, 'default');
});

test('pressing the default key does not rewrite audio roles', () => {
  const { c, sent, appear, inventory } = fixture();
  appear('keys.0', 'bravia');
  inventory([endpoint('bravia-id', true)]);
  c.message({ event: 'keyDown', context: 'keys.0' });
  assert.equal(sent.filter((m) => m.event === 'setAudioDevice').length, 0);
});

test('read errors and timeouts are not mistaken for disconnected; next good read recovers', () => {
  const { c, appear, inventory, advance } = fixture();
  appear('keys.0', 'bravia');
  inventory([endpoint('bravia-id', true)]);
  c.poll();
  inventory([], { error: 'COM unavailable' });
  assert.equal(c.status({ preset: 'bravia' }).state, 'error');
  c.poll();
  inventory([endpoint('bravia-id', true)]);
  assert.equal(c.status({ preset: 'bravia' }).state, 'default');
  c.poll();
  advance(3000);
  assert.equal(c.status({ preset: 'bravia' }).state, 'error');
  inventory([endpoint('bravia-id')]);
  assert.equal(c.status({ preset: 'bravia' }).state, 'connected');
});

test('switch failure is read back, and a lost reply unlocks the key after a timeout', () => {
  const { c, sent, appear, inventory, advance } = fixture();
  appear('keys.0', 'bravia');
  inventory([endpoint('bravia-id')]);
  c.message({ event: 'keyDown', context: 'keys.0' });
  c.message({ event: 'audioDeviceResult', requestId: c.switching.id, ok: false });
  inventory([endpoint('bravia-id')]);
  assert.equal(c.status({ preset: 'bravia' }).state, 'connected');
  c.message({ event: 'keyDown', context: 'keys.0' });
  advance(5000);
  assert.equal(c.switching, null);
  assert.equal(c.status({ preset: 'bravia' }).state, 'error');
  assert.ok(sent.some((m) => m.event === 'showFeedback' && m.caption.includes('失败')));
});

test('profile/page departure stops rendering and polling when no bindings remain', () => {
  const { c, sent, appear, inventory } = fixture();
  appear('page/keys.0', 'bravia');
  c.message({ event: 'willDisappear', context: 'page/keys.0' });
  sent.length = 0;
  inventory([endpoint('bravia-id', true)]);
  c.tick();
  assert.equal(sent.length, 0);
});

test('unchanged reads do not send new images, and per-key overrides work', () => {
  const { c, sent, inventory } = fixture();
  c.message({ event: 'willAppear', context: 'keys.3', settings: { preset: 'bravia', deviceId: 'custom', label: '音箱' } });
  inventory([endpoint('custom', true)]);
  sent.length = 0;
  c.poll();
  inventory([endpoint('custom', true)]);
  assert.equal(sent.filter((m) => m.event === 'setImage').length, 0);
  assert.equal(c.status({ preset: 'bravia', deviceId: 'custom' }).state, 'default');
});

test('unconfigured and duplicate-name presets cannot trigger a switch', () => {
  const { c, sent, appear, inventory } = fixture();
  c.presets = { bravia: { label: 'BRAVIA', name: 'Speakers' } };
  appear('keys.0', 'bravia');
  inventory([endpoint('one', false, 'Speakers'), endpoint('two', true, 'Speakers')]);
  c.message({ event: 'keyDown', context: 'keys.0' });
  assert.equal(c.status({ preset: 'bravia' }).state, 'unconfigured');
  assert.equal(sent.filter((m) => m.event === 'setAudioDevice').length, 0);
  assert.equal(c.status({ preset: 'missing' }).state, 'unconfigured');
});

test('labels are XML-escaped, and the three steady states use explicit text', () => {
  assert.match(keySvg('<&"', 'connected'), /&lt;&amp;&quot;/);
  assert.match(keySvg('BRAVIA', 'disconnected'), /未连接/);
  assert.match(keySvg('BRAVIA', 'default'), /系统默认输出/);
  assert.match(keySvg('BRAVIA', 'connected'), /已连接/);
});
