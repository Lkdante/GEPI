// Matriz Função × Tarefa: é ela que define o que o check-in do dia exige.
import { useState } from 'react';
import { View } from 'react-native';
import { transacao, useEstado } from '@/dados/store';
import { atualizar, inserir } from '@/dominio/operacoes';
import type { Tarefa } from '@/dominio/tipos';
import { ROTULO_TAREFA } from '@/dominio/tipos';
import { T } from '@/ui/base';
import { Cartao, Chip, Equipe, Secao } from '@/ui/equipe';
import { Icone } from '@/ui/Icone';
import { cor } from '@/ui/tema';

export default function Matriz() {
  const e = useEstado();
  const [funcao, setFuncao] = useState(e.funcoes[0].id);
  const [tarefa, setTarefa] = useState<Tarefa>('altura');

  function alternar(epi_id: string) {
    transacao((est, ctx) => {
      const m = est.matriz.find((x) => x.funcao_id === funcao && x.tarefa === tarefa && x.epi_id === epi_id);
      if (m) atualizar(est, ctx, 'matriz', m.id, { obrigatorio: !m.obrigatorio });
      else inserir(est, ctx, 'matriz', null, { funcao_id: funcao, tarefa, epi_id, obrigatorio: true });
    });
  }

  return (
    <Equipe perfis={['tecnico']} titulo="Matriz de EPI">
      <Secao>Função</Secao>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {e.funcoes.map((f) => (
          <Chip key={f.id} titulo={f.nome} ativo={f.id === funcao} onPress={() => setFuncao(f.id)} />
        ))}
      </View>
      <Secao>Tarefa</Secao>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(ROTULO_TAREFA) as Tarefa[]).map((k) => (
          <Chip key={k} titulo={ROTULO_TAREFA[k]} ativo={k === tarefa} onPress={() => setTarefa(k)} />
        ))}
      </View>
      <Secao>EPIs obrigatórios</Secao>
      {e.epis.map((epi) => {
        const ativo = e.matriz.some(
          (m) => m.funcao_id === funcao && m.tarefa === tarefa && m.epi_id === epi.id && m.obrigatorio,
        );
        return (
          <Cartao key={epi.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icone nome={epi.icone} tam={32} cor={cor.fundo} esp={1.8} />
              <T tam={16} peso="forte" c={cor.fundo} style={{ flex: 1 }}>{epi.descricao}</T>
              <Chip titulo={ativo ? 'Obrigatório' : 'Não exigido'} ativo={ativo} onPress={() => alternar(epi.id)} />
            </View>
          </Cartao>
        );
      })}
    </Equipe>
  );
}
