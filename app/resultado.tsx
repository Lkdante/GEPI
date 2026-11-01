// Tela 3 — Resultado do EPI: um cartão por item, o faltante em laranja e duas saídas.
import { Redirect, useRouter } from 'expo-router';
import { View } from 'react-native';
import { atualizarFluxo, transacao, useEstado, useRaiz } from '@/dados/store';
import { enviarParaRevisao, pedirEPI } from '@/dominio/operacoes';
import type { EPI, ItemCheckin, MotivoReq } from '@/dominio/tipos';
import { ROTULO_TAREFA } from '@/dominio/tipos';
import { detector } from '@/ia/detector';
import { AvisoSimulado, Botao, Rolagem, T, Tela, useFala } from '@/ui/base';
import { Icone, Selo } from '@/ui/Icone';
import { cor } from '@/ui/tema';

const LEGENDA: Record<string, string> = {
  falta: 'Não apareceu na foto',
  segunda_foto: 'Vamos tirar mais uma foto',
  duvida: 'O técnico vai conferir',
  vencido: 'Venceu. Troque no almoxarifado',
};

function CartaoOk({ epi }: { epi: EPI }) {
  return (
    <View style={{ width: '48%', flexGrow: 1, borderRadius: 16, backgroundColor: cor.verdeEscuro, padding: 14, gap: 8, minHeight: 104 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Icone nome={epi.icone} tam={40} esp={1.8} />
        <Selo tipo="ok" />
      </View>
      <T tam={17} peso="forte">{epi.descricao}</T>
    </View>
  );
}

function CartaoAtencao({ epi, item, semRegistro }: { epi: EPI; item: ItemCheckin; semRegistro: boolean }) {
  return (
    <View style={{ borderRadius: 16, borderWidth: 3, borderColor: cor.laranja, backgroundColor: cor.laranjaFundo, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
      <Icone nome={epi.icone} tam={52} cor={cor.laranja} esp={1.8} />
      <View style={{ flex: 1 }}>
        <T tam={20} peso="extra">{epi.descricao}</T>
        <T tam={15} c={cor.laranjaClaro} style={{ marginTop: 4 }}>
          {semRegistro ? 'Ainda não recebeu este item' : LEGENDA[item.situacao]}
        </T>
      </View>
      <Selo tipo="atencao" tam={34} />
    </View>
  );
}

export default function Resultado() {
  const router = useRouter();
  const e = useEstado();
  const { fluxo } = useRaiz();

  const itens = fluxo?.itens ?? [];
  const epiDe = (i: ItemCheckin) => e.epis.find((x) => x.id === i.epi_id)!;
  const naoOk = itens.filter((i) => i.situacao !== 'ok');
  const faltando = naoOk.filter((i) => i.situacao !== 'duvida').length;
  const titulo =
    naoOk.length === 0
      ? 'Tudo certo'
      : faltando === 0
        ? 'O técnico vai conferir'
        : faltando === 1
          ? 'Falta 1 item'
          : `Faltam ${faltando} itens`;
  useFala(naoOk.length === 0 ? 'Tudo certo. Vamos às perguntas.' : `${titulo}. ${epiDe(naoOk[0]).descricao}.`);

  if (!fluxo) return <Redirect href="/" />;
  const t = e.trabalhadores.find((x) => x.id === fluxo.trabalhador_id)!;

  // Um item por vez: o trabalhador nunca decide mais de uma coisa na mesma tela.
  const emAberto = naoOk.filter((i) => i.situacao !== 'duvida' && !fluxo.resolvidos.includes(i.epi_id));
  const atual = emAberto[0];
  const epiAtual = atual ? epiDe(atual) : null;
  const semFoto = atual ? atual.confianca === null : false;

  const novaFoto = () => {
    atualizarFluxo({ tentativa: fluxo.tentativa + 1, resolvidos: [] });
    router.replace('/selfie');
  };

  const pedir = () => {
    const motivo: MotivoReq =
      atual.situacao === 'vencido' ? 'vencido' : semFoto ? 'admissao' : 'falta';
    transacao((est, ctx) => pedirEPI(est, ctx, t, atual.epi_id, motivo, fluxo.checkin_id));
    atualizarFluxo({ resolvidos: [...fluxo.resolvidos, atual.epi_id] });
  };

  const pedirRevisao = () => {
    const revisto = transacao((est, ctx) => {
      const c = est.checkins.find((x) => x.id === fluxo.checkin_id)!;
      return enviarParaRevisao(est, ctx, c, atual, fluxo.foto_id, detector);
    });
    atualizarFluxo({ itens: itens.map((i) => (i.epi_id === revisto.epi_id ? revisto : i)) });
  };

  return (
    <Tela>
      <Rolagem style={{ paddingBottom: 8 }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, gap: 6 }}>
          <T tam={26} peso="extra">{titulo}</T>
          <T tam={16} c={cor.textoSuave}>
            {fluxo.modo === 'item'
              ? 'Conferindo o que você recebeu'
              : `${ROTULO_TAREFA[t.tarefa][0].toUpperCase() + ROTULO_TAREFA[t.tarefa].slice(1)} pede ${itens.length} itens`}
          </T>
          {detector.simulado ? <AvisoSimulado /> : null}
        </View>
        <View style={{ marginHorizontal: 20, marginVertical: 8, flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          {itens.filter((i) => i.situacao === 'ok').map((i) => (
            <CartaoOk key={i.epi_id} epi={epiDe(i)} />
          ))}
        </View>
        <View style={{ marginHorizontal: 20, gap: 12 }}>
          {naoOk.map((i) => (
            <CartaoAtencao key={i.epi_id} epi={epiDe(i)} item={i} semRegistro={i.situacao === 'falta' && i.confianca === null} />
          ))}
        </View>
      </Rolagem>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28, gap: 12 }}>
        {!atual ? (
          <Botao titulo="Continuar" variante="laranja" alto={76} onPress={() => router.replace('/checklist')} />
        ) : atual.situacao === 'segunda_foto' ? (
          <Botao titulo="Tirar outra foto" alto={76} onPress={novaFoto} />
        ) : atual.situacao === 'falta' && !semFoto ? (
          <>
            {fluxo.tentativa < 2 ? (
              <Botao titulo={`Estou com o ${epiAtual!.curto} · tirar outra foto`} alto={76} tam={18} onPress={novaFoto} />
            ) : (
              <Botao titulo={`Estou com o ${epiAtual!.curto} · pedir revisão`} alto={76} tam={18} onPress={pedirRevisao} />
            )}
            <Botao titulo="Não tenho · pedir agora" variante="contorno" alto={64} tam={18} onPress={pedir} />
          </>
        ) : (
          <Botao titulo="Pedir agora" alto={76} onPress={pedir} />
        )}
      </View>
    </Tela>
  );
}
