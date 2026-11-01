import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useEstado, useRaiz } from '@/dados/store';
import { statusDoDia, trabalhadoresDaObra } from '@/dominio/regras';
import { T } from '@/ui/base';
import { Cartao, Equipe, Status } from '@/ui/equipe';
import { cor } from '@/ui/tema';

export default function Fichas() {
  const router = useRouter();
  const e = useEstado();
  const { obra_id } = useRaiz();
  const agora = new Date().toISOString();

  return (
    <Equipe perfis={['tecnico', 'gestor']} titulo="Fichas NR-6">
      {trabalhadoresDaObra(e, obra_id!).map((t) => {
        const entregas = e.entregas.filter((x) => x.trabalhador_id === t.id).length;
        return (
          <Pressable key={t.id} accessibilityRole="link" onPress={() => router.push(`/tecnico/ficha/${t.id}`)}>
            <Cartao>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T tam={17} peso="extra" c={cor.fundo}>{t.nome}</T>
                  <T tam={14} c={cor.claroTexto}>Matrícula {t.matricula} · {entregas} entregas</T>
                </View>
                <Status status={statusDoDia(e, t.id, agora)} />
              </View>
            </Cartao>
          </Pressable>
        );
      })}
    </Equipe>
  );
}
