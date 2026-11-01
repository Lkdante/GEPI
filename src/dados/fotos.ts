// Arquivos de foto ficam fora do estado: a imagem nunca trafega junto com os dados.
import { File, Paths } from 'expo-file-system';
import { Platform } from 'react-native';

/** No navegador a foto vive só na sessão; a evidência que fica é o hash. */
const memoria = new Map<string, string>();

function arquivo(id: string) {
  return new File(Paths.document, `foto-${id}.jpg`);
}

export function salvarFoto(id: string, uri: string) {
  if (Platform.OS === 'web') {
    memoria.set(id, uri);
    return;
  }
  new File(uri).copy(arquivo(id));
}

export function uriFoto(id: string | null): string | null {
  if (!id) return null;
  if (Platform.OS === 'web') return memoria.get(id) ?? null;
  const f = arquivo(id);
  return f.exists ? f.uri : null;
}

export async function apagarFoto(id: string) {
  memoria.delete(id);
  if (Platform.OS !== 'web' && arquivo(id).exists) arquivo(id).delete();
}
