/**
 * Single source of truth for the Redis Pub/Sub channels used by
 * `@socket.io/redis-adapter` when it is created with
 * `{ key: config.keyPrefix }` (see redis-io.adapter.ts).
 *
 * The adapter's constructor (dist/index.js) derives:
 *   channel                 = `${key}#${nsp.name}#`            -> root nsp: `<prefix>#/#`
 *   requestChannel          = `${key}-request#${nsp.name}#`
 *   responseChannel         = `${key}-response#${nsp.name}#`
 *   specificResponseChannel = `${responseChannel}${uid}#`
 * and then calls `psubscribe(channel + "*")`, `subscribe([...])` and
 * `publish(channel + ...)`. ioredis `keyPrefix` does NOT apply to any of
 * those commands, which is why the adapter `key` option is mandatory.
 *
 * Redis 7 ACLs default to `resetchannels`: a user with only `~<prefix>:*`
 * key grants can read/write its keys but CANNOT (P)SUBSCRIBE or PUBLISH.
 * Every channel above must be matched by an `&<prefix>:*` channel pattern,
 * otherwise Redis replies `NOPERM No permissions to access a channel` on
 * `psubscribe <prefix>:#/#*` — an unhandled rejection that kills the process.
 */

export interface SocketIoChannelContract {
  /** Normalized, trailing-colon form, e.g. `inventory-v2:`. */
  keyPrefix: string;
  /** The exact PSUBSCRIBE pattern emitted for the root namespace. */
  psubscribePattern: string;
  /** Representative SUBSCRIBE channels (the last one has a random uid in prod). */
  subscribeChannels: string[];
  /** A channel that is NOT matched by psubscribePattern — safe for a PUBLISH probe. */
  publishProbeChannel: string;
  /** Everything an ACL must allow. */
  requiredChannels: string[];
  /** Copy-paste channel grant for acl/users.acl. */
  recommendedAclChannelPattern: string;
}

export const buildSocketIoChannelContract = (rawKeyPrefix: string): SocketIoChannelContract => {
  const trimmed = rawKeyPrefix.trim();
  if (!trimmed) {
    throw new Error('REDIS_KEY_PREFIX must not be empty');
  }
  const keyPrefix = trimmed.endsWith(':') ? trimmed : `${trimmed}:`;
  const psubscribePattern = `${keyPrefix}#/#*`;
  const subscribeChannels = [
    `${keyPrefix}-request#/#`,
    `${keyPrefix}-response#/#`,
    `${keyPrefix}-response#/#acl-probe#`,
  ];
  const publishProbeChannel = `${keyPrefix}__acl_probe__`;
  return {
    keyPrefix,
    psubscribePattern,
    subscribeChannels,
    publishProbeChannel,
    requiredChannels: [psubscribePattern, ...subscribeChannels, publishProbeChannel],
    recommendedAclChannelPattern: `&${keyPrefix}*`,
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
    .map((line) => line.split('#')[0])
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
  patterns: string[];
}

export const checkAclChannelCoverage = (
  contract: SocketIoChannelContract,
  aclChannelPatterns: string[],
): AclCoverage => {
  const patterns = aclChannelPatterns.flatMap((pattern) => {
    const stripped = pattern.startsWith('&') ? pattern.slice(1) : pattern;
    return stripped ? [stripped] : [];
  });
  const regexes = patterns.map(redisGlobToRegExp);
  const missing = contract.requiredChannels.filter(
    (channel) => !regexes.some((regex) => regex.test(channel)),
  );
  return { covered: missing.length === 0, missing, patterns };
};

export const assertAclChannelCoverage = (
  contract: SocketIoChannelContract,
  aclChannelPatterns: string[],
): void => {
  const { covered, missing } = checkAclChannelCoverage(contract, aclChannelPatterns);
  if (covered) return;
  throw new Error(
    `Redis ACL channel patterns [${aclChannelPatterns.join(', ') || 'none'}] do not allow ` +
      `Socket.IO Pub/Sub channels ${missing.join(', ')}. ` +
      `Add ${contract.recommendedAclChannelPattern} (or +allchannels) to the Redis user and ` +
      `reload the ACL; Redis 7 defaults to resetchannels.`,
  );
};
