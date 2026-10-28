#!/usr/bin/env node
/**
 * Frontend code-only contract gate (CI: "Verify frontend design system and a11y contract").
 *
 * Uses the TypeScript compiler API for real JSX AST facts instead of grep.
 * Everything here is deterministic, offline and dependency-free apart from
 * `typescript`, which is already a frontend devDependency.
 *
 *   node scripts/check-frontend-contract.mjs          # from frontend/
 *   node scripts/check-frontend-contract.mjs --json  # machine-readable report
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const SRC = join(ROOT, 'src');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const walk = (dir, acc = []) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path, acc);
    else acc.push(path);
  }
  return acc;
};
const allFiles = walk(SRC);
const sourceFiles = allFiles.filter((f) => /\.(?:ts|tsx)$/u.test(f));
const productionFiles = sourceFiles.filter((f) => !/\.spec\./u.test(f) && !f.includes('/test/'));
const tagName = (node) => node.tagName.getText(node.getSourceFile());
const attributes = (node) =>
  new Map(
    node.attributes.properties
      .filter(ts.isJsxAttribute)
      .map((attr) => [attr.name.getText(attr.getSourceFile()), attr]),
  );

/** Real JSX facts — not regex approximations. */
const analyseJsx = () => {
  const result = {
    buttons: 0,
    buttonsWithoutType: [],
    inputs: 0,
    inputsWithoutName: [],
    images: 0,
    imagesWithoutAlt: [],
    nonInteractiveClicks: 0,
    nonInteractiveClickViolations: [],
    ariaAttributes: 0,
  };
  const NON_INTERACTIVE = new Set(['div', 'span', 'tr', 'td', 'li', 'p', 'section']);

  for (const file of allFiles.filter((f) => f.endsWith('.tsx') && !f.includes('.spec.'))) {
    const text = readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const rel = relative(ROOT, file);
    const visit = (node) => {
      if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
        const tag = tagName(node);
        const attrs = attributes(node);
        const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
        const where = `${rel}:${line}`;
        for (const key of attrs.keys()) if (key.startsWith('aria-')) result.ariaAttributes += 1;

        if (tag === 'button') {
          result.buttons += 1;
          if (!attrs.has('type')) result.buttonsWithoutType.push(where);
        }
        if (tag === 'img') {
          result.images += 1;
          if (!attrs.has('alt')) result.imagesWithoutAlt.push(where);
        }
        if (tag === 'input') {
          result.inputs += 1;
          const named =
            attrs.has('aria-label') ||
            attrs.has('aria-labelledby') ||
            attrs.has('id') ||
            attrs.has('placeholder') ||
            attrs.has('title');
          let insideLabel = false;
          let parent = node.parent;
          for (let depth = 0; depth < 5 && parent; depth += 1) {
            if (ts.isJsxElement(parent) && tagName(parent.openingElement) === 'label') {
              insideLabel = true;
              break;
            }
            parent = parent.parent;
          }
          if (!named && !insideLabel) result.inputsWithoutName.push(where);
        }
        if (NON_INTERACTIVE.has(tag) && attrs.has('onClick')) {
          result.nonInteractiveClicks += 1;
          const role = attrs.get('role')?.initializer;
          const roleText = role && ts.isStringLiteral(role) ? role.text : '';
          const isContainer = roleText === 'presentation' || roleText === 'dialog';
          const isKeyboardOperable = attrs.has('onKeyDown') && attrs.has('tabIndex');
          if (!isContainer && !isKeyboardOperable) {
            result.nonInteractiveClickViolations.push(where);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return result;
};

/** WCAG 2.2 contrast (kept independent from src/design-system/contrast.ts). */
const luminance = (hex) => {
  const full = hex.replace('#', '');
  const channels = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
  const [r, g, b] = channels.map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

const parseThemeTokens = (css) => {
  const theme = css.slice(css.indexOf('@theme {'), css.indexOf('}', css.indexOf('@theme {')));
  const tokens = new Map();
  for (const match of theme.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6});/gu)) {
    tokens.set(match[1], match[2]);
  }
  return tokens;
};

const AA_PAIRS = [
  ['ink', 'panel'],
  ['ink', 'canvas'],
  ['ink-muted', 'panel'],
  ['ink-muted', 'subtle'],
  ['ink-muted', 'canvas'],
  ['brand-ink', 'brand-soft'],
  ['danger-ink', 'panel'],
  ['success-ink', 'panel'],
  ['warning-ink', 'panel'],
  ['success-ink', 'success-soft'],
  ['warning-ink', 'warning-soft'],
  ['danger-ink', 'danger-soft'],
];
const WHITE_ON = ['brand', 'brand-hover', 'danger-ink'];

const REDESIGNED_FILES = [
  'src/components/Layout.tsx',
  'src/components/LoginPage.tsx',
  'src/components/LoginForm.tsx',
  'src/components/app-nav-drawer.tsx',
  'src/components/app-sidebar-nav.tsx',
  'src/components/sidebar-nav-button.tsx',
  'src/components/ui/app-brand.tsx',
  'src/components/ui/app-error-boundary.tsx',
  'src/components/ui/app-loading-screen.tsx',
  'src/components/ui/auth-shell.tsx',
  'src/components/ui/badge.tsx',
  'src/components/ui/button.tsx',
  'src/components/ui/form-styles.ts',
  'src/components/ui/page-header.tsx',
  'src/components/ui/route-page-fallback.tsx',
  'src/components/ui/user-menu.tsx',
];

const main = () => {
  const jsx = analyseJsx();

  // --- F-5 / F-6: accessibility invariants --------------------------------
  assert.deepEqual(jsx.buttonsWithoutType, [], 'every <button> must declare an explicit type');
  assert.deepEqual(jsx.inputsWithoutName, [], 'every <input> needs an accessible name');
  assert.deepEqual(jsx.imagesWithoutAlt, [], 'every <img> needs an alt attribute');
  assert.deepEqual(
    jsx.nonInteractiveClickViolations,
    [],
    'non-interactive onClick needs role=presentation/dialog or onKeyDown + tabIndex',
  );
  assert.ok(jsx.buttons >= 200, 'AST must actually see the application buttons');
  assert.ok(jsx.ariaAttributes >= 200, 'accessible attributes must not regress');

  // --- F-1 / F-2: test runner and error boundary wiring -------------------
  const pkg = JSON.parse(read('package.json'));
  assert.equal(pkg.scripts['test:unit'], 'vitest run', 'frontend must own its unit test script');
  assert.ok(pkg.devDependencies.vitest, 'vitest must be a declared devDependency');
  assert.ok(pkg.devDependencies.jsdom, 'DOM test environment must be declared');
  assert.ok(existsSync(join(ROOT, 'vitest.config.ts')));
  const vitestConfig = read('vitest.config.ts');
  assert.match(vitestConfig, /environment:\s*'jsdom'/u);
  const specs = allFiles.filter((f) => /\.spec\.(?:ts|tsx)$/u.test(f));
  assert.ok(specs.length >= 10, `expected >= 10 frontend specs, found ${specs.length}`);
  const mainTs = read('src/main.tsx');
  assert.match(mainTs, /<AppErrorBoundary>/u, 'root render must be inside the error boundary');
  const boundary = read('src/components/ui/app-error-boundary.tsx');
  assert.match(boundary, /getDerivedStateFromError/u);
  assert.match(boundary, /componentDidCatch/u);
  assert.match(boundary, /role="alert"/u);
  assert.match(read('src/App.tsx'), /AppLoadingScreen/u);

  // --- F-3 / F-4 / F-7: design system contract ---------------------------
  const css = read('src/index.css');
  const tokens = parseThemeTokens(css);
  for (const name of [
    'canvas', 'panel', 'subtle', 'ink', 'ink-muted', 'ink-subtle', 'line',
    'line-strong', 'brand', 'brand-hover', 'brand-soft', 'brand-ink',
    'success-ink', 'warning-ink', 'danger-ink', 'focus',
    'success-soft', 'warning-soft', 'danger-soft',
  ]) {
    assert.ok(tokens.has(name), `missing semantic CSS token --color-${name}`);
  }
  for (const [foreground, background] of AA_PAIRS) {
    const r = ratio(tokens.get(foreground), tokens.get(background));
    assert.ok(r >= 4.5, `WCAG AA: ${foreground} on ${background} is only ${r.toFixed(2)}:1`);
  }
  for (const background of WHITE_ON) {
    const r = ratio('#ffffff', tokens.get(background));
    assert.ok(r >= 4.5, `WCAG AA: white on ${background} is only ${r.toFixed(2)}:1`);
  }
  assert.match(css, /:focus-visible\s*\{/u, 'global keyboard focus rule required');
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /prefers-contrast: more/u);
  assert.match(css, /\.ds-skip-link/u);
  assert.ok(existsSync(join(SRC, 'design-system/tokens.ts')));
  assert.ok(existsSync(join(SRC, 'design-system/contrast.ts')));
  assert.ok(existsSync(join(ROOT, '../docs/frontend-design-system.md')));

  // Redesigned surfaces must be token-driven, not a second ad-hoc palette.
  for (const file of REDESIGNED_FILES) {
    assert.ok(existsSync(join(ROOT, file)), `redesigned file missing: ${file}`);
    const source = read(file);
    assert.doesNotMatch(
      source,
      /#[0-9a-fA-F]{6}\b/u,
      `${file} contains a raw hex colour; use a semantic token`,
    );
    assert.doesNotMatch(
      source,
      /\b(?:bg|text|border|ring|from|to)-(?:slate|gray|blue|red|green|amber|purple|indigo|teal|orange|emerald)-(?:50|100|200|300|400|500|600|700|800|900)\b/u,
      `${file} uses a legacy palette utility instead of semantic tokens`,
    );
    assert.doesNotMatch(source, /outline-none/u, `${file} must not remove the focus outline`);
  }

  // Security / hygiene across production sources.
  for (const file of productionFiles) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/u, `no raw HTML injection in ${relative(ROOT, file)}`);
    assert.doesNotMatch(source, /console\.(?:log|warn|error|debug)/u, `no free-form console in ${relative(ROOT, file)}`);
    assert.doesNotMatch(source, /@ts-ignore/u);
  }

  const report = {
    files: sourceFiles.length,
    specs: specs.length,
    buttons: jsx.buttons,
    inputs: jsx.inputs,
    ariaAttributes: jsx.ariaAttributes,
    keyboardClickHandlers: jsx.nonInteractiveClicks,
    tokens: tokens.size,
    aaPairs: AA_PAIRS.length + WHITE_ON.length,
    redesignedFiles: REDESIGNED_FILES.length,
  };
  if (process.argv.includes('--json')) console.log(JSON.stringify({ pass: true, report }, null, 2));
  else
    console.log(
      `Frontend contract passed (${report.specs} specs, ${report.buttons} typed buttons, ` +
        `${report.inputs} named inputs, ${report.aaPairs} AA pairs, ` +
        `${report.tokens} tokens, ${report.redesignedFiles} token-driven surfaces).`,
    );
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
