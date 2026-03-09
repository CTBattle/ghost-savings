import { Redirect } from "expo-router";
import { useAuth } from "../src/auth/AuthProvider";
import { View, ActivityIndicator } from "react-native";

export default function Index() {
  const { user, loading } = useAuth();

  // Show loading spinner while auth state is being determined
  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator size="large" />
      </View>
    );
  }

  // Redirect based on auth state
  if (user) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}