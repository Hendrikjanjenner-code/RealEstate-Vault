import React, { useState } from 'react';
import {
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  getListDealsQueryKey,
  useListDeals,
  useToggleSaveDeal,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import colors from '@/constants/colors';
import { Badge, Card, EmptyState, ErrorState, LoadingState, ScreenHeader } from '@/components/VaultUI';
import { formatMillions, resolveImageUrl } from '@/lib/format';

const ASSET_CLASSES = ['All', 'Hotels', 'Offices', 'Logistics', 'Residential', 'Retail', 'Mixed-use'];

export default function DealsScreen() {
  const c = useColors();
  const [search, setSearch] = useState('');
  const [assetClass, setAssetClass] = useState('All');
  const [savedOnly, setSavedOnly] = useState(false);
  const params = {
    search: search || undefined,
    assetClass: assetClass === 'All' ? undefined : assetClass,
    savedOnly: savedOnly || undefined,
  };
  const { data: deals, isLoading, isError, error, refetch, isRefetching } = useListDeals(params);
  const toggleSave = useToggleSaveDeal();
  const queryClient = useQueryClient();

  const handleToggleSave = (id: number, currentSaved: boolean) => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleSave.mutate(
      { id },
      {
        onSuccess: () => {
          queryClient.setQueryData(getListDealsQueryKey(params), (old: any) => {
            if (!old) return old;
            if (savedOnly && currentSaved) {
              return old.filter((d: any) => d.id !== id);
            }
            return old.map((d: any) => (d.id === id ? { ...d, saved: !currentSaved } : d));
          });
        },
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="Deal Directory" subtitle="Confidential off-market opportunities" />
      <View style={{ paddingHorizontal: 20, paddingTop: 14, gap: 12 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: c.card,
            borderRadius: colors.radius,
            borderWidth: StyleSheet.hairlineWidth,
            borderColor: c.border,
            paddingHorizontal: 12,
            height: 44,
          }}
        >
          <Feather name="search" size={16} color={c.mutedForeground} />
          <TextInput
            testID="deal-search"
            value={search}
            onChangeText={setSearch}
            placeholder="Search deals..."
            placeholderTextColor={c.mutedForeground}
            style={{ flex: 1, color: c.foreground, fontSize: 14, fontFamily: 'Inter_400Regular' }}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Feather name="x" size={16} color={c.mutedForeground} />
            </Pressable>
          )}
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          <Pressable
            testID="filter-saved"
            onPress={() => setSavedOnly((s) => !s)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: savedOnly ? c.primary : c.secondary,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: savedOnly ? c.primary : c.border,
            })}
          >
            <Feather
              name="bookmark"
              size={13}
              color={savedOnly ? c.primaryForeground : c.mutedForeground}
            />
            <Text
              style={{
                color: savedOnly ? c.primaryForeground : c.mutedForeground,
                fontSize: 13,
                fontFamily: 'Inter_600SemiBold',
              }}
            >
              Saved
            </Text>
          </Pressable>
          {ASSET_CLASSES.map((ac) => {
            const active = assetClass === ac;
            return (
              <Pressable
                key={ac}
                testID={`filter-${ac}`}
                onPress={() => setAssetClass(ac)}
                style={({ pressed }) => ({
                  opacity: pressed ? 0.7 : 1,
                  paddingHorizontal: 14,
                  paddingVertical: 8,
                  borderRadius: 999,
                  backgroundColor: active ? c.primary : c.secondary,
                  borderWidth: StyleSheet.hairlineWidth,
                  borderColor: active ? c.primary : c.border,
                })}
              >
                <Text
                  style={{
                    color: active ? c.primaryForeground : c.mutedForeground,
                    fontSize: 13,
                    fontFamily: 'Inter_600SemiBold',
                  }}
                >
                  {ac}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState error={error} signInMessage="Sign in to browse live deals on the platform." onRetry={() => refetch()} />
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
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={c.primary} />
          }
          ListEmptyComponent={
            savedOnly ? (
              <EmptyState
                icon="bookmark"
                title="No saved deals"
                message="Tap the bookmark on any deal to save it for later."
              />
            ) : (
              <EmptyState icon="briefcase" title="No deals found" message="Try adjusting your search or filters." />
            )
          }
          renderItem={({ item: deal }) => {
            const hidden = deal.confidential && deal.status !== 'nda_signed';
            return (
              <Pressable
                testID={`deal-card-${deal.id}`}
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
                    <Pressable
                      testID={`save-${deal.id}`}
                      onPress={() => handleToggleSave(deal.id, deal.saved)}
                      hitSlop={8}
                      style={{
                        position: 'absolute',
                        top: 12,
                        left: 12,
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: 'rgba(8,31,27,0.75)',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Feather name="bookmark" size={15} color={deal.saved ? c.primary : c.foreground} />
                    </Pressable>
                  </View>
                  <View style={{ padding: 16, gap: 8 }}>
                    <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 16, fontFamily: 'Inter_700Bold' }}>
                      {hidden ? 'Confidential Opportunity' : deal.title}
                    </Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Feather name="map-pin" size={13} color={c.mutedForeground} />
                      <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                        {deal.locationPrivacy === 'country_only' && deal.status !== 'nda_signed'
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
