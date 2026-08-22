import React from 'react';
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  getListMandateMatchesQueryKey,
  useListMandateMatches,
  useListMandates,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Badge, Card, EmptyState, ErrorState, LoadingState, ScreenHeader } from '@/components/VaultUI';
import { formatMillions, resolveImageUrl } from '@/lib/format';

type YieldFit = 'meets' | 'below' | 'unknown';

function getYieldFit(
  grossYield: number | null | undefined,
  yieldTarget: number | null | undefined,
): YieldFit {
  if (yieldTarget == null || grossYield == null) return 'unknown';
  return grossYield >= yieldTarget ? 'meets' : 'below';
}

export default function MandateMatchesScreen() {
  const c = useColors();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam ?? 0);
  const { data: mandates } = useListMandates();
  const mandate = mandates?.find((m) => m.id === id);
  const { data: deals, isLoading, isError, refetch } = useListMandateMatches(id, {
    query: { enabled: !!id, queryKey: getListMandateMatchesQueryKey(id) },
  });

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title="Matching Deals"
        subtitle={mandate ? mandate.title : 'Deals fitting this mandate'}
        showBack
      />
      {mandate && (
        <View style={{ paddingHorizontal: 20, paddingTop: 14, gap: 8 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {mandate.assetClasses.map((ac) => (
              <Badge key={ac} label={ac} />
            ))}
            {mandate.countries.map((country) => (
              <Badge key={country} label={country} />
            ))}
            {mandate.yieldTarget != null && (
              <Badge label={`${mandate.yieldTarget}%+ yield`} gold />
            )}
          </View>
          <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
            Ticket size {formatMillions(mandate.minSize)} – {formatMillions(mandate.maxSize)}
          </Text>
        </View>
      )}
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={deals ?? []}
          keyExtractor={(d) => String(d.id)}
          scrollEnabled={!!deals && deals.length > 0}
          contentContainerStyle={{
            padding: 20,
            gap: 14,
            paddingBottom: Platform.OS === 'web' ? 118 : 96,
          }}
          ListEmptyComponent={
            <EmptyState
              icon="target"
              title="No matching deals"
              message="No listed deals currently fit this mandate's asset classes, countries, and size range."
            />
          }
          renderItem={({ item: deal }) => {
            const hidden = deal.confidential && deal.accessStatus !== 'granted';
            return (
              <Pressable
                testID={`match-deal-${deal.id}`}
                onPress={() => router.push(`/deal/${deal.id}`)}
                style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
              >
                <Card>
                  <View style={{ height: 150, backgroundColor: c.secondary }}>
                    {resolveImageUrl(deal.imageUrl) ? (
                      <Image
                        source={{ uri: resolveImageUrl(deal.imageUrl)! }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                        blurRadius={hidden ? 12 : 0}
                      />
                    ) : (
                      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                        <Feather name={hidden ? 'lock' : 'home'} size={28} color={hidden ? c.primary : c.mutedForeground} />
                      </View>
                    )}
                    {hidden && (
                      <View
                        style={{
                          ...StyleSheet.absoluteFillObject,
                          backgroundColor: 'rgba(8,31,27,0.55)',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6,
                        }}
                      >
                        <Feather name="lock" size={22} color={c.primary} />
                        <Text style={{ color: c.primary, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                          Confidential
                        </Text>
                      </View>
                    )}
                    <View style={{ position: 'absolute', top: 12, right: 12 }}>
                      <Badge label={deal.assetClass} gold />
                    </View>
                  </View>
                  <View style={{ padding: 16, gap: 8 }}>
                    <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }}>
                      {hidden ? 'Confidential Opportunity' : deal.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Feather name="map-pin" size={13} color={c.mutedForeground} />
                      <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                        {deal.locationPrivacy === 'country_only' && deal.accessStatus !== 'granted'
                          ? deal.country
                          : `${deal.city}, ${deal.country}`}
                      </Text>
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
                          Asking Price
                        </Text>
                        <Text style={{ color: c.foreground, fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 2 }}>
                          {formatMillions(deal.askingPrice)}
                        </Text>
                      </View>
                      {deal.grossYield != null && (
                        <View style={{ alignItems: 'flex-end' }}>
                          <Text style={{ color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                            Yield
                          </Text>
                          <Text style={{ color: c.primary, fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 2 }}>
                            {deal.grossYield}%
                          </Text>
                          {(() => {
                            const fit = getYieldFit(deal.grossYield, mandate?.yieldTarget);
                            if (fit === 'unknown') return null;
                            const meets = fit === 'meets';
                            return (
                              <Text
                                testID={`yield-fit-${deal.id}`}
                                style={{
                                  color: meets ? '#34d399' : '#fbbf24',
                                  fontSize: 11,
                                  fontFamily: 'Inter_600SemiBold',
                                  marginTop: 2,
                                }}
                              >
                                {meets ? 'Meets target' : 'Below target'}
                              </Text>
                            );
                          })()}
                        </View>
                      )}
                    </View>
                  </View>
                </Card>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}
