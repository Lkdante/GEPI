import { describe, expect, it } from 'vitest';
import { detectorSimulado as detector } from '@/ia/detector';
import {
  abrirCheckin,
  aplicarDeteccao,
  aprovarCompra,
  decidirBloqueio,
  entradaEstoque,
  entregarEPI,
  enviarParaRevisao,
  fecharCheckin,
  liberarPresencial,
  pedirBloqueio,
  pedirEPI,
  responderChecklist,
  revisarDeteccao,
  varreduraDiaria,
  verificarCadeia,
} from './operacoes';
import {
  checkinDoDia,
  classificar,
  conferirCA,
  episAbaixoDoMinimo,
  episExigidos,
  filaExcecoes,
  mediana,
  proximoPasso,
  resultadoDosItens,
  saldoEPI,
  somarDias,
  statusDoDia,
} from './regras';
import { criarDemo, estadoVazio } from './seed';
import type { Ctx, Estado, Trabalhador } from './tipos';
import { uuidv7 } from './uuid';

const AGORA = '2026-10-31T12:00:00.000Z';

function novoCtx(agora = AGORA, aleatorio = 0.5): Ctx {
  let n = 0;
  return {
    agora,
    usuario: 'teste',
    dispositivo: 'disp',
    empresa: 'emp',
    uuid: () => `id-${++n}-${Math.random()}`,
    aleatorio: () => aleatorio,
  };
}

function demo(): { e: Estado; ctx: Ctx; porNome: (n: string) => Trabalhador; epi: (t: string) => string } {
  const ctx = novoCtx();
  const e = criarDemo(ctx);
  ctx.empresa = e.empresas[0].id;
  return {
    e,
    ctx,
    porNome: (n) => e.trabalhadores.find((t) => t.nome.startsWith(n))!,
    epi: (tipo) => e.epis.find((x) => x.tipo === tipo)!.id,
  };
}

function fazerCheckin(e: Estado, ctx: Ctx, t: Trabalhador, tentativa = 1) {
  const c = abrirCheckin(e, ctx, t);
  const exigidos = episExigidos(e, t);
  const leituras = detector.detectar({ trabalhador: t, exigidos, tentativa, modo: 'completo' });
  const itens = aplicarDeteccao(e, ctx, c, t, null, leituras, detector, tentativa);
  return { c, itens };
}

const LIMITES = { limite_superior: 0.8, limite_inferior: 0.4 };

describe('assimetria de risco', () => {
  it('presente só vira ok acima do limite superior', () => {
    expect(classificar({ rotulo: 'presente', confianca: 0.8 }, LIMITES, 1)).toBe('ok');
    expect(classificar({ rotulo: 'presente', confianca: 0.79 }, LIMITES, 1)).toBe('duvida');
    expect(classificar({ rotulo: 'presente', confianca: 0.4 }, LIMITES, 1)).toBe('duvida');
  });

  it('presente com confiança abaixo do inferior é tratado como não detectado', () => {
    expect(classificar({ rotulo: 'presente', confianca: 0.2 }, LIMITES, 1)).toBe('segunda_foto');
    expect(classificar({ rotulo: 'presente', confianca: 0.2 }, LIMITES, 2)).toBe('falta');
  });

  it('ausente incerto pede segunda foto antes de virar pendência', () => {
    expect(classificar({ rotulo: 'ausente', confianca: 0.6 }, LIMITES, 1)).toBe('segunda_foto');
    expect(classificar({ rotulo: 'ausente', confianca: 0.6 }, LIMITES, 2)).toBe('falta');
    expect(classificar({ rotulo: 'ausente', confianca: 0.9 }, LIMITES, 1)).toBe('falta');
  });

  it('nada é liberado com item pendente ou lista vazia', () => {
    expect(resultadoDosItens([])).toBe('pendente');
    expect(
      resultadoDosItens([
        { epi_id: 'a', situacao: 'ok', confianca: 0.9 },
        { epi_id: 'b', situacao: 'duvida', confianca: 0.6 },
      ]),
    ).toBe('pendente');
  });
});

describe('detector simulado', () => {
  it('trabalhador sem roteiro nunca é liberado automaticamente', () => {
    const { e, ctx, porNome } = demo();
    const t = { ...porNome('Maria'), cenario_demo: null };
    const { c, itens } = fazerCheckin(e, ctx, t);
    expect(itens.every((i) => i.situacao === 'duvida')).toBe(true);
    expect(fecharCheckin(e, ctx, c, itens).resultado).toBe('pendente');
  });
});

describe('check-in', () => {
  it('libera quem tem todos os EPIs detectados e em dia', () => {
    const { e, ctx, porNome } = demo();
    const t = porNome('Maria');
    const { c, itens } = fazerCheckin(e, ctx, t);
    expect(fecharCheckin(e, ctx, c, itens).resultado).toBe('liberado');
    expect(statusDoDia(e, t.id, ctx.agora)).toBe('liberado');
  });

  it('nunca bloqueia automaticamente: o máximo é pendente', () => {
    const { e, ctx, porNome } = demo();
    const t = porNome('João');
    const { c, itens } = fazerCheckin(e, ctx, t);
    expect(fecharCheckin(e, ctx, c, itens).resultado).toBe('pendente');
  });

  it('entrega com CA vencido pendura o item mesmo com foto perfeita', () => {
    const { e, ctx, porNome, epi } = demo();
    const { itens } = fazerCheckin(e, ctx, porNome('Ana'));
    expect(itens.find((i) => i.epi_id === epi('capacete'))?.situacao).toBe('vencido');
  });

  it('trabalhador novo, sem entrega registrada, fica com falta', () => {
    const { e, ctx, porNome } = demo();
    const t = porNome('João');
    e.entregas = e.entregas.filter((x) => x.trabalhador_id !== t.id);
    const { itens } = fazerCheckin(e, ctx, t);
    expect(itens.every((i) => i.situacao === 'falta')).toBe(true);
  });

  it('resposta negativa impede a liberação mesmo com itens ok na tela', () => {
    const { e, ctx, porNome, epi } = demo();
    const t = porNome('Maria');
    const { c, itens } = fazerCheckin(e, ctx, t);
    responderChecklist(e, ctx, c, epi('luva'), 'Suas luvas estão sem furos?', false);
    const fechado = fecharCheckin(e, ctx, c, itens);
    expect(fechado.resultado).toBe('pendente');
    expect(fechado.itens.find((i) => i.epi_id === epi('luva'))?.situacao).toBe('danificado');
  });

  it('refazer o item com resposta positiva supera o 👎 anterior', () => {
    const { e, ctx, porNome, epi } = demo();
    const t = porNome('Maria');
    const { c, itens } = fazerCheckin(e, ctx, t);
    const pergunta = 'Suas luvas estão sem furos?';
    responderChecklist(e, ctx, c, epi('luva'), pergunta, false);
    fecharCheckin(e, ctx, c, itens);
    responderChecklist(e, ctx, c, epi('luva'), pergunta, true);
    const luva = { epi_id: epi('luva'), situacao: 'ok' as const, confianca: 0.93 };
    expect(fecharCheckin(e, ctx, c, [luva]).resultado).toBe('liberado');
  });

  it('amostra de auditoria vai para a fila sem travar o trabalhador', () => {
    const ctx = novoCtx(AGORA, 0);
    const e = criarDemo(ctx);
    ctx.empresa = e.empresas[0].id;
    const t = e.trabalhadores.find((x) => x.nome.startsWith('Maria'))!;
    const { c, itens } = fazerCheckin(e, ctx, t);
    expect(fecharCheckin(e, ctx, c, itens).resultado).toBe('liberado');
    const fila = filaExcecoes(e, t.obra_id!, ctx.agora).filter((f) => f.tipo === 'amostra');
    expect(fila).toHaveLength(itens.length);
  });
});

describe('ciclo do EPI', () => {
  it('fecha do check-in à liberação refazendo só o item', () => {
    const { e, ctx, porNome, epi } = demo();
    const t = porNome('João');
    const cinto = epi('cinto');
    const saldoAntes = saldoEPI(e, cinto, t.obra_id!);

    const { c, itens } = fazerCheckin(e, ctx, t);
    const req = pedirEPI(e, ctx, t, cinto, 'falta', c.id);
    fecharCheckin(e, ctx, c, itens);
    expect(proximoPasso(e, t, ctx.agora).tela).toBe('pegue');

    const ca = e.cas.find((x) => x.epi_id === cinto)!;
    const anterior = e.entregas.find((x) => x.trabalhador_id === t.id && x.epi_id === cinto)!;
    const nova = entregarEPI(e, ctx, {
      trabalhador: t,
      epi_id: cinto,
      ca_id: ca.id,
      lote: null,
      motivo: 'falta',
      requisicao: req,
      devolveu_antigo: false,
      motivo_sem_devolucao: 'perdeu',
      foto_hash: 'abc',
    });

    expect(saldoEPI(e, cinto, t.obra_id!)).toBe(saldoAntes - 1);
    expect(e.requisicoes.find((r) => r.id === req.id)?.status).toBe('entregue');
    const velha = e.entregas.find((x) => x.id === anterior.id)!;
    expect(velha.substituida_por).toBe(nova.id);
    expect(velha.devolucao_motivo).toBe('perdeu');

    const passo = proximoPasso(e, t, ctx.agora);
    expect(passo).toMatchObject({ tela: 'selfie', modo: 'item', epi_ids: [cinto] });

    const atual = checkinDoDia(e, t.id, ctx.agora)!;
    const leituras = detector.detectar({
      trabalhador: t,
      exigidos: episExigidos(e, t).filter((x) => x.id === cinto),
      tentativa: 1,
      modo: 'item',
    });
    const refeitos = aplicarDeteccao(e, ctx, atual, t, null, leituras, detector, 1, [cinto]);
    expect(fecharCheckin(e, ctx, atual, refeitos).resultado).toBe('liberado');
    expect(atual.itens.length).toBe(5);
  });

  it('não duplica requisição aberta do mesmo item', () => {
    const { e, ctx, porNome, epi } = demo();
    const t = porNome('João');
    const a = pedirEPI(e, ctx, t, epi('cinto'), 'falta', null);
    const b = pedirEPI(e, ctx, t, epi('cinto'), 'danificado', null);
    expect(b.id).toBe(a.id);
  });

  it('sem estoque: aguarda compra e volta a abrir com a entrada', () => {
    const { e, ctx, porNome, epi } = demo();
    const t = porNome('João');
    const cinto = epi('cinto');
    const obra = t.obra_id!;
    entradaEstoque(e, ctx, obra, cinto, -saldoEPI(e, cinto, obra));

    const r = pedirEPI(e, ctx, t, cinto, 'falta', null);
    expect(r.status).toBe('aguardando_compra');
    const compra = e.solicitacoes.find((s) => s.epi_id === cinto)!;
    expect(compra.origem).toBe('requisicao_sem_estoque');
    expect(aprovarCompra(e, ctx, compra.id).situacao).toBe('autorizada');

    entradaEstoque(e, ctx, obra, cinto, 5);
    expect(e.requisicoes.find((x) => x.id === r.id)?.status).toBe('aberta');
  });

  it('saldo abaixo do mínimo gera solicitação de compra', () => {
    const { e, ctx, porNome, epi } = demo();
    const t = porNome('João');
    const cinto = epi('cinto');
    const ca = e.cas.find((x) => x.epi_id === cinto)!;
    const dados = {
      trabalhador: t,
      epi_id: cinto,
      ca_id: ca.id,
      lote: null,
      motivo: 'falta' as const,
      requisicao: null,
      devolveu_antigo: true,
      motivo_sem_devolucao: null,
      foto_hash: null,
    };
    entregarEPI(e, ctx, dados);
    expect(e.solicitacoes).toHaveLength(0);
    entregarEPI(e, ctx, dados);
    expect(e.solicitacoes.map((s) => s.origem)).toEqual(['estoque_minimo']);
  });

  it('empreiteira: pedido não vai ao almoxarifado nem baixa estoque', () => {
    const { e, ctx, porNome, epi } = demo();
    const t = porNome('Rafael');
    const cinto = epi('cinto');
    const obra = t.obra_id!;
    const saldo = saldoEPI(e, cinto, obra);
    const r = pedirEPI(e, ctx, t, cinto, 'falta', null);
    expect(r.para_quem).toBe('empreiteira');

    const ca = e.cas.find((x) => x.epi_id === cinto)!;
    const entrega = entregarEPI(e, ctx, {
      trabalhador: t,
      epi_id: cinto,
      ca_id: ca.id,
      lote: null,
      motivo: 'falta',
      requisicao: r,
      devolveu_antigo: true,
      motivo_sem_devolucao: null,
      foto_hash: null,
    });
    expect(entrega.fornecido_por).toBe('empreiteira');
    expect(saldoEPI(e, cinto, obra)).toBe(saldo);
  });

  it('recusa entrega com CA inválido ou de outro tipo de EPI', () => {
    const { e, ctx, porNome, epi } = demo();
    const vencido = e.cas.find((x) => x.situacao === 'vencido')!;
    const outro = e.cas.find((x) => x.epi_id === epi('botina'))!;
    const base = {
      trabalhador: porNome('João'),
      epi_id: epi('capacete'),
      lote: null,
      motivo: 'falta' as const,
      requisicao: null,
      devolveu_antigo: true,
      motivo_sem_devolucao: null,
      foto_hash: null,
    };
    expect(() => entregarEPI(e, ctx, { ...base, ca_id: vencido.id })).toThrow('CA inválido');
    expect(() => entregarEPI(e, ctx, { ...base, ca_id: outro.id })).toThrow('CA inválido');
    expect(conferirCA(undefined, 'x', AGORA)).toBe('nao_encontrado');
  });

  it('varredura gera preventiva uma vez por dia e não repete pedido aberto', () => {
    const { e, ctx, porNome, epi } = demo();
    const t = porNome('João');
    const luva = e.entregas.find((x) => x.trabalhador_id === t.id && x.epi_id === epi('luva'))!;
    luva.validade_uso = somarDias(ctx.agora, 10);

    const geradas = varreduraDiaria(e, ctx);
    expect(geradas).toBeGreaterThan(0);
    expect(e.requisicoes.some((r) => r.epi_id === luva.epi_id && r.motivo === 'preventiva')).toBe(true);
    expect(varreduraDiaria(e, ctx)).toBe(0);

    const amanha = { ...ctx, agora: somarDias(ctx.agora, 1) };
    expect(varreduraDiaria(e, amanha)).toBe(0);
  });
});

describe('revisão humana', () => {
  function comDuvida() {
    const d = demo();
    const t = d.porNome('Pedro');
    const { c, itens } = fazerCheckin(d.e, d.ctx, t);
    fecharCheckin(d.e, d.ctx, c, itens);
    const fila = filaExcecoes(d.e, t.obra_id!, d.ctx.agora);
    const item = fila.find((f) => f.trabalhador.id === t.id)!;
    return { ...d, t, item };
  }

  it('confirmar presente libera o trabalhador', () => {
    const { e, ctx, t, item } = comDuvida();
    expect(item.tipo).toBe('deteccao');
    revisarDeteccao(e, ctx, item.deteccao!, 'confirmar', 'presente');
    expect(statusDoDia(e, t.id, ctx.agora)).toBe('liberado');
    expect(filaExcecoes(e, t.obra_id!, ctx.agora).some((f) => f.chave === item.chave)).toBe(false);
  });

  it('corrigir para ausente gera a requisição do item', () => {
    const { e, ctx, t, item } = comDuvida();
    revisarDeteccao(e, ctx, item.deteccao!, 'corrigir', 'ausente');
    expect(statusDoDia(e, t.id, ctx.agora)).toBe('pendente');
    expect(e.requisicoes.some((r) => r.trabalhador_id === t.id && r.status === 'aberta')).toBe(true);
  });

  it('pedir nova foto refaz a leitura no próximo crachá', () => {
    const { e, ctx, t, item } = comDuvida();
    revisarDeteccao(e, ctx, item.deteccao!, 'pedir_nova_foto', null);
    expect(proximoPasso(e, t, ctx.agora)).toMatchObject({ tela: 'selfie', modo: 'completo' });
  });

  it('fila vem ordenada por risco e marca o prazo estourado', () => {
    const { e, ctx, porNome, t, item } = comDuvida();
    const c = checkinDoDia(e, porNome('Bruno').id, ctx.agora)!;
    pedirBloqueio(e, ctx, c, 'Sem cinto na borda da laje');
    const fila = filaExcecoes(e, t.obra_id!, ctx.agora);
    expect(fila[0].tipo).toBe('bloqueio');
    expect(fila.find((f) => f.trabalhador.nome.startsWith('Bruno') && f.tipo === 'deteccao')?.estourou_sla).toBe(true);
    expect(fila.find((f) => f.chave === item.chave)?.estourou_sla).toBe(false);
  });

  it('bloqueio só acontece com confirmação do técnico', () => {
    const { e, ctx, porNome } = demo();
    const t = porNome('Bruno');
    const c = checkinDoDia(e, t.id, ctx.agora)!;
    const pedido = pedirBloqueio(e, ctx, c, 'Sem cinto');
    expect(statusDoDia(e, t.id, ctx.agora)).toBe('pendente');
    decidirBloqueio(e, ctx, pedido, true);
    expect(statusDoDia(e, t.id, ctx.agora)).toBe('bloqueado');
  });

  it('liberação presencial não vale para quem está sem o EPI', () => {
    const { e, ctx, porNome } = demo();
    const t = porNome('João');
    const { c, itens } = fazerCheckin(e, ctx, t);
    const fechado = fecharCheckin(e, ctx, c, itens);
    expect(() => liberarPresencial(e, ctx, fechado, 'x')).toThrow();
  });

  it('liberação presencial resolve dúvida da IA', () => {
    const { e, ctx, porNome } = demo();
    const t = porNome('Bruno');
    liberarPresencial(e, ctx, checkinDoDia(e, t.id, ctx.agora)!, 'Conferi o cinto no local');
    expect(statusDoDia(e, t.id, ctx.agora)).toBe('liberado');
    expect(filaExcecoes(e, t.obra_id!, ctx.agora).some((f) => f.trabalhador.id === t.id)).toBe(false);
    expect(e.revisoes.at(-1)?.usar_no_treino).toBe(false);
  });

  it('dizer "estou com o item" manda para revisão, nunca libera', () => {
    const { e, ctx, porNome, epi } = demo();
    const t = porNome('João');
    const { c, itens } = fazerCheckin(e, ctx, t);
    const faltante = itens.find((i) => i.epi_id === epi('cinto'))!;
    const revisto = enviarParaRevisao(e, ctx, c, faltante, null, detector);
    const final = itens.map((i) => (i.epi_id === revisto.epi_id ? revisto : i));
    expect(fecharCheckin(e, ctx, c, final).resultado).toBe('pendente');
    expect(filaExcecoes(e, t.obra_id!, ctx.agora).some((f) => f.trabalhador.id === t.id)).toBe(true);
  });
});

describe('fatos derivados e auditoria', () => {
  it('saldo é a soma das movimentações e o alerta sai dele', () => {
    const { e, porNome, epi } = demo();
    const obra = porNome('João').obra_id!;
    expect(saldoEPI(e, epi('luva'), obra)).toBe(4);
    expect(episAbaixoDoMinimo(e, obra).map((x) => x.epi.tipo)).toEqual(['luva']);
  });

  it('toda escrita entra na fila de sincronização e na trilha', () => {
    const { e, ctx, porNome } = demo();
    const filaAntes = e.fila_sync.length;
    const auditAntes = e.audit.length;
    abrirCheckin(e, ctx, porNome('João'));
    expect(e.fila_sync.length).toBe(filaAntes + 1);
    expect(e.audit.length).toBe(auditAntes + 1);
  });

  it('a cadeia de auditoria detecta adulteração', () => {
    const { e, ctx, porNome } = demo();
    abrirCheckin(e, ctx, porNome('João'));
    expect(verificarCadeia(e.audit)).toBeNull();
    e.audit[5] = { ...e.audit[5], quem: 'outra pessoa' };
    expect(verificarCadeia(e.audit)).toBe(5);
  });

  it('dados de um estado vazio não quebram a leitura', () => {
    expect(filaExcecoes(estadoVazio(), 'x', AGORA)).toEqual([]);
    expect(mediana([])).toBeNull();
    expect(mediana([30, 10, 20, 40])).toBe(25);
  });

  it('uuid v7 tem versão, variante e ordena por tempo', () => {
    const a = uuidv7(new Uint8Array(16).fill(255), 1000);
    const b = uuidv7(new Uint8Array(16).fill(0), 2000);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a < b).toBe(true);
  });
});
