import { Feather } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import PreviewPanel from "@/components/PreviewPanel";
import Terminal from "@/components/Terminal";
import { useColors } from "@/hooks/useColors";

export default function TerminalScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const topPadding = Platform.OS === "web" ? 14 : insets.top;
  const tabBottom = Platform.OS === "web" ? 70 : Math.max(insets.bottom, 16) + 70;
  const [showPreview, setShowPreview] = useState(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.terminalBg, paddingBottom: tabBottom }]}>
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
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: colors.primary }]}>$ Terminal Linux</Text>
          <Text style={[styles.headerSub, { color: colors.mutedForeground }]}>
            Servidor real — bash, node, python, git, npm
          </Text>
        </View>

        {/* Preview button */}
        <TouchableOpacity
          onPress={() => setShowPreview(true)}
          style={[styles.previewBtn, { backgroundColor: "#007acc22", borderColor: "#007acc55" }]}
          activeOpacity={0.75}
        >
          <Feather name="monitor" size={14} color="#007acc" />
          <Text style={styles.previewBtnText}>Preview</Text>
        </TouchableOpacity>
      </View>

      <Terminal />

      <PreviewPanel visible={showPreview} onClose={() => setShowPreview(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: "700",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  headerSub: { fontSize: 11, marginTop: 1 },
  previewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  previewBtnText: { color: "#007acc", fontSize: 12, fontWeight: "700" },
});
