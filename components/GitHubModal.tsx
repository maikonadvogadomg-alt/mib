import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import React, { useState, useEffect, useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import { useApiBase } from "@/hooks/useApiBase";

type ScreenView = "main" | "import" | "create" | "push-existing" | "token";

interface GHRepo {
  id: number;
  full_name: string;
  name: string;
  private: boolean;
  description: string | null;
  updated_at: string;
  default_branch: string;
  owner: { login: string };
}

interface GHUser {
  login: string;
  name: string | null;
  avatar_url: string;
}


export default function GitHubModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { gitConfigs, addGitConfig, updateGitConfig, activeProject, createFile } = useApp();
  const apiBase = useApiBase();
  const API_BASE = `${apiBase || "http://localhost:8080"}/api`;

  const ghConfig = gitConfigs.find((g) => g.provider === "github");
  const savedToken = ghConfig?.token || "";

  const [view, setView] = useState<ScreenView>(savedToken ? "main" : "token");
  const [token, setToken] = useState(savedToken);
  const [tokenInput, setTokenInput] = useState("");
  const [ghUser, setGhUser] = useState<GHUser | null>(null);
  const [repos, setRepos] = useState<GHRepo[]>([]);
  const [loadingUser, setLoadingUser] = useState(false);
  const [loadingRepos, setLoadingRepos] = useState(false);
  const [repoSearch, setRepoSearch] = useState("");

  // Create form
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPrivate, setCreatePrivate] = useState(false);
  const [createMsg, setCreateMsg] = useState(`Enviado pelo DevMobile — ${new Date().toLocaleDateString("pt-BR")}`);
  const [creating, setCreating] = useState(false);
  const [createResult, setCreateResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Push existing form
  const [pushOwner, setPushOwner] = useState("");
  const [pushRepo, setPushRepo] = useState("");
  const [pushMsg, setPushMsg] = useState(`DevMobile — ${new Date().toLocaleDateString("pt-BR")}`);
  const [pushing, setPushing] = useState(false);
  const [pushResult, setPushResult] = useState<{ ok: boolean; msg: string } | null>(null);

  // Clone public URL
  const [publicUrl, setPublicUrl] = useState("");
  const [cloning, setCloning] = useState(false);

  // Reset when opened
  useEffect(() => {
    if (visible) {
      const t = gitConfigs.find((g) => g.provider === "github")?.token || "";
      setToken(t);
      setView(t ? "main" : "token");
      setCreateResult(null);
      setPushResult(null);
      setRepoSearch("");
      if (t) fetchUser(t);
    }
  }, [visible]);

  const fetchUser = useCallback(async (t: string) => {
    setLoadingUser(true);
    try {
      const r = await fetch(`${API_BASE}/github/user`, {
        headers: { "x-github-token": t },
      });
      if (r.ok) {
        const data = await r.json();
        setGhUser(data);
      } else {
        setGhUser(null);
      }
    } catch {
      setGhUser(null);
    } finally {
      setLoadingUser(false);
    }
  }, []);

  const fetchRepos = useCallback(async (t: string) => {
    setLoadingRepos(true);
    try {
      const r = await fetch(`${API_BASE}/github/repos`, {
        headers: { "x-github-token": t },
      });
      if (r.ok) {
        const data = await r.json();
        setRepos(Array.isArray(data) ? data : []);
      }
    } catch {}
    setLoadingRepos(false);
  }, []);

  const handleSaveToken = async () => {
    if (!tokenInput.trim()) return;
    setLoadingUser(true);
    try {
      const r = await fetch(`${API_BASE}/github/user`, {
        headers: { "x-github-token": tokenInput.trim() },
      });
      if (!r.ok) {
        Alert.alert("❌ Token inválido", "Verifique o token e tente novamente.");
        setLoadingUser(false);
        return;
      }
      const data = await r.json();
      setGhUser(data);
      setToken(tokenInput.trim());
      addGitConfig({
        provider: "github",
        token: tokenInput.trim(),
        username: data.login,
        email: "",
      });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setView("main");
    } catch {
      Alert.alert("Erro", "Falha ao verificar o token.");
    }
    setLoadingUser(false);
  };

  const handleImportOpen = async () => {
    setView("import");
    if (repos.length === 0) await fetchRepos(token);
  };

  const handleCloneRepo = async (repo: GHRepo) => {
    if (!activeProject) {
      Alert.alert("Aviso", "Abra ou crie um projeto primeiro.");
      return;
    }
    Alert.alert(
      `Importar ${repo.full_name}?`,
      `Os arquivos serão adicionados ao projeto "${activeProject.name}".`,
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Importar",
          onPress: async () => {
            setCloning(true);
            try {
              const r = await fetch(`${API_BASE}/github/clone`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ token, owner: repo.owner.login, repo: repo.name }),
              });
              const data = await r.json();
              if (!r.ok || data.error) {
                Alert.alert("❌ Erro", data.error || "Falha ao importar.");
                setCloning(false);
                return;
              }
              for (const file of data.files || []) {
                createFile(activeProject.id, file.path, file.content);
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert(
                "✅ Importado!",
                `${data.fetched} arquivo(s) de "${repo.full_name}" adicionados ao projeto.${data.skipped > 0 ? `\n\n(${data.skipped} arquivo(s) ignorados — binários ou muito grandes)` : ""}`
              );
              onClose();
            } catch (e) {
              Alert.alert("Erro", String(e));
            }
            setCloning(false);
          },
        },
      ]
    );
  };

  const handleClonePublic = async () => {
    if (!publicUrl.trim()) return;
    if (!activeProject) {
      Alert.alert("Aviso", "Abra ou crie um projeto primeiro.");
      return;
    }
    setCloning(true);
    try {
      const r = await fetch(`${API_BASE}/github/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: token || undefined, url: publicUrl.trim() }),
      });
      const data = await r.json();
      if (!r.ok || data.error) {
        Alert.alert("❌ Erro", data.error || "Falha ao importar.");
        setCloning(false);
        return;
      }
      for (const file of data.files || []) {
        createFile(activeProject.id, file.path, file.content);
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert(
        "✅ Importado!",
        `${data.fetched} arquivo(s) de "${data.repoName}" adicionados ao projeto.${data.skipped > 0 ? `\n\n(${data.skipped} arquivo(s) ignorados — binários ou muito grandes)` : ""}`
      );
      setPublicUrl("");
      onClose();
    } catch (e) {
      Alert.alert("Erro", String(e));
    }
    setCloning(false);
  };

  const handleCreateAndPush = async () => {
    if (!createName.trim()) {
      Alert.alert("Aviso", "Informe o nome do repositório.");
      return;
    }
    if (!activeProject) {
      Alert.alert("Aviso", "Abra um projeto primeiro.");
      return;
    }
    if (!activeProject.files.length) {
      Alert.alert("Aviso", "O projeto está vazio.");
      return;
    }
    setCreating(true);
    setCreateResult(null);
    try {
      const user = ghUser || { login: gitConfigs.find(g => g.provider === "github")?.username || "" };
      // 1. Create repo
      const createR = await fetch(`${API_BASE}/github/create-repo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name: createName.trim(), description: createDesc.trim(), isPrivate: createPrivate }),
      });
      const createData = await createR.json();
      if (!createR.ok || createData.error) {
        setCreateResult({ ok: false, msg: createData.error || "Falha ao criar repositório." });
        setCreating(false);
        return;
      }
      setCreateResult({ ok: false, msg: "⏳ Criando repositório..." });

      // 2. Push files
      const files = activeProject.files
        .filter((f) => f.name !== ".jasmim-memory.json" || true)
        .map((f) => ({ path: f.name, content: f.content }));

      const pushR = await fetch(`${API_BASE}/github/push-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          owner: user.login,
          repo: createName.trim(),
          files,
          message: createMsg.trim() || "Enviado pelo DevMobile",
          branch: createData.default_branch || "main",
        }),
      });
      const pushData = await pushR.json();
      if (pushData.error) {
        setCreateResult({ ok: false, msg: pushData.error });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCreateResult({
          ok: true,
          msg: `✅ Enviado! ${pushData.pushed} arquivo(s) no repositório "${createName.trim()}"`,
        });
      }
    } catch (e) {
      setCreateResult({ ok: false, msg: String(e) });
    }
    setCreating(false);
  };

  const handlePushExisting = async () => {
    if (!pushOwner.trim() || !pushRepo.trim()) {
      // Try to auto-fill from user
      if (ghUser && !pushOwner.trim()) {
        setPushOwner(ghUser.login);
        return;
      }
      Alert.alert("Aviso", "Informe o owner e o nome do repositório.");
      return;
    }
    if (!activeProject?.files.length) {
      Alert.alert("Aviso", "O projeto está vazio.");
      return;
    }
    setPushing(true);
    setPushResult(null);
    try {
      const files = activeProject.files.map((f) => ({ path: f.name, content: f.content }));
      const r = await fetch(`${API_BASE}/github/push-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          owner: pushOwner.trim(),
          repo: pushRepo.trim(),
          files,
          message: pushMsg.trim() || "DevMobile — atualização",
        }),
      });
      const data = await r.json();
      if (data.error) {
        setPushResult({ ok: false, msg: data.error });
      } else {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPushResult({ ok: true, msg: `✅ Enviado! ${data.pushed}/${data.total} arquivo(s) enviados.` });
      }
    } catch (e) {
      setPushResult({ ok: false, msg: String(e) });
    }
    setPushing(false);
  };

  const disconnect = () => {
    Alert.alert("Desconectar GitHub?", "O token será removido.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Desconectar",
        style: "destructive",
        onPress: () => {
          updateGitConfig("github", { token: "", username: "" });
          setToken("");
          setGhUser(null);
          setRepos([]);
          setView("token");
        },
      },
    ]);
  };

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(repoSearch.toLowerCase())
  );

  const topPadding = Platform.OS === "web" ? 40 : insets.top;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose} statusBarTranslucent>
      <View style={[s.container, { backgroundColor: colors.background }]}>
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border, paddingTop: topPadding + 4 }]}>
          {view !== "main" && view !== "token" ? (
            <TouchableOpacity onPress={() => setView(token ? "main" : "token")} style={s.backBtn}>
              <Feather name="arrow-left" size={20} color={colors.foreground} />
            </TouchableOpacity>
          ) : (
            <View style={[s.ghIcon, { backgroundColor: "#22c55e22" }]}>
              <Feather name="github" size={18} color="#22c55e" />
            </View>
          )}
          <Text style={[s.headerTitle, { color: colors.foreground }]}>
            {view === "token" ? "Conectar GitHub" :
             view === "import" ? "Importar Repositório" :
             view === "create" ? "Criar e Enviar" :
             view === "push-existing" ? "Enviar para repo existente" :
             "GitHub"}
          </Text>
          <View style={{ flex: 1 }} />
          {view === "main" && ghUser && (
            <TouchableOpacity onPress={disconnect} style={{ marginRight: 8 }}>
              <Text style={{ color: colors.destructive, fontSize: 12 }}>Desconectar</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* ── TOKEN VIEW ── */}
        {view === "token" && (
          <ScrollView contentContainerStyle={s.body}>
            <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>TOKEN DE ACESSO</Text>
            <Text style={[s.tip, { color: colors.mutedForeground }]}>
              Para acessar repositórios privados e enviar código, você precisa de um token pessoal do GitHub.
            </Text>

            <View style={[s.tipBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[s.tipBoxTitle, { color: colors.foreground }]}>Como criar seu Token:</Text>
              {[
                "1. Acesse: github.com → Settings",
                "2. Developer settings → Personal access tokens",
                "3. Generate new token (classic)",
                "4. Marque: repo, workflow",
                "5. Copie o token (começa com ghp_)",
              ].map((line) => (
                <Text key={line} style={{ color: colors.mutedForeground, fontSize: 12, marginVertical: 1 }}>{line}</Text>
              ))}
            </View>

            <Text style={[s.label, { color: colors.mutedForeground }]}>SEU TOKEN PESSOAL</Text>

            {/* Botão de colar token do clipboard — fluxo mais rápido */}
            <TouchableOpacity
              onPress={async () => {
                try {
                  const { default: Clipboard } = await import("expo-clipboard");
                  const text = await Clipboard.getStringAsync();
                  const tok = (text || "").trim();
                  if (!tok) { Alert.alert("Área de transferência vazia", "Copie seu token do GitHub primeiro e tente novamente."); return; }
                  setTokenInput(tok);
                  if (tok.length >= 20) {
                    // auto-submit immediately
                    setLoadingUser(true);
                    try {
                      const r = await fetch(`${API_BASE}/github/user`, { headers: { "x-github-token": tok } });
                      if (!r.ok) { Alert.alert("❌ Token inválido", "Verifique o token e tente novamente."); setLoadingUser(false); return; }
                      const data = await r.json();
                      setGhUser(data);
                      setToken(tok);
                      addGitConfig({ provider: "github", token: tok, username: data.login, email: "" });
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setView("main");
                    } catch { Alert.alert("Erro", "Falha ao verificar o token."); }
                    setLoadingUser(false);
                  }
                } catch { Alert.alert("Erro", "Não foi possível acessar a área de transferência."); }
              }}
              style={[s.btn, { backgroundColor: "#1d4ed8", marginBottom: 8 }]}
            >
              {loadingUser ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="clipboard" size={16} color="#fff" />}
              <Text style={[s.btnText, { color: "#fff" }]}>
                {loadingUser ? "Conectando..." : "📋 Colar Token e Conectar"}
              </Text>
            </TouchableOpacity>

            <Text style={{ color: colors.mutedForeground, fontSize: 11, textAlign: "center", marginBottom: 8 }}>— ou digite manualmente —</Text>

            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={tokenInput}
              onChangeText={setTokenInput}
              onSubmitEditing={handleSaveToken}
              placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="done"
            />

            <TouchableOpacity
              onPress={handleSaveToken}
              disabled={!tokenInput.trim() || loadingUser}
              style={[s.btn, { backgroundColor: tokenInput.trim() && !loadingUser ? "#22c55e" : colors.secondary }]}
            >
              {loadingUser ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Feather name="check" size={16} color={tokenInput.trim() ? "#fff" : colors.mutedForeground} />
              )}
              <Text style={[s.btnText, { color: tokenInput.trim() && !loadingUser ? "#fff" : colors.mutedForeground }]}>
                {loadingUser ? "Verificando..." : "✅ Salvar e Conectar"}
              </Text>
            </TouchableOpacity>

            <View style={{ height: 16 }} />
            <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>REPOSITÓRIO PÚBLICO (SEM TOKEN)</Text>
            <Text style={[s.tip, { color: colors.mutedForeground }]}>
              Para importar qualquer repositório público, cole a URL abaixo:
            </Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={publicUrl}
              onChangeText={setPublicUrl}
              placeholder="https://github.com/usuario/repositorio"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              onPress={handleClonePublic}
              disabled={!publicUrl.trim() || cloning}
              style={[s.btn, { backgroundColor: publicUrl.trim() && !cloning ? colors.primary : colors.secondary }]}
            >
              {cloning ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="download" size={16} color="#fff" />}
              <Text style={[s.btnText, { color: "#fff" }]}>{cloning ? "Importando..." : "Importar Repositório Público"}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── MAIN VIEW ── */}
        {view === "main" && (
          <ScrollView contentContainerStyle={s.body}>
            {/* User badge */}
            {loadingUser ? (
              <ActivityIndicator size="small" color={colors.primary} style={{ margin: 16 }} />
            ) : ghUser ? (
              <View style={[s.userBadge, { backgroundColor: "#22c55e14", borderColor: "#22c55e44" }]}>
                <View style={[s.ghDot, { backgroundColor: "#22c55e" }]} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: "#22c55e", fontWeight: "700", fontSize: 14 }}>@{ghUser.login}</Text>
                  {ghUser.name && <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>{ghUser.name}</Text>}
                  <Text style={{ color: "#22c55e", fontSize: 11 }}>conectado</Text>
                </View>
                <Feather name="check-circle" size={18} color="#22c55e" />
              </View>
            ) : null}

            {/* Active project info */}
            {activeProject && (
              <View style={[s.projectBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>PROJETO ATUAL</Text>
                <Text style={{ color: colors.foreground, fontWeight: "700", fontSize: 16 }}>{activeProject.name}</Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  {activeProject.files.length} arquivo{activeProject.files.length !== 1 ? "s" : ""}
                </Text>
              </View>
            )}

            {/* Actions: Enviar */}
            <Text style={[s.sectionTitle, { color: colors.mutedForeground }]}>ENVIAR PARA GITHUB</Text>
            <TouchableOpacity
              onPress={() => { setCreateName(activeProject?.name?.toLowerCase().replace(/\s+/g, "-") || ""); setView("create"); }}
              style={[s.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[s.actionIcon, { backgroundColor: "#22c55e22" }]}>
                <Feather name="plus-circle" size={18} color="#22c55e" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionLabel, { color: "#22c55e" }]}>Criar repositório novo e enviar</Text>
                <Text style={[s.actionDesc, { color: colors.mutedForeground }]}>Cria um repo novo e sobe todos os arquivos</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => { if (ghUser) setPushOwner(ghUser.login); setView("push-existing"); }}
              style={[s.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[s.actionIcon, { backgroundColor: colors.primary + "22" }]}>
                <Feather name="upload" size={18} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionLabel, { color: colors.foreground }]}>Enviar para repo existente</Text>
                <Text style={[s.actionDesc, { color: colors.mutedForeground }]}>Atualiza um repositório que já existe</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* Actions: Importar */}
            <Text style={[s.sectionTitle, { color: colors.mutedForeground, marginTop: 8 }]}>BAIXAR DO GITHUB</Text>
            <TouchableOpacity
              onPress={handleImportOpen}
              style={[s.actionBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={[s.actionIcon, { backgroundColor: "#a855f722" }]}>
                <Feather name="download" size={18} color="#a855f7" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.actionLabel, { color: colors.foreground }]}>Importar repositório</Text>
                <Text style={[s.actionDesc, { color: colors.mutedForeground }]}>Baixa um repositório para editar aqui</Text>
              </View>
              <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
            </TouchableOpacity>

            {/* Public URL */}
            <Text style={[s.sectionTitle, { color: colors.mutedForeground, marginTop: 8 }]}>LINK PÚBLICO</Text>
            <Text style={[s.tip, { color: colors.mutedForeground }]}>Importe qualquer repositório público sem precisar selecionar da lista:</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={publicUrl}
              onChangeText={setPublicUrl}
              placeholder="https://github.com/usuario/repositorio"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              onPress={handleClonePublic}
              disabled={!publicUrl.trim() || cloning}
              style={[s.btn, { backgroundColor: publicUrl.trim() && !cloning ? colors.primary : colors.secondary, marginTop: 4 }]}
            >
              {cloning ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="link" size={14} color="#fff" />}
              <Text style={[s.btnText, { color: "#fff" }]}>{cloning ? "Importando..." : "Importar Link"}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── IMPORT VIEW ── */}
        {view === "import" && (
          <View style={{ flex: 1 }}>
            {/* Search bar */}
            <View style={[s.searchBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
              <Feather name="search" size={14} color={colors.mutedForeground} />
              <TextInput
                style={[s.searchInput, { color: colors.foreground }]}
                value={repoSearch}
                onChangeText={setRepoSearch}
                placeholder="Buscar repositório..."
                placeholderTextColor={colors.mutedForeground}
                autoCapitalize="none"
              />
              {loadingRepos && <ActivityIndicator size="small" color={colors.primary} />}
              <TouchableOpacity onPress={() => fetchRepos(token)}>
                <Feather name="refresh-cw" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            </View>

            {/* Repo list */}
            {cloning ? (
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={{ color: colors.mutedForeground }}>Importando repositório...</Text>
              </View>
            ) : (
              <FlatList
                data={filteredRepos}
                keyExtractor={(item) => String(item.id)}
                contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
                ListEmptyComponent={
                  <View style={{ alignItems: "center", padding: 32 }}>
                    {loadingRepos ? (
                      <ActivityIndicator size="large" color={colors.primary} />
                    ) : (
                      <>
                        <Feather name="inbox" size={36} color={colors.mutedForeground + "55"} />
                        <Text style={{ color: colors.mutedForeground, marginTop: 8 }}>
                          {repos.length === 0 ? "Nenhum repositório encontrado" : "Sem resultados para a busca"}
                        </Text>
                      </>
                    )}
                  </View>
                }
                renderItem={({ item }) => (
                  <TouchableOpacity
                    onPress={() => handleCloneRepo(item)}
                    style={[s.repoItem, { borderBottomColor: colors.border }]}
                    activeOpacity={0.7}
                  >
                    <Feather
                      name={item.private ? "lock" : "unlock"}
                      size={14}
                      color={colors.mutedForeground}
                      style={{ marginTop: 2 }}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14 }}>{item.full_name}</Text>
                      {item.description ? (
                        <Text style={{ color: colors.mutedForeground, fontSize: 12 }} numberOfLines={1}>{item.description}</Text>
                      ) : null}
                      <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 1 }}>
                        Branch: {item.default_branch}
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => handleCloneRepo(item)}
                      style={[s.downloadBtn, { backgroundColor: "#22c55e22" }]}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Feather name="download" size={16} color="#22c55e" />
                    </TouchableOpacity>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* ── CREATE VIEW ── */}
        {view === "create" && (
          <ScrollView contentContainerStyle={s.body}>
            <Text style={[s.label, { color: colors.mutedForeground }]}>NOME DO REPOSITÓRIO</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={createName}
              onChangeText={setCreateName}
              placeholder="meu-projeto"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {ghUser && createName ? (
              <Text style={{ color: colors.mutedForeground, fontSize: 11, marginTop: -8, marginBottom: 8 }}>
                Será criado como: github.com/{ghUser.login}/{createName}
              </Text>
            ) : null}

            <Text style={[s.label, { color: colors.mutedForeground }]}>DESCRIÇÃO (OPCIONAL)</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={createDesc}
              onChangeText={setCreateDesc}
              placeholder="Descrição do projeto..."
              placeholderTextColor={colors.mutedForeground}
            />

            <Text style={[s.label, { color: colors.mutedForeground }]}>MENSAGEM DO ENVIO</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={createMsg}
              onChangeText={setCreateMsg}
              placeholderTextColor={colors.mutedForeground}
            />

            <TouchableOpacity
              onPress={() => setCreatePrivate(!createPrivate)}
              style={[s.privacyToggle, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <Feather name={createPrivate ? "lock" : "unlock"} size={16} color={createPrivate ? "#f59e0b" : "#22c55e"} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14 }}>
                  Repositório {createPrivate ? "Privado" : "Público"}
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>
                  {createPrivate ? "Só você pode ver" : "Qualquer pessoa pode ver"}
                </Text>
              </View>
              <View style={[s.privacyDot, { backgroundColor: createPrivate ? "#f59e0b" : "#22c55e" }]} />
            </TouchableOpacity>

            {activeProject && (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginVertical: 8 }}>
                {activeProject.files.length} arquivo{activeProject.files.length !== 1 ? "s" : ""} serão enviados
              </Text>
            )}

            {createResult && (
              <View style={[s.resultBox, { backgroundColor: createResult.ok ? "#22c55e22" : "#ef444422", borderColor: createResult.ok ? "#22c55e" : "#ef4444" }]}>
                <Text style={{ color: createResult.ok ? "#22c55e" : "#ef4444", fontWeight: "600" }}>{createResult.msg}</Text>
              </View>
            )}

            <TouchableOpacity
              onPress={handleCreateAndPush}
              disabled={!createName.trim() || creating}
              style={[s.btn, { backgroundColor: createName.trim() && !creating ? "#22c55e" : colors.secondary, marginTop: 8 }]}
            >
              {creating ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="upload-cloud" size={16} color="#fff" />}
              <Text style={[s.btnText, { color: "#fff" }]}>{creating ? "Enviando..." : "Criar e Enviar"}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}

        {/* ── PUSH EXISTING VIEW ── */}
        {view === "push-existing" && (
          <ScrollView contentContainerStyle={s.body}>
            <Text style={[s.tip, { color: colors.mutedForeground }]}>
              Enviar os arquivos do projeto atual para um repositório já existente no GitHub.
            </Text>

            <Text style={[s.label, { color: colors.mutedForeground }]}>OWNER (usuário ou organização)</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={pushOwner}
              onChangeText={setPushOwner}
              placeholder={ghUser?.login || "usuario"}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[s.label, { color: colors.mutedForeground }]}>NOME DO REPOSITÓRIO</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={pushRepo}
              onChangeText={setPushRepo}
              placeholder="nome-do-repositorio"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <Text style={[s.label, { color: colors.mutedForeground }]}>MENSAGEM DO COMMIT</Text>
            <TextInput
              style={[s.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={pushMsg}
              onChangeText={setPushMsg}
              placeholderTextColor={colors.mutedForeground}
            />

            {activeProject && (
              <Text style={{ color: colors.mutedForeground, fontSize: 12, marginVertical: 8 }}>
                {activeProject.files.length} arquivo{activeProject.files.length !== 1 ? "s" : ""} serão enviados
              </Text>
            )}

            {pushResult && (
              <View>
                <View style={[s.resultBox, { backgroundColor: pushResult.ok ? "#22c55e22" : "#ef444422", borderColor: pushResult.ok ? "#22c55e" : "#ef4444" }]}>
                  <Text style={{ color: pushResult.ok ? "#22c55e" : "#ef4444", fontWeight: "600" }}>{pushResult.msg}</Text>
                </View>
                {pushResult.ok && pushOwner.trim() && pushRepo.trim() && (
                  <View style={{ marginTop: 10, gap: 8 }}>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>
                      Abrir no Editor
                    </Text>
                    {[
                      { label: "VS Code Web", desc: "Editor completo, grátis", url: `https://github.dev/${pushOwner.trim()}/${pushRepo.trim()}`, color: "#007acc", emoji: "🌐" },
                      { label: "StackBlitz", desc: "VS Code + Node.js + npm, grátis", url: `https://stackblitz.com/github/${pushOwner.trim()}/${pushRepo.trim()}`, color: "#1389fd", emoji: "⚡" },
                      { label: "Gitpod", desc: "Terminal Linux completo, 50h grátis/mês", url: `https://gitpod.io/#https://github.com/${pushOwner.trim()}/${pushRepo.trim()}`, color: "#ff8a00", emoji: "🟠" },
                    ].map((item) => (
                      <TouchableOpacity
                        key={item.label}
                        onPress={() => { const { Linking } = require("react-native"); Linking.openURL(item.url); }}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 10,
                          padding: 12,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: item.color + "44",
                          backgroundColor: item.color + "11",
                        }}
                      >
                        <Text style={{ fontSize: 18 }}>{item.emoji}</Text>
                        <View style={{ flex: 1 }}>
                          <Text style={{ color: item.color, fontWeight: "700", fontSize: 13 }}>{item.label}</Text>
                          <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>{item.desc}</Text>
                        </View>
                        <Feather name="external-link" size={14} color={item.color + "99"} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              onPress={handlePushExisting}
              disabled={!pushOwner.trim() || !pushRepo.trim() || pushing}
              style={[s.btn, { backgroundColor: pushOwner.trim() && pushRepo.trim() && !pushing ? colors.primary : colors.secondary, marginTop: 8 }]}
            >
              {pushing ? <ActivityIndicator size="small" color="#fff" /> : <Feather name="upload" size={16} color="#fff" />}
              <Text style={[s.btnText, { color: "#fff" }]}>{pushing ? "Enviando..." : "Enviar para repo existente"}</Text>
            </TouchableOpacity>
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: "700" },
  ghIcon: { width: 32, height: 32, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  backBtn: { padding: 2 },
  body: { padding: 16, gap: 10, paddingBottom: 60 },
  label: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginTop: 4 },
  sectionTitle: { fontSize: 11, fontWeight: "700", letterSpacing: 0.8, marginBottom: 4, marginTop: 6 },
  tip: { fontSize: 13, lineHeight: 18, marginBottom: 4 },
  tipBox: { borderRadius: 10, padding: 12, borderWidth: 1, gap: 2 },
  tipBoxTitle: { fontWeight: "700", fontSize: 13, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
  },
  btnText: { fontWeight: "700", fontSize: 15 },
  userBadge: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
    marginBottom: 4,
  },
  ghDot: { width: 10, height: 10, borderRadius: 5 },
  projectBox: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    gap: 2,
    marginBottom: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  actionIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  actionLabel: { fontSize: 15, fontWeight: "600" },
  actionDesc: { fontSize: 12, marginTop: 1 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14, padding: 0 },
  repoItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  downloadBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  privacyToggle: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  privacyDot: { width: 10, height: 10, borderRadius: 5 },
  resultBox: {
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    marginTop: 4,
  },
});
