import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { InventoryPrintScopeDto } from '../../api/inventory-api';
import { getEmployeeFullName, getOrgUnitPath } from '../../helpers';
import { buildInventoryPrintEquipmentName } from '../../helpers/equipment-display.util';
import type { CompanyHeaderInput } from '../../helpers/company-header.util';
import type { AppState } from '../../types';

export interface InventoryPrintRow {
  inventoryNumber: string;
  name: string;
}

export interface InventoryPrintGroup {
  key: string;
  title: string;
  subtitle?: string;
  rows: InventoryPrintRow[];
}

export interface InventoryPrintPageBlock {
  groupTitle: string;
  groupSubtitle?: string;
  rows: InventoryPrintRow[];
  showGroupHeader: boolean;
}

export interface InventoryPrintPage {
  pageNumber: number;
  blocks: InventoryPrintPageBlock[];
}

export interface InventoryPrintDocumentInput {
  scope: InventoryPrintScopeDto;
  state: AppState;
  company: CompanyHeaderInput;
  companyLine: string;
}

export const ROWS_PER_PAGE = 16;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const buildInventoryPrintGroups = (
  scope: InventoryPrintScopeDto,
  state: AppState,
): InventoryPrintGroup[] => {
  const byHolder = new Map<string, InventoryPrintGroup>();
  const warehouseGroup: InventoryPrintGroup = {
    key: 'warehouse',
    title: 'Skladište',
    rows: [],
  };
  for (const item of scope.equipment) {
    const category = state.categories.find((row) => row.id === item.categoryId);
    const row: InventoryPrintRow = {
      inventoryNumber: item.inventoryNumber,
      name: buildInventoryPrintEquipmentName(category, item.stockLot, item.specifications),
    };
    if (item.currentHolder) {
      const holderId = item.currentHolder.id;
      const existing = byHolder.get(holderId);
      const subtitle = getOrgUnitPath(state.orgUnits, item.currentHolder.orgUnitId);
      if (existing) {
        existing.rows.push(row);
      } else {
        byHolder.set(holderId, {
          key: holderId,
          title: getEmployeeFullName(item.currentHolder),
          subtitle,
          rows: [row],
        });
      }
    } else if (item.warehouse) {
      warehouseGroup.rows.push(row);
    }
  }
  const result = [...byHolder.values()].sort((a, b) => a.title.localeCompare(b.title));
  if (warehouseGroup.rows.length > 0) {
    result.push(warehouseGroup);
  }
  return result;
};

export const paginateInventoryPrintGroups = (groups: InventoryPrintGroup[]): InventoryPrintPage[] => {
  const pages: InventoryPrintPage[] = [];
  let currentPage: InventoryPrintPage = { pageNumber: 1, blocks: [] };
  let rowsOnPage = 0;
  const pushPage = () => {
    if (currentPage.blocks.length > 0) {
      pages.push(currentPage);
    }
    currentPage = { pageNumber: pages.length + 1, blocks: [] };
    rowsOnPage = 0;
  };
  for (const group of groups) {
    let rowIndex = 0;
    while (rowIndex < group.rows.length) {
      if (rowsOnPage >= ROWS_PER_PAGE) {
        pushPage();
      }
      const remaining = ROWS_PER_PAGE - rowsOnPage;
      const chunk = group.rows.slice(rowIndex, rowIndex + remaining);
      currentPage.blocks.push({
        groupTitle: group.title,
        groupSubtitle: group.subtitle,
        rows: chunk,
        showGroupHeader: rowIndex === 0,
      });
      rowIndex += chunk.length;
      rowsOnPage += chunk.length;
    }
  }
  if (currentPage.blocks.length > 0) {
    pages.push(currentPage);
  }
  return pages.length > 0 ? pages : [{ pageNumber: 1, blocks: [] }];
};

export const buildInventoryPrintPages = (input: InventoryPrintDocumentInput): InventoryPrintPage[] => {
  const groups = buildInventoryPrintGroups(input.scope, input.state);
  return paginateInventoryPrintGroups(groups);
};

const buildPrintMeta = (input: InventoryPrintDocumentInput) => {
  const { committee } = input.scope;
  const categoryLabels = committee.category?.name ?? '';
  const warehouseLabel = committee.warehouse?.name ?? '';
  const title = committee.name ?? `Popis — ${warehouseLabel || categoryLabels}`;
  return { categoryLabels, warehouseLabel, title };
};

const buildBlockHtml = (block: InventoryPrintPageBlock): string => {
  const header = block.showGroupHeader
    ? `<h2 style="font-size:13px;font-weight:600;margin:0 0 4px;border-bottom:1px solid #e5e7eb;padding-bottom:4px;">${escapeHtml(block.groupTitle)}</h2>${
        block.groupSubtitle
          ? `<p style="font-size:10px;color:#6b7280;margin:0 0 8px;">${escapeHtml(block.groupSubtitle)}</p>`
          : ''
      }`
    : `<p style="font-size:10px;color:#6b7280;margin:0 0 8px;font-style:italic;">Nastavak: ${escapeHtml(block.groupTitle)}</p>`;
  const rows = block.rows
    .map(
      (row) => `<tr>
        <td style="padding:4px 6px;border:1px solid #d1d5db;font-family:monospace;font-size:10px;">${escapeHtml(row.inventoryNumber)}</td>
        <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:10px;">${escapeHtml(row.name)}</td>
        <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:10px;text-align:center;"></td>
        <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:10px;"></td>
        <td style="padding:4px 6px;border:1px solid #d1d5db;font-size:10px;"></td>
      </tr>`,
    )
    .join('');
  return `${header}
    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr style="background:#f9fafb;">
          <th style="padding:4px 6px;border:1px solid #d1d5db;text-align:left;font-size:10px;width:90px;">Inv. broj</th>
          <th style="padding:4px 6px;border:1px solid #d1d5db;text-align:left;font-size:10px;">Naziv opreme</th>
          <th style="padding:4px 6px;border:1px solid #d1d5db;text-align:center;font-size:10px;width:36px;">Kol.</th>
          <th style="padding:4px 6px;border:1px solid #d1d5db;text-align:left;font-size:10px;width:70px;">Potpis</th>
          <th style="padding:4px 6px;border:1px solid #d1d5db;text-align:left;font-size:10px;width:90px;">Napomena</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
};

const buildPageFooterHtml = (): string => `
  <footer style="margin-top:12px;padding-top:8px;border-top:1px solid #d1d5db;">
    <p style="font-size:10px;color:#6b7280;margin:0 0 6px;">Potpisi komisije:</p>
    <div style="height:14px;border-bottom:1px solid #9ca3af;margin-bottom:6px;"></div>
    <div style="height:14px;border-bottom:1px solid #9ca3af;margin-bottom:6px;"></div>
    <div style="height:14px;border-bottom:1px solid #9ca3af;"></div>
  </footer>`;

export const buildInventoryPrintHtml = (input: InventoryPrintDocumentInput): string => {
  const pages = buildInventoryPrintPages(input);
  const totalPages = pages.length;
  const { categoryLabels, warehouseLabel, title } = buildPrintMeta(input);
  const companyBlock = input.company.name
    ? `<div style="text-align:center;margin-bottom:8px;">
        <p style="font-size:12px;font-weight:700;margin:0;">${escapeHtml(input.company.name)}</p>
        ${input.companyLine ? `<p style="font-size:10px;color:#6b7280;margin:4px 0 0;">${escapeHtml(input.companyLine)}</p>` : ''}
      </div>`
    : '';
  const pageHtml = pages
    .map((page) => {
      const blocks = page.blocks.map((block) => buildBlockHtml(block)).join('');
      return `<section class="page" style="page-break-after:always;">
        <header style="border-bottom:1px solid #d1d5db;padding-bottom:8px;margin-bottom:12px;">
          ${companyBlock}
          <h1 style="font-size:16px;font-weight:700;margin:0;">${escapeHtml(title)}</h1>
          ${warehouseLabel ? `<p style="font-size:11px;color:#4b5563;margin:4px 0 0;">Skladište: ${escapeHtml(warehouseLabel)}</p>` : ''}
          <p style="font-size:11px;color:#4b5563;margin:4px 0 0;">Popisuje se: ${escapeHtml(categoryLabels || '—')}</p>
        </header>
        ${blocks}
        ${buildPageFooterHtml()}
        <p style="font-size:9px;color:#9ca3af;text-align:right;margin-top:8px;">Stranica ${page.pageNumber} / ${totalPages}</p>
      </section>`;
    })
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>${escapeHtml(title)}</title>
    <style>
      @page { size: A4; margin: 15mm; }
      body { font-family: system-ui, sans-serif; color: #111827; font-size: 12px; margin: 0; padding: 16px; }
      .page:last-child { page-break-after: auto; }
    </style></head><body>${pageHtml}</body></html>`;
};

export const openInventoryPrintWindow = (html: string): void => {
  const win = window.open('', '_blank');
  if (!win) {
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
};

const slugifyFilename = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '') || 'popisna-lista';

const drawPdfPageHeader = (
  doc: jsPDF,
  input: InventoryPrintDocumentInput,
  pageNumber: number,
  totalPages: number,
): number => {
  const { categoryLabels, warehouseLabel, title } = buildPrintMeta(input);
  let y = 14;
  if (input.company.name) {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text(input.company.name, 105, y, { align: 'center' });
    y += 4;
    if (input.companyLine) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.text(input.companyLine, 105, y, { align: 'center' });
      y += 5;
    }
  }
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(title, 14, y);
  y += 5;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  if (warehouseLabel) {
    doc.text(`Skladište: ${warehouseLabel}`, 14, y);
    y += 4;
  }
  doc.text(`Popisuje se: ${categoryLabels || '—'}`, 14, y);
  y += 4;
  doc.setFontSize(8);
  doc.setTextColor(150);
  doc.text(`Stranica ${pageNumber} / ${totalPages}`, 196, 10, { align: 'right' });
  doc.setTextColor(0);
  return y + 2;
};

const drawPdfPageFooter = (doc: jsPDF): void => {
  const footerTop = 272;
  doc.setFontSize(8);
  doc.setTextColor(100);
  doc.text('Potpisi komisije:', 14, footerTop);
  doc.setDrawColor(156, 163, 175);
  doc.line(14, footerTop + 6, 196, footerTop + 6);
  doc.line(14, footerTop + 12, 196, footerTop + 12);
  doc.line(14, footerTop + 18, 196, footerTop + 18);
  doc.setTextColor(0);
};

export const downloadInventoryPrintPdf = (input: InventoryPrintDocumentInput): void => {
  const pages = buildInventoryPrintPages(input);
  const totalPages = pages.length;
  const { title } = buildPrintMeta(input);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  for (let pageIndex = 0; pageIndex < pages.length; pageIndex += 1) {
    if (pageIndex > 0) {
      doc.addPage();
    }
    const page = pages[pageIndex]!;
    let startY = drawPdfPageHeader(doc, input, page.pageNumber, totalPages);
    for (const block of page.blocks) {
      if (startY > 240) {
        drawPdfPageFooter(doc);
        doc.addPage();
        startY = drawPdfPageHeader(doc, input, page.pageNumber, totalPages);
      }
      if (block.showGroupHeader) {
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(block.groupTitle, 14, startY);
        startY += 4;
        if (block.groupSubtitle) {
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(100);
          doc.text(block.groupSubtitle, 14, startY);
          doc.setTextColor(0);
          startY += 4;
        }
      } else {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(100);
        doc.text(`Nastavak: ${block.groupTitle}`, 14, startY);
        doc.setTextColor(0);
        startY += 4;
      }
      autoTable(doc, {
        startY,
        head: [['Inv. broj', 'Naziv opreme', 'Kol.', 'Potpis', 'Napomena']],
        body: block.rows.map((row) => [row.inventoryNumber, row.name, '', '', '']),
        styles: { fontSize: 8, cellPadding: 1.5 },
        headStyles: { fillColor: [249, 250, 251], textColor: 20, fontStyle: 'bold' },
        columnStyles: {
          0: { cellWidth: 28, font: 'courier' },
          1: { cellWidth: 'auto' },
          2: { cellWidth: 10, halign: 'center' },
          3: { cellWidth: 22 },
          4: { cellWidth: 28 },
        },
        margin: { left: 14, right: 14 },
        theme: 'grid',
      });
      startY = (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }
    drawPdfPageFooter(doc);
  }
  doc.save(`${slugifyFilename(title)}.pdf`);
};
