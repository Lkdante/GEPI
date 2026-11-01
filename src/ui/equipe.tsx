// Moldura das telas de quem confere dados: claras, cabeçalho preto, teclado permitido.
import { Redirect, usePathname, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { escolherObra, sair, useEstado, useRaiz } from '@/dados/store';
import type { Perfil, StatusDia } from '@/dominio/tipos';
import { SeloSync, T } from './base';
import { Icone, Selo } from './Icone';
import { cor, fonte } from './tema';

const ROTULO_PERFIL: Record<Perfil, string> = {
  encarregado: 'ENCARREGADO',
  almoxarife: 'ALMOXARIFE',
  tecnico: 'TÉCNICO REMOTO',
  gestor: 'ENGENHEIRO / GESTOR',
};

const NAVEGACAO: Record<Perfil, { rota: string; titulo: string }[]> = {
  encarregado: [
    { rota: '/encarregado', titulo: 'Equipe' },
    { rota: '/encarregado/novo', titulo: 'Novo trabalhador' },
  ],
  almoxarife: [
    { rota: '/almox', titulo: 'Fila' },
    { rota: '/almox/entrega', titulo: 'Nova entrega' },
    { rota: '/almox/estoque', titulo: 'Estoque' },
  ],
  tecnico: [
    { rota: '/tecnico', titulo: 'Revisar' },
    { rota: '/tecnico/fichas', titulo: 'Fichas NR-6' },
    { rota: '/tecnico/matriz', titulo: 'Matriz de EPI' },
    { rota: '/tecnico/auditoria', titulo: 'Auditoria' },
  ],
  gestor: [
    { rota: '/gestor', titulo: 'Painel' },
    { rota: '/tecnico/fichas', titulo: 'Fichas NR-6' },
  ],
};

export function Equipe({
  perfis,
  titulo,
  children,
  resumo,
}: {
  perfis: Perfil[];
  titulo: string;
  children: ReactNode;
  resumo?: ReactNode;
}) {
  const router = useRouter();
  const rota = usePathname();
  const area = useSafeAreaInsets();
  const e = useEstado();
  const { usuario, obra_id } = useRaiz();
  if (!usuario || !perfis.includes(usuario.perfil)) return <Redirect href="/login" />;

  const obra = e.obras.find((o) => o.id === obra_id);
  const coluna = { width: '100%', maxWidth: 960, alignSelf: 'center' } as const;

  return (
    <View style={{ flex: 1, backgroundColor: cor.claro }}>
      <View style={{ backgroundColor: cor.fundo, paddingTop: area.top }}>
        <View style={[coluna, { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, gap: 10 }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <T tam={13} peso="forte" c={cor.laranjaClaro} linhas={1} style={{ flexShrink: 1 }}>
              {ROTULO_PERFIL[usuario.perfil]} · {obra?.nome.toUpperCase()}
            </T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <SeloSync />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Sair"
                onPress={() => {
                  sair();
                  router.replace('/');
                }}
                style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
              >
                <Icone nome="sair" tam={24} />
              </Pressable>
            </View>
          </View>
          <T tam={24} peso="extra">{titulo}</T>
          {resumo}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
            {e.obras.map((o) => (
              <Chip key={o.id} titulo={o.nome} ativo={o.id === obra_id} escuro onPress={() => escolherObra(o.id)} />
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 18 }}>
            {NAVEGACAO[usuario.perfil].map((n) => {
              const ativa = rota === n.rota;
              return (
                <Pressable
                  key={n.rota}
                  accessibilityRole="link"
                  onPress={() => router.replace(n.rota as never)}
                  style={{ minHeight: 40, justifyContent: 'center', borderBottomWidth: 3, borderBottomColor: ativa ? cor.laranja : 'transparent' }}
                >
                  <T tam={15} peso="forte" c={ativa ? cor.branco : cor.textoSuave}>{n.titulo}</T>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[coluna, { padding: 16, gap: 12, paddingBottom: 40 }]}>
        {children}
      </ScrollView>
    </View>
  );
}

export function Cartao({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return (
    <View style={{ backgroundColor: cor.branco, borderRadius: 16, borderWidth: 1, borderColor: cor.claroBorda, padding: 14, gap }}>
      {children}
    </View>
  );
}

export function Secao({ children }: { children: ReactNode }) {
  return <T tam={15} peso="extra" c={cor.fundo} style={{ marginTop: 8 }}>{children}</T>;
}

export function Vazio({ children }: { children: ReactNode }) {
  return <T tam={15} c={cor.claroTexto}>{children}</T>;
}

export function Chip({
  titulo,
  ativo,
  escuro,
  onPress,
}: {
  titulo: string;
  ativo?: boolean;
  escuro?: boolean;
  onPress: () => void;
}) {
  const fundo = ativo ? cor.laranjaEscuro : escuro ? cor.superficie2 : cor.branco;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: !!ativo }}
      onPress={onPress}
      style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 12, justifyContent: 'center', backgroundColor: fundo, borderWidth: 1, borderColor: ativo ? cor.laranjaEscuro : escuro ? cor.superficie2 : cor.claroBorda }}
    >
      <T tam={14} peso="forte" c={ativo || escuro ? cor.branco : cor.fundo}>{titulo}</T>
    </Pressable>
  );
}

const STATUS: Record<StatusDia, { rotulo: string; fundo: string; texto: string; selo?: 'ok' | 'atencao' | 'bloqueio' }> = {
  liberado: { rotulo: 'Liberado', fundo: cor.verdePele, texto: cor.verdeEscuro, selo: 'ok' },
  pendente: { rotulo: 'Pendente', fundo: cor.laranjaPele, texto: cor.marromTexto, selo: 'atencao' },
  bloqueado: { rotulo: 'Bloqueado', fundo: '#FEE2E2', texto: cor.vermelho, selo: 'bloqueio' },
  sem_checkin: { rotulo: 'Sem check-in', fundo: cor.claroBorda, texto: cor.claroTexto },
};

export function Status({ status }: { status: StatusDia }) {
  const s = STATUS[status];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: s.fundo }}>
      {s.selo ? <Selo tipo={s.selo} tam={16} /> : null}
      <T tam={13} peso="forte" c={s.texto}>{s.rotulo}</T>
    </View>
  );
}

export function Campo({ rotulo, ...props }: { rotulo: string } & TextInputProps) {
  return (
    <View style={{ gap: 4 }}>
      <T tam={13} peso="forte" c={cor.claroTexto}>{rotulo}</T>
      <TextInput
        accessibilityLabel={rotulo}
        placeholderTextColor={cor.borda}
        style={{ minHeight: 52, borderRadius: 12, borderWidth: 1, borderColor: cor.borda, backgroundColor: cor.branco, paddingHorizontal: 12, fontFamily: fonte.medio, fontSize: 17, color: cor.fundo }}
        {...props}
      />
    </View>
  );
}

export function Tile({ valor, rotulo, fundo, texto }: { valor: string | number; rotulo: string; fundo: string; texto: string }) {
  return (
    <View style={{ flex: 1, minWidth: 96, borderRadius: 12, backgroundColor: fundo, padding: 10 }}>
      <T tam={22} peso="extra">{valor}</T>
      <T tam={12} c={texto}>{rotulo}</T>
    </View>
  );
}

export function Metrica({ valor, rotulo }: { valor: string | number; rotulo: string }) {
  return (
    <View style={{ flexGrow: 1, flexBasis: 150, backgroundColor: cor.branco, borderRadius: 12, borderWidth: 1, borderColor: cor.claroBorda, padding: 12 }}>
      <T tam={22} peso="extra" c={cor.fundo}>{valor}</T>
      <T tam={13} c={cor.claroTexto}>{rotulo}</T>
    </View>
  );
}
