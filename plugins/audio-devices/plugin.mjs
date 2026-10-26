import { readFileSync } from 'node:fs';
import { AudioDevices } from './controller.mjs';

const { HUBDECK_PORT: port, HUBDECK_PLUGIN: plugin, HUBDECK_TOKEN: token } = process.env;
if (!port || !plugin || !token) throw new Error('Run this plugin through HubDeck.');
let presets;
try {
  presets = JSON.parse(readFileSync(new URL('./devices.json', import.meta.url), 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error; // Bad configuration must not silently select a fallback.
  presets = JSON.parse(readFileSync(new URL('./devices.example.json', import.meta.url), 'utf8'));
}
const ws = new WebSocket(`ws://127.0.0.1:${port}`);
const controller = new AudioDevices((m) => ws.send(JSON.stringify(m)), presets);
let timer;
ws.onopen = () => {
  ws.send(JSON.stringify({ event: 'register', plugin, token }));
  timer = setInterval(() => controller.tick(), 1000);
};
ws.onmessage = ({ data }) => {
  try {
    const m = JSON.parse(data);
    controller.message(m);
    if (m.event === 'error') console.error('HubDeck:', m.message);
  } catch (error) {
    console.error('Audio plugin:', error.message);
  }
};
ws.onerror = () => console.error('HubDeck plugin connection failed.');
ws.onclose = () => {
  clearInterval(timer);
  process.exit(0); // HubDeck owns restart/reconnect, including replaying visible bindings.
};
