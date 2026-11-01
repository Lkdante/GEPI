// Fila de requisições: o passo 3 do ciclo começa aqui.
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { useEstado, useRaiz } from '@/dados/store';
import { saldoEPI } from '@/dominio/regras';
import type { Requisicao } from '@/dominio/tipos';
import { ROTULO_MOTIVO } from '@/dominio/tipos';
import { Botao, T } from '@/ui/base';
import { Cartao, Equipe, Secao, Vazio } from '@/ui/equipe';
import { haQuanto } from '@/ui/formato';
import { Icone } from '@/ui/Icone';
import { cor } from '@/ui/tema';

export default function FilaAlmox() {
  const router = useRouter();
  const e = useEstado();
  const { obra_id } = useRaiz();
  const agora = new Date().toISOString();

  const daObra = e.requisicoes.filter((r) => r.obra_id === obra_id && r.para_quem === 'construtora');
  const ordem = (r: Requisicao) => (r.prioridade === 'normal' ? 0 : 1);
  const abertas = daObra.filter((r) => r.status === 'aberta').sort((a, b) => ordem(a) - ordem(b));
  const semEstoque = daObra.filter((r) => r.status === 'aguardando_compra');

  const Linha = ({ r, acao }: { r: Requisicao; acao: boolean }) => {
    const t = e.trabalhadores.find((x) => x.id === r.trabalhador_id)!;
    const epi = e.epis.find((x) => x.id === r.epi_id)!;
    return (
      <Cartao>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icone nome={epi.icone} tam={40} cor={cor.fundo} esp={1.8} />
          <View style={{ flex: 1 }}>
            <T tam={17} peso="extra" c={cor.fundo}>{epi.descricao}</T>
            <T tam={14} c={cor.claroTexto}>
              {t.nome} · {ROTULO_MOTIVO[r.motivo]} · {haQuanto(r.criado_em, agora)}
            </T>
            <T tam={14} c={cor.claroTexto}>
              Saldo: {saldoEPI(e, epi.id, r.obra_id!)} · {epi.local}
            </T>
          </View>
        </View>
        {acao ? (
          <Botao titulo="Entregar" alto={56} tam={16} onPress={() => router.push(`/almox/entrega?req=${r.id}`)} />
        ) : null}
      </Cartao>
    );
  };

  return (
    <Equipe perfis={['almoxarife']} titulo="Fila de requisições">
      {abertas.length === 0 ? <Vazio>Nenhum pedido aguardando entrega.</Vazio> : null}
      {abertas.map((r) => <Linha key={r.id} r={r} acao />)}
      {semEstoque.length > 0 ? <Secao>Aguardando compra</Secao> : null}
      {semEstoque.map((r) => <Linha key={r.id} r={r} acao={false} />)}
    </Equipe>
  );
}
