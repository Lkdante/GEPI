// Tela 4 — Checklist por áudio: 3 a 5 cartões, um por vez, respondidos com joinha.
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, View } from 'react-native';
import { atualizarFluxo, estadoAtual, fluxoAtual, transacao, useEstado, useRaiz } from '@/dados/store';
import { fecharCheckin, pedirEPI, responderChecklist } from '@/dominio/operacoes';
import { requisicaoAberta } from '@/dominio/regras';
import { Etapas, falar, T, Tela, useFala } from '@/ui/base';
import { Icone } from '@/ui/Icone';
import { cor } from '@/ui/tema';

const MAX_PERGUNTAS = 5;

export default function Checklist() {
  const router = useRouter();
  const e = useEstado();
  const { fluxo } = useRaiz();
  const [indice, setIndice] = useState(0);

  // Só pergunta do que o trabalhador tem na mão. Primeira pergunta de cada EPI,
  // depois as extras dos itens críticos até o limite.
  const perguntas = useMemo(() => {
    if (!fluxo) return [];
    const temNaMao = fluxo.itens.filter((i) => i.situacao === 'ok' || i.situacao === 'duvida');
    const epis = temNaMao.map((i) => e.epis.find((x) => x.id === i.epi_id)!);
    const lista = epis.flatMap((epi) => epi.perguntas.slice(0, 1).map((texto) => ({ epi, texto })));
    const extras = epis.flatMap((epi) => epi.perguntas.slice(1).map((texto) => ({ epi, texto })));
    return [...lista, ...extras].slice(0, MAX_PERGUNTAS);
    // Congela a lista ao abrir: responder altera o fluxo, não o roteiro.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const atual = perguntas[indice];
  useFala(atual?.texto ?? '');

  const encerrar = () => {
    // Lê o fluxo da fonte: a última resposta acabou de mudá-lo e esta função pode
    // ter sido criada antes disso.
    const f = fluxoAtual()!;
    transacao((est, ctx) => {
      const c = est.checkins.find((x) => x.id === f.checkin_id)!;
      return fecharCheckin(est, ctx, c, f.itens);
    });
    const temPedido = f.itens.some(
      (i) => i.situacao !== 'ok' && requisicaoAberta(estadoAtual(), f.trabalhador_id, i.epi_id),
    );
    router.replace(temPedido ? '/pegue' : '/final');
  };

  useEffect(() => {
    if (fluxo && perguntas.length === 0) encerrar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!fluxo) return <Redirect href="/" />;
  if (!atual) return <Tela><View /></Tela>;

  function responder(valor: boolean) {
    const f = fluxo!;
    const t = e.trabalhadores.find((x) => x.id === f.trabalhador_id)!;
    transacao((est, ctx) => {
      const c = est.checkins.find((x) => x.id === f.checkin_id)!;
      responderChecklist(est, ctx, c, atual.epi.id, atual.texto, valor);
      if (!valor) pedirEPI(est, ctx, t, atual.epi.id, 'danificado', c.id);
    });
    if (!valor) {
      atualizarFluxo({
        itens: f.itens.map((i) =>
          i.epi_id === atual.epi.id ? { ...i, situacao: 'danificado' } : i,
        ),
      });
    }
    if (indice + 1 < perguntas.length) setIndice(indice + 1);
    else setTimeout(encerrar, 0);
  }

  const Opcao = ({ sim }: { sim: boolean }) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={sim ? 'Sim' : 'Não'}
      onPress={() => responder(sim)}
      style={{ flex: 1, height: 150, borderRadius: 20, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: sim ? cor.verde : cor.laranjaFundo, borderWidth: sim ? 0 : 3, borderColor: cor.laranja }}
    >
      <Icone nome={sim ? 'sim' : 'nao'} tam={64} cor={sim ? cor.branco : cor.laranja} />
      <T tam={22} peso="extra">{sim ? 'Sim' : 'Não'}</T>
    </Pressable>
  );

  return (
    <Tela>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
        <T tam={16} peso="forte" c={cor.textoSuave}>Pergunta {indice + 1} de {perguntas.length}</T>
        <Etapas total={perguntas.length} atual={indice + 1} />
      </View>
      <View style={{ marginHorizontal: 20, marginVertical: 12, borderRadius: 20, backgroundColor: cor.branco, height: 260, alignItems: 'center', justifyContent: 'center' }}>
        <Icone nome={atual.epi.icone} tam={190} cor={cor.fundo} esp={1.4} />
      </View>
      <View style={{ paddingHorizontal: 24, paddingVertical: 8, flexDirection: 'row', alignItems: 'flex-start', gap: 14 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Ouvir a pergunta"
          onPress={() => falar(atual.texto)}
          style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: cor.laranja, alignItems: 'center', justifyContent: 'center' }}
        >
          <Icone nome="audio" tam={30} cor={cor.fundo} esp={2.2} />
        </Pressable>
        <T tam={28} peso="extra" style={{ flex: 1 }}>{atual.texto}</T>
      </View>
      <View style={{ flex: 1 }} />
      <View style={{ flexDirection: 'row', gap: 14, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 28 }}>
        <Opcao sim={false} />
        <Opcao sim />
      </View>
    </Tela>
  );
}
