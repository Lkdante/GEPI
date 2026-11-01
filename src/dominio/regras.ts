// Regras de leitura: nada aqui altera o estado. Saldo, status do dia e fila de
// exceções são sempre derivados dos fatos gravados (PDF, seções 5 e 6).
import type {
  CA,
  CheckIn,
  Config,
  Deteccao,
  EntregaEPI,
  EPI,
  Estado,
  ItemCheckin,
  SituacaoCA,
  SituacaoItem,
  StatusDia,
  Trabalhador,
} from './tipos';

export const DIA_MS = 86_400_000;

/** Data local (AAAA-MM-DD) de um instante ISO. */
export function diaLocal(iso: string): string {
  const d = new Date(iso);
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function somarDias(iso: string, dias: number): string {
  return new Date(new Date(iso).getTime() + dias * DIA_MS).toISOString();
}

const vivos = <T extends { excluido_em: string | null }>(l: T[]) => l.filter((x) => !x.excluido_em);

export function trabalhadoresDaObra(e: Estado, obra_id: string): Trabalhador[] {
  return vivos(e.trabalhadores).filter((t) => t.obra_id === obra_id);
}

export function saldoEPI(e: Estado, epi_id: string, obra_id: string): number {
  return e.movimentacoes
    .filter((m) => m.epi_id === epi_id && m.obra_id === obra_id)
    .reduce((soma, m) => soma + m.quantidade, 0);
}

export function episExigidos(e: Estado, t: Trabalhador): EPI[] {
  const ids = e.matriz
    .filter((m) => !m.excluido_em && m.funcao_id === t.funcao_id && m.tarefa === t.tarefa && m.obrigatorio)
    .map((m) => m.epi_id);
  return e.epis.filter((x) => ids.includes(x.id));
}

export function entregaAtiva(e: Estado, trabalhador_id: string, epi_id: string): EntregaEPI | undefined {
  return e.entregas
    .filter(
      (x) =>
        x.trabalhador_id === trabalhador_id &&
        x.epi_id === epi_id &&
        !x.substituida_por &&
        !x.devolvido_em,
    )
    .sort((a, b) => b.data.localeCompare(a.data))[0];
}

export type ConferenciaCA = SituacaoCA | 'nao_encontrado' | 'tipo_errado';

export function conferirCA(ca: CA | undefined, epi_id: string, agora: string): ConferenciaCA {
  if (!ca) return 'nao_encontrado';
  if (ca.epi_id !== epi_id) return 'tipo_errado';
  if (ca.situacao === 'cancelado') return 'cancelado';
  if (ca.situacao === 'vencido' || ca.validade < diaLocal(agora)) return 'vencido';
  return 'valido';
}

/** O registro de entrega por si só já pode pendurar o EPI, antes de qualquer foto. */
export function situacaoRegistro(
  e: Estado,
  t: Trabalhador,
  epi: EPI,
  agora: string,
): 'ok' | 'sem_entrega' | 'vencido' {
  const entrega = entregaAtiva(e, t.id, epi.id);
  if (!entrega) return 'sem_entrega';
  if (entrega.validade_uso < agora) return 'vencido';
  const ca = e.cas.find((c) => c.id === entrega.ca_id);
  return conferirCA(ca, epi.id, agora) === 'valido' ? 'ok' : 'vencido';
}

/**
 * Assimetria de risco (PDF, seção 7): "presente" incerto nunca libera sozinho,
 * "ausente" incerto pede segunda foto antes de virar pendência.
 */
export function classificar(
  d: Pick<Deteccao, 'rotulo' | 'confianca'>,
  limites: Pick<Config, 'limite_superior' | 'limite_inferior'>,
  tentativa: number,
): SituacaoItem {
  const certeza = d.confianca >= limites.limite_superior;
  if (d.rotulo === 'presente' && certeza) return 'ok';
  if (d.rotulo === 'presente' && d.confianca >= limites.limite_inferior) return 'duvida';
  if (d.rotulo === 'ausente' && certeza) return 'falta';
  return tentativa < 2 ? 'segunda_foto' : 'falta';
}

/** Ninguém é liberado com item pendente, e o bloqueio nunca é automático. */
export function resultadoDosItens(itens: ItemCheckin[]): 'liberado' | 'pendente' {
  return itens.length > 0 && itens.every((i) => i.situacao === 'ok') ? 'liberado' : 'pendente';
}

/** Vale a resposta mais recente de cada pergunta: refazer o item pode corrigir um 👎. */
export function temRespostaNegativa(e: Estado, checkin_id: string, epi_id: string): boolean {
  const ultima = new Map<string, boolean>();
  for (const r of e.respostas) {
    if (r.checkin_id === checkin_id && r.epi_id === epi_id) ultima.set(r.pergunta, r.valor);
  }
  return [...ultima.values()].includes(false);
}

export function checkinDoDia(e: Estado, trabalhador_id: string, agora: string): CheckIn | undefined {
  const hoje = diaLocal(agora);
  return e.checkins
    .filter((c) => c.trabalhador_id === trabalhador_id && diaLocal(c.inicio) === hoje)
    .sort((a, b) => b.inicio.localeCompare(a.inicio))[0];
}

export function statusDoDia(e: Estado, trabalhador_id: string, agora: string): StatusDia {
  const c = checkinDoDia(e, trabalhador_id, agora);
  return c && c.fim ? c.resultado : 'sem_checkin';
}

export function requisicaoAberta(e: Estado, trabalhador_id: string, epi_id: string) {
  return e.requisicoes.find(
    (r) =>
      r.trabalhador_id === trabalhador_id &&
      r.epi_id === epi_id &&
      (r.status === 'aberta' || r.status === 'aguardando_compra'),
  );
}

export function deteccaoAguardandoRevisao(e: Estado, d: Deteccao): boolean {
  return (
    (d.decisao === 'revisao' || d.decisao === 'amostra') &&
    !e.revisoes.some((r) => r.deteccao_id === d.id)
  );
}

export type Proximo =
  | { tela: 'consentimento' }
  | { tela: 'selfie'; modo: 'completo' }
  | { tela: 'selfie'; modo: 'item'; epi_ids: string[]; checkin_id: string }
  | { tela: 'final'; checkin_id: string }
  | { tela: 'pegue'; checkin_id: string };

/** Decide para onde a leitura do crachá leva o trabalhador. */
export function proximoPasso(e: Estado, t: Trabalhador, agora: string): Proximo {
  const consentiu = e.consentimentos.some((c) => c.trabalhador_id === t.id && !c.revogado_em);
  if (!consentiu) return { tela: 'consentimento' };
  const c = checkinDoDia(e, t.id, agora);
  if (!c || !c.fim) return { tela: 'selfie', modo: 'completo' };
  if (c.resultado !== 'pendente') return { tela: 'final', checkin_id: c.id };
  if (c.nova_foto_pedida) return { tela: 'selfie', modo: 'completo' };

  const naoOk = c.itens.filter((i) => i.situacao !== 'ok');
  const recebidos = naoOk.filter((i) =>
    e.requisicoes.some(
      (r) => r.checkin_id === c.id && r.epi_id === i.epi_id && r.status === 'entregue',
    ),
  );
  if (recebidos.length > 0) {
    return {
      tela: 'selfie',
      modo: 'item',
      epi_ids: recebidos.map((i) => i.epi_id),
      checkin_id: c.id,
    };
  }
  const temPedido = naoOk.some((i) => requisicaoAberta(e, t.id, i.epi_id));
  return temPedido ? { tela: 'pegue', checkin_id: c.id } : { tela: 'final', checkin_id: c.id };
}

export interface ItemFila {
  chave: string;
  tipo: 'bloqueio' | 'deteccao' | 'amostra';
  rank: number;
  checkin: CheckIn;
  trabalhador: Trabalhador;
  epi: EPI | null;
  deteccao: Deteccao | null;
  criado_em: string;
  estourou_sla: boolean;
}

/** Bloqueios primeiro, depois dúvidas da IA, depois a amostra de auditoria. */
export function filaExcecoes(e: Estado, obra_id: string, agora: string): ItemFila[] {
  const slaMs = e.config.sla_revisao_min * 60_000;
  const atrasou = (iso: string) => new Date(agora).getTime() - new Date(iso).getTime() > slaMs;
  const trabalhador = (id: string) => e.trabalhadores.find((t) => t.id === id)!;
  const fila: ItemFila[] = [];

  for (const c of e.checkins) {
    if (c.obra_id !== obra_id || !c.bloqueio_pedido_por || c.resultado === 'bloqueado') continue;
    fila.push({
      chave: `b-${c.id}`,
      tipo: 'bloqueio',
      rank: 0,
      checkin: c,
      trabalhador: trabalhador(c.trabalhador_id),
      epi: null,
      deteccao: null,
      criado_em: c.atualizado_em,
      estourou_sla: atrasou(c.atualizado_em),
    });
  }
  for (const d of e.deteccoes) {
    if (d.obra_id !== obra_id || !deteccaoAguardandoRevisao(e, d)) continue;
    const c = e.checkins.find((x) => x.id === d.checkin_id);
    if (!c || !c.fim) continue;
    // Uma foto nova do mesmo trabalhador substitui as dúvidas do check-in anterior.
    if (e.checkins.some((x) => x.trabalhador_id === c.trabalhador_id && x.inicio > c.inicio)) continue;
    if (e.deteccoes.some((o) => o.checkin_id === d.checkin_id && o.epi_id === d.epi_id && o.criado_em > d.criado_em)) continue;
    const amostra = d.decisao === 'amostra';
    fila.push({
      chave: d.id,
      tipo: amostra ? 'amostra' : 'deteccao',
      rank: amostra ? 2 : 1,
      checkin: c,
      trabalhador: trabalhador(c.trabalhador_id),
      epi: e.epis.find((x) => x.id === d.epi_id) ?? null,
      deteccao: d,
      criado_em: d.criado_em,
      estourou_sla: !amostra && atrasou(d.criado_em),
    });
  }
  return fila.sort((a, b) => a.rank - b.rank || a.criado_em.localeCompare(b.criado_em));
}

export function episAbaixoDoMinimo(e: Estado, obra_id: string) {
  return e.epis
    .map((epi) => ({ epi, saldo: saldoEPI(e, epi.id, obra_id) }))
    .filter((x) => x.saldo < x.epi.estoque_minimo);
}

export function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** Métricas da seção 11, sempre calculadas do que foi gravado. */
export function metricas(e: Estado, obra_id: string, agora: string) {
  const equipe = trabalhadoresDaObra(e, obra_id);
  const status = equipe.map((t) => statusDoDia(e, t.id, agora));
  const conta = (s: StatusDia) => status.filter((x) => x === s).length;
  const hoje = diaLocal(agora);
  const duracoes = e.checkins
    .filter((c) => c.obra_id === obra_id && c.fim && diaLocal(c.inicio) === hoje)
    .map((c) => (new Date(c.fim!).getTime() - new Date(c.inicio).getTime()) / 1000);
  const revisoes = e.revisoes.filter((r) => r.obra_id === obra_id).map((r) => r.tempo_s);
  const faltaAteEntrega = e.entregas
    .filter((x) => x.obra_id === obra_id && x.requisicao_id)
    .map((x) => {
      const r = e.requisicoes.find((q) => q.id === x.requisicao_id);
      return r ? (new Date(x.data).getTime() - new Date(r.criado_em).getTime()) / 60_000 : null;
    })
    .filter((n): n is number => n !== null);

  return {
    equipe: equipe.length,
    liberados: conta('liberado'),
    pendentes: conta('pendente'),
    bloqueados: conta('bloqueado'),
    sem_checkin: conta('sem_checkin'),
    adesao: equipe.length ? 1 - conta('sem_checkin') / equipe.length : 0,
    mediana_checkin_s: mediana(duracoes),
    revisao_mediana_s: mediana(revisoes),
    falta_ate_entrega_min: mediana(faltaAteEntrega),
    fila: filaExcecoes(e, obra_id, agora).length,
  };
}
