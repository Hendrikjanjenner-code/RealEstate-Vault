import React from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useListMandates } from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import colors from '@/constants/colors';
import { Badge, Card, EmptyState, ErrorState, LoadingState, ScreenHeader } from '@/components/VaultUI';
import { formatMillions } from '@/lib/format';

export default function MandatesScreen() {
  const c = useColors();
  const { data: mandates, isLoading, isError, refetch, isRefetching } = useListMandates();

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="Acquisition Mandates" subtitle="Active investor acquisition criteria" />
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={mandates ?? []}
          keyExtractor={(m) => String(m.id)}
          scrollEnabled={!!mandates && mandates.length > 0}
          contentContainerStyle={{
            padding: 20,
            gap: 14,
            paddingBottom: Platform.OS === 'web' ? 118 : 96,
          }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={c.primary} />
          }
          ListEmptyComponent={
            <EmptyState
              icon="target"
              title="No mandates yet"
              message="Investor acquisition mandates will appear here."
            />
          }
          renderItem={({ item: mandate }) => (
            <Pressable
              testID={`mandate-card-${mandate.id}`}
              onPress={() => router.push(`/mandate/${mandate.id}`)}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
            <Card>
              <View style={{ padding: 16, gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ flex: 1, color: c.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }}>
                    {mandate.title}
                  </Text>
                  <Badge label={mandate.status} gold={mandate.status === 'active'} />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Feather name="briefcase" size={13} color={c.mutedForeground} />
                  <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                    {mandate.investorName} · {mandate.investorType}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {mandate.assetClasses.map((ac) => (
                    <Badge key={ac} label={ac} />
                  ))}
                  {mandate.countries.map((country) => (
                    <Badge key={country} label={country} />
                  ))}
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    borderTopWidth: StyleSheet.hairlineWidth,
                    borderTopColor: c.border,
                    paddingTop: 10,
                    marginTop: 2,
                  }}
                >
                  <View>
                    <Text style={{ color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      Ticket Size
                    </Text>
                    <Text style={{ color: c.foreground, fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 2 }}>
                      {formatMillions(mandate.minSize)} – {formatMillions(mandate.maxSize)}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'center' }}>
                    <Text style={{ color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      Strategy
                    </Text>
                    <Text style={{ color: c.foreground, fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 2 }}>
                      {mandate.strategy}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                      Matches
                    </Text>
                    <Text style={{ color: c.primary, fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 2 }}>
                      {mandate.matches}
                    </Text>
                  </View>
                </View>
                {mandate.yieldTarget != null && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Feather name="trending-up" size={13} color={c.primary} />
                    <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                      Target yield {mandate.yieldTarget}%+
                    </Text>
                  </View>
                )}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  <Text style={{ color: c.primary, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                    View matching deals
                  </Text>
                  <Feather name="chevron-right" size={14} color={c.primary} />
                </View>
              </View>
            </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
