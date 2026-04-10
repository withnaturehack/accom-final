import React, { useEffect, useRef } from "react";
import { Animated, View, StyleSheet, ViewStyle, StyleProp, Platform } from "react-native";
import { useColorScheme } from "react-native";
import Colors from "@/constants/colors";

const isWeb = Platform.OS === "web";

interface SkeletonProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}

export function Skeleton({ width = "100%", height = 16, borderRadius = 8, style }: SkeletonProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const opacityAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacityAnim, { toValue: 0.8, duration: 800, useNativeDriver: false }),
        Animated.timing(opacityAnim, { toValue: 0.4, duration: 800, useNativeDriver: false }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <Animated.View
      style={[
        {
          width: width as any,
          height,
          borderRadius,
          backgroundColor: isDark ? "#1E293B" : "#E2E8F0",
          opacity: opacityAnim,
        },
        style,
      ]}
    />
  );
}

export function CardSkeleton() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  return (
    <View style={[styles.card, { backgroundColor: theme.card, borderColor: theme.border }]}>
      <Skeleton height={18} width="55%" />
      <View style={{ height: 8 }} />
      <Skeleton height={13} width="35%" />
      <View style={{ height: 12 }} />
      <Skeleton height={13} />
      <View style={{ height: 6 }} />
      <Skeleton height={13} width="75%" />
    </View>
  );
}

export function RowSkeleton() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  return (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Skeleton height={40} width={40} borderRadius={20} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton height={14} width="60%" />
        <Skeleton height={12} width="40%" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
});
