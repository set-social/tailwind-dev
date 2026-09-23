import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { ArrowUp, Sparkles, X } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { assistantProvider } from "@/lib/providers";
import type { AssistantAnswer } from "@/lib/data/assistant";
import { c, font, radius } from "@/theme";
import { Press, T } from "./ui";

interface Msg { id: number; q: string; a?: AssistantAnswer }

/**
 * `flightKey` is all the server needs — it loads the flight itself.
 * `title` is display-only ("UA 1482 · EWR → LAX").
 */
export function AskSheet({ open, onClose, flightKey, title, initial, suggested }: { open: boolean; onClose: () => void; flightKey: string; title: string; initial: string | null; suggested: string[] }) {
  const insets = useSafeAreaInsets();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const scroller = useRef<ScrollView>(null);
  const seq = useRef(0);
  const handled = useRef<string | null>(null);

  const ask = (q: string) => {
    if (!q.trim()) return;
    const id = ++seq.current;
    setMsgs((m) => [...m, { id, q }]);
    setText("");
    assistantProvider.ask(q, { flightKey }).then((a) => setMsgs((m) => m.map((x) => (x.id === id ? { ...x, a } : x))));
  };

  useEffect(() => {
    if (open && initial && handled.current !== initial) { handled.current = initial; ask(initial); }
    if (!open) handled.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const remaining = suggested.filter((s) => !msgs.some((m) => m.q === s));

  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: c.bg }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", padding: 20, paddingBottom: 16 }}>
          <View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}><Sparkles size={12} color={c.accentBright} /><T v="eyebrow" color={c.accentBright}>Ask FlightIQ</T></View>
            <T v="heading" style={{ marginTop: 8 }}>{title}</T>
            <T v="caption" style={{ marginTop: 2 }}>Answers use this flight's own signals.</T>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.surface, borderWidth: 1, borderColor: c.surfaceBorder, alignItems: "center", justifyContent: "center" }}><X size={16} color={c.text2} /></Pressable>
        </View>

        <ScrollView ref={scroller} onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: true })} style={{ flex: 1, borderTopWidth: 1, borderColor: c.hairline }} contentContainerStyle={{ padding: 20, gap: 24 }} keyboardShouldPersistTaps="handled">
          {msgs.length === 0 && <T>Ask why FlightIQ sees a delay, what could change, or what you should do. It will always show what it's basing an answer on.</T>}
          {msgs.map((m) => (
            <View key={m.id} style={{ gap: 12 }}>
              <View style={{ alignSelf: "flex-end", maxWidth: "85%", backgroundColor: c.accent, borderRadius: 18, borderBottomRightRadius: 5, paddingHorizontal: 16, paddingVertical: 10 }}>
                <Text style={{ fontFamily: font.sansMedium, fontSize: 14.5, color: c.bg }}>{m.q}</Text>
              </View>
              {m.a ? (
                <View style={{ gap: 12 }}>
                  {m.a.answer.map((p, i) => <Text key={i} style={{ fontFamily: font.sans, fontSize: 15, lineHeight: 23, color: c.text }}>{p}</Text>)}
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                    <T v="caption">Based on</T>
                    {m.a.basedOn.map((b) => <View key={b} style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.surfaceBorder, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 4 }}><Text style={{ fontFamily: font.sans, fontSize: 12, color: c.text2 }}>{b}</Text></View>)}
                  </View>
                </View>
              ) : <T v="caption" accessibilityLiveRegion="polite">FlightIQ is thinking…</T>}
            </View>
          ))}
        </ScrollView>

        <View style={{ borderTopWidth: 1, borderColor: c.hairline, paddingTop: 12, paddingBottom: Math.max(insets.bottom, 12) }}>
          {remaining.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 20, gap: 8, paddingBottom: 12 }} keyboardShouldPersistTaps="handled">
              {remaining.map((s) => <Press key={s} onPress={() => ask(s)} style={{ backgroundColor: c.surface, borderWidth: 1, borderColor: c.surfaceBorder, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 }}><Text style={{ fontFamily: font.sans, fontSize: 13, color: c.text2 }}>{s}</Text></Press>)}
            </ScrollView>
          )}
          <View style={{ marginHorizontal: 20, flexDirection: "row", alignItems: "center", backgroundColor: c.surface, borderWidth: 1, borderColor: c.surfaceBorder, borderRadius: radius.pill, paddingLeft: 20, paddingRight: 6, paddingVertical: 6 }}>
            <TextInput value={text} onChangeText={setText} onSubmitEditing={() => ask(text)} returnKeyType="send" placeholder="Ask about this flight…" placeholderTextColor={c.text3} accessibilityLabel="Your question" style={{ flex: 1, height: 38, fontFamily: font.sans, fontSize: 15, color: c.text }} />
            <Pressable accessibilityRole="button" accessibilityLabel="Send" disabled={!text.trim()} onPress={() => ask(text)} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.accent, alignItems: "center", justifyContent: "center", opacity: text.trim() ? 1 : 0.3 }}><ArrowUp size={16} color={c.bg} /></Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
