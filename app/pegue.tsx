// Tela 5 — Pegue no almoxarifado: linguagem de cuidado, nunca de infração.
import { Redirect, useRouter } from 'expo-router';
import { View } from 'react-native';
import { useEstado, useRaiz } from '@/dados/store';
import { requisicaoAberta, saldoEPI } from '@/dominio/regras';
import { ROTULO_TAREFA } from '@/dominio/tipos';
import { Botao, Rolagem, T, Tela, useFala } from '@/ui/base';
import { Icone, Selo } from '@/ui/Icone';
import { cor } from '@/ui/tema';

export default function Pegue() {
  const router = useRouter();
  const e = useEstado();
  const { fluxo } = useRaiz();
  useFala('Pegue no almoxarifado. Leve seu crachá. Quando receber, o app libera você.');
  if (!fluxo) return <Redirect href="/" />;

  const t = e.trabalhadores.find((x) => x.id === fluxo.trabalhador_id)!;
  const pedidos = e.epis
    .map((epi) => ({ epi, req: requisicaoAberta(e, t.id, epi.id) }))
    .filter((x) => x.req);
  const daEmpreiteira = t.epi_fornecido_por === 'empreiteira';
  const empreiteira = e.empresas.find((x) => x.id === t.empregadora_id);

  return (
    <Tela>
      <View style={{ backgroundColor: cor.laranjaEscuro, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 20, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
        <Icone nome="casa" tam={40} />
        <View style={{ flexShrink: 1 }}>
          <T tam={24} peso="extra">{daEmpreiteira ? `Pegue com a ${empreiteira?.razao_social}` : 'Pegue no almoxarifado'}</T>
          <T tam={15} c={cor.laranjaPele} style={{ marginTop: 2 }}>Antes de subir, busque o item</T>
        </View>
      </View>

      <Rolagem style={{ padding: 20, gap: 16 }}>
        {pedidos.map(({ epi, req }) => {
          const saldo = saldoEPI(e, epi.id, t.obra_id!);
          const semEstoque = req!.status === 'aguardando_compra';
          return (
            <View key={epi.id} style={{ gap: 12 }}>
              <View style={{ borderRadius: 20, backgroundColor: cor.branco, padding: 20, flexDirection: 'row', alignItems: 'center', gap: 18 }}>
                <Icone nome={epi.icone} tam={84} cor={cor.fundo} esp={1.6} />
                <View style={{ flexShrink: 1 }}>
                  <T tam={22} peso="extra" c={cor.fundo}>{epi.descricao}</T>
                  <T tam={15} c={cor.apagado} style={{ marginTop: 6 }}>Para: {ROTULO_TAREFA[t.tarefa]}</T>
                </View>
              </View>
              <View style={{ borderRadius: 16, backgroundColor: cor.superficie, padding: 18, gap: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <Selo tipo="ok" tam={28} />
                  <T tam={18} peso="forte" style={{ flexShrink: 1 }}>
                    {daEmpreiteira ? 'Pedido enviado à empreiteira' : 'Pedido enviado ao almoxarife'}
                  </T>
                </View>
                {daEmpreiteira ? null : (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      {semEstoque ? <Selo tipo="atencao" tam={28} /> : <Icone nome="relogio" tam={28} cor={cor.laranja} />}
                      <T tam={18} peso="forte" style={{ flexShrink: 1 }}>
                        {semEstoque ? 'Sem estoque. Fale com o encarregado' : `Tem ${saldo} no estoque`}
                      </T>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Icone nome="pino" tam={28} cor="#A3A3A3" />
                      <T tam={18} peso="forte" style={{ flexShrink: 1 }}>{epi.local}</T>
                    </View>
                  </>
                )}
              </View>
            </View>
          );
        })}
        <View style={{ padding: 14, borderRadius: 14, borderWidth: 2, borderStyle: 'dashed', borderColor: '#525252', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Icone nome="audio" tam={26} cor={cor.laranja} />
          <T tam={15} c={cor.textoSuave} style={{ flexShrink: 1 }}>Leve seu crachá. Quando receber, o app libera você.</T>
        </View>
      </Rolagem>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 28 }}>
        <Botao titulo="Entendi" variante="laranja" alto={76} tam={20} onPress={() => router.replace('/final')} />
      </View>
    </Tela>
  );
}
