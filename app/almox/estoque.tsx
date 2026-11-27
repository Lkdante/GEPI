// Saldo por EPI, sempre somado das movimentações. Entrada manual até existir a fase A.
import { useState } from 'react';
import { View } from 'react-native';
import { transacao, useEstado, useRaiz } from '@/dados/store';
import { brl } from '@/dominio/compras';
import { entradaEstoque, receberPedido } from '@/dominio/operacoes';
import { saldoEPI } from '@/dominio/regras';
import { Botao, T } from '@/ui/base';
import { Campo, Cartao, Equipe, Secao } from '@/ui/equipe';
import { dataCurta } from '@/ui/formato';
import { Icone, Selo } from '@/ui/Icone';
import { cor } from '@/ui/tema';

export default function Estoque() {
  const e = useEstado();
  const { obra_id } = useRaiz();
  const [quantidades, setQuantidades] = useState<Record<string, string>>({});
  const aReceber = e.pedidos.filter((p) => p.obra_id === obra_id && p.situacao === 'emitido');
  const agora = new Date().toISOString();

  return (
    <Equipe perfis={['almoxarife']} titulo="Estoque de EPI">
      {aReceber.length > 0 ? <Secao>Pedidos a receber</Secao> : null}
      {aReceber.map((p) => {
        const atrasado = agora > p.prazo_prometido;
        return (
          <Cartao key={p.id}>
            <T tam={17} peso="extra" c={cor.fundo}>{e.fornecedores.find((f) => f.id === p.fornecedor_id)?.nome}</T>
            <T tam={14} c={cor.claroTexto}>
              {p.itens.map((i) => `${i.quantidade} × ${e.epis.find((x) => x.id === i.epi_id)?.descricao}`).join(', ')} · {brl(p.total)}
            </T>
            <T tam={14} peso="forte" c={atrasado ? cor.marromTexto : cor.claroTexto}>
              {atrasado ? 'Atrasado: era para ' : 'Prometido para '}{dataCurta(p.prazo_prometido)}
            </T>
            <Botao
              titulo="Recebido: dar entrada"
              variante="verde"
              alto={52}
              tam={15}
              onPress={() => transacao((est, ctx) => receberPedido(est, ctx, p.id))}
            />
          </Cartao>
        );
      })}
      {aReceber.length > 0 ? <Secao>Saldo</Secao> : null}
      {e.epis.map((epi) => {
        const saldo = saldoEPI(e, epi.id, obra_id!);
        const baixo = saldo < epi.estoque_minimo;
        const texto = quantidades[epi.id] ?? '';
        const qtd = Number.parseInt(texto, 10);
        return (
          <Cartao key={epi.id}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Icone nome={epi.icone} tam={36} cor={cor.fundo} esp={1.8} />
              <View style={{ flex: 1 }}>
                <T tam={17} peso="extra" c={cor.fundo}>{epi.descricao}</T>
                <T tam={14} c={cor.claroTexto}>Mínimo {epi.estoque_minimo} · {epi.local}</T>
              </View>
              {baixo ? <Selo tipo="atencao" tam={24} /> : null}
              <T tam={24} peso="extra" c={baixo ? cor.marromTexto : cor.fundo}>{saldo}</T>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <View style={{ flex: 1 }}>
                <Campo
                  rotulo="Entrada"
                  keyboardType="number-pad"
                  value={texto}
                  onChangeText={(v) => setQuantidades({ ...quantidades, [epi.id]: v.replace(/\D/g, '') })}
                />
              </View>
              <Botao
                titulo="Lançar"
                alto={52}
                tam={15}
                disabled={!(qtd > 0)}
                onPress={() => {
                  transacao((est, ctx) => entradaEstoque(est, ctx, obra_id!, epi.id, qtd));
                  setQuantidades({ ...quantidades, [epi.id]: '' });
                }}
              />
            </View>
          </Cartao>
        );
      })}
    </Equipe>
  );
}
