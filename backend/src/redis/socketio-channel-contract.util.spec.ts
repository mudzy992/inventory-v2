import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assertAclChannelCoverage,
  buildSocketIoChannelContract,
  checkAclChannelCoverage,
  parseAclChannelPatterns,
  parseAclKeyPatterns,
  parseAclRuleTokens,
  redisGlobToRegExp,
} from './socketio-channel-contract.util';

const PREFIX = 'inventory-v2:';

test('derives the exact PSUBSCRIBE pattern seen in the NOPERM crash report', () => {
  const contract = buildSocketIoChannelContract(PREFIX);
  assert.equal(contract.psubscribePattern, 'inventory-v2:#/#*');
  assert.deepEqual(contract.subscribeChannels, [
    'inventory-v2:-request#/#',
    'inventory-v2:-response#/#',
    'inventory-v2:-response#/#acl-probe#',
  ]);
  assert.equal(contract.publishProbeChannel, 'inventory-v2:__acl_probe__');
  assert.equal(contract.recommendedAclChannelPattern, '&inventory-v2:*');
  // The publish probe must NOT be delivered to the adapter's psubscribe pattern.
  assert.equal(redisGlobToRegExp(contract.psubscribePattern).test(contract.publishProbeChannel), false);
  for (const channel of contract.requiredChannels) {
    assert.ok(channel.startsWith('inventory-v2:'), `channel ${channel} escapes the ACL namespace`);
  }
});

test('normalizes a prefix without a trailing colon and rejects an empty one', () => {
  assert.equal(buildSocketIoChannelContract('inventory-v2').keyPrefix, PREFIX);
  assert.equal(buildSocketIoChannelContract('  other:  ').psubscribePattern, 'other:#/#*');
  assert.throws(() => buildSocketIoChannelContract('   '), /must not be empty/u);
});

test('the recommended &<prefix>:* grant covers every adapter channel', () => {
  const contract = buildSocketIoChannelContract(PREFIX);
  const result = checkAclChannelCoverage(contract, ['&inventory-v2:*']);
  assert.equal(result.covered, true);
  assert.deepEqual(result.missing, []);
  assert.doesNotThrow(() => assertAclChannelCoverage(contract, ['&inventory-v2:*']));
  assert.doesNotThrow(() => assertAclChannelCoverage(contract, ['*']));
});

test('a narrow BullMQ-only channel grant reproduces the reported NOPERM case', () => {
  const contract = buildSocketIoChannelContract(PREFIX);
  const result = checkAclChannelCoverage(contract, ['inventory-v2:bull*']);
  assert.equal(result.covered, false);
  assert.deepEqual(result.missing, contract.requiredChannels);
  assert.throws(
    () => assertAclChannelCoverage(contract, ['inventory-v2:bull*']),
    /Add &inventory-v2:\*.*resetchannels/u,
  );
});

test('resetchannels without an & grant is reported as missing, not silently accepted', () => {
  const contract = buildSocketIoChannelContract(PREFIX);
  assert.throws(() => assertAclChannelCoverage(contract, []), /\[none\]/u);
  assert.throws(
    () => assertAclChannelCoverage(contract, ['socket.io#*']),
    /do not allow Socket.IO Pub\/Sub channels/u,
  );
});

test('explicit channel grants must cover all three adapter channel families', () => {
  const contract = buildSocketIoChannelContract(PREFIX);
  const partial = checkAclChannelCoverage(contract, [
    'inventory-v2:#/#*',
    'inventory-v2:-request#/#',
    'inventory-v2:-response#/#',
    'inventory-v2:-response#/#acl-probe#',
  ]);
  assert.equal(partial.covered, false);
  assert.deepEqual(partial.missing, ['inventory-v2:__acl_probe__']);
});

test('redisGlobToRegExp handles *, ?, character classes and regex metacharacters', () => {
  assert.equal(redisGlobToRegExp('inv-*:*').test('inv-2:#/#x'), true);
  assert.equal(redisGlobToRegExp('inv:channel-?').test('inv:channel-1'), true);
  assert.equal(redisGlobToRegExp('inv:channel-?').test('inv:channel-12'), false);
  assert.equal(redisGlobToRegExp('inv:[ab]:*').test('inv:a:x'), true);
  assert.equal(redisGlobToRegExp('inv.[ab].*').test('inv-a-x'), false);
});

test('parses & and ~ patterns out of a commented, line-continued ACL rule', () => {
  const acl = `# Canonical rule — PSUBSCRIBE <PREFIX>:#/#* needs the channel grant.
# Copy to acl/users.acl; <PREFIX> must equal REDIS_KEY_PREFIX.
user inventory-v2 on ><PASSWORD> \\
  ~<PREFIX>:* &<PREFIX>:* \\
  +@all -@admin -@dangerous
`;
  assert.deepEqual(parseAclChannelPatterns(acl), ['inventory-v2:*']);
  assert.deepEqual(parseAclKeyPatterns(acl), ['inventory-v2:*']);
  assert.doesNotThrow(() =>
    assertAclChannelCoverage(buildSocketIoChannelContract(PREFIX), parseAclChannelPatterns(acl)),
  );
});

test('allchannels and +allchannels style flags are understood', () => {
  assert.deepEqual(parseAclChannelPatterns('user x on >p allchannels +@all'), ['*']);
  assert.equal(checkAclChannelCoverage(buildSocketIoChannelContract(PREFIX), ['*']).covered, true);
});

test('a different REDIS_KEY_PREFIX must produce a different required grant', () => {
  const acl = 'user staging on >p ~<PREFIX>:* &<PREFIX>:* +@all';
  assert.deepEqual(parseAclChannelPatterns(acl, 'staging-v2'), ['staging-v2:*']);
  const staging = buildSocketIoChannelContract('staging-v2');
  assert.equal(checkAclChannelCoverage(staging, ['inventory-v2:*']).covered, false);
  assert.equal(checkAclChannelCoverage(staging, parseAclChannelPatterns(acl, 'staging-v2')).covered, true);
});

test('parseAclRuleTokens exposes only permission tokens usable in ACL SETUSER', () => {
  const acl = `# comment mentioning ~ignored:* and &ignored:*
user inventory-v2 on ><PASSWORD> \
  ~<PREFIX>:* &<PREFIX>:* \
  +@all -@admin -@dangerous
`;
  assert.deepEqual(parseAclRuleTokens(acl), [
    '~inventory-v2:*',
    '&inventory-v2:*',
    '+@all',
    '-@admin',
    '-@dangerous',
  ]);
});
