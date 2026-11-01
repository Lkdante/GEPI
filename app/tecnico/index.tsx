// Tela 8 — Fila de exceções. Sem cartões de PT: Permissão de Trabalho está fora do GEPI.
import { useState } from 'react';
import { Image, View } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { uriFoto } from '@/dados/fotos';
import { transacao, useEstado, useRaiz } from '@/dados/store';
import { decidirBloqueio, revisarDeteccao } from '@/dominio/operacoes';
import { episAbaixoDoMinimo, filaExcecoes, metricas, type ItemFila } from '@/dominio/regras';
import type { Deteccao } from '@/dominio/tipos';
import { ROTULO_TAREFA } from '@/dominio/tipos';
import { Botao, T } from '@/ui/base';
import { Cartao, Equipe, Secao, Tile, Vazio } from '@/ui/equipe';
import { confianca, haQuanto } from '@/ui/formato';
import { Icone } from '@/ui/Icone';
import { cor } from '@/ui/tema';

/** O desfoque aqui é só de exibição; o de verdade, no celular, depende do detector de rosto. */
function FotoRevisao({ foto_id, nome }: { foto_id: string | null; nome: string }) {
  const uri = uriFoto(foto_id);
  const [largura, setLargura] = useState(0);
  return (
    <View
      onLayout={(ev) => setLargura(ev.nativeEvent.layout.width)}
      style={{ height: 200, backgroundColor: '#D6D3D1', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
    >
      {uri ? (
        <>
          <Image source={{ uri }} style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }} accessibilityLabel={`Foto do check-in de ${nome}`} />
          <View style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 72, overflow: 'hidden' }}>
            <Image source={{ uri }} blurRadius={24} style={{ width: largura, height: 200 }} />
          </View>
        </>
      ) : (
        <Svg width={110} height={180} viewBox="0 0 110 180" fill="none" accessibilityLabel="Sem foto neste check-in">
          <Circle cx={55} cy={26} r={18} fill="#A8A29E" />
          <Path d="M25 62c6-10 18-14 30-14s24 4 30 14l6 60H19z" fill="#78716C" />
          <Path d="M33 122h44l-4 56H37z" fill="#57534E" />
          <Rect x={22} y={60} width={66} height={54} rx={6} stroke={cor.laranja} strokeWidth={4} strokeDasharray="8 5" />
        </Svg>
      )}
      <View style={{ position: 'absolute', left: 10, top: 10, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, backgroundColor: cor.fundo }}>
        <T tam={12} peso="forte">{uri ? 'Rosto desfocado' : 'Sem foto'}</T>
      </View>
    </View>
  );
}

function CartaoDeteccao({ item, agora }: { item: ItemFila; agora: string }) {
  const d = item.deteccao as Deteccao;
  const epi = item.epi!;
  const frente = useEstado().frentes.find((f) => f.id === item.checkin.frente_id);
  const decidir = (valor: 'presente' | 'ausente') =>
    transacao((est, ctx) =>
      revisarDeteccao(est, ctx, d, d.rotulo === valor ? 'confirmar' : 'corrigir', valor),
    );
  const novaFoto = () => transacao((est, ctx) => revisarDeteccao(est, ctx, d, 'pedir_nova_foto', null));

  return (
    <View style={{ backgroundColor: cor.branco, borderRadius: 16, borderWidth: 1, borderColor: cor.claroBorda }}>
      <FotoRevisao foto_id={d.foto_id} nome={item.trabalhador.nome} />
      <View style={{ padding: 14, gap: 4 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
          <T tam={17} peso="extra" c={cor.fundo} style={{ flexShrink: 1 }}>
            {item.tipo === 'amostra' ? `Amostra de auditoria: ${epi.descricao}` : `${epi.descricao}: IA em dúvida`}
          </T>
          <T tam={13} peso="forte" c={cor.marromTexto}>confiança {confianca(d.confianca)}</T>
        </View>
        <T tam={13} c={cor.claroTexto}>
          {item.trabalhador.nome} · {frente?.nome} · {ROTULO_TAREFA[item.checkin.tarefa]} · {haQuanto(item.criado_em, agora)}
        </T>
        {item.estourou_sla ? (
          <T tam={13} peso="forte" c={cor.marromTexto}>Prazo de revisão estourado: escalou ao engenheiro</T>
        ) : null}
        {d.modelo === 'simulado' ? <T tam={12} peso="forte" c={cor.marromTexto}>Demonstração · detecção simulada</T> : null}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Botao titulo={`Está com ${epi.curto}`} variante="verde" alto={52} tam={14} style={{ flex: 1 }} onPress={() => decidir('presente')} />
          <Botao titulo={`Sem ${epi.curto}`} alto={52} tam={14} style={{ flex: 1 }} onPress={() => decidir('ausente')} />
          <Botao titulo="Nova foto" variante="preto" alto={52} tam={14} style={{ flex: 1 }} onPress={novaFoto} />
        </View>
      </View>
    </View>
  );
}

function CartaoBloqueio({ item, agora }: { item: ItemFila; agora: string }) {
  const decidir = (confirmar: boolean) =>
    transacao((est, ctx) => {
      const c = est.checkins.find((x) => x.id === item.checkin.id)!;
      return decidirBloqueio(est, ctx, c, confirmar);
    });
  return (
    <Cartao>
      <T tam={17} peso="extra" c={cor.fundo}>Bloqueio aguardando confirmação</T>
      <T tam={13} c={cor.claroTexto}>{item.trabalhador.nome} · {haQuanto(item.criado_em, agora)}</T>
      <T tam={15} c={cor.fundo}>{item.checkin.bloqueio_justificativa}</T>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
        <Botao titulo="Confirmar bloqueio" variante="perigo" alto={52} tam={14} style={{ flex: 1 }} onPress={() => decidir(true)} />
        <Botao titulo="Recusar" variante="preto" alto={52} tam={14} style={{ flex: 1 }} onPress={() => decidir(false)} />
      </View>
    </Cartao>
  );
}

export default function Revisar() {
  const e = useEstado();
  const { obra_id } = useRaiz();
  const agora = new Date().toISOString();
  const m = metricas(e, obra_id!, agora);
  const fila = filaExcecoes(e, obra_id!, agora);
  const baixos = episAbaixoDoMinimo(e, obra_id!);

  return (
    <Equipe
      perfis={['tecnico']}
      titulo="Revisar agora"
      resumo={
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Tile valor={m.liberados} rotulo="liberados" fundo={cor.verdeEscuro} texto={cor.verdePele} />
          <Tile valor={m.pendentes} rotulo="pendentes" fundo={cor.marrom} texto={cor.laranjaPele} />
          <Tile valor={m.sem_checkin} rotulo="sem check-in" fundo={cor.superficie2} texto={cor.textoSuave} />
        </View>
      }
    >
      {fila.length === 0 ? <Vazio>Nenhuma exceção para revisar nesta obra.</Vazio> : null}
      {fila.map((item) =>
        item.tipo === 'bloqueio' ? (
          <CartaoBloqueio key={item.chave} item={item} agora={agora} />
        ) : (
          <CartaoDeteccao key={item.chave} item={item} agora={agora} />
        ),
      )}
      {baixos.length > 0 ? <Secao>Alertas</Secao> : null}
      {baixos.map(({ epi, saldo }) => (
        <Cartao key={epi.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Icone nome="caixa" tam={28} cor={cor.fundo} />
            <View style={{ flex: 1 }}>
              <T tam={15} peso="forte" c={cor.fundo}>Estoque de EPI baixo</T>
              <T tam={13} c={cor.claroTexto}>{epi.descricao} · saldo {saldo}, mínimo {epi.estoque_minimo}</T>
            </View>
          </View>
        </Cartao>
      ))}
    </Equipe>
  );
}

