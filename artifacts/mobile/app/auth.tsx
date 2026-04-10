import React, { useState } from "react";
import {
  View, Text, TextInput, Pressable, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform,
  ScrollView, useColorScheme, Alert, Image, Dimensions,
} from "react-native";
import { useSafeAreaInsets, SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { useAuth } from "@/context/AuthContext";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const LOGO = require("../assets/images/paradox-logo.jpg");

type Tab = "login" | "register";

export default function AuthScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const theme = isDark ? Colors.dark : Colors.light;
  const insets = useSafeAreaInsets();
  const { login, register } = useAuth();

  const [tab, setTab] = useState<Tab>("login");
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPass, setLoginPass] = useState("");
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPass, setRegPass] = useState("");
  const [regRoll, setRegRoll] = useState("");

  const switchTab = (t: Tab) => {
    Haptics.selectionAsync();
    setTab(t);
    setPendingMessage(null);
  };

  const handleLogin = async () => {
    if (!loginEmail || !loginPass) {
      Alert.alert("Missing Fields", "Please fill in email and password");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      await login(loginEmail.trim(), loginPass);
    } catch (e: any) {
      Alert.alert("Login Failed", e.message || "Please check your credentials and try again");
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!regName || !regEmail || !regPass || !regRoll) {
      Alert.alert("Missing Fields", "Please fill in all fields");
      return;
    }
    if (regPass.length < 6) {
      Alert.alert("Weak Password", "Password must be at least 6 characters");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    try {
      const msg = await register(regName.trim(), regEmail.trim(), regPass, regRoll.trim());
      setPendingMessage(msg || "Your account is pending approval. Contact the Super Admin.");
      setRegName(""); setRegEmail(""); setRegPass(""); setRegRoll("");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert("Registration Failed", e.message);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = [styles.input, {
    backgroundColor: isDark ? "#1a1a1a" : "#f8f9fa",
    borderColor: theme.border,
    color: theme.text,
  }];

  return (
    <SafeAreaView edges={["top"]} style={[styles.container, { backgroundColor: isDark ? "#000" : "#fff" }]}>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: 16, paddingBottom: insets.bottom + 20, flexGrow: 1, justifyContent: "center" }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.logoWrap}>
            <Image source={LOGO} style={styles.logo} resizeMode="cover" />
          </View>
          <Text style={[styles.caption, { color: theme.textSecondary }]}>IIT Madras Hostel Management</Text>
        </View>

        {/* Card */}
        <View style={[styles.card, { backgroundColor: isDark ? "#111" : "#fff", borderColor: isDark ? "#2a2a2a" : "#e5e7eb" }]}>
          {/* Tab switcher */}
          <View style={[styles.tabRow, { backgroundColor: isDark ? "#1a1a1a" : "#f3f4f6" }]}>
            {(["login", "register"] as Tab[]).map((t) => (
              <Pressable
                key={t}
                style={[styles.tabBtn, tab === t && { backgroundColor: theme.tint, shadowColor: theme.tint, shadowOpacity: 0.3, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 }]}
                onPress={() => switchTab(t)}
              >
                <Text style={[styles.tabText, { color: tab === t ? "#fff" : theme.textSecondary }]}>
                  {t === "login" ? "Sign In" : "Register"}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Pending approval banner */}
          {pendingMessage && (
            <View style={[styles.pendingBanner, { backgroundColor: "#f59e0b10", borderColor: "#f59e0b40" }]}>
              <Feather name="clock" size={18} color="#f59e0b" />
              <View style={{ flex: 1 }}>
                <Text style={[styles.pendingTitle, { color: "#f59e0b" }]}>Registration Submitted!</Text>
                <Text style={[styles.pendingBody, { color: theme.textSecondary }]}>{pendingMessage}</Text>
              </View>
            </View>
          )}

          {/* Login Form */}
          {tab === "login" && (
            <View style={styles.form}>
              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Email Address</Text>
                <View style={[styles.inputWrap, { backgroundColor: isDark ? "#1a1a1a" : "#f8f9fa", borderColor: theme.border }]}>
                  <Feather name="mail" size={16} color={theme.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.inputField, { color: theme.text }]}
                    placeholder="your@iitm.ac.in"
                    placeholderTextColor={theme.textTertiary}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                    value={loginEmail}
                    onChangeText={setLoginEmail}
                    returnKeyType="next"
                  />
                </View>
              </View>

              <View style={styles.fieldGroup}>
                <Text style={[styles.label, { color: theme.textSecondary }]}>Password</Text>
                <View style={[styles.inputWrap, { backgroundColor: isDark ? "#1a1a1a" : "#f8f9fa", borderColor: theme.border }]}>
                  <Feather name="lock" size={16} color={theme.textTertiary} style={styles.inputIcon} />
                  <TextInput
                    style={[styles.inputField, { color: theme.text, flex: 1 }]}
                    placeholder="••••••••"
                    placeholderTextColor={theme.textTertiary}
                    secureTextEntry={!showPass}
                    value={loginPass}
                    onChangeText={setLoginPass}
                    onSubmitEditing={handleLogin}
                    returnKeyType="done"
                  />
                  <Pressable onPress={() => setShowPass(!showPass)} style={styles.eyeBtn} hitSlop={8}>
                    <Feather name={showPass ? "eye-off" : "eye"} size={16} color={theme.textTertiary} />
                  </Pressable>
                </View>
              </View>

              <Pressable
                style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: loading ? 0.7 : 1, shadowColor: theme.tint, shadowOpacity: 0.35, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 }]}
                onPress={handleLogin}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Feather name="log-in" size={17} color="#fff" />
                      <Text style={styles.primaryBtnText}>Sign In</Text>
                    </>
                }
              </Pressable>

            </View>
          )}

          {/* Register Form */}
          {tab === "register" && !pendingMessage && (
            <View style={styles.form}>
              {[
                { label: "Full Name", icon: "user", key: "name", value: regName, setter: setRegName, placeholder: "Arjun Kumar", type: "default" },
                { label: "Email Address", icon: "mail", key: "email", value: regEmail, setter: setRegEmail, placeholder: "your@iitm.ac.in", type: "email-address" },
                { label: "Roll Number", icon: "hash", key: "roll", value: regRoll, setter: setRegRoll, placeholder: "21f3000001", type: "default" },
                { label: "Password", icon: "lock", key: "pass", value: regPass, setter: setRegPass, placeholder: "Min. 6 characters", type: "default" },
              ].map(({ label, icon, key, value, setter, placeholder, type }) => (
                <View key={key} style={styles.fieldGroup}>
                  <Text style={[styles.label, { color: theme.textSecondary }]}>{label}</Text>
                  <View style={[styles.inputWrap, { backgroundColor: isDark ? "#1a1a1a" : "#f8f9fa", borderColor: theme.border }]}>
                    <Feather name={icon as any} size={16} color={theme.textTertiary} style={styles.inputIcon} />
                    <TextInput
                      style={[styles.inputField, { color: theme.text }]}
                      placeholder={placeholder}
                      placeholderTextColor={theme.textTertiary}
                      keyboardType={type as any}
                      autoCapitalize="none"
                      autoCorrect={false}
                      secureTextEntry={key === "pass"}
                      value={value}
                      onChangeText={setter}
                      returnKeyType={key === "pass" ? "done" : "next"}
                      onSubmitEditing={key === "pass" ? handleRegister : undefined}
                    />
                  </View>
                </View>
              ))}

              <View style={[styles.infoBox, { backgroundColor: "#3b82f610", borderColor: "#3b82f640" }]}>
                <Feather name="info" size={14} color="#3b82f6" />
                <Text style={[styles.infoText, { color: theme.textSecondary }]}>
                  Your account requires Super Admin approval before access. You'll be assigned a role and hostel.
                </Text>
              </View>

              <Pressable
                style={[styles.primaryBtn, { backgroundColor: theme.tint, opacity: loading ? 0.7 : 1 }]}
                onPress={handleRegister}
                disabled={loading}
              >
                {loading
                  ? <ActivityIndicator color="#fff" />
                  : <>
                      <Feather name="send" size={17} color="#fff" />
                      <Text style={styles.primaryBtnText}>Submit Registration</Text>
                    </>
                }
              </Pressable>
            </View>
          )}
        </View>

        <Text style={[styles.footer, { color: theme.textTertiary }]}>IIT Madras BS Programme · Hostel Operations</Text>
      </ScrollView>
    </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingHorizontal: 20, alignItems: "stretch" },
  hero: { alignItems: "center", marginBottom: 28, gap: 4 },
  logoWrap: { width: 160, height: 160, borderRadius: 80, overflow: "hidden", marginBottom: 14, borderWidth: 3, borderColor: "#f59e0b50" },
  logo: { width: "100%", height: "100%" },
  appName: { fontSize: 32, fontFamily: "Inter_700Bold", letterSpacing: -0.5 },
  appSub: { fontSize: 12, fontFamily: "Inter_700Bold", letterSpacing: 3, marginTop: -2 },
  caption: { fontSize: 13, fontFamily: "Inter_400Regular", marginTop: 4 },
  card: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 0 },
  tabRow: { flexDirection: "row", borderRadius: 12, padding: 4, marginBottom: 20 },
  tabBtn: { flex: 1, paddingVertical: 11, borderRadius: 9, alignItems: "center" },
  tabText: { fontSize: 14, fontFamily: "Inter_700Bold" },
  form: { gap: 0 },
  fieldGroup: { marginBottom: 14 },
  label: { fontSize: 12, fontFamily: "Inter_600SemiBold", marginBottom: 7, textTransform: "uppercase", letterSpacing: 0.3 },
  inputWrap: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1.5, paddingHorizontal: 12, paddingVertical: 13, gap: 10 },
  inputIcon: {},
  inputField: { flex: 1, fontSize: 15, fontFamily: "Inter_400Regular", paddingVertical: 0 },
  eyeBtn: { padding: 2 },
  primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderRadius: 13, paddingVertical: 15, marginTop: 6, marginBottom: 16 },
  primaryBtnText: { color: "#fff", fontSize: 16, fontFamily: "Inter_700Bold" },
  infoBox: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 6 },
  infoText: { fontSize: 12, fontFamily: "Inter_400Regular", flex: 1, lineHeight: 18 },
  pendingBanner: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14, borderRadius: 12, borderWidth: 1, marginBottom: 16 },
  pendingTitle: { fontSize: 14, fontFamily: "Inter_700Bold", marginBottom: 2 },
  pendingBody: { fontSize: 13, fontFamily: "Inter_400Regular", lineHeight: 18 },
  footer: { textAlign: "center", fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 24, paddingBottom: 8 },
  input: { borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: "Inter_400Regular" },
});
