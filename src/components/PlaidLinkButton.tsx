import React from "react";
import { Alert, Pressable, Text, View } from "react-native";

type Props = {
  onLinked?: () => Promise<void> | void;
  baseUrl?: string;
};

export default function PlaidLinkButton({ onLinked }: Props) {
  const handlePress = () => {
    Alert.alert(
      "Plaid disabled",
      "Plaid is temporarily disabled for iOS crash isolation."
    );
    onLinked?.();
  };

  return (
    <View style={{ width: "100%", gap: 12 }}>
      <Pressable
        onPress={handlePress}
        style={{
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: "center",
          backgroundColor: "#111827",
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>
          Plaid Temporarily Disabled
        </Text>
      </Pressable>
    </View>
  );
}