import { useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { fetchEquipmentPageApi } from '@/api/equipment';
import { useSettings } from '@/auth/settings-context';
import { parseEquipmentQr } from '@/features/scan/parse-qr';
import { SPACE, TOKENS } from '@/theme/tokens';
import { Button } from '@/ui/button';
import { EmptyState } from '@/ui/empty-state';
import { TextField } from '@/ui/text-field';

export default function ScanScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { flag } = useSettings();
  const [permission, requestPermission] = useCameraPermissions();
  const lock = useRef(false);
  const [manual, setManual] = useState('');
  const [error, setError] = useState('');

  const openEquipment = (id: string) => {
    router.push(`/equipment/${id}`);
  };

  const resolve = async (raw: string) => {
    const parsed = parseEquipmentQr(raw);
    setError('');
    if (parsed.kind === 'uuid') {
      openEquipment(parsed.value);
      return;
    }
    try {
      const page = await fetchEquipmentPageApi({ search: parsed.value, page: 1, pageSize: 5 });
      if (page.items[0]) {
        openEquipment(page.items[0].id);
        return;
      }
      setError('Oprema nije pronađena.');
    } catch {
      setError('Pretraga nije uspjela.');
    }
  };

  if (!flag('features.qr_scanner') || !flag('features.equipment')) {
    return <EmptyState message="QR skener ili modul opreme je isključen." />;
  }

  if (!permission?.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.copy}>Kamera je potrebna za skeniranje QR koda.</Text>
        <Button label="Dozvoli kameru" onPress={() => void requestPermission()} />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={({ data }) => {
          if (lock.current) {
            return;
          }
          lock.current = true;
          void resolve(data).finally(() => {
            setTimeout(() => {
              lock.current = false;
            }, 1600);
          });
        }}
      />
      <View style={[styles.frameWrap, { paddingTop: insets.top }]} pointerEvents="none">
        <View style={styles.frame} />
        <Text style={styles.hint}>Poravnajte QR naljepnice opreme</Text>
      </View>
      <View style={[styles.manual, { paddingBottom: Math.max(insets.bottom, SPACE.md) }]}>
        <TextField
          label="Inventarni broj"
          value={manual}
          onChangeText={setManual}
          placeholder="Unesite broj ili zalijepite URL"
          autoCapitalize="none"
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Pressable onPress={() => void resolve(manual)} style={styles.manualBtn}>
          <Text style={styles.manualLabel}>Pronađi</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: '#0f172a', flex: 1 },
  center: { flex: 1, gap: SPACE.lg, justifyContent: 'center', padding: SPACE.xl },
  copy: { color: TOKENS.inkMuted, textAlign: 'center' },
  frameWrap: { alignItems: 'center', flex: 1, justifyContent: 'center' },
  frame: {
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: 20,
    borderWidth: 2,
    height: 220,
    width: 220,
  },
  hint: { color: TOKENS.white, marginTop: SPACE.md },
  manual: {
    backgroundColor: TOKENS.panel,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    gap: SPACE.sm,
    padding: SPACE.lg,
  },
  error: { color: TOKENS.dangerInk },
  manualBtn: {
    alignItems: 'center',
    backgroundColor: TOKENS.brand,
    borderRadius: 10,
    minHeight: 44,
    justifyContent: 'center',
  },
  manualLabel: { color: TOKENS.white, fontWeight: '700' },
});
