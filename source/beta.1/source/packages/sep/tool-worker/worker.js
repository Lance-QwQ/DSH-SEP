import { workerData } from 'node:worker_threads';
import { encodeJson, JsonBoundaryError } from './json.js';

// This is a lifecycle protocol between trusted modules, not a security boundary.
const controller = new AbortController();
const port = workerData.protocolPort;
delete workerData.protocolPort;
let start; let started = false;
const startSignal = new Promise((resolve) => { start = resolve; });
port.on('message', (message) => {
  if (message === 'abort') { controller.abort(); start(false); }
  else if (message === 'execute' && !started) { started = true; start(true); }
});
const send = (packet) => port.postMessage(JSON.stringify({ version: 1, ...packet }));
let stage = 'MODULE';
try {
  const module = await import(workerData.moduleUrl);
  if (typeof module[workerData.exportName] !== 'function') throw new Error('Missing module export');
  send({ kind: 'ready' });
  const permitted = await startSignal;
  if (permitted && !controller.signal.aborted) {
    stage = 'EXECUTION';
    const { args, config, callId, rootCallId } = JSON.parse(workerData.inputJson);
    const value = await module[workerData.exportName](args, { config, callId, rootCallId, signal: controller.signal });
    stage = 'OUTPUT';
    const json = encodeJson(value, workerData.outputLimits);
    send({ kind: 'result', json });
  }
} catch (error) {
  send({ kind: 'error', code: `TOOL_WORKER_${error instanceof JsonBoundaryError ? 'OUTPUT' : stage}` });
}
