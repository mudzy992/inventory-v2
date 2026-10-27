/**
 * Single source of truth for the Redis Pub/Sub channels used by
 * `@socket.io/redis-adapter` when it is created with
 * `{ key: config.keyPrefix }` (see redis-io.adapter.ts).
 *
 * The adapter's constructor (dist/index.js) derives, per Socket.IO namespace:
 *   channel                 = `${key}#${nsp.name}#`
 *   requestChannel          = `${key}-request#${nsp.name}#`
 *   responseChannel         = `${key}-response#${nsp.name}#`
 *   specificResponseChannel = `${responseChannel}${uid}#`
 * and calls `psubscribe(channel + "*")`, `subscribe([...])`, `publish(...)`.
 * ioredis `keyPrefix` does NOT apply to any of those commands, which is why
 * the adapter `key` option is mandatory.
 *
 * TWO independent Redis ACL axes matter here: `~<prefix>:*` grants keys and
 * `&<pattern>` grants Pub/Sub channels. Redis 7 creates users with
 * `resetchannels`, so a user with only key grants gets
 * `NOPERM No permissions to access a channel`.
 *
 * CRITICAL Redis 7 detail (src/acl.c, ACLCheckChannelAgainstList):
 *   "the pattern provided in PSUBSCRIBE can only be matched as a literal
 *    against an ACL pattern (using plain string compare)"
 * i.e. `is_pattern && !strcmp(pattern, channel)`. PUBLISH/SUBSCRIBE use glob
 * matching, but PSUBSCRIBE needs an EXACT `&` entry for every pattern the
 * client subscribes to. `&inventory-v2:*` alone is therefore NOT enough for
 * `PSUBSCRIBE inventory-v2:#/#*` — the exact pattern must be granted too.
 * Only `+allchannels` (or `&*`) bypasses the literal comparison.
 */

/** Socket.IO namespaces used by this application (root one is always present). */
export const SOCKETIO_NAMESPACES = ['/', '/notifications'] as const;

export interface SocketIoChannelContract {
  /** Normalized, trailing-colon form, e.g. `inventory-v2:`. */
  keyPrefix: string;
  namespaces: string[];
  /** Root-namespace PSUBSCRIBE pattern — the one seen in the NOPERM incident. */
  psubscribePattern: string;
  /** Every PSUBSCRIBE pattern the adapter installs (one per namespace). */
  psubscribePatterns: string[];
  /** Representative SUBSCRIBE channels (specific-response uid is dynamic). */
  subscribeChannels: string[];
  /** A channel NOT matched by any psubscribe pattern — safe for a PUBLISH probe. */
  publishProbeChannel: string;
  /** Everything the ACL must allow. */
  requiredChannels: string[];
  /** Exact `&` grants for acl/users.acl (glob for channels + literal patterns). */
  requiredAclPatterns: string[];
  /** Human-readable, copy-pasteable grant list. */
  recommendedAclChannelPattern: string;
}

export const buildSocketIoChannelContract = (rawKeyPrefix: string): SocketIoChannelContract => {
  const trimmed = rawKeyPrefix.trim();
  if (!trimmed) {
    throw new Error('REDIS_KEY_PREFIX must not be empty');
  }
  const keyPrefix = trimmed.endsWith(':') ? trimmed : `${trimmed}:`;
  const namespaces = [...SOCKETIO_NAMESPACES];
  const psubscribePatterns = namespaces.map((nsp) => `${keyPrefix}#${nsp}#*`);
  const subscribeChannels = namespaces.flatMap((nsp) => [
    `${keyPrefix}-request#${nsp}#`,
    `${keyPrefix}-response#${nsp}#`,
    `${keyPrefix}-response#${nsp}#acl-probe#`,
  ]);
  const publishProbeChannel = `${keyPrefix}__acl_probe__`;
  const requiredAclPatterns = [
    `&${keyPrefix}*`,
    ...psubscribePatterns.map((pattern) => `&${pattern}`),
  ];
  return {
    keyPrefix,
    namespaces,
    psubscribePattern: psubscribePatterns[0],
    psubscribePatterns,
    subscribeChannels,
    publishProbeChannel,
    requiredChannels: [
      ...psubscribePatterns,
      ...subscribeChannels,
      publishProbeChannel,
    ],
    requiredAclPatterns,
    recommendedAclChannelPattern: requiredAclPatterns.join(' '),
  };
};

/** Redis ACL channel patterns are glob-style: `*`, `?` and `[...]` are wildcards. */
export const redisGlobToRegExp = (glob: string): RegExp => {
  let source = '';
  let index = 0;
  while (index < glob.length) {
    const char = glob[index];
    if (char === '*') {
      source += '.*';
      index += 1;
    } else if (char === '?') {
      source += '.';
      index += 1;
    } else if (char === '[') {
      const end = glob.indexOf(']', index + 1);
      if (end === -1) {
        source += '\\[';
        index += 1;
      } else {
        const body = glob.slice(index + 1, end);
        source += `[${body.startsWith('!') ? `^${body.slice(1)}` : body}]`;
        index = end + 1;
      }
    } else {
      source += char.replace(/[\\^$.*+?()[\]{}|]/gu, '\\$&');
      index += 1;
    }
  }
  return new RegExp(`^${source}$`, 'u');
};

/** Strip `#` comments per line, then join `\`-continued ACL lines. */
const aclRuleTokens = (aclText: string, prefix: string): string[] => {
  const logical = aclText
    .split(/\r?\n/)
    .map((line) => (/^\s*#/u.test(line) ? '' : line))
    .map((line) => line.replace(/\\\s*$/u, ''))
    .join(' ')
    .replaceAll('<PREFIX>', prefix);
  return logical.split(/\s+/u).filter(Boolean);
};

/** Permission tokens (`~`, `&`, `+`, `-`, `allchannels`) from an ACL rule. */
export const parseAclRuleTokens = (aclText: string, prefix = 'inventory-v2'): string[] =>
  aclRuleTokens(aclText, prefix).filter(
    (token) => /^[~&+-]/u.test(token) || token === 'allchannels',
  );

/** Extract `&`-prefixed channel patterns from an acl/users.acl rule. */
export const parseAclChannelPatterns = (aclText: string, prefix = 'inventory-v2'): string[] =>
  parseAclRuleTokens(aclText, prefix)
    .filter((token) => token.startsWith('&') || token === 'allchannels')
    .map((token) => (token === 'allchannels' ? '*' : token.slice(1)));

/** Extract `~`-prefixed key patterns from an acl/users.acl rule. */
export const parseAclKeyPatterns = (aclText: string, prefix = 'inventory-v2'): string[] =>
  parseAclRuleTokens(aclText, prefix)
    .filter((token) => token.startsWith('~'))
    .map((token) => token.slice(1));

export interface AclCoverage {
  covered: boolean;
  missing: string[];
  /** Literal PSUBSCRIBE patterns that lack an exact `&` grant. */
  missingPatterns: string[];
  patterns: string[];
  allChannels: boolean;
}

export const checkAclChannelCoverage = (
  contract: SocketIoChannelContract,
  aclChannelPatterns: string[],
): AclCoverage => {
  const patterns = aclChannelPatterns.flatMap((pattern) => {
    const stripped = pattern.startsWith('&') ? pattern.slice(1) : pattern;
    return stripped ? [stripped] : [];
  });
  const allChannels = patterns.includes('*');
  // Redis compares PSUBSCRIBE patterns literally (strcmp), not with a glob.
  const missingPatterns = allChannels
    ? []
    : contract.psubscribePatterns.filter((required) => !patterns.includes(required));
  const regexes = patterns.map(redisGlobToRegExp);
  const plainChannels = [...contract.subscribeChannels, contract.publishProbeChannel];
  const missingChannels = allChannels
    ? []
    : plainChannels.filter((channel) => !regexes.some((regex) => regex.test(channel)));
  const missing = [
    ...missingPatterns.map((pattern) => `${pattern} (exact & grant required)`),
    ...missingChannels,
  ];
  return {
    covered: missing.length === 0,
    missing,
    missingPatterns,
    patterns,
    allChannels,
  };
};

export const assertAclChannelCoverage = (
  contract: SocketIoChannelContract,
  aclChannelPatterns: string[],
): void => {
  const { covered, missing } = checkAclChannelCoverage(contract, aclChannelPatterns);
  if (covered) return;
  throw new Error(
    `Redis ACL channel patterns [${aclChannelPatterns.join(', ') || 'none'}] do not allow ` +
      `Socket.IO Pub/Sub channels: ${missing.join(', ')}. ` +
      `Redis 7 matches PSUBSCRIBE patterns literally, so grant ` +
      `${contract.recommendedAclChannelPattern} (or +allchannels) and reload the ACL.`,
  );
};
