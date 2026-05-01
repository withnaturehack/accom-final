import React, { useState, useCallback, useEffect } from "react";
import {
  View, Text, StyleSheet, Pressable, Modal,
  TextInput, Platform, useColorScheme, ActivityIndicator,
  RefreshControl, FlatList, Linking, ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useApiRequest, useAuth } from "@/context/AuthContext";

const LIVE_MS = 5000;

const ROLE_COLORS: Record<string, string> = {
  volunteer:   "#22c55e",
  coordinator: "#3b82f6",
  admin:       "#8b5cf6",
  superadmin:  "#ef4444",
};
const ROLE_LABELS: Record<string, string> = {
  volunteer:   "Volunteer",
  coordinator: "Coordinator",
  admin:       "Admin",
  superadmin:  "Super Admin",
};

function parseIds(raw?: string | string[] | null): string[] {
  try {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p.filter(Boolean).map(String) : [];
  } catch { return []; }
}

function timeAgo(ts: string | null | undefined): string {
  if (!ts) return "Never";
  const diff = Date.now() - new Date(ts).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ─── Hostel Picker ─────────────────────────────────────────────────────────────
function HostelPicker({ visible, onClose, onSelect, hostels, currentId, loading, theme }: {
  visible: boolean; onClose: () => void; onSelect: (h: any) => void;
  hostels: any[]; currentId?: string | null; loading: boolean; theme: any;
}) {
  const [q, setQ] = useState("");
  const list = hostels.filter(h => !q.trim() || h.name?.toLowerCase().includes(q.toLowerCase()));
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={hp.bg} onPress={onClose}>
        <Pressable style={[hp.sheet, { backgroundColor: theme.surface }]} onPress={e => e.stopPropagation()}>
          <View style={hp.handle} />
          <Text style={[hp.title, { color: theme.text }]}>Reassign Hostel</Text>
          <View style={[hp.search, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Feather name="search" size={14} color={theme.textSecondary} />
            <TextInput value={q} onChangeText={setQ} placeholder="Search…" placeholderTextColor={theme.textTertiary}
              style={[hp.searchIn, { color: theme.text }]} autoCapitalize="none" />
          </View>
          {loading
            ? <ActivityIndicator color={theme.tint} style={{ marginTop: 24 }} />
            : (
              <ScrollView style={{ maxHeight: 340 }}>
                <Pressable onPress={() => onSelect({ id: null })} style={[hp.row, { borderColor: theme.border }]}>
                  <Feather name="x-circle" size={14} color="#ef4444" />
                  <Text style={[hp.rowText, { color: "#ef4444" }]}>Unassign</Text>
                </Pressable>
                {list.map(h => (
                  <Pressable key={h.id} onPress={() => onSelect(h)}
                    style={[hp.row, {
                      borderColor: h.id === currentId ? theme.tint : theme.border,
                      backgroundColor: h.id === currentId ? theme.tint + "10" : "transparent",
                    }]}>
                    <Feather name="home" size={14} color={h.id === currentId ? theme.tint : theme.textSecondary} />
                    <Text style={[hp.rowText, { color: h.id === currentId ? theme.tint : theme.text }]}>{h.name}</Text>
                    {h.id === currentId && <Feather name="check" size={14} color={theme.tint} />}
                  </Pressable>
                ))}
              </ScrollView>
            )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Staff Detail Modal ────────────────────────────────────────────────────────
function StaffModal({ staff, visible, onClose, theme, isSuperAdmin, hostels, hostelsLoading, onReassign, reassigning }: {
  staff: any; visible: boolean; onClose: () => void; theme: any;
  isSuperAdmin: boolean; hostels: any[]; hostelsLoading: boolean;
  onReassign: (id: string, payload: { hostelId?: string | null; area?: string }) => void;
  reassigning: boolean;
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [areaDraft, setAreaDraft] = useState("");

  useEffect(() => {
    if (visible) setAreaDraft(staff?.area || "");
  }, [visible, staff?.id, staff?.area]);

  if (!staff) return null;

  const roleColor = ROLE_COLORS[staff.role] || "#6366f1";
  const phone = staff.contactNumber || staff.phone || "";

  const nameMap = new Map<string, string>();
  hostels.forEach((h: any) => { if (h?.id && h?.name) nameMap.set(String(h.id), String(h.name)); });

  const hostelDisplay = staff.hostelName || nameMap.get(String(staff.hostelId || "")) || null;

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={md.bg} onPress={onClose}>
          <Pressable style={[md.sheet, { backgroundColor: theme.surface }]} onPress={e => e.stopPropagation()}>
            <View style={md.handle} />
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={md.scroll}>

              {/* Avatar + identity */}
              <View style={[md.avatar, { backgroundColor: roleColor + "20" }]}>
                <Text style={[md.avatarLetter, { color: roleColor }]}>{(staff.name || "?")[0].toUpperCase()}</Text>
              </View>
              <Text style={[md.name, { color: theme.text }]}>{staff.name}</Text>
              <Text style={[md.email, { color: theme.textSecondary }]}>{staff.email}</Text>

              {/* Role + status chips */}
              <View style={md.chips}>
                <View style={[md.chip, { backgroundColor: roleColor + "18", borderColor: roleColor + "50" }]}>
                  <Feather name="shield" size={11} color={roleColor} />
                  <Text style={[md.chipTxt, { color: roleColor }]}>{ROLE_LABELS[staff.role] || staff.role}</Text>
                </View>
                <View style={[md.chip, {
                  backgroundColor: staff.isOnline ? "#22c55e15" : "#6b728015",
                  borderColor:     staff.isOnline ? "#22c55e50" : "#6b728050",
                }]}>
                  <View style={[md.dot, { backgroundColor: staff.isOnline ? "#22c55e" : "#6b7280" }]} />
                  <Text style={[md.chipTxt, { color: staff.isOnline ? "#22c55e" : "#6b7280" }]}>
                    {staff.isOnline ? "Online" : "Offline"}
                  </Text>
                </View>
              </View>

              {/* Info card */}
              <View style={[md.infoCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <InfoRow icon="clock"   label="Last Seen" value={timeAgo(staff.lastActiveAt)} theme={theme} />
                {!!hostelDisplay   && <InfoRow icon="home"    label="Hostel"    value={hostelDisplay}  theme={theme} />}
                {!!staff.area      && <InfoRow icon="map-pin" label="Area"      value={staff.area}     theme={theme} />}
                {!!phone           && <InfoRow icon="phone"   label="Phone"     value={phone}          theme={theme} />}
              </View>

              {/* Call */}
              {!!phone && (
                <Pressable onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); Linking.openURL(`tel:${phone}`); }}
                  style={md.callBtn}>
                  <Feather name="phone-call" size={16} color="#fff" />
                  <Text style={md.callTxt}>Call {phone}</Text>
                </Pressable>
              )}

              {/* Super-admin controls */}
              {isSuperAdmin && (
                <>
                  <Pressable
                    onPress={() => setPickerOpen(true)}
                    disabled={reassigning}
                    style={[md.actionBtn, { borderColor: "#f59e0b50", backgroundColor: "#f59e0b0f" }]}
                  >
                    {reassigning
                      ? <ActivityIndicator size="small" color="#f59e0b" />
                      : <Feather name="git-branch" size={15} color="#f59e0b" />}
                    <Text style={[md.actionTxt, { color: "#f59e0b" }]}>
                      {reassigning ? "Reassigning…" : hostelDisplay ? `Reassign Hostel (${hostelDisplay})` : "Assign Hostel"}
                    </Text>
                  </Pressable>

                  <View style={[md.areaBox, { borderColor: theme.border, backgroundColor: theme.background }]}>
                    <Text style={[md.areaLabel, { color: theme.textSecondary }]}>Area</Text>
                    <TextInput
                      value={areaDraft}
                      onChangeText={setAreaDraft}
                      placeholder="e.g. Wing A, Block C…"
                      placeholderTextColor={theme.textTertiary}
                      style={[md.areaIn, { color: theme.text, borderColor: theme.border }]}
                    />
                    <Pressable
                      onPress={() => onReassign(staff.id, { area: areaDraft.trim() })}
                      disabled={reassigning}
                      style={[md.saveBtn, { backgroundColor: theme.tint, opacity: reassigning ? 0.6 : 1 }]}
                    >
                      <Text style={md.saveTxt}>{reassigning ? "Saving…" : "Save Area"}</Text>
                    </Pressable>
                  </View>
                </>
              )}

              <Pressable onPress={onClose} style={[md.closeBtn, { borderColor: theme.border }]}>
                <Text style={[md.closeTxt, { color: theme.textSecondary }]}>Close</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <HostelPicker
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        hostels={hostels}
        currentId={staff.hostelId}
        loading={hostelsLoading}
        theme={theme}
        onSelect={h => { setPickerOpen(false); onReassign(staff.id, { hostelId: h.id }); }}
      />
    </>
  );
}

function InfoRow({ icon, label, value, theme }: { icon: any; label: string; value: string; theme: any }) {
  return (
    <View style={md.infoRow}>
      <Feather name={icon} size={13} color={theme.textTertiary} />
      <Text style={[md.infoLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[md.infoVal, { color: theme.text }]} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────
export default function StaffStatusScreen() {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const request = useApiRequest();
  const qc = useQueryClient();
  const { user, isSuperAdmin, isCoordinator, isVolunteer, isStudent } = useAuth();

  const [remarkModal, setRemarkModal] = useState(false);
  const [goingActive, setGoingActive] = useState(true);
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [onlineFilter, setOnlineFilter] = useState<"all"|"online"|"offline">("all");
  const [roleFilter, setRoleFilter] = useState<"all"|"admins"|"volunteers">("all");
  const [reassigning, setReassigning] = useState(false);

  const { data: liveMe } = useQuery<any>({
    queryKey: ["staff-status-me"],
    queryFn: () => request("/auth/me"),
    enabled: isVolunteer && !isSuperAdmin,
    refetchInterval: LIVE_MS,
    staleTime: 4000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const effectiveUser = liveMe && typeof liveMe === "object" ? liveMe : user;

  const { data: myStatus, refetch: refetchStatus } = useQuery<{ isActive: boolean; lastActiveAt: string | null }>({
    queryKey: ["my-status"],
    queryFn: () => request("/staff/me-status"),
    enabled: !isSuperAdmin,
    refetchInterval: LIVE_MS,
    staleTime: 1000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: allStaff = [], isLoading, refetch: refetchAll } = useQuery<any[]>({
    queryKey: ["staff-all"],
    queryFn: () => request("/staff/all"),
    enabled: isVolunteer,
    refetchInterval: LIVE_MS,
    staleTime: 3000,
    placeholderData: keepPreviousData,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: adminUsers = [], refetch: refetchAdmins } = useQuery<any[]>({
    queryKey: ["admin-users"],
    queryFn: () => request("/admin/admin-users"),
    enabled: isSuperAdmin,
    refetchInterval: LIVE_MS,
    staleTime: 3000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
  });

  const { data: hostels = [], isLoading: hostelsLoading } = useQuery<any[]>({
    queryKey: ["hostels"],
    queryFn: () => request("/hostels"),
    enabled: !isStudent,
    staleTime: 60000,
  });

  const assignedHostelIds: string[] = React.useMemo(() => {
    try {
      const raw: any = effectiveUser?.assignedHostelIds;
      if (!raw) return [];
      if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.filter(Boolean).map(String) : [];
    } catch { return []; }
  }, [effectiveUser?.assignedHostelIds]);

  const scopedHostelIds = React.useMemo(() => {
    if (isSuperAdmin) return null;
    return Array.from(new Set([...assignedHostelIds, effectiveUser?.hostelId || ""].filter(Boolean)));
  }, [isSuperAdmin, assignedHostelIds, effectiveUser?.hostelId]);

  const merged = React.useMemo(() => {
    if (!isSuperAdmin) return allStaff as any[];
    const map = new Map<string, any>();
    (allStaff as any[]).forEach(s => map.set(s.id, { ...s }));
    (adminUsers as any[]).forEach(a => {
      const ex = map.get(a.id) || {};
      map.set(a.id, {
        ...a, ...ex,
        id: a.id,
        name: ex.name ?? a.name,
        email: ex.email ?? a.email,
        role: ex.role ?? a.role,
        hostelId: ex.hostelId ?? a.hostelId,
        hostelName: ex.hostelName ?? a.hostelName,
        assignedHostelIds: ex.assignedHostelIds ?? a.assignedHostelIds,
        area: ex.area ?? a.area,
        phone: ex.phone ?? a.phone,
        contactNumber: ex.contactNumber ?? a.contactNumber,
        lastActiveAt: ex.lastActiveAt ?? a.lastActiveAt ?? null,
        isOnline: ex.isOnline ?? (a.lastActiveAt ? Date.now() - new Date(a.lastActiveAt).getTime() < 10 * 60 * 1000 : false),
      });
    });
    return Array.from(map.values());
  }, [allStaff, adminUsers, isSuperAdmin]);

  const scopedStaff = React.useMemo(() => {
    if (!scopedHostelIds) return merged;
    return merged.filter(s => {
      const ids = parseIds(s.assignedHostelIds);
      const scope = new Set([...ids, String(s.hostelId || "")].filter(Boolean));
      return scopedHostelIds.some(id => scope.has(id));
    });
  }, [merged, scopedHostelIds]);

  const hostelNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    (hostels as any[]).forEach(h => { if (h?.id && h?.name) m.set(String(h.id), String(h.name)); });
    return m;
  }, [hostels]);

  const resolveHostel = React.useCallback((s: any) => {
    if (s.hostelName) return s.hostelName;
    if (s.hostelId && hostelNameById.get(String(s.hostelId))) return hostelNameById.get(String(s.hostelId));
    return null;
  }, [hostelNameById]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return scopedStaff.filter(s => {
      if (onlineFilter === "online"  && !s.isOnline) return false;
      if (onlineFilter === "offline" && s.isOnline)  return false;
      if (roleFilter === "admins"     && !["admin","coordinator","superadmin"].includes(s.role)) return false;
      if (roleFilter === "volunteers" && s.role !== "volunteer") return false;
      if (!q) return true;
      const hay = [s.name, s.email, resolveHostel(s), s.role].filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [scopedStaff, search, onlineFilter, roleFilter, resolveHostel]);

  const onlineCount   = scopedStaff.filter(s => s.isOnline).length;
  const offlineCount  = scopedStaff.filter(s => !s.isOnline).length;
  const adminCount    = scopedStaff.filter(s => ["admin","coordinator","superadmin"].includes(s.role)).length;
  const volunteerCount = scopedStaff.filter(s => s.role === "volunteer").length;

  const isActive = myStatus?.isActive ?? false;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isSuperAdmin) await Promise.all([refetchAll(), refetchAdmins()]);
    else await Promise.all([refetchStatus(), refetchAll()]);
    setRefreshing(false);
  }, [refetchStatus, refetchAll, refetchAdmins, isSuperAdmin]);

  const confirmToggle = (active: boolean) => {
    setGoingActive(active);
    setRemark("");
    setRemarkModal(true);
    Haptics.selectionAsync();
  };

  const submitStatus = async () => {
    setSubmitting(true);
    try {
      await request(goingActive ? "/staff/go-active" : "/staff/go-inactive", {
        method: "POST", body: JSON.stringify({ remark }),
      });
      qc.invalidateQueries({ queryKey: ["my-status"] });
      qc.invalidateQueries({ queryKey: ["staff-all"] });
      await Promise.all([refetchStatus(), refetchAll()]);
      setRemarkModal(false);
    } catch { }
    setSubmitting(false);
  };

  const handleReassign = async (staffId: string, payload: { hostelId?: string | null; area?: string }) => {
    setReassigning(true);
    try {
      await request(`/admin/assign-hostel/${staffId}`, { method: "PATCH", body: JSON.stringify(payload) });
      qc.invalidateQueries({ queryKey: ["staff-all"] });
      if (isSuperAdmin) { qc.invalidateQueries({ queryKey: ["admin-users"] }); await refetchAdmins(); }
      await refetchAll();
      setSelected((prev: any) => prev ? { ...prev, ...payload } : null);
    } catch { }
    setReassigning(false);
  };

  const STAT_PILLS = [
    { label: "Online",     value: onlineCount,    color: "#22c55e" },
    { label: "Offline",    value: offlineCount,   color: "#6b7280" },
    { label: "Admins",     value: adminCount,     color: "#8b5cf6" },
    { label: "Volunteers", value: volunteerCount, color: "#3b82f6" },
  ];

  return (
    <SafeAreaView edges={["top"]} style={[S.root, { backgroundColor: theme.background }]}>
      {/* ── Header ── */}
      <View style={[S.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={S.backBtn} hitSlop={8}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[S.title, { color: theme.text }]}>Staff Status</Text>
          <View style={S.liveRow}>
            <View style={S.liveDot} />
            <Text style={[S.liveTxt, { color: theme.textSecondary }]}>Live · updates every 5s</Text>
          </View>
        </View>
        <Pressable onPress={onRefresh} style={S.refreshBtn} hitSlop={8}>
          <Feather name="refresh-cw" size={18} color={theme.textSecondary} />
        </Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={item => item.id}
        contentContainerStyle={{ padding: 14, paddingBottom: Platform.OS === "web" ? 80 : 100, gap: 10 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={() => (
          <>
            {/* ── My Shift Card ── */}
            {!isSuperAdmin && (
              <View style={[S.shiftCard, {
                backgroundColor: isActive ? "#22c55e0c" : "#f59e0b0c",
                borderColor: isActive ? "#22c55e45" : "#f59e0b45",
              }]}>
                <View style={S.shiftTop}>
                  <View>
                    <Text style={[S.shiftLabel, { color: theme.textSecondary }]}>MY SHIFT</Text>
                    <View style={S.shiftStatusRow}>
                      <View style={[S.shiftDot, { backgroundColor: isActive ? "#22c55e" : "#f59e0b" }]} />
                      <Text style={[S.shiftStatus, { color: isActive ? "#22c55e" : "#f59e0b" }]}>
                        {isActive ? "Active" : "Inactive"}
                      </Text>
                    </View>
                    {!!myStatus?.lastActiveAt && (
                      <Text style={[S.shiftSub, { color: theme.textTertiary }]}>
                        {isActive ? "Since " : "Last active "}{timeAgo(myStatus.lastActiveAt)}
                      </Text>
                    )}
                  </View>
                  {isActive ? (
                    <Pressable onPress={() => confirmToggle(false)}
                      style={[S.shiftBtn, { backgroundColor: "#ef444412", borderColor: "#ef444450" }]}>
                      <Feather name="moon" size={14} color="#ef4444" />
                      <Text style={[S.shiftBtnTxt, { color: "#ef4444" }]}>Go Inactive</Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => confirmToggle(true)}
                      style={[S.shiftBtn, { backgroundColor: "#22c55e12", borderColor: "#22c55e50" }]}>
                      <Feather name="sun" size={14} color="#22c55e" />
                      <Text style={[S.shiftBtnTxt, { color: "#22c55e" }]}>Go Active</Text>
                    </Pressable>
                  )}
                </View>
                {!isActive && (
                  <View style={[S.shiftNote, { borderTopColor: theme.border }]}>
                    <Feather name="info" size={11} color={theme.textTertiary} />
                    <Text style={[S.shiftNoteTxt, { color: theme.textTertiary }]}>
                      Auto-inactive after 10 min without heartbeat
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* ── Stat pills ── */}
            <View style={S.statRow}>
              {STAT_PILLS.map(p => (
                <View key={p.label} style={[S.statPill, { backgroundColor: p.color + "12", borderColor: p.color + "40" }]}>
                  <Text style={[S.statNum, { color: p.color }]}>{p.value}</Text>
                  <Text style={[S.statLbl, { color: theme.textSecondary }]}>{p.label}</Text>
                </View>
              ))}
            </View>

            {/* ── Search ── */}
            <View style={[S.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
              <Feather name="search" size={14} color={theme.textSecondary} />
              <TextInput
                value={search} onChangeText={setSearch}
                placeholder="Search name, email, hostel, role…"
                placeholderTextColor={theme.textTertiary}
                style={[S.searchIn, { color: theme.text }]}
                autoCapitalize="none"
              />
              {search.length > 0 && (
                <Pressable onPress={() => setSearch("")} hitSlop={8}>
                  <Feather name="x" size={14} color={theme.textSecondary} />
                </Pressable>
              )}
            </View>

            {/* ── Role filter ── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 7, marginBottom: 8 }}>
              {([
                { key: "all", label: "All", count: scopedStaff.length, color: theme.tint },
                { key: "admins", label: "Admins", count: adminCount, color: "#8b5cf6" },
                { key: "volunteers", label: "Volunteers", count: volunteerCount, color: "#22c55e" },
              ] as const).map(f => {
                const active = roleFilter === f.key;
                return (
                  <Pressable key={f.key} onPress={() => { setRoleFilter(f.key); Haptics.selectionAsync(); }}
                    style={[S.chip, { backgroundColor: active ? f.color + "18" : theme.surface, borderColor: active ? f.color : theme.border }]}>
                    <Text style={[S.chipTxt, { color: active ? f.color : theme.textSecondary }]}>{f.label}</Text>
                    <View style={[S.chipBadge, { backgroundColor: active ? f.color + "25" : theme.border }]}>
                      <Text style={[S.chipCount, { color: active ? f.color : theme.textTertiary }]}>{f.count}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* ── Online filter ── */}
            <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
              {([
                { key: "all",     label: "All",     count: scopedStaff.length, color: theme.tint },
                { key: "online",  label: "Online",  count: onlineCount,        color: "#22c55e" },
                { key: "offline", label: "Offline", count: offlineCount,       color: "#6b7280" },
              ] as const).map(f => {
                const active = onlineFilter === f.key;
                return (
                  <Pressable key={f.key} onPress={() => setOnlineFilter(f.key)}
                    style={[S.toggleChip, { flex: 1, backgroundColor: active ? f.color + "18" : theme.surface, borderColor: active ? f.color : theme.border }]}>
                    {f.key !== "all" && <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: f.color }} />}
                    <Text style={[S.toggleTxt, { color: active ? f.color : theme.textSecondary }]}>{f.label}</Text>
                    <View style={[S.chipBadge, { backgroundColor: active ? f.color + "25" : theme.border }]}>
                      <Text style={[S.chipCount, { color: active ? f.color : theme.textTertiary }]}>{f.count}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>
          </>
        )}
        ListEmptyComponent={() =>
          isLoading
            ? <ActivityIndicator color={theme.tint} style={{ marginTop: 40 }} />
            : (
              <View style={S.empty}>
                <Feather name="users" size={40} color={theme.textTertiary} />
                <Text style={[S.emptyTxt, { color: theme.textSecondary }]}>No staff found</Text>
              </View>
            )
        }
        ItemSeparatorComponent={() => <View style={{ height: 0 }} />}
        renderItem={({ item }) => {
          const rc = ROLE_COLORS[item.role] || "#6366f1";
          const hostel = resolveHostel(item);
          return (
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setSelected(item); }}
              style={({ pressed }) => [S.card, {
                backgroundColor: theme.surface,
                borderColor: item.isOnline ? "#22c55e35" : theme.border,
                borderLeftColor: rc,
                opacity: pressed ? 0.85 : 1,
              }]}
            >
              {/* Avatar */}
              <View style={[S.avatar, { backgroundColor: rc + "20" }]}>
                <Text style={[S.avatarTxt, { color: rc }]}>{(item.name || "?")[0].toUpperCase()}</Text>
              </View>

              {/* Info */}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[S.cardName, { color: theme.text }]} numberOfLines={1}>{item.name}</Text>
                <Text style={[S.cardEmail, { color: theme.textSecondary }]} numberOfLines={1}>{item.email}</Text>
                {!!hostel && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
                    <Feather name="home" size={10} color={theme.textTertiary} />
                    <Text style={[S.cardMeta, { color: theme.textTertiary }]} numberOfLines={1}>{hostel}</Text>
                  </View>
                )}
                <View style={[S.rolePill, { backgroundColor: rc + "15", alignSelf: "flex-start", marginTop: 4 }]}>
                  <Text style={[S.roleTxt, { color: rc }]}>{ROLE_LABELS[item.role] || item.role}</Text>
                </View>
              </View>

              {/* Status */}
              <View style={{ alignItems: "flex-end", gap: 5, minWidth: 64 }}>
                <View style={[S.onlinePill, { backgroundColor: item.isOnline ? "#22c55e18" : "#6b728018" }]}>
                  <View style={[S.onlineDot, { backgroundColor: item.isOnline ? "#22c55e" : "#6b7280" }]} />
                  <Text style={[S.onlineTxt, { color: item.isOnline ? "#22c55e" : "#6b7280" }]}>
                    {item.isOnline ? "Online" : "Offline"}
                  </Text>
                </View>
                <Text style={[S.lastSeen, { color: theme.textTertiary }]}>{timeAgo(item.lastActiveAt)}</Text>
                {!!(item.contactNumber || item.phone) && (
                  <Feather name="phone" size={11} color={theme.tint} />
                )}
              </View>
            </Pressable>
          );
        }}
      />

      {/* ── Staff Detail Modal ── */}
      <StaffModal
        staff={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
        theme={theme}
        isSuperAdmin={isSuperAdmin}
        hostels={hostels as any[]}
        hostelsLoading={hostelsLoading}
        onReassign={handleReassign}
        reassigning={reassigning}
      />

      {/* ── Shift Remark Modal ── */}
      <Modal visible={remarkModal} transparent animationType="slide" onRequestClose={() => setRemarkModal(false)}>
        <Pressable style={rm.bg} onPress={() => setRemarkModal(false)}>
          <Pressable style={[rm.sheet, { backgroundColor: theme.surface }]} onPress={e => e.stopPropagation()}>
            <View style={rm.handle} />
            <Text style={[rm.title, { color: theme.text }]}>{goingActive ? "Going Active" : "Going Inactive"}</Text>
            <Text style={[rm.sub, { color: theme.textSecondary }]}>Add an optional remark (visible to super admin)</Text>
            <TextInput
              placeholder={goingActive ? "e.g. Starting hostel rounds…" : "e.g. Lunch break, back at 2pm…"}
              placeholderTextColor={theme.textTertiary}
              style={[rm.input, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              value={remark} onChangeText={setRemark}
              multiline
            />
            <Pressable
              onPress={submitStatus}
              disabled={submitting}
              style={[rm.confirm, { backgroundColor: goingActive ? "#22c55e" : "#ef4444" }]}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Feather name={goingActive ? "sun" : "moon"} size={16} color="#fff" />
                    <Text style={rm.confirmTxt}>{goingActive ? "Confirm Active" : "Confirm Inactive"}</Text>
                  </>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 12 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 1 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  liveTxt: { fontSize: 11, fontFamily: "Inter_400Regular" },
  refreshBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },

  shiftCard: { borderRadius: 14, borderWidth: 1.5, padding: 16, marginBottom: 14 },
  shiftTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  shiftLabel: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 1, marginBottom: 4 },
  shiftStatusRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  shiftDot: { width: 9, height: 9, borderRadius: 5 },
  shiftStatus: { fontSize: 20, fontFamily: "Inter_700Bold" },
  shiftSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  shiftBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5 },
  shiftBtnTxt: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  shiftNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  shiftNoteTxt: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },

  statRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  statPill: { flex: 1, borderWidth: 1, borderRadius: 12, alignItems: "center", paddingVertical: 10, gap: 2 },
  statNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  statLbl: { fontSize: 10, fontFamily: "Inter_500Medium" },

  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchIn: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },

  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  chipTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  chipBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  chipCount: { fontSize: 11, fontFamily: "Inter_700Bold" },
  toggleChip: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 8, borderRadius: 10, borderWidth: 1 },
  toggleTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },

  card: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1, borderLeftWidth: 4, marginBottom: 8 },
  avatar: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  avatarTxt: { fontSize: 19, fontFamily: "Inter_700Bold" },
  cardName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  cardEmail: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  cardMeta: { fontSize: 11, fontFamily: "Inter_400Regular" },
  rolePill: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  roleTxt: { fontSize: 10, fontFamily: "Inter_700Bold", letterSpacing: 0.3 },
  onlinePill: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  onlineDot: { width: 6, height: 6, borderRadius: 3 },
  onlineTxt: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  lastSeen: { fontSize: 10, fontFamily: "Inter_400Regular" },

  empty: { alignItems: "center", paddingTop: 60, gap: 10 },
  emptyTxt: { fontSize: 14, fontFamily: "Inter_400Regular" },
});

const md = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, maxHeight: "92%" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 14 },
  scroll: { paddingHorizontal: 22, paddingBottom: 36, gap: 8, alignItems: "center" },
  avatar: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  avatarLetter: { fontSize: 30, fontFamily: "Inter_700Bold" },
  name: { fontSize: 19, fontFamily: "Inter_700Bold", textAlign: "center" },
  email: { fontSize: 13, fontFamily: "Inter_400Regular", textAlign: "center", marginBottom: 6 },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap", justifyContent: "center", marginBottom: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  chipTxt: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  infoCard: { width: "100%", borderRadius: 14, borderWidth: 1, padding: 12, gap: 2, marginBottom: 8 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 7 },
  infoLabel: { fontSize: 12, fontFamily: "Inter_400Regular", width: 72 },
  infoVal: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  callBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 14, marginBottom: 4 },
  callTxt: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  actionBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 13 },
  actionTxt: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  areaBox: { width: "100%", borderWidth: 1, borderRadius: 12, padding: 12, gap: 8 },
  areaLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  areaIn: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, fontFamily: "Inter_400Regular" },
  saveBtn: { alignSelf: "flex-end", borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8 },
  saveTxt: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  closeBtn: { width: "100%", borderWidth: 1, borderRadius: 14, paddingVertical: 13, alignItems: "center" },
  closeTxt: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

const hp = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 14 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  searchIn: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1 },
  rowText: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
});

const rm = StyleSheet.create({
  bg: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 12 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 8 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  sub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 80, textAlignVertical: "top" },
  confirm: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  confirmTxt: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});
