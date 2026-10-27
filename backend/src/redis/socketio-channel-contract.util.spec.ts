import assert from 'node:assert/strict';
import test from 'node:test';
import {
  SOCKETIO_NAMESPACES,
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
  assert.deepEqual(contract.namespaces, ['/', '/notifications']);
  assert.deepEqual(contract.psubscribePatterns, [
    'inventory-v2:#/#*',
    'inventory-v2:#/notifications#*',
  ]);
  assert.deepEqual(contract.subscribeChannels, [
    'inventory-v2:-request#/#',
    'inventory-v2:-response#/#',
    'inventory-v2:-response#/#acl-probe#',
    'inventory-v2:-request#/notifications#',
    'inventory-v2:-response#/notifications#',
    'inventory-v2:-response#/notifications#acl-probe#',
  ]);
  assert.equal(contract.publishProbeChannel, 'inventory-v2:__acl_probe__');
  assert.deepEqual(contract.requiredAclPatterns, [
    '&inventory-v2:*',
    '&inventory-v2:#/#*',
    '&inventory-v2:#/notifications#*',
  ]);
  // The publish probe must NOT match any adapter psubscribe pattern.
  for (const pattern of contract.psubscribePatterns) {
    assert.equal(redisGlobToRegExp(pattern).test(contract.publishProbeChannel), false);
  }
  for (const channel of contract.requiredChannels) {
    assert.ok(channel.startsWith('inventory-v2:'), `channel ${channel} escapes the ACL namespace`);
  }
});

test('normalizes a prefix without a trailing colon and rejects an empty one', () => {
  assert.equal(buildSocketIoChannelContract('inventory-v2').keyPrefix, PREFIX);
  assert.equal(buildSocketIoChannelContract('  other:  ').psubscribePattern, 'other:#/#*');
  assert.throws(() => buildSocketIoChannelContract('   '), /must not be empty/u);
});

test('Redis 7 requires EXACT & grants for PSUBSCRIBE, not a covering glob', () => {
  const contract = buildSocketIoChannelContract(PREFIX);
  // The historically documented single glob is NOT sufficient.
  const globOnly = checkAclChannelCoverage(contract, ['&inventory-v2:*']);
  assert.equal(globOnly.covered, false);
  assert.deepEqual(globOnly.missingPatterns, contract.psubscribePatterns);
  assert.throws(
    () => assertAclChannelCoverage(contract, ['&inventory-v2:*']),
    /exact & grant required/u,
  );

  // One exact pattern is not enough when the app has two namespaces.
  const partial = checkAclChannelCoverage(contract, [
    '&inventory-v2:*',
    '&inventory-v2:#/#*',
  ]);
  assert.equal(partial.covered, false);
  assert.deepEqual(partial.missingPatterns, ['inventory-v2:#/notifications#*']);
});

test('the canonical rule covers every adapter channel', () => {
  const contract = buildSocketIoChannelContract(PREFIX);
  const result = checkAclChannelCoverage(contract, contract.requiredAclPatterns);
  assert.equal(result.covered, true);
  assert.deepEqual(result.missing, []);
  assert.doesNotThrow(() => assertAclChannelCoverage(contract, contract.requiredAclPatterns));
});

test('+allchannels is the documented escape hatch and is detected', () => {
  const contract = buildSocketIoChannelContract(PREFIX);
  const result = checkAclChannelCoverage(contract, ['*']);
  assert.equal(result.allChannels, true);
  assert.equal(result.covered, true);
});

test('a narrow BullMQ-only channel grant reproduces the reported NOPERM case', () => {
  const contract = buildSocketIoChannelContract(PREFIX);
  const result = checkAclChannelCoverage(contract, ['inventory-v2:bull*']);
  assert.equal(result.covered, false);
  assert.deepEqual(result.missingPatterns, contract.psubscribePatterns);
  assert.throws(
    () => assertAclChannelCoverage(contract, ['inventory-v2:bull*']),
    /resetchannels|reload the ACL/u,
  );
});

test('resetchannels without an & grant is reported as missing', () => {
  const contract = buildSocketIoChannelContract(PREFIX);
  assert.throws(() => assertAclChannelCoverage(contract, []), /\[none\]/u);
  assert.throws(
    () => assertAclChannelCoverage(contract, ['socket.io#*']),
    /do not allow Socket.IO Pub\/Sub channels/u,
  );
});

test('exact PSUBSCRIBE grants alone do not cover SUBSCRIBE/PUBLISH channels', () => {
  const contract = buildSocketIoChannelContract(PREFIX);
  const result = checkAclChannelCoverage(contract, contract.psubscribePatterns);
  assert.equal(result.covered, false);
  assert.deepEqual(result.missingPatterns, []);
  assert.ok(result.missing.includes('inventory-v2:-request#/#'));
});

test('redisGlobToRegExp handles *, ?, character classes and regex metacharacters', () => {
  assert.equal(redisGlobToRegExp('inv-*:*').test('inv-2:#/#x'), true);
  assert.equal(redisGlobToRegExp('inv:channel-?').test('inv:channel-1'), true);
  assert.equal(redisGlobToRegExp('inv:channel-?').test('inv:channel-12'), false);
  assert.equal(redisGlobToRegExp('inv:[ab]:*').test('inv:a:x'), true);
  assert.equal(redisGlobToRegExp('inv.[ab].*').test('inv-a-x'), false);
});

test('parses & and ~ patterns out of a commented, line-continued ACL rule', () => {
  const acl = `# Canonical rule — PSUBSCRIBE <PREFIX>:#/#* needs an exact grant.
user inventory-v2 on ><PASSWORD> \\
  ~<PREFIX>:* &<PREFIX>:* &<PREFIX>:#/#* &<PREFIX>:#/notifications#* \\
  +@all -@admin -@dangerous +info
`;
  assert.deepEqual(parseAclChannelPatterns(acl), [
    'inventory-v2:*',
    'inventory-v2:#/#*',
    'inventory-v2:#/notifications#*',
  ]);
  assert.deepEqual(parseAclKeyPatterns(acl), ['inventory-v2:*']);
  assert.doesNotThrow(() =>
    assertAclChannelCoverage(buildSocketIoChannelContract(PREFIX), parseAclChannelPatterns(acl)),
  );
});

test('parseAclRuleTokens exposes only permission tokens usable in ACL SETUSER', () => {
  const acl = `# comment mentioning ~ignored:* and &ignored:*
user inventory-v2 on ><PASSWORD> \\
  ~<PREFIX>:* &<PREFIX>:* +@all -@admin -@dangerous +info
`;
  assert.deepEqual(parseAclRuleTokens(acl), [
    '~inventory-v2:*',
    '&inventory-v2:*',
    '+@all',
    '-@admin',
    '-@dangerous',
    '+info',
  ]);
});

test('allchannels and +allchannels style flags are understood', () => {
  assert.deepEqual(parseAclChannelPatterns('user x on >p allchannels +@all'), ['*']);
});

test('a different REDIS_KEY_PREFIX must produce a different required grant', () => {
  const acl = 'user staging on >p ~<PREFIX>:* &<PREFIX>:* &<PREFIX>:#/#* +@all';
  const staging = buildSocketIoChannelContract('staging-v2');
  assert.equal(checkAclChannelCoverage(staging, parseAclChannelPatterns(acl, 'staging-v2')).covered, false);
  assert.equal(
    checkAclChannelCoverage(staging, staging.requiredAclPatterns).covered,
    true,
  );
  assert.equal(checkAclChannelCoverage(staging, ['inventory-v2:*']).covered, false);
  assert.equal(SOCKETIO_NAMESPACES.length, 2);
});
