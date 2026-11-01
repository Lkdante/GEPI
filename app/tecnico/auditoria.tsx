// Trilha encadeada por hash: qualquer linha alterada quebra a verificação.
import { View } from 'react-native';
import { useEstado } from '@/dados/store';
import { verificarCadeia } from '@/dominio/operacoes';
import { T } from '@/ui/base';
import { Cartao, Equipe, Secao } from '@/ui/equipe';
import { Selo } from '@/ui/Icone';
import { cor } from '@/ui/tema';

const ULTIMAS = 30;

export default function Auditoria() {
  const e = useEstado();
  const quebra = verificarCadeia(e.audit);

  return (
    <Equipe perfis={['tecnico']} titulo="Trilha de auditoria">
      <Cartao>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Selo tipo={quebra === null ? 'ok' : 'atencao'} tam={32} />
          <View style={{ flex: 1 }}>
            <T tam={17} peso="extra" c={cor.fundo}>
              {quebra === null ? 'Cadeia íntegra' : `Cadeia quebrada na linha ${quebra + 1}`}
            </T>
            <T tam={14} c={cor.claroTexto}>{e.audit.length} registros verificados</T>
          </View>
        </View>
      </Cartao>
      <Secao>Últimos registros</Secao>
      {[...e.audit].reverse().slice(0, ULTIMAS).map((l) => (
        <Cartao key={l.id} gap={2}>
          <T tam={15} peso="forte" c={cor.fundo}>{l.acao}</T>
          <T tam={13} c={cor.claroTexto}>{new Date(l.quando).toLocaleString('pt-BR')}</T>
          <T tam={12} c={cor.claroTexto} linhas={1}>{l.hash}</T>
        </Cartao>
      ))}
    </Equipe>
  );
}
