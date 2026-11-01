import * as Speech from 'expo-speech';
import { useEffect, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRaiz } from '@/dados/store';
import { Icone } from './Icone';
import { cor, fonte } from './tema';

export function T({
  children,
  tam = 16,
  peso = 'medio',
  c = cor.branco,
  style,
  linhas,
}: {
  children: ReactNode;
  tam?: number;
  peso?: keyof typeof fonte;
  c?: string;
  style?: StyleProp<TextStyle>;
  linhas?: number;
}) {
  return (
    <Text
      numberOfLines={linhas}
      style={[{ fontFamily: fonte[peso], fontSize: tam, color: c, lineHeight: Math.round(tam * 1.22) }, style]}
    >
      {children}
    </Text>
  );
}

export function falar(texto: string) {
  try {
    Speech.stop();
    Speech.speak(texto, { language: 'pt-BR' });
  } catch {
    // Sem voz no aparelho a tela continua legível: o áudio é reforço, não requisito.
  }
}

/** Toda tela do trabalhador fala ao abrir (PDF, seção 2). */
export function useFala(texto: string) {
  useEffect(() => {
    falar(texto);
    return () => {
      try {
        Speech.stop();
      } catch {}
    };
  }, [texto]);
}

type Variante = 'primario' | 'laranja' | 'escuro' | 'contorno' | 'verde' | 'perigo' | 'preto';

const VARIANTES: Record<Variante, { fundo: string; texto: string; borda?: string }> = {
  primario: { fundo: cor.laranjaEscuro, texto: cor.branco },
  laranja: { fundo: cor.laranja, texto: cor.fundo },
  escuro: { fundo: cor.superficie2, texto: cor.branco },
  contorno: { fundo: 'transparent', texto: cor.branco, borda: cor.borda },
  verde: { fundo: cor.verde, texto: cor.branco },
  perigo: { fundo: cor.vermelho, texto: cor.branco },
  preto: { fundo: cor.branco, texto: cor.fundo, borda: cor.fundo },
};

export function Botao({
  titulo,
  variante = 'primario',
  alto = 72,
  tam = 19,
  icone,
  style,
  ...props
}: {
  titulo: string;
  variante?: Variante;
  alto?: number;
  tam?: number;
  icone?: string;
  style?: StyleProp<ViewStyle>;
} & Omit<PressableProps, 'style'>) {
  const v = VARIANTES[variante];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={titulo}
      style={({ pressed }) => [
        {
          minHeight: alto,
          borderRadius: 16,
          backgroundColor: v.fundo,
          borderWidth: v.borda ? 2 : 0,
          borderColor: v.borda,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 8,
          opacity: props.disabled ? 0.45 : pressed ? 0.85 : 1,
        },
        style,
      ]}
      {...props}
    >
      {icone ? <Icone nome={icone} tam={tam + 7} cor={v.texto} /> : null}
      <T tam={tam} peso="extra" c={v.texto} style={{ textAlign: 'center', flexShrink: 1 }}>
        {titulo}
      </T>
    </Pressable>
  );
}

export function BotaoOuvir({ texto, tam = 72 }: { texto: string; tam?: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Ouvir de novo"
      onPress={() => falar(texto)}
      style={{
        width: tam,
        height: tam,
        borderRadius: 16,
        borderWidth: 2,
        borderColor: cor.laranja,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icone nome="audio" tam={tam * 0.47} cor={cor.laranja} />
    </Pressable>
  );
}

/** Selo de sincronização. Sem backend ligado, tudo fica "salvo no celular". */
export function SeloSync({ claro = false }: { claro?: boolean }) {
  const { estado, falha_gravacao } = useRaiz();
  const pendentes = estado?.fila_sync.length ?? 0;
  const enviado = pendentes === 0;
  if (falha_gravacao) {
    return (
      <View accessibilityLabel="Falha ao salvar no celular" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: cor.vermelho }}>
        <Icone nome="alerta" tam={18} cor={cor.branco} esp={3} />
        <T tam={13} peso="forte">Não salvou</T>
      </View>
    );
  }
  return (
    <View
      accessibilityLabel={enviado ? 'Tudo enviado' : `${pendentes} registros salvos no celular`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: claro ? cor.claroBorda : cor.superficie2,
      }}
    >
      <Icone nome="nuvem" tam={18} cor={enviado ? cor.laranja : '#A3A3A3'} />
      <T tam={13} c={claro ? cor.claroTexto : cor.textoSuave}>
        {enviado ? 'Enviado' : 'Salvo no celular'}
      </T>
    </View>
  );
}

export function Etapas({ total, atual }: { total: number; atual: number }) {
  return (
    <View
      accessibilityLabel={`Etapa ${atual} de ${total}`}
      style={{ flexDirection: 'row', gap: 6 }}
    >
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={{
            width: 22,
            height: 8,
            borderRadius: 4,
            backgroundColor: i < atual ? cor.laranja : cor.apagado,
          }}
        />
      ))}
    </View>
  );
}

/** Tela escura do trabalhador: coluna de celular, centralizada no navegador. */
export function Tela({ children, fundo = cor.fundo }: { children: ReactNode; fundo?: string }) {
  const area = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: fundo, alignItems: 'center' }}>
      <View
        style={{
          flex: 1,
          width: '100%',
          maxWidth: 480,
          paddingTop: area.top,
          paddingBottom: area.bottom,
        }}
      >
        {children}
      </View>
    </View>
  );
}

export function Rolagem({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={style} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  );
}

/** Aviso exigido enquanto o detector real não existe. */
export function AvisoSimulado() {
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingVertical: 4,
        paddingHorizontal: 8,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: cor.laranjaClaro,
      }}
    >
      <T tam={12} peso="forte" c={cor.laranjaClaro}>
        Demonstração · detecção simulada
      </T>
    </View>
  );
}
