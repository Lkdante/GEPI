// Operações de escrita. Toda escrita passa por inserir/atualizar: é o que garante
// a fila de sincronização e a trilha de auditoria encadeada em todos os registros.
import { sha256 } from 'js-sha256';
import {
  conferirCA,
  deteccaoAguardandoRevisao,
  diaLocal,
  entregaAtiva,
  episExigidos,
  requisicaoAberta,
  resultadoDosItens,
  saldoEPI,
  somarDias,
  situacaoRegistro,
  classificar,
  temRespostaNegativa,
} from './regras';
import type {
  Base,
  CheckIn,
  Ctx,
  DecisaoRevisao,
  Deteccao,
  EntregaEPI,
  Estado,
  Foto,
  Fornecedor,
  ItemCheckin,
  LinhaAudit,
  MotivoReq,
  OperacaoFila,
  Requisicao,
  Tabela,
  Trabalhador,
} from './tipos';

export const HASH_INICIAL = '0'.repeat(64);

/** Hash do conteúdo da linha, encadeado ao hash da linha anterior. */
export function hashAudit(l: Omit<LinhaAudit, 'hash'>): string {
  return sha256(
    JSON.stringify([
      l.id,
      l.quem,
      l.quando,
      l.dispositivo_id,
      l.acao,
      l.entidade,
      l.entidade_id,
      l.antes,
      l.depois,
      l.hash_anterior,
    ]),
  );
}

/** Índice da primeira linha adulterada, ou null se a cadeia está íntegra. */
export function verificarCadeia(audit: LinhaAudit[]): number | null {
  let anterior = HASH_INICIAL;
  for (let i = 0; i < audit.length; i++) {
    const { hash, ...linha } = audit[i];
    if (linha.hash_anterior !== anterior || hashAudit(linha) !== hash) return i;
    anterior = hash;
  }
  return null;
}

function registrar(
  e: Estado,
  ctx: Ctx,
  acao: string,
  tabela: string,
  operacao: OperacaoFila['operacao'],
  registro: { id: string },
  antes: unknown,
) {
  e.fila_sync.push({
    id: ctx.uuid(),
    tabela,
    registro_id: registro.id,
    operacao,
    criado_em: ctx.agora,
    tentativas: 0,
    ultimo_erro: null,
    status: 'pendente',
  });
  const linha: Omit<LinhaAudit, 'hash'> = {
    id: ctx.uuid(),
    quem: ctx.usuario,
    quando: ctx.agora,
    dispositivo_id: ctx.dispositivo,
    acao,
    entidade: tabela,
    entidade_id: registro.id,
    antes,
    depois: registro,
    hash_anterior: e.audit.at(-1)?.hash ?? HASH_INICIAL,
  };
  e.audit.push({ ...linha, hash: hashAudit(linha) });
}

type Linha<T extends Tabela> = Estado[T][number];

export function inserir<T extends Tabela>(
  e: Estado,
  ctx: Ctx,
  tabela: T,
  obra_id: string | null,
  campos: Omit<Linha<T>, keyof Base>,
): Linha<T> {
  const registro = {
    id: ctx.uuid(),
    empresa_id: ctx.empresa,
    obra_id,
    criado_em: ctx.agora,
    atualizado_em: ctx.agora,
    recebido_em: null,
    criado_por: ctx.usuario,
    dispositivo_id: ctx.dispositivo,
    versao: 1,
    excluido_em: null,
    ...campos,
  } as Linha<T>;
  (e[tabela] as Linha<T>[]).push(registro);
  registrar(e, ctx, `inserir:${tabela}`, tabela, 'insert', registro, null);
  return registro;
}

export function atualizar<T extends Tabela>(
  e: Estado,
  ctx: Ctx,
  tabela: T,
  id: string,
  patch: Partial<Linha<T>>,
): Linha<T> {
  const lista = e[tabela] as Linha<T>[];
  const i = lista.findIndex((x) => x.id === id);
  if (i < 0) throw new Error(`${tabela}/${id} não encontrado`);
  const antes = lista[i];
  const depois = { ...antes, ...patch, atualizado_em: ctx.agora, versao: antes.versao + 1 };
  lista[i] = depois;
  registrar(e, ctx, `atualizar:${tabela}`, tabela, 'update', depois, antes);
  return depois;
}

export function registrarConsentimento(e: Estado, ctx: Ctx, t: Trabalhador) {
  return inserir(e, ctx, 'consentimentos', t.obra_id, {
    trabalhador_id: t.id,
    finalidade: 'deteccao_epi',
    versao_termo: '2026-10',
    revogado_em: null,
  });
}

export function abrirCheckin(e: Estado, ctx: Ctx, t: Trabalhador): CheckIn {
  return inserir(e, ctx, 'checkins', t.obra_id, {
    trabalhador_id: t.id,
    frente_id: t.frente_id,
    tarefa: t.tarefa,
    inicio: ctx.agora,
    fim: null,
    resultado: 'pendente',
    motivo: null,
    itens: [],
    revisado_por: null,
    nova_foto_pedida: false,
    bloqueio_pedido_por: null,
    bloqueio_justificativa: null,
  });
}

export function registrarFoto(
  e: Estado,
  ctx: Ctx,
  obra_id: string | null,
  dono_tipo: Foto['dono_tipo'],
  dono_id: string,
  hash: string,
): Foto {
  return inserir(e, ctx, 'fotos', obra_id, {
    dono_tipo,
    dono_id,
    hash,
    tirada_em: ctx.agora,
    // Selfie sem ocorrência some em 90 dias; evidência de entrega fica pelo prazo legal.
    apagar_em: dono_tipo === 'checkin' ? somarDias(ctx.agora, 90) : null,
  });
}

export interface LeituraDetector {
  epi_id: string;
  rotulo: 'presente' | 'ausente';
  confianca: number;
}
export interface MetaDetector {
  modelo: string;
  versao: string;
}

/** Cruza a foto com o registro de entrega e devolve a situação de cada EPI. */
export function aplicarDeteccao(
  e: Estado,
  ctx: Ctx,
  c: CheckIn,
  t: Trabalhador,
  foto_id: string | null,
  leituras: LeituraDetector[],
  meta: MetaDetector,
  tentativa: number,
  apenas?: string[],
): ItemCheckin[] {
  const exigidos = episExigidos(e, t).filter((x) => !apenas || apenas.includes(x.id));
  return exigidos.map((epi) => {
    const registro = situacaoRegistro(e, t, epi, ctx.agora);
    const leitura = leituras.find((l) => l.epi_id === epi.id);
    if (registro !== 'ok') {
      return {
        epi_id: epi.id,
        situacao: registro === 'vencido' ? 'vencido' : 'falta',
        confianca: null,
      };
    }
    if (!leitura) return { epi_id: epi.id, situacao: 'duvida', confianca: null };

    const situacao = classificar(leitura, e.config, tentativa);
    const emAmostra = situacao === 'ok' && ctx.aleatorio() < e.config.amostra_auditoria;
    inserir(e, ctx, 'deteccoes', c.obra_id, {
      foto_id,
      checkin_id: c.id,
      epi_id: epi.id,
      modelo: meta.modelo,
      versao_modelo: meta.versao,
      onde: 'celular',
      rotulo: leitura.rotulo,
      confianca: leitura.confianca,
      limite_aplicado: e.config.limite_superior,
      decisao: emAmostra ? 'amostra' : situacao === 'duvida' ? 'revisao' : 'automatica',
    });
    return { epi_id: epi.id, situacao, confianca: leitura.confianca };
  });
}

/** O trabalhador diz que está com o item, mas a foto não mostrou: um humano decide. */
export function enviarParaRevisao(
  e: Estado,
  ctx: Ctx,
  c: CheckIn,
  item: ItemCheckin,
  foto_id: string | null,
  meta: MetaDetector,
): ItemCheckin {
  inserir(e, ctx, 'deteccoes', c.obra_id, {
    foto_id,
    checkin_id: c.id,
    epi_id: item.epi_id,
    modelo: meta.modelo,
    versao_modelo: meta.versao,
    onde: 'celular',
    rotulo: 'ausente',
    confianca: item.confianca ?? 0,
    limite_aplicado: e.config.limite_superior,
    decisao: 'revisao',
  });
  return { ...item, situacao: 'duvida' };
}

export function pedirEPI(
  e: Estado,
  ctx: Ctx,
  t: Trabalhador,
  epi_id: string,
  motivo: MotivoReq,
  checkin_id: string | null,
): Requisicao {
  const existente = requisicaoAberta(e, t.id, epi_id);
  if (existente) return existente;
  const para_quem: Fornecedor = t.epi_fornecido_por;
  const obra = t.obra_id!;
  const semEstoque = para_quem === 'construtora' && saldoEPI(e, epi_id, obra) <= 0;
  const r = inserir(e, ctx, 'requisicoes', obra, {
    tipo: 'epi',
    trabalhador_id: t.id,
    epi_id,
    checkin_id,
    motivo,
    prioridade: motivo === 'preventiva' ? 'baixa' : 'normal',
    para_quem,
    status: semEstoque ? 'aguardando_compra' : 'aberta',
  });
  if (semEstoque) solicitarCompra(e, ctx, obra, epi_id, 'requisicao_sem_estoque');
  return r;
}

export function solicitarCompra(
  e: Estado,
  ctx: Ctx,
  obra_id: string,
  epi_id: string,
  origem: 'estoque_minimo' | 'requisicao_sem_estoque',
) {
  const emAberto = e.solicitacoes.some(
    (s) => s.obra_id === obra_id && s.epi_id === epi_id && s.situacao === 'nao_autorizada',
  );
  if (emAberto) return;
  const epi = e.epis.find((x) => x.id === epi_id)!;
  const falta = epi.estoque_minimo * 2 - Math.max(saldoEPI(e, epi_id, obra_id), 0);
  inserir(e, ctx, 'solicitacoes', obra_id, {
    epi_id,
    quantidade: Math.max(falta, 1),
    origem,
    situacao: 'nao_autorizada',
  });
}

export function responderChecklist(
  e: Estado,
  ctx: Ctx,
  c: CheckIn,
  epi_id: string,
  pergunta: string,
  valor: boolean,
) {
  return inserir(e, ctx, 'respostas', c.obra_id, { checkin_id: c.id, epi_id, pergunta, valor });
}

/** Encerra o check-in ou, no modo item, troca só os itens refeitos. */
export function fecharCheckin(e: Estado, ctx: Ctx, c: CheckIn, itens: ItemCheckin[]): CheckIn {
  const atual = e.checkins.find((x) => x.id === c.id)!;
  const refeitos = new Set(itens.map((i) => i.epi_id));
  // Liberar errado é o erro grave: um 👎 gravado vale mais do que o que a tela mandou.
  const conferidos = itens.map((i) =>
    temRespostaNegativa(e, c.id, i.epi_id) ? { ...i, situacao: 'danificado' as const } : i,
  );
  const mesclados = [...atual.itens.filter((i) => !refeitos.has(i.epi_id)), ...conferidos];
  const resultado = resultadoDosItens(mesclados);
  return atualizar(e, ctx, 'checkins', c.id, {
    itens: mesclados,
    // Refazer um item não conta como check-in novo: a métrica de tempo usa o primeiro fim.
    fim: atual.fim ?? ctx.agora,
    resultado,
    motivo: resultado === 'liberado' ? null : 'EPI pendente',
    nova_foto_pedida: false,
  });
}

export function revisarDeteccao(
  e: Estado,
  ctx: Ctx,
  d: Deteccao,
  decisao: DecisaoRevisao,
  valor: 'presente' | 'ausente' | null,
) {
  inserir(e, ctx, 'revisoes', d.obra_id, {
    deteccao_id: d.id,
    revisor: ctx.usuario,
    decisao,
    valor_corrigido: valor,
    tempo_s: Math.round((new Date(ctx.agora).getTime() - new Date(d.criado_em).getTime()) / 1000),
    usar_no_treino: true,
  });

  const c = e.checkins.find((x) => x.id === d.checkin_id)!;
  const t = e.trabalhadores.find((x) => x.id === c.trabalhador_id)!;
  if (decisao === 'pedir_nova_foto') {
    atualizar(e, ctx, 'checkins', c.id, { nova_foto_pedida: true, revisado_por: ctx.usuario });
    return;
  }

  const presente = valor === 'presente';
  const itens = c.itens.map((i) =>
    i.epi_id === d.epi_id ? { ...i, situacao: presente ? ('ok' as const) : ('falta' as const) } : i,
  );
  const resultado = c.resultado === 'bloqueado' ? 'bloqueado' : resultadoDosItens(itens);
  atualizar(e, ctx, 'checkins', c.id, {
    itens,
    resultado,
    motivo: resultado === 'liberado' ? null : c.motivo,
    revisado_por: ctx.usuario,
  });
  if (!presente) pedirEPI(e, ctx, t, d.epi_id, 'falta', c.id);
}

/** Bloqueio é sempre de um humano: o encarregado pede, o técnico confirma. */
export function pedirBloqueio(e: Estado, ctx: Ctx, c: CheckIn, justificativa: string) {
  return atualizar(e, ctx, 'checkins', c.id, {
    bloqueio_pedido_por: ctx.usuario,
    bloqueio_justificativa: justificativa,
  });
}

export function decidirBloqueio(e: Estado, ctx: Ctx, c: CheckIn, confirmar: boolean) {
  return atualizar(e, ctx, 'checkins', c.id, {
    resultado: confirmar ? 'bloqueado' : c.resultado,
    bloqueio_pedido_por: null,
    motivo: confirmar ? c.bloqueio_justificativa : c.motivo,
    revisado_por: ctx.usuario,
  });
}

export function retirarBloqueio(e: Estado, ctx: Ctx, c: CheckIn) {
  return atualizar(e, ctx, 'checkins', c.id, {
    resultado: resultadoDosItens(c.itens),
    revisado_por: ctx.usuario,
  });
}

/**
 * Liberação presencial após estourar o prazo de revisão. Só vale para dúvida da
 * IA: quem está sem o EPI não é liberado, tem de receber o item ou trocar de tarefa.
 */
export function liberarPresencial(e: Estado, ctx: Ctx, c: CheckIn, justificativa: string) {
  const naoOk = c.itens.filter((i) => i.situacao !== 'ok');
  if (naoOk.some((i) => i.situacao !== 'duvida')) {
    throw new Error('Só dúvidas da IA podem ser liberadas presencialmente');
  }
  // A dúvida sai da fila do técnico, mas não vira rótulo de treino: ninguém olhou a foto.
  for (const d of e.deteccoes) {
    if (d.checkin_id !== c.id || !deteccaoAguardandoRevisao(e, d)) continue;
    inserir(e, ctx, 'revisoes', c.obra_id, {
      deteccao_id: d.id,
      revisor: ctx.usuario,
      decisao: 'confirmar',
      valor_corrigido: 'presente',
      tempo_s: Math.round((new Date(ctx.agora).getTime() - new Date(d.criado_em).getTime()) / 1000),
      usar_no_treino: false,
    });
  }
  return atualizar(e, ctx, 'checkins', c.id, {
    itens: c.itens.map((i) => ({ ...i, situacao: 'ok' as const })),
    resultado: 'liberado',
    motivo: `Liberação presencial: ${justificativa}`,
    revisado_por: ctx.usuario,
  });
}

export function trocarTarefa(
  e: Estado,
  ctx: Ctx,
  t: Trabalhador,
  tarefa: Trabalhador['tarefa'],
  frente_id: string,
) {
  return atualizar(e, ctx, 'trabalhadores', t.id, { tarefa, frente_id });
}

export interface DadosEntrega {
  trabalhador: Trabalhador;
  epi_id: string;
  ca_id: string;
  lote: string | null;
  motivo: MotivoReq;
  requisicao: Requisicao | null;
  devolveu_antigo: boolean;
  motivo_sem_devolucao: string | null;
  foto_hash: string | null;
}

/**
 * Passo 3 do ciclo: grava a entrega, baixa o estoque, substitui a anterior, fecha
 * a requisição e dispara a reposição se o saldo ficar abaixo do mínimo.
 */
export function entregarEPI(e: Estado, ctx: Ctx, d: DadosEntrega): EntregaEPI {
  const t = d.trabalhador;
  const obra = t.obra_id!;
  const epi = e.epis.find((x) => x.id === d.epi_id)!;
  const ca = e.cas.find((x) => x.id === d.ca_id);
  if (conferirCA(ca, d.epi_id, ctx.agora) !== 'valido') {
    throw new Error('CA inválido para este EPI');
  }
  const fornecido_por = d.requisicao?.para_quem ?? t.epi_fornecido_por;
  if (fornecido_por === 'construtora' && saldoEPI(e, d.epi_id, obra) <= 0) {
    throw new Error('Sem saldo em estoque');
  }

  const anterior = entregaAtiva(e, t.id, d.epi_id);
  const assinatura = sha256(
    JSON.stringify([t.id, t.cracha_token, d.epi_id, d.ca_id, ctx.agora, ctx.dispositivo, d.foto_hash]),
  );
  const nova = inserir(e, ctx, 'entregas', obra, {
    trabalhador_id: t.id,
    epi_id: d.epi_id,
    ca_id: d.ca_id,
    lote: d.lote,
    quantidade: 1,
    motivo: d.motivo,
    data: ctx.agora,
    validade_uso: somarDias(ctx.agora, epi.vida_util_dias),
    foto_id: null,
    assinatura,
    entregue_por: ctx.usuario,
    fornecido_por,
    devolvido_em: null,
    devolucao_motivo: null,
    substituida_por: null,
    requisicao_id: d.requisicao?.id ?? null,
  });
  if (d.foto_hash) {
    const foto = registrarFoto(e, ctx, obra, 'entrega', nova.id, d.foto_hash);
    atualizar(e, ctx, 'entregas', nova.id, { foto_id: foto.id });
  }
  if (anterior) {
    atualizar(e, ctx, 'entregas', anterior.id, {
      substituida_por: nova.id,
      devolvido_em: d.devolveu_antigo ? ctx.agora : null,
      devolucao_motivo: d.devolveu_antigo ? null : d.motivo_sem_devolucao,
    });
  }
  if (fornecido_por === 'construtora') {
    inserir(e, ctx, 'movimentacoes', obra, {
      tipo: 'saida',
      epi_id: d.epi_id,
      quantidade: -1,
      origem: 'requisicao',
      entrega_id: nova.id,
      quem_recebeu: t.id,
    });
    if (saldoEPI(e, d.epi_id, obra) < epi.estoque_minimo) {
      solicitarCompra(e, ctx, obra, d.epi_id, 'estoque_minimo');
    }
  }
  if (d.requisicao) atualizar(e, ctx, 'requisicoes', d.requisicao.id, { status: 'entregue' });
  return e.entregas.find((x) => x.id === nova.id)!;
}

export function aprovarCompra(e: Estado, ctx: Ctx, solicitacao_id: string) {
  return atualizar(e, ctx, 'solicitacoes', solicitacao_id, { situacao: 'autorizada' });
}

/** Entrada manual: no GEPI o recebimento por NF-e (fase A do PDF) ainda não existe. */
export function entradaEstoque(e: Estado, ctx: Ctx, obra_id: string, epi_id: string, quantidade: number) {
  inserir(e, ctx, 'movimentacoes', obra_id, {
    tipo: 'entrada',
    epi_id,
    quantidade,
    origem: 'entrada_manual',
    entrega_id: null,
    quem_recebeu: null,
  });
  for (const r of e.requisicoes) {
    const voltou = r.epi_id === epi_id && r.obra_id === obra_id && r.status === 'aguardando_compra';
    if (voltou) atualizar(e, ctx, 'requisicoes', r.id, { status: 'aberta' });
  }
}

/**
 * Varredura noturna: entregas com fim de vida útil ou CA vencendo em 30 dias viram
 * requisição preventiva. Sem backend, roda na primeira abertura do dia.
 */
export function varreduraDiaria(e: Estado, ctx: Ctx): number {
  const hoje = diaLocal(ctx.agora);
  if (e.ultima_varredura === hoje) return 0;
  e.ultima_varredura = hoje;
  const limite = somarDias(ctx.agora, 30);
  const limiteDia = diaLocal(limite);
  let geradas = 0;
  for (const x of e.entregas) {
    if (x.substituida_por || x.devolvido_em) continue;
    const ca = e.cas.find((c) => c.id === x.ca_id);
    const vence = x.validade_uso <= limite || (ca !== undefined && ca.validade <= limiteDia);
    if (!vence || requisicaoAberta(e, x.trabalhador_id, x.epi_id)) continue;
    const t = e.trabalhadores.find((w) => w.id === x.trabalhador_id);
    if (!t) continue;
    pedirEPI(e, ctx, t, x.epi_id, 'preventiva', null);
    geradas++;
  }
  return geradas;
}
