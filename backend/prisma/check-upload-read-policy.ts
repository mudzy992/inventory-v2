import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as ts from 'typescript';
import {
  requireReadableUploadEntityType,
  resolveUploadAbsolutePath,
} from '../src/modules/uploads/upload-access-policy.util';

/**
 * Release gate for the upload read paths. GET /uploads used to accept an
 * arbitrary entityType string and silently SKIP authorisation for anything
 * other than 'transfer'; download did the same for stored rows of other types
 * (or with no entityId) and joined a DB path without containment checks.
 *
 * This gate keeps the allow-list and the exhaustive authorizer switch in sync
 * via the TypeScript AST, and forbids the old unsafe patterns at source level.
 */

const ROOT = resolve('.');
const REPO = resolve(ROOT, '..');

const parse = (file: string): ts.SourceFile =>
  ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);

const stringArray = (file: string, variableName: string): string[] => {
  const source = parse(file);
  let values: string[] | undefined;
  source.forEachChild((node) => {
    if (!ts.isVariableStatement(node)) return;
    for (const declaration of node.declarationList.declarations) {
      if (
        ts.isIdentifier(declaration.name) &&
        declaration.name.text === variableName &&
        declaration.initializer &&
        ts.isAsExpression(declaration.initializer) &&
        ts.isArrayLiteralExpression(declaration.initializer.expression)
      ) {
        values = declaration.initializer.expression.elements
          .filter(ts.isStringLiteral)
          .map((element) => element.text);
      }
    }
  });
  if (!values) throw new Error(`String array ${variableName} not found in ${file}`);
  return values.sort();
};

const switchCases = (file: string, methodName: string): string[] => {
  const source = parse(file);
  const values: string[] = [];
  const visit = (node: ts.Node, inside: boolean): void => {
    const next =
      inside ||
      (ts.isMethodDeclaration(node) &&
        ts.isIdentifier(node.name) &&
        node.name.text === methodName);
    if (next && ts.isCaseClause(node) && ts.isStringLiteral(node.expression)) {
      values.push(node.expression.text);
    }
    node.forEachChild((child) => visit(child, next));
  };
  source.forEachChild((node) => visit(node, false));
  return values.sort();
};

const main = (): void => {
  const policyFile = resolve(ROOT, 'src/modules/uploads/upload-access-policy.util.ts');
  const serviceFile = resolve(ROOT, 'src/modules/uploads/uploads.service.ts');
  const dtoFile = resolve(ROOT, 'src/modules/uploads/dto/list-uploads-query.dto.ts');
  const controllerFile = resolve(ROOT, 'src/modules/uploads/uploads.controller.ts');

  // 1. Every readable entity type MUST have an authorizer branch.
  const allowed = stringArray(policyFile, 'UPLOAD_READABLE_ENTITY_TYPES');
  const authorizers = switchCases(serviceFile, 'authorizeUploadRead');
  assert.deepEqual(
    allowed,
    authorizers,
    'UPLOAD_READABLE_ENTITY_TYPES and UploadsService.authorizeUploadRead cases must match exactly',
  );
  assert.ok(allowed.length > 0);

  // 2. Behavioural self-test of the policy helpers.
  assert.equal(requireReadableUploadEntityType('transfer'), 'transfer');
  assert.throws(() => requireReadableUploadEntityType('equipment'));
  assert.throws(() => resolveUploadAbsolutePath('/srv/app/uploads', '../../etc/passwd'));
  assert.match(
    resolveUploadAbsolutePath('/srv/app/uploads', 'prenosnice/w1/2026/file.pdf'),
    /\/srv\/app\/uploads\/prenosnice\/w1\/2026\/file\.pdf$/u,
  );

  // 3. Controller + DTO: no raw unvalidated query strings.
  const controller = readFileSync(controllerFile, 'utf8');
  assert.match(controller, /@Query\(\)\s+query:\s*ListUploadsQueryDto/u);
  assert.doesNotMatch(controller, /@Query\('entityType'\)/u);
  assert.doesNotMatch(controller, /@Query\('entityId'\)/u);
  const dto = readFileSync(dtoFile, 'utf8');
  assert.match(dto, /@IsIn\(UPLOAD_READABLE_ENTITY_TYPES\)/u);
  assert.match(dto, /@IsUUID\(\)/u);

  // 4. Service: no legacy cast, no conditional authorisation, no path leak.
  const service = readFileSync(serviceFile, 'utf8');
  assert.doesNotMatch(service, /entityType:\s*entityType as/u, 'no unchecked Prisma enum cast');
  assert.doesNotMatch(service, /upload\.entityType === 'transfer' && upload\.entityId/u);
  for (const expected of [
    'requireReadableUploadEntityType(',
    'requireAuthorizableStoredUpload(',
    'resolveUploadAbsolutePath(',
    'authorizeUploadRead(',
    'const exhaustive: never = type',
  ]) {
    assert.ok(service.includes(expected), `UploadsService must use ${expected}`);
  }
  assert.ok(
    (service.match(/resolveUploadAbsolutePath\(/gu) ?? []).length >= 2,
    'containment must guard both the write and the download path',
  );
  const listSelect = /findByEntity\([\s\S]{0,700}?select:\s*\{([^}]*)\}/u.exec(service);
  assert.ok(listSelect, 'findByEntity must use an explicit select');
  assert.doesNotMatch(listSelect[1], /\bpath:\s*true/u, 'internal upload paths must not be published');

  // 5. Frontend no longer expects the removed internal path field.
  const preview = readFileSync(
    resolve(REPO, 'frontend/src/components/transfers/use-transfer-document-preview.ts'),
    'utf8',
  );
  assert.doesNotMatch(preview, /interface UploadMeta \{[\s\S]{0,160}?path:/u);

  // 6. The decision is documented.
  const guide = readFileSync(resolve(REPO, 'docs/upload-read-policy.md'), 'utf8');
  for (const expected of ['entityType', 'entityId', 'allow-list', 'containment', 'fail-closed']) {
    assert.ok(guide.includes(expected), `upload read policy guide must mention ${expected}`);
  }

  console.log(
    `Upload read policy passed (${allowed.length} authorizable entity type(s) [${allowed.join(', ')}], ` +
      `exhaustive authorizer switch, strict query DTO, path containment on write+download, no internal path leak).`,
  );
};

try {
  main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
