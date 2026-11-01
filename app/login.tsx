// Entrada da equipe. O PDF prevê código por SMS/WhatsApp, que depende do backend;
// aqui fica só o PIN local de 4 dígitos.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { entrar, reiniciarDemo, useEstado } from '@/dados/store';
import { PIN_DEMO } from '@/dominio/seed';
import type { Perfil, Usuario } from '@/dominio/tipos';
import { Botao, Rolagem, T, Tela } from '@/ui/base';
import { cor } from '@/ui/tema';

const INICIO: Record<Perfil, string> = {
  encarregado: '/encarregado',
  almoxarife: '/almox',
  tecnico: '/tecnico',
  gestor: '/gestor',
};

export default function Login() {
  const router = useRouter();
  const e = useEstado();
  const [usuario, setUsuario] = useState<Usuario | null>(null);
  const [pin, setPin] = useState('');
  const [erro, setErro] = useState(false);

  function digitar(d: string) {
    const novo = pin + d;
    setErro(false);
    if (novo.length < 4) {
      setPin(novo);
      return;
    }
    setPin('');
    const u = entrar(usuario!.id, novo);
    if (u) router.replace(INICIO[u.perfil] as never);
    else setErro(true);
  }

  return (
    <Tela>
      <View style={{ padding: 20, gap: 4 }}>
        <T tam={26} peso="extra">{usuario ? usuario.nome : 'Entrar como equipe'}</T>
        <T tam={15} c={cor.textoSuave}>{usuario ? 'Digite seu PIN' : 'Escolha seu nome'}</T>
      </View>

      {!usuario ? (
        <Rolagem style={{ paddingHorizontal: 20, gap: 12 }}>
          {e.usuarios.map((u) => (
            <Botao key={u.id} titulo={u.nome} variante="escuro" onPress={() => setUsuario(u)} />
          ))}
          <T tam={14} c={cor.laranjaClaro} style={{ marginTop: 8 }}>
            Dados de demonstração. O PIN de todos é {PIN_DEMO}.
          </T>
        </Rolagem>
      ) : (
        <View style={{ flex: 1, paddingHorizontal: 20, gap: 14, justifyContent: 'center' }}>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 16 }} accessibilityLabel={`${pin.length} de 4 dígitos`}>
            {[0, 1, 2, 3].map((i) => (
              <View key={i} style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: i < pin.length ? cor.laranja : cor.apagado }} />
            ))}
          </View>
          {erro ? <T tam={16} peso="forte" c={cor.laranjaClaro} style={{ textAlign: 'center' }}>PIN incorreto</T> : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'center' }}>
            {['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map((d) => (
              <Pressable
                key={d}
                accessibilityRole="button"
                accessibilityLabel={`Dígito ${d}`}
                onPress={() => digitar(d)}
                style={{ width: '30%', height: 72, borderRadius: 16, backgroundColor: cor.superficie2, alignItems: 'center', justifyContent: 'center' }}
              >
                <T tam={28} peso="extra">{d}</T>
              </Pressable>
            ))}
          </View>
        </View>
      )}

      <View style={{ padding: 20, gap: 8 }}>
        <Botao
          titulo="Voltar"
          variante="contorno"
          alto={60}
          onPress={() => (usuario ? setUsuario(null) : router.replace('/'))}
        />
        {!usuario ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => reiniciarDemo().then(() => router.replace('/'))}
            style={{ alignItems: 'center', paddingVertical: 12 }}
          >
            <T tam={14} peso="forte" c={cor.textoSuave}>Reiniciar demonstração</T>
          </Pressable>
        ) : null}
      </View>
    </Tela>
  );
}
