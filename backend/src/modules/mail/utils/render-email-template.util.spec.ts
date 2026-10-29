import assert from 'node:assert/strict';
import test from 'node:test';
import {
  escapeHtml,
  extractTemplateVariables,
  renderEmailTemplate,
} from './render-email-template.util';

test('renders known variables and keeps unknown placeholders visible', () => {
  const out = renderEmailTemplate(
    'Prenosnica {{documentNumber}} za {{ equipmentName }} / {{nepoznato}}',
    { documentNumber: 'PR-1', equipmentName: 'Laptop' },
    'text',
  );
  assert.equal(out, 'Prenosnica PR-1 za Laptop / {{nepoznato}}');
});

test('html context escapes injected markup in values', () => {
  const out = renderEmailTemplate('<p>{{name}}</p>', { name: '<script>alert(1)</script>' }, 'html');
  assert.equal(out, '<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>');
  assert.equal(escapeHtml(`a & "b" 'c'`), 'a &amp; &quot;b&quot; &#39;c&#39;');
});

test('null/undefined values leave the placeholder untouched', () => {
  assert.equal(renderEmailTemplate('{{reason}}', { reason: null }, 'text'), '{{reason}}');
  assert.equal(renderEmailTemplate('{{reason}}', {}, 'text'), '{{reason}}');
});

test('extractTemplateVariables dedupes and sorts', () => {
  assert.deepEqual(extractTemplateVariables('{{b}} {{ a }} {{b}} {{c.d}}'), ['a', 'b', 'c.d']);
});
