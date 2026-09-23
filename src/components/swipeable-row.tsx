import { useRef, type ReactNode } from "react";
import { Animated, PanResponder, Pressable } from "react-native";
import { Trash2 } from "lucide-react-native";
import { c } from "@/theme";

const DELETE_WIDTH = 84;

/**
 * Swipe-left-to-delete, built on core RN (PanResponder + Animated) rather
 * than react-native-gesture-handler: current gesture-handler (v3) dropped
 * its old JS-only Swipeable in favor of ReanimatedSwipeable, which needs
 * react-native-reanimated too — two new native modules, a Babel plugin,
 * and another full rebuild for an interaction this simple. Core RN does
 * it with nothing new to install.
 */
export function SwipeableRow({ children, onDelete, label }: { children: ReactNode; onDelete: () => void; label: string }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const open = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 8 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5,
      onPanResponderMove: (_, gesture) => {
        const base = open.current ? -DELETE_WIDTH : 0;
        const next = Math.min(4, Math.max(-DELETE_WIDTH - 16, base + gesture.dx));
        translateX.setValue(next);
      },
      onPanResponderRelease: (_, gesture) => {
        const base = open.current ? -DELETE_WIDTH : 0;
        const projected = base + gesture.dx;
        const shouldOpen = projected < -DELETE_WIDTH / 2;
        open.current = shouldOpen;
        Animated.spring(translateX, { toValue: shouldOpen ? -DELETE_WIDTH : 0, useNativeDriver: true, bounciness: 4 }).start();
      },
    }),
  ).current;

  const close = () => {
    open.current = false;
    Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
  };

  return (
    <Animated.View style={{ position: "relative" }}>
      <Animated.View style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: DELETE_WIDTH }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Remove ${label}`}
          onPress={() => { close(); onDelete(); }}
          style={{ width: "100%", height: "100%", backgroundColor: c.risk, alignItems: "center", justifyContent: "center" }}
        >
          <Trash2 size={18} color={c.white} />
        </Pressable>
      </Animated.View>
      <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX }], backgroundColor: c.bg }}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}
