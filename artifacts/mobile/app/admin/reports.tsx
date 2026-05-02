import React, { useCallback, useState } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  RefreshControl, Platform, useColorScheme, Alert,
  ActivityIndicator, Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";
import Colors from "@/constants/colors";
import { useApiRequest, useAuth, API_BASE } from "@/context/AuthContext";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";

const { width: SCREEN_W } = Dimensions.get("window");

export default function ReportsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const request = useApiRequest();
  const { token, user } = useAuth();
  const [downloading, setDownloading] = useState<string | null>(null);

  const { data: summary, isLoading, refetch } = useQuery({
    queryKey: ["reports-summary"],
    queryFn: () => request("/reports/summary"),
    staleTime: 30000,
  });

  const { data: attStats } = useQuery({
    queryKey: ["att-stats"],
    queryFn: () => request("/attendance/stats"),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const { data: activeStaff = [] } = useQuery<any[]>({
    queryKey: ["staff-all"],
    queryFn: () => request("/staff/all"),
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const [refreshing, setRefreshing] = React.useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const isSuperAdmin = user?.role === "superadmin";
  const today = new Date().toISOString().split("T")[0];
  const formattedDate = new Date().toLocaleDateString("en-IN", {
    day: "numeric", month: "long", year: "numeric",
  });

  const download = async (path: string, filename: string) => {
    if (downloading) return;
    setDownloading(filename);
    Haptics.selectionAsync();
    const url = `${API_BASE}${path}`;
    try {
      if (Platform.OS === "web") {
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) throw new Error(`Server returned ${r.status}`);
        const blob = await r.blob();
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = u; a.download = filename; a.click();
        URL.revokeObjectURL(u);
      } else {
        const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
        if (!dir) throw new Error("No writable directory available");
        const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileUri = `${dir}${Date.now()}-${safeName}`;
        const result = await FileSystem.downloadAsync(url, fileUri, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(result.uri, {
            mimeType: filename.endsWith(".pdf") ? "application/pdf" : "text/csv",
            dialogTitle: `Share ${filename}`,
            UTI: filename.endsWith(".pdf") ? "com.adobe.pdf" : "public.comma-separated-values-text",
          });
        }
      }
    } catch (e: any) {
      if (e?.message !== "The user did not share") {
        Alert.alert("Download failed", e?.message || "Could not download. Check your connection.");
      }
    }
    setDownloading(null);
  };

  const onlineStaff = (activeStaff as any[]).filter((s: any) => s.isOnline).length;
  const attPct = attStats?.total > 0
    ? Math.round((attStats.entered / attStats.total) * 100)
    : 0;

  const statCards = [
    { label: "Students", value: summary?.totalStudents ?? "—", icon: "users", color: theme.tint, sub: "Registered" },
    { label: "Hostels", value: summary?.totalHostels ?? "—", icon: "home", color: "#22c55e", sub: "Active" },
    { label: "Staff Online", value: onlineStaff, icon: "activity", color: "#8b5cf6", sub: "Right now" },
    { label: "Notices", value: summary?.totalAnnouncements ?? "—", icon: "bell", color: "#f59e0b", sub: "Posted" },
  ];

  const pdfExports = [
    {
      label: "Students Directory",
      sub: "Full printable student roster with hostel & mess details",
      icon: "users" as const,
      path: "/pdf/students",
      filename: "students.pdf",
      color: theme.tint,
      access: "admin",
    },
    {
      label: "Attendance Report",
      sub: `Daily attendance sheet for ${formattedDate}`,
      icon: "check-square" as const,
      path: `/pdf/attendance?date=${today}`,
      filename: `attendance-${today}.pdf`,
      color: "#22c55e",
      access: "admin",
    },
    {
      label: "Check-in Report",
      sub: `Campus gate check-in/out log for today`,
      icon: "log-in" as const,
      path: `/pdf/checkins?date=${today}`,
      filename: `checkins-${today}.pdf`,
      color: "#8b5cf6",
      access: "admin",
    },
    {
      label: "Staff Activity Logs",
      sub: "Complete staff action history (last 1,000 entries)",
      icon: "activity" as const,
      path: "/pdf/activity-logs",
      filename: "activity-logs.pdf",
      color: "#6366f1",
      access: "superadmin",
    },
    {
      label: "Full Campus Report",
      sub: isSuperAdmin ? "All-hostel summary + complete student table" : "Your hostel summary",
      icon: "database" as const,
      path: "/pdf/full-report",
      filename: "full-report.pdf",
      color: "#ef4444",
      access: "superadmin",
    },
  ];

  const csvExports = [
    { label: "Students List", sub: isSuperAdmin ? "All students — complete data" : "Your hostel students", icon: "users" as const, path: "/export/students.csv", filename: "students.csv", color: theme.tint },
    { label: "Today's Attendance", sub: `Attendance snapshot — ${formattedDate}`, icon: "check-square" as const, path: `/export/attendance.csv?date=${today}`, filename: `attendance-${today}.csv`, color: "#22c55e" },
    { label: "Check-in Log", sub: "Gate check-in/out records for today", icon: "log-in" as const, path: `/export/checkins.csv?date=${today}`, filename: `checkins-${today}.csv`, color: "#8b5cf6" },
    { label: "Inventory Report", sub: "Mattress, bedsheet, pillow status", icon: "package" as const, path: "/export/inventory.csv", filename: "inventory.csv", color: "#f59e0b" },
    { label: "Activity Logs", sub: "Staff login and action events", icon: "activity" as const, path: "/export/timelogs", filename: "activity-logs.csv", color: "#6366f1" },
    { label: "Full Data Export", sub: isSuperAdmin ? "All data combined" : "Your hostel data", icon: "database" as const, path: "/export/full-report.csv", filename: "full-report.csv", color: "#ef4444" },
  ];

  const quickNav = [
    { label: "Staff Status Board", icon: "activity" as const, path: "/admin/staff-status", color: "#8b5cf6" },
    { label: "Activity Logs Viewer", icon: "clock" as const, path: "/admin/activity-logs", color: "#6366f1" },
    { label: "CSV Data Import", icon: "upload-cloud" as const, path: "/admin/csv-import", color: "#22c55e" },
    { label: "Master Student Table", icon: "database" as const, path: "/admin/master-table", color: theme.tint },
    { label: "Global Search", icon: "search" as const, path: "/admin/search", color: "#f59e0b" },
  ];

  const visiblePdfs = isSuperAdmin ? pdfExports : pdfExports.filter(p => p.access === "admin");

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headerTitle, { color: theme.text }]}>Reports & Export</Text>
          <Text style={[styles.headerSub, { color: theme.textSecondary }]}>
            {isSuperAdmin ? "All hostels" : "Assigned hostels"}  ·  {formattedDate}
          </Text>
        </View>
        <Pressable onPress={onRefresh} style={[styles.refreshBtn, { backgroundColor: theme.tint + "18" }]} hitSlop={8}>
          <Feather name="refresh-cw" size={16} color={theme.tint} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === "web" ? 80 : 100 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Overview Stats ── */}
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>OVERVIEW</Text>
        {isLoading ? <CardSkeleton /> : (
          <View style={styles.statsGrid}>
            {statCards.map(s => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.statIconWrap, { backgroundColor: s.color + "18" }]}>
                  <Feather name={s.icon as any} size={18} color={s.color} />
                </View>
                <Text style={[styles.statValue, { color: theme.text }]}>{s.value}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{s.label}</Text>
                <Text style={[styles.statSub, { color: s.color }]}>{s.sub}</Text>
              </View>
            ))}
          </View>
        )}

        {/* ── Attendance Today ── */}
        {attStats && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: 8 }]}>TODAY'S ATTENDANCE</Text>
            <AnimatedCard style={{ marginBottom: 16 }}>
              <View style={styles.attRow}>
                <AttBox label="Total" value={attStats.total} color={theme.text} bg={theme.border + "40"} />
                <AttBox label="In Campus" value={attStats.entered} color="#22c55e" bg="#22c55e18" />
                <AttBox label="Pending" value={attStats.notEntered} color="#f59e0b" bg="#f59e0b18" />
              </View>
              {attStats.total > 0 && (
                <View style={{ marginTop: 14 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                    <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>Attendance rate today</Text>
                    <Text style={[styles.progressPct, { color: attPct >= 70 ? "#22c55e" : attPct >= 40 ? "#f59e0b" : "#ef4444" }]}>
                      {attPct}%
                    </Text>
                  </View>
                  <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                    <View style={[styles.progressFill, {
                      width: `${attPct}%` as any,
                      backgroundColor: attPct >= 70 ? "#22c55e" : attPct >= 40 ? "#f59e0b" : "#ef4444",
                    }]} />
                  </View>
                </View>
              )}
            </AnimatedCard>
          </>
        )}

        {/* ── PDF Reports ── */}
        <View style={styles.sectionHeader}>
          <Feather name="file-text" size={15} color="#ef4444" />
          <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: 0 }]}>PDF REPORTS</Text>
        </View>
        <Text style={[styles.sectionDesc, { color: theme.textTertiary }]}>
          Professionally formatted reports ready to print or share
        </Text>
        <View style={styles.exportGrid}>
          {visiblePdfs.map(({ label, sub, icon, path, filename, color }) => {
            const isBusy = downloading === filename;
            return (
              <Pressable
                key={label}
                onPress={() => download(path, filename)}
                disabled={!!downloading}
                style={({ pressed }) => [styles.exportCard, {
                  backgroundColor: theme.surface,
                  borderColor: isBusy ? color + "80" : theme.border,
                  opacity: isBusy ? 0.9 : pressed ? 0.82 : 1,
                }]}
              >
                <View style={[styles.exportCardIcon, { backgroundColor: color + "18" }]}>
                  {isBusy
                    ? <ActivityIndicator size="small" color={color} />
                    : <Feather name={icon} size={22} color={color} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.exportCardLabel, { color: theme.text }]}>{label}</Text>
                  <Text style={[styles.exportCardSub, { color: theme.textSecondary }]} numberOfLines={2}>
                    {isBusy ? "Generating & downloading…" : sub}
                  </Text>
                </View>
                <View style={[styles.exportBadge, { backgroundColor: color + "18", borderColor: color + "30" }]}>
                  <Text style={[styles.exportBadgeText, { color }]}>PDF</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* ── CSV Exports ── */}
        <View style={[styles.sectionHeader, { marginTop: 16 }]}>
          <Feather name="download" size={15} color="#22c55e" />
          <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: 0 }]}>CSV DATA EXPORTS</Text>
        </View>
        <Text style={[styles.sectionDesc, { color: theme.textTertiary }]}>
          Raw data exports compatible with Excel and Google Sheets
        </Text>
        {csvExports.map(({ label, sub, icon, path, filename, color }) => {
          const isBusy = downloading === filename;
          return (
            <Pressable
              key={label}
              onPress={() => download(path, filename)}
              disabled={!!downloading}
              style={({ pressed }) => [styles.exportRow, {
                backgroundColor: theme.surface,
                borderColor: isBusy ? color + "60" : theme.border,
                opacity: isBusy ? 0.9 : pressed ? 0.82 : 1,
              }]}
            >
              <View style={[styles.exportRowIcon, { backgroundColor: color + "18" }]}>
                {isBusy
                  ? <ActivityIndicator size="small" color={color} />
                  : <Feather name={icon} size={18} color={color} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.exportRowLabel, { color: theme.text }]}>{label}</Text>
                <Text style={[styles.exportRowSub, { color: theme.textSecondary }]} numberOfLines={1}>
                  {isBusy ? "Downloading…" : sub}
                </Text>
              </View>
              <View style={[styles.exportBadge, { backgroundColor: color + "18", borderColor: color + "30" }]}>
                <Text style={[styles.exportBadgeText, { color }]}>CSV</Text>
              </View>
            </Pressable>
          );
        })}

        {/* ── Quick Navigation ── */}
        <View style={[styles.sectionHeader, { marginTop: 16 }]}>
          <Feather name="zap" size={15} color={theme.tint} />
          <Text style={[styles.sectionTitle, { color: theme.textSecondary, marginTop: 0 }]}>QUICK ACCESS</Text>
        </View>
        <View style={styles.navGrid}>
          {quickNav.map(({ label, icon, path, color }) => (
            <Pressable
              key={label}
              onPress={() => { Haptics.selectionAsync(); router.push(path as any); }}
              style={({ pressed }) => [styles.navCard, {
                backgroundColor: theme.surface,
                borderColor: theme.border,
                opacity: pressed ? 0.8 : 1,
              }]}
            >
              <View style={[styles.navCardIcon, { backgroundColor: color + "18" }]}>
                <Feather name={icon} size={20} color={color} />
              </View>
              <Text style={[styles.navCardLabel, { color: theme.text }]} numberOfLines={2}>{label}</Text>
              <Feather name="chevron-right" size={14} color={theme.textTertiary} style={{ marginTop: 4 }} />
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function AttBox({ label, value, color, bg }: { label: string; value: any; color: string; bg: string }) {
  return (
    <View style={[styles.attBox, { backgroundColor: bg }]}>
      <Text style={[styles.attVal, { color }]}>{value ?? "—"}</Text>
      <Text style={[styles.attLabel, { color: color + "CC" }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  header: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14,
    borderBottomWidth: 1,
  },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  refreshBtn: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },

  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4, marginTop: 20 },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  sectionDesc: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 10 },

  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4 },
  statCard: {
    width: (SCREEN_W - 52) / 2,
    borderRadius: 14, borderWidth: 1,
    padding: 14, gap: 4,
  },
  statIconWrap: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  statValue: { fontSize: 26, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  statSub: { fontSize: 11, fontFamily: "Inter_400Regular" },

  attRow: { flexDirection: "row", gap: 8 },
  attBox: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 12, gap: 3 },
  attVal: { fontSize: 24, fontFamily: "Inter_700Bold" },
  attLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  progressLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  progressPct: { fontSize: 13, fontFamily: "Inter_700Bold" },
  progressBar: { height: 7, borderRadius: 4, overflow: "hidden" },
  progressFill: { height: 7, borderRadius: 4 },

  exportGrid: { gap: 8, marginBottom: 4 },
  exportCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 14, borderRadius: 14, borderWidth: 1,
  },
  exportCardIcon: { width: 46, height: 46, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  exportCardLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold", marginBottom: 2 },
  exportCardSub: { fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },

  exportRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    padding: 13, borderRadius: 12, borderWidth: 1, marginBottom: 7,
  },
  exportRowIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  exportRowLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  exportRowSub: { fontSize: 12, fontFamily: "Inter_400Regular" },

  exportBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  exportBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },

  navGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 },
  navCard: {
    width: (SCREEN_W - 48) / 2 - 4,
    borderRadius: 14, borderWidth: 1,
    padding: 14, gap: 8,
  },
  navCardIcon: { width: 40, height: 40, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  navCardLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", lineHeight: 18 },
});
