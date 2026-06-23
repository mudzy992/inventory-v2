import { useCallback, useEffect, useState } from 'react';
import { fetchAuthenticatedBlob } from '../../api/client';
import { apiRequest, ApiError } from '../../api/client';
import type { TransferRecord } from '../../types';

export type TransferDocumentPreviewMode = 'generated' | 'signed';

interface UploadMeta {
  id: string;
  mime: string;
  path: string;
}

interface UseTransferDocumentPreviewOptions {
  transfer: TransferRecord;
  autoPreview?: TransferDocumentPreviewMode | false;
}

export const useTransferDocumentPreview = ({
  transfer,
  autoPreview = false,
}: UseTransferDocumentPreviewOptions) => {
  const [uploadMeta, setUploadMeta] = useState<UploadMeta | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [uploadLookupDone, setUploadLookupDone] = useState(false);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  useEffect(() => {
    if (!transfer.scannedDocUrl) {
      setUploadMeta(null);
      setUploadLookupDone(true);
      return;
    }
    let cancelled = false;
    setUploadLookupDone(false);
    void apiRequest<UploadMeta[]>(`/uploads?entityType=transfer&entityId=${transfer.id}`)
      .then((uploads) => {
        if (cancelled) {
          return;
        }
        const first = Array.isArray(uploads) ? uploads[0] : null;
        setUploadMeta(first ?? null);
      })
      .catch(() => {
        if (!cancelled) {
          setUploadMeta(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setUploadLookupDone(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [transfer.id, transfer.scannedDocUrl]);

  const loadGeneratedPreview = useCallback(async () => {
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const blob = await fetchAuthenticatedBlob(
        `/transfers/${transfer.id}/generated-document?format=pdf`,
      );
      setPreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return URL.createObjectURL(blob);
      });
    } catch (err) {
      const apiMessage = err instanceof ApiError ? err.message : '';
      if (apiMessage.includes('Generated pdf not available') || apiMessage.includes('not found')) {
        setPreviewError(
          'PDF još nije generisan. Pokušajte ponovo — starije prenosnice se automatski regenerišu pri prvom zahtjevu. Ako ne uspije, preuzmite DOCX.',
        );
      } else {
        setPreviewError(
          'PDF nije dostupan (provjerite postavku generate_print_pdf i LibreOffice na serveru). Preuzmite DOCX.',
        );
      }
      setPreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return null;
      });
    } finally {
      setIsPreviewLoading(false);
    }
  }, [transfer.id]);

  const loadSignedPreview = useCallback(async () => {
    if (!uploadMeta) {
      setPreviewError('Potpisani sken nije uploadovan.');
      return;
    }
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const blob = await fetchAuthenticatedBlob(`/uploads/${uploadMeta.id}`);
      setPreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return URL.createObjectURL(blob);
      });
    } catch {
      setPreviewError('Greška pri učitavanju potpisane prenosnice.');
      setPreviewUrl((previous) => {
        if (previous) {
          URL.revokeObjectURL(previous);
        }
        return null;
      });
    } finally {
      setIsPreviewLoading(false);
    }
  }, [uploadMeta]);

  useEffect(() => {
    if (!autoPreview) {
      return;
    }
    if (autoPreview === 'generated') {
      void loadGeneratedPreview();
      return;
    }
    if (!uploadLookupDone) {
      return;
    }
    if (uploadMeta) {
      void loadSignedPreview();
      return;
    }
    setPreviewError('Potpisani sken nije uploadovan.');
  }, [
    autoPreview,
    loadGeneratedPreview,
    loadSignedPreview,
    uploadLookupDone,
    uploadMeta,
  ]);

  const handleManualGeneratedPreview = () => {
    void loadGeneratedPreview();
  };

  const handleManualSignedPreview = () => {
    void loadSignedPreview();
  };

  return {
    uploadMeta,
    previewUrl,
    previewError,
    isPreviewLoading,
    handleManualGeneratedPreview,
    handleManualSignedPreview,
    reloadAutoPreview: autoPreview === 'generated' ? loadGeneratedPreview : loadSignedPreview,
  };
};

export type { UploadMeta };
