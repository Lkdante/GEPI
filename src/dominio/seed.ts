// Dados de demonstração, todos fictícios: empresas, pessoas e números de CA.
// Datas relativas a "agora" para a demonstração não envelhecer.
import { sha256 } from 'js-sha256';
import { detectorSimulado } from '../ia/detector';
import {
  abrirCheckin,
  aplicarDeteccao,
  atualizar,
  fecharCheckin,
  inserir,
  programarCompra,
  registrarConsentimento,
  solicitarCompra,
} from './operacoes';
import { diaLocal, episAbaixoDoMinimo, episExigidos, somarDias } from './regras';
import type { CenarioEPI, Ctx, EPI, Estado, Perfil, Tarefa } from './tipos';

export const PIN_DEMO = '1234';
export const hashPin = (usuario_id: string, pin: string) => sha256(`${usuario_id}:${pin}`);

export function estadoVazio(): Estado {
  return {
    empresas: [],
    obras: [],
    frentes: [],
    funcoes: [],
    usuarios: [],
    trabalhadores: [],
    consentimentos: [],
    epis: [],
    matriz: [],
    cas: [],
    entregas: [],
    checkins: [],
    respostas: [],
    fotos: [],
    deteccoes: [],
    revisoes: [],
    requisicoes: [],
    solicitacoes: [],
    movimentacoes: [],
    fornecedores: [],
    cotacoes: [],
    pedidos: [],
    fila_sync: [],
    audit: [],
    config: {
      limite_superior: 0.8,
      limite_inferior: 0.4,
      sla_revisao_min: 10,
      amostra_auditoria: 0.03,
    },
    ultima_varredura: null,
  };
}

type EpiSeed = Pick<EPI, 'tipo' | 'descricao' | 'curto' | 'vida_util_dias' | 'perguntas' | 'estoque_minimo' | 'local'>;

const EPIS: EpiSeed[] = [
  { tipo: 'capacete', descricao: 'Capacete', curto: 'capacete', vida_util_dias: 730, perguntas: ['Seu capacete está sem trincas?'], estoque_minimo: 3, local: 'Contêiner 2 · térreo' },
  { tipo: 'botina', descricao: 'Botina', curto: 'botina', vida_util_dias: 180, perguntas: ['Sua botina está com o bico inteiro?'], estoque_minimo: 3, local: 'Contêiner 2 · térreo' },
  { tipo: 'colete', descricao: 'Colete', curto: 'colete', vida_util_dias: 365, perguntas: ['Seu colete está inteiro?'], estoque_minimo: 3, local: 'Contêiner 2 · térreo' },
  { tipo: 'luva', descricao: 'Luvas', curto: 'luva', vida_util_dias: 60, perguntas: ['Suas luvas estão sem furos?'], estoque_minimo: 6, local: 'Contêiner 1 · térreo' },
  { tipo: 'cinto', descricao: 'Cinto paraquedista', curto: 'cinto', vida_util_dias: 365, perguntas: ['Seu cinto está sem cortes?', 'As fivelas do cinto estão boas?'], estoque_minimo: 2, local: 'Contêiner 2 · térreo' },
  { tipo: 'oculos', descricao: 'Óculos', curto: 'óculos', vida_util_dias: 180, perguntas: ['Seus óculos estão sem trincas?'], estoque_minimo: 3, local: 'Contêiner 1 · térreo' },
  { tipo: 'protetor', descricao: 'Protetor auricular', curto: 'protetor', vida_util_dias: 90, perguntas: ['Seu protetor de ouvido está limpo?'], estoque_minimo: 5, local: 'Contêiner 1 · térreo' },
];

const BASE_TAREFA = ['capacete', 'botina', 'colete', 'luva'];
const MATRIZ: Record<Tarefa, string[]> = {
  geral: BASE_TAREFA,
  altura: [...BASE_TAREFA, 'cinto'],
  eletrica: [...BASE_TAREFA, 'oculos'],
  escavacao: [...BASE_TAREFA, 'protetor'],
  confinado: [...BASE_TAREFA, 'cinto', 'protetor'],
};

/** Saldo inicial da obra: cinto com pouca folga e luva já abaixo do mínimo. */
const SALDO_INICIAL: Record<string, number> = {
  capacete: 8,
  botina: 6,
  colete: 7,
  luva: 4,
  cinto: 3,
  oculos: 6,
  protetor: 12,
};

export function criarDemo(ctx: Ctx): Estado {
  const e = estadoVazio();
  const construtora = inserirGlobal(e, ctx, 'empresas', { razao_social: 'Construtora Exemplo', tipo: 'construtora' });
  ctx = { ...ctx, empresa: construtora.id };
  const empreiteira = inserirGlobal(e, ctx, 'empresas', { razao_social: 'Alfa Montagens', tipo: 'empreiteira' });

  const aurora = inserirGlobal(e, ctx, 'obras', { nome: 'Residencial Aurora' });
  const horizonte = inserirGlobal(e, ctx, 'obras', { nome: 'Edifício Horizonte' });

  const torreB4 = inserir(e, ctx, 'frentes', aurora.id, { nome: 'Torre B · 4º pav.', tipo_risco: 'altura' });
  const torreBT = inserir(e, ctx, 'frentes', aurora.id, { nome: 'Torre B · térreo', tipo_risco: 'geral' });
  const subsolo = inserir(e, ctx, 'frentes', horizonte.id, { nome: 'Subsolo · garagem', tipo_risco: 'escavacao' });

  const servente = inserirGlobal(e, ctx, 'funcoes', { nome: 'Servente' });
  const armador = inserirGlobal(e, ctx, 'funcoes', { nome: 'Armador' });
  const eletricista = inserirGlobal(e, ctx, 'funcoes', { nome: 'Eletricista' });

  const usuarios: [string, Perfil][] = [
    ['Marcos Encarregado', 'encarregado'],
    ['Lucia Almoxarife', 'almoxarife'],
    ['Renata Técnica', 'tecnico'],
    ['Paulo Engenheiro', 'gestor'],
  ];
  for (const [nome, perfil] of usuarios) {
    const u = inserirGlobal(e, ctx, 'usuarios', { nome, perfil, pin_hash: '', obras: [aurora.id, horizonte.id] });
    atualizar(e, ctx, 'usuarios', u.id, { pin_hash: hashPin(u.id, PIN_DEMO) });
  }

  const epis = Object.fromEntries(
    EPIS.map((x) => [x.tipo, inserirGlobal(e, ctx, 'epis', { ...x, icone: x.tipo })]),
  );

  for (const funcao of [servente, armador, eletricista]) {
    for (const tarefa of Object.keys(MATRIZ) as Tarefa[]) {
      for (const tipo of MATRIZ[tarefa]) {
        inserirGlobal(e, ctx, 'matriz', {
          funcao_id: funcao.id,
          tarefa,
          epi_id: epis[tipo].id,
          obrigatorio: true,
        });
      }
    }
  }

  const umAno = somarDias(ctx.agora, 365).slice(0, 10);
  const cas: Record<string, string> = {};
  EPIS.forEach((x, i) => {
    const ca = inserirGlobal(e, ctx, 'cas', {
      numero: String(90010 + i),
      fabricante: 'Fabricante Exemplo',
      epi_id: epis[x.tipo].id,
      situacao: 'valido',
      validade: umAno,
      ultima_consulta: ctx.agora,
      fonte: 'base de demonstração',
    });
    cas[x.tipo] = ca.id;
  });
  const caVencido = inserirGlobal(e, ctx, 'cas', {
    numero: '90099',
    fabricante: 'Fabricante Exemplo',
    epi_id: epis.capacete.id,
    situacao: 'vencido',
    validade: somarDias(ctx.agora, -20).slice(0, 10),
    ultima_consulta: ctx.agora,
    fonte: 'base de demonstração',
  });

  for (const tipo of Object.keys(SALDO_INICIAL)) {
    for (const obra of [aurora.id, horizonte.id]) {
      inserir(e, ctx, 'movimentacoes', obra, {
        tipo: 'entrada',
        epi_id: epis[tipo].id,
        quantidade: SALDO_INICIAL[tipo],
        origem: 'carga_inicial',
        entrega_id: null,
        quem_recebeu: null,
      });
    }
  }

  const trabalhador = (
    nome: string,
    matricula: string,
    funcao_id: string,
    frente: typeof torreB4,
    tarefa: Tarefa,
    token: string,
    cenario: Record<string, CenarioEPI>,
    deEmpreiteira = false,
  ) => {
    const roteiro = Object.fromEntries(Object.entries(cenario).map(([tipo, c]) => [epis[tipo].id, c]));
    const t = inserir(e, ctx, 'trabalhadores', frente.obra_id, {
      nome,
      matricula,
      funcao_id,
      empregadora_id: deEmpreiteira ? empreiteira.id : construtora.id,
      epi_fornecido_por: deEmpreiteira ? 'empreiteira' : 'construtora',
      frente_id: frente.id,
      tarefa,
      cracha_token: token,
      cenario_demo: roteiro,
    });
    for (const tipo of MATRIZ[tarefa]) {
      inserir(e, ctx, 'entregas', frente.obra_id, {
        trabalhador_id: t.id,
        epi_id: epis[tipo].id,
        ca_id: cas[tipo],
        lote: null,
        quantidade: 1,
        motivo: 'admissao',
        data: somarDias(ctx.agora, -20),
        validade_uso: somarDias(ctx.agora, epis[tipo].vida_util_dias - 20),
        foto_id: null,
        assinatura: sha256(`demo:${t.id}:${tipo}`),
        entregue_por: ctx.usuario,
        fornecido_por: deEmpreiteira ? 'empreiteira' : 'construtora',
        devolvido_em: null,
        devolucao_motivo: null,
        substituida_por: null,
        requisicao_id: null,
      });
    }
    return t;
  };

  trabalhador('João Silva', '1021', servente.id, torreB4, 'altura', 'DEMO-JOAO', {
    cinto: { rotulo: 'ausente', confianca: 0.92 },
  });
  const maria = trabalhador('Maria Souza', '1034', armador.id, torreB4, 'altura', 'DEMO-MARIA', {});
  trabalhador('Carlos Lima', '1040', armador.id, torreBT, 'geral', 'DEMO-CARLOS', {
    capacete: { rotulo: 'ausente', confianca: 0.62, segunda: { rotulo: 'presente', confianca: 0.91 } },
  });
  trabalhador('Pedro Santos', '1052', eletricista.id, torreBT, 'eletrica', 'DEMO-PEDRO', {
    oculos: { rotulo: 'presente', confianca: 0.58 },
  });
  trabalhador('Rafael Dias', '2007', armador.id, torreB4, 'altura', 'DEMO-RAFAEL', {
    cinto: { rotulo: 'ausente', confianca: 0.95 },
  }, true);
  const bruno = trabalhador('Bruno Costa', '1061', servente.id, torreB4, 'altura', 'DEMO-BRUNO', {
    cinto: { rotulo: 'presente', confianca: 0.58 },
  });
  const ana = trabalhador('Ana Rocha', '3011', servente.id, subsolo, 'escavacao', 'DEMO-ANA', {});

  // Ana recebeu capacete com CA que venceu depois: a entrega fica fora da regra.
  const capaceteAna = e.entregas.find((x) => x.trabalhador_id === ana.id && x.epi_id === epis.capacete.id)!;
  atualizar(e, ctx, 'entregas', capaceteAna.id, { ca_id: caVencido.id });

  for (const t of e.trabalhadores) {
    if (t.id !== maria.id) registrarConsentimento(e, ctx, t);
  }

  // Uma dúvida antiga na fila: já estourou o prazo e mostra a escalada na hora.
  const antigo = { ...ctx, agora: somarDias(ctx.agora, -1 / 48), aleatorio: () => 1 };
  const c = abrirCheckin(e, antigo, bruno);
  const leituras = detectorSimulado.detectar({
    trabalhador: bruno,
    exigidos: episExigidos(e, bruno),
    tentativa: 1,
    modo: 'completo',
  });
  fecharCheckin(e, antigo, c, aplicarDeteccao(e, antigo, c, bruno, null, leituras, detectorSimulado, 1));
  semearCompras(e, ctx);
  return e;
}

// ---------------------------------------------------------------- compras (fictício)

/** Preço de referência por unidade (luva: por par), só para gerar as cotações de exemplo. */
const PRECO_REF: Record<string, number> = {
  capacete: 45, botina: 120, colete: 25, luva: 9, cinto: 260, oculos: 15, protetor: 2.5,
};

/** [nome, frete, pedido mínimo, nível de preço, prazo (dias), pedidos recebidos, atrasados, só vende] */
const FORNECEDORES: [string, number, number, number, number, number, number, string[] | null][] = [
  ['EPI Center Brasília', 60, 0, 1.08, 2, 10, 1, null],
  ['Segurança Total Distribuidora', 120, 400, 1.0, 3, 6, 2, null],
  ['MegaEPI Atacado', 250, 1500, 0.86, 6, 8, 5, null],
  ['Luvas & Cia', 40, 150, 0.82, 2, 0, 0, ['luva', 'protetor']],
];

/**
 * Fornecedores, cotações e histórico de pedidos. Casos montados de propósito:
 * - MegaEPI cota capacete com o CA vencido: a cotação fica fora do plano;
 * - Segurança Total cotou luva a R$ 0,75 (preço da caixa lançado errado): fica fora como suspeita;
 * - Luvas & Cia é nova (sem histórico): o risco dela é a priori, 20%.
 * Só roda em demonstração. Também é chamada para estados antigos, salvos antes das compras.
 */
export function semearCompras(e: Estado, ctx: Ctx) {
  if (e.fornecedores.length > 0) return;
  const epi = (tipo: string) => e.epis.find((x) => x.tipo === tipo)!;
  const caValido = (tipo: string) =>
    e.cas.find((c) => c.epi_id === epi(tipo).id && c.situacao === 'valido')!;
  const caVencido = e.cas.find((c) => c.situacao === 'vencido');
  const validade = diaLocal(somarDias(ctx.agora, 15));

  FORNECEDORES.forEach(([nome, frete, minimo, nivel, prazo, recebidos, atrasados, mix], k) => {
    const f = inserir(e, ctx, 'fornecedores', null, { nome, frete_fixo: frete, pedido_minimo: minimo });
    for (const tipo of Object.keys(PRECO_REF)) {
      if (mix && !mix.includes(tipo)) continue;
      if (nome.startsWith('MegaEPI') && tipo === 'cinto') continue; // não trabalha com cinto
      // variação determinística de ±4% para os preços não ficarem idênticos
      const ruido = 1 + (((k * 7 + tipo.length * 3) % 9) - 4) / 100;
      let preco = Math.round(PRECO_REF[tipo] * nivel * ruido * 100) / 100;
      let ca = caValido(tipo);
      if (nome.startsWith('MegaEPI') && tipo === 'capacete' && caVencido) ca = caVencido;
      if (nome.startsWith('Segurança') && tipo === 'luva') preco = 0.75;
      inserir(e, ctx, 'cotacoes', null, {
        fornecedor_id: f.id,
        epi_id: epi(tipo).id,
        ca_id: ca.id,
        preco_unitario: preco,
        prazo_dias: prazo,
        quantidade_disponivel: nome.startsWith('Luvas') && tipo === 'luva' ? 20 : null,
        valida_ate: validade,
        origem: 'manual',
      });
    }
    // Histórico: pedidos já recebidos, no prazo ou não. É o que alimenta o risco de atraso.
    for (let i = 0; i < recebidos; i++) {
      const quando = somarDias(ctx.agora, -15 * (i + 1));
      inserir(e, ctx, 'pedidos', e.obras[0].id, {
        fornecedor_id: f.id,
        itens: [],
        frete,
        total: 0,
        prazo_prometido: quando,
        situacao: 'recebido',
        chegou_em: i < atrasados ? somarDias(quando, 3) : quando,
        no_prazo: i >= atrasados,
      });
    }
  });

  // Necessidades da obra: o que já está abaixo do mínimo + a reposição programada do mês.
  for (const obra of e.obras) {
    for (const { epi: x } of episAbaixoDoMinimo(e, obra.id)) solicitarCompra(e, ctx, obra.id, x.id, 'estoque_minimo');
  }
  const aurora = e.obras[0].id;
  const programada: [string, number][] = [['capacete', 10], ['botina', 6], ['colete', 10], ['oculos', 6], ['protetor', 30]];
  for (const [tipo, qtd] of programada) programarCompra(e, ctx, aurora, epi(tipo).id, qtd);
}

/** Cadastros sem obra (obra_id nulo): valem para a empresa inteira. */
function inserirGlobal<T extends Parameters<typeof inserir>[2]>(
  e: Estado,
  ctx: Ctx,
  tabela: T,
  campos: Parameters<typeof inserir<T>>[4],
) {
  return inserir(e, ctx, tabela, null, campos);
}
