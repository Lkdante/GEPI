// Aceite do termo no primeiro uso, sem texto para digitar (PDF, seções 5 e 10).
import { Redirect, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { definirFluxo, transacao, useEstado, useRaiz } from '@/dados/store';
import { registrarConsentimento } from '@/dominio/operacoes';
import { BotaoOuvir, T, Tela, useFala } from '@/ui/base';
import { Icone } from '@/ui/Icone';
import { cor } from '@/ui/tema';

const FRASE =
  'A foto serve só para conferir se você está com o E P I. Seu rosto fica desfocado. O app não reconhece rostos. Você concorda?';

export default function Consentimento() {
  const router = useRouter();
  const e = useEstado();
  const { fluxo } = useRaiz();
  useFala(FRASE);
  if (!fluxo) return <Redirect href="/" />;
  const t = e.trabalhadores.find((x) => x.id === fluxo.trabalhador_id)!;

  const aceitar = () => {
    transacao((est, ctx) => registrarConsentimento(est, ctx, t));
    router.replace('/selfie');
  };
  const recusar = () => {
    definirFluxo(null);
    router.replace('/');
  };

  const Opcao = ({ sim }: { sim: boolean }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sim ? 'Concordo' : 'Não concordo'}
      onPress={sim ? aceitar : recusar}
      style={{ flex: 1, height: 150, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: sim ? cor.verde : cor.laranjaFundo, borderWidth: sim ? 0 : 3, borderColor: cor.laranja }}
    >
      <Icone nome={sim ? 'sim' : 'nao'} tam={60} cor={sim ? cor.branco : cor.laranja} />
      <T tam={20} peso="extra">{sim ? 'Concordo' : 'Não concordo'}</T>
    </Pressable>
  );

  return (
    <Tela>
      <View style={{ padding: 20, gap: 8 }}>
        <T tam={26} peso="extra">{t.nome.split(' ')[0]}, antes de começar</T>
      </View>
      <View style={{ marginHorizontal: 20, padding: 20, borderRadius: 20, backgroundColor: cor.superficie, gap: 18 }}>
        {['A foto serve só para conferir o EPI', 'Seu rosto fica desfocado', 'O app não reconhece rostos'].map((frase) => (
          <View key={frase} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
            <Icone nome="check" tam={28} cor={cor.laranja} esp={3} />
            <T tam={19} peso="forte" style={{ flexShrink: 1 }}>{frase}</T>
          </View>
        ))}
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ paddingHorizontal: 20, paddingBottom: 12 }}>
        <BotaoOuvir texto={FRASE} tam={64} />
      </View>
      <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 20, paddingBottom: 28 }}>
        <Opcao sim={false} />
        <Opcao sim />
      </View>
    </Tela>
  );
}
