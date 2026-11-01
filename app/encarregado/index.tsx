// Minha equipe hoje: quem pode subir, e os pedidos que vão para a empreiteira.
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useEstado, useRaiz } from '@/dados/store';
import { metricas, statusDoDia, trabalhadoresDaObra } from '@/dominio/regras';
import { ROTULO_TAREFA } from '@/dominio/tipos';
import { Botao, T } from '@/ui/base';
import { Cartao, Equipe, Secao, Status, Tile } from '@/ui/equipe';
import { cor } from '@/ui/tema';

export default function MinhaEquipe() {
  const router = useRouter();
  const e = useEstado();
  const { obra_id } = useRaiz();
  const agora = new Date().toISOString();
  const m = metricas(e, obra_id!, agora);
  const paraEmpreiteira = e.requisicoes.filter(
    (r) => r.obra_id === obra_id && r.para_quem === 'empreiteira' && r.status === 'aberta',
  );
  const aguardandoCompra = e.requisicoes.filter(
    (r) => r.obra_id === obra_id && r.status === 'aguardando_compra',
  );

  return (
    <Equipe
      perfis={['encarregado']}
      titulo="Minha equipe hoje"
      resumo={
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Tile valor={m.liberados} rotulo="liberados" fundo={cor.verdeEscuro} texto={cor.verdePele} />
          <Tile valor={m.pendentes} rotulo="pendentes" fundo={cor.marrom} texto={cor.laranjaPele} />
          <Tile valor={m.sem_checkin} rotulo="sem check-in" fundo={cor.superficie2} texto={cor.textoSuave} />
        </View>
      }
    >
      {aguardandoCompra.length > 0 ? (
        <Cartao>
          <T tam={16} peso="extra" c={cor.fundo}>EPI sem estoque</T>
          {aguardandoCompra.map((r) => {
            const t = e.trabalhadores.find((x) => x.id === r.trabalhador_id)!;
            const epi = e.epis.find((x) => x.id === r.epi_id)!;
            return <T key={r.id} tam={14} c={cor.claroTexto}>{t.nome}: {epi.descricao}. Troque a tarefa até o item chegar.</T>;
          })}
        </Cartao>
      ) : null}

      {trabalhadoresDaObra(e, obra_id!).map((t) => {
        const frente = e.frentes.find((f) => f.id === t.frente_id);
        return (
          <Pressable key={t.id} accessibilityRole="link" onPress={() => router.push(`/encarregado/trabalhador/${t.id}`)}>
            <Cartao>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <T tam={17} peso="extra" c={cor.fundo}>{t.nome}</T>
                  <T tam={14} c={cor.claroTexto}>{ROTULO_TAREFA[t.tarefa]} · {frente?.nome}</T>
                </View>
                <Status status={statusDoDia(e, t.id, agora)} />
              </View>
            </Cartao>
          </Pressable>
        );
      })}

      {paraEmpreiteira.length > 0 ? <Secao>Pedidos com a empreiteira</Secao> : null}
      {paraEmpreiteira.map((r) => {
        const t = e.trabalhadores.find((x) => x.id === r.trabalhador_id)!;
        const epi = e.epis.find((x) => x.id === r.epi_id)!;
        const empresa = e.empresas.find((x) => x.id === t.empregadora_id);
        return (
          <Cartao key={r.id}>
            <T tam={16} peso="extra" c={cor.fundo}>{epi.descricao} · {t.nome}</T>
            <T tam={14} c={cor.claroTexto}>Responsável: {empresa?.razao_social}</T>
            <Botao titulo="Registrar entrega da empreiteira" alto={52} tam={15} onPress={() => router.push(`/almox/entrega?req=${r.id}`)} />
          </Cartao>
        );
      })}
    </Equipe>
  );
}
