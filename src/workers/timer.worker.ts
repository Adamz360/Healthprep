// src/workers/timer.worker.ts
// Runs the exam countdown in an isolated Web Worker so it is NOT throttled
// when the browser tab loses focus (a common problem with setInterval on
// the main thread in background tabs).
//
// Protocol (all messages are TimerWorkerMessage-shaped JSON):
//   IN  -> { type: 'START', durationSeconds }
//   IN  -> { type: 'PAUSE' }
//   IN  -> { type: 'RESUME' }
//   IN  -> { type: 'STOP' }
//   OUT <- { type: 'TICK', remainingSeconds }
//   OUT <- { type: 'WARNING', remainingSeconds }   // fired once at 5:00 remaining
//   OUT <- { type: 'EXPIRED', remainingSeconds: 0 }

type IncomingType = 'START' | 'PAUSE' | 'RESUME' | 'STOP';
type OutgoingType = 'TICK' | 'WARNING' | 'EXPIRED';

interface IncomingMessage {
  type: IncomingType;
  durationSeconds?: number;
}

interface OutgoingMessage {
  type: OutgoingType;
  remainingSeconds: number;
}

const WARNING_THRESHOLD_SECONDS = 5 * 60; // 5 minutes
const TICK_INTERVAL_MS = 1000;

let remainingSeconds = 0;
let intervalHandle: ReturnType<typeof setInterval> | null = null;
let warningFired = false;
let anchorTimestampMs = 0; // wall-clock time the current countdown segment started
let anchorRemainingSeconds = 0; // remainingSeconds value at that anchor point

function post(msg: OutgoingMessage) {
  // eslint-disable-next-line no-restricted-globals
  (self as unknown as Worker).postMessage(msg);
}

/**
 * Uses Date.now() deltas rather than trusting the interval's own tick
 * count, since setInterval drift/throttling in background tabs is exactly
 * the failure mode this worker exists to avoid. Recomputing from a wall-clock
 * anchor keeps remainingSeconds accurate even if ticks are delayed/batched.
 */
function computeRemaining(): number {
  const elapsedMs = Date.now() - anchorTimestampMs;
  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  return Math.max(0, anchorRemainingSeconds - elapsedSeconds);
}

function clearTimerInterval() {
  if (intervalHandle !== null) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
}

function tick() {
  remainingSeconds = computeRemaining();

  if (!warningFired && remainingSeconds <= WARNING_THRESHOLD_SECONDS && remainingSeconds > 0) {
    warningFired = true;
    post({ type: 'WARNING', remainingSeconds });
  }

  if (remainingSeconds <= 0) {
    clearTimerInterval();
    post({ type: 'EXPIRED', remainingSeconds: 0 });
    return;
  }

  post({ type: 'TICK', remainingSeconds });
}

function start(durationSeconds: number) {
  clearTimerInterval();
  remainingSeconds = durationSeconds;
  anchorRemainingSeconds = durationSeconds;
  anchorTimestampMs = Date.now();
  warningFired = durationSeconds <= WARNING_THRESHOLD_SECONDS; // don't re-fire if already under threshold
  intervalHandle = setInterval(tick, TICK_INTERVAL_MS);
  post({ type: 'TICK', remainingSeconds });
}

function pause() {
  // Snapshot current remaining time and stop the interval; resume() will
  // re-anchor from this snapshot.
  remainingSeconds = computeRemaining();
  clearTimerInterval();
}

function resume() {
  anchorRemainingSeconds = remainingSeconds;
  anchorTimestampMs = Date.now();
  clearTimerInterval();
  intervalHandle = setInterval(tick, TICK_INTERVAL_MS);
}

function stop() {
  clearTimerInterval();
  remainingSeconds = 0;
}

self.addEventListener('message', (event: MessageEvent<IncomingMessage>) => {
  const { type, durationSeconds } = event.data;
  switch (type) {
    case 'START':
      start(durationSeconds ?? 0);
      break;
    case 'PAUSE':
      pause();
      break;
    case 'RESUME':
      resume();
      break;
    case 'STOP':
      stop();
      break;
    default:
      break;
  }
});

export {}; // ensures this file is treated as a module by TS
