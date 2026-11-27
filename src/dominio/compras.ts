// Motor de cotação e combinação de fornecedores.
//
// Pergunta: dadas as solicitações de compra da obra e as cotações recebidas,
// de quem comprar o quê para gastar o mínimo?
//
// "O mais barato de cada item" erra porque o frete é cobrado POR FORNECEDOR:
// o custo de comprar um item de alguém depende do que mais você compra dele.
// Por isso o problema é de otimização inteira (MILP), resolvido em simplex.ts.
//
// Variáveis:  q_k   quantidade comprada no par k = (EPI i, fornecedor j)   [inteira]
//             y_j   1 se o fornecedor j entra no pedido                     [binária]
// Objetivo:   min  Σ p_k q_k (1 + λ r_j)  +  Σ F_j y_j
// Sujeito a:  Σ_j q_k = Q_i           cada EPI é comprado por inteiro
//             q_k <= C_k y_j          só compra de quem foi ativado (é o que cobra o frete)
//             Σ_i p_k q_k >= M_j y_j  se ativar, respeita o pedido mínimo
//             Σ y_j <= K              opcional: no máximo K fornecedores
// Pares sem cotação válida, com CA inválido ou prazo maior que o necessário nem viram variável.
import { conferirCA, diaLocal, mediana, somarDias } from './regras';
import { resolverMILP, type Restricao } from './simplex';
import type { Cotacao, EPI, Estado, FornecedorCompra, OrigemSolicitacao } from './tipos';

/** Prazo máximo de entrega conforme a origem da necessidade. */
export const PRAZO_POR_ORIGEM: Record<OrigemSolicitacao, number> = {
  requisicao_sem_estoque: 3, // tem trabalhador parado esperando o EPI
  estoque_minimo: 7,
  programada: 15,
};

/**
 * Risco de atraso: estimativa bayesiana (Beta-Binomial) a partir dos pedidos recebidos.
 * Priori Beta(1, 4) = "20% de atraso" antes de qualquer dado. Fornecedor novo começa em 20%;
 * com histórico, a estimativa converge para a taxa observada. Com poucos pedidos por
 * fornecedor, isso é mais honesto que treinar um modelo grande: não se deixa enganar
 * por 1 entrega no prazo ("100% confiável!").
 */
export const PRIORI_ATRASO = { atrasos: 1, pedidos: 5 };

export interface ItemCompra {
  epi_id: string;
  quantidade: number;
  prazo_max_dias: number;
  solicitacao_ids: string[];
}

export interface Parametros {
  /** Fração do valor que se "perde" se o pedido atrasar. 0 = ignora o risco. */
  peso_risco: number;
  max_fornecedores: number | null;
  /** Se um mesmo EPI pode ser comprado de mais de um fornecedor. */
  permitir_divisao: boolean;
}
export const PARAMETROS_PADRAO: Parametros = { peso_risco: 0.15, max_fornecedores: null, permitir_divisao: true };

export interface Alocacao {
  fornecedor_id: string;
  epi_id: string;
  cotacao_id: string;
  ca_id: string;
  quantidade: number;
  preco_unitario: number;
  prazo_dias: number;
  prob_atraso: number;
}

export interface ItemFora {
  epi_id: string;
  motivo: string;
}

export interface Plano {
  metodo: 'otimo' | 'mais_barato_por_item';
  alocacoes: Alocacao[];
  fornecedores: string[];
  material: number;
  frete: number;
  /** Custo ESPERADO de atraso: entra na decisão, mas não sai do caixa. */
  risco: number;
  desembolso: number;
  custo_total: number;
  fora: ItemFora[];
  avisos: string[];
  /** false = o branch-and-bound parou no limite de nós (não deve ocorrer em obra real). */
  provado: boolean;
}

const vivos = <T extends { excluido_em: string | null }>(l: T[]) => l.filter((x) => !x.excluido_em);
const r2 = (v: number) => Math.round(v * 100) / 100;

export function brl(v: number): string {
  return 'R$ ' + v.toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// ------------------------------------------------------------------ leitura do estado

/** Solicitações em aberto da obra, somadas por EPI. O prazo é o da mais urgente. */
export function itensParaComprar(e: Estado, obra_id: string): ItemCompra[] {
  const porEpi = new Map<string, ItemCompra>();
  for (const s of vivos(e.solicitacoes)) {
    if (s.obra_id !== obra_id || s.situacao !== 'nao_autorizada') continue;
    const atual = porEpi.get(s.epi_id) ?? { epi_id: s.epi_id, quantidade: 0, prazo_max_dias: Infinity, solicitacao_ids: [] };
    atual.quantidade += s.quantidade;
    atual.prazo_max_dias = Math.min(atual.prazo_max_dias, PRAZO_POR_ORIGEM[s.origem]);
    atual.solicitacao_ids.push(s.id);
    porEpi.set(s.epi_id, atual);
  }
  return [...porEpi.values()];
}

export interface RiscoFornecedor {
  fornecedor_id: string;
  recebidos: number;
  atrasos: number;
  prob: number;
}

export function riscoFornecedor(e: Estado, fornecedor_id: string): RiscoFornecedor {
  const recebidos = vivos(e.pedidos).filter((p) => p.fornecedor_id === fornecedor_id && p.situacao === 'recebido');
  const atrasos = recebidos.filter((p) => p.no_prazo === false).length;
  return {
    fornecedor_id,
    recebidos: recebidos.length,
    atrasos,
    prob: (atrasos + PRIORI_ATRASO.atrasos) / (recebidos.length + PRIORI_ATRASO.pedidos),
  };
}

export interface CotacaoAvaliada {
  cotacao: Cotacao;
  usavel: boolean;
  motivo: string | null;
}

/**
 * Filtra as cotações antes da otimização. Vale só a mais recente de cada fornecedor × EPI.
 * Fica de fora (com o motivo, para a tela mostrar):
 * - cotação vencida;
 * - CA vencido, cancelado ou de outro EPI (mesma regra da entrega: não se compra EPI sem CA válido);
 * - preço suspeito de barato: menos da metade da mediana dos concorrentes (precisa de 3+ cotações).
 *   Quase sempre é erro de unidade (preço do par lançado como caixa, etc.). Se ficasse,
 *   o otimizador escolheria justamente o erro de digitação.
 */
export function avaliarCotacoes(e: Estado, agora: string): CotacaoAvaliada[] {
  const hoje = diaLocal(agora);
  const maisRecente = new Map<string, Cotacao>();
  for (const c of vivos(e.cotacoes)) {
    const chave = `${c.fornecedor_id}|${c.epi_id}`;
    const atual = maisRecente.get(chave);
    if (!atual || c.criado_em > atual.criado_em) maisRecente.set(chave, c);
  }
  const avaliadas: CotacaoAvaliada[] = [...maisRecente.values()].map((c) => {
    if (c.valida_ate < hoje) return { cotacao: c, usavel: false, motivo: `Cotação vencida em ${c.valida_ate.split('-').reverse().join('/')}` };
    const ca = e.cas.find((x) => x.id === c.ca_id);
    const conf = conferirCA(ca, c.epi_id, agora);
    if (conf !== 'valido') {
      const texto = { vencido: 'vencido', cancelado: 'cancelado', nao_encontrado: 'não encontrado', tipo_errado: 'de outro tipo de EPI' }[conf];
      return { cotacao: c, usavel: false, motivo: `CA ${ca?.numero ?? '?'} ${texto}` };
    }
    return { cotacao: c, usavel: true, motivo: null };
  });

  const porEpi = new Map<string, CotacaoAvaliada[]>();
  for (const a of avaliadas) if (a.usavel) porEpi.set(a.cotacao.epi_id, [...(porEpi.get(a.cotacao.epi_id) ?? []), a]);
  for (const lista of porEpi.values()) {
    if (lista.length < 3) continue;
    const med = mediana(lista.map((a) => a.cotacao.preco_unitario))!;
    for (const a of lista) {
      if (a.cotacao.preco_unitario < 0.5 * med) {
        a.usavel = false;
        a.motivo = `Preço suspeito: ${brl(a.cotacao.preco_unitario)} contra mediana de ${brl(med)}. Confira a unidade (par, caixa) antes de usar`;
      }
    }
  }
  return avaliadas;
}

// ------------------------------------------------------------------ otimização

interface Par {
  item: ItemCompra;
  forn: FornecedorCompra;
  cot: Cotacao;
  cap: number;
  r: number;
}

/** Monta os pares viáveis e explica, ANTES do solver, por que um item não tem como ser comprado. */
function montarPares(
  itens: ItemCompra[],
  fornecedores: FornecedorCompra[],
  cotacoes: Cotacao[],
  risco: Record<string, number>,
  permitir_divisao: boolean,
): { pares: Par[]; fora: ItemFora[] } {
  const pares: Par[] = [];
  const fora: ItemFora[] = [];
  for (const item of itens) {
    const doItem = cotacoes.filter((c) => c.epi_id === item.epi_id && fornecedores.some((f) => f.id === c.fornecedor_id));
    const noPrazo = doItem.filter((c) => c.prazo_dias <= item.prazo_max_dias);
    const candidatos = noPrazo
      .map((cot) => {
        const cap = Math.min(item.quantidade, cot.quantidade_disponivel ?? Infinity);
        const forn = fornecedores.find((f) => f.id === cot.fornecedor_id)!;
        return { item, forn, cot, cap, r: risco[forn.id] ?? 0 };
      })
      .filter((p) => p.cap > 0 && (permitir_divisao || p.cap >= item.quantidade));
    const capTotal = candidatos.reduce((s, p) => s + p.cap, 0);
    if (doItem.length === 0) fora.push({ epi_id: item.epi_id, motivo: 'nenhuma cotação válida' });
    else if (noPrazo.length === 0) fora.push({ epi_id: item.epi_id, motivo: `ninguém entrega em até ${item.prazo_max_dias} dias` });
    else if (capTotal < item.quantidade) {
      fora.push({
        epi_id: item.epi_id,
        motivo: permitir_divisao ? 'estoque somado dos fornecedores não basta' : 'nenhum fornecedor tem tudo sozinho (permita dividir)',
      });
    } else pares.push(...candidatos);
  }
  return { pares, fora };
}

function montarPlano(
  metodo: Plano['metodo'],
  alocacoes: Alocacao[],
  fornecedores: FornecedorCompra[],
  peso_risco: number,
  fora: ItemFora[],
  provado: boolean,
): Plano {
  const usados = [...new Set(alocacoes.map((a) => a.fornecedor_id))].sort();
  const material = alocacoes.reduce((s, a) => s + a.quantidade * a.preco_unitario, 0);
  const frete = usados.reduce((s, j) => s + fornecedores.find((f) => f.id === j)!.frete_fixo, 0);
  const risco = alocacoes.reduce((s, a) => s + peso_risco * a.prob_atraso * a.quantidade * a.preco_unitario, 0);
  return {
    metodo,
    alocacoes: [...alocacoes].sort((a, b) => a.fornecedor_id.localeCompare(b.fornecedor_id) || a.epi_id.localeCompare(b.epi_id)),
    fornecedores: usados,
    material: r2(material),
    frete: r2(frete),
    risco: r2(risco),
    desembolso: r2(material + frete),
    custo_total: r2(material + frete + risco),
    fora,
    avisos: [],
    provado,
  };
}

const alocar = (p: Par, quantidade: number): Alocacao => ({
  fornecedor_id: p.forn.id,
  epi_id: p.item.epi_id,
  cotacao_id: p.cot.id,
  ca_id: p.cot.ca_id,
  quantidade,
  preco_unitario: p.cot.preco_unitario,
  prazo_dias: p.cot.prazo_dias,
  prob_atraso: p.r,
});

export class SemSolucao extends Error {}

export function otimizarCompra(
  itens: ItemCompra[],
  fornecedores: FornecedorCompra[],
  cotacoes: Cotacao[],
  risco: Record<string, number>,
  p: Parametros = PARAMETROS_PADRAO,
): Plano {
  const { pares, fora } = montarPares(itens, fornecedores, cotacoes, risco, p.permitir_divisao);
  if (pares.length === 0) return montarPlano('otimo', [], fornecedores, p.peso_risco, fora, true);

  const forns = [...new Set(pares.map((x) => x.forn.id))].map((id) => fornecedores.find((f) => f.id === id)!);
  const P = pares.length;
  const n = P + forns.length;
  const y = (j: string) => P + forns.findIndex((f) => f.id === j);
  // Sem divisão, a variável do par é binária (x) e a quantidade é Q·x.
  const mult = pares.map((par) => (p.permitir_divisao ? 1 : par.item.quantidade));
  const linha = () => new Array<number>(n).fill(0);

  const c = linha();
  pares.forEach((par, k) => (c[k] = par.cot.preco_unitario * (1 + p.peso_risco * par.r) * mult[k]));
  forns.forEach((f) => (c[y(f.id)] = f.frete_fixo));

  const rest: Restricao[] = [];
  for (const item of itens) {
    const coef = linha();
    pares.forEach((par, k) => par.item === item && (coef[k] = mult[k]));
    if (coef.some((v) => v !== 0)) rest.push({ coef, sentido: '=', rhs: item.quantidade });
  }
  pares.forEach((par, k) => {
    const coef = linha();
    coef[k] = mult[k];
    coef[y(par.forn.id)] = -par.cap;
    rest.push({ coef, sentido: '<=', rhs: 0 });
  });
  for (const f of forns) {
    const um = linha();
    um[y(f.id)] = 1;
    rest.push({ coef: um, sentido: '<=', rhs: 1 });
    if (f.pedido_minimo > 0) {
      const coef = linha();
      pares.forEach((par, k) => par.forn.id === f.id && (coef[k] = par.cot.preco_unitario * mult[k]));
      coef[y(f.id)] = -f.pedido_minimo;
      rest.push({ coef, sentido: '>=', rhs: 0 });
    }
  }
  if (p.max_fornecedores !== null) {
    const coef = linha();
    forns.forEach((f) => (coef[y(f.id)] = 1));
    rest.push({ coef, sentido: '<=', rhs: p.max_fornecedores });
  }

  const s = resolverMILP(c, rest, [...Array(n).keys()]);
  if (s.status !== 'otimo') {
    throw new SemSolucao(
      'Nenhuma combinação atende a todas as regras (pedido mínimo, limite de fornecedores, estoque). ' +
        'Tente permitir dividir itens ou aumentar o número de fornecedores.',
    );
  }
  const alocacoes = pares
    .map((par, k) => ({ par, q: Math.round(s.x[k] * mult[k]) }))
    .filter(({ q }) => q > 0)
    .map(({ par, q }) => alocar(par, q));
  return montarPlano('otimo', alocacoes, fornecedores, p.peso_risco, fora, s.provado);
}

/** O que se faria na planilha: o mais barato de cada EPI, ignorando frete. É a linha de base. */
export function maisBaratoPorItem(
  itens: ItemCompra[],
  fornecedores: FornecedorCompra[],
  cotacoes: Cotacao[],
  risco: Record<string, number>,
  p: Parametros = PARAMETROS_PADRAO,
): Plano {
  const { pares, fora } = montarPares(itens, fornecedores, cotacoes, risco, p.permitir_divisao);
  const alocacoes: Alocacao[] = [];
  for (const item of itens) {
    let falta = item.quantidade;
    const opcoes = pares.filter((x) => x.item === item).sort((a, b) => a.cot.preco_unitario - b.cot.preco_unitario);
    for (const par of opcoes) {
      if (falta <= 0) break;
      const q = Math.min(par.cap, falta);
      alocacoes.push(alocar(par, q));
      falta -= q;
    }
  }
  const plano = montarPlano('mais_barato_por_item', alocacoes, fornecedores, p.peso_risco, fora, true);
  for (const j of plano.fornecedores) {
    const f = fornecedores.find((x) => x.id === j)!;
    const valor = alocacoes.filter((a) => a.fornecedor_id === j).reduce((s, a) => s + a.quantidade * a.preco_unitario, 0);
    if (valor < f.pedido_minimo) {
      plano.avisos.push(`${f.nome}: pedido de ${brl(valor)} abaixo do mínimo de ${brl(f.pedido_minimo)} (seria recusado)`);
    }
  }
  return plano;
}

export interface Comparacao {
  economia: number;
  percentual: number;
  economia_desembolso: number;
  fretes_evitados: number;
}

export function comparar(otimo: Plano, base: Plano): Comparacao {
  const economia = r2(base.custo_total - otimo.custo_total);
  return {
    economia,
    percentual: base.custo_total > 0 ? r2((100 * economia) / base.custo_total) : 0,
    economia_desembolso: r2(base.desembolso - otimo.desembolso),
    fretes_evitados: base.fornecedores.length - otimo.fornecedores.length,
  };
}

export interface AnaliseCompra {
  itens: ItemCompra[];
  avaliadas: CotacaoAvaliada[];
  risco: Record<string, RiscoFornecedor>;
  otimo: Plano;
  base: Plano;
  comparacao: Comparacao;
}

/** Tudo que a tela de compras precisa, calculado do estado (nada é gravado aqui). */
export function analisarCompra(e: Estado, obra_id: string, agora: string, p: Parametros = PARAMETROS_PADRAO): AnaliseCompra | null {
  const itens = itensParaComprar(e, obra_id);
  if (itens.length === 0) return null;
  const fornecedores = vivos(e.fornecedores);
  const avaliadas = avaliarCotacoes(e, agora);
  const usaveis = avaliadas.filter((a) => a.usavel).map((a) => a.cotacao);
  const risco = Object.fromEntries(fornecedores.map((f) => [f.id, riscoFornecedor(e, f.id)]));
  const prob = Object.fromEntries(Object.values(risco).map((r) => [r.fornecedor_id, r.prob]));
  const otimo = otimizarCompra(itens, fornecedores, usaveis, prob, p);
  const base = maisBaratoPorItem(itens, fornecedores, usaveis, prob, p);
  return { itens, avaliadas, risco, otimo, base, comparacao: comparar(otimo, base) };
}

/** Por que a recomendação é essa, em frases curtas. Os números vêm do plano, nunca de texto livre. */
export function motivosDoPlano(a: AnaliseCompra): string[] {
  const { otimo, base, comparacao: cmp } = a;
  const m: string[] = [];
  if (base.avisos.length > 0 && cmp.economia <= 0.005) {
    // Comparar com uma compra que o fornecedor recusaria seria enganoso.
    m.push('Comprar o mais barato de cada EPI não é possível: o pedido ficaria abaixo do mínimo do fornecedor.');
    m.push('A recomendação é a combinação válida mais barata.');
  } else if (cmp.economia <= 0.005) {
    m.push('Comprar o mais barato de cada EPI já era a melhor opção.');
  } else {
    m.push(`Economiza ${brl(cmp.economia)} (${cmp.percentual.toFixed(1).replace('.', ',')}%) contra comprar o mais barato de cada EPI.`);
    if (cmp.fretes_evitados > 0) {
      const n = otimo.fornecedores.length;
      const fretes = cmp.fretes_evitados === 1 ? '1 frete' : `${cmp.fretes_evitados} fretes`;
      m.push(`Usa ${n} fornecedor${n === 1 ? '' : 'es'} em vez de ${base.fornecedores.length}: ${fretes} a menos.`);
    }
    if (base.risco > otimo.risco + 0.005) m.push('Troca fornecedores com mais histórico de atraso.');
    if (base.avisos.length > 0) m.push('Respeita pedidos mínimos que a compra item a item violaria.');
    if (cmp.economia_desembolso < 0) m.push(`Paga ${brl(-cmp.economia_desembolso)} a mais no caixa para reduzir o risco de atraso.`);
  }
  for (const f of otimo.fora) m.push(`Fora do plano: ${f.motivo}.`);
  return m;
}

// ------------------------------------------------------------------ cotação em texto

export interface LinhaExtraida {
  texto: string;
  epi_id: string | null;
  ca_numero: string | null;
  preco_unitario: number | null;
  prazo_dias: number | null;
  disponivel: number | null;
}
export interface Extracao {
  linhas: LinhaExtraida[];
  prazo_geral: number | null;
  frete: number | null;
  pedido_minimo: number | null;
}

export type DadosCotacao = Omit<Cotacao, 'id' | 'empresa_id' | 'obra_id' | 'criado_em' | 'atualizado_em' | 'recebido_em' | 'criado_por' | 'dispositivo_id' | 'versao' | 'excluido_em'>;

/**
 * Valida o que o extrator (regras ou LLM) leu. O extrator só LÊ: aqui o código confere
 * EPI reconhecido, CA cadastrado e do mesmo EPI, preço e prazo. O que falhar vira
 * pendência e não entra em nenhuma conta.
 */
export function validarExtracao(
  e: Estado,
  fornecedor_id: string,
  x: Extracao,
  agora: string,
  validade_dias = 15,
): { cotacoes: DadosCotacao[]; pendencias: { texto: string; motivo: string }[] } {
  const cotacoes: DadosCotacao[] = [];
  const pendencias: { texto: string; motivo: string }[] = [];
  for (const l of x.linhas) {
    const falha = (motivo: string) => pendencias.push({ texto: l.texto, motivo });
    if (!l.epi_id) {
      falha('EPI não reconhecido');
      continue;
    }
    if (!l.preco_unitario || l.preco_unitario <= 0) {
      falha('preço ausente');
      continue;
    }
    const prazo = l.prazo_dias ?? x.prazo_geral;
    if (prazo === null) {
      falha('prazo de entrega não informado');
      continue;
    }
    if (!l.ca_numero) {
      falha('CA não informado: sem CA não se compra EPI');
      continue;
    }
    const ca = e.cas.find((c) => c.numero === l.ca_numero && c.epi_id === l.epi_id && !c.excluido_em);
    if (!ca) {
      falha(`CA ${l.ca_numero} não cadastrado para este EPI`);
      continue;
    }
    cotacoes.push({
      fornecedor_id,
      epi_id: l.epi_id,
      ca_id: ca.id,
      preco_unitario: l.preco_unitario,
      prazo_dias: prazo,
      quantidade_disponivel: l.disponivel,
      valida_ate: diaLocal(somarDias(agora, validade_dias)),
      origem: 'texto',
    });
  }
  return { cotacoes, pendencias };
}

export const nomeEPI = (epis: EPI[], id: string) => epis.find((x) => x.id === id)?.descricao ?? id;
