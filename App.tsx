import React from 'react';
import { StatusBar } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { RootNavigator } from './src/navigation/RootNavigator';

// No more auto-anonymous-sign-in here — RootNavigator now gates on a real
// session and shows the sign-up flow when there isn't one. "Continue as
// guest" (still anonymous auth under the hood) is an explicit choice on
// that screen now, not something that happens silently before the user
// sees it.
export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" />
      <RootNavigator />
    </SafeAreaProvider>
  );
}
