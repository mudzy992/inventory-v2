import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALLOWED_REGISTRY_HOSTS,
  PACKAGE_DIRS,
  REQUIRED_NODE_MAJOR,
  analyzeCiWorkflow,
  analyzeComposeRefs,
  analyzeDockerfile,
  analyzeLockfile,
  checkWorkspace,
  logicalLines,
} from './check-container-dependency-policy.mjs';

const GOOD_DOCKERFILE = `# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-bookworm-slim AS runner
# Unrelated fallback for user creation must NOT be flagged as an install fallback.
RUN groupadd -g "101" app 2>/dev/null || groupadd --system app
`;

const PACKAGE_JSON = {
  name: '@inventory-v2/backend',
  version: '0.1.0',
  dependencies: { express: '^4.21.2' },
  devDependencies: { tsx: '^4.20.0' },
};

const goodLock = () => ({
  name: PACKAGE_JSON.name,
  version: PACKAGE_JSON.version,
  lockfileVersion: 3,
  packages: {
    '': {
      name: PACKAGE_JSON.name,
      version: PACKAGE_JSON.version,
      dependencies: { ...PACKAGE_JSON.dependencies },
      devDependencies: { ...PACKAGE_JSON.devDependencies },
    },
    'node_modules/express': {
      version: '4.21.2',
      resolved: 'https://registry.npmjs.org/express/-/express-4.21.2.tgz',
      integrity: 'sha512-abc',
    },
  },
});

const asJson = (value) => JSON.stringify(value);
const lockErrors = (lock, pkg = PACKAGE_JSON) =>
  analyzeLockfile('fixture', asJson(pkg), asJson(lock));

const GOOD_CI = `name: Branch CI
on: push
jobs:
${PACKAGE_DIRS.map(
  (dir) => `  ${dir}:
    steps:
      - uses: actions/setup-node@v7
        with:
          node-version: 22
          cache-dependency-path: ${dir}/package-lock.json
      - run: npm ci
        working-directory: ${dir}
      - run: npm audit --audit-level=low
        working-directory: ${dir}
`,
).join('')}`;

const GOOD_COMPOSE = `services:
${PACKAGE_DIRS.map(
  (dir) => `  ${dir}:
    build:
      context: ./${dir}
      dockerfile: Dockerfile
`,
).join('')}`;

test('canonical Dockerfile passes and unrelated shell fallbacks are ignored', () => {
  assert.deepEqual(analyzeDockerfile('backend/Dockerfile', GOOD_DOCKERFILE), []);
  assert.equal(REQUIRED_NODE_MAJOR, 22);
  assert.ok(ALLOWED_REGISTRY_HOSTS.has('registry.npmjs.org'));
});

test('Dockerfile rejects a wildcard lockfile COPY and a missing lockfile', () => {
  const wildcard = GOOD_DOCKERFILE.replace(
    'COPY package.json package-lock.json ./',
    'COPY package.json package-lock.json* ./',
  );
  assert.match(analyzeDockerfile('worker/Dockerfile', wildcard).join('\n'), /wildcard/);

  const noLock = GOOD_DOCKERFILE.replace(
    'COPY package.json package-lock.json ./',
    'COPY package.json ./',
  );
  assert.match(analyzeDockerfile('worker/Dockerfile', noLock).join('\n'), /must include package-lock/);
});

test('Dockerfile rejects npm install, silent fallbacks and hidden errors', () => {
  const fallback = GOOD_DOCKERFILE.replace('RUN npm ci', 'RUN npm ci 2>/dev/null || npm install');
  const errors = analyzeDockerfile('worker/Dockerfile', fallback).join('\n');
  assert.match(errors, /npm install/);
  assert.match(errors, /shell fallback/);
  assert.match(errors, /2>\/dev\/null/);

  const installOnly = GOOD_DOCKERFILE.replace('RUN npm ci', 'RUN npm install');
  assert.match(analyzeDockerfile('worker/Dockerfile', installOnly).join('\n'), /must be installed with/);

  const suppressed = GOOD_DOCKERFILE.replace('RUN npm ci', 'RUN npm ci 2>/dev/null');
  assert.match(analyzeDockerfile('worker/Dockerfile', suppressed).join('\n'), /2>\/dev\/null/);
});

test('logicalLines joins Docker continuations so multi-line fallbacks are caught', () => {
  const joined = logicalLines('RUN npm ci \\\n  || npm install\nRUN echo done');
  assert.equal(joined.length, 2);
  assert.match(joined[0], /npm ci.*\|\| npm install/);

  const multiLine = GOOD_DOCKERFILE.replace('RUN npm ci', 'RUN npm ci \\\n  || npm install');
  assert.match(analyzeDockerfile('worker/Dockerfile', multiLine).join('\n'), /shell fallback/);
});

test('Dockerfile enforces the CI Node major and rejects an unpinned base image', () => {
  const old = GOOD_DOCKERFILE.replace(/node:22/g, 'node:18');
  assert.match(analyzeDockerfile('backend/Dockerfile', old).join('\n'), /node:18 does not match/);
  const latest = GOOD_DOCKERFILE.replace(/node:22-bookworm-slim/g, 'node:latest');
  assert.match(analyzeDockerfile('backend/Dockerfile', latest).join('\n'), /no pinned node/);
});

test('lockfile passes when root metadata, integrity and registry are clean', () => {
  assert.deepEqual(lockErrors(goodLock()), []);
});

test('lockfile rejects stale dependencies, wrong version and wrong identity', () => {
  const stale = goodLock();
  stale.packages[''].dependencies.express = '^4.18.0';
  assert.match(lockErrors(stale).join('\n'), /dependencies in the lockfile root is out of sync/);

  const staleDev = goodLock();
  delete staleDev.packages[''].devDependencies.tsx;
  assert.match(lockErrors(staleDev).join('\n'), /devDependencies in the lockfile root is out of sync/);

  const v2 = goodLock();
  v2.lockfileVersion = 2;
  assert.match(lockErrors(v2).join('\n'), /lockfileVersion 2/);

  const renamed = goodLock();
  renamed.packages[''].name = '@inventory-v2/other';
  assert.match(lockErrors(renamed).join('\n'), /!== package.json/);
});

test('lockfile rejects foreign registries, missing integrity and loose specs', () => {
  const foreign = goodLock();
  foreign.packages['node_modules/express'].resolved =
    'https://evil.example.com/express/-/express-4.21.2.tgz';
  assert.match(lockErrors(foreign).join('\n'), /unapproved host evil.example.com/);

  const noIntegrity = goodLock();
  delete noIntegrity.packages['node_modules/express'].integrity;
  assert.match(lockErrors(noIntegrity).join('\n'), /no integrity hash/);

  const httpOnly = goodLock();
  httpOnly.packages['node_modules/express'].resolved =
    'http://registry.npmjs.org/express/-/express-4.21.2.tgz';
  assert.match(lockErrors(httpOnly).join('\n'), /instead of https/);

  for (const spec of ['*', 'latest', 'file:../shared', 'git+ssh://git@github.com/x/y.git']) {
    const pkg = { ...PACKAGE_JSON, dependencies: { express: spec } };
    assert.match(lockErrors(goodLock(), pkg).join('\n'), /not a pinned registry range/);
  }

  assert.match(
    analyzeLockfile('fixture', '{not json', '{}').join('\n'),
    /not valid JSON/,
  );
});

test('CI workflow passes with npm ci, audit and Node 22 for every workspace', () => {
  assert.deepEqual(analyzeCiWorkflow('ci.yml', GOOD_CI), []);
});

test('CI workflow rejects npm install, missing audits and a Node major change', () => {
  assert.match(
    analyzeCiWorkflow('ci.yml', GOOD_CI.replace(/npm ci/g, 'npm install')).join('\n'),
    /npm install instead of npm ci/,
  );
  assert.match(
    analyzeCiWorkflow('ci.yml', GOOD_CI.replace(/npm audit --audit-level=low/g, 'npm audit')).join(
      '\n',
    ),
    /expected at least 3 "npm audit --audit-level=low"/,
  );
  assert.match(
    analyzeCiWorkflow('ci.yml', GOOD_CI.replace(/node-version: 22/g, 'node-version: 20')).join('\n'),
    /must pin node-version: 22/,
  );
});

test('compose refs pass for canonical Dockerfiles and reject legacy variants', () => {
  assert.deepEqual(analyzeComposeRefs('docker-compose.yml', GOOD_COMPOSE), []);
  const legacy = GOOD_COMPOSE.replace('dockerfile: Dockerfile', 'dockerfile: Dockerfilefr');
  assert.match(
    analyzeComposeRefs('docker-compose.yml', legacy).join('\n'),
    /instead of the canonical/,
  );
  const missing = analyzeComposeRefs('docker-compose.yml', GOOD_COMPOSE, {
    exists: (path) => path !== 'backend/Dockerfile',
  });
  assert.match(missing.join('\n'), /backend\/Dockerfile does not exist/);
  assert.match(
    analyzeComposeRefs('docker-compose.yml', 'services:\n  x:\n    build:\n      dockerfile: Dockerfile').join(
      '\n',
    ),
    /unknown context/,
  );
  assert.match(analyzeComposeRefs('docker-compose.yml', 'services: {}').join('\n'), /no compose/);
});

test('checkWorkspace passes against the real repository files', () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { errors, composeRefs } = checkWorkspace({ root });
  assert.deepEqual(errors, []);
  assert.equal(composeRefs, 6);
});
