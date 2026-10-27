import { createServer, type Server, type Socket } from 'node:net';

/**
 * Minimal in-process RESP server with real Pub/Sub fan-out. It exists so the
 * multi-instance Socket.IO check can run without a Redis binary (locally and
 * in CI) while still exercising ioredis' real (P)SUBSCRIBE/PUBLISH wire path.
 * All observed channel names are recorded so the check can assert that the
 * Socket.IO adapter stays inside the configured `<prefix>:*` ACL namespace.
 */

interface RespConnection {
  socket: Socket;
  buffer: Buffer;
  subscriptions: Set<string>;
  psubscriptions: Set<string>;
}

export interface RespPubSubState {
  subscribe: string[];
  psubscribe: string[];
  publish: string[];
}

export interface RespPubSubServer {
  port: number;
  state: RespPubSubState;
  close: () => Promise<void>;
}

export interface RespPubSubServerOptions {
  /** Channels/patterns that must fail like a Redis 7 `resetchannels` ACL. */
  denyChannels?: string[];
}

const CRLF = Buffer.from('\r\n');

const bulk = (value: Buffer | string): Buffer => {
  const data = typeof value === 'string' ? Buffer.from(value) : value;
  return Buffer.concat([Buffer.from(`$${data.length}\r\n`), data, CRLF]);
};

const array = (parts: (Buffer | string)[]): Buffer =>
  Buffer.concat([Buffer.from(`*${parts.length}\r\n`), ...parts.map((part) => bulk(part))]);

const simple = (value: string): Buffer => Buffer.from(`+${value}\r\n`);

const aclError = (): Buffer => Buffer.from('-NOPERM No permissions to access a channel\r\n');

const integer = (value: number): Buffer => Buffer.from(`:${value}\r\n`);

interface ParsedCommand {
  args: Buffer[];
  consumed: number;
}

const parseCommand = (buffer: Buffer): ParsedCommand | null => {
  const firstLineEnd = buffer.indexOf(CRLF);
  if (firstLineEnd === -1) return null;
  const header = buffer.subarray(0, firstLineEnd).toString('utf8');
  if (!header.startsWith('*')) {
    return {
      args: header.split(/\s+/u).filter(Boolean).map((part) => Buffer.from(part)),
      consumed: firstLineEnd + CRLF.length,
    };
  }
  const count = Number(header.slice(1));
  if (!Number.isInteger(count) || count < 1) return null;

  let offset = firstLineEnd + CRLF.length;
  const args: Buffer[] = [];
  for (let index = 0; index < count; index += 1) {
    const lengthLineEnd = buffer.indexOf(CRLF, offset);
    if (lengthLineEnd === -1) return null;
    const lengthLine = buffer.subarray(offset, lengthLineEnd).toString('utf8');
    if (!lengthLine.startsWith('$')) return null;
    const length = Number(lengthLine.slice(1));
    const dataStart = lengthLineEnd + CRLF.length;
    if (buffer.length < dataStart + length + CRLF.length) return null;
    args.push(buffer.subarray(dataStart, dataStart + length));
    offset = dataStart + length + CRLF.length;
  }
  return { args, consumed: offset };
};

/** Only the trailing-wildcard form used by @socket.io/redis-adapter. */
const matchesPattern = (pattern: string, channel: string): boolean => {
  if (pattern.endsWith('*')) return channel.startsWith(pattern.slice(0, -1));
  if (pattern.includes('*') || pattern.includes('?')) {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/gu, '\\$&');
    return new RegExp(`^${escaped.replace(/\*/gu, '.*').replace(/\?/gu, '.')}$`, 'u').test(channel);
  }
  return pattern === channel;
};

export const startRespPubSubServer = async (
  options: RespPubSubServerOptions = {},
): Promise<RespPubSubServer> => {
  const denied = new Set(options.denyChannels ?? []);
  const state: RespPubSubState = { subscribe: [], psubscribe: [], publish: [] };
  const connections = new Set<RespConnection>();

  const fanOut = (channel: Buffer, message: Buffer): number => {
    let recipients = 0;
    for (const connection of connections) {
      let delivered = false;
      const channelText = channel.toString('utf8');
      if (connection.subscriptions.has(channelText)) {
        connection.socket.write(array(['message', channel, message]));
        delivered = true;
      }
      for (const pattern of connection.psubscriptions) {
        if (matchesPattern(pattern, channelText)) {
          connection.socket.write(array(['pmessage', pattern, channel, message]));
          delivered = true;
        }
      }
      if (delivered) recipients += 1;
    }
    return recipients;
  };

  const handle = (connection: RespConnection, args: Buffer[]): void => {
    if (args.length === 0) return;
    const command = args[0].toString('utf8').toLowerCase();
    switch (command) {
      case 'info':
        connection.socket.write(
          bulk('# Server\r\nredis_version:7.4.0\r\n# Persistence\r\nloading:0\r\n'),
        );
        return;
      case 'ping':
        connection.socket.write(simple('PONG'));
        return;
      case 'subscribe':
      case 'psubscribe': {
        const isPattern = command === 'psubscribe';
        for (const raw of args.slice(1)) {
          const name = raw.toString('utf8');
          if (denied.has(name)) {
            connection.socket.write(aclError());
            return;
          }
          if (isPattern) {
            connection.psubscriptions.add(name);
            state.psubscribe.push(name);
          } else {
            connection.subscriptions.add(name);
            state.subscribe.push(name);
          }
          // A (P)SUBSCRIBE acknowledgement is a 3-element array whose last
          // element is an INTEGER, not a bulk string.
          connection.socket.write(
            Buffer.concat([
              Buffer.from('*3\r\n'),
              bulk(command),
              bulk(name),
              integer(connection.subscriptions.size + connection.psubscriptions.size),
            ]),
          );
        }
        return;
      }
      case 'unsubscribe':
      case 'punsubscribe': {
        const isPattern = command === 'punsubscribe';
        for (const raw of args.slice(1)) {
          if (isPattern) connection.psubscriptions.delete(raw.toString('utf8'));
          else connection.subscriptions.delete(raw.toString('utf8'));
        }
        connection.socket.write(simple('OK'));
        return;
      }
      case 'publish': {
        const channel = args[1] ?? Buffer.alloc(0);
        const message = args[2] ?? Buffer.alloc(0);
        if (denied.has(channel.toString('utf8'))) {
          connection.socket.write(aclError());
          return;
        }
        state.publish.push(channel.toString('utf8'));
        connection.socket.write(integer(fanOut(channel, message)));
        return;
      }
      case 'quit':
        connection.socket.write(simple('OK'));
        connection.socket.end();
        return;
      default:
        // AUTH, SELECT, CLIENT SETINFO, CONFIG, ... are irrelevant here.
        connection.socket.write(simple('OK'));
    }
  };

  const processBuffer = (connection: RespConnection): void => {
    for (;;) {
      const parsed = parseCommand(connection.buffer);
      if (!parsed) return;
      connection.buffer = connection.buffer.subarray(parsed.consumed);
      handle(connection, parsed.args);
    }
  };

  const server: Server = createServer((socket) => {
    const connection: RespConnection = {
      socket,
      buffer: Buffer.alloc(0),
      subscriptions: new Set(),
      psubscriptions: new Set(),
    };
    connections.add(connection);
    socket.on('close', () => connections.delete(connection));
    socket.on('error', () => socket.destroy());
    socket.on('data', (chunk: Buffer) => {
      connection.buffer = Buffer.concat([connection.buffer, chunk]);
      processBuffer(connection);
    });
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, () => {
      server.off('error', rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('RESP stub has no TCP port');

  return {
    port: address.port,
    state,
    close: async () => {
      for (const connection of connections) connection.socket.destroy();
      connections.clear();
      await new Promise<void>((resolveClose) => server.close(() => resolveClose()));
    },
  };
};
