import React, { useState, useMemo, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, StyleSheet, Pressable, TextInput, ScrollView,
  Platform, useColorScheme, useWindowDimensions, Modal, Linking, Alert, Share,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import Colors from "@/constants/colors";
import { useApiRequest, useAuth } from "@/context/AuthContext";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { useDebounce } from "@/hooks/useDebounce";
import * as Haptics from "expo-haptics";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

// ─── Status helpers ────────────────────────────────────────────────────────────
function hasAnyGiven(inv: any) { return !!(inv?.mattress || inv?.bedsheet || inv?.pillow); }
function hasPendingGiven(inv: any) {
  return !!(
    (inv?.mattress && !inv?.mattressSubmitted) ||
    (inv?.bedsheet && !inv?.bedsheetSubmitted) ||
    (inv?.pillow && !inv?.pillowSubmitted)
  );
}
function statusOf(student: any): "green" | "yellow" | "gray" | "red" {
  const inv = student?.inventory || {};
  const isLocked = !!inv.inventoryLocked;
  const anyGiven = hasAnyGiven(inv);
  const pending = hasPendingGiven(inv);
  const isCheckedIn = !!(student?.checkInTime);
  const isCheckedOut = !!(student?.checkOutTime);
  // If never checked in and no items actually given → always gray (no false greens)
  if (!isCheckedIn && !anyGiven) return "gray";
  if (isLocked || (anyGiven && !pending)) return "green";   // ✅ Submitted/Done
  if (isCheckedOut && pending) return "red";                  // 🔴 Checked out, didn't return
  if (pending) return "yellow";                               // 🟡 Pending return
  return "gray";                                              // ⚪ Not taken
}

const STATUS_META = {
  green:  { label: "Submitted",     color: "#22c55e", bg: "#22c55e18", border: "#22c55e35", icon: "check-circle" as const },
  yellow: { label: "Pending",       color: "#eab308", bg: "#fef3c7",   border: "#eab30840", icon: "clock"        as const },
  red:    { label: "Not Returned",  color: "#ef4444", bg: "#fef2f2",   border: "#ef444435", icon: "alert-circle" as const },
  gray:   { label: "Not Taken",     color: "#64748b", bg: "#f1f5f9",   border: "#cbd5e140", icon: "circle"       as const },
};

// ─── Student Detail Modal ──────────────────────────────────────────────────────
function InventoryStudentModal({ student, visible, onClose, theme, canRevoke, onRevokeItem, onRevokeAll, onRevokeCheckin, busy }: {
  student: any; visible: boolean; onClose: () => void; theme: any;
  canRevoke: boolean;
  onRevokeItem: (item: "mattress" | "bedsheet" | "pillow") => void;
  onRevokeAll: () => void;
  onRevokeCheckin: () => void;
  busy: boolean;
}) {
  if (!student) return null;
  const inv = student.inventory || {};
  const isLocked = !!inv.inventoryLocked;
  const rawStatus = statusOf(student);
  const meta = STATUS_META[rawStatus];
  const phone = student.mobileNumber || student.contactNumber || student.phone || "";
  const email = student.email || "";
  const emergency = student.emergencyContact || "";
  const hostelName = student.hostelName || student.hostelId || "";
  const roomNumber = student.roomNumber || "";

  const inventoryItems = [
    { key: "mattress",  label: "Mattress"  },
    { key: "bedsheet",  label: "Bedsheet"  },
    { key: "pillow",    label: "Pillow"    },
  ] as const;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={imd.overlay} onPress={onClose}>
        <Pressable style={[imd.sheet, { backgroundColor: theme.surface }]} onPress={e => e.stopPropagation()}>
          <View style={imd.handle} />
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {/* Header */}
            <View style={imd.sheetHeader}>
              <View style={[imd.avatar, { backgroundColor: theme.tint + "20" }]}>
                <Text style={[imd.avatarText, { color: theme.tint }]}>
                  {(student.name || "?")[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[imd.name, { color: theme.text }]}>{student.name}</Text>
                <Text style={[imd.meta, { color: theme.textSecondary }]}>
                  {student.rollNumber || student.email}
                </Text>
              </View>
              <Pressable onPress={onClose} style={imd.closeX} hitSlop={8}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            {/* Location chips */}
            <View style={imd.locationChips}>
              {!!hostelName && (
                <View style={[imd.hostelChip, { backgroundColor: theme.tint + "15", borderColor: theme.tint + "40" }]}>
                  <Feather name="home" size={13} color={theme.tint} />
                  <Text style={[imd.hostelChipText, { color: theme.tint }]}>{hostelName}</Text>
                </View>
              )}
              {!!roomNumber && (
                <View style={[imd.hostelChip, { backgroundColor: "#8b5cf615", borderColor: "#8b5cf640" }]}>
                  <Feather name="layers" size={13} color="#8b5cf6" />
                  <Text style={[imd.hostelChipText, { color: "#8b5cf6" }]}>Room {roomNumber}</Text>
                </View>
              )}
            </View>

            {/* Overall Status badge */}
            <View style={[imd.statusBadge, { backgroundColor: meta.bg, borderColor: meta.border }]}>
              <Feather name={meta.icon} size={14} color={meta.color} />
              <Text style={[imd.statusLabel, { color: meta.color }]}>{meta.label}</Text>
            </View>

            {/* ── Per-item inventory boxes ── */}
            <Text style={[imd.sectionTitle, { color: theme.text }]}>Items</Text>
            <View style={imd.itemRow}>
              {inventoryItems.map(({ key, label }) => {
                const given = !!inv[key];
                const submitted = !!inv[`${key}Submitted`] || (isLocked && given);
                const isMissing = rawStatus === "red" && given && !submitted;

                // Colors per user request:
                // given + submitted → GREEN
                // given + pending → YELLOW
                // given + checked-out without submitting → RED
                // not given (not taken) → GRAY circle
                let itemStatus: "green" | "yellow" | "red" | "gray";
                if (!given) itemStatus = "gray";
                else if (submitted) itemStatus = "green";
                else if (isMissing) itemStatus = "red";
                else itemStatus = "yellow";

                const m = STATUS_META[itemStatus];
                const showRevokeChip = canRevoke && (given || submitted);
                return (
                  <View key={key} style={[imd.inventoryItem, { backgroundColor: m.bg, borderColor: m.border }]}>
                    {showRevokeChip && (
                      <Pressable
                        disabled={busy}
                        onPress={() => onRevokeItem(key)}
                        style={({ pressed }) => [imd.itemRevokeChip, { opacity: pressed || busy ? 0.55 : 1 }]}
                        hitSlop={10}
                      >
                        <Feather name="x" size={11} color="#fff" />
                      </Pressable>
                    )}
                    <Feather name={m.icon} size={22} color={m.color} />
                    <Text style={[imd.inventoryLabel, { color: theme.text }]}>{label}</Text>
                    <Text style={[imd.inventoryStatus, { color: m.color }]}>{m.label}</Text>
                  </View>
                );
              })}
            </View>

            {/* Revoke / Reset card — visible to volunteer / admin / superadmin */}
            {canRevoke && (!!student.checkInTime || isLocked || hasAnyGiven(inv)) && (
              <View style={[imd.revokeCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <View style={imd.revokeHeader}>
                  <View style={imd.revokeIconCircle}>
                    <Feather name="rotate-ccw" size={14} color="#ef4444" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[imd.revokeCardTitle, { color: theme.text }]}>Revoke Actions</Text>
                    <Text style={[imd.revokeCardHint, { color: theme.textSecondary }]}>
                      Undo a check-in/check-out or unlock inventory.
                    </Text>
                  </View>
                  {busy && <ActivityIndicator size="small" color="#ef4444" />}
                </View>

                <View style={imd.revokeBtnGroup}>
                  {!!student.checkInTime && (
                    <Pressable
                      disabled={busy}
                      onPress={onRevokeCheckin}
                      style={({ pressed }) => [imd.revokeBtnRow, {
                        backgroundColor: pressed && !busy ? "#fee2e2" : "#fef2f2",
                        borderColor: "#ef444433",
                        opacity: busy ? 0.6 : 1,
                      }]}
                    >
                      <View style={[imd.revokeBtnIcon, { backgroundColor: "#ef444418" }]}>
                        <Feather name="log-out" size={15} color="#ef4444" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={imd.revokeBtnTitle}>Revoke Check-in / Check-out</Text>
                        <Text style={[imd.revokeBtnSub, { color: theme.textSecondary }]}>
                          Clears today&apos;s entry & resets inventory
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={16} color="#ef4444" />
                    </Pressable>
                  )}
                  {(isLocked || hasAnyGiven(inv)) && (
                    <Pressable
                      disabled={busy}
                      onPress={onRevokeAll}
                      style={({ pressed }) => [imd.revokeBtnRow, {
                        backgroundColor: pressed && !busy ? "#fff7ed" : "#fffbeb",
                        borderColor: "#f59e0b33",
                        opacity: busy ? 0.6 : 1,
                      }]}
                    >
                      <View style={[imd.revokeBtnIcon, { backgroundColor: "#f59e0b18" }]}>
                        <Feather name="unlock" size={15} color="#f59e0b" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[imd.revokeBtnTitle, { color: "#92400e" }]}>Unlock & Reset Inventory</Text>
                        <Text style={[imd.revokeBtnSub, { color: theme.textSecondary }]}>
                          Clears all submissions for this student
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={16} color="#f59e0b" />
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            {/* Check-in/out — always shown */}
            <Text style={[imd.sectionTitle, { color: theme.text }]}>Attendance Today</Text>
            <View style={[imd.infoCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
              <InfoRow
                icon="log-in"
                label="Check-in"
                value={student.checkInTime
                  ? new Date(student.checkInTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })
                  : "Not checked in"}
                theme={theme}
                color={student.checkInTime ? "#22c55e" : undefined}
              />
              <InfoRow
                icon="log-out"
                label="Check-out"
                value={student.checkOutTime
                  ? new Date(student.checkOutTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })
                  : student.checkInTime ? "Still inside" : "—"}
                theme={theme}
                color={student.checkOutTime ? "#6366f1" : undefined}
              />
            </View>

            {/* Contact info */}
            <View style={[imd.infoCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
              {!!email && <InfoRow icon="mail" label="Email" value={email} theme={theme} />}
              {!!student.gender && <InfoRow icon="user" label="Gender" value={student.gender} theme={theme} />}
              {!!student.age && <InfoRow icon="calendar" label="Age" value={String(student.age)} theme={theme} />}
              {!!(student.allottedMess || student.assignedMess) && <InfoRow icon="coffee" label="Mess" value={student.allottedMess || student.assignedMess} theme={theme} />}
              {!!emergency && <InfoRow icon="alert-circle" label="Emergency" value={emergency} theme={theme} />}
            </View>

            {!!phone && (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL(`tel:${phone}`).catch(() => {}); }}
                style={imd.callBtn}
              >
                <Feather name="phone-call" size={16} color="#fff" />
                <Text style={imd.callBtnText}>Call Student</Text>
              </Pressable>
            )}
            <Pressable onPress={onClose} style={[imd.closeBtn, { borderColor: theme.border }]}>
              <Text style={[imd.closeBtnText, { color: theme.textSecondary }]}>Close</Text>
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function InfoRow({ icon, label, value, theme, color }: { icon: any; label: string; value: string; theme: any; color?: string }) {
  return (
    <View style={imd.infoRow}>
      <Feather name={icon} size={13} color={color || theme.textTertiary} />
      <Text style={[imd.infoLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[imd.infoVal, { color: color || theme.text }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function InventoryTableScreen({ showBack = true }: { showBack?: boolean }) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === "web";
  const isCompact = !isWeb && width < 430;
  const topPad = Platform.OS === "web" ? 24 : Math.max(insets.top + 20, 100);
  const request = useApiRequest();
  const { isVolunteer, isSuperAdmin, user } = useAuth();
  const qc = useQueryClient();
  const [exporting, setExporting] = useState(false);
  const [revoking, setRevoking] = useState(false);

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ["inventory-simple"] });
      qc.invalidateQueries({ queryKey: ["my-status"] });
    }, [qc])
  );

  const [filter, setFilter] = useState<"all" | "pending" | "submitted" | "not_taken" | "red">("all");
  const [inputValue, setInputValue] = useState("");
  const [committedSearch, setCommittedSearch] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const debouncedSearch = useDebounce(committedSearch, 150);
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);

  const requiresShift = user?.role === "volunteer" || user?.role === "admin" || user?.role === "coordinator";
  const { data: myStatus, refetch: refetchStatus } = useQuery<{ isActive: boolean; lastActiveAt: string | null }>({
    queryKey: ["my-status"],
    queryFn: async () => { try { return await request("/staff/me-status"); } catch { return { isActive: false, lastActiveAt: null }; } },
    enabled: requiresShift,
    refetchInterval: 15000,
    staleTime: 8000,
  });
  const canWork = !requiresShift || !!myStatus?.isActive;

  const { data = [], isLoading, dataUpdatedAt, refetch, isRefetching } = useQuery({
    queryKey: ["inventory-simple"],
    queryFn: async () => { try { return await request("/inventory-simple") || []; } catch { return []; } },
    enabled: canWork,
    staleTime: 20000,
    gcTime: 10 * 60 * 1000,
    refetchOnMount: true,
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  const [liveNow, setLiveNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setLiveNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const items = useMemo(() => {
    const source = ((data as any[]) || []).filter(Boolean);
    const map = new Map<string, any>();
    for (const student of source) {
      const roll = String(student.rollNumber || "").trim().toLowerCase();
      const email = String(student.email || "").trim().toLowerCase();
      const key = roll || email || String(student.id || Math.random());
      if (!map.has(key)) map.set(key, student);
    }
    return Array.from(map.values());
  }, [data]);

  // Pre-compute status once per item — avoids 6× redundant calls across memos
  const statusMap = useMemo(() => {
    const m = new Map<string, "green" | "yellow" | "gray" | "red">();
    for (const s of items) {
      const k = String(s?.id ?? s?.rollNumber ?? s?.email ?? "");
      if (k) m.set(k, statusOf(s));
    }
    return m;
  }, [items]);
  const stOf = (s: any) => {
    const k = String(s?.id ?? s?.rollNumber ?? s?.email ?? "");
    return statusMap.get(k) ?? statusOf(s);
  };

  const greenCount  = useMemo(() => items.filter(s => stOf(s) === "green").length,  [statusMap]);
  const yellowCount = useMemo(() => items.filter(s => stOf(s) === "yellow").length, [statusMap]);
  const redCount    = useMemo(() => items.filter(s => stOf(s) === "red").length,    [statusMap]);
  const grayCount   = useMemo(() => items.filter(s => stOf(s) === "gray").length,   [statusMap]);

  const filteredItems = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    return items.filter(s => {
      if (q) {
        const hay = [s.name, s.rollNumber, s.roomNumber, s.hostelId, s.hostelName, s.email]
          .filter(Boolean).join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      const st = stOf(s);
      if (filter === "submitted")  return st === "green";
      if (filter === "pending")    return st === "yellow";
      if (filter === "red")        return st === "red";
      if (filter === "not_taken")  return st === "gray";
      return true;
    });
  }, [items, debouncedSearch, filter, statusMap]);

  const sortedItems = useMemo(() => {
    const priority = { red: 0, yellow: 1, gray: 2, green: 3 } as const;
    return [...filteredItems].sort((a, b) => {
      const pa = priority[stOf(a)], pb = priority[stOf(b)];
      if (pa !== pb) return pa - pb;
      return String(a?.name || "").localeCompare(String(b?.name || ""));
    });
  }, [filteredItems, statusMap]);

  const lastSyncAgoSec = Math.max(0, Math.floor((liveNow - dataUpdatedAt) / 1000));

  const handleSearch = useCallback(() => {
    const q = inputValue.trim();
    setCommittedSearch(q);
    setHasSearched(true);
  }, [inputValue]);

  const goActive = async () => {
    setActivating(true);
    try {
      await request("/staff/go-active", { method: "POST", body: JSON.stringify({}) });
      await refetchStatus();
    } catch {}
    setActivating(false);
  };

  const goInactive = async () => {
    setDeactivating(true);
    try {
      await request("/staff/go-inactive", { method: "POST", body: JSON.stringify({}) });
      await refetchStatus();
    } catch {}
    setDeactivating(false);
  };

  const exportCSV = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const headers = ["Name","Roll Number","Room","Hostel","Status","Mattress","Bedsheet","Pillow","Check-in","Check-out"];
      const rows = sortedItems.map((s: any) => {
        const inv = s.inventory || {};
        const st = statusOf(s);
        return [
          `"${(s.name || "").replace(/"/g, '""')}"`,
          s.rollNumber || "",
          s.roomNumber || "",
          s.hostelName || s.hostelId || "",
          STATUS_META[st].label,
          inv.mattress ? (inv.mattressSubmitted ? "Submitted" : "Given") : "Not Taken",
          inv.bedsheet ? (inv.bedsheetSubmitted ? "Submitted" : "Given") : "Not Taken",
          inv.pillow   ? (inv.pillowSubmitted   ? "Submitted" : "Given") : "Not Taken",
          s.checkInTime  ? new Date(s.checkInTime).toLocaleString("en-IN",  { timeZone: "Asia/Kolkata" }) : "",
          s.checkOutTime ? new Date(s.checkOutTime).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) : "",
        ].join(",");
      });
      const csv = [headers.join(","), ...rows].join("\n");
      if (Platform.OS === "web") {
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = "inventory_report.csv"; a.click();
        URL.revokeObjectURL(url);
      } else {
        const filename = `inventory_${new Date().toISOString().slice(0,10)}.csv`;
        const path = (FileSystem.cacheDirectory || "") + filename;
        await FileSystem.writeAsStringAsync(path, csv, { encoding: FileSystem.EncodingType.UTF8 });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(path, { mimeType: "text/csv", dialogTitle: "Export Inventory CSV", UTI: "public.comma-separated-values-text" });
        } else {
          await Share.share({ message: csv, title: "Inventory Report" });
        }
      }
    } catch (e: any) {
      if (e?.message !== "The user did not share")
        Alert.alert("Export failed", e?.message || "Unknown error");
    }
    setExporting(false);
  }, [exporting, sortedItems]);

  const FILTERS = [
    { key: "all",       label: "All",           value: items.length,  color: theme.tint   },
    { key: "red",       label: "Not Returned",  value: redCount,      color: "#ef4444"    },
    { key: "pending",   label: "Pending",        value: yellowCount,   color: "#eab308"    },
    { key: "submitted", label: "Submitted",      value: greenCount,    color: "#22c55e"    },
    { key: "not_taken", label: "Not Taken",      value: grayCount,     color: "#64748b"    },
  ] as const;

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      {/* ── Header ── */}
      <View style={[styles.header, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>

        {/* Title row */}
        <View style={styles.headerTop}>
          {showBack && (
            <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={8}>
              <Feather name="arrow-left" size={22} color={theme.text} />
            </Pressable>
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>Inventory</Text>
            <View style={styles.liveRow}>
              <View style={styles.liveDot} />
              <Text style={[styles.liveText, { color: theme.textSecondary }]} numberOfLines={1}>
                Live · synced {lastSyncAgoSec}s ago
              </Text>
            </View>
          </View>
        </View>

        {/* Search row — always visible */}
        <View style={styles.searchRow}>
          <View style={[styles.searchBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Feather name="search" size={15} color={theme.textSecondary} />
            <TextInput
              style={[styles.searchInput, { color: theme.text }]}
              placeholder="Search by name, roll, room…"
              placeholderTextColor={theme.textTertiary}
              value={inputValue}
              onChangeText={setInputValue}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
              autoCapitalize="none"
            />
            {inputValue.length > 0 && (
              <Pressable onPress={() => { setInputValue(""); setCommittedSearch(""); setHasSearched(false); }} hitSlop={8}>
                <Feather name="x" size={14} color={theme.textSecondary} />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={handleSearch}
            style={[styles.searchBtn, { backgroundColor: theme.tint }]}
          >
            <Text style={styles.searchBtnText}>Search</Text>
          </Pressable>
        </View>


        {/* Filter pills + count — only after search */}
        {hasSearched && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
              {FILTERS.map(f => {
                const active = filter === f.key;
                return (
                  <Pressable
                    key={f.key}
                    onPress={() => { Haptics.selectionAsync(); setFilter(f.key); }}
                    style={[styles.filterPill, {
                      backgroundColor: active ? f.color + "18" : theme.background,
                      borderColor: active ? f.color : theme.border,
                    }]}
                  >
                    <View style={[styles.filterDot, { backgroundColor: f.color, opacity: active ? 1 : 0.45 }]} />
                    <Text style={[styles.filterPillLabel, { color: active ? f.color : theme.textSecondary }]}>
                      {f.label}
                    </Text>
                    <View style={[styles.filterBadge, { backgroundColor: active ? f.color + "22" : theme.border }]}>
                      <Text style={[styles.filterBadgeText, { color: active ? f.color : theme.textTertiary }]}>
                        {f.value}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
            <View style={styles.resultCountRow}>
              <View style={[styles.countBadge, { backgroundColor: theme.tint + "15", borderColor: theme.tint + "30" }]}>
                <Text style={[styles.countBadgeText, { color: theme.tint }]}>{sortedItems.length} found</Text>
              </View>
              <Pressable
                onPress={exportCSV}
                disabled={exporting}
                style={[styles.exportIconBtn, { backgroundColor: "#22c55e12", borderColor: "#22c55e30" }]}
                hitSlop={8}
              >
                {exporting
                  ? <ActivityIndicator size="small" color="#22c55e" />
                  : <Feather name="share" size={15} color="#22c55e" />}
              </Pressable>
            </View>
          </>
        )}

      </View>

      {/* ── Pre-search placeholder ── */}
      {!hasSearched && (
        <View style={styles.preSearchPlaceholder}>
          <Feather name="search" size={48} color={theme.textTertiary} />
          <Text style={[styles.preSearchTitle, { color: theme.text }]}>Search for Students</Text>
          <Text style={[styles.preSearchSub, { color: theme.textSecondary }]}>
            Type a name, roll number, or room number above and tap Search to view inventory.
          </Text>
        </View>
      )}

      {/* ── Table header ── */}
      {hasSearched && (
        <View style={[styles.tableHead, { backgroundColor: theme.surface, borderBottomColor: theme.border }]}>
          <Text style={[styles.thName, { color: theme.textSecondary }]}>STUDENT</Text>
          <Text style={[styles.thStatus, { color: theme.textSecondary }]}>STATUS</Text>
          <View style={styles.thItems}>
            {["M", "B", "P"].map(h => (
              <Text key={h} style={[styles.thItem, { color: theme.textSecondary }]}>{h}</Text>
            ))}
          </View>
        </View>
      )}

      {hasSearched && isLoading && items.length === 0 && (
        <View style={{ padding: 20 }}><CardSkeleton /><CardSkeleton /><CardSkeleton /></View>
      )}

      {hasSearched && !(isLoading && items.length === 0) && (
        <FlatList
          data={sortedItems}
          keyExtractor={(i, idx) => {
            const id = String(i?.id || "").trim();
            const roll = String(i?.rollNumber || "").trim().toLowerCase();
            return id || roll || String(idx);
          }}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 80 : 90 }}
          refreshing={isRefetching}
          onRefresh={() => { refetch(); }}
          removeClippedSubviews
          windowSize={11}
          initialNumToRender={20}
          maxToRenderPerBatch={30}
          updateCellsBatchingPeriod={40}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Feather name="package" size={40} color={theme.textTertiary} />
              <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
                {filter !== "all" ? "No students in this category" : "No students found"}
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const inv = item.inventory || {};
            const rowStatus = stOf(item);
            const m = STATUS_META[rowStatus];
            const isLocked = rowStatus === "green";

            return (
              <Pressable
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelectedStudent(item); }}
                style={({ pressed }) => [styles.tableRow, {
                  backgroundColor: pressed ? theme.surface : (isLocked ? "#22c55e06" : theme.background),
                  borderColor: theme.border,
                  borderLeftColor: m.color,
                }]}
              >
                {/* Name column */}
                <View style={styles.nameCol}>
                  <Text style={[styles.studentName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 1 }}>
                    {!!(item.hostelName || item.hostelId) && (
                      <Text style={{ fontSize: 11, fontFamily: "Inter_700Bold", color: theme.tint }} numberOfLines={1}>
                        {item.hostelName || item.hostelId}
                      </Text>
                    )}
                    {!!item.roomNumber && (
                      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#8b5cf6" }} numberOfLines={1}>
                        {!!(item.hostelName || item.hostelId) ? "· Rm" : "Rm"} {item.roomNumber}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.studentMeta, { color: theme.textSecondary }]} numberOfLines={1}>
                    {item.rollNumber || item.email || ""}
                  </Text>
                  {rowStatus === "red" && (
                    <Text style={{ fontSize: 10, fontFamily: "Inter_700Bold", color: "#ef4444", marginTop: 1 }}>
                      ⚠ Checked out — items not returned
                    </Text>
                  )}
                </View>

                {/* Status column */}
                <View style={styles.statusCol}>
                  <View style={[styles.statusPill, { backgroundColor: m.bg, borderColor: m.border }]}>
                    <Feather name={m.icon} size={10} color={m.color} />
                    <Text style={[styles.statusPillText, { color: m.color }]}>{m.label}</Text>
                  </View>
                </View>

                {/* Per-item indicators: M B P */}
                <View style={styles.toggleRow}>
                  {(["mattress", "bedsheet", "pillow"] as const).map(field => {
                    const given = !!inv[field];
                    const submitted = !!inv[`${field}Submitted`] || (isLocked && given);
                    const isMissing = rowStatus === "red" && given && !submitted;

                    // Color per user request:
                    // submitted → GREEN check-circle
                    // given but pending → YELLOW clock
                    // given + checked-out without return → RED alert
                    // not taken → GRAY circle (hollow)
                    let itemStatus: "green" | "yellow" | "red" | "gray";
                    if (!given) itemStatus = "gray";
                    else if (submitted) itemStatus = "green";
                    else if (isMissing) itemStatus = "red";
                    else itemStatus = "yellow";

                    const im = STATUS_META[itemStatus];
                    return (
                      <View
                        key={field}
                        style={[styles.toggleBtn, { backgroundColor: im.bg, borderColor: im.border }]}
                      >
                        <Feather name={im.icon} size={14} color={im.color} />
                      </View>
                    );
                  })}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {/* Student Detail Modal */}
      <InventoryStudentModal
        student={selectedStudent}
        visible={!!selectedStudent}
        onClose={() => setSelectedStudent(null)}
        theme={theme}
        canRevoke={user?.role === "volunteer" || user?.role === "admin" || user?.role === "coordinator" || user?.role === "superadmin"}
        busy={revoking}
        onRevokeItem={async (item) => {
          if (!selectedStudent) return;
          const confirmMsg = `Revoke "${item}" submission for ${selectedStudent.name}? This will mark the item as not given.`;
          const ok = Platform.OS === "web" ? globalThis.confirm(confirmMsg) : await new Promise<boolean>((r) => Alert.alert("Revoke item", confirmMsg, [{ text: "Cancel", style: "cancel", onPress: () => r(false) }, { text: "Revoke", style: "destructive", onPress: () => r(true) }]));
          if (!ok) return;
          setRevoking(true);
          try {
            await request(`/attendance/inventory/${selectedStudent.id}/revoke-item`, { method: "POST", body: JSON.stringify({ item }) });
            await refetch();
            setSelectedStudent((prev: any) => prev ? { ...prev, inventory: { ...(prev.inventory || {}), [item]: false, [`${item}Submitted`]: false, inventoryLocked: false } } : prev);
          } catch (e: any) { Alert.alert("Revoke failed", e?.message || "Try again"); }
          setRevoking(false);
        }}
        onRevokeAll={async () => {
          if (!selectedStudent) return;
          const confirmMsg = `Unlock and reset ALL inventory for ${selectedStudent.name}? This will clear all submissions.`;
          const ok = Platform.OS === "web" ? globalThis.confirm(confirmMsg) : await new Promise<boolean>((r) => Alert.alert("Unlock inventory", confirmMsg, [{ text: "Cancel", style: "cancel", onPress: () => r(false) }, { text: "Unlock", style: "destructive", onPress: () => r(true) }]));
          if (!ok) return;
          setRevoking(true);
          try {
            await request(`/attendance/inventory/${selectedStudent.id}/revoke`, { method: "POST", body: JSON.stringify({}) });
            await refetch();
            setSelectedStudent((prev: any) => prev ? { ...prev, inventory: { mattress: false, bedsheet: false, pillow: false, mattressSubmitted: false, bedsheetSubmitted: false, pillowSubmitted: false, inventoryLocked: false } } : prev);
          } catch (e: any) { Alert.alert("Unlock failed", e?.message || "Try again"); }
          setRevoking(false);
        }}
        onRevokeCheckin={async () => {
          if (!selectedStudent) return;
          const confirmMsg = `Revoke today's check-in/check-out for ${selectedStudent.name}? Inventory will also be reset.`;
          const ok = Platform.OS === "web" ? globalThis.confirm(confirmMsg) : await new Promise<boolean>((r) => Alert.alert("Revoke check-in", confirmMsg, [{ text: "Cancel", style: "cancel", onPress: () => r(false) }, { text: "Revoke", style: "destructive", onPress: () => r(true) }]));
          if (!ok) return;
          setRevoking(true);
          try {
            await request(`/checkins/${selectedStudent.id}/today`, { method: "DELETE" });
            await refetch();
            setSelectedStudent(null);
          } catch (e: any) { Alert.alert("Revoke failed", e?.message || "Try again"); }
          setRevoking(false);
        }}
      />

      {/* Shift lock overlay */}
      {!canWork && (
        <View style={styles.lockOverlay}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.88)" }]} />
          <View style={[styles.lockCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
            <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.tint + "15", alignItems: "center", justifyContent: "center" }}>
              <Feather name="lock" size={20} color={theme.tint} />
            </View>
            <Text style={[styles.lockTitle, { color: theme.text }]}>Shift Inactive</Text>
            <Text style={[styles.lockSub, { color: theme.textSecondary }]}>
              Go to the Home tab to start your shift, then come back here.
            </Text>
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 16, paddingHorizontal: 16, paddingBottom: 14, gap: 12, borderBottomWidth: 1 },
  headerTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center", marginLeft: -4 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  liveText: { fontSize: 11, fontFamily: "Inter_500Medium" },
  exportIconBtn: {
    width: 36, height: 36, borderRadius: 10, borderWidth: 1,
    alignItems: "center", justifyContent: "center",
  },
  filterRow: { gap: 8, paddingVertical: 2 },
  filterPill: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingVertical: 7, paddingLeft: 10, paddingRight: 6,
    borderRadius: 20, borderWidth: 1.5,
  },
  filterDot: { width: 7, height: 7, borderRadius: 4 },
  filterPillLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterBadge: { borderRadius: 10, paddingHorizontal: 7, paddingVertical: 2, minWidth: 24, alignItems: "center" },
  filterBadgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  shiftBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 10, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8, marginTop: 4 },
  shiftDot: { width: 8, height: 8, borderRadius: 4 },
  shiftText: { flex: 1, fontSize: 12, fontFamily: "Inter_700Bold" },
  shiftBtnInline: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  shiftBtnInlineText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  searchBox: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  searchBtn: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 11, alignItems: "center", justifyContent: "center" },
  searchBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_600SemiBold" },
  resultCountRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 },
  countBadge: { flex: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  countBadgeText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  preSearchPlaceholder: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  preSearchTitle: { fontSize: 18, fontFamily: "Inter_700Bold", textAlign: "center" },
  preSearchSub: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 22 },
  tableHead: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1,
  },
  thName: { flex: 1, fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase" },
  thStatus: { width: 78, textAlign: "center", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase" },
  thItems: { flexDirection: "row", gap: 6 },
  thItem: { width: 34, textAlign: "center", fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.8, textTransform: "uppercase" },
  tableRow: {
    flexDirection: "row", alignItems: "center",
    marginHorizontal: 10, marginTop: 7, borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 10, paddingVertical: 10, borderLeftWidth: 3,
  },
  nameCol: { flex: 1, marginRight: 6 },
  studentName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  studentMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusCol: { width: 78, alignItems: "center" },
  statusPill: {
    flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 5, paddingVertical: 4, borderRadius: 7, borderWidth: 1,
  },
  statusPillText: { fontSize: 9, fontFamily: "Inter_700Bold" },
  toggleRow: { flexDirection: "row", gap: 5 },
  toggleBtn: { width: 34, height: 30, borderRadius: 8, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  lockOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 20 },
  lockCard: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: "center", gap: 10, width: "100%", maxWidth: 340 },
  lockTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  lockSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  lockBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  lockBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
});

// ─── Inventory Student Modal Styles ───────────────────────────────────────────
const imd = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 0, maxHeight: "92%" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 14 },
  sheetHeader: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  locationChips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  hostelChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  hostelChipText: { fontSize: 13, fontFamily: "Inter_700Bold" },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 20, fontFamily: "Inter_700Bold" },
  name: { fontSize: 15, fontFamily: "Inter_700Bold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  closeX: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  statusBadge: {
    flexDirection: "row", alignItems: "center", gap: 7, borderWidth: 1, borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 8, alignSelf: "flex-start", marginBottom: 16,
  },
  statusLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  sectionTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 10 },
  itemRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  inventoryItem: { flex: 1, borderRadius: 12, borderWidth: 1, paddingVertical: 14, alignItems: "center", gap: 5, position: "relative", overflow: "visible" },
  inventoryLabel: { fontSize: 12, fontFamily: "Inter_700Bold" },
  inventoryStatus: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  itemRevokeChip: {
    position: "absolute", top: -6, right: -6,
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: "#ef4444",
    alignItems: "center", justifyContent: "center",
    shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.18, shadowRadius: 2,
    elevation: 2, zIndex: 5,
    borderWidth: 1.5, borderColor: "#fff",
  },
  revokeCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 14 },
  revokeHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  revokeIconCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#ef444430", alignItems: "center", justifyContent: "center" },
  revokeCardTitle: { fontSize: 14, fontFamily: "Inter_700Bold" },
  revokeCardHint: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  revokeBtnGroup: { gap: 8 },
  revokeBtnRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 11, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  revokeBtnIcon: { width: 32, height: 32, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  revokeBtnTitle: { fontSize: 13, fontFamily: "Inter_700Bold", color: "#991b1b" },
  revokeBtnSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1, lineHeight: 14 },
  infoCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  infoLabel: { fontSize: 12, fontFamily: "Inter_400Regular", width: 72 },
  infoVal: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  callBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 13, marginBottom: 8 },
  callBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
  closeBtn: { borderWidth: 1, borderRadius: 14, paddingVertical: 11, alignItems: "center", marginBottom: 8 },
  closeBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
});
