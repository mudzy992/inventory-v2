import { TransfersPage } from './TransfersPage';
import type { PageId } from './page-id';

interface DocumentsPageProps {
  onNavigate?: (page: PageId) => void;
}

/** Preusmjerava na modul Zaduženja → tab Prenosnice (kompatibilnost navigacije / bookmarka). */
export function DocumentsPage({ onNavigate }: DocumentsPageProps) {
  return <TransfersPage onNavigate={onNavigate} initialTab="documents" />;
}