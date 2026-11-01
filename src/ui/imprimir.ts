import * as Print from 'expo-print';
import { Platform } from 'react-native';

/** Abre o diálogo de impressão, onde a ficha pode ser salva em PDF. */
export async function imprimir(html: string) {
  if (Platform.OS !== 'web') {
    await Print.printAsync({ html });
    return;
  }
  const quadro = document.createElement('iframe');
  quadro.style.display = 'none';
  quadro.srcdoc = html;
  quadro.onload = () => {
    quadro.contentWindow?.print();
    setTimeout(() => quadro.remove(), 60_000);
  };
  document.body.appendChild(quadro);
}

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };
export const escapar = (texto: string) => texto.replace(/[&<>"]/g, (c) => ESCAPES[c]);
