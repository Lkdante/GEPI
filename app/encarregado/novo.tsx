// Cadastro em 1 minuto no dia da integração. Sem CPF: o app não precisa dele, e
// dado que não existe não vaza.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { transacao, useEstado, useRaiz } from '@/dados/store';
import { inserir } from '@/dominio/operacoes';
import type { Tarefa } from '@/dominio/tipos';
import { ROTULO_TAREFA } from '@/dominio/tipos';
import { Botao, T } from '@/ui/base';
import { Campo, Chip, Equipe, Secao } from '@/ui/equipe';
import { cor } from '@/ui/tema';

export default function NovoTrabalhador() {
  const router = useRouter();
  const e = useEstado();
  const { obra_id } = useRaiz();
  const frentes = e.frentes.filter((f) => f.obra_id === obra_id);

  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [funcao, setFuncao] = useState(e.funcoes[0].id);
  const [empresa, setEmpresa] = useState(e.empresas[0].id);
  const [tarefa, setTarefa] = useState<Tarefa>('geral');
  const [frente, setFrente] = useState(frentes[0]?.id);

  const repetida = e.trabalhadores.some((t) => t.matricula === matricula.trim());
  const valido = nome.trim().length >= 3 && matricula.trim().length > 0 && !repetida && !!frente;

  function salvar() {
    const novo = transacao((est, ctx) =>
      inserir(est, ctx, 'trabalhadores', obra_id, {
        nome: nome.trim(),
        matricula: matricula.trim(),
        funcao_id: funcao,
        empregadora_id: empresa,
        epi_fornecido_por: est.empresas.find((x) => x.id === empresa)?.tipo === 'empreiteira' ? 'empreiteira' : 'construtora',
        frente_id: frente!,
        tarefa,
        cracha_token: ctx.uuid(),
        cenario_demo: null,
      }),
    );
    router.replace(`/encarregado/cracha/${novo.id}`);
  }

  return (
    <Equipe perfis={['encarregado']} titulo="Novo trabalhador">
      <Campo rotulo="Nome" value={nome} onChangeText={setNome} autoCapitalize="words" />
      <Campo rotulo="Matrícula" value={matricula} onChangeText={setMatricula} />
      {repetida ? <T tam={14} c={cor.marromTexto}>Esta matrícula já existe.</T> : null}
      <Secao>Função</Secao>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {e.funcoes.map((f) => <Chip key={f.id} titulo={f.nome} ativo={f.id === funcao} onPress={() => setFuncao(f.id)} />)}
      </View>
      <Secao>Empresa</Secao>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {e.empresas.map((x) => <Chip key={x.id} titulo={x.razao_social} ativo={x.id === empresa} onPress={() => setEmpresa(x.id)} />)}
      </View>
      <Secao>Tarefa</Secao>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(Object.keys(ROTULO_TAREFA) as Tarefa[]).map((k) => <Chip key={k} titulo={ROTULO_TAREFA[k]} ativo={k === tarefa} onPress={() => setTarefa(k)} />)}
      </View>
      <Secao>Frente</Secao>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {frentes.map((f) => <Chip key={f.id} titulo={f.nome} ativo={f.id === frente} onPress={() => setFrente(f.id)} />)}
      </View>
      <Botao titulo="Salvar e gerar crachá" alto={64} disabled={!valido} onPress={salvar} />
    </Equipe>
  );
}
