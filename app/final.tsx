// Final do check-in: tela inteira verde, laranja ou, só com decisão humana, vermelha.
import { Redirect, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import { definirFluxo, useEstado, useRaiz } from '@/dados/store';
import { checkinDoDia } from '@/dominio/regras';
import { Botao, T, Tela, useFala } from '@/ui/base';
import { Selo } from '@/ui/Icone';
import { cor } from '@/ui/tema';

const VOLTA_MS = 12_000;

const APARENCIA = {
  liberado: { fundo: cor.verde, selo: 'ok', titulo: 'Liberado', frase: 'Bom trabalho' },
  pendente: { fundo: cor.laranjaEscuro, selo: 'atencao', titulo: 'Pendente', frase: 'Fale com o encarregado' },
  bloqueado: { fundo: cor.vermelho, selo: 'bloqueio', titulo: 'Não suba', frase: 'Fale com o técnico de segurança' },
} as const;

export default function Final() {
  const router = useRouter();
  const e = useEstado();
  const { fluxo } = useRaiz();
  const c = fluxo ? checkinDoDia(e, fluxo.trabalhador_id, new Date().toISOString()) : undefined;
  const a = APARENCIA[c?.resultado ?? 'pendente'];
  useFala(`${a.titulo}. ${a.frase}.`);

  const concluir = () => {
    definirFluxo(null);
    router.replace('/');
  };

  // No celular da frente o próximo da fila precisa da tela de crachá.
  useEffect(() => {
    const id = setTimeout(concluir, VOLTA_MS);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!fluxo) return <Redirect href="/" />;
  const t = e.trabalhadores.find((x) => x.id === fluxo.trabalhador_id)!;

  return (
    <Tela fundo={a.fundo}>
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 18 }}>
        <Selo tipo={a.selo} tam={150} />
        <T tam={44} peso="extra" style={{ textAlign: 'center' }}>{a.titulo}</T>
        <T tam={22} peso="forte" style={{ textAlign: 'center' }}>{a.frase}, {t.nome.split(' ')[0]}</T>
        {c?.resultado === 'pendente' && c.itens.some((i) => i.situacao === 'duvida') ? (
          <T tam={17} style={{ textAlign: 'center' }}>O técnico está conferindo sua foto</T>
        ) : null}
      </View>
      <View style={{ paddingHorizontal: 20, paddingBottom: 28, gap: 12 }}>
        <Botao titulo="Meus EPIs" variante="contorno" alto={64} onPress={() => router.push('/meus-epis')} style={{ borderColor: cor.branco }} />
        <Botao titulo="Concluir" variante="preto" alto={76} tam={20} onPress={concluir} />
      </View>
    </Tela>
  );
}
