// Ficha de EPI do trabalhador, exportável em PDF com os hashes das assinaturas.
import { useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';
import { transacao, useEstado, useRaiz } from '@/dados/store';
import { retirarBloqueio } from '@/dominio/operacoes';
import { checkinDoDia } from '@/dominio/regras';
import type { Estado, Trabalhador } from '@/dominio/tipos';
import { ROTULO_MOTIVO } from '@/dominio/tipos';
import { Botao, T } from '@/ui/base';
import { Cartao, Equipe, Status, Vazio } from '@/ui/equipe';
import { dataCurta } from '@/ui/formato';
import { escapar, imprimir } from '@/ui/imprimir';
import { cor } from '@/ui/tema';

function linhasFicha(e: Estado, t: Trabalhador) {
  return e.entregas
    .filter((x) => x.trabalhador_id === t.id)
    .sort((a, b) => b.data.localeCompare(a.data))
    .map((x) => ({
      entrega: x,
      epi: e.epis.find((i) => i.id === x.epi_id)!,
      ca: e.cas.find((c) => c.id === x.ca_id)!,
    }));
}

function htmlFicha(e: Estado, t: Trabalhador) {
  const funcao = e.funcoes.find((f) => f.id === t.funcao_id)?.nome ?? '';
  const empresa = e.empresas.find((x) => x.id === t.empregadora_id)?.razao_social ?? '';
  const linhas = linhasFicha(e, t)
    .map(
      ({ entrega: x, epi, ca }) => `<tr>
        <td>${dataCurta(x.data)}</td><td>${escapar(epi.descricao)}</td><td>${escapar(ca.numero)}</td>
        <td>${x.quantidade}</td><td>${ROTULO_MOTIVO[x.motivo]}</td><td>${dataCurta(x.validade_uso)}</td>
        <td>${x.fornecido_por}</td><td>${x.devolvido_em ? dataCurta(x.devolvido_em) : escapar(x.devolucao_motivo ?? '')}</td>
        <td class="h">${x.assinatura}</td></tr>`,
    )
    .join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ficha de EPI</title>
    <style>body{font-family:Arial,sans-serif;font-size:11pt;margin:16mm}h1{font-size:16pt}
    table{border-collapse:collapse;width:100%}th,td{border:1px solid #777;padding:4px;font-size:9pt;text-align:left}
    .h{font-family:monospace;font-size:7pt;word-break:break-all}</style></head><body>
    <h1>Ficha de controle de EPI (NR-6)</h1>
    <p><b>${escapar(t.nome)}</b> · Matrícula ${escapar(t.matricula)} · ${escapar(funcao)} · ${escapar(empresa)}</p>
    <table><tr><th>Data</th><th>EPI</th><th>CA</th><th>Qtd</th><th>Motivo</th><th>Validade</th><th>Fornecido por</th><th>Devolução</th><th>Assinatura (SHA-256)</th></tr>
    ${linhas}</table></body></html>`;
}

export default function Ficha() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const e = useEstado();
  const { usuario } = useRaiz();
  const t = e.trabalhadores.find((x) => x.id === id);
  const agora = new Date().toISOString();
  if (!t) return <Equipe perfis={['tecnico', 'gestor']} titulo="Ficha"><Vazio>Trabalhador não encontrado.</Vazio></Equipe>;

  const c = checkinDoDia(e, t.id, agora);

  return (
    <Equipe perfis={['tecnico', 'gestor']} titulo={t.nome}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Status status={c?.fim ? c.resultado : 'sem_checkin'} />
        <T tam={14} c={cor.claroTexto}>Matrícula {t.matricula}</T>
      </View>
      {c?.resultado === 'bloqueado' && usuario?.perfil === 'tecnico' ? (
        <>
          <T tam={15} c={cor.fundo}>Bloqueado: {c.motivo}</T>
          <Botao
            titulo="Retirar bloqueio"
            variante="preto"
            alto={56}
            tam={16}
            onPress={() => transacao((est, ctx) => retirarBloqueio(est, ctx, est.checkins.find((x) => x.id === c.id)!))}
          />
        </>
      ) : null}
      <Botao titulo="Exportar PDF" icone="doc" alto={56} tam={16} onPress={() => imprimir(htmlFicha(e, t))} />
      {linhasFicha(e, t).map(({ entrega: x, epi, ca }) => (
        <Cartao key={x.id} gap={2}>
          <T tam={16} peso="extra" c={cor.fundo}>{epi.descricao}</T>
          <T tam={14} c={cor.claroTexto}>
            {dataCurta(x.data)} · CA {ca.numero} · {ROTULO_MOTIVO[x.motivo]} · validade {dataCurta(x.validade_uso)}
          </T>
          <T tam={14} c={cor.claroTexto}>
            {x.substituida_por
              ? x.devolvido_em
                ? 'Substituída · antigo devolvido'
                : `Substituída · ${x.devolucao_motivo ?? 'sem devolução'}`
              : 'Em uso'}{' '}
            · fornecido por {x.fornecido_por}
          </T>
          <T tam={12} c={cor.claroTexto} linhas={1}>Assinatura {x.assinatura}</T>
        </Cartao>
      ))}
    </Equipe>
  );
}
