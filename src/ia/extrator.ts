// Ponto de encaixe do extrator de cotação (texto de WhatsApp/e-mail -> linhas estruturadas).
//
// Aqui roda um extrator por REGRAS, no próprio aparelho e sem internet. A versão com LLM
// (Claude ou Groq) deve rodar no servidor (Edge Function do Supabase), nunca no app: a
// chave da API não pode ir dentro do aplicativo. Ela implementa a mesma interface e
// devolve as mesmas linhas, que passam pela MESMA validação (validarExtracao em compras.ts).
import type { Extracao, LinhaExtraida } from '@/dominio/compras';
import type { EPI } from '@/dominio/tipos';

export interface Extrator {
  nome: string;
  extrair(texto: string, epis: EPI[]): Extracao;
}

/** Palavras que identificam cada tipo de EPI (o tipo vem do cadastro, ex.: 'luva'). */
const PALAVRAS: Record<string, string[]> = {
  capacete: ['capacete'],
  botina: ['botina', 'bota de seguranca', 'calcado de seguranca'],
  colete: ['colete', 'refletivo'],
  luva: ['luva', 'luvas'],
  cinto: ['cinto', 'paraquedista'],
  oculos: ['oculos'],
  protetor: ['protetor auricular', 'protetor', 'plug', 'abafador'],
};

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

const DINHEIRO = /R\$\s*([\d.]+(?:,\d{1,2})?)/i;
const numero = (br: string) => Number(br.replace(/\./g, '').replace(',', '.'));

function acharEPI(linha: string, epis: EPI[]): string | null {
  const l = semAcento(linha);
  for (const epi of epis) {
    const palavras = PALAVRAS[epi.tipo] ?? [semAcento(epi.curto), semAcento(epi.descricao)];
    if (palavras.some((p) => l.includes(p))) return epi.id;
  }
  return null;
}

/**
 * Preço por unidade do EPI. "R$ 96,00 a caixa c/ 12 pares" -> R$ 8,00;
 * "R$ 30,00 a dúzia" -> R$ 2,50. Sem indicação, vale o preço como está.
 */
function precoUnitario(linha: string): number | null {
  const m = linha.match(DINHEIRO);
  if (!m) return null;
  const preco = numero(m[1]);
  const l = semAcento(linha);
  const caixa = l.match(/(?:cx|caixa|pct|pacote)\s*(?:c\/|com)?\s*(\d+)/);
  if (caixa) return Math.round((preco / Number(caixa[1])) * 100) / 100;
  if (/\b(duzia|dz)\b/.test(l)) return Math.round((preco / 12) * 100) / 100;
  return preco;
}

export const extratorRegras: Extrator = {
  nome: 'regras',
  extrair(texto, epis) {
    const x: Extracao = { linhas: [], prazo_geral: null, frete: null, pedido_minimo: null };
    for (const bruta of texto.split(/\r?\n/)) {
      const linha = bruta.trim().replace(/^[-•*]\s*/, '');
      if (!linha) continue;
      const l = semAcento(linha);
      const valor = linha.match(DINHEIRO);
      if (l.includes('frete')) {
        x.frete = /gratis|cif|incluso/.test(l) ? 0 : valor ? numero(valor[1]) : null;
        continue;
      }
      if (l.includes('minimo')) {
        x.pedido_minimo = valor ? numero(valor[1]) : null;
        continue;
      }
      const prazo = l.match(/(\d+)\s*dias?/);
      const epi_id = acharEPI(linha, epis);
      if (!valor && !epi_id) {
        if (prazo && /prazo|entrega/.test(l)) x.prazo_geral = Number(prazo[1]);
        continue;
      }
      const ca = l.match(/\bca\s*[:nº°.#-]*\s*(\d{3,6})\b/);
      const disp = l.match(/(?:disponivel|disp\.?|estoque)\s*:?\s*(\d+)/);
      const item: LinhaExtraida = {
        texto: linha,
        epi_id,
        ca_numero: ca ? ca[1] : null,
        preco_unitario: precoUnitario(linha),
        prazo_dias: prazo ? Number(prazo[1]) : null,
        disponivel: disp ? Number(disp[1]) : null,
      };
      x.linhas.push(item);
    }
    return x;
  },
};
