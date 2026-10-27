import { writeStructuredLog } from '../common/logging/structured-log.util';

/**
 * The Socket.IO adapter has a process-local in-memory fallback. Readiness used
 * to probe Redis itself, which cannot tell whether THIS process actually
 * installed the shared Redis adapter. This registry records the effective mode
 * so health output and operators can see it.
 */
export type SocketIoAdapterMode = 'not_initialized' | 'shared_redis' | 'in_memory';

let activeMode: SocketIoAdapterMode = 'not_initialized';

export const getActiveSocketIoAdapterMode = (): SocketIoAdapterMode => activeMode;

export const setActiveSocketIoAdapterMode = (mode: SocketIoAdapterMode): void => {
  if (activeMode === mode) return;
  activeMode = mode;
  writeStructuredLog(mode === 'shared_redis' ? 'log' : 'warn', {
    event: 'socketio_adapter_mode',
    mode,
    horizontallyScalable: mode === 'shared_redis',
  });
};

export const resetActiveSocketIoAdapterMode = (): void => {
  activeMode = 'not_initialized';
};

/**
 * Opt-in fail-closed policy. Deployments with more than one backend replica
 * must set SOCKETIO_REQUIRE_SHARED_ADAPTER=true so a Redis outage at startup
 * cannot silently leave this instance broadcasting only to its own clients.
 * Default is false to preserve the existing single-instance degradation.
 */
export const resolveSocketIoAdapterPolicy = (
  env: NodeJS.ProcessEnv = process.env,
): { requireShared: boolean } => {
  const raw = env.SOCKETIO_REQUIRE_SHARED_ADAPTER;
  if (raw === undefined || raw.trim() === '') return { requireShared: false };
  const normalized = raw.trim();
  if (normalized === 'true') return { requireShared: true };
  if (normalized === 'false') return { requireShared: false };
  throw new Error('SOCKETIO_REQUIRE_SHARED_ADAPTER must be either "true" or "false"');
};

export const isSharedSocketIoAdapterRequired = (): boolean =>
  resolveSocketIoAdapterPolicy().requireShared;
