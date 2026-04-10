import React, { useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  Platform, useColorScheme, ActivityIndicator, Alert,
  TextInput, Linking,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Constants from "expo-constants";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const PROD_API = "https://zip-12--vpahaddevbhoomi.replit.app/api";
const API_BASE: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string) ||
  PROD_API;

type ImportType = "students" | "mess" | "hostel-assignment";

interface ImportConfig {
  key: ImportType;
  label: string;
  description: string;
  icon: string;
  color: string;
  columns: string;
  endpoint: string;
  templatePath: string;
}

const IMPORTS: ImportConfig[] = [
  {
    key: "students",
    label: "Import Students",
    description: "Bulk-import or update student profiles from a CSV file.",
    icon: "users",
    color: "#3b82f6",
    columns: "name*, email*, rollNumber, phone, hostelName, roomNumber, assignedMess, area, password",
    endpoint: "/import/students",
    templatePath: "/import/template/students",
  },
  {
    key: "mess",
    label: "Mess Allocation",
    description: "Assign mess to students in bulk by email.",
    icon: "coffee",
    color: "#f59e0b",
    columns: "email*, assignedMess*",
    endpoint: "/import/mess",
    templatePath: "/import/template/mess",
  },
  {
    key: "hostel-assignment",
    label: "Hostel Assignment",
    description: "Assign hostels and room numbers to students by email.",
    icon: "home",
    color: "#8b5cf6",
    columns: "email*, hostelName*, roomNumber",
    endpoint: "/import/hostel-assignment",
    templatePath: "/import/template/hostel-assignment",
  },
];

export default function CsvImportScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const topPad = Platform.OS === "web" ? 24 : Math.max(insets.top + 20, 100);
  const { token } = useAuth();
  const [selectedType, setSelectedType] = useState<ImportType | null>(null);
  const [csvText, setCsvText] = useState("");
  const [uploading, setUploading] = useState<ImportType | null>(null);
  const [result, setResult] = useState<{ created?: number; updated?: number; skipped?: number; notFound?: number; errors?: string[] } | null>(null);

  const selected = IMPORTS.find(i => i.key === selectedType);

  const downloadTemplate = (config: ImportConfig) => {
    Haptics.selectionAsync();
    const url = `${API_BASE}${config.templatePath}`;
    if (Platform.OS === "web") {
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.blob())
        .then(blob => {
          const u = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = u; a.download = `${config.key}-template.csv`; a.click();
          URL.revokeObjectURL(u);
        });
    } else {
      Alert.alert("Templates", "Download templates from the web version of the app.");
    }
  };

  const handleFileUpload = () => {
    if (Platform.OS !== "web") {
      Alert.alert("Web Only", "File upload works on the web browser. Use the web version to import CSV files.");
      return;
    }
    if (!selectedType) return;
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".csv";
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      await uploadFile(selectedType, file);
    };
    input.click();
  };

  const uploadFile = async (type: ImportType, file: File | null) => {
    const config = IMPORTS.find(i => i.key === type);
    if (!config) return;

    setUploading(type);
    setResult(null);
    try {
      let body: FormData | null = null;
      if (file) {
        body = new FormData();
        body.append("file", file);
      } else if (csvText.trim()) {
        const blob = new Blob([csvText], { type: "text/csv" });
        body = new FormData();
        body.append("file", blob, `${type}.csv`);
      } else {
        Alert.alert("Error", "Please select a file or paste CSV data");
        setUploading(null);
        return;
      }

      const res = await fetch(`${API_BASE}${config.endpoint}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Upload failed");
      setResult(data);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Import Failed", e.message || "Unknown error");
    }
    setUploading(null);
  };

  const uploadPasted = async () => {
    if (!selectedType || !csvText.trim()) return;
    await uploadFile(selectedType, null);
  };

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 80 : 90 }}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 16, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>CSV Import</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>Super Admin · Bulk Data Import</Text>
        </View>
      </View>

      <View style={{ padding: 16 }}>
        {/* Info banner */}
        <View style={[styles.infoBanner, { backgroundColor: theme.tint + "15", borderColor: theme.tint + "40" }]}>
          <Feather name="info" size={16} color={theme.tint} />
          <Text style={[styles.infoBannerText, { color: theme.text }]}>
            Download a template, fill it in, then upload. Existing records are updated; new ones are created.
          </Text>
        </View>

        {/* Import type selector */}
        <Text style={[styles.sectionLabel, { color: theme.text }]}>Choose Import Type</Text>
        {IMPORTS.map(config => (
          <Pressable
            key={config.key}
            onPress={() => { setSelectedType(config.key); setResult(null); setCsvText(""); Haptics.selectionAsync(); }}
            style={[
              styles.typeCard,
              { backgroundColor: theme.surface, borderColor: selectedType === config.key ? config.color : theme.border },
              selectedType === config.key && { backgroundColor: config.color + "12" },
            ]}
          >
            <View style={[styles.typeIcon, { backgroundColor: config.color + "20" }]}>
              <Feather name={config.icon as any} size={20} color={config.color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.typeLabel, { color: theme.text }]}>{config.label}</Text>
              <Text style={[styles.typeDesc, { color: theme.textSecondary }]}>{config.description}</Text>
              <Text style={[styles.typeCols, { color: theme.textTertiary }]}>Columns: {config.columns}</Text>
            </View>
            <View style={styles.typeRight}>
              <Pressable onPress={() => downloadTemplate(config)} style={[styles.templateBtn, { borderColor: config.color }]}>
                <Feather name="download" size={13} color={config.color} />
                <Text style={[styles.templateBtnText, { color: config.color }]}>Template</Text>
              </Pressable>
              {selectedType === config.key && <Feather name="check-circle" size={18} color={config.color} />}
            </View>
          </Pressable>
        ))}

        {/* Upload section */}
        {selectedType && selected && (
          <View style={[styles.uploadSection, { borderColor: theme.border }]}>
            <Text style={[styles.sectionLabel, { color: theme.text }]}>Upload Data</Text>

            {Platform.OS === "web" ? (
              <Pressable
                onPress={handleFileUpload}
                disabled={!!uploading}
                style={[styles.uploadBtn, { borderColor: selected.color, backgroundColor: selected.color + "10" }]}
              >
                {uploading === selectedType ? (
                  <ActivityIndicator color={selected.color} />
                ) : (
                  <>
                    <Feather name="upload" size={20} color={selected.color} />
                    <Text style={[styles.uploadBtnText, { color: selected.color }]}>Choose CSV File</Text>
                  </>
                )}
              </Pressable>
            ) : (
              <View style={[styles.uploadBtn, { borderColor: theme.border, backgroundColor: theme.surface }]}>
                <Feather name="monitor" size={20} color={theme.textSecondary} />
                <Text style={[styles.uploadBtnText, { color: theme.textSecondary }]}>File upload available on web</Text>
              </View>
            )}

            <Text style={[styles.orText, { color: theme.textTertiary }]}>— or paste CSV text below —</Text>

            <TextInput
              style={[styles.csvInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              placeholder={`name,email,rollNumber,...\nArjun Kumar,arjun@iitm.ac.in,...`}
              placeholderTextColor={theme.textTertiary}
              value={csvText}
              onChangeText={setCsvText}
              multiline
              numberOfLines={6}
              autoCapitalize="none"
              autoCorrect={false}
            />

            {csvText.trim() && (
              <Pressable
                onPress={uploadPasted}
                disabled={!!uploading}
                style={[styles.importBtn, { backgroundColor: selected.color }]}
              >
                {uploading === selectedType
                  ? <ActivityIndicator color="#fff" />
                  : <><Feather name="upload-cloud" size={18} color="#fff" /><Text style={styles.importBtnText}>Import Pasted Data</Text></>}
              </Pressable>
            )}
          </View>
        )}

        {/* Result */}
        {result && (
          <View style={[styles.resultCard, { backgroundColor: "#22c55e15", borderColor: "#22c55e40" }]}>
            <View style={styles.resultHeader}>
              <Feather name="check-circle" size={20} color="#22c55e" />
              <Text style={[styles.resultTitle, { color: "#22c55e" }]}>Import Successful</Text>
            </View>
            {[
              { label: "Created", val: result.created, color: "#22c55e" },
              { label: "Updated", val: result.updated, color: "#3b82f6" },
              { label: "Skipped", val: result.skipped, color: "#f59e0b" },
              { label: "Not Found", val: result.notFound, color: "#6B7280" },
            ].filter(r => r.val !== undefined).map(r => (
              <View key={r.label} style={styles.resultRow}>
                <Text style={[styles.resultLabel, { color: theme.textSecondary }]}>{r.label}</Text>
                <Text style={[styles.resultVal, { color: r.color }]}>{r.val}</Text>
              </View>
            ))}
            {result.errors?.length ? (
              <Text style={[styles.errorText, { color: "#ef4444" }]}>
                {result.errors.slice(0, 3).join("\n")}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 20, borderBottomWidth: 1, gap: 12 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular" },
  infoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 20 },
  infoBannerText: { flex: 1, fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 19 },
  sectionLabel: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10 },
  typeCard: { flexDirection: "row", alignItems: "flex-start", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1.5, marginBottom: 12 },
  typeIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  typeLabel: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  typeDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  typeCols: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 4, lineHeight: 16 },
  typeRight: { alignItems: "flex-end", gap: 8 },
  templateBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  templateBtnText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  uploadSection: { marginTop: 10, padding: 16, borderRadius: 16, borderWidth: 1 },
  uploadBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 28, borderRadius: 12, borderWidth: 2, borderStyle: "dashed", marginBottom: 12 },
  uploadBtnText: { fontSize: 15, fontFamily: "Inter_600SemiBold" },
  orText: { textAlign: "center", fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 12 },
  csvInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 12, fontFamily: "Inter_400Regular", minHeight: 120, textAlignVertical: "top" },
  importBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14, marginTop: 12 },
  importBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
  resultCard: { padding: 16, borderRadius: 14, borderWidth: 1, marginTop: 16 },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
  resultTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  resultRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  resultLabel: { fontSize: 14, fontFamily: "Inter_400Regular" },
  resultVal: { fontSize: 14, fontFamily: "Inter_700Bold" },
  errorText: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 8 },
});
