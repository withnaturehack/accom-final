import React, { useCallback } from "react";
import {
  View, Text, ScrollView, StyleSheet, Pressable,
  RefreshControl, Platform, useColorScheme, Alert, Share,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import Constants from "expo-constants";
import Colors from "@/constants/colors";
import { useApiRequest, useAuth } from "@/context/AuthContext";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";

const PROD_API = "https://zip-12--vpahaddevbhoomi.replit.app/api";
const API_BASE: string =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra?.apiUrl as string) ||
  PROD_API;

export default function ReportsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const request = useApiRequest();
  const { token, user } = useAuth();
  const isWeb = Platform.OS === "web";
  const topPad = Platform.OS === "web" ? 24 : Math.max(insets.top + 20, 100);

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
  const onRefresh = useCallback(async () => { setRefreshing(true); await refetch(); setRefreshing(false); }, [refetch]);
  const isSuperAdmin = user?.role === "superadmin";
  const scopeText = isSuperAdmin ? "All hostels" : "Assigned hostels only";

  const today = new Date().toISOString().split("T")[0];

  const download = async (path: string, filename: string) => {
    Haptics.selectionAsync();
    const url = `${API_BASE}${path}`;
    if (Platform.OS === "web") {
      fetch(url, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.blob())
        .then(blob => {
          const u = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = u; a.download = filename; a.click();
          URL.revokeObjectURL(u);
        }).catch(() => Alert.alert("Error", "Download failed"));
    } else {
      try {
        const dir = FileSystem.documentDirectory || FileSystem.cacheDirectory;
        if (!dir) throw new Error("No writable directory available");

        const safeName = filename.replaceAll(/[^a-zA-Z0-9._-]/g, "_");
        const fileUri = `${dir}${Date.now()}-${safeName}`;
        const result = await FileSystem.downloadAsync(url, fileUri, {
          headers: { Authorization: `Bearer ${token}` },
        });

        await Share.share({
          url: result.uri,
          title: filename,
          message: `Report downloaded: ${filename}`,
        });
      } catch (e: any) {
        Alert.alert("Download failed", e?.message || "Could not download report on this device");
      }
    }
  };

  const csvExports = [
    { label: "Students List", sub: isSuperAdmin ? "All students with full details" : "Assigned-hostel students with full details", icon: "users", path: "/export/students.csv", filename: "students.csv", color: theme.tint },
    { label: "Today's Attendance", sub: today, icon: "check-square", path: `/export/attendance.csv?date=${today}`, filename: `attendance-${today}.csv`, color: "#22c55e" },
    { label: "Check-in Report", sub: `Today's campus check-ins · ${today}`, icon: "log-in", path: `/export/checkins.csv?date=${today}`, filename: `checkins-${today}.csv`, color: "#8b5cf6" },
    { label: "Inventory Report", sub: "Mattress, bedsheet, pillow status", icon: "package", path: "/export/inventory.csv", filename: "inventory.csv", color: "#f59e0b" },
    { label: "Activity Logs", sub: "Staff login, active/inactive events", icon: "activity", path: "/export/timelogs", filename: "activity-logs.csv", color: "#6366f1" },
    { label: "Full Report", sub: isSuperAdmin ? "All data combined" : "Assigned-hostel data combined", icon: "database", path: "/export/full-report.csv", filename: "full-report.csv", color: "#ef4444" },
  ];

  const pdfExports = [
    { label: "Students PDF", sub: "Printable student roster", icon: "users", path: "/pdf/students", filename: "students.pdf", color: theme.tint },
    { label: "Attendance PDF", sub: `Report for ${today}`, icon: "check-square", path: `/pdf/attendance?date=${today}`, filename: `attendance-${today}.pdf`, color: "#22c55e" },
    { label: "Check-in PDF", sub: `Campus check-ins for ${today}`, icon: "log-in", path: `/pdf/checkins?date=${today}`, filename: `checkins-${today}.pdf`, color: "#8b5cf6" },
    { label: "Activity Logs PDF", sub: "Staff activity history", icon: "activity", path: "/pdf/activity-logs", filename: "activity-logs.pdf", color: "#6366f1" },
    { label: "Full Report PDF", sub: isSuperAdmin ? "Complete campus report" : "Assigned-hostel report", icon: "database", path: "/pdf/full-report", filename: "full-report.pdf", color: "#ef4444" },
  ];

  const statCards = [
    { label: "Total Students", value: summary?.totalStudents, icon: "users", color: theme.tint },
    { label: "Total Hostels", value: summary?.totalHostels, icon: "home", color: "#22c55e" },
    { label: "Lost Items", value: summary?.totalLostItems, icon: "search", color: "#f59e0b" },
    { label: "Active Staff", value: activeStaff.filter(s => s.isOnline).length, icon: "activity", color: "#22c55e" },
    { label: "Items Found", value: summary?.foundItems, icon: "check-circle", color: "#22c55e" },
    { label: "Announcements", value: summary?.totalAnnouncements, icon: "volume-2", color: "#8b5cf6" },
  ];

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: 16, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Reports & Export</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === "web" ? 80 : 90 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        showsVerticalScrollIndicator={false}
      >
        {/* System Stats */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>{`System Overview · ${scopeText}`}</Text>
        {isLoading ? <CardSkeleton /> : (
          <View style={styles.statsGrid}>
            {statCards.map(s => (
              <View key={s.label} style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                <View style={[styles.statIcon, { backgroundColor: s.color + "20" }]}>
                  <Feather name={s.icon as any} size={18} color={s.color} />
                </View>
                <Text style={[styles.statVal, { color: theme.text }]}>{s.value ?? "—"}</Text>
                <Text style={[styles.statLabel, { color: theme.textSecondary }]}>{s.label}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Attendance */}
        {attStats && (
          <>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>Today's Attendance</Text>
            <AnimatedCard style={{ marginBottom: 16 }}>
              <View style={styles.attRow}>
                <AttBox label="Total" value={attStats.total} color={theme.text} theme={theme} />
                <AttBox label="In Campus" value={attStats.entered} color="#22c55e" theme={theme} />
                <AttBox label="Pending" value={attStats.notEntered} color="#f59e0b" theme={theme} />
              </View>
              {attStats.total > 0 && (
                <View style={{ marginTop: 12 }}>
                  <View style={[styles.progressBar, { backgroundColor: theme.border }]}>
                    <View style={[styles.progressFill, { width: `${Math.round((attStats.entered / attStats.total) * 100)}%` as any, backgroundColor: "#22c55e" }]} />
                  </View>
                  <Text style={[styles.progressLabel, { color: theme.textSecondary }]}>
                    {Math.round((attStats.entered / attStats.total) * 100)}% attendance today
                  </Text>
                </View>
              )}
            </AnimatedCard>
          </>
        )}

        {/* CSV Downloads */}
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          <Feather name="download" size={16} /> CSV Downloads
        </Text>
        {csvExports.map(({ label, sub, icon, path, filename, color }) => (
          <Pressable key={label} onPress={() => download(path, filename)}
            style={[styles.exportRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.exportIcon, { backgroundColor: color + "20" }]}>
              <Feather name={icon as any} size={20} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.exportLabel, { color: theme.text }]}>{label}</Text>
              <Text style={[styles.exportSub, { color: theme.textSecondary }]}>{sub}</Text>
            </View>
            <View style={[styles.csvBadge, { backgroundColor: color + "20" }]}>
              <Text style={[styles.csvBadgeText, { color }]}>CSV</Text>
            </View>
          </Pressable>
        ))}

        {/* PDF Downloads */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 8 }]}>
          <Feather name="file-text" size={16} color="#ef4444" /> PDF Downloads
        </Text>
        {pdfExports.map(({ label, sub, icon, path, filename, color }) => (
          <Pressable key={label} onPress={() => download(path, filename)}
            style={[styles.exportRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.exportIcon, { backgroundColor: color + "20" }]}>
              <Feather name={icon as any} size={20} color={color} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.exportLabel, { color: theme.text }]}>{label}</Text>
              <Text style={[styles.exportSub, { color: theme.textSecondary }]}>{sub}</Text>
            </View>
            <View style={[styles.csvBadge, { backgroundColor: "#ef444420" }]}>
              <Text style={[styles.csvBadgeText, { color: "#ef4444" }]}>PDF</Text>
            </View>
          </Pressable>
        ))}

        {/* Quick Navigation */}
        <Text style={[styles.sectionTitle, { color: theme.text, marginTop: 8 }]}>Quick Navigation</Text>
        {[
          { label: "Staff Status", icon: "activity", path: "/admin/staff-status" },
          { label: "Activity Logs", icon: "clock", path: "/admin/activity-logs" },
          { label: "CSV Import", icon: "upload-cloud", path: "/admin/csv-import" },
          { label: "Master Table", icon: "database", path: "/admin/master-table" },
          { label: "Global Search", icon: "search", path: "/admin/search" },
        ].map(({ label, icon, path }) => (
          <Pressable key={label} onPress={() => { Haptics.selectionAsync(); router.push(path as any); }}
            style={[styles.exportRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={[styles.exportIcon, { backgroundColor: theme.tint + "20" }]}>
              <Feather name={icon as any} size={20} color={theme.tint} />
            </View>
            <Text style={[styles.exportLabel, { color: theme.text, flex: 1 }]}>{label}</Text>
            <Feather name="chevron-right" size={16} color={theme.textTertiary} />
          </Pressable>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function AttBox({ label, value, color, theme }: any) {
  return (
    <View style={[styles.attBox, { backgroundColor: color + "12", borderColor: color + "30" }]}>
      <Text style={[styles.attVal, { color }]}>{value ?? "—"}</Text>
      <Text style={[styles.attLabel, { color: theme.textSecondary }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingBottom: 20, borderBottomWidth: 1, gap: 14 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", flex: 1, textAlign: "center" },
  sectionTitle: { fontSize: 16, fontFamily: "Inter_700Bold", marginBottom: 10, marginTop: 4 },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 16 },
  statCard: { width: "47%", alignItems: "center", padding: 14, borderRadius: 14, borderWidth: 1, gap: 6 },
  statIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  statVal: { fontSize: 24, fontFamily: "Inter_700Bold" },
  statLabel: { fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center" },
  attRow: { flexDirection: "row", gap: 8 },
  attBox: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 10, borderWidth: 1, gap: 3 },
  attVal: { fontSize: 22, fontFamily: "Inter_700Bold" },
  attLabel: { fontSize: 12, fontFamily: "Inter_400Regular" },
  progressBar: { height: 6, borderRadius: 3, overflow: "hidden" },
  progressFill: { height: 6, borderRadius: 3 },
  progressLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 6, textAlign: "center" },
  exportRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  exportIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  exportLabel: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  exportSub: { fontSize: 12, fontFamily: "Inter_400Regular" },
  csvBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  csvBadgeText: { fontSize: 12, fontFamily: "Inter_700Bold" },
});
