import { Plus } from 'lucide-react';
import { Button } from '../ui/button';
import { EmptyState } from '../ui/empty-state';
import { inputClass, labelClass } from '../ui/form-styles';

interface InventorySessionEmptyStateProps {
  distributionName?: string;
  sessionName: string;
  year: number;
  onSessionNameChange: (value: string) => void;
  onYearChange: (value: number) => void;
  onCreate: () => void;
}

export const InventorySessionEmptyState = ({
  distributionName,
  sessionName,
  year,
  onSessionNameChange,
  onYearChange,
  onCreate,
}: InventorySessionEmptyStateProps) => (
  <div className="flex flex-col items-center justify-center py-12 px-4">
    <EmptyState
      message={
        distributionName
          ? `Nema sesija popisa za ${distributionName}. Kreirajte prvu sesiju da biste definisali popisne komisije.`
          : 'Kreirajte sesiju popisa za odabranu distribuciju.'
      }
    />
    <div className="mt-6 w-full max-w-md space-y-3">
      <div>
        <label className={labelClass}>Naziv sesije</label>
        <input
          value={sessionName}
          onChange={(event) => onSessionNameChange(event.target.value)}
          className={inputClass}
          placeholder="POPIS 2026"
        />
      </div>
      <div>
        <label className={labelClass}>Godina</label>
        <input
          type="number"
          value={year}
          onChange={(event) => onYearChange(Number(event.target.value))}
          className={inputClass}
          min={2000}
          max={2100}
        />
      </div>
      <Button onClick={onCreate} disabled={!sessionName.trim()}>
        <Plus size={14} />
        Kreiraj sesiju
      </Button>
    </div>
  </div>
);
