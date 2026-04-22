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

const LIVE_REFRESH_MS = 8000;

const ROLE_COLORS: Record<string, string> = {
  volunteer: "#22c55e",
  coordinator: "#3b82f6",
  admin: "#8b5cf6",
  superadmin: "#ef4444",
};
const ROLE_LABELS: Record<string, string> = {
  volunteer: "Volunteer",
  coordinator: "Coordinator",
  admin: "Admin",
  superadmin: "Super Admin",
};

const isAdminRole = (role: string) => ["admin", "coordinator", "superadmin"].includes(role);

function parseAssignedHostelIds(raw?: string | string[] | null): string[] {
  try {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
  } catch {
    return [];
  }
}

function timeAgo(ts: string | null | undefined): string {
  if (!ts) return "Never";
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Hostel Picker Modal ───────────────────────────────────────────────────────
function HostelPickerModal({
  visible, onClose, onSelect, hostels, currentHostelId, loading, theme,
}: {
  visible: boolean; onClose: () => void; onSelect: (h: any) => void;
  hostels: any[]; currentHostelId?: string | null; loading: boolean; theme: any;
}) {
  const [q, setQ] = useState("");
  const filtered = hostels.filter(h =>
    !q.trim() || h.name?.toLowerCase().includes(q.toLowerCase())
  );
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={hp.overlay} onPress={onClose}>
        <Pressable style={[hp.sheet, { backgroundColor: theme.surface }]} onPress={e => e.stopPropagation()}>
          <View style={hp.handle} />
          <Text style={[hp.title, { color: theme.text }]}>Select Hostel</Text>
          <View style={[hp.searchBox, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <Feather name="search" size={14} color={theme.textSecondary} />
            <TextInput
              value={q} onChangeText={setQ}
              placeholder="Search hostel…"
              placeholderTextColor={theme.textTertiary}
              style={[hp.searchInput, { color: theme.text }]}
              autoCapitalize="none"
            />
          </View>
          {loading
            ? <ActivityIndicator color={theme.tint} style={{ marginTop: 24 }} />
            : (
              <ScrollView style={{ maxHeight: 320 }}>
                <Pressable
                  onPress={() => onSelect({ id: null, name: "None (unassign)" })}
                  style={[hp.hostelRow, { borderColor: theme.border }]}
                >
                  <Feather name="x-circle" size={14} color="#ef4444" />
                  <Text style={[hp.hostelName, { color: "#ef4444" }]}>None (unassign)</Text>
                </Pressable>
                {filtered.map(h => (
                  <Pressable
                    key={h.id}
                    onPress={() => onSelect(h)}
                    style={[hp.hostelRow, {
                      borderColor: h.id === currentHostelId ? theme.tint : theme.border,
                      backgroundColor: h.id === currentHostelId ? theme.tint + "10" : "transparent",
                    }]}
                  >
                    <Feather name="home" size={14} color={h.id === currentHostelId ? theme.tint : theme.textSecondary} />
                    <Text style={[hp.hostelName, { color: h.id === currentHostelId ? theme.tint : theme.text }]}>{h.name}</Text>
                    {h.id === currentHostelId && <Feather name="check" size={14} color={theme.tint} />}
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
function StaffDetailModal({
  staff, visible, onClose, theme, isSuperAdmin, hostels, hostelsLoading, onReassign, reassigning,
}: {
  staff: any; visible: boolean; onClose: () => void; theme: any;
  isSuperAdmin: boolean; hostels: any[]; hostelsLoading: boolean;
  onReassign: (staffId: string, payload: { hostelId?: string | null; area?: string }) => void;
  reassigning: boolean;
}) {
  const [showHostelPicker, setShowHostelPicker] = useState(false);
  const [areaDraft, setAreaDraft] = useState("");
  useEffect(() => {
    if (visible) setAreaDraft(staff?.area || "");
  }, [visible, staff?.id, staff?.area]);
  const roleColor = ROLE_COLORS[staff?.role] || "#6366f1";
  const phone = staff?.contactNumber || staff?.phone || "";
  const hostelNameById = new Map<string, string>();
  hostels.forEach((h: any) => {
    if (h?.id && h?.name) hostelNameById.set(String(h.id), String(h.name));
  });
  const currentHostelLabel = staff?.hostelName || staff?.hostelId || "";
  const assignedScope = Array.from(
    new Set([
      ...parseAssignedHostelIds(staff?.assignedHostelIds),
      String(staff?.hostelId || ""),
    ].filter(Boolean)),
  );
  const assignedHostelLabel = assignedScope
    .map((id) => {
      if (id === staff?.hostelId && staff?.hostelName) return staff.hostelName;
      return hostelNameById.get(id) || id;
    })
    .join(", ");

  if (!staff) return null;

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
        <Pressable style={sd.overlay} onPress={onClose}>
          <Pressable style={[sd.sheet, { backgroundColor: theme.surface }]} onPress={e => e.stopPropagation()}>
            <View style={sd.handle} />
            <ScrollView style={sd.scrollArea} contentContainerStyle={sd.scrollContent} showsVerticalScrollIndicator={false}>
              {/* Avatar */}
              <View style={[sd.avatar, { backgroundColor: roleColor + "20" }]}>
                <Text style={[sd.avatarText, { color: roleColor }]}>
                  {(staff.name || "?")[0].toUpperCase()}
                </Text>
              </View>
              <Text style={[sd.staffName, { color: theme.text }]}>{staff.name}</Text>
              <Text style={[sd.staffEmail, { color: theme.textSecondary }]}>{staff.email}</Text>

              {/* Role + Status chips */}
              <View style={sd.chips}>
                <View style={[sd.chip, { backgroundColor: roleColor + "15", borderColor: roleColor + "40" }]}>
                  <Text style={[sd.chipText, { color: roleColor }]}>{ROLE_LABELS[staff.role] || staff.role}</Text>
                </View>
                <View style={[sd.chip, {
                  backgroundColor: staff.isOnline ? "#22c55e15" : "#6b728015",
                  borderColor: staff.isOnline ? "#22c55e40" : "#6b728040",
                }]}>
                  <View style={[sd.dot, { backgroundColor: staff.isOnline ? "#22c55e" : "#6b7280" }]} />
                  <Text style={[sd.chipText, { color: staff.isOnline ? "#22c55e" : "#6b7280" }]}>
                    {staff.isOnline ? "Online" : "Offline"}
                  </Text>
                </View>
              </View>

              {/* Info list */}
              <View style={[sd.infoCard, { backgroundColor: theme.background, borderColor: theme.border }]}>
                <InfoRow icon="clock" label="Last Seen" value={timeAgo(staff.lastActiveAt)} theme={theme} />
                {!!assignedHostelLabel && (
                  <InfoRow
                    icon="layers"
                    label={assignedScope.length > 1 ? "Assigned" : "Assigned Hostel"}
                    value={assignedHostelLabel}
                    theme={theme}
                  />
                )}
                {!!currentHostelLabel && currentHostelLabel !== assignedHostelLabel && (
                  <InfoRow icon="home" label="Current Hostel" value={currentHostelLabel} theme={theme} />
                )}
                {!!staff.area && <InfoRow icon="map-pin" label="Area" value={staff.area} theme={theme} />}
                {!!phone && <InfoRow icon="phone" label="Phone" value={phone} theme={theme} />}
              </View>

              {/* Call button */}
              {!!phone && (
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    Linking.openURL(`tel:${phone}`);
                  }}
                  style={sd.callBtn}
                >
                  <Feather name="phone-call" size={16} color="#fff" />
                  <Text style={sd.callBtnText}>Call {phone}</Text>
                </Pressable>
              )}

              {/* Superadmin: Reassign Hostel */}
              {isSuperAdmin && (
                <>
                  <Pressable
                    onPress={() => setShowHostelPicker(true)}
                    disabled={reassigning}
                    style={[sd.reassignBtn, { borderColor: "#f59e0b40", backgroundColor: "#f59e0b10" }]}
                  >
                    {reassigning
                      ? <ActivityIndicator size="small" color="#f59e0b" />
                      : <Feather name="git-branch" size={15} color="#f59e0b" />}
                    <Text style={[sd.reassignBtnText, { color: "#f59e0b" }]}> 
                      {reassigning ? "Reassigning…" : "Reassign Hostel"}
                    </Text>
                  </Pressable>

                  <View style={[sd.areaEditor, { borderColor: theme.border, backgroundColor: theme.background }]}> 
                    <Text style={[sd.areaLabel, { color: theme.textSecondary }]}>Area (Super Admin editable)</Text>
                    <TextInput
                      value={areaDraft}
                      onChangeText={setAreaDraft}
                      placeholder="Enter area"
                      placeholderTextColor={theme.textTertiary}
                      style={[sd.areaInput, { color: theme.text, borderColor: theme.border }]}
                    />
                    <Pressable
                      onPress={() => onReassign(staff.id, { area: areaDraft.trim() })}
                      disabled={reassigning}
                      style={[sd.areaSaveBtn, { backgroundColor: theme.tint, opacity: reassigning ? 0.6 : 1 }]}
                    >
                      <Text style={sd.areaSaveText}>{reassigning ? "Saving…" : "Save Area"}</Text>
                    </Pressable>
                  </View>
                </>
              )}

              <Pressable
                onPress={onClose}
                style={[sd.closeBtn, { backgroundColor: theme.background, borderColor: theme.border }]}
              >
                <Text style={[sd.closeBtnText, { color: theme.textSecondary }]}>Close</Text>
              </Pressable>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Hostel Picker */}
      <HostelPickerModal
        visible={showHostelPicker}
        onClose={() => setShowHostelPicker(false)}
        hostels={hostels}
        currentHostelId={staff.hostelId}
        loading={hostelsLoading}
        theme={theme}
        onSelect={(h) => {
          setShowHostelPicker(false);
          onReassign(staff.id, { hostelId: h.id });
        }}
      />
    </>
  );
}

function InfoRow({ icon, label, value, theme }: { icon: any; label: string; value: string; theme: any }) {
  return (
    <View style={sd.infoRow}>
      <Feather name={icon} size={13} color={theme.textTertiary} />
      <Text style={[sd.infoLabel, { color: theme.textSecondary }]}>{label}</Text>
      <Text style={[sd.infoVal, { color: theme.text }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// ─── Main Screen ────────────────────────────────────────────────────────────────
export default function StaffStatusScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const request = useApiRequest();
  const qc = useQueryClient();
  const { user, isSuperAdmin, isCoordinator, isVolunteer } = useAuth();

  const { data: liveMe } = useQuery<any>({
    queryKey: ["staff-status-me"],
    queryFn: () => request("/auth/me"),
    enabled: isVolunteer && !isSuperAdmin,
    refetchInterval: LIVE_REFRESH_MS,
    staleTime: 4000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });

  const effectiveUser = liveMe && typeof liveMe === "object" ? liveMe : user;

  const [remarkModal, setRemarkModal] = useState(false);
  const [goingActive, setGoingActive] = useState(true);
  const [remark, setRemark] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState<any>(null);
  const [staffSearch, setStaffSearch] = useState("");
  const [staffFilter, setStaffFilter] = useState<"all" | "online" | "offline">("all");
  const [roleFilter, setRoleFilter] = useState<"all" | "admins" | "volunteers">("all");
  const [reassigning, setReassigning] = useState(false);

  const { data: myStatus, refetch: refetchStatus } = useQuery<{ isActive: boolean; lastActiveAt: string | null }>({
    queryKey: ["my-status"],
    queryFn: () => request("/staff/me-status"),
    enabled: !isSuperAdmin,
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: "always",
    staleTime: 1000,
  });

  const { data: allStaff = [], isLoading, refetch: refetchAll } = useQuery<any[]>({
    queryKey: ["staff-all"],
    queryFn: () => request("/staff/all"),
    enabled: isVolunteer,
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: true,
    staleTime: 3000,
    gcTime: 10 * 60 * 1000,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: "always",
  });

  const { data: adminUsers = [], refetch: refetchAdminUsers } = useQuery<any[]>({
    queryKey: ["admin-users"],
    queryFn: () => request("/admin/admin-users"),
    enabled: isSuperAdmin,
    refetchInterval: LIVE_REFRESH_MS,
    refetchIntervalInBackground: true,
    staleTime: 3000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    refetchOnMount: "always",
  });

  const { data: hostels = [], isLoading: hostelsLoading } = useQuery<any[]>({
    queryKey: ["hostels"],
    queryFn: () => request("/hostels"),
    enabled: isVolunteer,
    staleTime: 60000,
  });

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    if (isSuperAdmin) {
      await Promise.all([refetchAll(), refetchAdminUsers()]);
    } else {
      await Promise.all([refetchStatus(), refetchAll()]);
    }
    setRefreshing(false);
  }, [refetchStatus, refetchAll, refetchAdminUsers, isSuperAdmin]);

  const confirmToggle = (goActive: boolean) => {
    setGoingActive(goActive);
    setRemark("");
    setRemarkModal(true);
    Haptics.selectionAsync();
  };

  const submitStatus = async () => {
    setSubmitting(true);
    try {
      const endpoint = goingActive ? "/staff/go-active" : "/staff/go-inactive";
      await request(endpoint, { method: "POST", body: JSON.stringify({ remark }) });
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
      await request(`/admin/assign-hostel/${staffId}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      qc.invalidateQueries({ queryKey: ["staff-all"] });
      if (isSuperAdmin) {
        qc.invalidateQueries({ queryKey: ["admin-users"] });
        await Promise.all([refetchAll(), refetchAdminUsers()]);
      } else {
        await refetchAll();
      }
      setSelectedStaff((prev: any) => prev ? { ...prev, ...payload } : null);
    } catch { }
    setReassigning(false);
  };

  const isActive = myStatus?.isActive ?? false;

  const assignedHostelIds: string[] = React.useMemo(() => {
    try {
      const raw: any = effectiveUser?.assignedHostelIds;
      if (!raw) return [];
      if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
      if (typeof raw === "string") {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed.filter(Boolean).map(String) : [];
      }
      return [];
    } catch { return []; }
  }, [effectiveUser?.assignedHostelIds]);

  const scopedHostelIds = React.useMemo(() => {
    if (isSuperAdmin) return null;
    return Array.from(new Set([...(assignedHostelIds || []), effectiveUser?.hostelId || ""].filter(Boolean)));
  }, [isSuperAdmin, assignedHostelIds, effectiveUser?.hostelId]);

  const mergedStaff = React.useMemo(() => {
    if (!isSuperAdmin) return allStaff;
    const map = new Map<string, any>();
    allStaff.forEach((s: any) => map.set(s.id, { ...s }));
    adminUsers.forEach((a: any) => {
      const existing = map.get(a.id) || {};
      map.set(a.id, {
        ...a,
        ...existing,
        id: a.id,
        name: a.name ?? existing.name,
        email: a.email ?? existing.email,
        role: a.role ?? existing.role,
        hostelId: existing.hostelId ?? a.hostelId,
        hostelName: existing.hostelName ?? a.hostelName,
        assignedHostelIds: existing.assignedHostelIds ?? a.assignedHostelIds,
        area: existing.area ?? a.area,
        phone: existing.phone ?? a.phone,
        contactNumber: existing.contactNumber ?? a.contactNumber,
        lastActiveAt: existing.lastActiveAt ?? a.lastActiveAt ?? null,
        isOnline: existing.isOnline ?? (a.lastActiveAt ? Date.now() - new Date(a.lastActiveAt).getTime() < 10 * 60 * 1000 : false),
      });
    });
    return Array.from(map.values());
  }, [allStaff, adminUsers, isSuperAdmin]);

  const allFilteredStaff = React.useMemo(() => {
    const base = mergedStaff;
    if (!scopedHostelIds) return base;
    if (scopedHostelIds.length === 0) return [];
    return base.filter((s: any) => {
      const assigned = parseAssignedHostelIds(s.assignedHostelIds);
      const staffScope = new Set([...(assigned || []), String(s.hostelId || "")].filter(Boolean));
      return scopedHostelIds.some((id) => staffScope.has(id));
    });
  }, [mergedStaff, scopedHostelIds]);

  const onlineCount = allFilteredStaff.filter((s: any) => s.isOnline).length;
  const totalStaff = allFilteredStaff.length;
  const adminCount = allFilteredStaff.filter((s: any) => isAdminRole(s.role)).length;
  const volunteerCount = allFilteredStaff.filter((s: any) => s.role === "volunteer").length;

  const filteredStaff = React.useMemo(() => {
    const q = staffSearch.trim().toLowerCase();
    return allFilteredStaff.filter((s: any) => {
      if (staffFilter === "online" && !s.isOnline) return false;
      if (staffFilter === "offline" && s.isOnline) return false;
      if (roleFilter === "admins" && !isAdminRole(s.role)) return false;
      if (roleFilter === "volunteers" && s.role !== "volunteer") return false;
      if (!q) return true;
      const assignedText = parseAssignedHostelIds(s.assignedHostelIds).join(" ");
      const hay = [s.name, s.email, s.hostelName, s.hostelId, assignedText, s.role]
        .filter(Boolean).join(" ").toLowerCase();
      return hay.includes(q);
    });
  }, [allFilteredStaff, staffSearch, staffFilter, roleFilter]);

  const hostelNameById = React.useMemo(() => {
    const m = new Map<string, string>();
    hostels.forEach((h: any) => {
      if (h?.id && h?.name) m.set(String(h.id), String(h.name));
    });
    return m;
  }, [hostels]);

  const staffHostelLabel = React.useCallback((s: any) => {
    const assigned = Array.from(
      new Set([
        ...parseAssignedHostelIds(s?.assignedHostelIds),
        String(s?.hostelId || ""),
      ].filter(Boolean)),
    );
    if (!assigned.length) return "";
    return assigned
      .map((id) => {
        if (id === s?.hostelId && s?.hostelName) return s.hostelName;
        return hostelNameById.get(id) || id;
      })
      .join(", ");
  }, [hostelNameById]);

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: theme.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={theme.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text }]}>Staff Status</Text>
          <View style={styles.liveRow}>
            <View style={styles.liveDot} />
            <Text style={[styles.liveLabel, { color: theme.textSecondary }]}>Live · {LIVE_REFRESH_MS / 1000}s refresh</Text>
          </View>
        </View>
        <Pressable
          onPress={() => { Haptics.selectionAsync(); onRefresh(); }}
          style={styles.refreshBtn}
        >
          <Feather name="refresh-cw" size={18} color={theme.tint} />
        </Pressable>
      </View>

      <FlatList
        data={isVolunteer ? filteredStaff : []}
        keyExtractor={s => s.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
        contentContainerStyle={{ padding: 16, paddingBottom: Platform.OS === "web" ? 80 : 90 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListHeaderComponent={() => (
          <>
            {/* My Status Card */}
            {!isSuperAdmin && (
              <View style={[styles.myCard, { backgroundColor: isActive ? "#22c55e12" : theme.surface, borderColor: isActive ? "#22c55e60" : theme.border }]}>
                <View style={styles.myCardTop}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.myCardLabel, { color: theme.textSecondary }]}>Your Status</Text>
                    <View style={styles.myStatusRow}>
                      <View style={[styles.dot, { backgroundColor: isActive ? "#22c55e" : "#f59e0b" }]} />
                      <Text style={[styles.myStatusText, { color: isActive ? "#22c55e" : "#f59e0b" }]}>
                        {isActive ? "Active" : "Inactive"}
                      </Text>
                    </View>
                    {myStatus?.lastActiveAt && (
                      <Text style={[styles.myStatusSub, { color: theme.textTertiary }]}>
                        {isActive ? "Active since " : "Last seen "}{timeAgo(myStatus.lastActiveAt)}
                      </Text>
                    )}
                  </View>
                  {isActive ? (
                    <Pressable onPress={() => confirmToggle(false)} style={[styles.statusBtn, { backgroundColor: "#ef444415", borderColor: "#ef4444" }]}>
                      <Feather name="moon" size={16} color="#ef4444" />
                      <Text style={[styles.statusBtnText, { color: "#ef4444" }]}>Go Inactive</Text>
                    </Pressable>
                  ) : (
                    <Pressable onPress={() => confirmToggle(true)} style={[styles.statusBtn, { backgroundColor: "#22c55e15", borderColor: "#22c55e" }]}>
                      <Feather name="sun" size={16} color="#22c55e" />
                      <Text style={[styles.statusBtnText, { color: "#22c55e" }]}>Go Active</Text>
                    </Pressable>
                  )}
                </View>
                {!isActive && (
                  <View style={[styles.inactiveNote, { borderTopColor: theme.border }]}>
                    <Feather name="info" size={13} color={theme.textTertiary} />
                    <Text style={[styles.inactiveNoteText, { color: theme.textTertiary }]}>
                      Auto-inactive after 10 minutes of no heartbeat
                    </Text>
                  </View>
                )}
              </View>
            )}

            {/* Summary */}
            {isVolunteer && (
              <>
                <View style={styles.summaryRow}>
                  <View style={[styles.summaryCard, { backgroundColor: "#22c55e12", borderColor: "#22c55e40" }]}>
                    <Text style={[styles.summaryNum, { color: "#22c55e" }]}>{onlineCount}</Text>
                    <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Online</Text>
                  </View>
                  <View style={[styles.summaryCard, { backgroundColor: "#3b82f612", borderColor: "#3b82f640" }]}>
                    <Text style={[styles.summaryNum, { color: "#3b82f6" }]}>{adminCount}</Text>
                    <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Admins</Text>
                  </View>
                  <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                    <Text style={[styles.summaryNum, { color: theme.text }]}>{volunteerCount}</Text>
                    <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Volunteers</Text>
                  </View>
                  <View style={[styles.summaryCard, { backgroundColor: "#f59e0b12", borderColor: "#f59e0b40" }]}>
                    <Text style={[styles.summaryNum, { color: "#f59e0b" }]}>{totalStaff - onlineCount}</Text>
                    <Text style={[styles.summaryLabel, { color: theme.textSecondary }]}>Offline</Text>
                  </View>
                </View>

                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  {isSuperAdmin ? "All Staff" : isCoordinator ? "Assigned Staff" : "Co-Volunteers"}
                </Text>

                {/* Search */}
                <View style={[styles.searchBox, { backgroundColor: theme.surface, borderColor: theme.border }]}>
                  <Feather name="search" size={14} color={theme.textSecondary} />
                  <TextInput
                    value={staffSearch}
                    onChangeText={setStaffSearch}
                    placeholder="Search by name, email, hostel, role..."
                    placeholderTextColor={theme.textTertiary}
                    style={[styles.searchInput, { color: theme.text }]}
                    autoCapitalize="none"
                  />
                  {staffSearch.length > 0 && (
                    <Pressable onPress={() => setStaffSearch("")} hitSlop={8}>
                      <Feather name="x" size={14} color={theme.textSecondary} />
                    </Pressable>
                  )}
                </View>

                {/* Role filter */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 6 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 2 }}>
                  {([
                    { key: "all",       label: "All",        count: totalStaff,     color: theme.tint },
                    { key: "admins",    label: "Admins",     count: adminCount,     color: "#8b5cf6" },
                    { key: "volunteers",label: "Volunteers", count: volunteerCount, color: "#22c55e" },
                  ] as const).map(f => {
                    const active = roleFilter === f.key;
                    return (
                      <Pressable
                        key={f.key}
                        onPress={() => { setRoleFilter(f.key); Haptics.selectionAsync(); }}
                        style={[styles.filterChip, {
                          backgroundColor: active ? f.color + "18" : theme.surface,
                          borderColor: active ? f.color : theme.border,
                        }]}
                      >
                        <Text style={[styles.filterChipText, { color: active ? f.color : theme.textSecondary }]}>{f.label}</Text>
                        <View style={[styles.filterChipBadge, { backgroundColor: active ? f.color + "22" : theme.border }]}>
                          <Text style={[styles.filterChipCount, { color: active ? f.color : theme.textTertiary }]}>{f.count}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                {/* Status filter */}
                <View style={styles.staffFilterRow}>
                  {(["all", "online", "offline"] as const).map(f => {
                    const active = staffFilter === f;
                    const color = f === "online" ? "#22c55e" : f === "offline" ? "#6b7280" : theme.tint;
                    const count = f === "online" ? onlineCount : f === "offline" ? Math.max(totalStaff - onlineCount, 0) : totalStaff;
                    return (
                      <Pressable
                        key={f}
                        onPress={() => setStaffFilter(f)}
                        style={[styles.staffFilterChip, {
                          backgroundColor: active ? color + "18" : theme.surface,
                          borderColor: active ? color : theme.border,
                        }]}
                      >
                        {f !== "all" && <View style={[styles.dot, { backgroundColor: color, width: 6, height: 6 }]} />}
                        <Text style={[styles.staffFilterText, { color: active ? color : theme.textSecondary }]}>
                          {f === "all" ? "All" : f === "online" ? "Online" : "Offline"}
                        </Text>
                        <View style={[styles.staffFilterCount, { backgroundColor: active ? color + "22" : theme.border }]}>
                          <Text style={[styles.staffFilterCountText, { color: active ? color : theme.textTertiary }]}>{count}</Text>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}
          </>
        )}
        ListEmptyComponent={() =>
          isLoading && (allStaff as any[]).length === 0
            ? <ActivityIndicator color={theme.tint} style={{ marginTop: 40 }} />
            : !isLoading && filteredStaff.length === 0
            ? (
              <View style={styles.emptyState}>
                <Feather name="users" size={36} color={theme.textTertiary} />
                <Text style={[styles.emptyText, { color: theme.textSecondary }]}>No staff found</Text>
              </View>
            ) : null
        }
        renderItem={({ item }) => {
          const roleColor = ROLE_COLORS[item.role] || "#6366f1";
          return (
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setSelectedStaff(item);
              }}
              style={({ pressed }) => [
                styles.staffCard,
                {
                  backgroundColor: theme.surface,
                  borderColor: item.isOnline ? "#22c55e40" : theme.border,
                  borderLeftColor: roleColor,
                  borderLeftWidth: 3,
                  opacity: pressed ? 0.88 : 1,
                },
              ]}
            >
              <View style={[styles.staffAvatar, { backgroundColor: roleColor + "20" }]}>
                <Text style={[styles.staffAvatarText, { color: roleColor }]}>
                  {(item.name || "?").charAt(0).toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.staffName, { color: theme.text }]}>{item.name}</Text>
                <Text style={[styles.staffEmail, { color: theme.textSecondary }]} numberOfLines={1}>{item.email}</Text>
                {!!staffHostelLabel(item) && (
                  <Text style={[styles.staffMeta, { color: theme.textTertiary }]}>
                    <Feather name="layers" size={10} color={theme.textTertiary} /> Assigned: {staffHostelLabel(item)}
                  </Text>
                )}
                <Text style={[styles.staffRole, { color: roleColor }]}>
                  {ROLE_LABELS[item.role] || item.role}
                </Text>
              </View>
              <View style={styles.staffRight}>
                <View style={[styles.onlineBadge, { backgroundColor: item.isOnline ? "#22c55e18" : "#6B728018" }]}>
                  <View style={[styles.dot, { backgroundColor: item.isOnline ? "#22c55e" : "#6B7280" }]} />
                  <Text style={[styles.onlineLabel, { color: item.isOnline ? "#22c55e" : "#6B7280" }]}>
                    {item.isOnline ? "Online" : "Offline"}
                  </Text>
                </View>
                <Text style={[styles.lastSeen, { color: theme.textTertiary }]}>{timeAgo(item.lastActiveAt)}</Text>
                {!!(item.contactNumber || item.phone) && (
                  <Feather name="phone" size={12} color={theme.tint} />
                )}
              </View>
            </Pressable>
          );
        }}
      />

      {/* Staff Detail Modal */}
      <StaffDetailModal
        staff={selectedStaff}
        visible={!!selectedStaff}
        onClose={() => setSelectedStaff(null)}
        theme={theme}
        isSuperAdmin={isSuperAdmin}
        hostels={hostels}
        hostelsLoading={hostelsLoading}
        onReassign={handleReassign}
        reassigning={reassigning}
      />

      {/* Remark Modal */}
      <Modal visible={remarkModal} transparent animationType="slide" onRequestClose={() => setRemarkModal(false)}>
        <Pressable style={styles.modalOverlay} onPress={() => setRemarkModal(false)}>
          <Pressable style={[styles.modalSheet, { backgroundColor: theme.surface }]} onPress={e => e.stopPropagation()}>
            <View style={styles.modalHandle} />
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              {goingActive ? "Going Active" : "Going Inactive"}
            </Text>
            <Text style={[styles.modalSub, { color: theme.textSecondary }]}>
              Add a remark (optional) — visible to superadmin
            </Text>
            <TextInput
              placeholder={goingActive ? "e.g. Starting hostel rounds…" : "e.g. Lunch break, back at 2pm…"}
              placeholderTextColor={theme.textTertiary}
              style={[styles.remarkInput, { backgroundColor: theme.background, color: theme.text, borderColor: theme.border }]}
              value={remark}
              onChangeText={setRemark}
              multiline
            />
            <Pressable
              onPress={submitStatus}
              disabled={submitting}
              style={[styles.confirmBtn, { backgroundColor: goingActive ? "#22c55e" : "#ef4444" }]}
            >
              {submitting
                ? <ActivityIndicator color="#fff" />
                : <>
                    <Feather name={goingActive ? "sun" : "moon"} size={16} color="#fff" />
                    <Text style={styles.confirmBtnText}>{goingActive ? "Confirm Active" : "Confirm Inactive"}</Text>
                  </>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, borderBottomWidth: 1, gap: 14 },
  backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 20, fontFamily: "Inter_700Bold" },
  liveRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#22c55e" },
  liveLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  refreshBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  myCard: { borderRadius: 16, borderWidth: 1.5, padding: 16, marginBottom: 14 },
  myCardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  myCardLabel: { fontSize: 12, fontFamily: "Inter_400Regular", marginBottom: 4 },
  myStatusRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  myStatusText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  myStatusSub: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 2 },
  statusBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1.5 },
  statusBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  inactiveNote: { flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 10, marginTop: 10, borderTopWidth: 1 },
  inactiveNoteText: { fontSize: 11, fontFamily: "Inter_400Regular", flex: 1 },
  summaryRow: { flexDirection: "row", gap: 8, marginBottom: 14 },
  summaryCard: { flex: 1, borderWidth: 1, borderRadius: 12, alignItems: "center", paddingVertical: 10 },
  summaryNum: { fontSize: 20, fontFamily: "Inter_700Bold" },
  summaryLabel: { fontSize: 10, fontFamily: "Inter_500Medium", marginTop: 2 },
  sectionTitle: { fontSize: 13, fontFamily: "Inter_700Bold", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 10 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  filterChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1 },
  filterChipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  filterChipBadge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  filterChipCount: { fontSize: 11, fontFamily: "Inter_700Bold" },
  staffFilterRow: { flexDirection: "row", gap: 8, marginBottom: 12 },
  staffFilterChip: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, paddingVertical: 7, borderRadius: 10, borderWidth: 1 },
  staffFilterText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  staffFilterCount: { borderRadius: 8, paddingHorizontal: 7, paddingVertical: 2 },
  staffFilterCountText: { fontSize: 11, fontFamily: "Inter_700Bold" },
  staffCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderRadius: 14, borderWidth: 1 },
  staffAvatar: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center" },
  staffAvatarText: { fontSize: 18, fontFamily: "Inter_700Bold" },
  staffName: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  staffEmail: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 1 },
  staffMeta: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  staffRole: { fontSize: 11, fontFamily: "Inter_600SemiBold", marginTop: 3 },
  staffRight: { alignItems: "flex-end", gap: 4 },
  onlineBadge: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 20 },
  onlineLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold" },
  lastSeen: { fontSize: 10, fontFamily: "Inter_400Regular" },
  dot: { width: 7, height: 7, borderRadius: 4 },
  emptyState: { alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 10 },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular" },
  modalOverlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 36, gap: 12 },
  modalHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 8 },
  modalTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  modalSub: { fontSize: 13, fontFamily: "Inter_400Regular" },
  remarkInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", minHeight: 80, textAlignVertical: "top" },
  confirmBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 12, paddingVertical: 14 },
  confirmBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold" },
});

const sd = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 16, maxHeight: "90%" },
  scrollArea: { width: "100%" },
  scrollContent: { paddingHorizontal: 24, paddingBottom: 36, gap: 6, alignItems: "center" },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 12 },
  avatar: { width: 64, height: 64, borderRadius: 32, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  avatarText: { fontSize: 28, fontFamily: "Inter_700Bold" },
  staffName: { fontSize: 18, fontFamily: "Inter_700Bold" },
  staffEmail: { fontSize: 13, fontFamily: "Inter_400Regular", marginBottom: 8 },
  chips: { flexDirection: "row", gap: 8, marginBottom: 12, flexWrap: "wrap", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1 },
  chipText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  dot: { width: 6, height: 6, borderRadius: 3 },
  infoCard: { width: "100%", borderRadius: 12, borderWidth: 1, padding: 12, gap: 2, marginBottom: 12 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6 },
  infoLabel: { fontSize: 12, fontFamily: "Inter_400Regular", width: 70 },
  infoVal: { flex: 1, fontSize: 13, fontFamily: "Inter_600SemiBold", textAlign: "right" },
  callBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: "#22c55e", borderRadius: 14, paddingVertical: 14, marginBottom: 8 },
  callBtnText: { color: "#fff", fontSize: 15, fontFamily: "Inter_700Bold" },
  reassignBtn: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 14, marginBottom: 8 },
  reassignBtnText: { fontSize: 15, fontFamily: "Inter_700Bold" },
  areaEditor: { width: "100%", borderWidth: 1, borderRadius: 12, padding: 12, gap: 8, marginBottom: 8 },
  areaLabel: { fontSize: 12, fontFamily: "Inter_500Medium" },
  areaInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, fontFamily: "Inter_400Regular" },
  areaSaveBtn: { alignSelf: "flex-end", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  areaSaveText: { color: "#fff", fontSize: 12, fontFamily: "Inter_700Bold" },
  closeBtn: { width: "100%", borderWidth: 1, borderRadius: 14, paddingVertical: 12, alignItems: "center" },
  closeBtnText: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
});

const hp = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "#00000088", justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 36 },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: "#CBD5E1", alignSelf: "center", marginBottom: 14 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold", marginBottom: 12 },
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 },
  searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  hostelRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderBottomWidth: 1 },
  hostelName: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium" },
});
