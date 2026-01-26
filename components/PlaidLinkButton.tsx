import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
  ActivityIndicator,
} from "react-native";
import { create, open } from "react-native-plaid-link-sdk";
import { getAuth } from "firebase/auth";

type Props = {
  baseUrl?: string; // e.g. http://192.168.12.239:3333
  onLinked?: () => Promise<void> | void;
};

export default function PlaidLinkButton({ baseUrl, onLinked }: Props) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [creatingToken, setCreatingToken] = useState(false);
  const [initializing, setInitializing] = useState(false);
  const [exchanging, setExchanging] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const resolvedBaseUrl =
    baseUrl?.trim() ||
    (process.env.EXPO_PUBLIC_API_URL as string | undefined) ||
    "";

  const normalizedBaseUrl = useMemo(
    () => resolvedBaseUrl.replace(/\/+$/, ""),
    [resolvedBaseUrl]
  );

  // Helper: get Bearer headers (backend requires this)
  const getAuthHeader = useCallback(async () => {
    const user = getAuth().currentUser;
    if (!user) throw new Error("No Firebase user");
    const idToken = await user.getIdToken(true);
    if (!idToken) throw new Error("Missing Firebase ID token");
    return { Authorization: `Bearer ${idToken}` };
  }, []);

  const createLinkToken = useCallback(async () => {
    if (!normalizedBaseUrl) {
      const msg =
        "Missing API base URL. Set EXPO_PUBLIC_API_URL in .env or pass baseUrl prop.";
      setErrMsg(msg);
      Alert.alert("Plaid", msg);
      return;
    }

    setErrMsg(null);
    setCreatingToken(true);

    try {
      const url = `${normalizedBaseUrl}/plaid/link-token`;
      console.log("PLAID Base URL:", normalizedBaseUrl);
      console.log("PLAID link-token URL:", url);

      // If your backend protects this route, send auth.
      // If it doesn't, this still works.
      let authHeader: Record<string, string> = {};
      try {
        authHeader = await getAuthHeader();
      } catch {
        // allow link-token without auth if backend allows it
      }

      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeader,
        },
        body: JSON.stringify({}), // ✅ keep for Fastify JSON parsing
      });

      const text = await res.text();
      if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

      const json = JSON.parse(text);
      const token = json?.link_token ?? json?.linkToken;
      if (!token) throw new Error("Backend did not return link_token");

      setLinkToken(token);
    } catch (e: any) {
      console.error("createLinkToken error:", e);
      const msg = e?.message || "Failed to create link token";
      setErrMsg(msg);
      Alert.alert("Plaid", msg);
    } finally {
      setCreatingToken(false);
    }
  }, [normalizedBaseUrl, getAuthHeader]);

  // preload token once base URL is available
  useEffect(() => {
    if (!normalizedBaseUrl) return;
    createLinkToken();
  }, [normalizedBaseUrl, createLinkToken]);

  // initialize native Plaid session when token changes
  useEffect(() => {
    if (!linkToken) return;

    try {
      setInitializing(true);
      create({ token: linkToken });
      setErrMsg(null);
    } catch (e: any) {
      console.error("Plaid create() error:", e);
      const msg = e?.message || "Failed to initialize Plaid Link";
      setErrMsg(msg);
      Alert.alert("Plaid", msg);
    } finally {
      setInitializing(false);
    }
  }, [linkToken]);

  const exchangePublicToken = useCallback(
    async (publicToken: string) => {
      if (!normalizedBaseUrl) return;

      setErrMsg(null);
      setExchanging(true);

      try {
        const url = `${normalizedBaseUrl}/plaid/exchange-token`;
        const authHeader = await getAuthHeader();

        console.log("PLAID exchange URL:", url);

        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...authHeader,
          },
          body: JSON.stringify({ public_token: publicToken }),
        });

        const text = await res.text();
        if (!res.ok) throw new Error(text || `HTTP ${res.status}`);

        await onLinked?.();
        Alert.alert("Plaid", "Bank linked successfully ✅");

        // regenerate a fresh token after success (optional)
        setLinkToken(null);
        createLinkToken();
      } catch (e: any) {
        console.error("exchangePublicToken error:", e);
        setErrMsg(e?.message || "Failed to exchange token");
        Alert.alert("Plaid", e?.message || "Exchange failed");
      } finally {
        setExchanging(false);
      }
    },
    [normalizedBaseUrl, onLinked, createLinkToken, getAuthHeader]
  );

  const onPress = useCallback(() => {
    if (!normalizedBaseUrl) return;
    if (!linkToken) return createLinkToken();
    if (creatingToken || exchanging || initializing) return;

    try {
      open({
        onSuccess: (success) => {
          console.log("Plaid onSuccess:", success);

          const publicToken =
            (success as any)?.publicToken || (success as any)?.public_token;

          if (!publicToken) {
            Alert.alert("Plaid", "Missing public token from Plaid success.");
            return;
          }

          exchangePublicToken(publicToken);
        },
        onExit: (exit) => {
          console.log("Plaid onExit:", exit);
        },
      });
    } catch (e: any) {
      console.error("Plaid open() error:", e);
      const msg = e?.message || "Failed to open Plaid Link";
      setErrMsg(msg);
      Alert.alert("Plaid", msg);
    }
  }, [
    normalizedBaseUrl,
    linkToken,
    creatingToken,
    exchanging,
    initializing,
    createLinkToken,
    exchangePublicToken,
  ]);

  const disabled =
    creatingToken || exchanging || initializing || !normalizedBaseUrl;

  const buttonTitle = useMemo(() => {
    if (!normalizedBaseUrl) return "Missing API URL";
    if (creatingToken) return "Creating Link Token…";
    if (initializing) return "Preparing Plaid…";
    if (exchanging) return "Linking Account…";
    if (!linkToken) return "Retry: Create Link Token";
    return "Link a Bank Account (Plaid)";
  }, [creatingToken, initializing, exchanging, linkToken, normalizedBaseUrl]);

  return (
    <View style={styles.wrap}>
      <Pressable
        style={({ pressed }) => [
          styles.btn,
          disabled ? styles.btnDisabled : null,
          pressed && !disabled ? styles.btnPressed : null,
        ]}
        onPress={onPress}
        disabled={disabled}
      >
        <View style={styles.row}>
          {(creatingToken || initializing || exchanging) && (
            <ActivityIndicator />
          )}
          <Text style={styles.btnText}>{buttonTitle}</Text>
        </View>
      </Pressable>

      {!!errMsg && <Text style={styles.errText}>{errMsg}</Text>}

      {!!normalizedBaseUrl && (
        <Text style={styles.hintText}>Base URL: {normalizedBaseUrl}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#0B1220",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
    marginBottom: 12,
  },
  btn: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  btnDisabled: { opacity: 0.6 },
  btnPressed: { transform: [{ scale: 0.99 }] },
  btnText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
    textAlign: "center",
  },
  row: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  errText: { marginTop: 10, color: "#FCA5A5", fontSize: 13 },
  hintText: { marginTop: 8, color: "rgba(255,255,255,0.55)", fontSize: 12 },
});
