// Modelo de dados da seção 5 do PDF, recortado para o ciclo do EPI.
// Nomes em snake_case para casar 1:1 com as colunas de supabase/schema.sql.

export type Perfil = 'encarregado' | 'almoxarife' | 'tecnico' | 'gestor';
export type Tarefa = 'altura' | 'eletrica' | 'escavacao' | 'confinado' | 'geral';
export type ResultadoCheckin = 'liberado' | 'pendente' | 'bloqueado';
export type StatusDia = ResultadoCheckin | 'sem_checkin';
export type MotivoReq = 'falta' | 'vencido' | 'danificado' | 'admissao' | 'preventiva';
export type StatusReq = 'aberta' | 'entregue' | 'aguardando_compra' | 'cancelada';
export type SituacaoCA = 'valido' | 'vencido' | 'cancelado';
export type Fornecedor = 'construtora' | 'empreiteira';
export type DecisaoRevisao = 'confirmar' | 'corrigir' | 'pedir_nova_foto';

/** Situação de cada EPI exigido dentro de um check-in. */
export type SituacaoItem = 'ok' | 'falta' | 'duvida' | 'segunda_foto' | 'vencido' | 'danificado';

/** Campos comuns a toda tabela sincronizada (PDF, seção 5). */
export interface Base {
  id: string;
  empresa_id: string;
  obra_id: string | null;
  criado_em: string;
  atualizado_em: string;
  recebido_em: string | null;
  criado_por: string;
  dispositivo_id: string;
  versao: number;
  excluido_em: string | null;
}

export interface Empresa extends Base {
  razao_social: string;
  tipo: 'construtora' | 'empreiteira';
}
export interface Obra extends Base {
  nome: string;
}
export interface Frente extends Base {
  nome: string;
  tipo_risco: Tarefa;
}
export interface Funcao extends Base {
  nome: string;
}
export interface Usuario extends Base {
  nome: string;
  perfil: Perfil;
  pin_hash: string;
  obras: string[];
}
export interface Trabalhador extends Base {
  nome: string;
  matricula: string;
  funcao_id: string;
  empregadora_id: string;
  epi_fornecido_por: Fornecedor;
  frente_id: string;
  tarefa: Tarefa;
  /** Token opaco do QR do crachá; nunca o CPF. */
  cracha_token: string;
  /** Roteiro do detector simulado. Só existe em dados de demonstração. */
  cenario_demo: Record<string, CenarioEPI> | null;
}
export interface CenarioEPI {
  rotulo: 'presente' | 'ausente';
  confianca: number;
  /** Resultado da segunda foto, quando diferente da primeira. */
  segunda?: { rotulo: 'presente' | 'ausente'; confianca: number };
}
export interface Consentimento extends Base {
  trabalhador_id: string;
  finalidade: string;
  versao_termo: string;
  revogado_em: string | null;
}
export interface EPI extends Base {
  tipo: string;
  descricao: string;
  /** Nome curto usado nas frases: "Seu cinto está sem cortes?". */
  curto: string;
  icone: string;
  vida_util_dias: number;
  perguntas: string[];
  estoque_minimo: number;
  local: string;
}
export interface MatrizEPI extends Base {
  funcao_id: string;
  tarefa: Tarefa;
  epi_id: string;
  obrigatorio: boolean;
}
export interface CA extends Base {
  numero: string;
  fabricante: string;
  epi_id: string;
  situacao: SituacaoCA;
  validade: string;
  ultima_consulta: string;
  fonte: string;
}
export interface EntregaEPI extends Base {
  trabalhador_id: string;
  epi_id: string;
  ca_id: string;
  lote: string | null;
  quantidade: number;
  motivo: MotivoReq;
  data: string;
  validade_uso: string;
  foto_id: string | null;
  /** Hash SHA-256 das evidências da assinatura eletrônica. */
  assinatura: string;
  entregue_por: string;
  fornecido_por: Fornecedor;
  devolvido_em: string | null;
  devolucao_motivo: string | null;
  substituida_por: string | null;
  requisicao_id: string | null;
}
export interface ItemCheckin {
  epi_id: string;
  situacao: SituacaoItem;
  confianca: number | null;
}
export interface CheckIn extends Base {
  trabalhador_id: string;
  frente_id: string;
  tarefa: Tarefa;
  inicio: string;
  fim: string | null;
  resultado: ResultadoCheckin;
  motivo: string | null;
  itens: ItemCheckin[];
  revisado_por: string | null;
  nova_foto_pedida: boolean;
  bloqueio_pedido_por: string | null;
  bloqueio_justificativa: string | null;
}
export interface RespostaChecklist extends Base {
  checkin_id: string;
  epi_id: string;
  pergunta: string;
  valor: boolean;
}
export interface Foto extends Base {
  dono_tipo: 'checkin' | 'entrega' | 'liberacao';
  dono_id: string;
  /** SHA-256 calculado no aparelho no momento da captura. */
  hash: string;
  tirada_em: string;
  apagar_em: string | null;
}
export interface Deteccao extends Base {
  foto_id: string | null;
  checkin_id: string;
  epi_id: string;
  modelo: string;
  versao_modelo: string;
  onde: 'celular' | 'nuvem';
  rotulo: 'presente' | 'ausente';
  confianca: number;
  limite_aplicado: number;
  decisao: 'automatica' | 'revisao' | 'amostra';
}
export interface Revisao extends Base {
  deteccao_id: string;
  revisor: string;
  decisao: DecisaoRevisao;
  valor_corrigido: 'presente' | 'ausente' | null;
  tempo_s: number;
  usar_no_treino: boolean;
}
export interface Requisicao extends Base {
  tipo: 'epi';
  trabalhador_id: string;
  epi_id: string;
  checkin_id: string | null;
  motivo: MotivoReq;
  prioridade: 'normal' | 'baixa';
  para_quem: Fornecedor;
  status: StatusReq;
}
export interface SolicitacaoCompra extends Base {
  epi_id: string;
  quantidade: number;
  origem: 'estoque_minimo' | 'requisicao_sem_estoque';
  situacao: 'nao_autorizada' | 'autorizada';
}
export interface Movimentacao extends Base {
  tipo: 'entrada' | 'saida' | 'ajuste';
  epi_id: string;
  /** Quantidade com sinal: saldo é sempre a soma destas linhas. */
  quantidade: number;
  origem: 'requisicao' | 'entrada_manual' | 'carga_inicial';
  entrega_id: string | null;
  quem_recebeu: string | null;
}
/** Guarda só a referência: o envio lê o registro atual, sem duplicá-lo no aparelho. */
export interface OperacaoFila {
  id: string;
  tabela: string;
  registro_id: string;
  operacao: 'insert' | 'update';
  criado_em: string;
  tentativas: number;
  ultimo_erro: string | null;
  status: 'pendente';
}
export interface LinhaAudit {
  id: string;
  quem: string;
  quando: string;
  dispositivo_id: string;
  acao: string;
  entidade: string;
  entidade_id: string;
  antes: unknown;
  depois: unknown;
  hash_anterior: string;
  hash: string;
}
export interface Config {
  /** Acima: decisão automática. */
  limite_superior: number;
  /** Abaixo: "não detectado". Entre os dois: revisão humana. */
  limite_inferior: number;
  sla_revisao_min: number;
  /** Fração das decisões automáticas enviada para auditoria (2–5%). */
  amostra_auditoria: number;
}

export interface Estado {
  empresas: Empresa[];
  obras: Obra[];
  frentes: Frente[];
  funcoes: Funcao[];
  usuarios: Usuario[];
  trabalhadores: Trabalhador[];
  consentimentos: Consentimento[];
  epis: EPI[];
  matriz: MatrizEPI[];
  cas: CA[];
  entregas: EntregaEPI[];
  checkins: CheckIn[];
  respostas: RespostaChecklist[];
  fotos: Foto[];
  deteccoes: Deteccao[];
  revisoes: Revisao[];
  requisicoes: Requisicao[];
  solicitacoes: SolicitacaoCompra[];
  movimentacoes: Movimentacao[];
  fila_sync: OperacaoFila[];
  audit: LinhaAudit[];
  config: Config;
  ultima_varredura: string | null;
}

export type Tabela = {
  [K in keyof Estado]: Estado[K] extends (infer R)[] ? (R extends Base ? K : never) : never;
}[keyof Estado];

/** Contexto injetado nas operações: mantém o domínio puro e testável. */
export interface Ctx {
  agora: string;
  usuario: string;
  dispositivo: string;
  empresa: string;
  uuid: () => string;
  aleatorio: () => number;
}

export const ROTULO_TAREFA: Record<Tarefa, string> = {
  altura: 'trabalho em altura',
  eletrica: 'instalação elétrica',
  escavacao: 'escavação',
  confinado: 'espaço confinado',
  geral: 'serviço geral',
};

export const ROTULO_MOTIVO: Record<MotivoReq, string> = {
  falta: 'falta',
  vencido: 'vencido',
  danificado: 'danificado',
  admissao: 'primeira entrega',
  preventiva: 'preventiva',
};
