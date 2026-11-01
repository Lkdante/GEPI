// Decisões presenciais do encarregado. Tudo aqui fica na trilha com nome e motivo.
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { transacao, useEstado } from '@/dados/store';
import { liberarPresencial, pedirBloqueio, trocarTarefa } from '@/dominio/operacoes';
import { checkinDoDia, filaExcecoes, statusDoDia } from '@/dominio/regras';
import type { Tarefa } from '@/dominio/tipos';
import { ROTULO_TAREFA } from '@/dominio/tipos';
import { Botao, T } from '@/ui/base';
import { Campo, Cartao, Chip, Equipe, Secao, Status, Vazio } from '@/ui/equipe';
import { Icone } from '@/ui/Icone';
import { cor } from '@/ui/tema';

const ROTULO_ITEM: Record<string, string> = {
  ok: 'OK',
  falta: 'Faltando',
  duvida: 'Aguardando revisão',
  segunda_foto: 'Faltando',
  vencido: 'Vencido',
  danificado: 'Danificado',
};

export default function DetalheTrabalhador() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const e = useEstado();
  const [motivo, setMotivo] = useState('');
  const t = e.trabalhadores.find((x) => x.id === id);
  if (!t) return <Equipe perfis={['encarregado']} titulo="Trabalhador"><Vazio>Não encontrado.</Vazio></Equipe>;

  const agora = new Date().toISOString();
  const c = checkinDoDia(e, t.id, agora);
  const frentes = e.frentes.filter((f) => f.obra_id === t.obra_id);

  const pendente = c?.fim && c.resultado === 'pendente';
  const soDuvidas = pendente && c.itens.every((i) => i.situacao === 'ok' || i.situacao === 'duvida');
  const estourou = filaExcecoes(e, t.obra_id!, agora).some(
    (f) => f.trabalhador.id === t.id && f.tipo === 'deteccao' && f.estourou_sla,
  );

  const mudarTarefa = (tarefa: Tarefa, frente_id: string) =>
    transacao((est, ctx) => trocarTarefa(est, ctx, t, tarefa, frente_id));

  return (
    <Equipe perfis={['encarregado']} titulo={t.nome}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Status status={statusDoDia(e, t.id, agora)} />
        <T tam={14} c={cor.claroTexto}>Matrícula {t.matricula}</T>
      </View>

      {c?.fim ? (
        <Cartao gap={6}>
          {c.itens.map((i) => {
            const epi = e.epis.find((x) => x.id === i.epi_id)!;
            return (
              <View key={i.epi_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Icone nome={epi.icone} tam={24} cor={cor.fundo} />
                <T tam={15} c={cor.fundo} style={{ flex: 1 }}>{epi.descricao}</T>
                <T tam={14} peso="forte" c={i.situacao === 'ok' ? cor.verdeEscuro : cor.marromTexto}>{ROTULO_ITEM[i.situacao]}</T>
              </View>
            );
          })}
        </Cartao>
      ) : null}

      <Secao>Tarefa de hoje</Secao>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(ROTULO_TAREFA) as Tarefa[]).map((k) => (
          <Chip key={k} titulo={ROTULO_TAREFA[k]} ativo={k === t.tarefa} onPress={() => mudarTarefa(k, t.frente_id)} />
        ))}
      </View>
      <Secao>Frente</Secao>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {frentes.map((f) => (
          <Chip key={f.id} titulo={f.nome} ativo={f.id === t.frente_id} onPress={() => mudarTarefa(t.tarefa, f.id)} />
        ))}
      </View>
      {pendente && c.tarefa !== t.tarefa ? (
        <T tam={14} c={cor.marromTexto}>Tarefa mudou: o trabalhador precisa ler o crachá e refazer o check-in.</T>
      ) : null}

      {pendente ? (
        <>
          <Secao>Decisão presencial</Secao>
          <Campo rotulo="Justificativa" value={motivo} onChangeText={setMotivo} multiline />
          {soDuvidas ? (
            <>
              <Botao
                titulo="Liberar presencialmente"
                variante="verde"
                alto={56}
                tam={16}
                disabled={!estourou || motivo.trim().length < 5}
                onPress={() => {
                  transacao((est, ctx) => liberarPresencial(est, ctx, est.checkins.find((x) => x.id === c.id)!, motivo.trim()));
                  setMotivo('');
                }}
              />
              {!estourou ? <T tam={14} c={cor.claroTexto}>Disponível quando o prazo de revisão do técnico estourar.</T> : null}
            </>
          ) : (
            <T tam={14} c={cor.claroTexto}>Item faltando: receba o EPI ou troque a tarefa. Não há liberação presencial.</T>
          )}
          <Botao
            titulo={c.bloqueio_pedido_por ? 'Bloqueio enviado ao técnico' : 'Pedir bloqueio ao técnico'}
            variante="perigo"
            alto={56}
            tam={16}
            disabled={!!c.bloqueio_pedido_por || motivo.trim().length < 5}
            onPress={() => {
              transacao((est, ctx) => pedirBloqueio(est, ctx, est.checkins.find((x) => x.id === c.id)!, motivo.trim()));
              setMotivo('');
            }}
          />
        </>
      ) : null}

      <Botao titulo="Ver crachá" variante="preto" alto={56} tam={16} onPress={() => router.push(`/encarregado/cracha/${t.id}`)} />
    </Equipe>
  );
}
