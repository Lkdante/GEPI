// Ponto de encaixe do detector de EPI. O PDF prevê um YOLO pequeno em TFLite, que
// ainda não existe: depende de fotos reais do piloto. Até lá roda este simulador,
// sempre identificado na interface.
import type { LeituraDetector, MetaDetector } from '@/dominio/operacoes';
import type { EPI, Trabalhador } from '@/dominio/tipos';

export interface EntradaDetector {
  trabalhador: Trabalhador;
  exigidos: EPI[];
  tentativa: number;
  /** Conferência de item recém-recebido (passo 4 do ciclo). */
  modo: 'completo' | 'item';
}

export interface Detector extends MetaDetector {
  simulado: boolean;
  detectar(entrada: EntradaDetector): LeituraDetector[];
}

/** Abaixo do limite superior: sem roteiro de demonstração, nada se libera sozinho. */
const CONFIANCA_SEM_ROTEIRO = 0.5;

export const detectorSimulado: Detector = {
  modelo: 'simulado',
  versao: '0',
  simulado: true,
  detectar({ trabalhador, exigidos, tentativa, modo }) {
    return exigidos.map((epi) => {
      if (trabalhador.cenario_demo === null) {
        return { epi_id: epi.id, rotulo: 'presente', confianca: CONFIANCA_SEM_ROTEIRO };
      }
      const roteiro = trabalhador.cenario_demo[epi.id];
      if (modo === 'item' || !roteiro) {
        return { epi_id: epi.id, rotulo: 'presente', confianca: 0.93 };
      }
      const leitura = tentativa > 1 && roteiro.segunda ? roteiro.segunda : roteiro;
      return { epi_id: epi.id, rotulo: leitura.rotulo, confianca: leitura.confianca };
    });
  },
};

export const detector: Detector = detectorSimulado;
