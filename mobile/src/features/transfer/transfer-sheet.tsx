import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { createTransferApi } from '@/api/transfers';
import { ApiError } from '@/api/errors';
import { useCatalog } from '@/auth/catalog-context';
import { useSession } from '@/auth/session-context';
import type { Employee, Equipment, TransferType } from '@/types/models';
import { Button } from '@/ui/button';
import { Sheet } from '@/ui/sheet';
import { TextField } from '@/ui/text-field';
import { SPACE, TOKENS } from '@/theme/tokens';
import { EmployeePicker } from '@/features/people/employee-picker';
import { transferTitle } from './guards';
import { buildTransferCreatePayload } from './payload';
import { resolveTransferWarehousePayload } from './warehouse';

export const TransferSheet = ({
  equipment,
  type,
  onClose,
  onDone,
}: {
  equipment: Equipment;
  type: TransferType | null;
  onClose: () => void;
  onDone: () => void;
}) => {
  const { user } = useSession();
  const catalog = useCatalog();
  const [person, setPerson] = useState<Employee | null>(null);
  const [reason, setReason] = useState('');
  const [preuzeo, setPreuzeo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const needsPerson = type === 'zaduzenje' || type === 'prenos';
  const warehouse = type
    ? resolveTransferWarehousePayload(type, equipment, user, catalog).toWarehouseId
    : undefined;
  const warehouseName = catalog.warehouses.find((row) => row.id === warehouse)?.name;

  const submit = async () => {
    if (!type) {
      return;
    }
    setError('');
    const result = buildTransferCreatePayload({
      catalog,
      user,
      equipment,
      type,
      toPerson: person,
      reason,
      manualPreuzeoLabel: preuzeo,
    });
    if (result.error || !result.payload) {
      setError(result.error ?? 'Greška');
      return;
    }
    setLoading(true);
    try {
      await createTransferApi(result.payload);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Prenos nije uspio.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={Boolean(type)} title={type ? transferTitle(type) : ''} onClose={onClose}>
      {needsPerson && !person ? (
        <EmployeePicker excludeId={equipment.currentHolderId} onSelect={setPerson} />
      ) : null}
      {person ? (
        <Text style={styles.picked}>
          {person.firstName} {person.lastName} · {person.title}
        </Text>
      ) : null}
      {type === 'razduzenje' && warehouseName ? (
        <Text style={styles.info}>Ciljno skladište: {warehouseName}</Text>
      ) : null}
      {(type === 'zaduzenje' || type === 'razduzenje') &&
      equipment.isAccountingTracked &&
      equipment.inventoryNumber ? (
        <TextField label="Preuzeo (opciono)" value={preuzeo} onChangeText={setPreuzeo} />
      ) : null}
      {type === 'razduzenje' ? (
        <TextField label="Razlog" value={reason} onChangeText={setReason} multiline />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Button label="Odustani" variant="secondary" onPress={onClose} />
        <Button label="Potvrdi" onPress={() => void submit()} loading={loading} />
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  picked: { color: TOKENS.brandInk, fontWeight: '600', marginBottom: SPACE.md },
  info: { color: TOKENS.inkMuted, marginBottom: SPACE.md },
  error: { color: TOKENS.dangerInk, marginBottom: SPACE.sm },
  actions: { flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.md },
});
