import { describe, expect, it } from 'vitest';
import { resolverLP, resolverMILP, type Restricao } from './simplex';

const r = (coef: number[], sentido: Restricao['sentido'], rhs: number): Restricao => ({ coef, sentido, rhs });

/** Gerador determinístico, para os testes aleatórios serem reproduzíveis. */
function gerador(semente: number) {
  let s = semente >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('simplex', () => {
  it('resolve um LP de livro', () => {
    // max 3x + 5y  s.a. x <= 4, 2y <= 12, 3x + 2y <= 18  -> ótimo em (2, 6), valor 36
    const s = resolverLP([-3, -5], [r([1, 0], '<=', 4), r([0, 2], '<=', 12), r([3, 2], '<=', 18)]);
    expect(s.status).toBe('otimo');
    expect(s.x[0]).toBeCloseTo(2);
    expect(s.x[1]).toBeCloseTo(6);
    expect(-s.valor).toBeCloseTo(36);
  });

  it('lida com >=, = e lado direito negativo', () => {
    // min x + y  s.a. x + y >= 2, x - y = 1, -x <= -1  -> (1,5; 0,5)
    const s = resolverLP([1, 1], [r([1, 1], '>=', 2), r([1, -1], '=', 1), r([-1, 0], '<=', -1)]);
    expect(s.status).toBe('otimo');
    expect(s.valor).toBeCloseTo(2);
    expect(s.x[0] - s.x[1]).toBeCloseTo(1);
  });

  it('detecta inviável e ilimitado', () => {
    expect(resolverLP([1], [r([1], '>=', 3), r([1], '<=', 2)]).status).toBe('inviavel');
    expect(resolverLP([-1, 0], [r([1, -1], '<=', 1)]).status).toBe('ilimitado');
  });

  it('não se perde com restrição redundante', () => {
    const s = resolverLP([1, 2], [r([1, 1], '=', 4), r([2, 2], '=', 8), r([0, 1], '>=', 1)]);
    expect(s.status).toBe('otimo');
    expect(s.valor).toBeCloseTo(5);
  });
});

describe('branch-and-bound', () => {
  it('acha o ótimo inteiro que o arredondamento não acha', () => {
    // max 5x + 4y  s.a. 6x + 4y <= 24, x + 2y <= 6. LP: (3; 1,5) = 21. Inteiro: (4; 0) = 20.
    const s = resolverMILP([-5, -4], [r([6, 4], '<=', 24), r([1, 2], '<=', 6)], [0, 1]);
    expect(s.status).toBe('otimo');
    expect(-s.valor).toBeCloseTo(20);
    expect(s.x).toEqual([4, 0]);
  });

  it('mochila 0/1 igual à força bruta em 40 instâncias aleatórias', () => {
    const rnd = gerador(42);
    for (let k = 0; k < 40; k++) {
      const n = 6;
      const valor = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 20));
      const peso = Array.from({ length: n }, () => 1 + Math.floor(rnd() * 10));
      const cap = 5 + Math.floor(rnd() * 20);
      const rest = [r(peso, '<=', cap), ...valor.map((_, j) => r(valor.map((__, i) => (i === j ? 1 : 0)), '<=', 1))];
      const s = resolverMILP(valor.map((v) => -v), rest, [...valor.keys()]);
      let bruta = 0;
      for (let m = 0; m < 1 << n; m++) {
        let p = 0;
        let v = 0;
        for (let j = 0; j < n; j++) if (m & (1 << j)) (p += peso[j]), (v += valor[j]);
        if (p <= cap) bruta = Math.max(bruta, v);
      }
      expect(-s.valor).toBeCloseTo(bruta);
      expect(s.provado).toBe(true);
    }
  });
});
