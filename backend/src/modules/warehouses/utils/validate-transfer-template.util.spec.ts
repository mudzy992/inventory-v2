import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateTransferTemplateBuffer } from './validate-transfer-template.util';
import { createMinimalTransferTemplateDocx } from './create-minimal-transfer-template-docx.util';

describe('validate-transfer-template.util', () => {
  it('accepts a docx with all required placeholders', () => {
    const buffer = createMinimalTransferTemplateDocx();
    const result = validateTransferTemplateBuffer(buffer);
    assert.equal(result.valid, true);
    assert.deepEqual(result.missingPlaceholders, []);
  });

  it('rejects a docx missing placeholders', () => {
    const buffer = createMinimalTransferTemplateDocx(['broj_prenosnice', 'predao']);
    const result = validateTransferTemplateBuffer(buffer);
    assert.equal(result.valid, false);
    assert.ok(result.missingPlaceholders.includes('preuzeo'));
    assert.ok(result.missingPlaceholders.includes('potpisnik'));
  });

  it('rejects invalid binary content', () => {
    const result = validateTransferTemplateBuffer(Buffer.from('not-a-docx'));
    assert.equal(result.valid, false);
    assert.ok(result.renderError);
  });
});
