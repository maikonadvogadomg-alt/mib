import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
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
import type { TerminalLine } from "@/context/AppContext";

const TAB_BAR_HEIGHT = Platform.OS === "web" ? 84 : 80;


const QUICK_CMDS_SERVER = [
  { label: "🚀 node index.js", cmd: "nohup node index.js > server.log 2>&1 & echo '✅ Servidor iniciado! PID='$!" },
  { label: "🚀 python3 main.py", cmd: "nohup python3 main.py > server.log 2>&1 & echo '✅ Servidor iniciado! PID='$!" },
  { label: "🚀 npm run dev", cmd: "nohup npm run dev > server.log 2>&1 & echo '✅ Servidor iniciado! PID='$!" },
  { label: "🚀 npm start", cmd: "nohup npm start > server.log 2>&1 & echo '✅ Servidor iniciado! PID='$!" },
  { label: "📋 logs servidor", cmd: "tail -50 server.log" },
  { label: "⛔ parar servidor", cmd: "pkill -f 'node index.js' || pkill -f 'python3 main.py' || pkill -f 'npm' && echo '✅ Servidor parado'" },
  { label: "npm install", cmd: "npm install" },
  { label: "npm install express", cmd: "npm install express" },
  { label: "npm init -y", cmd: "npm init -y" },
  { label: "ls -la", cmd: "ls -la" },
  { label: "cat package.json", cmd: "cat package.json" },
  { label: "node --version", cmd: "node --version" },
  { label: "git init", cmd: "git init" },
  { label: "git status", cmd: "git status" },
  { label: "pwd && ls", cmd: "pwd && ls -la" },
  { label: "limpar", cmd: "limpar" },
];

interface TerminalProps {
  runCmd?: string | null;
  onCmdRan?: () => void;
}

export default function Terminal({ runCmd, onCmdRan }: TerminalProps = {}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const apiBase = useApiBase();
  const TERMINAL_API = apiBase ? `${apiBase}/api/terminal` : "";
  const {
    terminalSessions,
    activeTerminal,
    addTerminalLine,
    clearTerminal,
    addTerminalSession,
    setActiveTerminal,
    removeTerminalSession,
    activeProject,
  } = useApp();

  const [input, setInput] = useState("");
  const [commandHistory, setCommandHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [showQuick, setShowQuick] = useState(false);
  const [serverBusy, setServerBusy] = useState(false);
  const [serverOnline, setServerOnline] = useState<boolean | null>(null);
  const listRef = useRef<FlatList>(null);
  const inputRef = useRef<TextInput>(null);

  // Verifica se o servidor está acessível
  useEffect(() => {
    if (!TERMINAL_API) { setServerOnline(false); return; }
    const check = async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3000);
        const r = await fetch(TERMINAL_API.replace("/terminal", "/healthz"), { signal: ctrl.signal });
        clearTimeout(t);
        setServerOnline(r.ok);
      } catch { setServerOnline(false); }
    };
    check();
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, [TERMINAL_API]);


  const activeSession = terminalSessions.find((s) => s.id === activeTerminal);

  useEffect(() => {
    if (!runCmd) return;
    const timer = setTimeout(() => {
      runCommand(runCmd);
      onCmdRan?.();
    }, 150);
    return () => clearTimeout(timer);
  }, [runCmd]);

  const bottomPad = insets.bottom + TAB_BAR_HEIGHT;

  useEffect(() => {
    if (terminalSessions.length === 0) {
      const welcome = (n: number) => `╔══════════════════════════════════════╗
║   DevMobile Terminal ${n}  — Linux Real  ║
╚══════════════════════════════════════╝

🖥️  Servidor Linux real — todos os comandos executam de verdade
📦  npm install, pip install, apt, git — tudo funciona
⚡  Sem simulação. Sem limite de pacotes.

Projeto ativo: ${activeProject?.name || "(nenhum)"}
$ `;
      const s1 = addTerminalSession("Terminal 1");
      addTerminalLine(s1.id, { type: "info", content: welcome(1) });
      const s2 = addTerminalSession("Terminal 2");
      addTerminalLine(s2.id, { type: "info", content: welcome(2) });
      const s3 = addTerminalSession("Terminal 3");
      addTerminalLine(s3.id, { type: "info", content: welcome(3) });
    }
  }, []);

  const scrollToEnd = useCallback(() => {
    setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 80);
  }, []);

  const execOnServer = useCallback(
    async (sessionId: string, command: string) => {
      if (!TERMINAL_API) {
        addTerminalLine(sessionId, {
          type: "error",
          content: "Servidor não configurado (EXPO_PUBLIC_DOMAIN ausente).",
        });
        return;
      }
      setServerBusy(true);
      try {
        const res = await fetch(`${TERMINAL_API}/exec`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ command, sessionId }),
        });
        if (!res.ok) {
          const msg = await res.text().catch(() => `HTTP ${res.status}`);
          addTerminalLine(sessionId, { type: "error", content: `Erro do servidor: ${msg}` });
          return;
        }
        const processSSELine = (line: string) => {
          if (line.startsWith(": ")) return; // ignora heartbeat e comentários SSE
          if (!line.startsWith("data: ")) return;
          const raw = line.slice(6).trim();
          try {
            const parsed = JSON.parse(raw);
            if (parsed.done) return true;
            if (parsed.type === "stdout") addTerminalLine(sessionId, { type: "output", content: parsed.data });
            else if (parsed.type === "stderr") addTerminalLine(sessionId, { type: "output", content: parsed.data });
            else if (parsed.type === "error") addTerminalLine(sessionId, { type: "error", content: parsed.data });
            else if (parsed.type === "exit" && parsed.data !== "0")
              addTerminalLine(sessionId, { type: "info", content: `[exit ${parsed.data}]\n` });
          } catch {}
          return false;
        };

        if (Platform.OS === "web" || !res.body) {
          const text = await res.text();
          for (const line of text.split("\n")) {
            if (processSSELine(line)) break;
          }
        } else {
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = "";
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split("\n");
            buf = lines.pop() ?? "";
            for (const line of lines) {
              if (processSSELine(line)) { reader.cancel(); return; }
            }
            scrollToEnd();
          }
        }
      } catch (e) {
        addTerminalLine(sessionId, {
          type: "error",
          content: `Erro de conexão: ${e instanceof Error ? e.message : String(e)}`,
        });
      } finally {
        setServerBusy(false);
        scrollToEnd();
      }
    },
    [TERMINAL_API, addTerminalLine, scrollToEnd]
  );

  const uploadProjectToServer = useCallback(
    async (sessionId: string) => {
      if (!activeProject) {
        addTerminalLine(sessionId, { type: "error", content: "Nenhum projeto ativo. Abra um projeto primeiro." });
        return;
      }
      if (!TERMINAL_API) {
        addTerminalLine(sessionId, { type: "error", content: "Servidor não configurado." });
        return;
      }
      addTerminalLine(sessionId, { type: "info", content: `📤 Enviando "${activeProject.name}" para o servidor...` });
      setServerBusy(true);
      try {
        const res = await fetch(`${TERMINAL_API}/write`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            files: activeProject.files.map((f) => ({
              path: f.name,
              content: f.content,
            })),
          }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        addTerminalLine(sessionId, {
          type: "output",
          content: `✅ ${data.count} arquivo(s) enviados!\n📁 Workspace: ${data.cwd}\n\nAgora rode: npm install && node index.js`,
        });
      } catch (e) {
        addTerminalLine(sessionId, {
          type: "error",
          content: `Erro ao enviar: ${e instanceof Error ? e.message : String(e)}`,
        });
      } finally {
        setServerBusy(false);
        scrollToEnd();
      }
    },
    [activeProject, addTerminalLine, scrollToEnd]
  );

  /* simulation removed — all commands use real Linux server */

  const runCommand = useCallback(
    async (cmd: string) => {
      if (!activeSession) return;
      const trimmed = cmd.trim();
      if (!trimmed) return;

      setCommandHistory((prev) => [trimmed, ...prev.slice(0, 99)]);
      setHistoryIndex(-1);

      if (Platform.OS !== "web") {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }

      const parts = trimmed.split(/\s+/);
      const command = parts[0].toLowerCase();
      const args = parts.slice(1);

      if (command === "limpar" || command === "clear") {
        clearTerminal(activeSession.id);
        return;
      }

      addTerminalLine(activeSession.id, { type: "input", content: `$ ${trimmed}` });
      scrollToEnd();

      const isRunFile =
        (["node", "python", "python3", "bash", "ruby", "php", "go"].includes(command) &&
          args.length > 0 && !args[0].startsWith("-")) ||
        (command === "npx" && args.length > 1);
      if (isRunFile && activeProject && TERMINAL_API) {
        await uploadProjectToServer(activeSession.id);
      }
      await execOnServer(activeSession.id, trimmed);
    },
    [activeSession, activeProject, addTerminalLine, clearTerminal, scrollToEnd, execOnServer, uploadProjectToServer]
  );


  const handleCtrlC = useCallback(async () => {
    if (!activeSession || !TERMINAL_API) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    addTerminalLine(activeSession.id, { type: "info", content: "^C" });
    try {
      await fetch(`${TERMINAL_API}/interrupt`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: activeSession.id }),
      });
    } catch {}
    setServerBusy(false);
  }, [activeSession, TERMINAL_API, addTerminalLine]);

  const handleSubmit = () => {
    if (input.trim()) {
      runCommand(input);
      setInput("");
    }
  };

  const handleHistoryUp = () => {
    const newIndex = Math.min(historyIndex + 1, commandHistory.length - 1);
    setHistoryIndex(newIndex);
    if (commandHistory[newIndex]) setInput(commandHistory[newIndex]);
  };

  const handleHistoryDown = () => {
    const newIndex = Math.max(historyIndex - 1, -1);
    setHistoryIndex(newIndex);
    setInput(newIndex === -1 ? "" : commandHistory[newIndex]);
  };

  const renderLine = ({ item }: { item: TerminalLine }) => {
    const color =
      item.type === "input"
        ? colors.primary
        : item.type === "error"
          ? colors.destructive
          : item.type === "info"
            ? colors.info
            : colors.foreground;
    return (
      <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
        <Text
          style={[
            styles.line,
            {
              color,
              fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
              fontSize: 14,
              flex: 1,
              backgroundColor: item.type === "error" ? colors.destructive + "18" : undefined,
              borderLeftWidth: item.type === "input" ? 2 : 0,
              borderLeftColor: colors.primary,
              paddingLeft: item.type === "input" ? 6 : 2,
            },
          ]}
          selectable
        >
          {item.content}
        </Text>
        {item.type !== "input" && (
          <TouchableOpacity
            onPress={() => {
              Clipboard.setStringAsync(item.content);
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }}
            hitSlop={{ top: 4, bottom: 4, left: 6, right: 6 }}
            style={{ padding: 4, marginTop: 2, opacity: 0.45 }}
          >
            <Feather name="copy" size={10} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.terminalBg }]}
      behavior={Platform.OS === "ios" ? "padding" : "padding"}
      keyboardVerticalOffset={TAB_BAR_HEIGHT}
    >
      {/* Session Tabs */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", gap: 4, paddingHorizontal: 4 }}>
            {terminalSessions.map((s) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => setActiveTerminal(s.id)}
                style={[
                  styles.tab,
                  {
                    backgroundColor: s.id === activeTerminal ? colors.secondary : "transparent",
                    borderColor: s.id === activeTerminal ? colors.primary : colors.border,
                  },
                ]}
              >
                <Feather
                  name="terminal"
                  size={11}
                  color={s.id === activeTerminal ? colors.primary : colors.mutedForeground}
                />
                <Text
                  style={[
                    styles.tabText,
                    { color: s.id === activeTerminal ? colors.primary : colors.mutedForeground },
                  ]}
                >
                  {s.name}
                </Text>
                {terminalSessions.length > 1 && (
                  <TouchableOpacity
                    onPress={() => removeTerminalSession(s.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Feather name="x" size={10} color={colors.mutedForeground} />
                  </TouchableOpacity>
                )}
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
        <TouchableOpacity
          onPress={() => {
            const s = addTerminalSession(`Terminal ${terminalSessions.length + 1}`);
            addTerminalLine(s.id, {
              type: "info",
              content: `DevMobile Terminal — ${new Date().toLocaleString("pt-BR")}\nDigite 'ajuda' para os comandos.\n`,
            });
          }}
          style={styles.addTab}
        >
          <Feather name="plus" size={16} color={colors.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => activeSession && clearTerminal(activeSession.id)}
          style={styles.addTab}
        >
          <Feather name="trash-2" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
        <TouchableOpacity
          onPress={scrollToEnd}
          style={styles.addTab}
        >
          <Feather name="chevrons-down" size={14} color={colors.mutedForeground} />
        </TouchableOpacity>
        {/* Indicador de servidor ativo */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginRight: 4 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: serverBusy ? "#f59e0b" : "#00d4aa" }} />
          <Text style={{ fontSize: 9, color: "#00d4aa", fontWeight: "700" }}>
            {serverBusy ? "EXEC" : "LIVE"}
          </Text>
        </View>
      </View>

      {/* Banner servidor — online / offline / verificando */}
      {serverOnline === false ? (
        <View style={{ backgroundColor: "#1a0d00", borderBottomWidth: 1, borderBottomColor: "#f59e0b44", paddingHorizontal: 12, paddingVertical: 8 }}>
          <Text style={{ color: "#f59e0b", fontSize: 12, fontWeight: "700", marginBottom: 4 }}>
            📡 Sem servidor — use uma das opções abaixo:
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            <TouchableOpacity
              onPress={() => {
                const setupUrl = apiBase
                  ? `${apiBase}/api/termux/setup.sh`
                  : "https://SEU_SERVIDOR/api/termux/setup.sh";
                Alert.alert(
                  "📱 Termux — Terminal no Celular",
                  "Transforme seu Android num servidor Linux.\n\n" +
                  "⚠️ FAÇA ISSO ENQUANTO O SERVIDOR AINDA ESTIVER LIGADO!\n\n" +
                  "1. Instale Termux (F-Droid — NÃO da Play Store)\n" +
                  "2. Abra o Termux e cole este comando:\n\n" +
                  `curl -fsSL "${setupUrl}" | bash\n\n` +
                  "3. Aguarde instalar (Node.js + servidor)\n" +
                  "4. O app já detecta automaticamente em localhost:8080\n\n" +
                  "Após instalar: abra o Termux e rode:\n  bash ~/start-devmobile.sh",
                  [{ text: "Fechar" }]
                );
              }}
              style={{ backgroundColor: "#22c55e22", borderWidth: 1, borderColor: "#22c55e55", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <Text style={{ fontSize: 13 }}>📱</Text>
              <Text style={{ color: "#22c55e", fontSize: 11, fontWeight: "700" }}>Termux (offline)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert(
                "🐙 GitHub Codespaces (grátis)",
                "VS Code + terminal na nuvem. 60 horas/mês grátis.\n\n" +
                "1. Acesse github.com → crie ou abra um repositório\n" +
                "2. Botão verde 'Code' → aba 'Codespaces'\n" +
                "3. Clique em 'New codespace'\n" +
                "4. No terminal do Codespace, execute:\n\n" +
                "curl -fsSL https://raw.githubusercontent.com/oab183/devmobile/main/server.mjs -o ~/server.mjs 2>/dev/null || node -e \"console.log('configure server URL')\"\n\n" +
                "5. Clique na aba 'Ports' → Porta 8080 → 'Make Public'\n" +
                "6. Copie a URL da porta 8080\n" +
                "7. No DevMobile: Configurações → Servidor Custom → cole a URL",
                [{ text: "Fechar" }]
              )}
              style={{ backgroundColor: "#60a5fa22", borderWidth: 1, borderColor: "#60a5fa55", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <Text style={{ fontSize: 13 }}>🐙</Text>
              <Text style={{ color: "#60a5fa", fontSize: 11, fontWeight: "700" }}>Codespaces</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => Alert.alert(
                "☁️ Oracle Cloud (sempre grátis)",
                "VM Ubuntu grátis para sempre na Oracle.\n\n" +
                "1. Acesse oracle.com/free → crie conta\n" +
                "2. Crie uma VM: Ubuntu 22.04, Always Free\n" +
                "3. Abra o terminal SSH da VM e execute:\n\n" +
                "curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash - && sudo apt-get install -y nodejs git && mkdir -p ~/devmobile-server\n\n" +
                "4. Baixe o servidor DevMobile no terminal da VM\n" +
                "5. Use o IP público da VM em:\n   Configurações → Servidor Custom",
                [{ text: "Fechar" }]
              )}
              style={{ backgroundColor: "#f8717122", borderWidth: 1, borderColor: "#f8717155", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, flexDirection: "row", alignItems: "center", gap: 5 }}
            >
              <Text style={{ fontSize: 13 }}>☁️</Text>
              <Text style={{ color: "#f87171", fontSize: 11, fontWeight: "700" }}>Oracle (grátis)</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={[styles.serverBanner, { backgroundColor: serverOnline ? "#00d4aa12" : "#007acc12", borderColor: serverOnline ? "#00d4aa44" : "#007acc44" }]}>
          <Text style={{ color: serverOnline ? "#00d4aa" : "#007acc", fontSize: 10, fontWeight: "600", flex: 1 }}>
            {serverBusy ? "⏳ Executando comando..." : serverOnline ? "🐧 Servidor Linux online — bash, python3, node, git, npm, pip" : "🔄 Conectando ao servidor..."}
          </Text>
          {serverBusy && <ActivityIndicator size="small" color="#00d4aa" />}
          {!serverBusy && serverOnline && activeProject && (
            <TouchableOpacity
              onPress={() => activeSession && uploadProjectToServer(activeSession.id)}
              style={{ backgroundColor: "#00d4aa33", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}
            >
              <Text style={{ color: "#00d4aa", fontSize: 10, fontWeight: "700" }}>📤 Projeto</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Saída */}
      <FlatList
        ref={listRef}
        data={activeSession?.history ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderLine}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 10, paddingBottom: 20 }}
        onContentSizeChange={scrollToEnd}
        onLayout={scrollToEnd}
        ListEmptyComponent={
          <Text style={[styles.line, { color: colors.mutedForeground, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
            Terminal vazio. Execute um comando abaixo.{"\n"}Digite 'ajuda' para ver os comandos disponíveis.
          </Text>
        }
      />

      {/* Comandos rápidos */}
      {showQuick && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={[styles.quickBar, { backgroundColor: colors.card, borderColor: colors.border }]}
          contentContainerStyle={{ paddingHorizontal: 8, gap: 6, alignItems: "center" }}
        >
          {QUICK_CMDS_SERVER.map(({ label, cmd }) => (
            <TouchableOpacity
              key={cmd}
              onPress={() => {
                setInput(cmd);
                setShowQuick(false);
                inputRef.current?.focus();
              }}
              style={[styles.quickBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
            >
              <Text style={[styles.quickText, { color: colors.foreground, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Campo de entrada fixo */}
        <View
          style={[
            styles.inputRow,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingBottom: Math.max(insets.bottom, 8),
            },
          ]}
        >
          {/* ⚡ Comandos rápidos */}
          <TouchableOpacity
            onPress={() => setShowQuick((v) => !v)}
            style={[styles.histBtn, { backgroundColor: showQuick ? colors.primary + "33" : colors.secondary }]}
          >
            <Feather name="zap" size={13} color={showQuick ? colors.primary : colors.mutedForeground} />
          </TouchableOpacity>

          {/* 🎙️ Voz — antes do histórico para ficar longe do botão Enviar */}
          <TouchableOpacity
            onPress={() => {
              if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              inputRef.current?.focus();
              Alert.alert(
                "🎙️ Entrada por Voz",
                "Toque no ícone de microfone (🎤) do teclado para ditar.\n\nAndroid: botão 🎤 ao lado da barra de espaço\niOS: botão 🎤 ao lado da barra de espaço\n\nO texto ditado aparecerá no campo de comando.",
                [{ text: "OK" }]
              );
            }}
            style={[styles.histBtn, { backgroundColor: "#7c3aed22" }]}
          >
            <Feather name="mic" size={14} color="#7c3aed" />
          </TouchableOpacity>

          {/* ↑ Histórico anterior */}
          <TouchableOpacity onPress={handleHistoryUp} style={[styles.histBtn, { backgroundColor: colors.secondary }]}>
            <Feather name="chevron-up" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Prompt $ */}
          <Text style={[styles.prompt, { color: colors.primary, fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" }]}>$</Text>

          {/* Campo de texto */}
          <TextInput
            ref={inputRef}
            style={[
              styles.input,
              {
                color: colors.foreground,
                fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
                fontSize: 13,
              },
            ]}
            value={input}
            onChangeText={setInput}
            onSubmitEditing={handleSubmit}
            returnKeyType="send"
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            placeholder="Digite um comando..."
            placeholderTextColor={colors.mutedForeground}
          />

          {/* ↓ Histórico próximo */}
          <TouchableOpacity onPress={handleHistoryDown} style={[styles.histBtn, { backgroundColor: colors.secondary }]}>
            <Feather name="chevron-down" size={14} color={colors.mutedForeground} />
          </TouchableOpacity>

          {/* Ctrl+C — interrompe processo ativo */}
          {serverBusy && (
            <TouchableOpacity
              onPress={handleCtrlC}
              style={[styles.ctrlCBtn]}
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
            >
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "800" }}>^C</Text>
            </TouchableOpacity>
          )}

          {/* Executar ↵ */}
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={serverBusy && !input.trim()}
            style={[styles.sendBtn, { backgroundColor: input.trim() ? colors.primary : colors.secondary }]}
          >
            <Feather name="corner-down-left" size={16} color={input.trim() ? colors.primaryForeground : colors.mutedForeground} />
          </TouchableOpacity>
        </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  tabBar: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    paddingVertical: 4,
    minHeight: 36,
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 4,
    borderWidth: 1,
  },
  tabText: { fontSize: 11, fontWeight: "500" },
  addTab: { paddingHorizontal: 10, paddingVertical: 4 },
  line: { lineHeight: 20, paddingHorizontal: 2, marginBottom: 2 },
  serverBanner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: 1,
    gap: 8,
  },
  quickBar: {
    maxHeight: 40,
    borderTopWidth: 1,
    paddingVertical: 4,
  },
  quickBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 4,
    borderWidth: 1,
  },
  quickText: { fontSize: 11 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    gap: 6,
  },
  prompt: { fontSize: 16, fontWeight: "bold" },
  input: { flex: 1, height: 44, fontSize: 14 },
  histBtn: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  ctrlCBtn: {
    backgroundColor: "#ef4444",
    paddingHorizontal: 8,
    height: 34,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    minWidth: 34,
  },
});
