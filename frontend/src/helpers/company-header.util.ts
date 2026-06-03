export interface CompanyHeaderInput {
  name?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  phone?: string;
  email?: string;
  taxId?: string;
}

export const buildCompanyAddressLine = (input: CompanyHeaderInput): string => {
  const cityPart = [input.postalCode, input.city].filter(Boolean).join(' ');
  return [input.address, cityPart].filter(Boolean).join(', ');
};

export const buildCompanyHeaderHtml = (input: CompanyHeaderInput): string => {
  const name = input.name?.trim() || 'Preduzeće';
  const addressLine = buildCompanyAddressLine(input);
  const contactParts = [input.phone, input.email, input.taxId ? `JIB: ${input.taxId}` : '']
    .filter(Boolean)
    .join(' · ');
  return `
    <div class="company-header" style="text-align:center;margin-bottom:20px;border-bottom:2px solid #333;padding-bottom:15px;">
      <div style="font-size:16px;font-weight:bold;">${escapeHtml(name)}</div>
      ${addressLine ? `<div style="font-size:12px;margin-top:6px;">${escapeHtml(addressLine)}</div>` : ''}
      ${contactParts ? `<div style="font-size:11px;color:#555;margin-top:4px;">${escapeHtml(contactParts)}</div>` : ''}
    </div>
  `;
};

export const companyHeaderFromSettings = (
  settings: Record<string, string | number | boolean>,
): CompanyHeaderInput => ({
  name: String(settings['company.name'] ?? ''),
  address: String(settings['company.address'] ?? ''),
  city: String(settings['company.city'] ?? ''),
  postalCode: String(settings['company.postalCode'] ?? ''),
  phone: String(settings['company.phone'] ?? ''),
  email: String(settings['company.email'] ?? ''),
  taxId: String(settings['company.taxId'] ?? ''),
});

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
