import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View, RefreshControl } from "react-native";
import { getDashboard, getEvents, getAccounts, getTransactions } from "../api/apiClient";
import PlaidLinkButton from "../components/PlaidLinkButton";

export default function DashboardScreen() {
  const [dashboard, setDashboard] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  // IMPORTANT:
  // Simulator/phone cannot reach your Mac via localhost.
  // Use your Mac’s LAN IP, e.g. http://192.168.12.239:3333
  const BASE_URL = useMemo(() => {
    // swap this to your machine IP if needed
    return "http://192.168.12.239:3333";
  }, []);

  const loadData = useCallback(async () => {
    setErrorText(null);
    setLoading(true);
    try {
      const [dash, ev, accts, txs] = await Promise.all([
        getDashboard(),
        getEvents(),
        getAccounts(),
        getTransactions(),
      ]);

      setDashboard(dash);
      setEvents(ev);
      setAccounts(accts);
      setTransactions(txs);
    } catch (err: any) {
      console.error("Dashboard loadData error:", err);
      setErrorText(err?.message || "Failed to load dashboard data");
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshPlaidData = useCallback(async () => {
    // call after plaid link succeeds
    try {
      const [accts, txs] = await Promise.all([getAccounts(), getTransactions()]);
      setAccounts(accts);
      setTransactions(txs);
    } catch (err) {
      console.error("refreshPlaidData error:", err);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onPullRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  return (
    <ScrollView
      style={styles.page}
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />}
    >
      {/* ALWAYS VISIBLE TOP SECTION */}
      <Text style={styles.title}>Dashboard</Text>

      <PlaidLinkButton baseUrl={BASE_URL} onLinked={refreshPlaidData} />

      {!!errorText && (
        <View style={styles.cardError}>
          <Text style={styles.cardTitle}>Error</Text>
          <Text style={styles.muted}>{errorText}</Text>
        </View>
      )}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Status</Text>
        <Text style={styles.muted}>
          {loading ? "Loading…" : "Loaded ✅"}
        </Text>
        <Text style={styles.muted}>Accounts: {accounts?.length ?? 0}</Text>
        <Text style={styles.muted}>Transactions: {transactions?.length ?? 0}</Text>
        <Text style={styles.muted}>Events: {events?.length ?? 0}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Vaults / Dashboard</Text>
        <Text style={styles.muted}>
          {dashboard ? JSON.stringify(dashboard, null, 2) : "No dashboard data yet"}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Accounts</Text>
        {accounts?.length ? (
          accounts.map((a: any, idx: number) => (
            <View key={a?.account_id ?? idx} style={styles.rowLine}>
              <Text style={styles.rowMain}>{a?.name ?? "Account"}</Text>
              <Text style={styles.rowSub}>{a?.subtype ?? a?.type ?? ""}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>No accounts yet. Link one above.</Text>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Transactions</Text>
        {transactions?.length ? (
          transactions.slice(0, 20).map((t: any, idx: number) => (
            <View key={t?.transaction_id ?? idx} style={styles.rowLine}>
              <Text style={styles.rowMain}>{t?.name ?? "Transaction"}</Text>
              <Text style={styles.rowSub}>
                {t?.amount != null ? `$${t.amount}` : ""} {t?.date ? `• ${t.date}` : ""}
              </Text>
            </View>
          ))
        ) : (
          <Text style={styles.muted}>No transactions yet.</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#070B14" },
  container: { padding: 16, paddingBottom: 40 },
  title: { color: "white", fontSize: 28, fontWeight: "800", marginBottom: 12 },

  card: {
    backgroundColor: "#0B1220",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  cardError: {
    backgroundColor: "rgba(239,68,68,0.12)",
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "rgba(239,68,68,0.35)",
  },
  cardTitle: { color: "white", fontSize: 16, fontWeight: "800", marginBottom: 8 },
  muted: { color: "rgba(255,255,255,0.65)", fontSize: 13 },
  rowLine: { paddingVertical: 10, borderTopWidth: 1, borderTopColor: "rgba(255,255,255,0.08)" },
  rowMain: { color: "white", fontWeight: "700" },
  rowSub: { color: "rgba(255,255,255,0.65)", marginTop: 2, fontSize: 12 },
});
