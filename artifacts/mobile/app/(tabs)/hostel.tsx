import React, { useState, useMemo, useCallback, memo, useRef, useEffect } from "react";
import {
  View, Text, FlatList, StyleSheet, Pressable, TextInput,
  Modal, ScrollView, RefreshControl, Platform, useColorScheme,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth, useApiRequest } from "@/context/AuthContext";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";
import { useDebounce } from "@/hooks/useDebounce";
import { AnimatedCard } from "@/components/ui/AnimatedCard";

const PAGE_SIZE = 60;
const ALL_HOSTELS = "__all__";

function parseAssignedHostels(user: any): string[] {
  const ids: string[] = [];
  try {
    const parsed = JSON.parse(user?.assignedHostelIds || "[]");
    if (Array.isArray(parsed)) ids.push(...parsed);
  } catch {}
  if (user?.hostelId) ids.push(user.hostelId);
  return [...new Set(ids.filter(Boolean))];
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const h = d.getHours(), m = d.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

// ─── Student Detail Modal ──────────────────────────────────────────────────────

const StudentDetailModal = memo(function StudentDetailModal({
  student, visible, onClose, theme,
}: {
  student: any; visible: boolean; onClose: () => void; theme: any;
}) {
  const request = useApiRequest();
  const modalInsets = useSafeAreaInsets();

  const { data: history = [], isLoading: histLoading } = useQuery<any[]>({
    queryKey: ["student-history", student?.id],
    queryFn: () => request(`/students/${student?.id}/checkins-history?limit=7`),
    enabled: visible && !!student?.id,
    staleTime: 30000,
  });

  if (!student) return null;

  const isIn = student.attendanceStatus === "entered" || !!student.checkInTime;
  const attColor = isIn ? "#22c55e" : "#f59e0b";
  const attLabel = isIn ? "In Campus" : "Out";
  const initial = (student.name || "?")[0].toUpperCase();

  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === "ios" ? "pageSheet" : "overFullScreen"} onRequestClose={onClose}>
      <View style={[sd.container, { backgroundColor: theme.background }]}>
        <View style={sd.dragHandle} />
        {/* Profile header */}
        <View style={[sd.profileHeader, { backgroundColor: theme.surface, borderBottomColor: theme.border, paddingTop: Math.max(modalInsets.top + 16, 56) }]}>
          <View style={[sd.avatar, { backgroundColor: theme.tint + "25" }]}>
            <Text style={[sd.avatarText, { color: theme.tint }]}>{initial}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[sd.name, { color: theme.text }]} numberOfLines={2}>{student.name}</Text>
            <Text style={[sd.email, { color: theme.textSecondary }]} numberOfLines={1}>{student.email}</Text>
            {student.rollNumber ? (
              <Text style={[sd.roll, { color: theme.textTertiary }]}>{student.rollNumber}</Text>
            ) : null}
          </View>
          <View style={{ alignItems: "flex-end", gap: 8 }}>
            <View style={[sd.statusBadge, { backgroundColor: attColor + "20", borderColor: attColor + "40" }]}>
              <View style={[sd.dot, { backgroundColor: attColor }]} />
              <Text style={[sd.statusText, { color: attColor }]}>{attLabel}</Text>
            </View>
            <Pressable onPress={onClose} style={[sd.closeBtn, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Feather name="x" size={18} color={theme.textSecondary} />
            </Pressable>
          </View>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 16, paddingBottom: Math.max(modalInsets.bottom + 32, 64), gap: 12 }}
        >
          {/* Today's Attendance */}
          <Section title="TODAY'S ATTENDANCE" icon="clock" theme={theme}>
            <InfoGrid rows={[
              { label: "Check-In", value: fmtTime(student.checkInTime), color: student.checkInTime ? "#22c55e" : undefined },
              { label: "Check-Out", value: fmtTime(student.checkOutTime), color: student.checkOutTime ? "#f59e0b" : undefined },
            ]} theme={theme} />
          </Section>

          {/* Location */}
          <Section title="LOCATION" icon="map-pin" theme={theme}>
            <InfoGrid rows={[
              { label: "Hostel", value: student.hostelName || student.hostelId || "—" },
              { label: "Room No.", value: student.roomNumber || "—" },
              { label: "Area", value: student.area || "—" },
              { label: "Mess", value: student.assignedMess || student.allottedMess || "—" },
            ]} theme={theme} />
          </Section>

          {/* Contact */}
          <Section title="CONTACT" icon="phone" theme={theme}>
            <InfoGrid rows={[
              { label: "Mobile", value: student.mobileNumber || student.phone || student.contactNumber || "—" },
              { label: "Emergency", value: student.emergencyContact || "—" },
            ]} theme={theme} />
          </Section>

          {/* Academic */}
          <Section title="ACADEMIC INFO" icon="book-open" theme={theme}>
            <InfoGrid rows={[
              { label: "Gender", value: student.gender || "—" },
              { label: "Age", value: student.age || "—" },
              { label: "Programme", value: student.dsEs || "—" },
              { label: "Mess Card", value: student.messCard ? "Issued" : "Not Issued", color: student.messCard ? "#22c55e" : undefined },
            ]} theme={theme} />
            {student.remarks ? (
              <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: theme.tint + "10" }}>
                <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textSecondary }]}>
                  Remarks: {student.remarks}
                </Text>
              </View>
            ) : null}
          </Section>

          {/* Check-in History */}
          <Section title="RECENT CHECK-INS" icon="calendar" theme={theme}>
            {histLoading ? (
              <ActivityIndicator color={theme.tint} style={{ marginVertical: 10 }} />
            ) : (history as any[]).length === 0 ? (
              <Text style={[{ fontSize: 12, fontFamily: "Inter_400Regular", color: theme.textTertiary, paddingVertical: 8 }]}>
                No check-in history
              </Text>
            ) : (
              (history as any[]).map((h: any, i: number) => (
                <View key={h.id || i} style={[sd.histRow, { borderBottomColor: theme.border }]}>
                  <View style={[sd.histDate, { backgroundColor: theme.tint + "15" }]}>
                    <Feather name="calendar" size={11} color={theme.tint} />
                    <Text style={[sd.histDateText, { color: theme.tint }]}>{fmtDate(h.date || h.checkInTime)}</Text>
                  </View>
                  <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                    <View style={sd.histTime}>
                      <Feather name="log-in" size={11} color="#22c55e" />
                      <Text style={[sd.histTimeText, { color: "#22c55e" }]}>{fmtTime(h.checkInTime)}</Text>
                    </View>
                    {h.checkOutTime && (
                      <View style={sd.histTime}>
                        <Feather name="log-out" size={11} color="#f59e0b" />
                        <Text style={[sd.histTimeText, { color: "#f59e0b" }]}>{fmtTime(h.checkOutTime)}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))
            )}
          </Section>
        </ScrollView>
      </View>
    </Modal>
  );
});

function Section({ title, icon, children, theme }: { title: string; icon: string; children: React.ReactNode; theme: any }) {
  return (
    <View style={[sd.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={sd.sectionHeader}>
        <View style={[sd.sectionIcon, { backgroundColor: theme.tint + "15" }]}>
          <Feather name={icon as any} size={13} color={theme.tint} />
        </View>
        <Text style={[sd.sectionTitle, { color: theme.textSecondary }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoGrid({ rows, theme }: { rows: { label: string; value: string; color?: string }[]; theme: any }) {
  const cols = rows.length <= 2 ? 1 : 2;
  const grouped: (typeof rows)[] = [];
  for (let i = 0; i < rows.length; i += cols) grouped.push(rows.slice(i, i + cols));
  return (
    <View style={{ gap: 0 }}>
      {grouped.map((group, gi) => (
        <View key={gi} style={[sd.gridRow, gi < grouped.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
          {group.map((r) => (
            <View key={r.label} style={{ flex: 1 }}>
              <Text style={[sd.gridLabel, { color: theme.textTertiary }]}>{r.label}</Text>
              <Text style={[sd.gridValue, { color: r.color || theme.text }]}>{r.value}</Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

// ─── Student Card (memoized) ───────────────────────────────────────────────────

const CARD_HEIGHT = 76;
const ITEM_HEIGHT = CARD_HEIGHT + 8; // card + separator

const StudentCard = memo(function StudentCard({
  item, theme, onPress, showHostel,
}: {
  item: any; theme: any; onPress: () => void; showHostel: boolean;
}) {
  const isIn = item.attendanceStatus === "entered" || !!item.checkInTime;
  const attColor = isIn ? "#22c55e" : "#64748b";
  const initial = (item.name || "?")[0].toUpperCase();

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        sc.card,
        { backgroundColor: theme.surface, borderColor: theme.border, opacity: pressed ? 0.82 : 1 },
      ]}
    >
      <View style={[sc.avatarWrap, { backgroundColor: theme.tint + "20" }]}>
        <Text style={[sc.avatarText, { color: theme.tint }]}>{initial}</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[sc.name, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
        <Text style={[sc.meta, { color: theme.textSecondary }]} numberOfLines={1}>
          {[item.rollNumber, item.roomNumber && `Room ${item.roomNumber}`].filter(Boolean).join(" · ")}
        </Text>
        {showHostel && item.hostelId ? (
          <Text style={[sc.hostel, { color: theme.tint }]} numberOfLines={1}>{item.hostelId}</Text>
        ) : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <View style={[sc.badge, { backgroundColor: attColor + "20" }]}>
          <View style={[sc.dot, { backgroundColor: attColor }]} />
          <Text style={[sc.badgeText, { color: attColor }]}>{isIn ? "In" : "Out"}</Text>
        </View>
        <Feather name="chevron-right" size={14} color={theme.textTertiary} />
      </View>
    </Pressable>
  );
}, (prev, next) =>
  prev.item.id === next.item.id &&
  prev.item.attendanceStatus === next.item.attendanceStatus &&
  prev.item.checkInTime === next.item.checkInTime &&
  prev.showHostel === next.showHostel
);

// ─── Staff Students View ───────────────────────────────────────────────────────

function StaffStudentsView({ theme, insets, isDark }: { theme: any; insets: any; isDark: boolean }) {
  const { user, isSuperAdmin } = useAuth();
  const request = useApiRequest();
  const qc = useQueryClient();
  const isWeb = Platform.OS === "web";
  const topPad = Platform.OS === "web" ? 24 : Math.max(insets.top + 20, 100);

  // ─── Shift requirement ───────────────────────────────────────────────────────
  const requiresShift = !isSuperAdmin;
  const [activating, setActivating] = useState(false);
  const { data: myStatus, refetch: refetchStatus } = useQuery<{ isActive: boolean; lastActiveAt: string | null }>({
    queryKey: ["my-status"],
    queryFn: () => request("/staff/me-status"),
    enabled: requiresShift,
    refetchInterval: 20000,
    staleTime: 10000,
  });
  const canWork = !requiresShift || !!myStatus?.isActive;

  const goActive = async () => {
    setActivating(true);
    try {
      await request("/staff/go-active", { method: "POST", body: JSON.stringify({}) });
      await refetchStatus();
    } catch {}
    setActivating(false);
  };

  // ─── Hostel filter ───────────────────────────────────────────────────────────
  const assignedHostels = useMemo(() => parseAssignedHostels(user), [user?.hostelId, user?.assignedHostelIds]);
  const showHostelFilter = assignedHostels.length > 1 || isSuperAdmin;

  const [selectedHostel, setSelectedHostel] = useState(ALL_HOSTELS);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350);
  const [students, setStudents] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<any>(null);
  const offsetRef = useRef(0);
  const loadingRef = useRef(false);

  const doFetch = useCallback(async (offset: number) => {
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset) });
    if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
    if (selectedHostel !== ALL_HOSTELS) params.set("hostelId", selectedHostel);
    const res = await request(`/students?${params}`);
    const list = Array.isArray(res) ? res : (res.students || []);
    const tot = res.total ?? list.length;
    return { list, total: Number(tot) };
  }, [request, debouncedSearch, selectedHostel]);

  const hasActiveQuery = debouncedSearch.trim().length > 0 || selectedHostel !== ALL_HOSTELS;

  const load = useCallback(async (reset = false) => {
    if (!canWork) { setHasMore(false); return; }
    if (!hasActiveQuery) {
      setStudents([]);
      setTotal(0);
      setHasMore(false);
      setLoading(false);
      return;
    }
    if (loadingRef.current && !reset) return;
    loadingRef.current = true;
    if (reset) {
      setLoading(true);
      offsetRef.current = 0;
      setHasMore(true);
    } else {
      setLoadingMore(true);
    }
    try {
      const { list, total: tot } = await doFetch(offsetRef.current);
      setStudents(prev => {
        const next = reset ? list : [...prev, ...list];
        if (reset) qc.setQueryData(["hostel-students-cache"], next);
        return next;
      });
      setTotal(tot);
      offsetRef.current = (reset ? 0 : offsetRef.current) + list.length;
      setHasMore(offsetRef.current < tot);
    } catch {}
    loadingRef.current = false;
    setLoading(false);
    setLoadingMore(false);
  }, [doFetch, canWork, hasActiveQuery, qc]);

  // Reload when shift becomes active, or filter/search changes
  useEffect(() => { load(true); }, [debouncedSearch, selectedHostel, canWork]);

  // Auto-refresh every 30s only when actively searching
  useEffect(() => {
    if (!canWork || !hasActiveQuery) return;
    const t = setInterval(() => { if (!loadingRef.current) load(true); }, 30000);
    return () => clearInterval(t);
  }, [load, canWork, hasActiveQuery]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(true);
    setRefreshing(false);
  }, [load]);

  const onEndReached = useCallback(() => {
    if (hasMore && !loadingRef.current && !loadingMore) load(false);
  }, [hasMore, loadingMore, load]);

  const getItemLayout = useCallback((_: any, index: number) => ({
    length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index,
  }), []);

  const showHostel = selectedHostel === ALL_HOSTELS && (isSuperAdmin || assignedHostels.length > 1);

  return (
    <View style={[{ flex: 1, backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[stf.header, { paddingTop: 16, borderBottomColor: theme.border }]}>
        <View style={stf.headerTop}>
          <Text style={[stf.title, { color: theme.text }]}>Students</Text>
          {total > 0 && (
            <View style={[stf.countBadge, { backgroundColor: theme.tint + "18", borderColor: theme.tint + "35" }]}>
              <Text style={[stf.countText, { color: theme.tint }]}>{total.toLocaleString()}</Text>
            </View>
          )}
        </View>

        {/* Search */}
        <View style={[stf.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Feather name="search" size={16} color={theme.textSecondary} />
          <TextInput
            style={[stf.searchInput, { color: theme.text }]}
            placeholder="Search by name, roll, room, mess…"
            placeholderTextColor={theme.textTertiary}
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
            clearButtonMode="while-editing"
            autoCorrect={false}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <Feather name="x-circle" size={16} color={theme.textSecondary} />
            </Pressable>
          )}
        </View>

        {/* Hostel filter chips */}
        {showHostelFilter && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={stf.chips}
          >
            <HostelChip
              label="All Hostels"
              active={selectedHostel === ALL_HOSTELS}
              onPress={() => { Haptics.selectionAsync(); setSelectedHostel(ALL_HOSTELS); }}
              theme={theme}
            />
            {(isSuperAdmin
              ? KNOWN_HOSTELS
              : assignedHostels
            ).map(h => (
              <HostelChip
                key={h}
                label={h}
                active={selectedHostel === h}
                onPress={() => { Haptics.selectionAsync(); setSelectedHostel(h); }}
                theme={theme}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {/* List */}
      {loading && students.length === 0 ? (
        <View style={{ padding: 16 }}>
          <CardSkeleton /><CardSkeleton /><CardSkeleton /><CardSkeleton />
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={item => item.id}
          contentContainerStyle={{ paddingHorizontal: 14, paddingTop: 10, paddingBottom: 120 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
          onEndReached={onEndReached}
          onEndReachedThreshold={0.4}
          getItemLayout={getItemLayout}
          removeClippedSubviews
          windowSize={7}
          initialNumToRender={15}
          maxToRenderPerBatch={20}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
          ListEmptyComponent={
            !hasActiveQuery ? (
              <View style={stf.empty}>
                <Feather name="search" size={44} color={theme.textTertiary} />
                <Text style={[stf.emptyTitle, { color: theme.text }]}>Search Students</Text>
                <Text style={[stf.emptyHint, { color: theme.textSecondary }]}>
                  Enter a name, roll number, or room to find students
                </Text>
              </View>
            ) : (
              <View style={stf.empty}>
                <Feather name="users" size={44} color={theme.textTertiary} />
                <Text style={[stf.emptyTitle, { color: theme.text }]}>No students found</Text>
                <Text style={[stf.emptyHint, { color: theme.textSecondary }]}>
                  Try a different name, roll number, or room
                </Text>
              </View>
            )
          }
          ListFooterComponent={loadingMore ? (
            <ActivityIndicator color={theme.tint} style={{ marginVertical: 16 }} />
          ) : null}
          renderItem={({ item }) => (
            <StudentCard
              item={item}
              theme={theme}
              showHostel={showHostel}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedStudent(item);
              }}
            />
          )}
        />
      )}

      <StudentDetailModal
        student={selectedStudent}
        visible={!!selectedStudent && canWork}
        onClose={() => setSelectedStudent(null)}
        theme={theme}
      />

      {!canWork && (
        <View style={stf.lockOverlay}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: isDark ? "rgba(0,0,0,0.75)" : "rgba(255,255,255,0.85)" }]} />
          {!user?.hostelId && user?.role === "volunteer" ? (
            <View style={[stf.lockCard, { backgroundColor: theme.surface, borderColor: "#F5A62350" }]}>
              <View style={[stf.lockIconWrap, { backgroundColor: "#F5A62315" }]}>
                <Feather name="home" size={22} color="#F5A623" />
              </View>
              <Text style={[stf.lockTitle, { color: theme.text }]}>No Hostel Assigned</Text>
              <Text style={[stf.lockSub, { color: theme.textSecondary }]}>
                Your account is set up but no hostel has been assigned yet. Contact your Super Admin to assign you a hostel.
              </Text>
              <Text style={[stf.lockSub, { color: theme.textTertiary, fontSize: 12, marginTop: 4 }]}>
                Your login is working correctly.
              </Text>
            </View>
          ) : (
            <View style={[stf.lockCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <View style={[stf.lockIconWrap, { backgroundColor: theme.tint + "15" }]}>
                <Feather name="lock" size={22} color={theme.tint} />
              </View>
              <Text style={[stf.lockTitle, { color: theme.text }]}>Shift Not Active</Text>
              <Text style={[stf.lockSub, { color: theme.textSecondary }]}>
                Start your shift to begin viewing student data and recording attendance.
              </Text>
              <Pressable
                onPress={goActive}
                disabled={activating}
                style={[stf.lockBtn, { backgroundColor: theme.tint, opacity: activating ? 0.7 : 1 }]}
              >
                <Feather name="play-circle" size={16} color="#fff" />
                <Text style={stf.lockBtnText}>{activating ? "Starting shift…" : "Start Shift"}</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

function HostelChip({ label, active, onPress, theme }: { label: string; active: boolean; onPress: () => void; theme: any }) {
  return (
    <Pressable
      onPress={onPress}
      style={[stf.chip, {
        backgroundColor: active ? theme.tint : theme.surface,
        borderColor: active ? theme.tint : theme.border,
      }]}
    >
      <Text style={[stf.chipText, { color: active ? "#fff" : theme.textSecondary }]}>{label}</Text>
    </Pressable>
  );
}

const KNOWN_HOSTELS = [
  "Bhadra", "Brahmaputra", "Cauvery", "Ganga", "Godavari",
  "Jamuna", "Krishna", "Mandakini", "Narmada", "Saraswathi",
  "Sharavathi", "Swarnamukhi", "Tapti",
];

// ─── Student Hostel View ───────────────────────────────────────────────────────

function StudentHostelView({ theme, insets }: { theme: any; insets: any }) {
  const { user } = useAuth();
  const request = useApiRequest();
  const isWeb = Platform.OS === "web";
  const topPad = Platform.OS === "web" ? 24 : Math.max(insets.top + 20, 100);
  const [refreshing, setRefreshing] = useState(false);

  const { data: hostel, isLoading, refetch: refetchHostel } = useQuery<any>({
    queryKey: ["hostel", user?.hostelId],
    queryFn: () => request(`/hostels/${user?.hostelId}`),
    enabled: !!user?.hostelId,
    staleTime: 60000,
  });

  const { data: contacts = [], refetch: refetchContacts } = useQuery<any[]>({
    queryKey: ["hostel-contacts", user?.hostelId],
    queryFn: () => request(`/hostel/contacts?hostelId=${user?.hostelId}`),
    enabled: !!user?.hostelId,
    staleTime: 60000,
  });

  const { data: myInventory } = useQuery<any>({
    queryKey: ["my-inventory", user?.id],
    queryFn: () => request(`/attendance/inventory/${user?.id}`),
    enabled: !!user?.id,
    staleTime: 60000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([refetchHostel(), refetchContacts()]);
    setRefreshing(false);
  }, [refetchHostel, refetchContacts]);

  if (isLoading) {
    return (
      <View style={[{ flex: 1, backgroundColor: theme.background }]}>
        <View style={[stf.header, { paddingTop: 16, borderBottomColor: theme.border }]}>
          <Text style={[stf.title, { color: theme.text }]}>My Hostel</Text>
        </View>
        <View style={{ padding: 16 }}><CardSkeleton /><CardSkeleton /></View>
      </View>
    );
  }

  const inv = myInventory as any;

  return (
    <View style={[{ flex: 1, backgroundColor: theme.background }]}>
      <View style={[stf.header, { paddingTop: 16, borderBottomColor: theme.border }]}>
        <Text style={[stf.title, { color: theme.text }]}>My Hostel</Text>
        {hostel?.name && <Text style={[stf.hostelSubtitle, { color: theme.textSecondary }]}>{hostel.name}</Text>}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
      >
        {!hostel ? (
          <View style={stf.empty}>
            <Feather name="home" size={44} color={theme.textTertiary} />
            <Text style={[stf.emptyTitle, { color: theme.text }]}>No hostel assigned</Text>
            <Text style={[stf.emptyHint, { color: theme.textSecondary }]}>Contact admin to get assigned</Text>
          </View>
        ) : (
          <>
            {/* Hostel Info */}
            <AnimatedCard style={stv.card}>
              <View style={stv.cardHeader}>
                <View style={[stv.cardIcon, { backgroundColor: theme.tint + "20" }]}>
                  <Feather name="home" size={18} color={theme.tint} />
                </View>
                <Text style={[stv.cardTitle, { color: theme.text }]}>{hostel.name}</Text>
              </View>
              <View style={{ gap: 0 }}>
                {[
                  { icon: "user", label: "Warden", value: hostel.wardenName },
                  { icon: "phone", label: "Contact", value: hostel.wardenPhone },
                  { icon: "layers", label: "Capacity", value: String(hostel.capacity || "—") },
                ].map((row, i, arr) => (
                  <View key={row.label} style={[stv.infoRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                    <Feather name={row.icon as any} size={13} color={theme.tint} />
                    <Text style={[stv.infoLabel, { color: theme.textSecondary }]}>{row.label}</Text>
                    <Text style={[stv.infoValue, { color: theme.text }]}>{row.value || "—"}</Text>
                  </View>
                ))}
              </View>
            </AnimatedCard>

            {/* My Room */}
            <AnimatedCard style={stv.card}>
              <View style={stv.cardHeader}>
                <View style={[stv.cardIcon, { backgroundColor: "#8B5CF620" }]}>
                  <Feather name="hash" size={18} color="#8B5CF6" />
                </View>
                <Text style={[stv.cardTitle, { color: theme.text }]}>My Room</Text>
              </View>
              <View style={{ gap: 0 }}>
                {[
                  { icon: "hash", label: "Room No.", value: user?.roomNumber },
                  { icon: "coffee", label: "Mess", value: user?.assignedMess },
                  { icon: "map-pin", label: "Area", value: user?.area },
                ].map((row, i, arr) => (
                  <View key={row.label} style={[stv.infoRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                    <Feather name={row.icon as any} size={13} color="#8B5CF6" />
                    <Text style={[stv.infoLabel, { color: theme.textSecondary }]}>{row.label}</Text>
                    <Text style={[stv.infoValue, { color: theme.text }]}>{row.value || "—"}</Text>
                  </View>
                ))}
              </View>
            </AnimatedCard>

            {/* Inventory */}
            <AnimatedCard style={stv.card}>
              <View style={stv.cardHeader}>
                <View style={[stv.cardIcon, { backgroundColor: "#22c55e20" }]}>
                  <Feather name="package" size={18} color="#22c55e" />
                </View>
                <Text style={[stv.cardTitle, { color: theme.text }]}>My Inventory</Text>
              </View>
              <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
                {(["mattress", "bedsheet", "pillow"] as const).map(item => {
                  const has = !!inv?.[item];
                  return (
                    <View key={item} style={[stv.invChip, { backgroundColor: has ? "#22c55e15" : theme.background, borderColor: has ? "#22c55e50" : theme.border }]}>
                      <Feather name={has ? "check-circle" : "circle"} size={20} color={has ? "#22c55e" : theme.textTertiary} />
                      <Text style={[stv.invLabel, { color: has ? "#22c55e" : theme.textSecondary }]}>
                        {item.charAt(0).toUpperCase() + item.slice(1)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </AnimatedCard>

            {/* Contacts */}
            {(contacts as any[]).length > 0 && (
              <AnimatedCard style={stv.card}>
                <View style={stv.cardHeader}>
                  <View style={[stv.cardIcon, { backgroundColor: "#f59e0b20" }]}>
                    <Feather name="phone-call" size={18} color="#f59e0b" />
                  </View>
                  <Text style={[stv.cardTitle, { color: theme.text }]}>Hostel Contacts</Text>
                </View>
                {(contacts as any[]).map((c, i, arr) => (
                  <View key={c.id} style={[stv.infoRow, i < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.border }]}>
                    <Feather name="user" size={13} color="#f59e0b" />
                    <View style={{ flex: 1 }}>
                      <Text style={[stv.infoValue, { color: theme.text }]}>{c.name}</Text>
                      <Text style={[{ fontSize: 11, fontFamily: "Inter_400Regular", color: theme.textTertiary }]}>{c.role}</Text>
                    </View>
                    <Text style={[stv.infoValue, { color: theme.tint }]}>{c.phone}</Text>
                  </View>
                ))}
              </AnimatedCard>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

// ─── Main Tab ──────────────────────────────────────────────────────────────────

export default function HostelTab() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { isStudent } = useAuth();

  if (isStudent) return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <StudentHostelView theme={theme} insets={insets} />
    </SafeAreaView>
  );
  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1, backgroundColor: theme.background }}>
      <StaffStudentsView theme={theme} insets={insets} isDark={isDark} />
    </SafeAreaView>
  );
}

// ─── Student Detail Styles ─────────────────────────────────────────────────────
const sd = StyleSheet.create({
  container: { flex: 1 },
  dragHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#94a3b830", alignSelf: "center", marginTop: 12, marginBottom: 4 },
  profileHeader: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1 },
  avatar: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 22, fontFamily: "Inter_700Bold" },
  name: { fontSize: 17, fontFamily: "Inter_700Bold" },
  email: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 2 },
  roll: { fontSize: 12, fontFamily: "Inter_500Medium", marginTop: 1 },
  statusBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  closeBtn: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", borderWidth: 1 },
  section: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10 },
  sectionIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  sectionTitle: { fontSize: 11, fontFamily: "Inter_700Bold", letterSpacing: 0.8 },
  gridRow: { flexDirection: "row", gap: 8, paddingHorizontal: 14, paddingVertical: 10 },
  gridLabel: { fontSize: 11, fontFamily: "Inter_400Regular", marginBottom: 2 },
  gridValue: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  histRow: { paddingVertical: 8, borderBottomWidth: 1, paddingHorizontal: 14 },
  histDate: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  histDateText: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  histTime: { flexDirection: "row", alignItems: "center", gap: 4 },
  histTimeText: { fontSize: 12, fontFamily: "Inter_500Medium" },
});

// ─── Student Card Styles ───────────────────────────────────────────────────────
const sc = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, height: CARD_HEIGHT },
  avatarWrap: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 17, fontFamily: "Inter_700Bold" },
  name: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  meta: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  hostel: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 2 },
  badge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  badgeText: { fontSize: 11, fontFamily: "Inter_700Bold" },
});

// ─── Staff View Styles ─────────────────────────────────────────────────────────
const stf = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingBottom: 20, borderBottomWidth: 1, gap: 10 },
  headerTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { fontSize: 26, fontFamily: "Inter_700Bold" },
  hostelSubtitle: { fontSize: 14, fontFamily: "Inter_400Regular", marginTop: -6 },
  countBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, borderWidth: 1 },
  countText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 13, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  chips: { paddingBottom: 4, gap: 8, flexDirection: "row" },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  empty: { alignItems: "center", paddingTop: 80, gap: 10 },
  emptyTitle: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptyHint: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center" },
  lockOverlay: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center", padding: 24 },
  lockCard: { borderWidth: 1, borderRadius: 16, padding: 24, alignItems: "center", gap: 10, width: "100%", maxWidth: 340 },
  lockIconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  lockTitle: { fontSize: 18, fontFamily: "Inter_700Bold" },
  lockSub: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  lockBtn: { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 12 },
  lockBtnText: { color: "#fff", fontSize: 14, fontFamily: "Inter_700Bold" },
});

// ─── Student Hostel View Styles ────────────────────────────────────────────────
const stv = StyleSheet.create({
  card: { marginBottom: 12 },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  cardIcon: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: 16, fontFamily: "Inter_700Bold" },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  infoLabel: { fontSize: 13, fontFamily: "Inter_400Regular", flex: 1 },
  infoValue: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  invChip: { flex: 1, alignItems: "center", paddingVertical: 14, borderRadius: 12, borderWidth: 1, gap: 6 },
  invLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
});
