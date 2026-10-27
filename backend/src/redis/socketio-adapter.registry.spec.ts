import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  getActiveSocketIoAdapterMode,
  isSharedSocketIoAdapterRequired,
  resetActiveSocketIoAdapterMode,
  resolveSocketIoAdapterPolicy,
  setActiveSocketIoAdapterMode,
} from './socketio-adapter.registry';

describe('Socket.IO adapter registry', () => {
  it('starts uninitialised and records shared/in-memory transitions', () => {
    try {
      resetActiveSocketIoAdapterMode();
      assert.equal(getActiveSocketIoAdapterMode(), 'not_initialized');
      setActiveSocketIoAdapterMode('shared_redis');
      assert.equal(getActiveSocketIoAdapterMode(), 'shared_redis');
      setActiveSocketIoAdapterMode('in_memory');
      assert.equal(getActiveSocketIoAdapterMode(), 'in_memory');
    } finally {
      resetActiveSocketIoAdapterMode();
    }
  });

  it('defaults to graceful degradation and validates the opt-in flag', () => {
    assert.deepEqual(resolveSocketIoAdapterPolicy({}), { requireShared: false });
    assert.deepEqual(resolveSocketIoAdapterPolicy({ SOCKETIO_REQUIRE_SHARED_ADAPTER: '  ' }), {
      requireShared: false,
    });
    assert.deepEqual(resolveSocketIoAdapterPolicy({ SOCKETIO_REQUIRE_SHARED_ADAPTER: 'true' }), {
      requireShared: true,
    });
    assert.deepEqual(resolveSocketIoAdapterPolicy({ SOCKETIO_REQUIRE_SHARED_ADAPTER: ' false ' }), {
      requireShared: false,
    });
    for (const value of ['1', 'yes', 'TRUE', 'no']) {
      assert.throws(
        () => resolveSocketIoAdapterPolicy({ SOCKETIO_REQUIRE_SHARED_ADAPTER: value }),
        /SOCKETIO_REQUIRE_SHARED_ADAPTER must be either/,
      );
    }
  });

  it('reads the live environment for the fail-closed readiness decision', () => {
    const previous = process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER;
    try {
      delete process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER;
      assert.equal(isSharedSocketIoAdapterRequired(), false);
      process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER = 'true';
      assert.equal(isSharedSocketIoAdapterRequired(), true);
    } finally {
      if (previous === undefined) delete process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER;
      else process.env.SOCKETIO_REQUIRE_SHARED_ADAPTER = previous;
    }
  });
});
