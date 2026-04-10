import React from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  RefreshControl,
  Platform,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { useAuth, useApiRequest } from "@/context/AuthContext";
import { AnimatedCard } from "@/components/ui/AnimatedCard";
import { CardSkeleton } from "@/components/ui/LoadingSkeleton";

const notifIcons: Record<string, { icon: any; color: string }> = {
  announcement: { icon: "volume-2", color: "#3B8AF0" },
  lostitem: { icon: "search", color: "#F97316" },
  discipline: { icon: "alert-triangle", color: "#EF4444" },
  general: { icon: "bell", color: "#8B5CF6" },
};

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Student Notifications View ───────────────────────────────────────────────

function StudentNotifications({ theme, user, onUnreadCount }: { theme: any; user: any; onUnreadCount?: (n: number) => void }) {
  const request = useApiRequest();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = React.useState(false);

  const { data: notifications, isLoading, refetch } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => request("/notifications"),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => request(`/notifications/${id}/read`, { method: "PATCH" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => request("/notifications/read-all", { method: "PATCH" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const unread = notifications?.filter((n: any) => !n.isRead) || [];
  const read = notifications?.filter((n: any) => n.isRead) || [];

  const handleMarkRead = (n: any) => {
    if (!n.isRead) {
      Haptics.selectionAsync();
      markReadMutation.mutate(n.id);
    }
  };

  const NotifItem = ({ n }: { n: any }) => {
    const meta = notifIcons[n.type] || notifIcons.general;
    return (
      <AnimatedCard
        onPress={() => handleMarkRead(n)}
        style={[
          styles.notifCard,
          !n.isRead && { borderLeftWidth: 3, borderLeftColor: theme.tint },
        ]}
      >
        <View style={styles.notifRow}>
          <View style={[styles.notifIcon, { backgroundColor: meta.color + "20" }]}>
            <Feather name={meta.icon} size={18} color={meta.color} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={[styles.notifTitle, { color: theme.text }]}>{n.title}</Text>
            <Text style={[styles.notifBody, { color: theme.textSecondary }]} numberOfLines={2}>
              {n.body}
            </Text>
            <Text style={[styles.notifTime, { color: theme.textTertiary }]}>{timeAgo(n.createdAt)}</Text>
          </View>
          {!n.isRead && <View style={[styles.unreadDot, { backgroundColor: theme.tint }]} />}
        </View>
      </AnimatedCard>
    );
  };

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: Platform.OS === "web" ? 80 : 90 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
      showsVerticalScrollIndicator={false}
    >
      {isLoading ? (
        <View style={{ paddingHorizontal: 20 }}>
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </View>
      ) : !notifications?.length ? (
        <View style={styles.emptyState}>
          <Feather name="bell-off" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>All caught up!</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            You have no notifications right now. Staff will send you updates here.
          </Text>
        </View>
      ) : (
        <>
          {unread.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionRow}>
                <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
                  New · {unread.length}
                </Text>
                <Pressable
                  onPress={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  style={[styles.markAllBtn, { borderColor: theme.border }]}
                >
                  <Feather name="check-circle" size={13} color={theme.tint} />
                  <Text style={[styles.markAllText, { color: theme.tint }]}>Mark all read</Text>
                </Pressable>
              </View>
              {unread.map((n: any) => <NotifItem key={n.id} n={n} />)}
            </View>
          )}
          {read.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionLabel, { color: theme.textSecondary, paddingHorizontal: 20 }]}>Earlier</Text>
              {read.map((n: any) => <NotifItem key={n.id} n={n} />)}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

// ─── Staff Announcements View ─────────────────────────────────────────────────

function StaffAnnouncements({ theme, user }: { theme: any; user: any }) {
  const request = useApiRequest();
  const [refreshing, setRefreshing] = React.useState(false);

  const { data: announcements, isLoading, refetch } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => request("/announcements"),
    enabled: !!user,
    refetchInterval: 30000,
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const list: any[] = Array.isArray(announcements) ? announcements : [];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ paddingBottom: 120 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.tint} />}
      showsVerticalScrollIndicator={false}
    >
      {/* Info banner */}
      <View style={[styles.infoBanner, { backgroundColor: theme.tint + "12", borderColor: theme.tint + "30" }]}>
        <Feather name="info" size={14} color={theme.tint} />
        <Text style={[styles.infoBannerText, { color: theme.tint }]}>
          Staff see all sent announcements here. Students receive these as push notifications.
        </Text>
      </View>

      {isLoading ? (
        <View style={{ paddingHorizontal: 20 }}>
          <CardSkeleton /><CardSkeleton /><CardSkeleton />
        </View>
      ) : !list.length ? (
        <View style={styles.emptyState}>
          <Feather name="volume-x" size={48} color={theme.textTertiary} />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>No announcements yet</Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Tap the + button below to send a notification to students.
          </Text>
        </View>
      ) : (
        <View style={styles.section}>
          <Text style={[styles.sectionLabel, { color: theme.textSecondary }]}>
            Sent Announcements · {list.length}
          </Text>
          {list.map((a: any) => (
            <AnimatedCard key={a.id} style={styles.notifCard}>
              <View style={styles.notifRow}>
                <View style={[styles.notifIcon, { backgroundColor: "#3B8AF020" }]}>
                  <Feather name="volume-2" size={18} color="#3B8AF0" />
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={[styles.notifTitle, { color: theme.text }]}>{a.title}</Text>
                  <Text style={[styles.notifBody, { color: theme.textSecondary }]} numberOfLines={2}>
                    {a.content}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                    <Text style={[styles.notifTime, { color: theme.textTertiary }]}>{timeAgo(a.createdAt)}</Text>
                    <Text style={[styles.notifTime, { color: theme.textTertiary }]}>· by {a.createdByName}</Text>
                    {a.category && a.category !== "general" && (
                      <View style={[styles.catChip, { backgroundColor: "#8b5cf620" }]}>
                        <Text style={[styles.catChipText, { color: "#8b5cf6" }]}>{a.category}</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </AnimatedCard>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export default function NotificationsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { user, isCoordinator } = useAuth();
  const isWeb = Platform.OS === "web";

  const isStudent = user?.role === "student";

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: 16 }]}>
        <Text style={[styles.pageTitle, { color: theme.text }]}>
          {isStudent ? "Notifications" : "Announcements"}
        </Text>
      </View>

      {isStudent
        ? <StudentNotifications theme={theme} user={user} />
        : <StaffAnnouncements theme={theme} user={user} />
      }

      {/* FAB — staff can post announcements from here */}
      {isCoordinator && (
        <Pressable
          onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); router.push("/admin/post-announcement" as any); }}
          style={[styles.fab, { backgroundColor: theme.tint, bottom: (isWeb ? 16 : insets.bottom) + 84 }]}
        >
          <Feather name="plus" size={22} color="#fff" />
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 12 },
  pageTitle: { fontSize: 28, fontFamily: "Inter_700Bold", marginBottom: 8 },
  section: { marginBottom: 16 },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, marginBottom: 8 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", textTransform: "uppercase", letterSpacing: 0.5 },
  markAllBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1 },
  markAllText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  notifCard: { marginHorizontal: 20, marginBottom: 8 },
  notifRow: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  notifIcon: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  notifTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  notifBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  notifTime: { fontSize: 11, fontFamily: "Inter_400Regular" },
  unreadDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  emptyState: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 40, gap: 10 },
  emptyTitle: { fontSize: 20, fontFamily: "Inter_700Bold" },
  emptyText: { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center" },
  infoBanner: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginHorizontal: 20, marginBottom: 16, padding: 12, borderRadius: 10, borderWidth: 1 },
  infoBannerText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", lineHeight: 17 },
  catChip: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  catChipText: { fontSize: 10, fontFamily: "Inter_600SemiBold" },
  fab: { position: "absolute", right: 20, width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", elevation: 4, shadowColor: "#000", shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.2, shadowRadius: 5 },
});
