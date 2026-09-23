import type { NavigatorScreenParams } from '@react-navigation/native';

export type TabParamList = {
  Home: undefined;
  Live: undefined;
  Trips: undefined;
  Alerts: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  // Unauthenticated stack — RootNavigator shows only this until a session exists.
  SignUp: undefined;
  Welcome: undefined;
  // Authenticated stack.
  Tabs: NavigatorScreenParams<TabParamList> | undefined;
  Flight: { id: string };
  LiveFlight: { flightNumber: string; date: string };
  Trip: { id: string };
  Search: undefined;
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
