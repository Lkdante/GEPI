// Entrega de EPI por QR: crachá, CA, devolução do antigo e confirmação do trabalhador.
import { CameraView } from 'expo-camera';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { sha256 } from 'js-sha256';
import { useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { salvarFoto } from '@/dados/fotos';
import { transacao, useEstado, useRaiz } from '@/dados/store';
import { entregarEPI } from '@/dominio/operacoes';
import { conferirCA, entregaAtiva, saldoEPI, type ConferenciaCA } from '@/dominio/regras';
import type { EntregaEPI, EPI, Trabalhador } from '@/dominio/tipos';
import { Botao, T } from '@/ui/base';
import { LeitorQR, useCamera } from '@/ui/camera';
import { Campo, Cartao, Chip, Equipe, Secao } from '@/ui/equipe';
import { dataCurta } from '@/ui/formato';
import { Icone, Selo } from '@/ui/Icone';
import { cor } from '@/ui/tema';

type Passo = 'cracha' | 'epi' | 'ca' | 'devolucao' | 'assinatura' | 'feito';

const MENSAGEM_CA: Record<ConferenciaCA, string> = {
  valido: 'CA válido para este EPI',
  vencido: 'CA vencido: não pode ser entregue',
  cancelado: 'CA cancelado: não pode ser entregue',
  tipo_errado: 'Este CA é de outro tipo de EPI',
  nao_encontrado: 'CA não encontrado na base local',
};

const SEM_DEVOLUCAO = ['Perdeu', 'Ficou em outra obra', 'Foi furtado'];

export default function Entrega() {
  const router = useRouter();
  const e = useEstado();
  const { obra_id, usuario } = useRaiz();
  const params = useLocalSearchParams<{ req?: string }>();
  const req = e.requisicoes.find((r) => r.id === params.req) ?? null;
  const camera = useCamera();
  const cam = useRef<CameraView>(null);

  const [passo, setPasso] = useState<Passo>('cracha');
  const [t, setT] = useState<Trabalhador | null>(null);
  const [epi, setEpi] = useState<EPI | null>(e.epis.find((x) => x.id === req?.epi_id) ?? null);
  const [numeroCA, setNumeroCA] = useState('');
  const [lote, setLote] = useState('');
  const [devolveu, setDevolveu] = useState(true);
  const [semDevolucao, setSemDevolucao] = useState<string | null>(null);
  const [foto, setFoto] = useState<{ uri: string; hash: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [concluida, setConcluida] = useState<EntregaEPI | null>(null);

  const agora = new Date().toISOString();
  const esperado = req ? e.trabalhadores.find((x) => x.id === req.trabalhador_id) : undefined;
  const ca = e.cas.find((c) => c.numero === numeroCA.trim());
  const conferencia = epi ? conferirCA(ca, epi.id, agora) : 'nao_encontrado';
  const anterior = t && epi ? entregaAtiva(e, t.id, epi.id) : undefined;
  const daConstrutora = (req?.para_quem ?? t?.epi_fornecido_por) === 'construtora';
  const saldo = epi && obra_id ? saldoEPI(e, epi.id, obra_id) : 0;

  function lerCracha(token: string) {
    const lido = e.trabalhadores.find((x) => x.cracha_token === token.trim());
    if (!lido) return setAviso('Crachá não encontrado');
    if (esperado && lido.id !== esperado.id) return setAviso(`Este pedido é de ${esperado.nome}`);
    setAviso(null);
    setT(lido);
    setPasso(epi ? 'ca' : 'epi');
  }

  async function fotografar() {
    const q = await cam.current?.takePictureAsync({ quality: 0.4, base64: true });
    if (q?.base64) setFoto({ uri: q.uri, hash: sha256(q.base64) });
  }

  function confirmar() {
    if (!t || !epi || !ca) return;
    try {
      const entrega = transacao((est, ctx) =>
        entregarEPI(est, ctx, {
          trabalhador: t,
          epi_id: epi.id,
          ca_id: ca.id,
          lote: lote.trim() || null,
          motivo: req?.motivo ?? 'falta',
          requisicao: req,
          devolveu_antigo: devolveu,
          motivo_sem_devolucao: semDevolucao,
          foto_hash: foto?.hash ?? null,
        }),
      );
      if (foto && entrega.foto_id) salvarFoto(entrega.foto_id, foto.uri);
      setConcluida(entrega);
      setPasso('feito');
    } catch (erro) {
      setAviso(erro instanceof Error ? erro.message : String(erro));
    }
  }

  const rotaFila = usuario?.perfil === 'encarregado' ? '/encarregado' : '/almox';

  return (
    <Equipe perfis={['almoxarife', 'encarregado']} titulo={epi ? `Entrega · ${epi.descricao}` : 'Nova entrega de EPI'}>
      {t ? (
        <Cartao>
          <T tam={17} peso="extra" c={cor.fundo}>{t.nome}</T>
          <T tam={14} c={cor.claroTexto}>Matrícula {t.matricula}</T>
        </Cartao>
      ) : null}
      {aviso ? <T tam={16} peso="forte" c={cor.marromTexto}>{aviso}</T> : null}

      {passo === 'cracha' ? (
        <>
          <Secao>1. Leia o crachá de {esperado?.nome ?? 'quem recebe'}</Secao>
          <View style={{ height: camera ? 280 : 96 }}>
            <LeitorQR onLer={lerCracha}>
              {!camera ? <T tam={15} c={cor.textoSuave}>Câmera indisponível neste aparelho</T> : null}
            </LeitorQR>
          </View>
          {(esperado ? [esperado] : e.trabalhadores.filter((x) => x.obra_id === obra_id)).map((x) => (
            <Botao key={x.id} titulo={`Crachá de demonstração: ${x.nome}`} variante="preto" alto={52} tam={15} onPress={() => lerCracha(x.cracha_token)} />
          ))}
        </>
      ) : null}

      {passo === 'epi' ? (
        <>
          <Secao>2. Qual EPI está entregando?</Secao>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {e.epis.map((x) => (
              <Chip key={x.id} titulo={x.descricao} onPress={() => { setEpi(x); setPasso('ca'); }} />
            ))}
          </View>
        </>
      ) : null}

      {passo === 'ca' && epi ? (
        <>
          <Secao>2. Confira o CA da etiqueta</Secao>
          <Campo rotulo="Número do CA" keyboardType="number-pad" value={numeroCA} onChangeText={(v) => setNumeroCA(v.replace(/\D/g, ''))} />
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {e.cas.filter((c) => c.epi_id === epi.id).map((c) => (
              <Chip key={c.id} titulo={`CA ${c.numero}`} ativo={numeroCA === c.numero} onPress={() => setNumeroCA(c.numero)} />
            ))}
          </View>
          {numeroCA ? (
            <Cartao>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Selo tipo={conferencia === 'valido' ? 'ok' : 'atencao'} tam={26} />
                <View style={{ flex: 1 }}>
                  <T tam={16} peso="forte" c={cor.fundo}>{MENSAGEM_CA[conferencia]}</T>
                  {ca ? <T tam={14} c={cor.claroTexto}>{ca.fabricante} · validade {dataCurta(ca.validade)}</T> : null}
                </View>
              </View>
            </Cartao>
          ) : null}
          <Campo rotulo="Lote (opcional)" value={lote} onChangeText={setLote} />
          {daConstrutora && saldo <= 0 ? <T tam={15} peso="forte" c={cor.marromTexto}>Sem saldo deste EPI na obra.</T> : null}
          <Botao
            titulo="Continuar"
            alto={60}
            disabled={conferencia !== 'valido' || (daConstrutora && saldo <= 0)}
            onPress={() => setPasso(anterior ? 'devolucao' : 'assinatura')}
          />
        </>
      ) : null}

      {passo === 'devolucao' && anterior ? (
        <>
          <Secao>3. {t?.nome.split(' ')[0]} devolveu o item antigo?</Secao>
          <T tam={15} c={cor.claroTexto}>Entregue em {dataCurta(anterior.data)}</T>
          <Botao titulo="Devolveu" variante="verde" alto={60} onPress={() => { setDevolveu(true); setSemDevolucao(null); setPasso('assinatura'); }} />
          <T tam={15} peso="forte" c={cor.fundo}>Não devolveu, porque:</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SEM_DEVOLUCAO.map((m) => (
              <Chip key={m} titulo={m} onPress={() => { setDevolveu(false); setSemDevolucao(m); setPasso('assinatura'); }} />
            ))}
          </View>
        </>
      ) : null}

      {passo === 'assinatura' ? (
        <>
          <Secao>4. {t?.nome.split(' ')[0]} confirma o recebimento</Secao>
          {camera ? (
            foto ? (
              <Image source={{ uri: foto.uri }} style={{ height: 240, borderRadius: 16 }} accessibilityLabel="Foto da mão segurando o EPI" />
            ) : (
              <>
                <View style={{ height: 280, borderRadius: 16, overflow: 'hidden' }}>
                  <CameraView ref={cam} style={{ flex: 1 }} facing="back" />
                </View>
                <Botao titulo="Fotografar a mão com o EPI" variante="preto" alto={56} tam={16} onPress={fotografar} />
              </>
            )
          ) : (
            <T tam={15} c={cor.claroTexto}>Sem câmera neste aparelho: a entrega fica sem foto de evidência.</T>
          )}
          <T tam={15} c={cor.claroTexto}>
            O toque abaixo vale como assinatura eletrônica: grava crachá, data, aparelho e foto com hash na ficha NR-6.
          </T>
          <Botao titulo="Recebi o EPI" variante="verde" icone="sim" alto={76} disabled={camera && !foto} onPress={confirmar} />
        </>
      ) : null}

      {passo === 'feito' && concluida ? (
        <>
          <Cartao>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Selo tipo="ok" tam={36} />
              <View style={{ flex: 1 }}>
                <T tam={18} peso="extra" c={cor.fundo}>Entrega registrada</T>
                <T tam={14} c={cor.claroTexto}>Ficha NR-6 atualizada. Válido até {dataCurta(concluida.validade_uso)}.</T>
              </View>
            </View>
          </Cartao>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Icone nome="audio" tam={22} cor={cor.laranjaEscuro} />
            <T tam={15} c={cor.claroTexto} style={{ flex: 1 }}>
              O trabalhador lê o crachá de novo e refaz só este item para ser liberado.
            </T>
          </View>
          <Botao titulo="Voltar à fila" alto={60} onPress={() => router.replace(rotaFila as never)} />
        </>
      ) : null}
    </Equipe>
  );
}
