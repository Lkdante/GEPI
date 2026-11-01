-- GEPI: modelo de dados do ciclo do EPI (seção 5 do modelo do produto).
-- Ainda não está ligado ao app, que hoje grava só no aparelho.
--
-- Regras que este arquivo garante no banco, independentemente do cliente:
--   * isolamento por empresa, obra e empreiteira (row-level security);
--   * fatos só por inserção (movimentação, resposta, foto, detecção, revisão);
--   * entrega de EPI imutável, exceto os campos que registram a substituição;
--   * trilha de auditoria append-only, encadeada por hash;
--   * saldo nunca gravado: é uma view sobre as movimentações.
--
-- O token do usuário precisa trazer: empresa_id, obras (lista de uuid), perfil e,
-- para empreiteira, empregadora_id.

create schema if not exists gepi;

create or replace function gepi.claim(nome text) returns text
language sql stable as $$ select auth.jwt() ->> nome $$;

create or replace function gepi.empresa_atual() returns uuid
language sql stable as $$ select gepi.claim('empresa_id')::uuid $$;

create or replace function gepi.obra_permitida(obra uuid) returns boolean
language sql stable as $$
  select obra is null or obra::text in (select jsonb_array_elements_text(auth.jwt() -> 'obras'))
$$;

create table public.empresas (
  razao_social text not null,
  cnpj text,
  tipo text not null check (tipo in ('construtora', 'empreiteira'))
);

create table public.obras (
  nome text not null,
  endereco text,
  cno text,
  codigo_erp text,
  fuso text not null default 'America/Sao_Paulo'
);

create table public.frentes (
  nome text not null,
  tipo_risco text not null check (tipo_risco in ('altura', 'eletrica', 'escavacao', 'confinado', 'geral')),
  qr text
);

create table public.funcoes (
  nome text not null,
  cbo text
);

-- O PIN fica só no aparelho: nunca sobe para o servidor.
create table public.usuarios (
  nome text not null,
  perfil text not null check (perfil in ('encarregado', 'almoxarife', 'tecnico', 'gestor', 'admin')),
  obras uuid[] not null default '{}',
  registro_profissional text
);

create table public.trabalhadores (
  nome text not null,
  matricula text not null,
  funcao_id uuid not null,
  empregadora_id uuid not null,
  epi_fornecido_por text not null check (epi_fornecido_por in ('construtora', 'empreiteira')),
  frente_id uuid not null,
  tarefa text not null check (tarefa in ('altura', 'eletrica', 'escavacao', 'confinado', 'geral')),
  cracha_token text not null unique
);

create table public.consentimentos (
  trabalhador_id uuid not null,
  finalidade text not null,
  versao_termo text not null,
  revogado_em timestamptz
);

create table public.epis (
  tipo text not null,
  descricao text not null,
  curto text not null,
  icone text not null,
  vida_util_dias integer not null check (vida_util_dias > 0),
  perguntas text[] not null default '{}',
  estoque_minimo integer not null default 0,
  local text
);

create table public.matriz (
  funcao_id uuid not null,
  tarefa text not null,
  epi_id uuid not null,
  obrigatorio boolean not null default true,
  unique (funcao_id, tarefa, epi_id)
);

create table public.cas (
  numero text not null,
  fabricante text not null,
  epi_id uuid not null,
  situacao text not null check (situacao in ('valido', 'vencido', 'cancelado')),
  validade date not null,
  ultima_consulta timestamptz not null,
  fonte text not null
);

create table public.requisicoes (
  tipo text not null default 'epi',
  trabalhador_id uuid not null,
  epi_id uuid not null,
  checkin_id uuid,
  motivo text not null check (motivo in ('falta', 'vencido', 'danificado', 'admissao', 'preventiva')),
  prioridade text not null default 'normal',
  para_quem text not null check (para_quem in ('construtora', 'empreiteira')),
  status text not null check (status in ('aberta', 'entregue', 'aguardando_compra', 'cancelada'))
);

create table public.entregas (
  trabalhador_id uuid not null,
  epi_id uuid not null,
  ca_id uuid not null,
  lote text,
  quantidade integer not null default 1,
  motivo text not null,
  data timestamptz not null,
  validade_uso timestamptz not null,
  foto_id uuid,
  assinatura text not null,
  entregue_por uuid not null,
  fornecido_por text not null check (fornecido_por in ('construtora', 'empreiteira')),
  devolvido_em timestamptz,
  devolucao_motivo text,
  substituida_por uuid,
  requisicao_id uuid
);

create table public.checkins (
  trabalhador_id uuid not null,
  frente_id uuid not null,
  tarefa text not null,
  inicio timestamptz not null,
  fim timestamptz,
  resultado text not null check (resultado in ('liberado', 'pendente', 'bloqueado')),
  motivo text,
  itens jsonb not null default '[]',
  revisado_por uuid,
  nova_foto_pedida boolean not null default false,
  bloqueio_pedido_por uuid,
  bloqueio_justificativa text
);

create table public.respostas (
  checkin_id uuid not null,
  epi_id uuid not null,
  pergunta text not null,
  valor boolean not null
);

create table public.fotos (
  dono_tipo text not null check (dono_tipo in ('checkin', 'entrega', 'liberacao')),
  dono_id uuid not null,
  hash text not null,
  caminho_storage text,
  tirada_em timestamptz not null,
  apagar_em timestamptz
);

create table public.deteccoes (
  foto_id uuid,
  checkin_id uuid not null,
  epi_id uuid not null,
  modelo text not null,
  versao_modelo text not null,
  onde text not null check (onde in ('celular', 'nuvem')),
  rotulo text not null check (rotulo in ('presente', 'ausente')),
  confianca numeric(4, 3) not null check (confianca between 0 and 1),
  limite_aplicado numeric(4, 3) not null,
  decisao text not null check (decisao in ('automatica', 'revisao', 'amostra'))
);

create table public.revisoes (
  deteccao_id uuid not null,
  revisor uuid not null,
  decisao text not null check (decisao in ('confirmar', 'corrigir', 'pedir_nova_foto')),
  valor_corrigido text check (valor_corrigido in ('presente', 'ausente')),
  tempo_s integer not null,
  usar_no_treino boolean not null default true
);

create table public.solicitacoes (
  epi_id uuid not null,
  quantidade integer not null check (quantidade > 0),
  origem text not null check (origem in ('estoque_minimo', 'requisicao_sem_estoque')),
  situacao text not null check (situacao in ('nao_autorizada', 'autorizada'))
);

create table public.movimentacoes (
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste')),
  epi_id uuid not null,
  quantidade integer not null,
  origem text not null,
  entrega_id uuid,
  quem_recebeu uuid
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  empresa_id uuid not null,
  quem text,
  quando timestamptz not null default now(),
  acao text not null,
  entidade text not null,
  entidade_id uuid not null,
  antes jsonb,
  depois jsonb,
  hash_anterior text not null,
  hash text not null
);

-- Campos comuns a toda tabela sincronizada, RLS e chave primária em um só lugar.
do $$
declare
  t text;
begin
  foreach t in array array[
    'empresas', 'obras', 'frentes', 'funcoes', 'usuarios', 'trabalhadores', 'consentimentos',
    'epis', 'matriz', 'cas', 'requisicoes', 'entregas', 'checkins', 'respostas', 'fotos',
    'deteccoes', 'revisoes', 'solicitacoes', 'movimentacoes'
  ] loop
    execute format($f$
      alter table public.%1$I
        add column id uuid primary key,
        add column empresa_id uuid not null,
        add column obra_id uuid,
        add column criado_em timestamptz not null,
        add column atualizado_em timestamptz not null,
        add column recebido_em timestamptz not null default now(),
        add column criado_por text not null,
        add column dispositivo_id text not null,
        add column versao integer not null default 1,
        add column excluido_em timestamptz
    $f$, t);

    execute format('alter table public.%I enable row level security', t);
    execute format($f$
      create policy tenant on public.%1$I for all to authenticated
        using (empresa_id = gepi.empresa_atual() and gepi.obra_permitida(obra_id))
        with check (empresa_id = gepi.empresa_atual() and gepi.obra_permitida(obra_id))
    $f$, t);
  end loop;
end $$;

alter table public.obras add foreign key (empresa_id) references public.empresas (id);
alter table public.frentes add foreign key (obra_id) references public.obras (id);
alter table public.trabalhadores
  add foreign key (funcao_id) references public.funcoes (id),
  add foreign key (empregadora_id) references public.empresas (id),
  add foreign key (frente_id) references public.frentes (id);
alter table public.consentimentos add foreign key (trabalhador_id) references public.trabalhadores (id);
alter table public.matriz
  add foreign key (funcao_id) references public.funcoes (id),
  add foreign key (epi_id) references public.epis (id);
alter table public.cas add foreign key (epi_id) references public.epis (id);
alter table public.requisicoes
  add foreign key (trabalhador_id) references public.trabalhadores (id),
  add foreign key (epi_id) references public.epis (id),
  add foreign key (checkin_id) references public.checkins (id);
alter table public.entregas
  add foreign key (trabalhador_id) references public.trabalhadores (id),
  add foreign key (epi_id) references public.epis (id),
  add foreign key (ca_id) references public.cas (id),
  add foreign key (substituida_por) references public.entregas (id),
  add foreign key (requisicao_id) references public.requisicoes (id);
alter table public.checkins
  add foreign key (trabalhador_id) references public.trabalhadores (id),
  add foreign key (frente_id) references public.frentes (id);
alter table public.respostas
  add foreign key (checkin_id) references public.checkins (id),
  add foreign key (epi_id) references public.epis (id);
alter table public.deteccoes
  add foreign key (checkin_id) references public.checkins (id),
  add foreign key (epi_id) references public.epis (id),
  add foreign key (foto_id) references public.fotos (id);
alter table public.revisoes add foreign key (deteccao_id) references public.deteccoes (id);
alter table public.solicitacoes add foreign key (epi_id) references public.epis (id);
alter table public.movimentacoes
  add foreign key (epi_id) references public.epis (id),
  add foreign key (entrega_id) references public.entregas (id);

-- Empreiteira só enxerga os próprios trabalhadores (e o que for deles).
create policy so_proprios on public.trabalhadores as restrictive for all to authenticated
  using (gepi.claim('perfil') is distinct from 'empreiteira' or empregadora_id = gepi.claim('empregadora_id')::uuid);

create policy so_proprios on public.checkins as restrictive for all to authenticated
  using (
    gepi.claim('perfil') is distinct from 'empreiteira'
    or trabalhador_id in (select id from public.trabalhadores)
  );

create policy so_proprios on public.entregas as restrictive for all to authenticated
  using (
    gepi.claim('perfil') is distinct from 'empreiteira'
    or trabalhador_id in (select id from public.trabalhadores)
  );

create policy so_proprios on public.requisicoes as restrictive for all to authenticated
  using (
    gepi.claim('perfil') is distinct from 'empreiteira'
    or trabalhador_id in (select id from public.trabalhadores)
  );

-- Fatos: correção é um novo registro, nunca uma alteração.
create or replace function gepi.so_insercao() returns trigger
language plpgsql as $$
begin
  raise exception '% é só inserção', tg_table_name using errcode = 'P0001';
end $$;

do $$
declare
  t text;
begin
  foreach t in array array['respostas', 'fotos', 'deteccoes', 'revisoes', 'movimentacoes', 'audit_log'] loop
    execute format(
      'create trigger so_insercao before update or delete on public.%I
         for each row execute function gepi.so_insercao()', t);
  end loop;
end $$;

-- A entrega é evidência legal: só os campos da substituição podem mudar depois.
create or replace function gepi.entrega_imutavel() returns trigger
language plpgsql as $$
declare
  livres text[] := array['foto_id', 'substituida_por', 'devolvido_em', 'devolucao_motivo',
                         'atualizado_em', 'recebido_em', 'versao'];
begin
  if tg_op = 'DELETE' then
    raise exception 'entrega não pode ser apagada' using errcode = 'P0001';
  end if;
  if (to_jsonb(new) - livres) is distinct from (to_jsonb(old) - livres) then
    raise exception 'entrega só aceita registrar a substituição' using errcode = 'P0001';
  end if;
  return new;
end $$;

create trigger entrega_imutavel before update or delete on public.entregas
  for each row execute function gepi.entrega_imutavel();

-- Bloqueio nunca é automático: exige alguém identificado na revisão.
alter table public.checkins add constraint bloqueio_tem_humano
  check (resultado <> 'bloqueado' or revisado_por is not null);

-- Trilha encadeada: cada linha carrega o hash da anterior, por empresa.
create or replace function gepi.auditar() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  linha_antes jsonb := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  linha_depois jsonb := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  atual jsonb := coalesce(linha_depois, linha_antes);
  empresa uuid := (atual ->> 'empresa_id')::uuid;
  anterior text;
begin
  perform pg_advisory_xact_lock(hashtextextended(empresa::text, 0));
  select hash into anterior from public.audit_log
    where empresa_id = empresa order by id desc limit 1;
  anterior := coalesce(anterior, repeat('0', 64));
  insert into public.audit_log (empresa_id, quem, acao, entidade, entidade_id, antes, depois, hash_anterior, hash)
  values (
    empresa, gepi.claim('sub'), lower(tg_op), tg_table_name, (atual ->> 'id')::uuid,
    linha_antes, linha_depois, anterior,
    encode(sha256(convert_to(anterior || coalesce(linha_antes::text, '') || coalesce(linha_depois::text, ''), 'UTF8')), 'hex')
  );
  return coalesce(new, old);
end $$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'trabalhadores', 'consentimentos', 'matriz', 'cas', 'requisicoes', 'entregas', 'checkins',
    'respostas', 'fotos', 'deteccoes', 'revisoes', 'solicitacoes', 'movimentacoes'
  ] loop
    execute format(
      'create trigger auditar after insert or update or delete on public.%I
         for each row execute function gepi.auditar()', t);
  end loop;
end $$;

alter table public.audit_log enable row level security;
create policy leitura on public.audit_log for select to authenticated
  using (empresa_id = gepi.empresa_atual() and gepi.claim('perfil') in ('tecnico', 'gestor', 'admin'));
revoke all on public.audit_log from authenticated;
grant select on public.audit_log to authenticated;

-- Saldo: sempre a soma das movimentações, respeitando o RLS de quem consulta.
create view public.saldo_epi with (security_invoker = true) as
  select empresa_id, obra_id, epi_id, sum(quantidade)::integer as saldo
  from public.movimentacoes
  where excluido_em is null
  group by empresa_id, obra_id, epi_id;

grant usage on schema gepi to authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on all tables in schema public to authenticated;
revoke update, insert on public.audit_log from authenticated;
grant select on public.saldo_epi to authenticated;
