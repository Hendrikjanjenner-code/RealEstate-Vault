import React from 'react';
import { Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import {
  useGetDashboardStats,
  useListActivity,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Card, EmptyState, ErrorState, LoadingState, ScreenHeader } from '@/components/VaultUI';
import { NotificationsBell } from '@/components/NotificationsBell';
import { formatMillions, timeAgo } from '@/lib/format';

const ACTIVITY_ICONS: Record<string, keyof typeof Feather.glyphMap> = {
  access_request: 'key',
  nda_signed: 'check-circle',
  deal_created: 'plus-circle',
  message: 'message-circle',
  transaction: 'trending-up',
};

export default function DashboardScreen() {
  const c = useColors();
  const stats = useGetDashboardStats();
  const activity = useListActivity();

  const refreshing = stats.isRefetching || activity.isRefetching;
  const onRefresh = () => {
    stats.refetch();
    activity.refetch();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title="RealEstate Vault"
        subtitle="Private Deals. Trusted Access."
        right={<NotificationsBell />}
      />
      <ScrollView
        contentContainerStyle={{
          padding: 20,
          gap: 20,
          paddingBottom: Platform.OS === 'web' ? 118 : 96,
        }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={c.primary} />
        }
      >
        {stats.isLoading ? (
          <LoadingState />
        ) : stats.isError ? (
          <ErrorState onRetry={() => stats.refetch()} />
        ) : stats.data ? (
          <>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatCard icon="briefcase" label="Active Deals" value={String(stats.data.activeDeals)} />
              <StatCard icon="key" label="Access Requests" value={String(stats.data.accessRequests)} />
            </View>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatCard icon="check-circle" label="NDAs Signed" value={String(stats.data.ndasSigned)} />
              <StatCard icon="bookmark" label="Mandates" value={String(stats.data.activeMandates)} />
            </View>
            <Card style={{ padding: 18, gap: 14 }}>
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 1 }}>
                Pipeline
              </Text>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text style={{ color: c.foreground, fontSize: 26, fontFamily: 'Inter_700Bold' }}>
                    {formatMillions(stats.data.pipelineValue)}
                  </Text>
                  <Text style={styles.metricLabel(c)}>Pipeline value</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ color: c.primary, fontSize: 26, fontFamily: 'Inter_700Bold' }}>
                    {formatMillions(stats.data.closedVolume)}
                  </Text>
                  <Text style={styles.metricLabel(c)}>Closed volume</Text>
                </View>
              </View>
            </Card>
            <Card style={{ padding: 18, gap: 12 }}>
              <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 1 }}>
                Asset Classes
              </Text>
              {stats.data.assetClassBreakdown.map((a) => (
                <View key={a.assetClass} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ color: c.foreground, fontSize: 14, fontFamily: 'Inter_500Medium', width: 100 }}>
                    {a.assetClass}
                  </Text>
                  <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: c.secondary, overflow: 'hidden' }}>
                    <View
                      style={{
                        width: `${Math.min(100, (a.count / Math.max(1, Math.max(...stats.data!.assetClassBreakdown.map((x) => x.count)))) * 100)}%`,
                        height: 6,
                        backgroundColor: c.primary,
                      }}
                    />
                  </View>
                  <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: 'Inter_500Medium', width: 24, textAlign: 'right' }}>
                    {a.count}
                  </Text>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 1 }}>
          Recent Activity
        </Text>
        {activity.isLoading ? (
          <LoadingState />
        ) : activity.isError ? (
          <ErrorState onRetry={() => activity.refetch()} />
        ) : activity.data && activity.data.length > 0 ? (
          <Card>
            {activity.data.slice(0, 8).map((item, i) => (
              <View
                key={item.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 14,
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: c.border,
                }}
              >
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c.secondary, alignItems: 'center', justifyContent: 'center' }}>
                  <Feather name={ACTIVITY_ICONS[item.type] ?? 'activity'} size={15} color={c.primary} />
                </View>
                <Text style={{ flex: 1, color: c.foreground, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 }}>
                  {item.description}
                </Text>
                <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                  {timeAgo(item.createdAt)}
                </Text>
              </View>
            ))}
          </Card>
        ) : (
          <EmptyState icon="activity" title="No activity yet" />
        )}
      </ScrollView>
    </View>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Feather.glyphMap;
  label: string;
  value: string;
}) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, padding: 16, gap: 8 }}>
      <Feather name={icon} size={16} color={c.primary} />
      <Text style={{ color: c.foreground, fontSize: 24, fontFamily: 'Inter_700Bold' }}>{value}</Text>
      <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_500Medium' }}>{label}</Text>
    </Card>
  );
}

const styles = {
  metricLabel: (c: ReturnType<typeof useColors>) => ({
    color: c.mutedForeground,
    fontSize: 12,
    fontFamily: 'Inter_400Regular' as const,
    marginTop: 2,
  }),
};
