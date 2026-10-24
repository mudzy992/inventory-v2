export interface ZipEntryBudget {
  name: string;
  isDirectory: boolean;
  compressedBytes: number;
  uncompressedBytes: number;
}

const MAX_DOCX_ENTRIES = 2_000;
const ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE = 0x06054b50;
const ZIP_END_OF_CENTRAL_DIRECTORY_MIN_BYTES = 22;
const MAX_ZIP_COMMENT_BYTES = 65_535;
const MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES = 64 * 1024 * 1024;
const MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;
const MAX_DOCX_COMPRESSION_RATIO = 100;

/** Checks the ZIP directory count from EOCD before PizZip allocates entry objects. */
export const getDocxZipEntryCountError = (buffer: Buffer): string | undefined => {
  const searchStart = Math.max(
    0,
    buffer.length - ZIP_END_OF_CENTRAL_DIRECTORY_MIN_BYTES - MAX_ZIP_COMMENT_BYTES,
  );
  for (
    let offset = buffer.length - ZIP_END_OF_CENTRAL_DIRECTORY_MIN_BYTES;
    offset >= searchStart;
    offset -= 1
  ) {
    if (buffer.readUInt32LE(offset) !== ZIP_END_OF_CENTRAL_DIRECTORY_SIGNATURE) {
      continue;
    }
    const commentLength = buffer.readUInt16LE(offset + 20);
    if (offset + ZIP_END_OF_CENTRAL_DIRECTORY_MIN_BYTES + commentLength !== buffer.length) {
      continue;
    }
    const currentDisk = buffer.readUInt16LE(offset + 4);
    const centralDirectoryDisk = buffer.readUInt16LE(offset + 6);
    const entriesOnDisk = buffer.readUInt16LE(offset + 8);
    const totalEntries = buffer.readUInt16LE(offset + 10);
    if (currentDisk !== 0 || centralDirectoryDisk !== 0 || entriesOnDisk !== totalEntries) {
      return 'DOCX arhiva sa više diskova nije podržana';
    }
    if (totalEntries > MAX_DOCX_ENTRIES) {
      return `DOCX arhiva sadrži previše datoteka (maksimalno ${MAX_DOCX_ENTRIES})`;
    }
    return undefined;
  }
  return undefined;
};

export const getDocxZipBudgetError = (entries: ZipEntryBudget[]): string | undefined => {
  const files = entries.filter((entry) => !entry.isDirectory);
  if (files.length > MAX_DOCX_ENTRIES) {
    return `DOCX arhiva sadrži previše datoteka (maksimalno ${MAX_DOCX_ENTRIES})`;
  }

  let totalUncompressedBytes = 0;
  for (const entry of files) {
    const { compressedBytes, uncompressedBytes } = entry;
    if (
      !Number.isSafeInteger(compressedBytes) ||
      !Number.isSafeInteger(uncompressedBytes) ||
      compressedBytes < 0 ||
      uncompressedBytes < 0
    ) {
      return 'DOCX arhiva sadrži neispravne podatke o veličini';
    }
    if (uncompressedBytes > MAX_DOCX_ENTRY_UNCOMPRESSED_BYTES) {
      return `Datoteka ${entry.name} unutar DOCX arhive prelazi dozvoljenu veličinu`;
    }
    if (
      uncompressedBytes > 0 &&
      (compressedBytes === 0 || uncompressedBytes / compressedBytes > MAX_DOCX_COMPRESSION_RATIO)
    ) {
      return `DOCX arhiva ima nedozvoljen omjer kompresije za datoteku ${entry.name}`;
    }
    totalUncompressedBytes += uncompressedBytes;
    if (totalUncompressedBytes > MAX_DOCX_TOTAL_UNCOMPRESSED_BYTES) {
      return 'Ukupna raspakovana veličina DOCX arhive prelazi dozvoljenu granicu';
    }
  }
  return undefined;
};
