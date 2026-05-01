import React, { useState, useCallback, useMemo } from "react";
import {
  View, Text, FlatList, StyleSheet, Pressable, Modal, ScrollView,
  RefreshControl, Platform, useColorScheme,
  ActivityIndicator, TextInput, Alert, Share,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApiRequest, useAuth } from "@/context/AuthContext";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

const PAGE = 50;
const FETCH_PAGE_SIZE = 1000;

function formatDT(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata", hour12: true,
      day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

function formatTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleTimeString("en-IN", {
      timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit",
    });
  } catch { return "—"; }
}

function safeJson(v: any): any {
  if (typeof v !== "string") return v;
  try { return JSON.parse(v); } catch { return v; }
}

// ─── Student Detail Modal ─────────────────────────────────────────────────────
function StudentDetailModal({ student, visible, onClose, theme, onUpdated }: {
  student: any; visible: boolean; onClose: () => void; theme: any; onUpdated?: () => void;
}) {
  const request = useApiRequest();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [checking, setChecking] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokingItem, setRevokingItem] = useState<string | null>(null);

  const canMark = ["admin", "superadmin", "coordinator", "volunteer"].includes(user?.role || "");

  const { data: profile, isLoading } = useQuery({
    queryKey: ["student-detail", student?.id],
    queryFn: async () => {
      try { return await request(`/students/${student?.id}`); } catch { return null; }
    },
    enabled: visible && !!student?.id,
    staleTime: 15000,
    refetchInterval: visible ? 10000 : false,
  });

  const { data: inventoryData, refetch: refetchInv } = useQuery({
    queryKey: ["student-inv", student?.id],
    queryFn: async () => {
      try { return await request(`/attendance/inventory/${student?.id}`); } catch { return {}; }
    },
    enabled: visible && !!student?.id,
    staleTime: 10000,
    refetchInterval: visible ? 10000 : false,
  });

  const { data: checkins = [] } = useQuery<any[]>({
    queryKey: ["student-checkin-history", student?.id],
    queryFn: async () => {
      try { return await request(`/students/${student?.id}/checkins-history?limit=10`) || []; } catch { return []; }
    },
    enabled: visible && !!student?.id,
    staleTime: 20000,
  });

  const s = profile || student;
  const isCheckedIn = !!s?.checkInTime && !s?.checkOutTime;
  const isCheckedOut = !!s?.checkOutTime;
  const hasSession = isCheckedIn || isCheckedOut;
  const inv = (inventoryData as any) || {};
  const attColor = isCheckedOut ? "#6366f1" : isCheckedIn ? "#22c55e" : "#f59e0b";
  const attLabel = isCheckedOut ? "Checked Out" : isCheckedIn ? "In Campus" : "Not Checked In";

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["student-detail", s?.id] });
    qc.invalidateQueries({ queryKey: ["student-checkin-history", s?.id] });
    qc.invalidateQueries({ queryKey: ["master-students"] });
    qc.invalidateQueries({ queryKey: ["student-inv", s?.id] });
    onUpdated?.();
  };

  const markCheckin = async () => {
    if (!s?.id) return;
    setChecking(true);
    try {
      if (hasSession) {
        await request(`/checkins/${s.id}/today`, { method: "DELETE" });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        invalidate();
      } else {
        await request(`/checkins/${s.id}`, { method: "POST", body: JSON.stringify({}) });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        invalidate();
      }
    } catch (e: any) {
      Alert.alert("Error", e.message || "Action failed");
    }
    setChecking(false);
  };

  const confirmRevoke = (title: string, msg: string, fn: () => void) => {
    if (Platform.OS === "web") {
      if (window.confirm(`${title}\n\n${msg}`)) fn();
    } else {
      Alert.alert(title, msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Revoke", style: "destructive", onPress: fn },
      ]);
    }
  };

  const revokeCheckin = () => confirmRevoke(
    "Revoke Today's Check-in?",
    `Clears today's check-in/check-out record and inventory for ${s?.name || "this student"}.`,
    async () => {
      setRevoking(true);
      try {
        await request(`/checkins/${s.id}/today`, { method: "DELETE" });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        invalidate();
      } catch (e: any) { Alert.alert("Error", e.message || "Failed"); }
      setRevoking(false);
    },
  );

  const revokeItem = (item: "mattress" | "bedsheet" | "pillow") =>
    confirmRevoke(
      `Revoke ${item}?`,
      `Mark ${item} as not given for this student.`,
      async () => {
        setRevokingItem(item);
        try {
          await request(`/attendance/inventory/${s.id}/revoke-item`, {
            method: "POST", body: JSON.stringify({ item }),
          });
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          refetchInv();
          qc.invalidateQueries({ queryKey: ["master-students"] });
        } catch (e: any) { Alert.alert("Error", e.message || "Failed"); }
        setRevokingItem(null);
      },
    );

  const revokeAllInv = () => confirmRevoke(
    "Reset All Inventory?",
    "Unlocks and clears all inventory for this student today.",
    async () => {
      setRevoking(true);
      try {
        await request(`/attendance/inventory/${s.id}/revoke`, { method: "POST", body: JSON.stringify({}) });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        refetchInv();
        qc.invalidateQueries({ queryKey: ["master-students"] });
      } catch (e: any) { Alert.alert("Error", e.message || "Failed"); }
      setRevoking(false);
    },
  );

  if (!student) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sd.overlay} onPress={onClose}>
        <Pressable style={[sd.sheet, { backgroundColor: theme.surface }]} onPress={e => e.stopPropagation()}>
          <View style={sd.handle} />
          {isLoading ? (
            <ActivityIndicator color={theme.tint} style={{ marginVertical: 40 }} />
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 32 }}>
              {/* Profile header */}
              <View style={[sd.profileRow, { borderBottomColor: theme.border }]}>
                <View style={[sd.avatar, { backgroundColor: theme.tint + "25" }]}>
                  <Text style={[sd.avatarText, { color: theme.tint }]}>{(s?.name || "?").charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[sd.name, { color: theme.text }]} numberOfLines={2}>{s?.name || "Unknown"}</Text>
                  <Text style={[sd.sub, { color: theme.textSecondary }]} numberOfLines={1}>{s?.email || s?.rollNumber || ""}</Text>
                  {s?.rollNumber && s?.email && (
                    <Text style={[sd.sub, { color: theme.textTertiary, fontSize: 11 }]}>Roll: {s.rollNumber}</Text>
                  )}
                </View>
                <Pressable onPress={onClose} hitSlop={8}>
                  <Feather name="x" size={20} color={theme.textSecondary} />
                </Pressable>
              </View>

              {/* Attendance status bar */}
              <View style={[sd.statusBar, { backgroundColor: attColor + "15", borderColor: attColor + "35" }]}>
                <View style={[sd.statusDot, { backgroundColor: attColor }]} />
                <Text style={[sd.statusLabel, { color: attColor }]}>{attLabel}</Text>
                {s?.checkInTime && (
                  <Text style={[sd.statusTime, { color: attColor + "cc" }]}>In: {formatDT(s.checkInTime)}</Text>
                )}
                {s?.checkOutTime && (
                  <Text style={[sd.statusTime, { color: attColor + "cc" }]}>Out: {formatDT(s.checkOutTime)}</Text>
                )}
              </View>

              {/* Info chips */}
              <View style={sd.chips}>
                {!!(s?.allottedHostel || s?.hostelName) && (
                  <View style={[sd.chip, { backgroundColor: theme.tint + "15", borderColor: theme.tint + "30" }]}>
                    <Feather name="home" size={11} color={theme.tint} />
                    <Text style={[sd.chipText, { color: theme.tint }]}>{s.allottedHostel || s.hostelName}</Text>
                  </View>
                )}
                {!!s?.roomNumber && (
                  <View style={[sd.chip, { backgroundColor: "#8b5cf615", borderColor: "#8b5cf630" }]}>
                    <Feather name="layers" size={11} color="#8b5cf6" />
                    <Text style={[sd.chipText, { color: "#8b5cf6" }]}>Room {s.roomNumber}</Text>
                  </View>
                )}
                {!!(s?.allottedMess || s?.assignedMess) && (
                  <View style={[sd.chip, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b30" }]}>
                    <Feather name="coffee" size={11} color="#f59e0b" />
                    <Text style={[sd.chipText, { color: "#f59e0b" }]}>{s.allottedMess || s.assignedMess}</Text>
                  </View>
                )}
                {!!s?.gender && (
                  <View style={[sd.chip, { backgroundColor: "#3b82f615", borderColor: "#3b82f630" }]}>
                    <Text style={[sd.chipText, { color: "#3b82f6" }]}>{s.gender}</Text>
                  </View>
                )}
              </View>

              {/* Key details */}
              <View style={[sd.card, { backgroundColor: theme.background, borderColor: theme.border }]}>
                {[
                  { icon: "tag", label: "Roll No.", value: s?.rollNumber },
                  { icon: "hash", label: "Room", value: s?.roomNumber },
                  { icon: "map-pin", label: "Area", value: s?.area },
                  { icon: "book", label: "DS/ES", value: s?.dsEs },
                  { icon: "phone", label: "Mobile", value: s?.mobileNumber || s?.contactNumber || s?.phone },
                  { icon: "alert-circle", label: "Emergency", value: s?.emergencyContact },
                  { icon: "file-text", label: "Remarks", value: s?.remarks },
                ].filter(f => f.value).map((f, i, arr) => (
                  <View key={f.label} style={[sd.row, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                    <Feather name={f.icon as any} size={13} color={theme.tint} />
                    <Text style={[sd.rowLabel, { color: theme.textSecondary }]}>{f.label}</Text>
                    <Text style={[sd.rowValue, { color: theme.text }]}>{f.value}</Text>
                  </View>
                ))}
              </View>

              {/* Inventory */}
              <View style={[sd.card, { backgroundColor: theme.background, borderColor: theme.border, marginTop: 10 }]}>
                <Text style={[sd.sectionTitle, { color: theme.text }]}>Inventory Today</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 10 }}>
                  {(["mattress", "bedsheet", "pillow"] as const).map(item => {
                    const given = !!inv?.[item];
                    const submitted = !!inv?.[`${item}Submitted`] || (!!inv?.inventoryLocked && given);
                    const color = submitted ? "#22c55e" : given ? "#f59e0b" : theme.textTertiary;
                    const bg = submitted ? "#22c55e15" : given ? "#fef3c7" : theme.surface;
                    const border = submitted ? "#22c55e40" : given ? "#f59e0b40" : theme.border;
                    const icon = submitted ? "check-circle" : given ? "clock" : "circle";
                    return (
                      <View key={item} style={{ flex: 1, alignItems: "center" }}>
                        <View style={[sd.invChip, { backgroundColor: bg, borderColor: border }]}>
                          {revokingItem === item
                            ? <ActivityIndicator size="small" color={color} />
                            : <Feather name={icon as any} size={18} color={color} />}
                          <Text style={[sd.invLabel, { color }]}>{item.charAt(0).toUpperCase() + item.slice(1)}</Text>
                          <Text style={[sd.invStatus, { color }]}>
                            {submitted ? "Submitted" : given ? "Pending" : "Not Taken"}
                          </Text>
                        </View>
                        {canMark && (given || submitted) && (
                          <Pressable
                            onPress={() => revokeItem(item)}
                            disabled={!!revokingItem}
                            style={({ pressed }) => [sd.revokeItemBtn, { opacity: pressed || !!revokingItem ? 0.5 : 1 }]}
                          >
                            <Feather name="x" size={10} color="#ef4444" />
                            <Text style={sd.revokeItemBtnText}>Revoke</Text>
                          </Pressable>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>

              {/* Actions */}
              {canMark && (
                <View style={{ gap: 8, marginTop: 12 }}>
                  {/* Check-in / Revoke check-in toggle */}
                  <Pressable
                    onPress={hasSession ? revokeCheckin : markCheckin}
                    disabled={checking || revoking}
                    style={[sd.actionBtn, {
                      backgroundColor: hasSession ? "#ef444415" : "#22c55e15",
                      borderColor: hasSession ? "#ef444440" : "#22c55e40",
                    }]}
                  >
                    {checking || revoking
                      ? <ActivityIndicator size="small" color={hasSession ? "#ef4444" : "#22c55e"} />
                      : (
                        <>
                          <Feather name={hasSession ? "rotate-ccw" : "log-in"} size={18} color={hasSession ? "#ef4444" : "#22c55e"} />
                          <Text style={[sd.actionBtnText, { color: hasSession ? "#ef4444" : "#22c55e" }]}>
                            {hasSession ? "Revoke Today's Check-in" : "Mark Campus Check-in"}
                          </Text>
                        </>
                      )}
                  </Pressable>

                  {/* Unlock & Reset Inventory — only when there's something to reset */}
                  {hasSession && (inv.mattress || inv.bedsheet || inv.pillow || inv.inventoryLocked) && (
                    <Pressable
                      onPress={revokeAllInv}
                      disabled={revoking}
                      style={[sd.actionBtn, { backgroundColor: "#f59e0b15", borderColor: "#f59e0b40" }]}
                    >
                      {revoking
                        ? <ActivityIndicator size="small" color="#f59e0b" />
                        : (
                          <>
                            <Feather name="unlock" size={18} color="#f59e0b" />
                            <Text style={[sd.actionBtnText, { color: "#92400e" }]}>Unlock & Reset Inventory</Text>
                          </>
                        )}
                    </Pressable>
                  )}
                </View>
              )}

              {/* Check-in history */}
              {(checkins as any[]).length > 0 && (
                <View style={[sd.card, { backgroundColor: theme.background, borderColor: theme.border, marginTop: 10 }]}>
                  <Text style={[sd.sectionTitle, { color: theme.text }]}>Check-in History</Text>
                  <View style={{ marginTop: 8, gap: 6 }}>
                    {(checkins as any[]).slice(0, 8).map((c: any, i: number) => (
                      <View key={c.id || i} style={[sd.histRow, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={[sd.histDate, { color: theme.text }]}>{c.date || "—"}</Text>
                          {c.checkInTime && <Text style={[sd.histTime, { color: "#22c55e" }]}>In: {formatDT(c.checkInTime)}</Text>}
                          {c.checkOutTime && <Text style={[sd.histTime, { color: "#6366f1" }]}>Out: {formatDT(c.checkOutTime)}</Text>}
                        </View>
                        <View style={[sd.histBadge, { backgroundColor: c.checkOutTime ? "#6366f120" : c.checkInTime ? "#22c55e20" : "#f59e0b20" }]}>
                          <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: c.checkOutTime ? "#6366f1" : c.checkInTime ? "#22c55e" : "#f59e0b" }}>
                            {c.checkOutTime ? "Out" : c.checkInTime ? "In" : "—"}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              <Pressable onPress={onClose} style={[sd.closeBtn, { borderColor: theme.border, marginTop: 14 }]}>
                <Text style={[sd.closeBtnText, { color: theme.textSecondary }]}>Close</Text>
              </Pressable>
            </ScrollView>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────
export default function MasterTableScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const request = useApiRequest();
  const qc = useQueryClient();
  const { user } = useAuth();

  const [filter, setFilter] = useState<"all" | "in_campus" | "checked_out" | "not_checked_in">("all");
  const [search, setSearch] = useState("");
  const [hostelFilter, setHostelFilter] = useState("");
  const [shown, setShown] = useState(PAGE);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const [exporting, setExporting] = useState(false);

  const { data: hostels = [] } = useQuery<any[]>({
    queryKey: ["hostels"],
    queryFn: async () => { try { return await request("/hostels") || []; } catch { return []; } },
    staleTime: 60000,
  });

  const loadAllStudents = useCallback(async () => {
    const loaded: any[] = [];
    let offset = 0;
    while (true) {
      try {
        const response = await request(`/students?offset=${offset}&limit=${FETCH_PAGE_SIZE}`);
        const batch = Array.isArray(response) ? response : (response?.students || []);
        if (!batch.length) break;
        loaded.push(...batch);
        const total = Number(response?.total);
        if (Number.isFinite(total) && loaded.length >= total) break;
        offset += batch.length;
        if (batch.length < FETCH_PAGE_SIZE) break;
      } catch { break; }
    }
    return loaded;
  }, [request]);

  const { data: students = [], isLoading, dataUpdatedAt, refetch } = useQuery({
    queryKey: ["master-students"],
    queryFn: loadAllStudents,
    staleTime: 20000,
    gcTime: 10 * 60 * 1000,
    refetchInterval: 20000,
    placeholderData: keepPreviousData,
  });

  useFocusEffect(useCallback(() => {
    qc.invalidateQueries({ queryKey: ["master-students"] });
  }, [qc]));

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } catch {}
    setRefreshing(false);
  }, [refetch]);

  const arr: any[] = Array.isArray(students) ? students : [];

  const assignedHostelIds: string[] = useMemo(() => {
    try {
      const raw: any = user?.assignedHostelIds;
      if (!raw) return [];
      const parsed = safeJson(raw);
      return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
    } catch { return []; }
  }, [user?.assignedHostelIds]);

  const scopedHostelIds = useMemo(() => {
    if (user?.role === "superadmin") return null;
    if (user?.role === "volunteer") return [user?.hostelId].filter(Boolean) as string[];
    return Array.from(new Set([...assignedHostelIds, user?.hostelId || ""].filter(Boolean)));
  }, [user?.role, user?.hostelId, assignedHostelIds]);

  const scopedArr = useMemo(() => {
    if (!scopedHostelIds) return arr;
    if (scopedHostelIds.length === 0) return [];
    return arr.filter((s: any) => scopedHostelIds.includes(String(s.hostelId || "")));
  }, [arr, scopedHostelIds]);

  const entered = useMemo(() => scopedArr.filter(s => !!s.checkInTime && !s.checkOutTime).length, [scopedArr]);
  const checkedOut = useMemo(() => scopedArr.filter(s => !!s.checkOutTime).length, [scopedArr]);
  const notCheckedIn = scopedArr.length - entered - checkedOut;

  const filtered = useMemo(() => {
    return scopedArr.filter(s => {
      const isIn = !!s.checkInTime && !s.checkOutTime;
      const isOut = !!s.checkOutTime;
      const isNotIn = !s.checkInTime;
      if (hostelFilter && String(s.hostelId || "") !== hostelFilter) return false;
      if (filter === "in_campus" && !isIn) return false;
      if (filter === "checked_out" && !isOut) return false;
      if (filter === "not_checked_in" && !isNotIn) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const haystack = [s.name, s.rollNumber, s.roomNumber, s.assignedMess, s.allottedMess,
          s.email, s.hostelId, s.hostelName, s.allottedHostel, s.phone, s.contactNumber,
          s.mobileNumber, s.area].filter(Boolean).join(" ").toLowerCase();
        return haystack.includes(q);
      }
      return true;
    });
  }, [scopedArr, filter, search, hostelFilter]);

  const visible = filtered.slice(0, shown);

  const lastSync = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit" })
    : null;

  const exportCSV = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const dataToExport = (hostelFilter || filter !== "all" || search.trim()) ? filtered : scopedArr;
      const headers = ["Name", "Roll Number", "Email", "Hostel", "Room", "Mess", "Gender", "Age", "DS/ES", "Area", "Mobile", "Emergency", "Attendance", "Check-in", "Check-out", "Mattress", "Bedsheet", "Pillow"];
      const rows = dataToExport.map((s: any) => {
        const isIn = !!s.checkInTime && !s.checkOutTime;
        const isOut = !!s.checkOutTime;
        const inv = s.inventory || {};
        return [
          `"${(s.name || "").replace(/"/g, '""')}"`,
          s.rollNumber || "", s.email || "",
          s.allottedHostel || s.hostelName || s.hostelId || "",
          s.roomNumber || "",
          s.allottedMess || s.assignedMess || "",
          s.gender || "", s.age || "", s.dsEs || "", s.area || "",
          s.mobileNumber || s.contactNumber || s.phone || "",
          s.emergencyContact || "",
          isOut ? "Checked Out" : isIn ? "In Campus" : "Not Checked In",
          s.checkInTime ? formatDT(s.checkInTime) : "",
          s.checkOutTime ? formatDT(s.checkOutTime) : "",
          inv.mattress ? (inv.mattressSubmitted ? "Submitted" : "Given") : "",
          inv.bedsheet ? (inv.bedsheetSubmitted ? "Submitted" : "Given") : "",
          inv.pillow ? (inv.pillowSubmitted ? "Submitted" : "Given") : "",
        ].join(",");
      });
      const csv = [headers.join(","), ...rows].join("\n");
      if (Platform.OS === "web") {
        const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `master_table_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const filename = `master_table_${new Date().toISOString().slice(0, 10)}.csv`;
        const path = (FileSystem.cacheDirectory || "") + filename;
        await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: "Export Master Table" });
        } else {
          await Share.share({ message: csv, title: "Master Table Export" });
        }
      }
    } catch (e: any) {
      if (e?.message !== "The user did not share") Alert.alert("Export failed", e?.message || "Unknown error");
    }
    setExporting(false);
  }, [exporting, filtered, scopedArr, hostelFilter, filter, search]);

  const FILTERS = [
    { key: "all" as const, label: "All", value: scopedArr.length, color: theme.tint },
    { key: "in_campus" as const, label: "In Campus", value: entered, color: "#22c55e" },
    { key: "checked_out" as const, label: "Checked Out", value: checkedOut, color: "#6366f1" },
    { key: "not_checked_in" as const, label: "Not In", value: notCheckedIn, color: "#f59e0b" },
  ];

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Master Table</Text>
          <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
            {scopedArr.length.toLocaleString()} students
            {lastSync ? ` · Synced ${lastSync}` : " · Live"}
          </Text>
        </View>
        <Pressable
          onPress={exportCSV}
          disabled={exporting}
          style={[styles.exportBtn, { backgroundColor: "#22c55e18", borderColor: "#22c55e50" }]}
          hitSlop={6}
        >
          {exporting
            ? <ActivityIndicator size="small" color="#22c55e" />
            : <Feather name="download" size={15} color="#22c55e" />}
          <Text style={[styles.exportBtnText, { color: "#22c55e" }]}>Export CSV</Text>
        </Pressable>
      </View>

      {/* ── Stat pills (horizontal) ── */}
      <View style={[styles.statBar, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        {FILTERS.map(f => {
          const active = filter === f.key;
          return (
            <Pressable
              key={f.key}
              onPress={() => { Haptics.selectionAsync(); setFilter(f.key); setShown(PAGE); }}
              style={[styles.statPill, {
                backgroundColor: active ? f.color + "20" : "transparent",
                borderColor: active ? f.color : theme.border,
              }]}
            >
              <Text style={[styles.statPillNum, { color: active ? f.color : theme.text }]}>{f.value.toLocaleString()}</Text>
              <Text style={[styles.statPillLabel, { color: active ? f.color : theme.textSecondary }]} numberOfLines={1}>{f.label}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ── Search ── */}
      <View style={[styles.searchRow, { borderBottomColor: theme.border, backgroundColor: theme.surface }]}>
        <Feather name="search" size={15} color={theme.textSecondary} />
        <TextInput
          style={[styles.searchInput, { color: theme.text }]}
          placeholder="Search name, roll, room, hostel, mess…"
          placeholderTextColor={theme.textTertiary}
          value={search}
          onChangeText={(t) => { setSearch(t); setShown(PAGE); }}
          returnKeyType="search"
          autoCapitalize="none"
        />
        {(search.length > 0 || hostelFilter || filter !== "all") && (
          <Pressable onPress={() => { setSearch(""); setHostelFilter(""); setFilter("all"); setShown(PAGE); }} hitSlop={8}>
            <View style={[styles.clearBtn, { backgroundColor: theme.tint + "18" }]}>
              <Text style={{ color: theme.tint, fontSize: 10, fontFamily: "Inter_700Bold" }}>Clear</Text>
            </View>
          </Pressable>
        )}
      </View>

      {/* ── Hostel pills ── */}
      {(hostels as any[]).length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.hostelChips}
          style={[{ borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface }]}
        >
          <Pressable
            onPress={() => { setHostelFilter(""); setShown(PAGE); }}
            style={[styles.hostelChip, { backgroundColor: !hostelFilter ? theme.tint + "18" : "transparent", borderColor: !hostelFilter ? theme.tint : theme.border }]}
          >
            <Text style={[styles.hostelChipText, { color: !hostelFilter ? theme.tint : theme.textSecondary }]}>All</Text>
          </Pressable>
          {(hostels as any[]).map((h: any) => (
            <Pressable
              key={h.id}
              onPress={() => { Haptics.selectionAsync(); setHostelFilter(hostelFilter === h.id ? "" : h.id); setShown(PAGE); }}
              style={[styles.hostelChip, { backgroundColor: hostelFilter === h.id ? theme.tint + "18" : "transparent", borderColor: hostelFilter === h.id ? theme.tint : theme.border }]}
            >
              <Text style={[styles.hostelChipText, { color: hostelFilter === h.id ? theme.tint : theme.textSecondary }]}>{h.name}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      {/* ── Results bar ── */}
      <View style={[styles.resultBar, { borderBottomColor: theme.border }]}>
        <Text style={[styles.resultText, { color: theme.textSecondary }]}>
          {filtered.length.toLocaleString()} student{filtered.length !== 1 ? "s" : ""}
          {hostelFilter ? ` · ${(hostels as any[]).find((h: any) => h.id === hostelFilter)?.name || ""}` : ""}
          {isLoading ? " · loading…" : ""}
        </Text>
        {!!hostelFilter && (
          <Pressable
            onPress={() => router.push({ pathname: "/admin/hostels", params: { hostelId: hostelFilter } } as any)}
            style={[styles.viewHostelBtn, { borderColor: theme.tint + "40", backgroundColor: theme.tint + "10" }]}
          >
            <Feather name="external-link" size={11} color={theme.tint} />
            <Text style={[styles.viewHostelBtnText, { color: theme.tint }]}>Hostel</Text>
          </Pressable>
        )}
      </View>

      {/* ── Table Header ── */}
      <View style={[styles.tableHead, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
        <Text style={[styles.th, { color: theme.textSecondary, flex: 1 }]}>STUDENT</Text>
        <Text style={[styles.th, { color: theme.textSecondary, width: 76, textAlign: "center" }]}>ROOM / MESS</Text>
        <Text style={[styles.th, { color: theme.textSecondary, width: 86, textAlign: "center" }]}>STATUS</Text>
      </View>

      {isLoading && (students as any[]).length === 0 ? (
        <View style={{ padding: 16 }}><CardSkeleton /><CardSkeleton /><CardSkeleton /></View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(item, i) => item?.id || String(i)}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
          contentContainerStyle={{ paddingBottom: isWeb ? 80 : 90 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border + "60" }} />}
          onEndReached={() => { if (shown < filtered.length) setShown(s => s + PAGE); }}
          onEndReachedThreshold={0.3}
          windowSize={9}
          initialNumToRender={20}
          maxToRenderPerBatch={30}
          ListFooterComponent={() => shown < filtered.length ? (
            <View style={{ alignItems: "center", padding: 16 }}>
              <ActivityIndicator color={theme.tint} />
              <Text style={[styles.resultText, { color: theme.textTertiary, marginTop: 4 }]}>
                {filtered.length - shown} more…
              </Text>
            </View>
          ) : null}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <Feather name="users" size={44} color={theme.textTertiary} />
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                {search || hostelFilter || filter !== "all" ? "No matching students" : "No students found"}
              </Text>
              {!!search && <Text style={[styles.emptySub, { color: theme.textSecondary }]}>Try a different search term</Text>}
            </View>
          )}
          renderItem={({ item }) => {
            const isIn = !!item.checkInTime && !item.checkOutTime;
            const isOut = !!item.checkOutTime;
            const attColor = isOut ? "#6366f1" : isIn ? "#22c55e" : "#f59e0b";
            const attLabel = isOut ? "Out" : isIn ? "In Campus" : "Not In";
            const hostelName = item.allottedHostel || item.hostelName || "";
            return (
              <Pressable
                onPress={() => { Haptics.selectionAsync(); setSelectedStudent(item); }}
                style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.surface : theme.background }]}
              >
                <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10 }}>
                  <View style={[styles.avatarCircle, { backgroundColor: attColor + "18", borderColor: attColor + "35", borderWidth: 1 }]}>
                    <Text style={[styles.avatarText, { color: attColor }]}>
                      {(item.name || "?")[0].toUpperCase()}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                    <Text style={[styles.roll, { color: theme.textSecondary }]} numberOfLines={1}>
                      {item.rollNumber || item.email || ""}
                    </Text>
                    {!!hostelName && (
                      <Text style={[styles.hostelTag, { color: theme.tint + "cc" }]} numberOfLines={1}>{hostelName}</Text>
                    )}
                  </View>
                </View>
                <View style={{ width: 76, alignItems: "center" }}>
                  {!!item.roomNumber && (
                    <Text style={[styles.cell, { color: "#8b5cf6", fontFamily: "Inter_700Bold" }]} numberOfLines={1}>
                      {item.roomNumber}
                    </Text>
                  )}
                  {!!(item.allottedMess || item.assignedMess) && (
                    <Text style={[styles.cell, { color: theme.textSecondary, fontSize: 10 }]} numberOfLines={2}>
                      {(item.allottedMess || item.assignedMess || "").replace(" Mess", "").trim()}
                    </Text>
                  )}
                </View>
                <View style={{ width: 86, alignItems: "center", gap: 3 }}>
                  <View style={[styles.statusPill, { backgroundColor: attColor + "18", borderColor: attColor + "35" }]}>
                    <View style={[styles.statusDot, { backgroundColor: attColor }]} />
                    <Text style={[styles.statusText, { color: attColor }]} numberOfLines={1}>{attLabel}</Text>
                  </View>
                  {item.checkInTime && !item.checkOutTime && (
                    <Text style={[styles.timeText, { color: theme.textTertiary }]} numberOfLines={1}>
                      {formatTime(item.checkInTime)}
                    </Text>
                  )}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <StudentDetailModal
        student={selectedStudent}
        visible={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        theme={theme}
        onUpdated={refetch}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 16,
    paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, gap: 10,
  },
  backBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  exportBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 10, paddingVertical: 7, borderRadius: 10, borderWidth: 1,
  },
  exportBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  // Stat pills row
  statBar: {
    flexDirection: "row", paddingHorizontal: 12, paddingVertical: 8,
    gap: 6, borderBottomWidth: 1,
  },
  statPill: {
    flex: 1, alignItems: "center", paddingVertical: 7, paddingHorizontal: 6,
    borderRadius: 10, borderWidth: 1.5, gap: 1,
  },
  statPillNum: { fontSize: 17, fontFamily: "Inter_700Bold" },
  statPillLabel: { fontSize: 9, fontFamily: "Inter_600SemiBold" },
  // Search
  searchRow: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  // Hostel chips
  hostelChips: { paddingHorizontal: 12, paddingVertical: 7, gap: 6 },
  hostelChip: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: 16, borderWidth: 1 },
  hostelChipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  // Results bar
  resultBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 14, paddingVertical: 5, borderBottomWidth: 1,
  },
  resultText: { fontSize: 12, fontFamily: "Inter_500Medium" },
  viewHostelBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 9, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
  },
  viewHostelBtnText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  // Table
  tableHead: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 7, borderBottomWidth: 1.5,
  },
  th: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.7, textTransform: "uppercase" },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, gap: 8 },
  avatarCircle: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  name: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  roll: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  hostelTag: { fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 1 },
  cell: { fontSize: 12, fontFamily: "Inter_500Medium", textAlign: "center" },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8, borderWidth: 1,
  },
  statusDot: { width: 5, height: 5, borderRadius: 3 },
  statusText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  timeText: { fontSize: 9, fontFamily: "Inter_400Regular" },
  emptyState: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySub: { fontSize: 13, fontFamily: "Inter_400Regular" },
});

const sd = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#00000080", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 0, maxHeight: "92%" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 16 },
  profileRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingBottom: 16, borderBottomWidth: 1 },
  avatar: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 20, fontFamily: "Inter_700Bold" },
  name: { fontSize: 16, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  statusBar: {
    flexDirection: "row", alignItems: "center", flexWrap: "wrap",
    gap: 8, padding: 10, borderRadius: 12, borderWidth: 1, marginTop: 12,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  statusTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  card: { borderRadius: 14, borderWidth: 1, padding: 12, marginTop: 10 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold" },
  row: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
  rowLabel: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1 },
  rowValue: { fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  invChip: { alignItems: "center", paddingVertical: 10, paddingHorizontal: 6, borderRadius: 12, borderWidth: 1, gap: 4, width: "100%" },
  invLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  invStatus: { fontSize: 10, fontFamily: "Inter_500Medium" },
  revokeItemBtn: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: "#ef444440", backgroundColor: "#fef2f2" },
  revokeItemBtnText: { fontSize: 9, fontFamily: "Inter_700Bold", color: "#ef4444" },
  histRow: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, padding: 8 },
  histDate: { fontSize: 12, fontFamily: "Inter_700Bold" },
  histTime: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  histBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  actionBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, paddingVertical: 13, borderRadius: 12, borderWidth: 1,
  },
  actionBtnText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  closeBtn: { borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  closeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});
