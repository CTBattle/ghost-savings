import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, Text, View } from "react-native";
import { usePlaidLink } from "react-native-plaid-link-sdk";
import { getAuth } from "firebase/auth";

type Props = {
  onLinked?: () => Promise<void> | void;
};

export default function PlaidLinkButton({ onLinked }: Props) {
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [creatingToken, setCreatingToken] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [linkToken, setLinkToken] = useState<string | null>(null);

  // ─────────────────────────────────────────────────────────────
  // API URL
  // ─────────────────────────────────────────────────────────────
  const rawBaseUrl = process.env.EXPO_PUBLIC_API_URL;

  const normalizedBaseUrl = useMemo(() => {
    const s = (rawBaseUrl || "").trim();
    return s ? s.replace(/\/+$/, "") : "";
  }, [rawBaseUrl]);

  // ─────────────────────────────────────────────────────────────
  // Create link token
  // ─────────────────────────────────────────────────────────────
  const createLinkToken = useCallback(async () => {
    if (!normalizedBaseUrl) {
      const msg = "Missing EXPO_PUBLIC_API_URL";
      setErrMsg(msg);
      Alert.alert("Plaid", msg);
      return;
    }

    setErrMsg(null);
    setCreatingToken(true);

    try {
      const user = getAuth().currentUser;
      const idToken = user ? await user.getIdToken(true) : null;

      const res = await fetch(`${normalizedBaseUrl}/plaid/create-link-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
        },
        body: JSON.stringify({}),
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

      const json = JSON.parse(text);
      if (!json?.link_token) {
        throw new Error("Server did not return link_token");
      }

      setLinkToken(json.link_token);
    } catch (e: any) {
      console.error("createLinkToken error:", e);
      const msg = e?.message || "Failed to create link token";
      setErrMsg(msg);
      Alert.alert("Plaid", msg);
    } finally {
      setCreatingToken(false);
    }
  }, [normalizedBaseUrl]);

  // ─────────────────────────────────────────────────────────────
// Exchange public token
  // ─────────────────────────────────────────────────────────────
  const exchangePublicToken = useCallback(
    async (publicToken: string) => {
      if (!normalizedBaseUrl) {
        Alert.alert("Plaid", "Missing EXPO_PUBLIC_API_URL");
        return;
      }

      setErrMsg(null);
      setExchanging(true);

      try {
        const user = getAuth().currentUser;
        const idToken = user ? await user.getIdToken(true) : null;

        const res = await fetch(`${normalizedBaseUrl}/plaid/exchange-token`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
          },
          body: JSON.stringify({ public_token: publicToken }),
        });

        const text = await res.text();
        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

        await onLinked?.();
        Alert.alert("Plaid", "Bank linked successfully ✅");
      } catch (e: any) {
        console.error("exchangePublicToken error:", e);
        Alert.alert("Plaid", e?.message || "Exchange failed");
      } finally {
        setExchanging(false);
      }
    },
    [normalizedBaseUrl, onLinked]
  );

  // ─────────────────────────────────────────────────────────────
  // Plaid hook
  // ─────────────────────────────────────────────────────────────
  const { open, ready, error, create } = usePlaidLink({
    token: linkToken || "",
    onSuccess: (publicToken: string) => {
      exchangePublicToken(publicToken);
    },
    onExit: (exitErr) => {
      if (exitErr) console.log("Plaid onExit error:", exitErr);
    },
  });

  // Surface Plaid errors
  useEffect(() => {
    if (!error) return;
    const msg = typeof error === "string" ? error : "Plaid Link error";
    setErrMsg(msg);
  }, [error]);

  // Initialize Plaid when token changes
  useEffect(() => {
    if (!linkToken) return;

    try {
      setInitializing(true);
      create({ token: linkToken });
    } catch (e: any) {
      console.error("Plaid create() error:", e);
      const msg = e?.message || "Failed to initialize Plaid Link";
      setErrMsg(msg);
      Alert.alert("Plaid", msg);
      setLinkToken(null);
    } finally {
      setInitializing(false);
    }
  }, [linkToken, create]);

  // ─────────────────────────────────────────────────────────────
  // Button handler
  // ─────────────────────────────────────────────────────────────
 const onPress = useCallback(async () => {
    setErrMsg(null);

    if (!linkToken) {
      await createLinkToken();
      return;
    }

    if (!ready) {
      Alert.alert("Plaid", "Plaid Link isn't ready yet. Try again.");
      return;
    }

    open();
  }, [linkToken, createLinkToken, open, ready]);

  // ─────────────────────────────────────────────────────────────
  // UI
  // ─────────────────────────────────────────────────────────────
  return (
    <View style={{ width: "100%", gap: 12 }}>
      {!!errMsg && <Text style={{ color: "tomato" }}>{errMsg}</Text>}

      <Pressable
        onPress={onPress}
        disabled={creatingToken || initializing || exchanging}
        style={{
          paddingVertical: 14,
          borderRadius: 12,
          alignItems: "center",
          opacity: creatingToken || initializing || exchanging ? 0.6 : 1,
          backgroundColor: "#111827",
        }}
      >
        <Text style={{ color: "white", fontWeight: "600" }}>
          {exchanging
            ? "Linking..."
            : creatingToken
            ? "Preparing..."
            : initializing
            ? "Initializing..."
            : "Link Bank"}
        </Text>
      </Pressable>
    </View>
  );
}

