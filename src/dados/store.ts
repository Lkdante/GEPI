// Fonte da verdade no aparelho: tudo grava aqui primeiro. Cada transação trabalha
// num rascunho, então uma regra que recusa a operação não deixa escrita pela metade.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import { useSyncExternalStore } from 'react';
import { varreduraDiaria } from '@/dominio/operacoes';
import { criarDemo, hashPin } from '@/dominio/seed';
import type { Ctx, Estado, ItemCheckin, Usuario } from '@/dominio/tipos';
import { uuidv7 } from '@/dominio/uuid';
import { apagarFoto } from './fotos';

const CHAVE_ESTADO = 'gepi:estado:v1';
const CHAVE_DISPOSITIVO = 'gepi:dispositivo';
const CHAVE_OBRA = 'gepi:obra';

/** Andamento do check-in em curso. Só existe na memória: some ao fechar o app. */
export interface Fluxo {
  trabalhador_id: string;
  checkin_id: string | null;
  modo: 'completo' | 'item';
  epi_ids?: string[];
  tentativa: number;
  itens: ItemCheckin[];
  foto_id: string | null;
  /** Itens que o trabalhador já pediu nesta passada pela tela de resultado. */
  resolvidos: string[];
}

interface Raiz {
  estado: Estado | null;
  usuario: Usuario | null;
  obra_id: string | null;
  fluxo: Fluxo | null;
  /** Aparelho sem espaço ou erro de disco: a equipe precisa saber, nunca silencioso. */
  falha_gravacao: boolean;
}

let raiz: Raiz = { estado: null, usuario: null, obra_id: null, fluxo: null, falha_gravacao: false };
let dispositivo = 'desconhecido';
const ouvintes = new Set<() => void>();

function publicar(mudanca: Partial<Raiz>) {
  raiz = { ...raiz, ...mudanca };
  ouvintes.forEach((o) => o());
}

function assinar(o: () => void) {
  ouvintes.add(o);
  return () => ouvintes.delete(o);
}

export function useRaiz(): Raiz {
  return useSyncExternalStore(assinar, () => raiz);
}

export function useEstado(): Estado {
  const r = useRaiz();
  if (!r.estado) throw new Error('Estado ainda não carregado');
  return r.estado;
}

export const estadoAtual = () => raiz.estado!;
export const fluxoAtual = () => raiz.fluxo;
export const obraAtual = () => raiz.obra_id!;

const uuid = () => uuidv7(Crypto.getRandomBytes(16));

function criarCtx(): Ctx {
  return {
    agora: new Date().toISOString(),
    usuario: raiz.usuario?.id ?? raiz.fluxo?.trabalhador_id ?? 'dispositivo',
    dispositivo,
    empresa: raiz.estado?.empresas[0]?.id ?? 'sem-empresa',
    uuid,
    aleatorio: Math.random,
  };
}

let gravacao: Promise<void> = Promise.resolve();
function gravar() {
  const instantanea = JSON.stringify(raiz.estado);
  gravacao = gravacao
    .then(() => AsyncStorage.setItem(CHAVE_ESTADO, instantanea))
    .then(() => {
      if (raiz.falha_gravacao) publicar({ falha_gravacao: false });
    })
    .catch((erro) => {
      console.error('Falha ao gravar no aparelho', erro);
      publicar({ falha_gravacao: true });
    });
}

export function transacao<T>(fn: (e: Estado, ctx: Ctx) => T): T {
  const rascunho = JSON.parse(JSON.stringify(raiz.estado)) as Estado;
  const resultado = fn(rascunho, criarCtx());
  publicar({ estado: rascunho });
  gravar();
  return resultado;
}

export async function carregar() {
  dispositivo = (await AsyncStorage.getItem(CHAVE_DISPOSITIVO)) ?? uuid();
  await AsyncStorage.setItem(CHAVE_DISPOSITIVO, dispositivo);

  const salvo = await AsyncStorage.getItem(CHAVE_ESTADO);
  const estado = salvo ? (JSON.parse(salvo) as Estado) : criarDemo(criarCtx());
  const obra = (await AsyncStorage.getItem(CHAVE_OBRA)) ?? estado.obras[0].id;
  publicar({ estado, obra_id: obra });
  transacao(varreduraDiaria);

  const agora = new Date().toISOString();
  for (const f of estado.fotos) {
    if (f.apagar_em && f.apagar_em < agora) await apagarFoto(f.id);
  }
}

export async function reiniciarDemo() {
  // O estado antigo só sai quando o novo entra: as telas abertas continuam lendo dele.
  await AsyncStorage.removeItem(CHAVE_ESTADO);
  publicar({ usuario: null, fluxo: null });
  await carregar();
}

export function escolherObra(obra_id: string) {
  publicar({ obra_id });
  AsyncStorage.setItem(CHAVE_OBRA, obra_id).catch(() => {});
}

export function entrar(usuario_id: string, pin: string): Usuario | null {
  const u = raiz.estado?.usuarios.find((x) => x.id === usuario_id);
  if (!u || u.pin_hash !== hashPin(u.id, pin)) return null;
  publicar({ usuario: u });
  return u;
}

export const sair = () => publicar({ usuario: null });

export const definirFluxo = (fluxo: Fluxo | null) => publicar({ fluxo });

export const atualizarFluxo = (patch: Partial<Fluxo>) =>
  publicar({ fluxo: { ...raiz.fluxo!, ...patch } });
