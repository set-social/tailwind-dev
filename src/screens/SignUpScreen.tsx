import { useState } from "react";
import { StyleSheet, TextInput, View } from "react-native";
import { Eye, EyeOff, Lock, Mail } from "lucide-react-native";
import { signUpWithPassword, signInWithPassword, continueAsGuest } from "@/lib/supabase";
import { c, font } from "@/theme";
import { Wordmark } from "@/components/brand";
import { HorizonHero } from "@/components/horizon";
import { Button, FieldBox, Press, Screen, Segmented, T } from "@/components/ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 6;

type Mode = "signup" | "login";

export default function SignUpScreen() {
  const [mode, setMode] = useState<Mode>("signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState<"none" | "submit" | "guest">("none");
  const [error, setError] = useState<string | null>(null);

  const clearFeedback = () => { if (error) setError(null); };

  const onChangeMode = (next: Mode) => {
    setMode(next);
    clearFeedback();
  };

  const onSubmit = async () => {
    const trimmed = email.trim();
    if (!EMAIL_RE.test(trimmed)) { setError("Enter a valid email address."); return; }
    if (mode === "signup" && password.length < MIN_PASSWORD) {
      setError(`Password must be at least ${MIN_PASSWORD} characters.`);
      return;
    }
    if (!password) { setError("Enter your password."); return; }

    setError(null);
    setBusy("submit");
    const { error: err } = mode === "signup"
      ? await signUpWithPassword(trimmed, password)
      : await signInWithPassword(trimmed, password);
    setBusy("none");
    if (err) setError(err);
    // Otherwise a session now exists — RootNavigator's auth-state listener
    // swaps to the authenticated stack on its own.
  };

  const onGuest = async () => {
    setError(null);
    setBusy("guest");
    const { error: err } = await continueAsGuest();
    setBusy("none");
    if (err) setError(err);
  };

  const submitLabel = mode === "signup" ? "Create account" : "Log in";
  const busyLabel = mode === "signup" ? "Creating account…" : "Logging in…";

  return (
    <Screen topPad={0}>
      {/* The wordmark sits in the sky above the planet limb. */}
      <View style={{ height: 214, marginBottom: 8 }}>
        <View pointerEvents="none" style={{ position: "absolute", left: -24, right: -24, top: 0, height: 210 }}>
          <HorizonHero variant="detail" showRoute={false} />
        </View>
        <View style={{ alignItems: "center", paddingTop: 62 }}>
          <Wordmark width={210} />
        </View>
      </View>

      <Segmented
        options={[{ id: "signup", label: "Create account" }, { id: "login", label: "Log in" }]}
        value={mode}
        onChange={onChangeMode}
      />

      <T v="eyebrow" style={{ marginTop: 26, marginBottom: 10 }}>{mode === "signup" ? "Get started" : "Welcome back"}</T>
      <T v="display" style={{ marginBottom: 12 }}>{mode === "signup" ? "Create your account." : "Log in to your account."}</T>
      <T style={{ marginBottom: 32 }}>
        {mode === "signup"
          ? "Track real flights, get alerts that matter, and pick up right where you left off."
          : "Log back in to pick up right where you left off."}
      </T>

      <T v="caption" style={{ marginBottom: 9 }}>Email address</T>
      <FieldBox style={{ marginBottom: 16 }}>
        <Mail size={18} color={c.text3} strokeWidth={1.5} />
        <TextInput
          value={email}
          onChangeText={(v) => { setEmail(v); clearFeedback(); }}
          placeholder="you@example.com"
          placeholderTextColor={c.text3}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          accessibilityLabel="Email address"
          style={{ flex: 1, height: 52, fontFamily: font.sans, fontSize: 16, color: c.text }}
        />
      </FieldBox>

      <T v="caption" style={{ marginBottom: 9 }}>Password</T>
      <FieldBox>
        <Lock size={18} color={c.text3} strokeWidth={1.5} />
        <TextInput
          value={password}
          onChangeText={(v) => { setPassword(v); clearFeedback(); }}
          placeholder={mode === "signup" ? `At least ${MIN_PASSWORD} characters` : "Your password"}
          placeholderTextColor={c.text3}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!showPassword}
          autoComplete={mode === "signup" ? "new-password" : "password"}
          textContentType={mode === "signup" ? "newPassword" : "password"}
          accessibilityLabel="Password"
          style={{ flex: 1, height: 52, fontFamily: font.sans, fontSize: 16, color: c.text }}
        />
        <Press label={showPassword ? "Hide password" : "Show password"} onPress={() => setShowPassword((v) => !v)} hitSlop={12}>
          {showPassword ? <EyeOff size={18} color={c.text3} strokeWidth={1.5} /> : <Eye size={18} color={c.text3} strokeWidth={1.5} />}
        </Press>
      </FieldBox>

      {error && <T style={{ color: c.risk, marginTop: 10, fontSize: 13 }}>{error}</T>}

      <Button
        label={busy === "submit" ? busyLabel : submitLabel}
        variant="light"
        onPress={onSubmit}
        disabled={busy !== "none"}
        style={{ marginTop: 22 }}
      />

      <View style={{ flexDirection: "row", alignItems: "center", gap: 14, marginVertical: 26 }}>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.hairline }} />
        <T v="caption">or</T>
        <View style={{ flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.hairline }} />
      </View>

      <Button
        label={busy === "guest" ? "Setting up…" : "Continue as guest"}
        variant="outline"
        onPress={onGuest}
        disabled={busy !== "none"}
      />

      <T v="caption" style={{ marginTop: 40, textAlign: "center" }}>
        Guest data stays on this device only. Sign up with email to keep your trips if you switch phones.
      </T>
    </Screen>
  );
}
