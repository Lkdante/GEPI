// Cotações: fornecedores, preços por EPI e leitura de cotação colada (WhatsApp, e-mail).
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { transacao, useEstado } from '@/dados/store';
import { avaliarCotacoes, brl, nomeEPI, riscoFornecedor, validarExtracao, type Extracao } from '@/dominio/compras';
import { atualizarCondicoesFornecedor, registrarCotacao } from '@/dominio/operacoes';
import { extratorRegras } from '@/ia/extrator';
import { Botao, T } from '@/ui/base';
import { Cartao, Chip, Equipe, Secao, Vazio } from '@/ui/equipe';
import { Icone } from '@/ui/Icone';
import { cor, fonte } from '@/ui/tema';

const EXEMPLO = `Boa tarde! Segue orçamento:
Luva vaqueta CA 90013 cx c/ 12 pares R$ 90,00
Capacete aba frontal CA 90010 R$ 43,50 un
Bota PVC R$ 79,00
Frete: R$ 50,00
Prazo de entrega: 2 dias`;

export default function Cotacoes() {
  const e = useEstado();
  const agora = new Date().toISOString();
  const fornecedores = e.fornecedores.filter((f) => !f.excluido_em);
  const avaliadas = avaliarCotacoes(e, agora);
  const [forn, setForn] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [lido, setLido] = useState<{ x: Extracao; v: ReturnType<typeof validarExtracao> } | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);

  const ler = () => {
    const x = extratorRegras.extrair(texto, e.epis);
    setLido({ x, v: validarExtracao(e, forn!, x, agora) });
    setSalvo(null);
  };
  const salvar = () => {
    const { x, v } = lido!;
    transacao((est, ctx) => {
      for (const c of v.cotacoes) registrarCotacao(est, ctx, c);
      const patch: { frete_fixo?: number; pedido_minimo?: number } = {};
      if (x.frete !== null) patch.frete_fixo = x.frete;
      if (x.pedido_minimo !== null) patch.pedido_minimo = x.pedido_minimo;
      if (Object.keys(patch).length > 0) atualizarCondicoesFornecedor(est, ctx, forn!, patch);
    });
    setSalvo(`${v.cotacoes.length} preço(s) salvos. Valem por 15 dias.`);
    setLido(null);
    setTexto('');
  };

  return (
    <Equipe perfis={['gestor']} titulo="Cotações">
      <Secao>Fornecedores</Secao>
      {fornecedores.map((f) => {
        const r = riscoFornecedor(e, f.id);
        return (
          <Cartao key={f.id} gap={2}>
            <T tam={16} peso="extra" c={cor.fundo}>{f.nome}</T>
            <T tam={14} c={cor.claroTexto}>
              Frete {brl(f.frete_fixo)} · pedido mínimo {f.pedido_minimo > 0 ? brl(f.pedido_minimo) : 'nenhum'}
            </T>
            <T tam={14} c={r.prob > 0.3 ? cor.marromTexto : cor.claroTexto}>
              Risco de atraso estimado: {Math.round(r.prob * 100)}%
              {r.recebidos === 0 ? ' (sem histórico: começa na média de 20%)' : ` (${r.atrasos} atraso${r.atrasos === 1 ? '' : 's'} em ${r.recebidos} pedido${r.recebidos === 1 ? '' : 's'})`}
            </T>
          </Cartao>
        );
      })}

      <Secao>Colar cotação</Secao>
      <Cartao gap={10}>
        <T tam={14} c={cor.claroTexto}>Escolha o fornecedor e cole a mensagem dele. A leitura é feita no aparelho; nada é salvo antes de você conferir.</T>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          {fornecedores.map((f) => (
            <Chip key={f.id} titulo={f.nome} ativo={forn === f.id} onPress={() => { setForn(f.id); setLido(null); }} />
          ))}
        </View>
        <TextInput
          accessibilityLabel="Texto da cotação"
          multiline
          value={texto}
          onChangeText={(t) => { setTexto(t); setLido(null); }}
          placeholder={EXEMPLO}
          placeholderTextColor={cor.borda}
          style={{ minHeight: 150, borderRadius: 12, borderWidth: 1, borderColor: cor.borda, backgroundColor: cor.branco, padding: 12, fontFamily: fonte.medio, fontSize: 15, color: cor.fundo, textAlignVertical: 'top' }}
        />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Botao titulo="Usar exemplo" variante="preto" alto={52} tam={15} style={{ flex: 1 }} onPress={() => { setTexto(EXEMPLO); setLido(null); }} />
          <Botao titulo="Ler cotação" alto={52} tam={15} style={{ flex: 1 }} disabled={!forn || !texto.trim()} onPress={ler} />
        </View>
        {salvo ? <T tam={14} peso="forte" c={cor.verde}>{salvo}</T> : null}
        {lido ? (
          <View style={{ gap: 6 }}>
            {lido.v.cotacoes.map((c) => (
              <View key={c.epi_id} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Icone nome="check" tam={18} cor={cor.verde} />
                <T tam={14} c={cor.fundo} style={{ flex: 1 }}>
                  {nomeEPI(e.epis, c.epi_id)} · {brl(c.preco_unitario)} · {c.prazo_dias} dias · CA {e.cas.find((x) => x.id === c.ca_id)?.numero}
                </T>
              </View>
            ))}
            {lido.v.pendencias.map((p) => (
              <View key={p.texto} style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                <Icone nome="alerta" tam={18} cor={cor.marromTexto} />
                <T tam={14} c={cor.marromTexto} style={{ flex: 1 }}>{p.texto}: {p.motivo}</T>
              </View>
            ))}
            {lido.x.frete !== null || lido.x.pedido_minimo !== null ? (
              <T tam={14} c={cor.claroTexto}>
                {lido.x.frete !== null ? `Frete lido: ${brl(lido.x.frete)}. ` : ''}
                {lido.x.pedido_minimo !== null ? `Pedido mínimo lido: ${brl(lido.x.pedido_minimo)}.` : ''}
              </T>
            ) : null}
            <Botao
              titulo={`Salvar ${lido.v.cotacoes.length} preço${lido.v.cotacoes.length === 1 ? '' : 's'}`}
              variante="verde"
              alto={52}
              tam={15}
              disabled={lido.v.cotacoes.length === 0}
              onPress={salvar}
            />
          </View>
        ) : null}
      </Cartao>

      <Secao>Preços por EPI</Secao>
      {e.epis.map((epi) => {
        const doEpi = avaliadas
          .filter((a) => a.cotacao.epi_id === epi.id)
          .sort((x, y) => x.cotacao.preco_unitario - y.cotacao.preco_unitario);
        return (
          <Cartao key={epi.id} gap={4}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Icone nome={epi.icone} tam={26} cor={cor.fundo} esp={1.8} />
              <T tam={16} peso="extra" c={cor.fundo}>{epi.descricao}</T>
            </View>
            {doEpi.length === 0 ? <Vazio>Sem cotação.</Vazio> : null}
            {doEpi.map((a) => (
              <View key={a.cotacao.id} style={{ borderTopWidth: 1, borderTopColor: cor.claroBorda, paddingTop: 4 }}>
                <T tam={14} c={a.usavel ? cor.fundo : cor.claroTexto} style={a.usavel ? undefined : { textDecorationLine: 'line-through' }}>
                  {fornecedores.find((f) => f.id === a.cotacao.fornecedor_id)?.nome} · {brl(a.cotacao.preco_unitario)} · {a.cotacao.prazo_dias} dias
                  {a.cotacao.quantidade_disponivel !== null ? ` · ${a.cotacao.quantidade_disponivel} disponíveis` : ''}
                </T>
                {a.motivo ? <T tam={13} c={cor.marromTexto}>{a.motivo}</T> : null}
              </View>
            ))}
          </Cartao>
        );
      })}
      <T tam={12} c={cor.claroTexto}>Fornecedores, preços e histórico de pedidos desta demonstração são fictícios.</T>
    </Equipe>
  );
}
