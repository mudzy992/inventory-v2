#!/usr/bin/env node
/**
 * Reproducibility gate for the three production images.
 *
 * `npm audit` in CI only describes the committed lockfiles. If an image can
 * silently fall back to `npm install` (or copy a wildcard lockfile name), the
 * deployed dependency tree is NOT the audited tree. This check is dependency
 * free on purpose: it runs before any install, in every CI job, from the repo
 * root, using nothing but node: builtins.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PACKAGE_DIRS = ['backend', 'frontend', 'document-worker'];
export const REQUIRED_NODE_MAJOR = 22;
export const ALLOWED_REGISTRY_HOSTS = new Set(['registry.npmjs.org']);
export const REQUIRED_LOCKFILE_VERSION = 3;

const stripLineComments = (content) =>
  content
    .split(/\r?\n/)
    .map((line) => (/^\s*#/.test(line) ? '' : line))
    .join('\n');

// Join Docker's backslash continuations so a multi-line RUN is one instruction.
export function logicalLines(content) {
  const lines = [];
  let buffer = '';
  for (const raw of content.split(/\r?\n/)) {
    buffer += `${buffer ? ' ' : ''}${raw.trim()}`;
    if (/\\\s*$/.test(raw)) {
      buffer = buffer.replace(/\\\s*$/, '').trimEnd();
      continue;
    }
    lines.push(buffer);
    buffer = '';
  }
  if (buffer) lines.push(buffer);
  return lines;
}

const stable = (value) =>
  value === undefined
    ? '{}'
    : JSON.stringify(
        Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b))),
      );

/** Validate one canonical service Dockerfile. Returns a list of error strings. */
export function analyzeDockerfile(label, rawContent, { nodeMajor = REQUIRED_NODE_MAJOR } = {}) {
  const errors = [];
  const content = stripLineComments(rawContent);

  const copyLines = content.match(/^\s*COPY\b.*$/gim) || [];
  const lockCopies = copyLines.filter((line) => line.includes('package-lock.json'));
  if (lockCopies.length === 0) {
    errors.push(`${label}: dependency COPY must include package-lock.json explicitly`);
  } else if (lockCopies.some((line) => line.includes('package-lock.json*'))) {
    errors.push(
      `${label}: wildcard package-lock.json* permits a build without a lockfile; use the exact filename`,
    );
  }
  if (!lockCopies.some((line) => /\bpackage\.json\b/.test(line))) {
    errors.push(`${label}: dependency COPY must include package.json`);
  }
  if (!/^\s*RUN npm ci(?:\s|$)/m.test(content)) {
    errors.push(`${label}: dependencies must be installed with "RUN npm ci" (lockfile-only)`);
  }
  if (/\bnpm\s+(?:install|i)\b/.test(content)) {
    errors.push(`${label}: npm install resolves unpinned versions inside the image`);
  }
  const npmInstructions = logicalLines(content).filter((line) => /\bnpm\b/.test(line));
  if (npmInstructions.some((line) => /\|\|/.test(line))) {
    errors.push(`${label}: shell fallback (||) can mask a failed npm ci`);
  }
  if (npmInstructions.some((line) => /2>\s*\/dev\/null/.test(line))) {
    errors.push(`${label}: 2>/dev/null hides install/integrity failures`);
  }

  const nodeImages = [...content.matchAll(/^\s*FROM\s+node:(\d+)/gim)].map((match) =>
    Number(match[1]),
  );
  if (nodeImages.length === 0) {
    errors.push(`${label}: no pinned node:<major> base image found`);
  }
  for (const major of nodeImages) {
    if (major !== nodeMajor) {
      errors.push(`${label}: node:${major} does not match the CI/runtime Node ${nodeMajor}`);
    }
  }
  return errors;
}

/** Validate package.json / package-lock.json consistency and registry provenance. */
export function analyzeLockfile(label, packageText, lockText) {
  const errors = [];
  let pkg;
  let lock;
  try {
    pkg = JSON.parse(packageText);
    lock = JSON.parse(lockText);
  } catch (error) {
    return [`${label}: package.json / package-lock.json is not valid JSON: ${error.message}`];
  }

  if (lock.lockfileVersion !== REQUIRED_LOCKFILE_VERSION) {
    errors.push(
      `${label}: lockfileVersion ${String(lock.lockfileVersion)} !== ${REQUIRED_LOCKFILE_VERSION} (npm 9+, deterministic installs)`,
    );
  }
  const root = lock.packages?.[''];
  if (!root) {
    errors.push(`${label}: lockfile is missing packages[""] root entry`);
  } else {
    if (root.name !== pkg.name || root.version !== pkg.version) {
      errors.push(
        `${label}: lockfile root ${root.name}@${root.version} !== package.json ${pkg.name}@${pkg.version}`,
      );
    }
    for (const field of ['dependencies', 'devDependencies', 'optionalDependencies']) {
      if (stable(root[field]) !== stable(pkg[field])) {
        errors.push(
          `${label}: ${field} in the lockfile root is out of sync with package.json; run npm install to refresh the lockfile`,
        );
      }
    }
  }

  for (const [name, entry] of Object.entries(lock.packages || {})) {
    if (!name || !entry?.resolved) continue;
    let parsed;
    try {
      parsed = new URL(entry.resolved);
    } catch {
      errors.push(`${label}: ${name} has a non-URL resolved value "${entry.resolved}"`);
      continue;
    }
    if (parsed.protocol !== 'https:') {
      errors.push(`${label}: ${name} resolves over ${parsed.protocol} instead of https`);
    }
    if (!ALLOWED_REGISTRY_HOSTS.has(parsed.host)) {
      errors.push(`${label}: ${name} resolves from unapproved host ${parsed.host}`);
    }
    if (!entry.integrity) {
      errors.push(`${label}: ${name} has no integrity hash`);
    }
  }

  const specs = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
    ...pkg.optionalDependencies,
  };
  for (const [name, spec] of Object.entries(specs)) {
    if (/^(?:\*|latest|next|file:|git(?:\+|:)|https?:|link:)/.test(String(spec))) {
      errors.push(`${label}: dependency ${name}@${spec} is not a pinned registry range`);
    }
  }
  return errors;
}

/** Ensure CI installs from lockfiles, audits every workspace, and uses the agreed Node major. */
export function analyzeCiWorkflow(label, rawContent, { nodeMajor = REQUIRED_NODE_MAJOR } = {}) {
  const errors = [];
  const content = stripLineComments(rawContent);
  const npmCi = (content.match(/\bnpm ci\b/g) || []).length;
  if (npmCi < PACKAGE_DIRS.length) {
    errors.push(
      `${label}: expected at least ${PACKAGE_DIRS.length} "npm ci" installs, found ${npmCi}`,
    );
  }
  if (/\bnpm\s+install\b/.test(content)) {
    errors.push(`${label}: CI uses npm install instead of npm ci`);
  }
  const audits = (content.match(/\bnpm audit --audit-level=low\b/g) || []).length;
  if (audits < PACKAGE_DIRS.length) {
    errors.push(
      `${label}: expected at least ${PACKAGE_DIRS.length} "npm audit --audit-level=low" steps, found ${audits}`,
    );
  }
  const configuredMajors = [
    ...content.matchAll(/^\s*node-version:\s*['"]?(\d+)/gim),
  ].map((match) => Number(match[1]));
  if (configuredMajors.length === 0 || configuredMajors.some((major) => major !== nodeMajor)) {
    errors.push(`${label}: every setup-node step must pin node-version: ${nodeMajor}`);
  }
  return errors;
}

/** Reject compose builds that point at a legacy/alternative Dockerfile. */
export function analyzeComposeRefs(label, rawContent, { exists = () => true } = {}) {
  const errors = [];
  const content = stripLineComments(rawContent);
  let context = null;
  let refs = 0;
  for (const line of content.split(/\r?\n/)) {
    const contextMatch = line.match(/^\s*context:\s*['"]?([^'"\s]+)['"]?/);
    if (contextMatch) {
      context = contextMatch[1].replace(/^\.\//, '');
      continue;
    }
    const dockerfileMatch = line.match(/^\s*dockerfile:\s*['"]?([^'"\s]+)['"]?/);
    if (!dockerfileMatch) continue;
    refs += 1;
    const dockerfile = dockerfileMatch[1];
    if (!context || !PACKAGE_DIRS.includes(context)) {
      errors.push(`${label}: dockerfile ${dockerfile} has unknown context ${String(context)}`);
      continue;
    }
    if (dockerfile !== 'Dockerfile') {
      errors.push(
        `${label}: ${context} builds ${dockerfile} instead of the canonical, policy-checked Dockerfile`,
      );
    }
    if (!exists(join(context, dockerfile))) {
      errors.push(`${label}: ${join(context, dockerfile)} does not exist`);
    }
  }
  if (refs === 0) {
    errors.push(`${label}: no compose build.dockerfile references found`);
  }
  return errors;
}

/** Analyse the real repository. Injectable readers keep it unit-testable. */
export function checkWorkspace({
  root,
  read = (path) => readFileSync(path, 'utf8'),
  exists = existsSync,
} = {}) {
  const errors = [];
  for (const dir of PACKAGE_DIRS) {
    errors.push(
      ...analyzeDockerfile(`${dir}/Dockerfile`, read(join(root, dir, 'Dockerfile'))),
      ...analyzeLockfile(
        dir,
        read(join(root, dir, 'package.json')),
        read(join(root, dir, 'package-lock.json')),
      ),
    );
    if (!exists(join(root, dir, 'package-lock.json'))) {
      errors.push(`${dir}: package-lock.json is missing or untracked`);
    }
  }
  errors.push(
    ...analyzeCiWorkflow('.github/workflows/ci.yml', read(join(root, '.github/workflows/ci.yml'))),
  );
  for (const compose of ['docker-compose.yml', 'docker-compose.prod.yml']) {
    errors.push(
      ...analyzeComposeRefs(compose, read(join(root, compose)), {
        exists: (relative) => exists(join(root, relative)),
      }),
    );
  }
  const composeRefs = ['docker-compose.yml', 'docker-compose.prod.yml'].reduce(
    (total, file) => total + (read(join(root, file)).match(/^\s*dockerfile:/gim) || []).length,
    0,
  );
  return { errors, composeRefs };
}

function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const root = resolve(scriptDir, '..');
  const { errors, composeRefs } = checkWorkspace({ root });
  if (errors.length > 0) {
    console.error('Container dependency policy failed:');
    for (const error of errors) console.error(`  - ${error}`);
    console.error('\nFix the image/lockfile policy, then re-run this check.');
    process.exitCode = 1;
    return;
  }
  console.log(
    `Container dependency policy passed (${PACKAGE_DIRS.length} canonical Dockerfiles, ` +
      `${PACKAGE_DIRS.length} in-sync lockfiles, ${composeRefs} compose build refs, ` +
      `Node ${REQUIRED_NODE_MAJOR}, npm ci + npm audit enforced in CI).`,
  );
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
