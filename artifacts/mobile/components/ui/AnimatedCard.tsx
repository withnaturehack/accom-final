import React, { useRef } from "react";
import { Animated, Pressable, StyleSheet, ViewStyle, StyleProp, Platform } from "react-native";
import { useColorScheme } from "react-native";
import Colors from "@/constants/colors";

interface AnimatedCardProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  noPadding?: boolean;
  noShadow?: boolean;
}

const isWeb = Platform.OS === "web";

export function AnimatedCard({ children, style, onPress, noPadding, noShadow }: AnimatedCardProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const onPressIn = () => {
    if (!onPress) return;
    Animated.spring(scaleAnim, {
      toValue: 0.97,
      useNativeDriver: !isWeb,
      tension: 300,
      friction: 20,
    }).start();
  };

  const onPressOut = () => {
    if (!onPress) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: !isWeb,
      tension: 300,
      friction: 20,
    }).start();
  };

  const card = (
    <Animated.View
      style={[
        styles.card,
        {
          backgroundColor: theme.card,
          borderColor: theme.border,
          ...(isWeb ? { boxShadow: isDark ? "0 2px 8px rgba(0,0,0,0.4)" : "0 1px 4px rgba(0,0,0,0.07)" } : {
            shadowColor: theme.cardShadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 1,
            shadowRadius: 8,
            elevation: 3,
          }),
        },
        !noPadding && styles.padding,
        noShadow && styles.noShadow,
        !isWeb && { transform: [{ scale: scaleAnim }] },
        style,
      ]}
    >
      {children}
    </Animated.View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} onPressIn={onPressIn} onPressOut={onPressOut}>
        {card}
      </Pressable>
    );
  }
  return card;
}

const styles = StyleSheet.create({
  card: { borderRadius: 16, borderWidth: 1 },
  padding: { padding: 16 },
  noShadow: { elevation: 0 },
});
