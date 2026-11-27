// Painel do gestor: métricas calculadas dos registros, sem número estimado.
import { useRouter } from 'expo-router';
import { View } from 'react-native';
import { transacao, useEstado, useRaiz } from '@/dados/store';
import { brl, itensParaComprar } from '@/dominio/compras';
import { episAbaixoDoMinimo, metricas } from '@/dominio/regras';
import type { Config } from '@/dominio/tipos';
import { Botao, T } from '@/ui/base';
import { Cartao, Equipe, Metrica, Secao, Tile, Vazio } from '@/ui/equipe';
import { confianca, minutos, segundos } from '@/ui/formato';
import { cor } from '@/ui/tema';

function Ajuste({
  rotulo,
  valor,
  onMudar,
}: {
  rotulo: string;
  valor: string;
  onMudar: (sinal: 1 | -1) => void;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <T tam={15} c={cor.fundo} style={{ flex: 1 }}>{rotulo}</T>
      <Botao titulo="−" variante="preto" alto={44} tam={18} onPress={() => onMudar(-1)} accessibilityLabel={`Diminuir ${rotulo}`} />
      <T tam={17} peso="extra" c={cor.fundo} style={{ width: 64, textAlign: 'center' }}>{valor}</T>
      <Botao titulo="+" variante="preto" alto={44} tam={18} onPress={() => onMudar(1)} accessibilityLabel={`Aumentar ${rotulo}`} />
    </View>
  );
}

const arredonda = (n: number) => Math.round(n * 100) / 100;

export default function Painel() {
  const e = useEstado();
  const router = useRouter();
  const { obra_id } = useRaiz();
  const agora = new Date().toISOString();
  const m = metricas(e, obra_id!, agora);
  const baixos = episAbaixoDoMinimo(e, obra_id!);
  const compras = itensParaComprar(e, obra_id!);
  const aCaminho = e.pedidos.filter((p) => p.obra_id === obra_id && p.situacao === 'emitido');
  const { config } = e;

  const ajustar = (patch: Partial<Config>) =>
    transacao((est) => {
      const novo = { ...est.config, ...patch };
      // O limite superior nunca cruza o inferior: a faixa de revisão humana sempre existe.
      if (novo.limite_inferior < novo.limite_superior && novo.limite_superior <= 0.99 && novo.limite_inferior >= 0.05) {
        est.config = novo;
      }
    });

  return (
    <Equipe
      perfis={['gestor']}
      titulo="Painel de segurança"
      resumo={
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Tile valor={m.liberados} rotulo="liberados" fundo={cor.verdeEscuro} texto={cor.verdePele} />
          <Tile valor={m.pendentes} rotulo="pendentes" fundo={cor.marrom} texto={cor.laranjaPele} />
          <Tile valor={m.bloqueados} rotulo="bloqueados" fundo={cor.superficie2} texto={cor.textoSuave} />
        </View>
      }
    >
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        <Metrica valor={`${Math.round(m.adesao * 100)}%`} rotulo="adesão ao check-in hoje" />
        <Metrica valor={segundos(m.mediana_checkin_s)} rotulo="check-in mediano hoje" />
        <Metrica valor={segundos(m.revisao_mediana_s)} rotulo="revisão mediana" />
        <Metrica valor={minutos(m.falta_ate_entrega_min)} rotulo="falta até a entrega" />
        <Metrica valor={m.fila} rotulo="exceções na fila" />
      </View>

      <Secao>EPI acabando</Secao>
      {baixos.length === 0 ? <Vazio>Nenhum EPI abaixo do mínimo.</Vazio> : null}
      {baixos.map(({ epi, saldo }) => (
        <Cartao key={epi.id} gap={2}>
          <T tam={16} peso="extra" c={cor.fundo}>{epi.descricao}</T>
          <T tam={14} c={cor.claroTexto}>Saldo {saldo}, mínimo {epi.estoque_minimo}</T>
        </Cartao>
      ))}

      <Secao>Compras</Secao>
      <Cartao>
        <T tam={16} peso="extra" c={cor.fundo}>
          {compras.length === 0 ? 'Nenhum EPI para comprar' : `${compras.length} EPI${compras.length === 1 ? '' : 's'} para comprar`}
        </T>
        <T tam={14} c={cor.claroTexto}>
          {compras.map((c) => `${c.quantidade} × ${e.epis.find((x) => x.id === c.epi_id)?.descricao}`).join(', ') || 'As solicitações aparecem aqui quando o estoque baixa ou falta EPI.'}
        </T>
        {aCaminho.length > 0 ? (
          <T tam={14} c={cor.claroTexto}>
            {aCaminho.length} pedido{aCaminho.length === 1 ? '' : 's'} a caminho ({brl(aCaminho.reduce((s, p) => s + p.total, 0))}).
          </T>
        ) : null}
        <Botao titulo="Ver plano de compra" alto={52} tam={15} onPress={() => router.push('/gestor/compras')} />
      </Cartao>

      <Secao>Limites da IA</Secao>
      <Cartao gap={10}>
        <Ajuste
          rotulo="Decisão automática acima de"
          valor={confianca(config.limite_superior)}
          onMudar={(s) => ajustar({ limite_superior: arredonda(config.limite_superior + s * 0.05) })}
        />
        <Ajuste
          rotulo="Não detectado abaixo de"
          valor={confianca(config.limite_inferior)}
          onMudar={(s) => ajustar({ limite_inferior: arredonda(config.limite_inferior + s * 0.05) })}
        />
        <Ajuste
          rotulo="Prazo de revisão (min)"
          valor={String(config.sla_revisao_min)}
          onMudar={(s) => ajustar({ sla_revisao_min: Math.max(1, config.sla_revisao_min + s) })}
        />
      </Cartao>
    </Equipe>
  );
}
