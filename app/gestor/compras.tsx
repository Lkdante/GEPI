// Compras: o motor de cotação escolhe de quem comprar o quê (src/dominio/compras.ts).
// Tudo aqui é calculado na hora a partir das solicitações e cotações gravadas.
import { useState } from 'react';
import { View } from 'react-native';
import { transacao, useEstado, useRaiz } from '@/dados/store';
import {
  analisarCompra,
  brl,
  motivosDoPlano,
  nomeEPI,
  PARAMETROS_PADRAO,
  SemSolucao,
  type AnaliseCompra,
  type Parametros,
  type Plano,
} from '@/dominio/compras';
import { emitirPedidos } from '@/dominio/operacoes';
import type { Estado } from '@/dominio/tipos';
import { Botao, T } from '@/ui/base';
import { Cartao, Chip, Equipe, Metrica, Secao, Vazio } from '@/ui/equipe';
import { dataCurta } from '@/ui/formato';
import { Icone } from '@/ui/Icone';
import { cor } from '@/ui/tema';

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Passo({ rotulo, valor, onMudar, descricao }: { rotulo: string; valor: string; descricao: string; onMudar: (s: 1 | -1) => void }) {
  return (
    <View style={{ gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <T tam={15} c={cor.fundo} style={{ flex: 1 }}>{rotulo}</T>
        <Botao titulo="−" variante="preto" alto={44} tam={18} onPress={() => onMudar(-1)} accessibilityLabel={`Diminuir ${rotulo}`} />
        <T tam={17} peso="extra" c={cor.fundo} style={{ width: 92, textAlign: 'center' }}>{valor}</T>
        <Botao titulo="+" variante="preto" alto={44} tam={18} onPress={() => onMudar(1)} accessibilityLabel={`Aumentar ${rotulo}`} />
      </View>
      <T tam={13} c={cor.claroTexto}>{descricao}</T>
    </View>
  );
}

function PlanoPorFornecedor({ e, plano, a }: { e: Estado; plano: Plano; a: AnaliseCompra }) {
  return (
    <>
      {plano.fornecedores.map((fid) => {
        const f = e.fornecedores.find((x) => x.id === fid)!;
        const itens = plano.alocacoes.filter((x) => x.fornecedor_id === fid);
        const material = itens.reduce((s, x) => s + x.quantidade * x.preco_unitario, 0);
        const risco = a.risco[fid];
        return (
          <Cartao key={fid} gap={6}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icone nome="caixa" tam={26} cor={cor.fundo} esp={1.8} />
              <T tam={17} peso="extra" c={cor.fundo} style={{ flex: 1 }}>{f.nome}</T>
              <T tam={17} peso="extra" c={cor.fundo}>{brl(material + f.frete_fixo)}</T>
            </View>
            <T tam={13} c={cor.claroTexto}>
              Risco de atraso {pct(risco.prob)} ({risco.atrasos} atraso{risco.atrasos === 1 ? '' : 's'} em {risco.recebidos} pedido{risco.recebidos === 1 ? '' : 's'}) · frete {brl(f.frete_fixo)}
            </T>
            {itens.map((x) => (
              <View key={x.cotacao_id} style={{ flexDirection: 'row', gap: 8, borderTopWidth: 1, borderTopColor: cor.claroBorda, paddingTop: 6 }}>
                <Icone nome={e.epis.find((p) => p.id === x.epi_id)?.icone ?? 'caixa'} tam={22} cor={cor.fundo} esp={1.8} />
                <T tam={15} c={cor.fundo} style={{ flex: 1 }}>
                  {x.quantidade} × {nomeEPI(e.epis, x.epi_id)} · {brl(x.preco_unitario)} · {x.prazo_dias} dia{x.prazo_dias === 1 ? '' : 's'}
                </T>
                <T tam={15} peso="forte" c={cor.fundo}>{brl(x.quantidade * x.preco_unitario)}</T>
              </View>
            ))}
          </Cartao>
        );
      })}
    </>
  );
}

export default function Compras() {
  const e = useEstado();
  const { obra_id } = useRaiz();
  const [p, setP] = useState<Parametros>(PARAMETROS_PADRAO);
  const [comparar, setComparar] = useState(false);
  const agora = new Date().toISOString();
  const nome = (id: string) => e.fornecedores.find((f) => f.id === id)?.nome ?? id;

  let a: AnaliseCompra | null = null;
  let erro: string | null = null;
  try {
    a = analisarCompra(e, obra_id!, agora, p);
  } catch (x) {
    if (!(x instanceof SemSolucao)) throw x;
    erro = x.message;
  }
  const aCaminho = e.pedidos.filter((x) => x.obra_id === obra_id && x.situacao === 'emitido');
  const nForn = e.fornecedores.filter((f) => !f.excluido_em).length;

  return (
    <Equipe perfis={['gestor']} titulo="Compras de EPI">
      <Secao>O que comprar</Secao>
      {!a && !erro ? <Vazio>Nenhuma solicitação de compra em aberto nesta obra.</Vazio> : null}
      {a ? (
        <Cartao gap={4}>
          {a.itens.map((i) => (
            <T key={i.epi_id} tam={15} c={cor.fundo}>
              {i.quantidade} × {nomeEPI(e.epis, i.epi_id)} <T tam={13} c={cor.claroTexto}>· entregar em até {i.prazo_max_dias} dias</T>
            </T>
          ))}
        </Cartao>
      ) : null}

      {a || erro ? (
        <>
          <Secao>Regras da compra</Secao>
          <Cartao gap={12}>
            <Passo
              rotulo="Peso do risco de atraso"
              valor={pct(p.peso_risco)}
              descricao="Quanto do valor se perde se o pedido atrasar. 0% = só preço e frete."
              onMudar={(s) => setP({ ...p, peso_risco: Math.min(1, Math.max(0, Math.round((p.peso_risco + s * 0.05) * 100) / 100)) })}
            />
            <Passo
              rotulo="Máximo de fornecedores"
              valor={p.max_fornecedores === null ? 'Sem limite' : String(p.max_fornecedores)}
              descricao="Menos fornecedores = menos pedidos para acompanhar."
              onMudar={(s) => {
                const atual = p.max_fornecedores ?? nForn + 1;
                const novo = Math.max(1, atual + s);
                setP({ ...p, max_fornecedores: novo > nForn ? null : novo });
              }}
            />
            <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
              <Chip titulo="Dividir EPI entre fornecedores" ativo={p.permitir_divisao} onPress={() => setP({ ...p, permitir_divisao: true })} />
              <Chip titulo="Cada EPI de um só" ativo={!p.permitir_divisao} onPress={() => setP({ ...p, permitir_divisao: false })} />
            </View>
          </Cartao>
        </>
      ) : null}

      {erro ? (
        <Cartao>
          <T tam={16} peso="extra" c={cor.marromTexto}>Sem combinação possível</T>
          <T tam={14} c={cor.claroTexto}>{erro}</T>
        </Cartao>
      ) : null}

      {a && a.otimo.alocacoes.length > 0 ? (
        <>
          <Secao>Recomendação</Secao>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            <Metrica valor={brl(a.otimo.desembolso)} rotulo="a pagar" />
            <Metrica valor={brl(a.otimo.frete)} rotulo="de frete" />
            <Metrica valor={a.otimo.fornecedores.length} rotulo={a.otimo.fornecedores.length === 1 ? 'fornecedor' : 'fornecedores'} />
          </View>
          <Cartao gap={4}>
            {motivosDoPlano(a).map((m) => (
              <View key={m} style={{ flexDirection: 'row', gap: 6 }}>
                <Icone nome="check" tam={18} cor={cor.verde} />
                <T tam={14} c={cor.fundo} style={{ flex: 1 }}>{m}</T>
              </View>
            ))}
            {a.otimo.risco > 0 ? (
              <T tam={13} c={cor.claroTexto}>
                O motor também pesa {brl(a.otimo.risco)} de custo esperado de atraso. Esse valor não é pago: é o preço que a regra dá à chance de atrasar.
              </T>
            ) : null}
          </Cartao>
          <PlanoPorFornecedor e={e} plano={a.otimo} a={a} />
          <Botao
            titulo={`Emitir ${a.otimo.fornecedores.length} pedido${a.otimo.fornecedores.length === 1 ? '' : 's'}`}
            variante="verde"
            onPress={() => transacao((est, ctx) => emitirPedidos(est, ctx, obra_id!, a!.otimo, a!.itens))}
          />

          <Botao
            titulo={comparar ? 'Esconder a compra item a item' : 'Comparar com o mais barato de cada EPI'}
            variante="preto"
            alto={52}
            tam={15}
            onPress={() => setComparar(!comparar)}
          />
          {comparar ? (
            <>
              <Cartao gap={4}>
                <T tam={15} c={cor.fundo}>
                  Mais barato de cada EPI: {brl(a.base.desembolso)} a pagar, {brl(a.base.frete)} de frete, {a.base.fornecedores.length} fornecedores
                  {a.base.risco > 0 ? ` e ${brl(a.base.risco)} de custo esperado de atraso` : ''}.
                </T>
                {a.base.avisos.map((v) => (
                  <T key={v} tam={14} peso="forte" c={cor.marromTexto}>{v}</T>
                ))}
              </Cartao>
              <PlanoPorFornecedor e={e} plano={a.base} a={a} />
            </>
          ) : null}
        </>
      ) : null}

      {a && a.avaliadas.some((x) => !x.usavel) ? (
        <>
          <Secao>Cotações fora da conta</Secao>
          {a.avaliadas.filter((x) => !x.usavel).map((x) => (
            <Cartao key={x.cotacao.id} gap={2}>
              <T tam={15} peso="forte" c={cor.fundo}>{nome(x.cotacao.fornecedor_id)} · {nomeEPI(e.epis, x.cotacao.epi_id)} · {brl(x.cotacao.preco_unitario)}</T>
              <T tam={14} c={cor.marromTexto}>{x.motivo}</T>
            </Cartao>
          ))}
        </>
      ) : null}

      <Secao>Pedidos a caminho</Secao>
      {aCaminho.length === 0 ? <Vazio>Nenhum pedido aguardando entrega.</Vazio> : null}
      {aCaminho.map((x) => (
        <Cartao key={x.id} gap={2}>
          <T tam={15} peso="extra" c={cor.fundo}>{nome(x.fornecedor_id)} · {brl(x.total)}</T>
          <T tam={14} c={cor.claroTexto}>
            {x.itens.map((i) => `${i.quantidade} × ${nomeEPI(e.epis, i.epi_id)}`).join(', ')} · prometido para {dataCurta(x.prazo_prometido)}
          </T>
        </Cartao>
      ))}
    </Equipe>
  );
}
