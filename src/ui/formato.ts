export function dataCurta(iso: string): string {
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  return `${dia}/${mes}/${ano}`;
}

export function haQuanto(iso: string, agora: string): string {
  const min = Math.floor((new Date(agora).getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return 'agora';
  if (min < 60) return `há ${min} min`;
  return `há ${Math.floor(min / 60)} h`;
}

/** Vazio vira travessão: métrica sem dado não pode parecer zero. */
export function segundos(s: number | null): string {
  return s === null ? '—' : `${Math.round(s)} s`;
}

export function minutos(m: number | null): string {
  return m === null ? '—' : `${Math.round(m)} min`;
}

export const confianca = (c: number) => c.toFixed(2).replace('.', ',');
