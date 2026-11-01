// Tela 1 — Leitura do crachá. É a tela inicial: o QR decide quem está usando o app.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { definirFluxo, estadoAtual, useEstado, useRaiz } from '@/dados/store';
import { checkinDoDia, proximoPasso, statusDoDia } from '@/dominio/regras';
import { ROTULO_TAREFA } from '@/dominio/tipos';
import { Botao, BotaoOuvir, falar, SeloSync, T, Tela, useFala } from '@/ui/base';
import { LeitorQR, Mira, useCamera } from '@/ui/camera';
import { Icone } from '@/ui/Icone';
import { cor } from '@/ui/tema';

const FRASE = 'Mostre seu crachá. Aponte a câmera para o código.';

export default function LeituraCracha() {
  const router = useRouter();
  const e = useEstado();
  const { obra_id } = useRaiz();
  const camera = useCamera();
  const [lanterna, setLanterna] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  useFala(FRASE);

  const obra = e.obras.find((o) => o.id === obra_id);
  const agora = new Date().toISOString();

  function ler(token: string) {
    const estado = estadoAtual();
    const t = estado.trabalhadores.find((x) => x.cracha_token === token && !x.excluido_em);
    if (!t) {
      setAviso('Crachá não encontrado');
      falar('Crachá não encontrado. Fale com o encarregado.');
      return;
    }
    setAviso(null);
    const frente = estado.frentes.find((f) => f.id === t.frente_id);
    falar(`${t.nome.split(' ')[0]}, hoje: ${ROTULO_TAREFA[t.tarefa]}, ${frente?.nome ?? ''}`);

    const passo = proximoPasso(estado, t, new Date().toISOString());
    definirFluxo({
      trabalhador_id: t.id,
      checkin_id: 'checkin_id' in passo ? passo.checkin_id : null,
      modo: passo.tela === 'selfie' ? passo.modo : 'completo',
      epi_ids: passo.tela === 'selfie' && passo.modo === 'item' ? passo.epi_ids : undefined,
      tentativa: 1,
      itens: [],
      foto_id: null,
      resolvidos: [],
    });
    router.push(`/${passo.tela}`);
  }

  const demonstracao = e.trabalhadores.filter((t) => t.obra_id === obra_id);

  return (
    <Tela>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
          <View style={{ width: 36, height: 36, borderRadius: 8, backgroundColor: cor.laranja, alignItems: 'center', justifyContent: 'center' }}>
            <T tam={15} peso="extra" c={cor.fundo}>GE</T>
          </View>
          <T tam={15} peso="forte" linhas={1} style={{ flexShrink: 1 }}>{obra?.nome}</T>
        </View>
        <SeloSync />
      </View>

      <View style={{ flex: 1, marginHorizontal: 20, marginVertical: 8 }}>
        <LeitorQR onLer={ler} lanterna={lanterna}>
          <Mira>
            {!camera ? (
              <View style={{ width: 140, height: 160, borderRadius: 12, backgroundColor: cor.branco, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <Icone nome="qr" tam={84} cor={cor.fundo} esp={1.8} />
                <T tam={12} peso="forte" c={cor.apagado}>CRACHÁ</T>
              </View>
            ) : null}
          </Mira>
          <View style={{ alignItems: 'center', paddingHorizontal: 24 }}>
            <T tam={28} peso="extra" style={{ textAlign: 'center' }}>Mostre seu crachá</T>
            <T tam={17} c={cor.textoSuave} style={{ textAlign: 'center', marginTop: 8 }}>
              {camera ? 'Aponte a câmera para o código' : 'Câmera indisponível neste aparelho'}
            </T>
            {aviso ? <T tam={17} peso="forte" c={cor.laranjaClaro} style={{ marginTop: 8 }}>{aviso}</T> : null}
          </View>
        </LeitorQR>
      </View>

      <View style={{ paddingHorizontal: 20, gap: 6 }}>
        <T tam={12} peso="forte" c={cor.laranjaClaro}>CRACHÁS DE DEMONSTRAÇÃO</T>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {demonstracao.map((t) => {
            const feito = checkinDoDia(e, t.id, agora) !== undefined;
            const status = statusDoDia(e, t.id, agora);
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityLabel={`Ler crachá de ${t.nome}`}
                onPress={() => ler(t.cracha_token)}
                style={{ paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: cor.superficie2, minHeight: 56, justifyContent: 'center' }}
              >
                <T tam={14} peso="forte">{t.nome.split(' ')[0]}</T>
                <T tam={12} c={cor.textoSuave}>{feito ? status.replace('_', ' ') : 'sem check-in'}</T>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingTop: 12 }}>
        <BotaoOuvir texto={FRASE} />
        <Botao
          titulo={lanterna ? 'Desligar lanterna' : 'Ligar lanterna'}
          variante="escuro"
          icone="lanterna"
          tam={18}
          style={{ flex: 1 }}
          disabled={!camera}
          onPress={() => setLanterna((l) => !l)}
        />
      </View>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push('/login')}
        style={{ alignItems: 'center', paddingVertical: 16 }}
      >
        <T tam={15} peso="forte" c={cor.laranjaClaro}>Entrar como equipe</T>
      </Pressable>
    </Tela>
  );
}
