// Crachá com QR. O PDF prevê token assinado pelo servidor; sem backend, o token é
// aleatório e pode ser trocado aqui se o crachá for perdido.
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { transacao, useEstado } from '@/dados/store';
import { atualizar } from '@/dominio/operacoes';
import { Botao, T } from '@/ui/base';
import { Cartao, Equipe, Vazio } from '@/ui/equipe';
import { cor } from '@/ui/tema';

export default function Cracha() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = useEstado();
  const t = e.trabalhadores.find((x) => x.id === id);
  if (!t) return <Equipe perfis={['encarregado']} titulo="Crachá"><Vazio>Não encontrado.</Vazio></Equipe>;

  const funcao = e.funcoes.find((f) => f.id === t.funcao_id)?.nome;
  const empresa = e.empresas.find((x) => x.id === t.empregadora_id)?.razao_social;

  return (
    <Equipe perfis={['encarregado']} titulo="Crachá">
      <Cartao gap={12}>
        <View style={{ alignItems: 'center', gap: 10, paddingVertical: 8 }}>
          <QRCode value={t.cracha_token} size={220} />
          <T tam={22} peso="extra" c={cor.fundo}>{t.nome}</T>
          <T tam={15} c={cor.claroTexto}>{funcao} · {empresa}</T>
          <T tam={15} c={cor.claroTexto}>Matrícula {t.matricula}</T>
        </View>
      </Cartao>
      <Botao
        titulo="Crachá perdido: gerar novo código"
        variante="preto"
        alto={56}
        tam={16}
        onPress={() =>
          transacao((est, ctx) => atualizar(est, ctx, 'trabalhadores', t.id, { cracha_token: ctx.uuid() }))
        }
      />
    </Equipe>
  );
}
