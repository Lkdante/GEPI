// Executa schema.sql num Postgres real embutido (PGlite) e testa as garantias do
// banco. Uso: npm run test:schema
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const AGORA = '2026-10-31T12:00:00Z';
const uid = (n) => `00000000-0000-7000-8000-${String(n).padStart(12, '0')}`;

const EMPRESA_A = uid(1);
const EMPRESA_B = uid(2);
const EMPREITEIRA = uid(3);
const OBRA_A = uid(10);
const OBRA_A2 = uid(11);
const OBRA_B = uid(12);

await db.exec(`
  create role authenticated nologin;
  create schema auth;
  create function auth.jwt() returns jsonb language sql stable as
    $$ select coalesce(nullif(current_setting('test.jwt', true), ''), '{}')::jsonb $$;
  grant usage on schema auth to authenticated;
  grant execute on function auth.jwt() to authenticated;
`);
await db.exec(readFileSync(new URL('./schema.sql', import.meta.url), 'utf8'));

const base = (id, empresa, obra) => ({
  id,
  empresa_id: empresa,
  obra_id: obra,
  criado_em: AGORA,
  atualizado_em: AGORA,
  criado_por: 'teste',
  dispositivo_id: 'disp',
});

async function inserir(tabela, linha) {
  const colunas = Object.keys(linha);
  const marcadores = colunas.map((_, i) => `$${i + 1}`);
  await db.query(
    `insert into public.${tabela} (${colunas.join(',')}) values (${marcadores.join(',')})`,
    Object.values(linha),
  );
}

/** Roda fn como usuário autenticado, sujeito ao RLS. */
async function como(claims, fn) {
  await db.exec(`begin; set local role authenticated; select set_config('test.jwt', '${JSON.stringify(claims)}', true);`);
  try {
    return await fn();
  } finally {
    await db.exec('rollback');
  }
}

const tecnicoA = { sub: 'renata', empresa_id: EMPRESA_A, obras: [OBRA_A], perfil: 'tecnico' };
const tecnicoB = { sub: 'outra', empresa_id: EMPRESA_B, obras: [OBRA_B], perfil: 'tecnico' };
const empreiteira = { sub: 'alfa', empresa_id: EMPRESA_A, obras: [OBRA_A], perfil: 'empreiteira', empregadora_id: EMPREITEIRA };

await inserir('empresas', { ...base(EMPRESA_A, EMPRESA_A, null), razao_social: 'A', tipo: 'construtora' });
await inserir('empresas', { ...base(EMPRESA_B, EMPRESA_B, null), razao_social: 'B', tipo: 'construtora' });
await inserir('empresas', { ...base(EMPREITEIRA, EMPRESA_A, null), razao_social: 'Alfa', tipo: 'empreiteira' });
await inserir('obras', { ...base(OBRA_A, EMPRESA_A, null), nome: 'Obra A' });
await inserir('obras', { ...base(OBRA_A2, EMPRESA_A, null), nome: 'Obra A2' });
await inserir('obras', { ...base(OBRA_B, EMPRESA_B, null), nome: 'Obra B' });
await inserir('frentes', { ...base(uid(20), EMPRESA_A, OBRA_A), nome: 'F', tipo_risco: 'altura' });
await inserir('frentes', { ...base(uid(21), EMPRESA_A, OBRA_A2), nome: 'F2', tipo_risco: 'geral' });
await inserir('funcoes', { ...base(uid(30), EMPRESA_A, null), nome: 'Servente' });
await inserir('epis', { ...base(uid(40), EMPRESA_A, null), tipo: 'cinto', descricao: 'Cinto', curto: 'cinto', icone: 'cinto', vida_util_dias: 365 });
await inserir('cas', { ...base(uid(41), EMPRESA_A, null), numero: '1', fabricante: 'X', epi_id: uid(40), situacao: 'valido', validade: '2027-01-01', ultima_consulta: AGORA, fonte: 't' });

const trabalhador = (id, obra, frente, empregadora, nome) => ({
  ...base(id, EMPRESA_A, obra),
  nome,
  matricula: nome,
  funcao_id: uid(30),
  empregadora_id: empregadora,
  epi_fornecido_por: 'construtora',
  frente_id: frente,
  tarefa: 'altura',
  cracha_token: `t-${id}`,
});
await inserir('trabalhadores', trabalhador(uid(50), OBRA_A, uid(20), EMPRESA_A, 'Propio'));
await inserir('trabalhadores', trabalhador(uid(51), OBRA_A, uid(20), EMPREITEIRA, 'Terceiro'));
await inserir('trabalhadores', trabalhador(uid(52), OBRA_A2, uid(21), EMPRESA_A, 'OutraObra'));

const movimento = (id, tipo, quantidade) => ({
  ...base(id, EMPRESA_A, OBRA_A),
  tipo,
  epi_id: uid(40),
  quantidade,
  origem: 'carga_inicial',
});
await inserir('movimentacoes', movimento(uid(60), 'entrada', 10));
await inserir('movimentacoes', movimento(uid(61), 'saida', -3));

const entrega = {
  ...base(uid(70), EMPRESA_A, OBRA_A),
  trabalhador_id: uid(50),
  epi_id: uid(40),
  ca_id: uid(41),
  motivo: 'admissao',
  data: AGORA,
  validade_uso: AGORA,
  assinatura: 'h',
  entregue_por: uid(99),
  fornecido_por: 'construtora',
};
await inserir('entregas', entrega);

test('empresa não enxerga dados de outra', async () => {
  const { rows } = await como(tecnicoB, () => db.query('select nome from public.trabalhadores'));
  assert.equal(rows.length, 0);
});

test('usuário só vê as obras permitidas', async () => {
  const { rows } = await como(tecnicoA, () => db.query('select nome from public.trabalhadores order by nome'));
  assert.deepEqual(rows.map((r) => r.nome), ['Propio', 'Terceiro']);
});

test('empreiteira só enxerga os próprios trabalhadores', async () => {
  const { rows } = await como(empreiteira, () => db.query('select nome from public.trabalhadores'));
  assert.deepEqual(rows.map((r) => r.nome), ['Terceiro']);
});

test('empreiteira não vê entrega de trabalhador da construtora', async () => {
  const { rows } = await como(empreiteira, () => db.query('select id from public.entregas'));
  assert.equal(rows.length, 0);
});

test('não grava para outra empresa', async () => {
  await assert.rejects(
    como(tecnicoB, () => inserir('movimentacoes', movimento(uid(62), 'entrada', 1))),
    /row-level security/,
  );
});

test('saldo vem da soma das movimentações', async () => {
  const { rows } = await como(tecnicoA, () => db.query('select saldo from public.saldo_epi'));
  assert.deepEqual(rows, [{ saldo: 7 }]);
});

test('o saldo também respeita o isolamento', async () => {
  const { rows } = await como(tecnicoB, () => db.query('select saldo from public.saldo_epi'));
  assert.equal(rows.length, 0);
});

test('movimentação é só inserção', async () => {
  await assert.rejects(
    db.query('update public.movimentacoes set quantidade = 0 where id = $1', [uid(60)]),
    /só inserção/,
  );
  await assert.rejects(db.query('delete from public.movimentacoes where id = $1', [uid(60)]), /só inserção/);
});

test('entrega aceita registrar substituição, mas não mudar a evidência', async () => {
  await db.query('update public.entregas set devolucao_motivo = $1 where id = $2', ['perdeu', uid(70)]);
  await assert.rejects(
    db.query('update public.entregas set assinatura = $1 where id = $2', ['falsa', uid(70)]),
    /substituição/,
  );
  await assert.rejects(db.query('delete from public.entregas where id = $1', [uid(70)]), /apagada/);
});

test('bloqueio exige humano identificado', async () => {
  const checkin = {
    ...base(uid(80), EMPRESA_A, OBRA_A),
    trabalhador_id: uid(50),
    frente_id: uid(20),
    tarefa: 'altura',
    inicio: AGORA,
    resultado: 'bloqueado',
  };
  await assert.rejects(inserir('checkins', checkin), /bloqueio_tem_humano/);
  await inserir('checkins', { ...checkin, revisado_por: uid(99) });
});

test('trilha é append-only até para quem pode lê-la', async () => {
  await assert.rejects(como(tecnicoA, () => db.query('delete from public.audit_log')), /permission denied/);
  await assert.rejects(db.query('delete from public.audit_log'), /só inserção/);
  await assert.rejects(db.query(`update public.audit_log set quem = 'x'`), /só inserção/);
});

test('trilha fica encadeada e o trabalhador comum não a lê', async () => {
  const { rows } = await db.query(
    `select hash, hash_anterior from public.audit_log where empresa_id = $1 order by id`,
    [EMPRESA_A],
  );
  assert.ok(rows.length >= 5);
  assert.equal(rows[0].hash_anterior, '0'.repeat(64));
  for (let i = 1; i < rows.length; i++) assert.equal(rows[i].hash_anterior, rows[i - 1].hash);

  const leitura = await como({ ...tecnicoA, perfil: 'encarregado' }, () => db.query('select id from public.audit_log'));
  assert.equal(leitura.rows.length, 0);
});
