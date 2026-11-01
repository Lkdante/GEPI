import Svg, { Circle, Path, Rect } from 'react-native-svg';

type Forma =
  | { d: string }
  | { c: [number, number, number] }
  | { r: [number, number, number, number] };

const p = (...ds: string[]): Forma[] => ds.map((d) => ({ d }));

const ICONES: Record<string, Forma[]> = {
  audio: p('M11 5 6 9H2v6h4l5 4V5z', 'M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14'),
  lanterna: p('M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z'),
  nuvem: p('M17.5 19H8a5 5 0 1 1 1.2-9.86A6 6 0 0 1 20 11a4 4 0 0 1-2.5 8z'),
  qr: [
    { r: [3, 3, 7, 7] },
    { r: [14, 3, 7, 7] },
    { r: [3, 14, 7, 7] },
    { d: 'M14 14h3v3h-3zM18 18h3v3h-3zM14 20h2M20 14v2' },
  ],
  relogio: [{ c: [12, 12, 9] }, { d: 'M12 7v5l3 2' }],
  pino: [{ d: 'M12 21s7-6.1 7-11a7 7 0 0 0-14 0c0 4.9 7 11 7 11z' }, { c: [12, 10, 2.5] }],
  casa: p('M3 21V9l9-6 9 6v12', 'M8 21v-8h8v8M8 17h8'),
  sim: p('M7 10v12M15 5.9 14 10h5.8a2 2 0 0 1 2 2.3l-1.3 8a2 2 0 0 1-2 1.7H7V10l4-8a3 3 0 0 1 3 3.9z'),
  nao: p('M17 14V2M9 18.1 10 14H4.2a2 2 0 0 1-2-2.3l1.3-8A2 2 0 0 1 5.5 2H17v12l-4 8a3 3 0 0 1-3-3.9z'),
  doc: p('M14 3H6v18h12V7z', 'M14 3v4h4M9 13h6M9 17h4'),
  caixa: p('M21 8 12 3 3 8v8l9 5 9-5z', 'M3 8l9 5 9-5M12 13v8'),
  check: p('m5 12 5 5L19 7'),
  x: p('M6 6l12 12M18 6 6 18'),
  alerta: p('M12 5v9M12 18v.5'),
  sair: p('M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10'),
  // EPIs: desenhos do wireframe.
  capacete: p('M3 17h18M5 17a7 7 0 0 1 14 0M12 6v4M9 7l1 3M15 7l-1 3'),
  botina: p('M5 4h6v8l7 3v4H5z', 'M5 15h13'),
  colete: p('M8 3 4 6v15h16V6l-4-3-4 3z', 'M4 12h16M4 16h16'),
  luva: p('M7 21v-8L4 9l1.5-1.5L8 10V4a1.5 1.5 0 0 1 3 0v5V3a1.5 1.5 0 0 1 3 0v6V4a1.5 1.5 0 0 1 3 0v10l-2 7z'),
  cinto: [{ c: [12, 4, 2] }, { d: 'M6 8h12M8 8l1 7h6l1-7M9 15l-2 6M15 15l2 6M12 8v7M18 8l2 3' }],
  oculos: [{ c: [7, 13, 4] }, { c: [17, 13, 4] }, { d: 'M11 13h2M3 13l1-5M21 13l-1-5' }],
  protetor: p('M4 14a8 8 0 0 1 16 0', 'M4 14v3a2 2 0 0 0 4 0v-3a2 2 0 0 0-4 0zM16 14v3a2 2 0 0 0 4 0v-3a2 2 0 0 0-4 0z'),
};

export function Icone({
  nome,
  tam = 24,
  cor = '#FFFFFF',
  esp = 2,
}: {
  nome: string;
  tam?: number;
  cor?: string;
  esp?: number;
}) {
  const comum = { stroke: cor, strokeWidth: esp, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24" fill="none">
      {(ICONES[nome] ?? []).map((f, i) => {
        if ('d' in f) return <Path key={i} d={f.d} {...comum} />;
        if ('c' in f) return <Circle key={i} cx={f.c[0]} cy={f.c[1]} r={f.c[2]} {...comum} />;
        return <Rect key={i} x={f.r[0]} y={f.r[1]} width={f.r[2]} height={f.r[3]} {...comum} />;
      })}
    </Svg>
  );
}

/** Selo redondo: a cor nunca carrega o significado sozinha, sempre vem com o ícone. */
export function Selo({
  tipo,
  tam = 30,
}: {
  tipo: 'ok' | 'atencao' | 'bloqueio';
  tam?: number;
}) {
  const fundo = tipo === 'ok' ? '#22C55E' : tipo === 'atencao' ? '#F97316' : '#B91C1C';
  const traco = tipo === 'bloqueio' ? '#FFFFFF' : '#0E0E0E';
  const d = tipo === 'ok' ? 'm7 12 3.5 3.5L17 9' : tipo === 'atencao' ? 'M12 6.5v7M12 17v.5' : 'M8 8l8 8M16 8l-8 8';
  return (
    <Svg width={tam} height={tam} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={11} fill={fundo} />
      <Path d={d} stroke={traco} strokeWidth={2.7} fill="none" strokeLinecap="round" />
    </Svg>
  );
}
