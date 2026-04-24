import React, { useMemo, useState, useCallback } from "react";
import {
  View, Text, FlatList, Pressable, StyleSheet, TextInput,
  Modal, ActivityIndicator, useColorScheme, ScrollView, Platform, Linking,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { useFocusEffect } from "expo-router";
import { useIsFocused } from "@react-navigation/native";
import { Feather } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useApiRequest, useAuth } from "@/context/AuthContext";
import * as Haptics from "expo-haptics";

function fmt(ts?: string | null) {
  if (!ts) return "";
  return new Date(ts).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit",
    hour12: true,
  });
}

function toDialableNumber(raw?: string | null): string {
  if (!raw) return "";
  return String(raw).replaceAll(/[^0-9+]/g, "");
}

async function callStudent(raw?: string | null) {
  const phone = toDialableNumber(raw);
  if (!phone) return;
  const url = `tel:${phone}`;
  const can = await Linking.canOpenURL(url);
  if (can) {
    await Linking.openURL(url);
  }
}

// ─── Enhanced Student Detail Sheet ────────────────────────────────────────────
function StudentDetailSheet({ selected, selectedDetails, visible, onClose, onConfirm, isPending, theme, isDark }: {
  selected: any; selectedDetails: any; visible: boolean; onClose: () => void;
  onConfirm: () => void; isPending: boolean; theme: any; isDark: boolean;
}) {
  if (!selected) return null;
  const d = selectedDetails || selected;
  const hasPass = !!selected.messCard;
  const hostel = d.hostelName || d.allottedHostel || d.hostelId || "";
  const mess = d.allottedMess || d.assignedMess || d.messName || "Not Assigned";
  const contact = d.contactNumber || d.phone || "";

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={sd.overlay} onPress={onClose}>
        <Pressable style={[sd.sheet, { backgroundColor: theme.surface }]} onPress={e => e.stopPropagation()}>
          <View style={sd.handle} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 8 }}>
            {/* Header */}
            <View style={sd.headerRow}>
              <View style={[sd.avatar, { backgroundColor: theme.tint + "20" }]}>
                <Text style={[sd.avatarText, { color: theme.tint }]}>
                  {(selected.name || "?")[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[sd.name, { color: theme.text }]}>{selected.name}</Text>
                <Text style={[sd.roll, { color: theme.textSecondary }]}>
                  {d.email || selected.email || "—"}
                </Text>
                {!!hostel && (
                  <Text style={[sd.hostel, { color: theme.textTertiary }]}>
                    <Feather name="home" size={11} /> {hostel}
                  </Text>
                )}
              </View>
              <Pressable onPress={onClose} hitSlop={8} style={sd.closeX}>
                <Feather name="x" size={20} color={theme.textSecondary} />
              </Pressable>
            </View>

            <View style={[sd.messHero, { backgroundColor: "#f59e0b12", borderColor: "#f59e0b40" }]}>
              <Text style={[sd.messHeroLabel, { color: theme.textSecondary }]}>MESS NAME</Text>
              <Text style={sd.messHeroValue}>{mess}</Text>
            </View>

            <View style={[sd.infoCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
              {!!d.roomNumber && (
                <View style={sd.infoRow}>
                  <Text style={[sd.infoKey, { color: theme.textSecondary }]}>Room</Text>
                  <Text style={[sd.infoVal, { color: theme.text }]}>Room {d.roomNumber}</Text>
                </View>
              )}
              {!!contact && (
                <Pressable onPress={() => callStudent(contact)} style={sd.infoRow}>
                  <Text style={[sd.infoKey, { color: theme.textSecondary }]}>Phone</Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <Text style={[sd.infoVal, { color: theme.tint, flex: 0, textAlign: "right" }]}>{contact}</Text>
                    <Feather name="phone-call" size={12} color={theme.tint} />
                  </View>
                </Pressable>
              )}
            </View>

            {!!contact && (
              <Pressable
                onPress={() => callStudent(contact)}
                style={[sd.callBtn, { backgroundColor: theme.tint }]}
              >
                <Feather name="phone-call" size={15} color="#fff" />
                <Text style={sd.callBtnText}>Call Student</Text>
              </Pressable>
            )}

            {/* Mess pass status */}
            <View style={[sd.statusBox, {
              backgroundColor: hasPass ? "#22c55e12" : "#f59e0b12",
              borderColor: hasPass ? "#22c55e40" : "#f59e0b40",
            }]}>
              <Feather name={hasPass ? "check-circle" : "clock"} size={16} color={hasPass ? "#22c55e" : "#f59e0b"} />
              <View style={{ flex: 1 }}>
                <Text style={[sd.statusLabel, { color: hasPass ? "#22c55e" : "#f59e0b" }]}> 
                  {hasPass ? "Mess pass given" : "Mess pass pending"}
                </Text>
                {!!selected.messCardGivenAt && (
                  <Text style={[sd.statusSub, { color: theme.textSecondary }]}>
                    Given at {fmt(selected.messCardGivenAt)}
                  </Text>
                )}
              </View>
            </View>

            {/* Confirm / Revoke */}
            <Pressable
              onPress={onConfirm}
              disabled={isPending}
              style={[sd.confirmBtn, { backgroundColor: hasPass ? "#ef4444" : "#22c55e", opacity: isPending ? 0.65 : 1 }]}
            >
              {isPending
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Feather name={hasPass ? "x-circle" : "check-circle"} size={16} color="#fff" />
                    <Text style={sd.confirmText}>{hasPass ? "Revoke Pass" : "Confirm & Give Pass"}</Text>
                  </>
              }
            </Pressable>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function MessCardTabScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const request = useApiRequest();
  const { isVolunteer, isSuperAdmin, user } = useAuth();
  const qc = useQueryClient();
  const isFocused = useIsFocused();

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchNonce, setSearchNonce] = useState(0);
  const [filter, setFilter] = useState<"all" | "given" | "pending">("all");
  const [selected, setSelected] = useState<any | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<any | null>(null);
  const [open, setOpen] = useState(false);
  const [activating, setActivating] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const requiresShift = user?.role === "volunteer" || user?.role === "admin" || user?.role === "coordinator";
  const hasSearchQuery = searchQuery.trim().length > 0;
  const STUDENTS_FETCH_LIMIT = 5000;

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries({ queryKey: ["mess-card-students"] });
      qc.invalidateQueries({ queryKey: ["my-status"] });
    }, [qc])
  );

  const { data: myStatus, refetch: refetchStatus } = useQuery<{ isActive: boolean; lastActiveAt: string | null }>({
    queryKey: ["my-status"],
    queryFn: () => request("/staff/me-status"),
    enabled: requiresShift && isFocused,
    refetchInterval: isFocused ? 20000 : false,
    staleTime: 2000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  const canWork = !requiresShift || !!myStatus?.isActive;

  const { data, isLoading } = useQuery<any>({
    queryKey: ["mess-card-students", searchQuery, searchNonce],
    queryFn: async () => {
      const searchParam = searchQuery.trim()
        ? `&search=${encodeURIComponent(searchQuery.trim())}`
        : "";

      // Single large request is much faster than looped pagination for this screen.
      const chunk = await request(`/students?limit=${STUDENTS_FETCH_LIMIT}&offset=0${searchParam}`);
      return Array.isArray(chunk) ? chunk : (chunk?.students || chunk?.data || []);
    },
    enabled: canWork && isFocused && hasSearchQuery,
    refetchInterval: isFocused ? 20000 : false,
    staleTime: 8000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    gcTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  const rawStudents = (Array.isArray(data) ? data : data?.students || []) as any[];
  const students = useMemo(() => {
    const map = new Map<string, any>();
    for (const s of rawStudents) {
      const key = String(s.rollNumber || "").toLowerCase() || String(s.email || "").toLowerCase() || String(s.id);
      if (!map.has(key)) map.set(key, s);
    }
    return Array.from(map.values());
  }, [rawStudents]);

  const givenCount = useMemo(() => students.filter((s) => s.messCard).length, [students]);
  const pendingCount = Math.max(0, students.length - givenCount);
  const visibleStudents = useMemo(() => {
    if (filter === "given") return students.filter((s) => s.messCard);
    if (filter === "pending") return students.filter((s) => !s.messCard);
    return students;
  }, [students, filter]);

  const toggleMutation = useMutation({
    mutationFn: async ({ studentId, messCard }: { studentId: string; messCard: boolean }) =>
      request(`/inventory-simple/${studentId}/mess-card`, {
        method: "PATCH",
        body: JSON.stringify({ messCard }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["mess-card-students"] });
      qc.invalidateQueries({ queryKey: ["mess-stats"] });
    },
  });

  function openStudent(student: any) {
    setSelected(student);
    setSelectedDetails(null);
    setOpen(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    request(`/students/${student.id}`)
      .then((d) => setSelectedDetails(d))
      .catch(() => setSelectedDetails(student));
  }

  async function confirmGive() {
    if (!selected) return;
    await toggleMutation.mutateAsync({ studentId: selected.id, messCard: !selected.messCard });
    setSelected({
      ...selected,
      messCard: !selected.messCard,
      messCardGivenAt: !selected.messCard ? new Date().toISOString() : null,
    });
    setOpen(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }

  async function goActive() {
    setActivating(true);
    try {
      await request("/staff/go-active", { method: "POST", body: JSON.stringify({}) });
      await refetchStatus();
    } catch {
    } finally { setActivating(false); }
  }

  async function goInactive() {
    setDeactivating(true);
    try {
      await request("/staff/go-inactive", { method: "POST", body: JSON.stringify({}) });
      await refetchStatus();
    } catch {
    } finally { setDeactivating(false); }
  }

  function submitSearch() {
    setSearchQuery(searchInput.trim());
    setSearchNonce((n) => n + 1);
  }

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: 16, borderBottomColor: theme.border }]}>
        <View>
          <Text style={[styles.title, { color: theme.text }]}>Mess Card</Text>
          <Text style={[styles.sub, { color: theme.textSecondary }]}>
            Total {students.length} · Given {givenCount} · Pending {pendingCount}
          </Text>
        </View>
      </View>

      {/* Metrics */}

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        <Feather name="search" size={15} color={theme.textSecondary} />
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search by name, roll, room…"
          placeholderTextColor={theme.textTertiary}
          style={[styles.searchInput, { color: theme.text }]}
          returnKeyType="search"
          onSubmitEditing={submitSearch}
          autoCorrect={false}
        />
        {searchInput.length > 0 && (
          <Pressable onPress={() => { setSearchInput(""); setSearchQuery(""); setSearchNonce((n) => n + 1); }} hitSlop={8}>
            <Feather name="x" size={15} color={theme.textSecondary} />
          </Pressable>
        )}
        <Pressable
          onPress={submitSearch}
          style={{ backgroundColor: theme.tint + "20", borderWidth: 1, borderColor: theme.tint + "55", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 }}
        >
          <Text style={{ color: theme.tint, fontSize: 12, fontFamily: "Inter_600SemiBold" }}>Search</Text>
        </Pressable>
      </View>

      {!hasSearchQuery && canWork ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: theme.tint + "15", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Feather name="search" size={28} color={theme.tint} />
          </View>
          <Text style={{ color: theme.text, fontSize: 17, fontFamily: "Inter_700Bold", textAlign: "center", marginBottom: 8 }}>
            Search for a Student
          </Text>
          <Text style={{ color: theme.textSecondary, fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" }}>
            Type a student name, roll number, or room number above, then tap Search.
          </Text>
        </View>
      ) : (
        <>
      {/* Filter tabs */}
      <View style={[styles.filterRow, { borderBottomColor: theme.border }]}>
        {(["all", "given", "pending"] as const).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.filterBtn, {
              borderColor: filter === f
                ? (f === "given" ? "#22c55e" : f === "pending" ? "#f59e0b" : theme.tint)
                : theme.border,
              backgroundColor: filter === f
                ? (f === "given" ? "#22c55e20" : f === "pending" ? "#f59e0b20" : theme.tint + "20")
                : theme.surface,
            }]}
          >
            <Text style={[styles.filterText, {
              color: filter === f
                ? (f === "given" ? "#22c55e" : f === "pending" ? "#f59e0b" : theme.tint)
                : theme.textSecondary,
            }]}>
              {f === "all" ? `All (${students.length})` : f === "given" ? `Given (${givenCount})` : `Pending (${pendingCount})`}
            </Text>
          </Pressable>
        ))}
      </View>

      {isLoading && students.length === 0 ? (
        <ActivityIndicator color={theme.tint} style={{ marginTop: 24 }} />
      ) : students.length === 0 ? (
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Text style={{ color: theme.textSecondary, fontSize: 14, fontFamily: "Inter_400Regular" }}>No students found.</Text>
        </View>
      ) : (
        <FlatList
          data={visibleStudents}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 80 : 90 }}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: theme.border, marginLeft: 66 }} />}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => openStudent(item)}
              style={({ pressed }) => [styles.row, { backgroundColor: theme.background, opacity: pressed ? 0.85 : 1 }]}
            >
              <View style={[styles.avatar, { backgroundColor: theme.tint + "20" }]}>
                <Text style={[styles.avatarText, { color: theme.tint }]}>
                  {(item.name || "?")[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[styles.meta, { color: theme.textSecondary }]} numberOfLines={2}>
                  {item.email || "—"}
                </Text>
                <Text style={[styles.meta, { color: theme.textTertiary }]} numberOfLines={1}>
                  {item.roomNumber ? `Room ${item.roomNumber}` : "No room"}
                </Text>
                {item.messCard ? (
                  <Text style={[styles.meta, { color: "#22c55e" }]} numberOfLines={1}>
                    Given {item.messCardGivenAt ? `· ${fmt(item.messCardGivenAt)}` : ""}
                  </Text>
                ) : (
                  <Text style={[styles.meta, { color: theme.textTertiary }]}>Pass not issued</Text>
                )}
              </View>
              <View style={{ alignItems: "flex-end", gap: 8 }}>
                {!!(item.contactNumber || item.phone) && (
                  <Pressable
                    onPress={(e) => {
                      e.stopPropagation();
                      void callStudent(item.contactNumber || item.phone);
                    }}
                    style={[styles.callIconBtn, { borderColor: theme.tint + "44", backgroundColor: theme.tint + "14" }]}
                  >
                    <Feather name="phone" size={13} color={theme.tint} />
                  </Pressable>
                )}
                <View style={[styles.chip, {
                  backgroundColor: item.messCard ? "#22c55e15" : theme.surface,
                  borderColor: item.messCard ? "#22c55e50" : theme.border,
                }]}> 
                  <Text style={[styles.chipText, { color: item.messCard ? "#22c55e" : theme.textSecondary }]}> 
                    {item.messCard ? "Given" : "Pending"}
                  </Text>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
        </>
      )}

      {/* Enhanced Student Detail Sheet */}
      <StudentDetailSheet
        selected={selected}
        selectedDetails={selectedDetails}
        visible={open}
        onClose={() => setOpen(false)}
        onConfirm={confirmGive}
        isPending={toggleMutation.isPending}
        theme={theme}
        isDark={isDark}
      />

      {!canWork && (
        <View style={styles.lockOverlay}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(0,0,0,0.8)" : "rgba(255,255,255,0.88)" }]} />
          {!user?.hostelId && isVolunteer ? (
            <View style={[styles.lockCard, { backgroundColor: theme.surface, borderColor: "#F5A62350" }]}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: "#F5A62315", alignItems: "center", justifyContent: "center" }}>
                <Feather name="home" size={20} color="#F5A623" />
              </View>
              <Text style={[styles.lockTitle, { color: theme.text }]}>No Hostel Assigned</Text>
              <Text style={[styles.lockSub, { color: theme.textSecondary }]}>
                Your account is active but no hostel has been assigned yet. Contact your Super Admin.
              </Text>
              <Text style={{ color: theme.textTertiary, fontSize: 11, fontFamily: "Inter_400Regular" }}>Your login is working correctly.</Text>
            </View>
          ) : (
            <View style={[styles.lockCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: theme.tint + "15", alignItems: "center", justifyContent: "center" }}>
                <Feather name="lock" size={20} color={theme.tint} />
              </View>
              <Text style={[styles.lockTitle, { color: theme.text }]}>Shift Inactive</Text>
              <Text style={[styles.lockSub, { color: theme.textSecondary }]}>
                Go to the Home tab to start your shift, then come back here.
              </Text>
            </View>
          )}
        </View>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: 1 },
  title: { fontSize: 22, fontFamily: "Inter_700Bold" },
  sub: { marginTop: 2, fontSize: 13, fontFamily: "Inter_400Regular" },
  shiftBanner: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, marginHorizontal: 16, marginTop: 10, paddingHorizontal: 10, paddingVertical: 8 },
  shiftDot: { width: 8, height: 8, borderRadius: 4 },
  shiftText: { flex: 1, fontSize: 12, fontFamily: "Inter_700Bold" },
  shiftBtnInline: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  shiftBtnInlineText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  searchWrap: { flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, marginBottom: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1 },
  filterBtn: { flex: 1, borderWidth: 1, borderRadius: 10, alignItems: "center", paddingVertical: 7 },
  filterText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, fontFamily: "Inter_700Bold" },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular" },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  callIconBtn: { width: 28, height: 28, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  lockOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 20 },
  lockCard: { borderWidth: 1, borderRadius: 16, padding: 20, alignItems: "center", gap: 10, width: "100%", maxWidth: 340 },
  lockTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  lockSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  lockBtn: { marginTop: 4, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  lockBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
});

// ─── StudentDetailSheet Styles ─────────────────────────────────────────────────
const sd = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: "90%", paddingBottom: 8 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  avatar: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 22, fontFamily: "Inter_700Bold" },
  name: { fontSize: 16, fontFamily: "Inter_700Bold" },
  roll: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  hostel: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  closeX: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  messHero: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  messHeroLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", letterSpacing: 0.6 },
  messHeroValue: { marginTop: 4, fontSize: 22, lineHeight: 26, fontFamily: "Inter_700Bold", color: "#f59e0b" },
  infoCard: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 5, gap: 10 },
  infoKey: { fontSize: 12, fontFamily: "Inter_500Medium" },
  infoVal: { fontSize: 13, fontFamily: "Inter_600SemiBold", flex: 1, textAlign: "right" },
  callBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 12, marginBottom: 10 },
  callBtnText: { color: "#fff", fontSize: 13, fontFamily: "Inter_700Bold" },
  statusBox: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 10 },
  statusLabel: { fontSize: 13, fontFamily: "Inter_700Bold" },
  statusSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 14, paddingVertical: 14, marginBottom: 4 },
  confirmText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
});
