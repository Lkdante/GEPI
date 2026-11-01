import { Redirect, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useEstado, useRaiz } from '@/dados/store';
import { episExigidos, entregaAtiva, situacaoRegistro } from '@/dominio/regras';
import { Botao, Rolagem, T, Tela, useFala } from '@/ui/base';
import { Icone, Selo } from '@/ui/Icone';
import { dataCurta } from '@/ui/formato';
import { cor } from '@/ui/tema';

export default function MeusEPIs() {
  const router = useRouter();
  const e = useEstado();
  const { fluxo } = useRaiz();
  useFala('Seus E P Is');
  if (!fluxo) return <Redirect href="/" />;

  const t = e.trabalhadores.find((x) => x.id === fluxo.trabalhador_id)!;
  const agora = new Date().toISOString();

  return (
    <Tela>
      <View style={{ padding: 20 }}>
        <T tam={26} peso="extra">Meus EPIs</T>
        <T tam={16} c={cor.textoSuave}>{t.nome}</T>
      </View>
      <Rolagem style={{ paddingHorizontal: 20, gap: 12 }}>
        {episExigidos(e, t).map((epi) => {
          const entrega = entregaAtiva(e, t.id, epi.id);
          const ok = situacaoRegistro(e, t, epi, agora) === 'ok';
          return (
            <View key={epi.id} style={{ borderRadius: 16, backgroundColor: cor.superficie, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Icone nome={epi.icone} tam={44} esp={1.8} />
              <View style={{ flex: 1 }}>
                <T tam={18} peso="forte">{epi.descricao}</T>
                <T tam={14} c={cor.textoSuave}>
                  {entrega ? `Válido até ${dataCurta(entrega.validade_uso)}` : 'Ainda não recebeu'}
                </T>
              </View>
              <Selo tipo={ok ? 'ok' : 'atencao'} />
            </View>
          );
        })}
      </Rolagem>
      <View style={{ padding: 20 }}>
        <Botao titulo="Voltar" variante="escuro" onPress={() => router.back()} />
      </View>
    </Tela>
  );
}
