import { useEffect } from 'react';
import type { CategoryField } from '../../types';
import {
  useSpecificationValueAvailability,
  type AvailabilityStatus,
} from '../../hooks/use-equipment-availability';
import { AvailabilityHint } from './availability-hint';
import { CategoryFieldControl } from './category-field-control';

interface IssueUniqueFieldInputProps {
  categoryId: string;
  field: CategoryField;
  value: string;
  onChange: (next: string) => void;
  onAvailabilityChange: (fieldId: string, status: AvailabilityStatus) => void;
}

export const IssueUniqueFieldInput = ({
  categoryId,
  field,
  value,
  onChange,
  onAvailabilityChange,
}: IssueUniqueFieldInputProps) => {
  const status = useSpecificationValueAvailability(categoryId, field.id, value);

  useEffect(() => {
    onAvailabilityChange(field.id, status);
  }, [field.id, onAvailabilityChange, status]);

  return (
    <div>
      <CategoryFieldControl field={field} value={value} onChange={onChange} />
      <AvailabilityHint status={status} />
    </div>
  );
};
