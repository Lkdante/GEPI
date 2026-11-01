import {
  Archivo_500Medium,
  Archivo_700Bold,
  Archivo_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/archivo';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { carregar, useRaiz } from '@/dados/store';
import { T } from '@/ui/base';
import { cor } from '@/ui/tema';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function Layout() {
  const [fontes, erroFontes] = useFonts({ Archivo_500Medium, Archivo_700Bold, Archivo_800ExtraBold });
  const { estado } = useRaiz();
  const [erro, setErro] = useState<string | null>(null);
  const semEstado = estado === null;

  // Também cobre o hot reload, que recria o store com o app já aberto.
  useEffect(() => {
    if (semEstado) carregar().catch((e) => setErro(String(e)));
  }, [semEstado]);

  const carregado = !semEstado && (fontes || erroFontes);
  useEffect(() => {
    if (carregado || erro) SplashScreen.hideAsync().catch(() => {});
  }, [carregado, erro]);

  if (erro) {
    return (
      <View style={{ flex: 1, backgroundColor: cor.fundo, padding: 24, justifyContent: 'center' }}>
        <T tam={22} peso="extra">Não foi possível abrir os dados do aparelho</T>
        <T c={cor.textoSuave} style={{ marginTop: 8 }}>{erro}</T>
      </View>
    );
  }
  if (!carregado) return <View style={{ flex: 1, backgroundColor: cor.fundo }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, animation: 'none', contentStyle: { backgroundColor: cor.fundo } }} />
    </SafeAreaProvider>
  );
}
