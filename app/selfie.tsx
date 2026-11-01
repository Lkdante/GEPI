// Tela 2 — Foto guiada. Sem detector de pose ainda, o disparo automático é por tempo.
import { CameraView } from 'expo-camera';
import { Redirect, useRouter } from 'expo-router';
import { sha256 } from 'js-sha256';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { salvarFoto } from '@/dados/fotos';
import { atualizarFluxo, fluxoAtual, transacao, useEstado, useRaiz } from '@/dados/store';
import { abrirCheckin, aplicarDeteccao, registrarFoto } from '@/dominio/operacoes';
import { episExigidos } from '@/dominio/regras';
import { ROTULO_TAREFA } from '@/dominio/tipos';
import { detector } from '@/ia/detector';
import { Botao, BotaoOuvir, Etapas, T, Tela, useFala } from '@/ui/base';
import { useCamera } from '@/ui/camera';
import { Icone } from '@/ui/Icone';
import { cor } from '@/ui/tema';

const FRASE = 'Encaixe seu corpo no desenho';
const SEGUNDOS = 4;

function Silhueta() {
  const traco = { stroke: cor.laranja, strokeWidth: 5, fill: 'none' } as const;
  return (
    <Svg width="100%" height="88%" viewBox="0 0 230 500" fill="none" accessibilityLabel="Silhueta de corpo inteiro para encaixar">
      <Circle cx={115} cy={62} r={36} {...traco} strokeDasharray="14 9" />
      <Path d="M79 52c4-26 66-26 72 0" {...traco} />
      <Path
        d="M60 120c10-12 30-18 55-18s45 6 55 18l20 120-26 6-14-90v120l12 228h-34l-13-200-13 200H68l12-228V156l-14 90-26-6z"
        {...traco}
        strokeDasharray="14 9"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

export default function Selfie() {
  const router = useRouter();
  const e = useEstado();
  const { fluxo } = useRaiz();
  const camera = useCamera();
  const ref = useRef<CameraView>(null);
  const [frontal, setFrontal] = useState(true);
  const [falta, setFalta] = useState(SEGUNDOS);
  const fotografando = useRef(false);
  useFala(FRASE);

  useEffect(() => {
    if (falta <= 0) {
      if (!fotografando.current) {
        fotografando.current = true;
        concluir().catch((erro) => console.error(erro));
      }
      return;
    }
    const id = setTimeout(() => setFalta((s) => s - 1), 1000);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [falta]);

  if (!fluxo) return <Redirect href="/" />;
  const t = e.trabalhadores.find((x) => x.id === fluxo.trabalhador_id)!;

  async function concluir() {
    const f = fluxoAtual()!;
    const quadro = camera ? await ref.current?.takePictureAsync({ quality: 0.4, base64: true }).catch(() => undefined) : undefined;
    const hash = quadro?.base64 ? sha256(quadro.base64) : null;

    const { itens, checkin_id, foto_id } = transacao((est, ctx) => {
      const c = f.checkin_id
        ? est.checkins.find((x) => x.id === f.checkin_id)!
        : abrirCheckin(est, ctx, t);
      const foto = hash ? registrarFoto(est, ctx, t.obra_id, 'checkin', c.id, hash) : null;
      const exigidos = episExigidos(est, t).filter((x) => !f.epi_ids || f.epi_ids.includes(x.id));
      const leituras = detector.detectar({ trabalhador: t, exigidos, tentativa: f.tentativa, modo: f.modo });
      const novos = aplicarDeteccao(est, ctx, c, t, foto?.id ?? null, leituras, detector, f.tentativa, f.epi_ids);
      return { itens: novos, checkin_id: c.id, foto_id: foto?.id ?? null };
    });
    if (quadro && foto_id) salvarFoto(foto_id, quadro.uri);

    atualizarFluxo({ itens, checkin_id, foto_id });
    router.replace('/resultado');
  }

  return (
    <Tela>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8 }}>
        <View style={{ flexShrink: 1 }}>
          <T tam={22} peso="extra">{t.nome}</T>
          <T tam={15} c={cor.laranjaClaro} style={{ marginTop: 2 }}>Hoje: {ROTULO_TAREFA[t.tarefa]}</T>
        </View>
        <Etapas total={4} atual={2} />
      </View>

      <View style={{ flex: 1, marginHorizontal: 20, marginVertical: 12, borderRadius: 20, backgroundColor: cor.superficie2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
        {camera ? (
          <CameraView
            ref={ref}
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            facing={frontal ? 'front' : 'back'}
            autofocus="on"
            flash="auto"
          />
        ) : null}
        <Silhueta />
        <View style={{ position: 'absolute', left: 16, right: 16, bottom: 16, padding: 14, borderRadius: 14, backgroundColor: cor.fundo, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icone nome="audio" tam={28} cor={cor.laranja} />
          <T tam={18} peso="forte" style={{ flexShrink: 1 }}>{FRASE}</T>
        </View>
      </View>

      <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 28, gap: 10 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Icone nome="relogio" tam={20} cor="#A3A3A3" />
          <T tam={15} c={cor.textoSuave}>
            {camera ? `A foto sai sozinha em ${falta}` : `Sem câmera: segue sem foto em ${falta}`}
          </T>
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <BotaoOuvir texto={FRASE} />
          <Botao
            titulo="Virar câmera"
            variante="escuro"
            tam={18}
            style={{ flex: 1 }}
            disabled={!camera}
            onPress={() => setFrontal((v) => !v)}
          />
        </View>
      </View>
    </Tela>
  );
}
