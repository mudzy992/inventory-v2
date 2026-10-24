const PDF_HEADER = Buffer.from('%PDF-', 'ascii');

export const hasPdfSignature = (buffer: Buffer): boolean =>
  buffer.length >= PDF_HEADER.length && buffer.subarray(0, PDF_HEADER.length).equals(PDF_HEADER);
