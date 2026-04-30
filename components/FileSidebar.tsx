import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import React, { useState, useMemo } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useApp } from "@/context/AppContext";
import { useColors } from "@/hooks/useColors";
import type { ProjectFile } from "@/context/AppContext";

const FILE_ICONS: Record<string, { icon: string; color: string }> = {
  typescript: { icon: "file-text", color: "#3178c6" },
  javascript: { icon: "file-text", color: "#f7df1e" },
  python: { icon: "file-text", color: "#3572A5" },
  html: { icon: "code", color: "#e34c26" },
  css: { icon: "sliders", color: "#563d7c" },
  json: { icon: "file-text", color: "#cbcb41" },
  markdown: { icon: "file-text", color: "#083fa1" },
  sql: { icon: "database", color: "#336791" },
  bash: { icon: "terminal", color: "#89e051" },
  go: { icon: "file-text", color: "#00ADD8" },
  rust: { icon: "file-text", color: "#dea584" },
  java: { icon: "file-text", color: "#b07219" },
  php: { icon: "file-text", color: "#4F5D95" },
  default: { icon: "file", color: "#8b949e" },
};

function getFileIcon(language: string): { icon: string; color: string } {
  return FILE_ICONS[language] || FILE_ICONS.default;
}

// ── Tipos da árvore ──────────────────────────────────────────────────────────
interface FolderNode {
  type: "folder";
  name: string;
  fullPath: string;
  children: TreeNode[];
}
interface FileNode {
  type: "file";
  name: string;
  fullPath: string;
  file: ProjectFile;
}
type TreeNode = FolderNode | FileNode;

// ── Constrói a árvore a partir dos arquivos ──────────────────────────────────
function buildTree(files: ProjectFile[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const rawPath = file.path?.trim() || file.name;
    const parts = rawPath.split("/").filter(Boolean);
    let current = root;

    for (let i = 0; i < parts.length - 1; i++) {
      const folderName = parts[i];
      const fullPath = parts.slice(0, i + 1).join("/");
      let folder = current.find(
        (n): n is FolderNode => n.type === "folder" && n.name === folderName
      );
      if (!folder) {
        folder = { type: "folder", name: folderName, fullPath, children: [] };
        current.push(folder);
      }
      current = folder.children;
    }

    const fileName = parts[parts.length - 1];
    current.push({ type: "file", name: fileName, fullPath: rawPath, file });
  }

  // Ordena: pastas primeiro, depois arquivos (alfabético)
  function sort(nodes: TreeNode[]): TreeNode[] {
    return [...nodes].sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    }).map((n) => n.type === "folder" ? { ...n, children: sort(n.children) } : n);
  }
  return sort(root);
}

// ── Nó da árvore (recursivo) ─────────────────────────────────────────────────
interface NodeProps {
  node: TreeNode;
  depth: number;
  activeFileId: string | undefined;
  onOpenFile: (file: ProjectFile) => void;
  onContextFile: (file: ProjectFile) => void;
  renamingId: string | null;
  renameValue: string;
  setRenameValue: (v: string) => void;
  onConfirmRename: (file: ProjectFile) => void;
}

function TreeNodeRow({
  node, depth, activeFileId, onOpenFile, onContextFile,
  renamingId, renameValue, setRenameValue, onConfirmRename,
}: NodeProps) {
  const colors = useColors();
  const [open, setOpen] = useState(true);
  const indent = depth * 14;

  if (node.type === "folder") {
    return (
      <View>
        <TouchableOpacity
          onPress={() => { setOpen((v) => !v); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={[styles.fileRow, { paddingLeft: 12 + indent }]}
          activeOpacity={0.7}
        >
          <Feather name={open ? "chevron-down" : "chevron-right"} size={11} color="#666" />
          <Feather name={open ? "folder-open" : "folder"} size={13} color="#e8b84b" style={{ marginLeft: 2 }} />
          <Text style={[styles.fileName, { color: colors.foreground, fontWeight: "600" }]} numberOfLines={1}>
            {node.name}
          </Text>
        </TouchableOpacity>
        {open && node.children.map((child) => (
          <TreeNodeRow
            key={child.fullPath}
            node={child}
            depth={depth + 1}
            activeFileId={activeFileId}
            onOpenFile={onOpenFile}
            onContextFile={onContextFile}
            renamingId={renamingId}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            onConfirmRename={onConfirmRename}
          />
        ))}
      </View>
    );
  }

  const { file } = node;
  const { icon, color } = getFileIcon(file.language);
  const isActive = activeFileId === file.id;

  return (
    <TouchableOpacity
      onPress={() => onOpenFile(file)}
      style={[
        styles.fileRow,
        { paddingLeft: 12 + indent },
        isActive && { backgroundColor: colors.secondary },
      ]}
      activeOpacity={0.75}
    >
      <Feather name={icon as never} size={13} color={color} />
      {renamingId === file.id ? (
        <TextInput
          style={[
            styles.renameInput,
            { color: colors.foreground, borderColor: colors.primary, backgroundColor: colors.background },
          ]}
          value={renameValue}
          onChangeText={setRenameValue}
          onBlur={() => onConfirmRename(file)}
          onSubmitEditing={() => onConfirmRename(file)}
          autoFocus
          selectTextOnFocus
          autoCorrect={false}
          autoCapitalize="none"
        />
      ) : (
        <Text
          style={[styles.fileName, { color: isActive ? colors.primary : colors.foreground }]}
          numberOfLines={1}
        >
          {node.name}
        </Text>
      )}
      {isActive && <View style={[styles.activeDot, { backgroundColor: colors.primary }]} />}
      <TouchableOpacity
        onPress={(e) => {
          e.stopPropagation?.();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onContextFile(file);
        }}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        style={styles.dotMenuBtn}
      >
        <Text style={[styles.dotMenuIcon, { color: colors.mutedForeground }]}>⋮</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Props do FileSidebar ─────────────────────────────────────────────────────
interface FileSidebarProps {
  onClose?: () => void;
  onAnalyzeWithAI?: (file: ProjectFile) => void;
  onMemoryPress?: () => void;
  onMenuPress?: () => void;
}

export default function FileSidebar({ onClose, onAnalyzeWithAI, onMemoryPress, onMenuPress }: FileSidebarProps) {
  const colors = useColors();
  const { activeProject, activeFile, setActiveFile, createFile, deleteFile, renameFile } = useApp();

  const [newFileName, setNewFileName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [contextFile, setContextFile] = useState<ProjectFile | null>(null);

  // Constrói a árvore de arquivos agrupando por pasta
  const tree = useMemo(
    () => buildTree(activeProject?.files ?? []),
    [activeProject?.files]
  );

  if (!activeProject) {
    return (
      <View style={[styles.container, { backgroundColor: colors.card }]}>
        <View style={[styles.empty, { flex: 1 }]}>
          <Feather name="folder" size={24} color={colors.mutedForeground} />
          <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Nenhum projeto aberto</Text>
        </View>
        {onMenuPress && (
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onMenuPress(); }}
            style={[styles.menuBtn, { borderTopColor: colors.border, backgroundColor: colors.card }]}
            activeOpacity={0.75}
          >
            <Feather name="menu" size={15} color={colors.primary} />
            <Text style={[styles.menuBtnText, { color: colors.primary }]}>Menu</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  const handleOpenFile = (file: ProjectFile) => {
    setActiveFile(file);
    setContextFile(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const handleCreateFile = () => {
    if (!newFileName.trim()) return;
    const file = createFile(activeProject.id, newFileName.trim());
    setActiveFile(file);
    setNewFileName("");
    setIsCreating(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeleteFile = (file: ProjectFile) => {
    Alert.alert("Excluir arquivo", `Excluir "${file.name}"?`, [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Excluir",
        style: "destructive",
        onPress: () => {
          deleteFile(activeProject.id, file.id);
          setContextFile(null);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        },
      },
    ]);
  };

  const handleStartRename = (file: ProjectFile) => {
    setRenamingId(file.id);
    setRenameValue(file.name);
    setContextFile(null);
  };

  const handleConfirmRename = (file: ProjectFile) => {
    if (renameValue.trim() && renameValue !== file.name) {
      renameFile(activeProject.id, file.id, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };

  const handleDuplicateFile = (file: ProjectFile) => {
    const ext = file.name.includes(".") ? "." + file.name.split(".").pop() : "";
    const base = file.name.includes(".") ? file.name.slice(0, file.name.lastIndexOf(".")) : file.name;
    const copyName = `${base}_copia${ext}`;
    const newFile = createFile(activeProject.id, copyName, file.content);
    setActiveFile(newFile);
    setContextFile(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleCopyName = (file: ProjectFile) => {
    Clipboard.setStringAsync(file.name);
    setContextFile(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const CONTEXT_ACTIONS = [
    { icon: "folder" as const, label: "Abrir", color: colors.primary, onPress: (f: ProjectFile) => handleOpenFile(f) },
    { icon: "edit-2" as const, label: "Renomear", color: colors.foreground, onPress: (f: ProjectFile) => handleStartRename(f) },
    { icon: "copy" as const, label: "Duplicar", color: colors.foreground, onPress: (f: ProjectFile) => handleDuplicateFile(f) },
    {
      icon: "cpu" as const, label: "Analisar com IA", color: "#7c3aed",
      onPress: (f: ProjectFile) => { setContextFile(null); onAnalyzeWithAI?.(f); },
    },
    { icon: "clipboard" as const, label: "Copiar nome", color: colors.foreground, onPress: (f: ProjectFile) => handleCopyName(f) },
    { icon: "trash-2" as const, label: "Excluir", color: "#ef4444", onPress: (f: ProjectFile) => handleDeleteFile(f) },
  ];

  return (
    <View style={[styles.container, { backgroundColor: colors.card }]}>
      {/* Cabeçalho */}
      <View style={[styles.header, { borderBottomColor: colors.border, backgroundColor: colors.card }]}>
        <View style={[styles.folderIconWrap, { backgroundColor: colors.primary + "22" }]}>
          <Feather name="folder" size={13} color={colors.primary} />
        </View>
        <Text style={[styles.projectName, { color: colors.foreground }]} numberOfLines={1}>
          {activeProject.name}
        </Text>
        <TouchableOpacity
          onPress={() => setIsCreating(true)}
          style={[styles.addBtn, { backgroundColor: colors.secondary, borderColor: colors.border }]}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Feather name="plus" size={15} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Entrada especial: Memória do Projeto */}
      <TouchableOpacity
        onPress={() => { setContextFile(null); onMemoryPress?.(); }}
        style={[styles.memoryRow, { backgroundColor: "#7c3aed18", borderBottomColor: colors.border }]}
        activeOpacity={0.75}
      >
        <Text style={styles.memoryEmoji}>🧠</Text>
        <View style={{ flex: 1 }}>
          <Text style={[styles.memoryLabel, { color: "#7c3aed" }]}>Memória do Projeto</Text>
          <Text style={[styles.memoryDesc, { color: colors.mutedForeground }]}>.jasmim-memory.json</Text>
        </View>
        <Feather name="chevron-right" size={12} color="#7c3aed66" />
      </TouchableOpacity>

      {/* Árvore de arquivos */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingVertical: 4 }}
        keyboardShouldPersistTaps="handled"
      >
        {tree.map((node) => (
          <TreeNodeRow
            key={node.fullPath}
            node={node}
            depth={0}
            activeFileId={activeFile?.id}
            onOpenFile={handleOpenFile}
            onContextFile={setContextFile}
            renamingId={renamingId}
            renameValue={renameValue}
            setRenameValue={setRenameValue}
            onConfirmRename={handleConfirmRename}
          />
        ))}

        {activeProject.files.length === 0 && !isCreating && (
          <View style={styles.noFiles}>
            <Text style={[styles.noFilesText, { color: colors.mutedForeground }]}>Nenhum arquivo</Text>
            <TouchableOpacity onPress={() => setIsCreating(true)}>
              <Text style={[styles.createHint, { color: colors.primary }]}>+ Criar arquivo</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* Campo de criação de novo arquivo */}
      {isCreating && (
        <View style={[styles.createRow, { borderTopColor: colors.border }]}>
          <TextInput
            style={[
              styles.newFileInput,
              { color: colors.foreground, borderColor: colors.primary, backgroundColor: colors.background },
            ]}
            value={newFileName}
            onChangeText={setNewFileName}
            placeholder="src/components/arquivo.ts"
            placeholderTextColor={colors.mutedForeground}
            onSubmitEditing={handleCreateFile}
            onBlur={() => { if (!newFileName.trim()) setIsCreating(false); }}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
          />
          <TouchableOpacity onPress={handleCreateFile} style={styles.confirmBtn}>
            <Feather name="check" size={14} color={colors.success} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setIsCreating(false); setNewFileName(""); }}
            style={styles.cancelBtn}
          >
            <Feather name="x" size={14} color={colors.destructive} />
          </TouchableOpacity>
        </View>
      )}

      {/* Botão Menu Completo */}
      {onMenuPress && (
        <TouchableOpacity
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); onMenuPress(); }}
          style={[styles.menuBtn, { borderTopColor: colors.border, backgroundColor: colors.card }]}
          activeOpacity={0.75}
        >
          <Feather name="menu" size={15} color={colors.primary} />
          <Text style={[styles.menuBtnText, { color: colors.primary }]}>Menu</Text>
        </TouchableOpacity>
      )}

      {/* Menu de contexto inline */}
      {contextFile && (
        <>
          <TouchableOpacity
            style={StyleSheet.absoluteFillObject}
            onPress={() => setContextFile(null)}
            activeOpacity={1}
          />
          <View style={[
            styles.contextMenu,
            { backgroundColor: colors.card, borderColor: colors.border, shadowColor: "#000" },
          ]}>
            <View style={[styles.contextHeader, { borderBottomColor: colors.border }]}>
              <Feather
                name={getFileIcon(contextFile.language).icon as never}
                size={13}
                color={getFileIcon(contextFile.language).color}
              />
              <Text style={[styles.contextTitle, { color: colors.foreground }]} numberOfLines={1}>
                {contextFile.path || contextFile.name}
              </Text>
            </View>
            <View style={styles.contextActions}>
              {CONTEXT_ACTIONS.map((action) => (
                <TouchableOpacity
                  key={action.label}
                  onPress={() => action.onPress(contextFile)}
                  style={[styles.contextActionBtn, { backgroundColor: colors.background }]}
                  activeOpacity={0.7}
                >
                  <Feather name={action.icon} size={16} color={action.color} />
                  <Text style={[styles.contextActionText, { color: action.color }]}>{action.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              onPress={() => setContextFile(null)}
              style={[styles.contextClose, { borderTopColor: colors.border }]}
            >
              <Text style={[{ color: colors.mutedForeground, fontSize: 13, fontWeight: "600" }]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, overflow: "hidden" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 7,
    minHeight: 46,
  },
  folderIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 6,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  projectName: { flex: 1, fontSize: 12, fontWeight: "700", minWidth: 0 },
  addBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },

  memoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  memoryEmoji: { fontSize: 14 },
  memoryLabel: { fontSize: 12, fontWeight: "700" },
  memoryDesc: { fontSize: 10, marginTop: 1 },

  fileRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingRight: 8,
    paddingVertical: 9,
    gap: 6,
    minHeight: 38,
  },
  fileName: { flex: 1, fontSize: 12, fontWeight: "500" },
  activeDot: { width: 5, height: 5, borderRadius: 3 },
  noFiles: { padding: 16, alignItems: "center", gap: 8 },
  noFilesText: { fontSize: 12 },
  createHint: { fontSize: 13, fontWeight: "600" },
  createRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderTopWidth: 1,
    gap: 6,
  },
  newFileInput: {
    flex: 1,
    height: 36,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 13,
  },
  renameInput: {
    flex: 1,
    height: 28,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    fontSize: 12,
  },
  confirmBtn: { padding: 6 },
  cancelBtn: { padding: 6 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 8 },
  emptyText: { fontSize: 12 },
  dotMenuBtn: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    flexShrink: 0,
  },
  dotMenuIcon: { fontSize: 18, lineHeight: 20, fontWeight: "700" },
  menuBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  menuBtnText: { fontSize: 13, fontWeight: "600" },
  contextMenu: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    borderTopWidth: 1,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 12,
    overflow: "hidden",
  },
  contextHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  contextTitle: { flex: 1, fontSize: 13, fontWeight: "600" },
  contextActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    padding: 12,
    gap: 10,
  },
  contextActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 15,
    borderRadius: 12,
    minWidth: "45%",
    flex: 1,
  },
  contextActionText: { fontSize: 14, fontWeight: "600" },
  contextClose: {
    alignItems: "center",
    paddingVertical: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
