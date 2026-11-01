import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Platform, View } from 'react-native';
import { cor } from './tema';

/** Pede a câmera uma vez. Aparelho sem câmera ou recusa: as telas seguem sem ela. */
export function useCamera() {
  const [permissao, pedir] = useCameraPermissions();
  const [web, setWeb] = useState(Platform.OS !== 'web');

  useEffect(() => {
    if (permissao && !permissao.granted && permissao.canAskAgain) pedir().catch(() => {});
  }, [permissao, pedir]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    navigator.mediaDevices
      ?.enumerateDevices()
      .then((d) => setWeb(d.some((x) => x.kind === 'videoinput')))
      .catch(() => setWeb(false));
  }, []);

  return Boolean(permissao?.granted && web);
}

export function Mira({ tam = 240, children }: { tam?: number; children?: ReactNode }) {
  const canto = (pos: object) => (
    <View style={{ position: 'absolute', width: 56, height: 56, borderColor: cor.laranja, ...pos }} />
  );
  return (
    <View style={{ width: tam, height: tam, alignItems: 'center', justifyContent: 'center' }} pointerEvents="none">
      {canto({ left: 0, top: 0, borderLeftWidth: 8, borderTopWidth: 8, borderTopLeftRadius: 16 })}
      {canto({ right: 0, top: 0, borderRightWidth: 8, borderTopWidth: 8, borderTopRightRadius: 16 })}
      {canto({ left: 0, bottom: 0, borderLeftWidth: 8, borderBottomWidth: 8, borderBottomLeftRadius: 16 })}
      {canto({ right: 0, bottom: 0, borderRightWidth: 8, borderBottomWidth: 8, borderBottomRightRadius: 16 })}
      {children}
    </View>
  );
}

/** Leitor de QR contínuo; ignora releituras enquanto a tela reage à anterior. */
export function LeitorQR({
  onLer,
  lanterna = false,
  children,
}: {
  onLer: (codigo: string) => void;
  lanterna?: boolean;
  children?: ReactNode;
}) {
  const camera = useCamera();
  const ultima = useRef({ codigo: '', quando: 0 });

  const aoLer = (r: BarcodeScanningResult) => {
    const agora = Date.now();
    if (r.data === ultima.current.codigo && agora - ultima.current.quando < 3000) return;
    ultima.current = { codigo: r.data, quando: agora };
    onLer(r.data);
  };

  return (
    <View
      style={{
        flex: 1,
        borderRadius: 20,
        backgroundColor: cor.superficie,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 20,
      }}
    >
      {camera ? (
        <CameraView
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          facing="back"
          enableTorch={lanterna}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={aoLer}
        />
      ) : null}
      {children}
    </View>
  );
}
