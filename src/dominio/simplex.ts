// Solver de programação linear (simplex em duas fases) e inteira (branch-and-bound).
// Sem dependência: roda igual no celular (Hermes), no navegador e no Node dos testes.
// Feito para problemas pequenos, como a compra de EPI de uma obra (dezenas de variáveis).

export type Sentido = '<=' | '>=' | '=';

export interface Restricao {
  coef: number[];
  sentido: Sentido;
  rhs: number;
}

export interface Solucao {
  status: 'otimo' | 'inviavel' | 'ilimitado';
  x: number[];
  valor: number;
}

const EPS = 1e-9;

function pivotar(T: number[][], base: number[], linha: number, coluna: number) {
  const p = T[linha][coluna];
  const L = T[linha];
  for (let j = 0; j < L.length; j++) L[j] /= p;
  for (let i = 0; i < T.length; i++) {
    if (i === linha) continue;
    const f = T[i][coluna];
    if (Math.abs(f) < EPS) continue;
    const R = T[i];
    for (let j = 0; j < R.length; j++) R[j] -= f * L[j];
  }
  base[linha] = coluna;
}

/**
 * Minimiza custo·x no tableau T (última coluna = lado direito), a partir de uma base viável.
 * Regra de Dantzig (custo reduzido mais negativo) e, se demorar, regra de Bland, que não cicla.
 */
function iterar(T: number[][], base: number[], custo: number[], pode: (j: number) => boolean): 'otimo' | 'ilimitado' {
  const n = custo.length;
  const rhs = n;
  const naBase = new Uint8Array(n);
  for (let it = 0; it < 20_000; it++) {
    naBase.fill(0);
    for (const b of base) naBase[b] = 1;
    const bland = it > 500;
    let entra = -1;
    let menor = -EPS;
    for (let j = 0; j < n; j++) {
      if (naBase[j] || !pode(j)) continue;
      let r = custo[j];
      for (let i = 0; i < T.length; i++) r -= custo[base[i]] * T[i][j];
      if (r < menor) {
        entra = j;
        menor = r;
        if (bland) break;
      }
    }
    if (entra < 0) return 'otimo';

    let sai = -1;
    let razao = Infinity;
    for (let i = 0; i < T.length; i++) {
      const a = T[i][entra];
      if (a <= EPS) continue;
      const q = T[i][rhs] / a;
      if (q < razao - EPS || (Math.abs(q - razao) <= EPS && base[i] < base[sai])) {
        razao = q;
        sai = i;
      }
    }
    if (sai < 0) return 'ilimitado';
    pivotar(T, base, sai, entra);
  }
  throw new Error('Simplex não convergiu');
}

/** min c·x  sujeito às restrições e x >= 0. */
export function resolverLP(c: number[], restricoes: Restricao[]): Solucao {
  const n = c.length;
  // Lado direito sempre >= 0: se negativo, multiplica a linha por -1 e inverte o sentido.
  const linhas = restricoes.map((r) =>
    r.rhs < 0
      ? { coef: r.coef.map((v) => -v), sentido: (r.sentido === '<=' ? '>=' : r.sentido === '>=' ? '<=' : '=') as Sentido, rhs: -r.rhs }
      : r,
  );
  const nFolga = linhas.filter((r) => r.sentido !== '=').length;
  const nArt = linhas.filter((r) => r.sentido !== '<=').length;
  const total = n + nFolga + nArt;

  const T: number[][] = [];
  const base: number[] = [];
  const artificial = new Uint8Array(total);
  let f = n;
  let a = n + nFolga;
  for (const r of linhas) {
    const L = new Array<number>(total + 1).fill(0);
    for (let j = 0; j < n; j++) L[j] = r.coef[j] ?? 0;
    L[total] = r.rhs;
    if (r.sentido === '<=') {
      L[f] = 1;
      base.push(f++);
    } else {
      if (r.sentido === '>=') L[f++] = -1;
      L[a] = 1;
      artificial[a] = 1;
      base.push(a++);
    }
    T.push(L);
  }

  // Fase 1: acha um ponto viável minimizando a soma das artificiais.
  const custo1 = Array.from(artificial, (v) => v);
  iterar(T, base, custo1, () => true);
  const inviabilidade = base.reduce((s, b, i) => s + custo1[b] * T[i][total], 0);
  if (inviabilidade > 1e-7) return { status: 'inviavel', x: [], valor: Infinity };

  // Tira da base as artificiais que ficaram em zero (ou descarta a linha, se for redundante).
  for (let i = T.length - 1; i >= 0; i--) {
    if (!artificial[base[i]]) continue;
    let j = 0;
    while (j < n + nFolga && Math.abs(T[i][j]) <= EPS) j++;
    if (j < n + nFolga) pivotar(T, base, i, j);
    else {
      T.splice(i, 1);
      base.splice(i, 1);
    }
  }

  // Fase 2: otimiza o custo de verdade, sem deixar artificial voltar.
  const custo2 = new Array<number>(total).fill(0);
  for (let j = 0; j < n; j++) custo2[j] = c[j];
  if (iterar(T, base, custo2, (j) => !artificial[j]) === 'ilimitado') {
    return { status: 'ilimitado', x: [], valor: -Infinity };
  }
  const x = new Array<number>(n).fill(0);
  base.forEach((b, i) => {
    if (b < n) x[b] = Math.abs(T[i][total]) < 1e-9 ? 0 : T[i][total];
  });
  return { status: 'otimo', x, valor: x.reduce((s, v, j) => s + v * c[j], 0) };
}

/**
 * Programação inteira mista por branch-and-bound:
 * 1. resolve a relaxação linear (variáveis inteiras podendo ser fracionárias) — é um limite inferior;
 * 2. se alguma inteira saiu fracionária (ex.: 2,4), divide em dois ramos: <= 2 e >= 3;
 * 3. descarta todo ramo cujo limite inferior já é pior que a melhor solução inteira achada.
 */
export function resolverMILP(
  c: number[],
  restricoes: Restricao[],
  inteiras: number[],
  limiteNos = 5_000,
): Solucao & { nos: number; provado: boolean } {
  const n = c.length;
  let melhor: Solucao = { status: 'inviavel', x: [], valor: Infinity };
  let nos = 0;
  const pilha: Restricao[][] = [[]];
  const limite = (j: number, sentido: Sentido, v: number): Restricao => {
    const coef = new Array<number>(n).fill(0);
    coef[j] = 1;
    return { coef, sentido, rhs: v };
  };

  while (pilha.length > 0) {
    if (nos >= limiteNos) return { ...melhor, nos, provado: false };
    const extra = pilha.pop()!;
    nos++;
    const s = resolverLP(c, [...restricoes, ...extra]);
    if (s.status === 'ilimitado') return { ...s, nos, provado: true };
    if (s.status !== 'otimo' || s.valor >= melhor.valor - 1e-7) continue;

    let j = -1;
    let maisFracionaria = 1e-6;
    for (const k of inteiras) {
      const fr = Math.abs(s.x[k] - Math.round(s.x[k]));
      if (fr > maisFracionaria) {
        maisFracionaria = fr;
        j = k;
      }
    }
    if (j < 0) {
      melhor = { status: 'otimo', x: s.x.map((v, k) => (inteiras.includes(k) ? Math.round(v) || 0 : v)), valor: s.valor };
      continue;
    }
    // Explora primeiro o ramo "para cima": costuma achar solução viável mais cedo.
    pilha.push([...extra, limite(j, '<=', Math.floor(s.x[j]))]);
    pilha.push([...extra, limite(j, '>=', Math.ceil(s.x[j]))]);
  }
  return { ...melhor, nos, provado: true };
}
