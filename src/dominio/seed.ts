// Dados de demonstração, todos fictícios: empresas, pessoas e números de CA.
// Datas relativas a "agora" para a demonstração não envelhecer.
import { sha256 } from 'js-sha256';
import { detectorSimulado } from '../ia/detector';
import { abrirCheckin, aplicarDeteccao, atualizar, fecharCheckin, inserir, registrarConsentimento } from './operacoes';
import { episExigidos, somarDias } from './regras';
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
  return e;
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
