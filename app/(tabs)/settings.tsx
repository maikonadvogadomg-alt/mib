import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useState } from "react";
import SystemStatus from "@/components/SystemStatus";
import AIMemoryModal from "@/components/AIMemoryModal";
import CheckpointsModal from "@/components/CheckpointsModal";
import ProjectOverviewModal from "@/components/ProjectOverviewModal";
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import type { AIProvider, GitConfig, DBConfig } from "@/context/AppContext";

type AIProviderType = AIProvider["type"];

const AI_PROVIDERS: { type: AIProviderType; label: string; placeholder: string; noKey?: boolean }[] = [
  { type: "cortesia",   label: "✨ Cortesia Gemini (grátis)", placeholder: "",         noKey: true },
  { type: "groq",       label: "Groq (Grátis/Rápido)",       placeholder: "gsk_..." },
  { type: "openai",     label: "OpenAI",                      placeholder: "sk-..." },
  { type: "anthropic",  label: "Anthropic Claude",            placeholder: "sk-ant-..." },
  { type: "gemini",     label: "Google Gemini",               placeholder: "AIza..." },
  { type: "xai",        label: "xAI / Grok",                  placeholder: "xai-..." },
  { type: "openrouter", label: "OpenRouter",                  placeholder: "sk-or-..." },
  { type: "perplexity", label: "Perplexity",                  placeholder: "pplx-..." },
  { type: "deepseek",   label: "DeepSeek",                    placeholder: "sk-..." },
  { type: "mistral",    label: "Mistral AI",                  placeholder: "..." },
  { type: "custom",     label: "Custom (OpenAI Compatível)",  placeholder: "Bearer token..." },
];

const AI_MODELS: Record<AIProviderType, string[]> = {
  cortesia:   ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"],
  groq:       [
    "llama-3.3-70b-versatile",
    "llama-3.1-8b-instant",
    "llama3-70b-8192",
    "llama3-8b-8192",
    "mixtral-8x7b-32768",
    "gemma2-9b-it",
    "gemma-7b-it",
    "llama-3.1-70b-versatile",
    "qwen-qwq-32b",
    "deepseek-r1-distill-llama-70b",
  ],
  openai:     ["gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini", "o1", "o1-mini", "gpt-3.5-turbo"],
  anthropic:  ["claude-opus-4-5", "claude-sonnet-4-5", "claude-haiku-4-20250514", "claude-3-7-sonnet-latest", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"],
  gemini:     ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash", "gemini-2.0-flash-lite", "gemini-1.5-pro", "gemini-1.5-flash"],
  xai:        ["grok-3", "grok-3-mini", "grok-2-latest", "grok-2-mini", "grok-beta"],
  openrouter: [
    "google/gemini-2.5-flash-preview",
    "google/gemini-2.5-pro-preview",
    "openai/gpt-4.1",
    "openai/gpt-4o-mini",
    "anthropic/claude-opus-4-5",
    "anthropic/claude-sonnet-4-5",
    "anthropic/claude-3-haiku",
    "meta-llama/llama-3.3-70b-instruct",
    "deepseek/deepseek-chat",
    "deepseek/deepseek-r1",
    "mistralai/mistral-large",
    "qwen/qwen-2.5-72b-instruct",
    "microsoft/phi-4",
    "nousresearch/hermes-3-llama-3.1-405b",
  ],
  perplexity: ["sonar-pro", "sonar", "sonar-reasoning-pro", "sonar-reasoning", "sonar-deep-research"],
  deepseek:   ["deepseek-chat", "deepseek-coder", "deepseek-reasoner"],
  mistral:    ["mistral-large-latest", "mistral-small-latest", "codestral-latest", "open-mixtral-8x22b", "open-mistral-7b"],
  custom:     [],
};

function SectionHeader({ title, colors }: { title: string; colors: ReturnType<typeof useColors> }) {
  return (
    <Text style={[settingsStyles.sectionHeader, { color: colors.mutedForeground }]}>
      {title}
    </Text>
  );
}

function SettingRow({
  label,
  sublabel,
  right,
  colors,
  onPress,
}: {
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
  colors: ReturnType<typeof useColors>;
  onPress?: () => void;
}) {
  const Inner = (
    <View style={[settingsStyles.row, { borderBottomColor: colors.border }]}>
      <View style={{ flex: 1 }}>
        <Text style={[settingsStyles.rowLabel, { color: colors.foreground }]}>{label}</Text>
        {sublabel ? (
          <Text style={[settingsStyles.rowSublabel, { color: colors.mutedForeground }]}>
            {sublabel}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
  return onPress ? (
    <TouchableOpacity onPress={onPress}>{Inner}</TouchableOpacity>
  ) : (
    Inner
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    aiProviders,
    gitConfigs,
    dbConfigs,
    settings,
    updateSettings,
    activeProject,
    saveCheckpoint,
    restoreCheckpoint,
    deleteCheckpoint,
    addAIProvider,
    removeAIProvider,
    setActiveAIProvider,
    addGitConfig,
    removeGitConfig,
    addDBConfig,
    removeDBConfig,
  } = useApp();

  const [systemPromptDraft, setSystemPromptDraft] = React.useState(settings.systemPrompt || "");
  const [checkpointLabel, setCheckpointLabel] = React.useState("");
  const [serverUrlDraft, setServerUrlDraft] = React.useState(settings.customServerUrl || "");
  const [serverUrlEditing, setServerUrlEditing] = React.useState(false);
  const [geminiKeyDraft, setGeminiKeyDraft] = React.useState(settings.geminiDirectKey || "");
  const [showGeminiKey, setShowGeminiKey] = React.useState(false);

  const [showAIModal, setShowAIModal] = useState(false);
  const [showGitModal, setShowGitModal] = useState(false);
  const [showDBModal, setShowDBModal] = useState(false);
  const [showStatus, setShowStatus] = useState(false);
  const [showMemory, setShowMemory] = useState(false);
  const [showCheckpoints, setShowCheckpoints] = useState(false);
  const [showOverview, setShowOverview] = useState(false);

  const [aiType, setAIType] = useState<AIProviderType>("openai");
  const [aiKey, setAIKey] = useState("");
  const [aiName, setAIName] = useState("");
  const [aiModel, setAIModel] = useState("");
  const [aiBaseUrl, setAIBaseUrl] = useState("");

  const [gitProvider, setGitProvider] = useState<"github" | "gitlab">("github");
  const [gitToken, setGitToken] = useState("");
  const [gitUsername, setGitUsername] = useState("");
  const [gitEmail, setGitEmail] = useState("");
  const [gitInstance, setGitInstance] = useState("https://gitlab.com");

  const [dbProvider, setDBProvider] = useState<"neon" | "postgres" | "sqlite">("neon");
  const [dbConnStr, setDBConnStr] = useState("");
  const [dbName, setDBName] = useState("");

  const topPadding = Platform.OS === "web" ? 14 : insets.top;
  const bottomPadding = Platform.OS === "web" ? 70 : Math.max(insets.bottom, 16) + 70;

  const detectKeyType = (key: string): AIProviderType => {
    const k = key.trim();
    if (k.startsWith("gsk_"))   return "groq";
    if (k.startsWith("sk-or-")) return "openrouter";
    if (k.startsWith("pplx-"))  return "perplexity";
    if (k.startsWith("AIza"))   return "gemini";
    if (k.startsWith("xai-"))   return "xai";
    if (k.startsWith("sk-ant")) return "anthropic";
    if (k.startsWith("sk-"))    return "openai";
    return "custom";
  };

  // Map the same AUTO_DETECT table as AIChat
  const AUTO_DETECT_SETTINGS: [string, string, string, string][] = [
    ["gsk_",   "https://api.groq.com/openai/v1",                           "llama-3.3-70b-versatile",  "Groq"],
    ["sk-or-", "https://openrouter.ai/api/v1",                             "openai/gpt-4o-mini",       "OpenRouter"],
    ["pplx-",  "https://api.perplexity.ai",                                "sonar-pro",                "Perplexity"],
    ["AIza",   "https://generativelanguage.googleapis.com/v1beta/openai/", "gemini-2.0-flash",         "Google Gemini"],
    ["xai-",   "https://api.x.ai/v1",                                      "grok-2-latest",            "xAI / Grok"],
    ["sk-ant", "https://api.anthropic.com/v1",                             "claude-haiku-4-20250514",  "Anthropic Claude"],
    ["sk-",    "https://api.openai.com/v1",                                "gpt-4o-mini",              "OpenAI"],
  ];

  const handleKeyChange = (key: string) => {
    setAIKey(key);
    if (key.length > 20) {
      const detected = detectKeyType(key);
      setAIType(detected);
      const det = AUTO_DETECT_SETTINGS.find(([p]) => key.trim().startsWith(p));
      if (det) {
        const [, url, model, name] = det;
        if (!aiName) setAIName(name);
        if (!aiModel) setAIModel(model);
        if (!aiBaseUrl) setAIBaseUrl(url);
      } else if (!aiName) {
        const found = AI_PROVIDERS.find((p) => p.type === detected);
        if (found) setAIName(found.label);
      }
    }
  };

  const handleAddAI = () => {
    const isCortesia = aiType === "cortesia";
    if (!isCortesia && !aiKey.trim()) return;
    const defaultModel = AI_MODELS[aiType]?.[0];
    addAIProvider({
      name: aiName || AI_PROVIDERS.find((p) => p.type === aiType)?.label || aiType,
      type: aiType,
      apiKey: isCortesia ? "" : aiKey.trim(),
      baseUrl: aiBaseUrl.trim() || undefined,
      model: aiModel.trim() || defaultModel || undefined,
      isActive: aiProviders.length === 0,
    });
    setShowAIModal(false);
    setAIKey("");
    setAIName("");
    setAIModel("");
    setAIBaseUrl("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleAddGit = () => {
    if (!gitToken.trim() || !gitUsername.trim()) return;
    addGitConfig({
      provider: gitProvider,
      token: gitToken.trim(),
      username: gitUsername.trim(),
      email: gitEmail.trim() || undefined,
      instanceUrl: gitProvider === "gitlab" ? gitInstance.trim() : undefined,
    });
    setShowGitModal(false);
    setGitToken("");
    setGitUsername("");
    setGitEmail("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleAddDB = () => {
    if (!dbConnStr.trim() || !dbName.trim()) return;
    addDBConfig({ provider: dbProvider, connectionString: dbConnStr.trim(), name: dbName.trim() });
    setShowDBModal(false);
    setDBConnStr("");
    setDBName("");
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPadding + 6,
            backgroundColor: colors.card,
            borderBottomColor: colors.border,
          },
        ]}
      >
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Configuracoes</Text>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: bottomPadding + 20 }}>
        {/* IA */}
        <SectionHeader title="INTELIGÊNCIA ARTIFICIAL" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {aiProviders.map((p) => (
            <SettingRow
              key={p.id}
              colors={colors}
              label={p.name}
              sublabel={p.model || p.type}
              right={
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  {p.isActive && (
                    <View style={[styles.activeBadge, { backgroundColor: colors.success }]}>
                      <Text style={styles.activeBadgeText}>Ativo</Text>
                    </View>
                  )}
                  {!p.isActive && (
                    <TouchableOpacity
                      onPress={() => setActiveAIProvider(p.id)}
                      style={[styles.badge, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.badgeText, { color: colors.mutedForeground }]}>
                        Usar
                      </Text>
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    onPress={() => {
                      if (Platform.OS === "web") {
                        removeAIProvider(p.id);
                      } else {
                        Alert.alert("Remover", `Remover ${p.name}?`, [
                          { text: "Cancelar", style: "cancel" },
                          { text: "Remover", style: "destructive", onPress: () => removeAIProvider(p.id) },
                        ]);
                      }
                    }}
                    style={{ padding: 4 }}
                  >
                    <Feather name="trash-2" size={16} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              }
            />
          ))}
          <SettingRow
            colors={colors}
            label="Adicionar Provedor de IA"
            onPress={() => setShowAIModal(true)}
            right={<Feather name="plus" size={16} color={colors.primary} />}
          />
        </View>

        {/* Git */}
        <SectionHeader title="GIT / CONTROLE DE VERSÃO" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {gitConfigs.map((g) => (
            <SettingRow
              key={g.provider}
              colors={colors}
              label={g.provider === "github" ? "GitHub" : "GitLab"}
              sublabel={g.username}
              right={
                <TouchableOpacity
                  style={{ padding: 4 }}
                  onPress={() => {
                    if (Platform.OS === "web") {
                      removeGitConfig(g.provider);
                    } else {
                      Alert.alert("Remover", `Remover config do ${g.provider}?`, [
                        { text: "Cancelar", style: "cancel" },
                        { text: "Remover", style: "destructive", onPress: () => removeGitConfig(g.provider) },
                      ]);
                    }
                  }}
                >
                  <Feather name="trash-2" size={16} color={colors.destructive} />
                </TouchableOpacity>
              }
            />
          ))}
          <SettingRow
            colors={colors}
            label="Conectar GitHub / GitLab"
            onPress={() => setShowGitModal(true)}
            right={<Feather name="plus" size={16} color={colors.primary} />}
          />
        </View>

        {/* DB */}
        <SectionHeader title="BANCO DE DADOS" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {dbConfigs.length > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: "#00d4aa18" }}>
              <Feather name="check-circle" size={13} color="#00d4aa" />
              <Text style={{ color: "#00d4aa", fontSize: 12, fontWeight: "600" }}>
                IA instruída para criar e gerenciar o banco de dados
              </Text>
            </View>
          )}
          {dbConfigs.map((d) => (
            <SettingRow
              key={d.name}
              colors={colors}
              label={d.name}
              sublabel={`${d.provider === "neon" ? "Neon PostgreSQL" : d.provider === "postgres" ? "PostgreSQL" : "SQLite"} · IA ativada`}
              right={
                <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
                  <View style={{ backgroundColor: "#00d4aa22", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                    <Text style={{ color: "#00d4aa", fontSize: 10, fontWeight: "700" }}>DB ✓</Text>
                  </View>
                  <TouchableOpacity
                    style={{ padding: 4 }}
                    onPress={() => {
                      if (Platform.OS === "web") {
                        removeDBConfig(d.name);
                      } else {
                        Alert.alert("Remover banco", `Remover "${d.name}"?\nA IA perderá o contexto do banco.`, [
                          { text: "Cancelar", style: "cancel" },
                          { text: "Remover", style: "destructive", onPress: () => removeDBConfig(d.name) },
                        ]);
                      }
                    }}
                  >
                    <Feather name="trash-2" size={16} color={colors.destructive} />
                  </TouchableOpacity>
                </View>
              }
            />
          ))}
          <SettingRow
            colors={colors}
            label="Adicionar Banco de Dados"
            sublabel="Neon, PostgreSQL ou SQLite"
            onPress={() => setShowDBModal(true)}
            right={<Feather name="plus" size={16} color={colors.primary} />}
          />
        </View>

        {/* Editor */}
        <SectionHeader title="EDITOR" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            colors={colors}
            label="Números de linha"
            right={
              <Switch
                value={settings.showLineNumbers}
                onValueChange={(v) => updateSettings({ showLineNumbers: v })}
                trackColor={{ false: colors.muted, true: colors.primary }}
              />
            }
          />
          <SettingRow
            colors={colors}
            label="Quebra de linha"
            right={
              <Switch
                value={settings.wordWrap}
                onValueChange={(v) => updateSettings({ wordWrap: v })}
                trackColor={{ false: colors.muted, true: colors.primary }}
              />
            }
          />
          <SettingRow
            colors={colors}
            label="Auto-salvar"
            right={
              <Switch
                value={settings.autoSave}
                onValueChange={(v) => updateSettings({ autoSave: v })}
                trackColor={{ false: colors.muted, true: colors.primary }}
              />
            }
          />
          <SettingRow
            colors={colors}
            label="Tamanho da fonte"
            sublabel={`${settings.fontSize}px`}
            right={
              <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
                <TouchableOpacity
                  onPress={() => updateSettings({ fontSize: Math.max(10, settings.fontSize - 1) })}
                  style={[styles.badge, { borderColor: colors.border }]}
                >
                  <Feather name="minus" size={12} color={colors.foreground} />
                </TouchableOpacity>
                <Text style={[styles.fontSizeText, { color: colors.foreground }]}>
                  {settings.fontSize}
                </Text>
                <TouchableOpacity
                  onPress={() => updateSettings({ fontSize: Math.min(24, settings.fontSize + 1) })}
                  style={[styles.badge, { borderColor: colors.border }]}
                >
                  <Feather name="plus" size={12} color={colors.foreground} />
                </TouchableOpacity>
              </View>
            }
          />
        </View>

        {/* Prompt personalizado da IA */}
        <SectionHeader title="ASSISTENTE IA — PROMPT PERSONALIZADO" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 6 }}>
            Instruções extras que a IA receberá em toda conversa (ex: "Seja breve e use TypeScript sempre")
          </Text>
          <TextInput
            value={systemPromptDraft}
            onChangeText={setSystemPromptDraft}
            placeholder="Ex: Prefiro TypeScript. Seja objetivo. Evite usar `any`."
            placeholderTextColor={colors.mutedForeground}
            multiline
            numberOfLines={4}
            style={{
              backgroundColor: colors.background,
              color: colors.foreground,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 10,
              fontSize: 13,
              fontFamily: "monospace",
              minHeight: 80,
              textAlignVertical: "top",
            }}
          />
          <TouchableOpacity
            onPress={() => {
              updateSettings({ systemPrompt: systemPromptDraft });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              Alert.alert("Salvo", "Prompt personalizado atualizado.");
            }}
            style={{
              marginTop: 10,
              backgroundColor: colors.primary,
              padding: 10,
              borderRadius: 8,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#000", fontWeight: "700", fontSize: 14 }}>Salvar Prompt</Text>
          </TouchableOpacity>
          {settings.systemPrompt ? (
            <TouchableOpacity
              onPress={() => { setSystemPromptDraft(""); updateSettings({ systemPrompt: "" }); }}
              style={{ marginTop: 6, alignItems: "center" }}
            >
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Limpar prompt</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Chave Gemini Direta (sem servidor) */}
        <SectionHeader title="GEMINI DIRETO DO CELULAR (SEM SERVIDOR)" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, marginBottom: 8, lineHeight: 18 }}>
            {"Chave gratuita do Google AI Studio → "}
            <Text style={{ color: colors.primary, fontWeight: "700" }}>aistudio.google.com</Text>
            {"\nCom ela, o Gemini funciona MESMO SEM o servidor Replit ligado."}
          </Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={geminiKeyDraft}
              onChangeText={setGeminiKeyDraft}
              placeholder="AIza..."
              placeholderTextColor={colors.mutedForeground}
              secureTextEntry={!showGeminiKey}
              autoCapitalize="none"
              autoCorrect={false}
              style={{
                flex: 1,
                backgroundColor: colors.background,
                color: colors.foreground,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: settings.geminiDirectKey ? "#22c55e" : colors.border,
                padding: 10,
                fontSize: 13,
                fontFamily: "monospace",
              }}
            />
            <TouchableOpacity onPress={() => setShowGeminiKey(v => !v)} style={{ padding: 8 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 16 }}>{showGeminiKey ? "🙈" : "👁️"}</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
            <TouchableOpacity
              onPress={() => {
                updateSettings({ geminiDirectKey: geminiKeyDraft.trim() });
                Alert.alert("Salvo!", geminiKeyDraft.trim() ? "Chave Gemini salva. O app usará Gemini direto se o servidor estiver offline." : "Chave removida.");
              }}
              style={{ flex: 1, backgroundColor: colors.primary, padding: 10, borderRadius: 8, alignItems: "center" }}
            >
              <Text style={{ color: "#000", fontWeight: "700", fontSize: 14 }}>Salvar Chave</Text>
            </TouchableOpacity>
            {settings.geminiDirectKey ? (
              <TouchableOpacity
                onPress={() => { setGeminiKeyDraft(""); updateSettings({ geminiDirectKey: "" }); }}
                style={{ padding: 10, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}
              >
                <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Remover</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {settings.geminiDirectKey ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#22c55e" }} />
              <Text style={{ color: "#22c55e", fontSize: 12, fontWeight: "600" }}>Chave configurada — Gemini funciona offline</Text>
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.mutedForeground }} />
              <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Sem chave — depende do servidor Replit</Text>
            </View>
          )}
        </View>

        {/* Checkpoints do projeto ativo */}
        {activeProject && (
          <>
            <SectionHeader title={`CHECKPOINTS — ${activeProject.name.toUpperCase()}`} colors={colors} />
            <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, padding: 12 }]}>
              <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                <TextInput
                  value={checkpointLabel}
                  onChangeText={setCheckpointLabel}
                  placeholder="Nome do checkpoint (opcional)"
                  placeholderTextColor={colors.mutedForeground}
                  style={{
                    flex: 1,
                    backgroundColor: colors.background,
                    color: colors.foreground,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingHorizontal: 10,
                    fontSize: 13,
                    height: 38,
                  }}
                />
                <TouchableOpacity
                  onPress={() => {
                    const cp = saveCheckpoint(activeProject.id, checkpointLabel || undefined);
                    setCheckpointLabel("");
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert("Checkpoint salvo", cp.label);
                  }}
                  style={{ backgroundColor: colors.primary, paddingHorizontal: 14, justifyContent: "center", borderRadius: 6 }}
                >
                  <Text style={{ color: "#000", fontWeight: "700", fontSize: 13 }}>+ Salvar</Text>
                </TouchableOpacity>
              </View>
              {(activeProject.checkpoints || []).length === 0 ? (
                <Text style={{ color: colors.mutedForeground, fontSize: 13, textAlign: "center", paddingVertical: 8 }}>
                  Nenhum checkpoint salvo ainda
                </Text>
              ) : (
                [...(activeProject.checkpoints || [])].reverse().map((cp) => (
                  <View
                    key={cp.id}
                    style={{ flexDirection: "row", alignItems: "center", paddingVertical: 8, borderTopWidth: 1, borderTopColor: colors.border, gap: 8 }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{cp.label}</Text>
                      <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                        {new Date(cp.createdAt).toLocaleString("pt-BR")} · {cp.files.length} arquivo(s)
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => Alert.alert(
                        "Restaurar checkpoint",
                        `Restaurar "${cp.label}"? O estado atual dos arquivos será sobrescrito.`,
                        [
                          { text: "Cancelar", style: "cancel" },
                          {
                            text: "Restaurar",
                            style: "destructive",
                            onPress: () => {
                              restoreCheckpoint(activeProject.id, cp.id);
                              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                              Alert.alert("Restaurado", `Projeto voltou para "${cp.label}"`);
                            },
                          },
                        ]
                      )}
                      style={{ padding: 6 }}
                    >
                      <Feather name="rotate-ccw" size={16} color={colors.primary} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => Alert.alert(
                        "Excluir checkpoint",
                        `Excluir "${cp.label}"?`,
                        [
                          { text: "Cancelar", style: "cancel" },
                          { text: "Excluir", style: "destructive", onPress: () => deleteCheckpoint(activeProject.id, cp.id) },
                        ]
                      )}
                      style={{ padding: 6 }}
                    >
                      <Feather name="trash-2" size={16} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          </>
        )}

        {/* Ferramentas do Sistema */}
        <SectionHeader title="FERRAMENTAS DO SISTEMA" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow
            colors={colors}
            label="🩺 Status do Sistema ao Vivo"
            sublabel="Diagnóstico: IA, terminal, Git, banco, PWA"
            onPress={() => setShowStatus(true)}
            right={<Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
          />
          <SettingRow
            colors={colors}
            label="🧠 Memória da IA"
            sublabel="Contexto persistente entre conversas"
            onPress={() => setShowMemory(true)}
            right={<Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
          />
          <SettingRow
            colors={colors}
            label="📸 Checkpoints do Projeto"
            sublabel="Salvar e restaurar versões do projeto"
            onPress={() => setShowCheckpoints(true)}
            right={<Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
          />
        </View>

        {/* Servidor */}
        <SectionHeader title="SERVIDOR BACKEND" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ padding: 14, gap: 10 }}>
            <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14 }}>
              URL do Servidor
            </Text>
            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
              Configure o servidor do seu celular via Termux para usar terminal offline 24h sem depender de nada externo. O app detecta o Termux automaticamente.
            </Text>

            {serverUrlEditing ? (
              <View style={{ gap: 8 }}>
                <TextInput
                  value={serverUrlDraft}
                  onChangeText={setServerUrlDraft}
                  placeholder="http://localhost:8080 ou http://192.168.1.x:8080"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                  style={{
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    borderWidth: 1,
                    borderRadius: 8,
                    padding: 10,
                    color: colors.foreground,
                    fontSize: 13,
                    fontFamily: "monospace",
                  }}
                />
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => {
                      const url = serverUrlDraft.trim();
                      updateSettings({ customServerUrl: url });
                      setServerUrlEditing(false);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      Alert.alert("Servidor salvo!", url ? `Usando: ${url}` : "Detecção automática ativada.");
                    }}
                    style={{ flex: 1, backgroundColor: colors.primary, borderRadius: 8, padding: 10, alignItems: "center" }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>Salvar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => { setServerUrlDraft(settings.customServerUrl || ""); setServerUrlEditing(false); }}
                    style={{ flex: 1, backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 8, padding: 10, alignItems: "center" }}
                  >
                    <Text style={{ color: colors.mutedForeground, fontSize: 13 }}>Cancelar</Text>
                  </TouchableOpacity>
                </View>
                {serverUrlDraft.trim() !== "" && (
                  <TouchableOpacity
                    onPress={() => { setServerUrlDraft(""); updateSettings({ customServerUrl: "" }); setServerUrlEditing(false); }}
                    style={{ alignItems: "center", padding: 6 }}
                  >
                    <Text style={{ color: "#ef4444", fontSize: 12 }}>Limpar URL</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TouchableOpacity
                onPress={() => setServerUrlEditing(true)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  borderWidth: 1,
                  borderRadius: 8,
                  padding: 10,
                }}
              >
                <Text style={{ color: settings.customServerUrl ? colors.foreground : colors.mutedForeground, fontSize: 13, fontFamily: "monospace", flex: 1 }}>
                  {settings.customServerUrl || "Automático (detecta Termux)"}
                </Text>
                <Feather name="edit-2" size={14} color={colors.mutedForeground} />
              </TouchableOpacity>
            )}

            {/* Atalho Modo Termux */}
            <TouchableOpacity
              onPress={() => {
                updateSettings({ customServerUrl: "http://localhost:8080" });
                setServerUrlDraft("http://localhost:8080");
                setServerUrlEditing(false);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert("Modo Termux ativado!", "O app vai usar http://localhost:8080.\n\nCertifique-se de que o servidor está rodando no Termux do seu celular.", [{ text: "OK" }]);
              }}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                backgroundColor: "#0d2137",
                borderColor: "#007acc",
                borderWidth: 1,
                borderRadius: 8,
                padding: 12,
              }}
            >
              <Text style={{ fontSize: 16 }}>📱</Text>
              <Text style={{ color: "#007acc", fontWeight: "700", fontSize: 13 }}>Ativar Modo Termux (localhost:8080)</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Modo Termux */}
        <SectionHeader title="MODO TERMUX — CELULAR COMO SERVIDOR" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={{ padding: 14, gap: 12 }}>

            {/* Status */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Text style={{ color: colors.foreground, fontWeight: "600", fontSize: 14 }}>
                Status atual
              </Text>
              <View style={{
                flexDirection: "row", alignItems: "center", gap: 6,
                backgroundColor: settings.customServerUrl?.includes("localhost") ? "#0d2b0d" : "#1a1a2e",
                borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
                borderWidth: 1,
                borderColor: settings.customServerUrl?.includes("localhost") ? "#22c55e" : colors.border,
              }}>
                <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: settings.customServerUrl?.includes("localhost") ? "#22c55e" : colors.mutedForeground }} />
                <Text style={{ color: settings.customServerUrl?.includes("localhost") ? "#22c55e" : colors.mutedForeground, fontSize: 12, fontWeight: "600" }}>
                  {settings.customServerUrl?.includes("localhost") ? "ATIVO" : "INATIVO"}
                </Text>
              </View>
            </View>

            <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 18 }}>
              Seu celular vira o servidor. Sem internet, sem Replit, sem nuvem. Terminal real, VS Code real, plugins reais — tudo rodando no seu Android via Termux.
            </Text>

            {/* Comandos de instalação */}
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                1. Instalar o servidor no Termux (uma vez):
              </Text>
              {(() => {
                const domain = (process.env.EXPO_PUBLIC_DOMAIN ?? "").replace(/\/$/, "");
                const cmd = domain
                  ? `curl -fsSL ${domain}/api/termux/setup.sh | bash`
                  : `curl -fsSL https://SEU_DOMINIO/api/termux/setup.sh | bash`;
                return (
                  <TouchableOpacity
                    onPress={async () => {
                      await Clipboard.setStringAsync(cmd);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      Alert.alert("Copiado!", "Cole no Termux e execute.\n\nIsso instala Node.js, o servidor e o VS Code automaticamente.", [{ text: "OK" }]);
                    }}
                    style={{
                      backgroundColor: "#0d1117",
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: "#30363d",
                      padding: 10,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <Text style={{ color: "#58d68d", fontSize: 11, fontFamily: "monospace", flex: 1 }} numberOfLines={2}>
                      {cmd}
                    </Text>
                    <Feather name="copy" size={14} color="#58d68d" />
                  </TouchableOpacity>
                );
              })()}
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                Toque para copiar → cole no Termux
              </Text>
            </View>

            {/* Passo 2 */}
            <View style={{ gap: 4 }}>
              <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                2. Iniciar o servidor (sempre que quiser usar):
              </Text>
              <TouchableOpacity
                onPress={async () => {
                  await Clipboard.setStringAsync("bash ~/start-devmobile.sh");
                  Haptics.selectionAsync();
                  Alert.alert("Copiado!", "Cole no Termux para iniciar o servidor.", [{ text: "OK" }]);
                }}
                style={{ backgroundColor: "#0d1117", borderRadius: 8, borderWidth: 1, borderColor: "#30363d", padding: 10, flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text style={{ color: "#58d68d", fontSize: 11, fontFamily: "monospace", flex: 1 }}>
                  bash ~/start-devmobile.sh
                </Text>
                <Feather name="copy" size={14} color="#58d68d" />
              </TouchableOpacity>
            </View>

            {/* Botão ativar */}
            {!settings.customServerUrl?.includes("localhost") ? (
              <TouchableOpacity
                onPress={() => {
                  updateSettings({ customServerUrl: "http://localhost:8080" });
                  setServerUrlDraft("http://localhost:8080");
                  setServerUrlEditing(false);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  Alert.alert("✅ Modo Termux ativado!", "O app agora usa http://localhost:8080.\n\nInicie o servidor no Termux e pronto!", [{ text: "Entendido" }]);
                }}
                style={{ backgroundColor: "#007acc", borderRadius: 8, padding: 13, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
              >
                <Text style={{ fontSize: 16 }}>📱</Text>
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>Ativar Modo Termux</Text>
              </TouchableOpacity>
            ) : (
              <View style={{ gap: 8 }}>
                <View style={{ backgroundColor: "#0d2b0d", borderRadius: 8, borderWidth: 1, borderColor: "#22c55e", padding: 12, alignItems: "center" }}>
                  <Text style={{ color: "#22c55e", fontWeight: "700", fontSize: 13 }}>✅ Modo Termux ativo — usando localhost:8080</Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    updateSettings({ customServerUrl: "" });
                    setServerUrlDraft("");
                    setServerUrlEditing(false);
                    Haptics.selectionAsync();
                  }}
                  style={{ alignItems: "center", padding: 6 }}
                >
                  <Text style={{ color: colors.mutedForeground, fontSize: 12 }}>Desativar Modo Termux</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Requisitos */}
            <View style={{ backgroundColor: colors.background, borderRadius: 8, padding: 10, gap: 4 }}>
              <Text style={{ color: colors.mutedForeground, fontSize: 11, fontWeight: "600", marginBottom: 2 }}>REQUISITOS</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>• Termux (instalar pelo F-Droid, não Play Store)</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>• Node.js (instalado automaticamente pelo script)</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>• Celular com Android 7+ e 2GB+ de RAM</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>• VS Code: code-server (instalado automaticamente)</Text>
              <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>• IA: configure GEMINI_API_KEY no ~/.bashrc</Text>
            </View>
          </View>
        </View>

        {/* GitHub Codespaces / Servidor Independente */}
        <SectionHeader title="TERMINAL SEM REPLIT — MICROSOFT / QUALQUER VPS" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border, padding: 14, gap: 12 }]}>
          <Text style={{ color: "#60a5fa", fontWeight: "700", fontSize: 13 }}>
            🖥️ Use o terminal da Microsoft (GitHub Codespaces) ou qualquer servidor gratuito
          </Text>
          <Text style={{ color: colors.mutedForeground, fontSize: 12, lineHeight: 19 }}>
            {"O terminal do DevMobile funciona com QUALQUER servidor Linux — Microsoft, Oracle, sua casa, qualquer lugar. Só precisa de internet no celular.\n\nEscolha uma opção abaixo:"}
          </Text>

          {/* Opção 1: GitHub Codespaces */}
          <View style={{ backgroundColor: "#0d1f3c", borderRadius: 10, borderWidth: 1, borderColor: "#1d4ed8", padding: 12, gap: 8 }}>
            <Text style={{ color: "#60a5fa", fontWeight: "800", fontSize: 13 }}>🐙 OPÇÃO 1 — GitHub Codespaces (Microsoft)</Text>
            <Text style={{ color: "#93c5fd", fontSize: 12, lineHeight: 18 }}>
              {"✅ Grátis: 60h/mês (conta GitHub gratuita)\n✅ Linux real na nuvem Microsoft\n✅ Sem cartão de crédito"}
            </Text>
            <Text style={{ color: "#60a5fa", fontSize: 11, fontWeight: "600", marginTop: 4 }}>PASSO A PASSO:</Text>
            {[
              "1. Acesse: github.com → clique no seu avatar → \"Your Codespaces\"",
              "2. Clique em \"New codespace\" → escolha qualquer repositório",
              "3. No terminal do codespace, execute o comando abaixo:",
              "4. Clique na aba \"Ports\" → copie o link da porta 8080",
              "5. Cole esse link no campo \"URL do Servidor\" acima",
            ].map((step, i) => (
              <Text key={i} style={{ color: "#bfdbfe", fontSize: 12, lineHeight: 18 }}>{step}</Text>
            ))}
            <TouchableOpacity
              onPress={async () => {
                const script = `mkdir -p ~/devmobile && cd ~/devmobile && npm init -y 2>/dev/null; npm install express cors 2>/dev/null; cat > server.js << 'EOF'\nconst express=require('express'),cors=require('cors'),{spawn}=require('child_process'),app=express();\napp.use(cors({origin:'*'}));app.use(express.json());\napp.get('/api/healthz',(q,r)=>r.json({status:'ok'}));\napp.post('/api/terminal/exec',(req,res)=>{const{command='echo ok',sessionId='s1'}=req.body;res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache');const p=spawn('bash',['-c',command],{env:process.env});p.stdout.on('data',d=>res.write('data: '+JSON.stringify({type:'stdout',data:d.toString()})+'\n\n'));p.stderr.on('data',d=>res.write('data: '+JSON.stringify({type:'output',data:d.toString()})+'\n\n'));p.on('close',c=>{res.write('data: '+JSON.stringify({done:true,code:c})+'\n\n');res.end();});});\napp.listen(8080,'0.0.0.0',()=>console.log('DevMobile Server :8080 ✅'));\nEOF\nnode server.js`;
                await Clipboard.setStringAsync(script);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert("✅ Copiado!", "Cole no terminal do GitHub Codespace e execute.\n\nDepois copie a URL da porta 8080 e configure em \"Servidor Backend\" acima.", [{ text: "Entendido" }]);
              }}
              style={{ backgroundColor: "#1d4ed8", borderRadius: 8, padding: 11, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
            >
              <Text style={{ fontSize: 15 }}>📋</Text>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Copiar Comando (cole no Codespace)</Text>
            </TouchableOpacity>
          </View>

          {/* Opção 2: Oracle Cloud */}
          <View style={{ backgroundColor: "#1a0d0d", borderRadius: 10, borderWidth: 1, borderColor: "#dc2626", padding: 12, gap: 8 }}>
            <Text style={{ color: "#f87171", fontWeight: "800", fontSize: 13 }}>☁️ OPÇÃO 2 — Oracle Cloud (GRÁTIS para sempre)</Text>
            <Text style={{ color: "#fca5a5", fontSize: 12, lineHeight: 18 }}>
              {"✅ VM Linux grátis para sempre (sem expirar)\n✅ Ubuntu 22.04, 1GB RAM, 50GB disco\n✅ Sem cartão de crédito (conta Oracle gratuita)"}
            </Text>
            <Text style={{ color: "#f87171", fontSize: 11, fontWeight: "600", marginTop: 4 }}>PASSO A PASSO:</Text>
            {[
              "1. Acesse: cloud.oracle.com → crie conta gratuita",
              "2. Crie uma VM Ubuntu 22.04 (Always Free)",
              "3. Conecte via SSH e execute o comando abaixo:",
              "4. Abra a porta 8080 no Security Group da Oracle",
              "5. Use o IP público da VM no \"URL do Servidor\" acima",
            ].map((step, i) => (
              <Text key={i} style={{ color: "#fecaca", fontSize: 12, lineHeight: 18 }}>{step}</Text>
            ))}
            <TouchableOpacity
              onPress={async () => {
                const script = `sudo apt-get update -y && curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs && mkdir -p ~/devmobile && cd ~/devmobile && npm init -y && npm install express cors && node -e "const e=require('express'),c=require('cors'),{spawn}=require('child_process'),a=e();a.use(c({origin:'*'}));a.use(e.json());a.get('/api/healthz',(q,r)=>r.json({status:'ok'}));a.post('/api/terminal/exec',(req,res)=>{res.setHeader('Content-Type','text/event-stream');const p=spawn('bash',['-c',req.body.command||'echo ok'],{env:process.env});p.stdout.on('data',d=>res.write('data: '+JSON.stringify({type:'stdout',data:d.toString()})+'\n\n'));p.stderr.on('data',d=>res.write('data: '+JSON.stringify({type:'output',data:d.toString()})+'\n\n'));p.on('close',c=>{res.write('data: '+JSON.stringify({done:true,code:c})+'\n\n');res.end();});});a.listen(8080,'0.0.0.0',()=>console.log('DevMobile :8080 OK'));"`;
                await Clipboard.setStringAsync(script);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert("✅ Copiado!", "Execute via SSH na sua VM Oracle.\n\nDepois use o IP_PÚBLICO:8080 no campo \"URL do Servidor\".", [{ text: "Entendido" }]);
              }}
              style={{ backgroundColor: "#dc2626", borderRadius: 8, padding: 11, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 8 }}
            >
              <Text style={{ fontSize: 15 }}>📋</Text>
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Copiar Comando (cole na VM Oracle)</Text>
            </TouchableOpacity>
          </View>

          {/* Opção 3: Celular mesmo */}
          <View style={{ backgroundColor: "#0d1a0d", borderRadius: 10, borderWidth: 1, borderColor: "#16a34a", padding: 12, gap: 8 }}>
            <Text style={{ color: "#4ade80", fontWeight: "800", fontSize: 13 }}>📱 OPÇÃO 3 — Termux (seu próprio celular)</Text>
            <Text style={{ color: "#86efac", fontSize: 12, lineHeight: 18 }}>
              {"✅ 100% offline — sem internet necessária\n✅ Node.js, Python, Git rodam no seu celular\n✅ Use a seção \"MODO TERMUX\" acima"}
            </Text>
          </View>
        </View>

        {/* Sobre */}
        <SectionHeader title="SOBRE" colors={colors} />
        <View style={[styles.section, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <SettingRow colors={colors} label="DevMobile IDE" sublabel="v1.9.5 — Gemini direto do celular + Terminal sem Replit" />
          <SettingRow colors={colors} label="Terminal" sublabel="Node.js v24 + npm v11 no servidor" />
          <SettingRow colors={colors} label="IA" sublabel="11 provedores — Cortesia Gemini grátis" />
          <SettingRow colors={colors} label="Armazenamento" sublabel="Local no dispositivo (AsyncStorage)" />
          <SettingRow
            colors={colors}
            label="📋 Visão Técnica Completa"
            sublabel="Arquitetura, rotas API, como recriar, limites e mais"
            onPress={() => setShowOverview(true)}
            right={<Feather name="chevron-right" size={16} color={colors.mutedForeground} />}
          />
        </View>
      </ScrollView>

      <SystemStatus visible={showStatus} onClose={() => setShowStatus(false)} />
      <AIMemoryModal visible={showMemory} onClose={() => setShowMemory(false)} />
      <CheckpointsModal visible={showCheckpoints} onClose={() => setShowCheckpoints(false)} />
      <ProjectOverviewModal visible={showOverview} onClose={() => setShowOverview(false)} />

      {/* Modal: Adicionar IA — simplificado */}
      <Modal visible={showAIModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <View>
              <Text style={[styles.modalTitle, { color: colors.foreground }]}>Adicionar Chave de IA</Text>
              <Text style={[{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }]}>
                Cole a chave — provedor detectado automaticamente
              </Text>
            </View>
            <TouchableOpacity onPress={() => { setShowAIModal(false); setAIKey(""); setAIModel(""); }}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>

            {/* Cortesia Gemini — sem chave */}
            {aiType === "cortesia" ? (
              <View style={[settingsStyles.keyBox, { backgroundColor: colors.primary + "10", borderColor: colors.primary }]}>
                <Text style={{ fontSize: 24, textAlign: "center" }}>✨</Text>
                <Text style={{ color: colors.foreground, fontWeight: "700", textAlign: "center", marginTop: 4 }}>
                  Cortesia Gemini
                </Text>
                <Text style={{ color: colors.mutedForeground, fontSize: 12, textAlign: "center", marginTop: 4 }}>
                  Sem chave necessária. Powered by Gemini 2.0 Flash.
                </Text>
              </View>
            ) : (
              <>
                {/* Campo de chave */}
                <View style={[settingsStyles.keyBox, { backgroundColor: colors.card, borderColor: aiKey.trim() ? colors.primary : colors.border }]}>
                  <TextInput
                    style={[settingsStyles.keyInput, { color: colors.foreground }]}
                    value={aiKey}
                    onChangeText={handleKeyChange}
                    placeholder={"Cole sua API key aqui\n\nsk-...  /  sk-ant-...  /  AIza..."}
                    placeholderTextColor={colors.mutedForeground}
                    autoCapitalize="none"
                    autoCorrect={false}
                    multiline
                    autoFocus
                  />
                </View>

                {/* Provedor detectado */}
                {aiKey.length > 10 && (
                  <View style={[settingsStyles.detectedBadge, { backgroundColor: colors.secondary, borderColor: colors.primary }]}>
                    <Feather name="check-circle" size={14} color={colors.success} />
                    <Text style={[settingsStyles.detectedText, { color: colors.foreground }]}>
                      Detectado: <Text style={{ color: colors.primary, fontWeight: "700" }}>
                        {AI_PROVIDERS.find(p => p.type === aiType)?.label || aiType}
                      </Text>
                    </Text>
                  </View>
                )}
              </>
            )}

            {/* Modelos rápidos */}
            {(AI_MODELS[aiType] || []).length > 0 && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 16 }]}>
                  Modelo (opcional — usa o melhor por padrão)
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={{ flexDirection: "row", gap: 8, paddingVertical: 4 }}>
                    {(AI_MODELS[aiType] || []).map((m) => (
                      <TouchableOpacity
                        key={m}
                        onPress={() => setAIModel(aiModel === m ? "" : m)}
                        style={[styles.chip, {
                          backgroundColor: aiModel === m ? colors.primary : colors.secondary,
                          borderColor: aiModel === m ? colors.primary : colors.border,
                        }]}
                      >
                        <Text style={[styles.chipText, {
                          color: aiModel === m ? colors.primaryForeground : colors.mutedForeground,
                          fontSize: 11,
                        }]}>{m}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </ScrollView>
              </>
            )}

            {/* Custom URL */}
            {aiType === "custom" && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>Base URL</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                  value={aiBaseUrl}
                  onChangeText={setAIBaseUrl}
                  placeholder="https://api.example.com"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            )}

            <TouchableOpacity
              onPress={handleAddAI}
              disabled={aiType !== "cortesia" && !aiKey.trim()}
              style={[settingsStyles.saveBtn, { backgroundColor: (aiType === "cortesia" || aiKey.trim()) ? colors.primary : colors.muted }]}
            >
              <Feather name="check" size={18} color={colors.primaryForeground} />
              <Text style={[settingsStyles.saveBtnText, { color: colors.primaryForeground }]}>
                Salvar e Usar
              </Text>
            </TouchableOpacity>

          </ScrollView>
        </View>
      </Modal>

      {/* Modal: Git */}
      <Modal visible={showGitModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Conectar Git
            </Text>
            <TouchableOpacity onPress={() => setShowGitModal(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Provedor</Text>
            <View style={{ flexDirection: "row", gap: 10, marginBottom: 8 }}>
              {(["github", "gitlab"] as const).map((p) => (
                <TouchableOpacity
                  key={p}
                  onPress={() => setGitProvider(p)}
                  style={[
                    styles.providerBtn,
                    {
                      backgroundColor: gitProvider === p ? colors.primary : colors.secondary,
                      borderColor: gitProvider === p ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: gitProvider === p ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {p === "github" ? "GitHub" : "GitLab"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {gitProvider === "gitlab" && (
              <>
                <Text style={[styles.label, { color: colors.mutedForeground }]}>URL da Instância GitLab</Text>
                <TextInput
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                  value={gitInstance}
                  onChangeText={setGitInstance}
                  placeholder="https://gitlab.com"
                  placeholderTextColor={colors.mutedForeground}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </>
            )}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>
              Token de Acesso Pessoal
            </Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={gitToken}
              onChangeText={setGitToken}
              placeholder={gitProvider === "github" ? "ghp_xxxxxxxxxxxx" : "glpat-xxxxxxxxxxxx"}
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Username</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={gitUsername}
              onChangeText={setGitUsername}
              placeholder="seu-usuario"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Email (opcional)</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={gitEmail}
              onChangeText={setGitEmail}
              placeholder="seu@email.com"
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
            />
            <TouchableOpacity
              onPress={handleAddGit}
              disabled={!gitToken.trim() || !gitUsername.trim()}
              style={[
                styles.primaryBtn,
                { backgroundColor: gitToken.trim() && gitUsername.trim() ? colors.primary : colors.muted },
              ]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                Salvar Configuração
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal: DB */}
      <Modal visible={showDBModal} animationType="slide" presentationStyle="pageSheet">
        <View style={[styles.modal, { backgroundColor: colors.background }]}>
          <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.modalTitle, { color: colors.foreground }]}>
              Banco de Dados
            </Text>
            <TouchableOpacity onPress={() => setShowDBModal(false)}>
              <Feather name="x" size={22} color={colors.mutedForeground} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalBody}>
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Tipo</Text>
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 8 }}>
              {(["neon", "postgres", "sqlite"] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  onPress={() => setDBProvider(t)}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: dbProvider === t ? colors.primary : colors.secondary,
                      borderColor: dbProvider === t ? colors.primary : colors.border,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: dbProvider === t ? colors.primaryForeground : colors.mutedForeground },
                    ]}
                  >
                    {t === "neon" ? "Neon" : t === "postgres" ? "PostgreSQL" : "SQLite"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={[styles.hint, { backgroundColor: "#00d4aa18", borderColor: "#00d4aa44" }]}>
              <Feather name="cpu" size={12} color="#00d4aa" />
              <Text style={[styles.hintText, { color: colors.foreground, fontWeight: "600" }]}>
                Como funciona a integração com IA:
              </Text>
            </View>
            <View style={[styles.hint, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
              <Text style={[styles.hintText, { color: colors.mutedForeground, lineHeight: 18 }]}>
                {`Após adicionar a DATABASE_URL, o Assistente IA receberá automaticamente instruções para:\n\n• Criar tabelas (CREATE TABLE)\n• Gerar migrations\n• Escrever código de conexão Node.js\n• Fazer operações CRUD (INSERT, SELECT, UPDATE, DELETE)\n• Configurar Drizzle ORM, Prisma ou Sequelize\n\nVocê apenas pede: "Crie uma tabela de usuários" e a IA gera o SQL pronto.`}
              </Text>
            </View>
            {dbProvider === "neon" && (
              <View style={[styles.hint, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="info" size={12} color={colors.info} />
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                  {`Neon (gratuito): acesse console.neon.tech → crie um projeto → vá em "Connection string" → selecione "Node.js" → copie a URL completa no formato:\npostgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require`}
                </Text>
              </View>
            )}
            {dbProvider === "postgres" && (
              <View style={[styles.hint, { backgroundColor: colors.secondary, borderColor: colors.border }]}>
                <Feather name="info" size={12} color={colors.info} />
                <Text style={[styles.hintText, { color: colors.mutedForeground }]}>
                  {`PostgreSQL local ou na nuvem (Supabase, Railway, Render).\nFormato: postgresql://usuario:senha@host:5432/banco`}
                </Text>
              </View>
            )}
            <Text style={[styles.label, { color: colors.mutedForeground }]}>Nome da conexão</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
              value={dbName}
              onChangeText={setDBName}
              placeholder="Meu Banco"
              placeholderTextColor={colors.mutedForeground}
            />
            <Text style={[styles.label, { color: colors.mutedForeground }]}>String de conexão</Text>
            <TextInput
              style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card, height: 80 }]}
              value={dbConnStr}
              onChangeText={setDBConnStr}
              placeholder={
                dbProvider === "neon"
                  ? "postgresql://user:pass@ep-xxx.neon.tech/db?sslmode=require"
                  : dbProvider === "postgres"
                  ? "postgresql://user:pass@localhost:5432/db"
                  : "/data/local.db"
              }
              placeholderTextColor={colors.mutedForeground}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
              textAlignVertical="top"
            />
            <TouchableOpacity
              onPress={handleAddDB}
              disabled={!dbConnStr.trim() || !dbName.trim()}
              style={[
                styles.primaryBtn,
                { backgroundColor: dbConnStr.trim() && dbName.trim() ? colors.primary : colors.muted },
              ]}
            >
              <Text style={[styles.primaryBtnText, { color: colors.primaryForeground }]}>
                Salvar Banco de Dados
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  section: {
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 4,
  },
  modal: { flex: 1 },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 24,
    borderBottomWidth: 1,
  },
  modalTitle: { fontSize: 18, fontWeight: "700" },
  modalBody: { padding: 20, gap: 4, paddingBottom: 40 },
  label: { fontSize: 11, fontWeight: "700", marginTop: 10, marginBottom: 2, letterSpacing: 0.5 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 2,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: "500" },
  providerBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    marginTop: 16,
  },
  primaryBtnText: { fontSize: 16, fontWeight: "700" },
  activeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 20,
  },
  activeBadgeText: { color: "#fff", fontSize: 10, fontWeight: "700" },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
  },
  badgeText: { fontSize: 11, fontWeight: "500" },
  fontSizeText: { fontSize: 15, fontWeight: "600", width: 28, textAlign: "center" },
  hint: {
    flexDirection: "row",
    gap: 8,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
    alignItems: "flex-start",
  },
  hintText: { flex: 1, fontSize: 12, lineHeight: 18 },
});

const settingsStyles = StyleSheet.create({
  sectionHeader: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 15 },
  rowSublabel: { fontSize: 12, marginTop: 1 },
  keyBox: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 16,
    minHeight: 110,
    marginBottom: 12,
  },
  keyInput: {
    fontSize: 15,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    minHeight: 80,
  },
  detectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 4,
  },
  detectedText: { fontSize: 14 },
  saveBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 14,
    paddingVertical: 16,
    marginTop: 24,
  },
  saveBtnText: { fontSize: 17, fontWeight: "700" },
});
