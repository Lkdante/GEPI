import { describe, expect, it } from 'vitest';
import { extratorRegras } from '@/ia/extrator';
import {
  analisarCompra,
  avaliarCotacoes,
  itensParaComprar,
  maisBaratoPorItem,
  motivosDoPlano,
  otimizarCompra,
  riscoFornecedor,
  SemSolucao,
  validarExtracao,
  type ItemCompra,
} from './compras';
import { emitirPedidos, pedirEPI, entradaEstoque, programarCompra, receberPedido, registrarCotacao, verificarCadeia } from './operacoes';
import { saldoEPI, somarDias } from './regras';
import { criarDemo } from './seed';
import type { Cotacao, Ctx, FornecedorCompra } from './tipos';

const AGORA = '2026-11-27T12:00:00.000Z';

function novoCtx(agora = AGORA): Ctx {
  let n = 0;
  return { agora, usuario: 'teste', dispositivo: 'disp', empresa: 'emp', uuid: () => `id-${++n}-${Math.random()}`, aleatorio: () => 0.5 };
}

function demo() {
  const ctx = novoCtx();
  const e = criarDemo(ctx);
  ctx.empresa = e.empresas[0].id;
  const aurora = e.obras[0].id;
  const epi = (tipo: string) => e.epis.find((x) => x.tipo === tipo)!.id;
  const forn = (prefixo: string) => e.fornecedores.find((f) => f.nome.startsWith(prefixo))!;
  return { e, ctx, aurora, epi, forn };
}

// ---- instâncias sintéticas, independentes do app --------------------------------

const base = { empresa_id: 'e', obra_id: null, criado_em: AGORA, atualizado_em: AGORA, recebido_em: null, criado_por: 't', dispositivo_id: 'd', versao: 1, excluido_em: null };
const F = (id: string, frete: number, minimo = 0): FornecedorCompra => ({ ...base, id, nome: id, frete_fixo: frete, pedido_minimo: minimo });
const C = (forn: string, epi: string, preco: number, prazo = 2, disp: number | null = null): Cotacao => ({
  ...base, id: `${forn}-${epi}`, fornecedor_id: forn, epi_id: epi, ca_id: 'ca', preco_unitario: preco, prazo_dias: prazo,
  quantidade_disponivel: disp, valida_ate: '2099-01-01', origem: 'manual',
});
const I = (epi: string, quantidade: number, prazo = 5): ItemCompra => ({ epi_id: epi, quantidade, prazo_max_dias: prazo, solicitacao_ids: [] });

function gerador(semente: number) {
  let s = semente >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Força bruta: todo subconjunto de fornecedores; dentro dele, cada item no mais barato (sem divisão, sem mínimo). */
function forcaBruta(itens: ItemCompra[], fs: FornecedorCompra[], cs: Cotacao[], risco: Record<string, number>, lam: number) {
  let melhor = Infinity;
  for (let m = 1; m < 1 << fs.length; m++) {
    const S = fs.filter((_, j) => m & (1 << j));
    let total = S.reduce((s, f) => s + f.frete_fixo, 0);
    for (const it of itens) {
      const ops = cs
        .filter((c) => c.epi_id === it.epi_id && c.prazo_dias <= it.prazo_max_dias && S.some((f) => f.id === c.fornecedor_id))
        .map((c) => c.preco_unitario * it.quantidade * (1 + lam * risco[c.fornecedor_id]));
      total += ops.length ? Math.min(...ops) : Infinity;
    }
    melhor = Math.min(melhor, total);
  }
  return melhor;
}

describe('otimizador de compras', () => {
  it('é igual à força bruta em 40 instâncias aleatórias', () => {
    const rnd = gerador(7);
    let comparadas = 0;
    for (let k = 0; k < 40; k++) {
      const fs = Array.from({ length: 5 }, (_, j) => F(`F${j}`, [0, 40, 120, 250][Math.floor(rnd() * 4)]));
      const epis = ['a', 'b', 'c', 'd'];
      const cs = fs.flatMap((f) => epis.filter(() => rnd() < 0.65).map((x) => C(f.id, x, Math.round((5 + rnd() * 50) * 100) / 100, 1 + Math.floor(rnd() * 8))));
      const itens = epis.map((x) => I(x, 1 + Math.floor(rnd() * 20), 3 + Math.floor(rnd() * 6)));
      const risco = Object.fromEntries(fs.map((f) => [f.id, rnd() * 0.5]));
      const bruta = forcaBruta(itens, fs, cs, risco, 0.2);
      const plano = otimizarCompra(itens, fs, cs, risco, { peso_risco: 0.2, max_fornecedores: null, permitir_divisao: false });
      if (plano.fora.length > 0) continue; // a força bruta não sabe tirar item; compara só os completos
      expect(plano.custo_total).toBeCloseTo(bruta, 1);
      expect(plano.provado).toBe(true);
      comparadas++;
    }
    expect(comparadas).toBeGreaterThan(15);
  });

  it('com pedido mínimo, também é igual à força bruta (todas as atribuições item -> fornecedor)', () => {
    const rnd = gerador(11);
    let comparadas = 0;
    for (let k = 0; k < 30; k++) {
      const fs = Array.from({ length: 4 }, (_, j) => F(`F${j}`, [0, 50, 150][Math.floor(rnd() * 3)], [0, 200, 500][Math.floor(rnd() * 3)]));
      const epis = ['a', 'b', 'c', 'd'];
      const cs = fs.flatMap((f) => epis.filter(() => rnd() < 0.75).map((x) => C(f.id, x, Math.round((5 + rnd() * 60) * 100) / 100)));
      const itens = epis.map((x) => I(x, 1 + Math.floor(rnd() * 15)));
      let bruta = Infinity;
      const escolha = new Array<number>(itens.length).fill(0);
      const total = fs.length ** itens.length;
      for (let m = 0; m < total; m++) {
        let r = m;
        for (let i = 0; i < itens.length; i++) (escolha[i] = r % fs.length), (r = Math.floor(r / fs.length));
        const valor = new Map<string, number>();
        let ok = true;
        for (let i = 0; i < itens.length && ok; i++) {
          const c = cs.find((x) => x.fornecedor_id === fs[escolha[i]].id && x.epi_id === itens[i].epi_id);
          if (!c) ok = false;
          else valor.set(c.fornecedor_id, (valor.get(c.fornecedor_id) ?? 0) + c.preco_unitario * itens[i].quantidade);
        }
        if (!ok) continue;
        let custo = 0;
        for (const [fid, v] of valor) {
          const f = fs.find((x) => x.id === fid)!;
          if (v < f.pedido_minimo) ok = false;
          custo += v + f.frete_fixo;
        }
        if (ok) bruta = Math.min(bruta, custo);
      }
      const p = { peso_risco: 0, max_fornecedores: null, permitir_divisao: false };
      let plano;
      try {
        plano = otimizarCompra(itens, fs, cs, {}, p);
      } catch (erro) {
        expect(erro).toBeInstanceOf(SemSolucao);
        expect(bruta).toBe(Infinity);
        continue;
      }
      if (plano.fora.length > 0) continue;
      expect(plano.custo_total).toBeCloseTo(bruta, 1);
      comparadas++;
    }
    expect(comparadas).toBeGreaterThan(10);
  });

  it('o frete faz consolidar num fornecedor mais caro por item', () => {
    const fs = [F('A', 60), F('B', 200), F('C', 200)];
    const cs = [C('A', 'luva', 9), C('A', 'capacete', 48), C('B', 'luva', 7.5), C('C', 'capacete', 44)];
    const itens = [I('luva', 10), I('capacete', 5)];
    const otimo = otimizarCompra(itens, fs, cs, {});
    const base = maisBaratoPorItem(itens, fs, cs, {});
    expect(base.fornecedores).toEqual(['B', 'C']);
    expect(otimo.fornecedores).toEqual(['A']);
    expect(otimo.custo_total).toBeLessThan(base.custo_total);
  });

  it('respeita o pedido mínimo, que a compra item a item violaria', () => {
    const fs = [F('A', 0, 1000), F('B', 30)];
    const cs = [C('A', 'luva', 6), C('B', 'luva', 8)];
    const itens = [I('luva', 20)]; // 20 x 6 = 120 < 1000
    expect(otimizarCompra(itens, fs, cs, {}).fornecedores).toEqual(['B']);
    expect(maisBaratoPorItem(itens, fs, cs, {}).avisos[0]).toMatch(/abaixo do mínimo/);
  });

  it('divide o item quando o estoque do fornecedor não basta, sempre em unidades inteiras', () => {
    const fs = [F('A', 0), F('B', 0)];
    const cs = [C('A', 'luva', 7, 2, 13), C('B', 'luva', 9)];
    const plano = otimizarCompra([I('luva', 30)], fs, cs, {});
    expect(Object.fromEntries(plano.alocacoes.map((a) => [a.fornecedor_id, a.quantidade]))).toEqual({ A: 13, B: 17 });
    const semDividir = otimizarCompra([I('luva', 30)], fs, cs, {}, { peso_risco: 0, max_fornecedores: null, permitir_divisao: false });
    expect(semDividir.fornecedores).toEqual(['B']);
  });

  it('o risco de atraso pode valer mais que o preço', () => {
    const fs = [F('Barato', 0), F('Confiavel', 0)];
    const cs = [C('Barato', 'cinto', 240), C('Confiavel', 'cinto', 260)];
    const risco = { Barato: 0.6, Confiavel: 0.1 };
    const itens = [I('cinto', 4)];
    expect(otimizarCompra(itens, fs, cs, risco, { peso_risco: 0, max_fornecedores: null, permitir_divisao: true }).fornecedores).toEqual(['Barato']);
    expect(otimizarCompra(itens, fs, cs, risco, { peso_risco: 0.5, max_fornecedores: null, permitir_divisao: true }).fornecedores).toEqual(['Confiavel']);
  });

  it('explica por que um item ficou de fora, e não inventa compra', () => {
    const plano = otimizarCompra([I('luva', 5, 2), I('cinto', 1)], [F('A', 0)], [C('A', 'luva', 9, 4)], {});
    expect(plano.alocacoes).toEqual([]);
    expect(plano.fora).toEqual([
      { epi_id: 'luva', motivo: 'ninguém entrega em até 2 dias' },
      { epi_id: 'cinto', motivo: 'nenhuma cotação válida' },
    ]);
  });

  it('regra impossível vira erro claro', () => {
    const fs = [F('A', 0), F('B', 0)];
    const cs = [C('A', 'luva', 9), C('B', 'cinto', 250)];
    expect(() =>
      otimizarCompra([I('luva', 2), I('cinto', 1)], fs, cs, {}, { peso_risco: 0, max_fornecedores: 1, permitir_divisao: true }),
    ).toThrow(SemSolucao);
  });

  it('resolve rápido um caso grande para uma obra (7 EPIs x 8 fornecedores)', () => {
    const rnd = gerador(3);
    const fs = Array.from({ length: 8 }, (_, j) => F(`F${j}`, 30 + Math.floor(rnd() * 250), rnd() < 0.5 ? 0 : 300));
    const epis = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];
    const cs = fs.flatMap((f) => epis.filter(() => rnd() < 0.8).map((x) => C(f.id, x, 3 + rnd() * 200, 2, rnd() < 0.3 ? 5 : null)));
    const itens = epis.map((x) => I(x, 5 + Math.floor(rnd() * 25), 9));
    const t0 = performance.now();
    const plano = otimizarCompra(itens, fs, cs, {});
    expect(performance.now() - t0).toBeLessThan(3000);
    expect(plano.provado).toBe(true);
    // Tirar o pedido mínimo só pode baratear (é uma relaxação): o ótimo nunca fica abaixo disso.
    const relaxado = otimizarCompra(itens, fs.map((f) => ({ ...f, pedido_minimo: 0 })), cs, {});
    expect(plano.custo_total).toBeGreaterThanOrEqual(relaxado.custo_total - 0.01);
    // A compra item a item só vale de comparação quando o fornecedor aceitaria (sem aviso de mínimo).
    const guloso = maisBaratoPorItem(itens, fs, cs, {});
    if (guloso.avisos.length === 0) expect(plano.custo_total).toBeLessThanOrEqual(guloso.custo_total + 0.01);
    else expect(relaxado.custo_total).toBeLessThanOrEqual(guloso.custo_total + 0.01);
  });
});

describe('cotações e risco no app', () => {
  it('cotação com CA vencido e preço suspeito ficam de fora, com o motivo', () => {
    const { e, epi, forn } = demo();
    const fora = avaliarCotacoes(e, AGORA).filter((a) => !a.usavel);
    const motivo = (f: string, tipo: string) =>
      fora.find((a) => a.cotacao.fornecedor_id === forn(f).id && a.cotacao.epi_id === epi(tipo))?.motivo;
    expect(motivo('MegaEPI', 'capacete')).toMatch(/CA 90099 vencido/);
    expect(motivo('Segurança', 'luva')).toMatch(/Preço suspeito/);
  });

  it('cotação vencida sai e a mais recente substitui a anterior', () => {
    const { e, ctx, epi, forn } = demo();
    const ca = e.cas.find((c) => c.epi_id === epi('cinto') && c.situacao === 'valido')!;
    const nova = registrarCotacao(e, { ...ctx, agora: '2026-11-27T13:00:00.000Z' }, {
      fornecedor_id: forn('EPI Center').id, epi_id: epi('cinto'), ca_id: ca.id, preco_unitario: 199,
      prazo_dias: 1, quantidade_disponivel: null, valida_ate: '2026-12-31', origem: 'manual',
    });
    const doCinto = avaliarCotacoes(e, AGORA).filter((a) => a.cotacao.fornecedor_id === forn('EPI Center').id && a.cotacao.epi_id === epi('cinto'));
    expect(doCinto.map((a) => a.cotacao.id)).toEqual([nova.id]);
    const daquiUmMes = avaliarCotacoes(e, somarDias(AGORA, 40)).find((a) => a.cotacao.id === nova.id)!;
    expect(daquiUmMes.usavel).toBe(false);
    expect(daquiUmMes.motivo).toMatch(/vencida/);
  });

  it('não grava cotação com CA de outro EPI', () => {
    const { e, ctx, epi, forn } = demo();
    const caDoCapacete = e.cas.find((c) => c.epi_id === epi('capacete'))!;
    expect(() =>
      registrarCotacao(e, ctx, {
        fornecedor_id: forn('EPI Center').id, epi_id: epi('luva'), ca_id: caDoCapacete.id, preco_unitario: 9,
        prazo_dias: 1, quantidade_disponivel: null, valida_ate: '2026-12-31', origem: 'manual',
      }),
    ).toThrow(/CA/);
  });

  it('risco bayesiano: fornecedor novo começa em 20% e o histórico puxa para a taxa real', () => {
    const { e, forn } = demo();
    expect(riscoFornecedor(e, forn('Luvas').id).prob).toBeCloseTo(1 / 5);
    expect(riscoFornecedor(e, forn('EPI Center').id).prob).toBeCloseTo(2 / 15); // 1 atraso em 10
    expect(riscoFornecedor(e, forn('MegaEPI').id).prob).toBeCloseTo(6 / 13); // 5 em 8
  });

  it('na demonstração, a recomendação é mais barata que comprar item a item', () => {
    const { e, aurora } = demo();
    const a = analisarCompra(e, aurora, AGORA)!;
    expect(a.itens.length).toBe(6);
    expect(a.otimo.custo_total).toBeLessThan(a.base.custo_total);
    expect(a.otimo.fornecedores.length).toBeLessThan(a.base.fornecedores.length);
    expect(motivosDoPlano(a)[0]).toMatch(/Economiza/);
  });

  it('não chama de "melhor" uma compra que o fornecedor recusaria', () => {
    const { e } = demo();
    const horizonte = e.obras[1].id;
    const a = analisarCompra(e, horizonte, AGORA)!;
    expect(a.base.avisos.length).toBeGreaterThan(0);
    expect(motivosDoPlano(a)[0]).toMatch(/não é possível/);
  });
});

describe('do plano ao estoque', () => {
  it('emitir pedidos autoriza as solicitações; receber dá entrada e vira histórico', () => {
    const { e, ctx, aurora, epi } = demo();
    const a = analisarCompra(e, aurora, AGORA)!;
    const saldoAntes = saldoEPI(e, epi('capacete'), aurora);
    const pedidos = emitirPedidos(e, ctx, aurora, a.otimo, a.itens);

    expect(pedidos.length).toBe(a.otimo.fornecedores.length);
    expect(itensParaComprar(e, aurora)).toEqual([]);
    const total = pedidos.reduce((s, p) => s + p.total, 0);
    expect(total).toBeCloseTo(a.otimo.desembolso, 2);

    const p = pedidos[0];
    const recebidosAntes = riscoFornecedor(e, p.fornecedor_id).recebidos;
    receberPedido(e, ctx, p.id);
    expect(saldoEPI(e, epi('capacete'), aurora)).toBe(saldoAntes + 10);
    expect(riscoFornecedor(e, p.fornecedor_id).recebidos).toBe(recebidosAntes + 1);
    expect(() => receberPedido(e, ctx, p.id)).toThrow();
    expect(verificarCadeia(e.audit)).toBeNull();
  });

  it('pedido entregue depois do prazo conta como atraso', () => {
    const { e, ctx, aurora } = demo();
    const a = analisarCompra(e, aurora, AGORA)!;
    const [p] = emitirPedidos(e, ctx, aurora, a.otimo, a.itens);
    const antes = riscoFornecedor(e, p.fornecedor_id);
    const r = receberPedido(e, { ...ctx, agora: somarDias(p.prazo_prometido, 2) }, p.id);
    expect(r.no_prazo).toBe(false);
    expect(riscoFornecedor(e, p.fornecedor_id).atrasos).toBe(antes.atrasos + 1);
  });

  it('requisição sem estoque vira compra urgente (3 dias) e volta a abrir quando o pedido chega', () => {
    const { e, ctx, aurora, epi } = demo();
    const t = e.trabalhadores.find((x) => x.nome.startsWith('João'))!;
    const cinto = epi('cinto');
    entradaEstoque(e, ctx, aurora, cinto, -saldoEPI(e, cinto, aurora));
    const r = pedirEPI(e, ctx, t, cinto, 'falta', null);
    expect(r.status).toBe('aguardando_compra');
    expect(itensParaComprar(e, aurora).find((i) => i.epi_id === cinto)?.prazo_max_dias).toBe(3);

    const a = analisarCompra(e, aurora, AGORA)!;
    const pedidos = emitirPedidos(e, ctx, aurora, a.otimo, a.itens);
    const doCinto = pedidos.find((p) => p.itens.some((i) => i.epi_id === cinto))!;
    receberPedido(e, ctx, doCinto.id);
    expect(e.requisicoes.find((x) => x.id === r.id)?.status).toBe('aberta');
  });

  it('compra programada exige quantidade inteira positiva', () => {
    const { e, ctx, aurora, epi } = demo();
    expect(() => programarCompra(e, ctx, aurora, epi('luva'), 0)).toThrow();
    expect(() => programarCompra(e, ctx, aurora, epi('luva'), 2.5)).toThrow();
  });
});

describe('cotação colada do WhatsApp', () => {
  const TEXTO = `Boa tarde! Segue orçamento:
- Luva vaqueta CA 90013 cx c/ 12 pares R$ 96,00 - 2 dias
- Capacete aba frontal CA 90010 R$ 42,90 un
- Óculos incolor CA 99999 R$ 14,00
- Bota PVC R$ 79,00
- Protetor plug CA 90016 R$ 30,00 a dúzia
Frete grátis
Pedido mínimo R$ 300,00
Prazo de entrega: 4 dias`;

  it('lê preço por unidade (caixa e dúzia), CA, prazo, frete e mínimo', () => {
    const { e } = demo();
    const x = extratorRegras.extrair(TEXTO, e.epis);
    expect(x.frete).toBe(0);
    expect(x.pedido_minimo).toBe(300);
    expect(x.prazo_geral).toBe(4);
    const luva = x.linhas.find((l) => l.texto.startsWith('Luva'))!;
    expect(luva.preco_unitario).toBe(8);
    expect(luva.ca_numero).toBe('90013');
    expect(luva.prazo_dias).toBe(2);
    expect(x.linhas.find((l) => l.texto.startsWith('Protetor'))!.preco_unitario).toBe(2.5);
  });

  it('só vira cotação o que passa na validação; o resto é pendência', () => {
    const { e, forn } = demo();
    const x = extratorRegras.extrair(TEXTO, e.epis);
    const v = validarExtracao(e, forn('Luvas').id, x, AGORA);
    const tipos = v.cotacoes.map((c) => e.epis.find((p) => p.id === c.epi_id)!.tipo).sort();
    expect(tipos).toEqual(['capacete', 'luva', 'protetor']);
    expect(v.cotacoes.find((c) => e.epis.find((p) => p.id === c.epi_id)!.tipo === 'capacete')!.prazo_dias).toBe(4);
    const motivos = v.pendencias.map((p) => p.motivo);
    expect(motivos).toEqual(['CA 99999 não cadastrado para este EPI', 'EPI não reconhecido']);
  });
});

