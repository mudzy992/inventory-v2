import type jsPDF from 'jspdf';

const UNICODE_FONT_FILE = 'DejaVuSans.ttf';
const UNICODE_FONT_FAMILY = 'DejaVuSans';

let cachedFontBase64: string | null = null;

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
};

const loadUnicodeFontBase64 = async (): Promise<string> => {
  if (cachedFontBase64) {
    return cachedFontBase64;
  }
  const response = await fetch('/fonts/DejaVuSans.ttf');
  if (!response.ok) {
    throw new Error('Unicode font for PDF export is not available.');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  cachedFontBase64 = bytesToBase64(bytes);
  return cachedFontBase64;
};

export const applyUnicodeFontToDoc = async (doc: jsPDF): Promise<string> => {
  const base64 = await loadUnicodeFontBase64();
  doc.addFileToVFS(UNICODE_FONT_FILE, base64);
  doc.addFont(UNICODE_FONT_FILE, UNICODE_FONT_FAMILY, 'normal');
  doc.addFont(UNICODE_FONT_FILE, UNICODE_FONT_FAMILY, 'bold');
  return UNICODE_FONT_FAMILY;
};
