import React, { useState } from 'react';
import { useDealAccessState } from '@/hooks/useDealAccessState';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import {
  getGetDealQueryKey,
  getListDealDocumentsQueryKey,
  useGetDeal,
  useListDealDocuments,
  useRequestDealAccess,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';
import { useColors } from '@/hooks/useColors';
import colors from '@/constants/colors';
import { Badge, Card, ErrorState, GoldButton, LoadingState, ScreenHeader } from '@/components/VaultUI';
import { formatMillions, resolveImageUrl } from '@/lib/format';

import type { AccessState } from '@/hooks/useDealAccessState';

export default function DealDetailScreen() {
  const c = useColors();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam ?? 0);
  const { data: deal, isLoading, isError, refetch } = useGetDeal(id, {
    query: { enabled: !!id, queryKey: getGetDealQueryKey(id) },
  });
  const { data: docs, isError: docsError } = useListDealDocuments(id, {
    query: { enabled: !!id, queryKey: getListDealDocumentsQueryKey(id) },
  });
  const requestAccess = useRequestDealAccess();
  const { accessState, setAccessState, hydrated } = useDealAccessState(id);
  const [form, setForm] = useState({ requesterName: '', requesterCompany: '', message: '' });
  const [formError, setFormError] = useState<string | null>(null);

  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title="Deal" showBack />
        <ErrorState onRetry={() => refetch()} />
      </View>
    );
  }

  if (isLoading || !deal || !hydrated) {
    return (
      <View style={{ flex: 1, backgroundColor: c.background }}>
        <ScreenHeader title="Deal" showBack />
        <LoadingState />
      </View>
    );
  }

  const effectiveAccess: AccessState = deal.confidential ? accessState : 'granted';
  const restricted = effectiveAccess !== 'granted';

  const submitRequest = () => {
    if (!form.requesterName.trim() || !form.requesterCompany.trim()) {
      setFormError('Please provide your name and company.');
      return;
    }
    setFormError(null);
    requestAccess.mutate(
      {
        id,
        data: {
          requesterName: form.requesterName.trim(),
          requesterCompany: form.requesterCompany.trim(),
          ...(form.message.trim() ? { message: form.message.trim() } : {}),
        },
      },
      {
        onSuccess: () => {
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setAccessState('requested');
        },
        onError: () => setFormError('Request failed. Please try again.'),
      },
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={restricted ? 'Confidential Opportunity' : deal.title}
        subtitle={
          deal.locationPrivacy === 'country_only' && restricted
            ? deal.country
            : `${deal.city}, ${deal.country}`
        }
        showBack
      />
      <KeyboardAwareScrollViewCompat
        bottomOffset={40}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          padding: 20,
          gap: 20,
          paddingBottom: Platform.OS === 'web' ? 74 : 40,
        }}
      >
        {/* Hero */}
        <Card>
          <View style={{ height: 190, backgroundColor: c.secondary }}>
            {resolveImageUrl(deal.imageUrl) ? (
              <Image
                source={{ uri: resolveImageUrl(deal.imageUrl)! }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
                blurRadius={restricted ? 14 : 0}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Feather name="home" size={36} color={c.mutedForeground} />
              </View>
            )}
            {restricted && (
              <View
                style={{
                  ...StyleSheet.absoluteFillObject,
                  backgroundColor: 'rgba(8,31,27,0.6)',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                }}
              >
                <View
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 26,
                    backgroundColor: 'rgba(200,169,90,0.15)',
                    borderWidth: 1,
                    borderColor: 'rgba(200,169,90,0.4)',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name="lock" size={22} color={c.primary} />
                </View>
                <Text style={{ color: c.primary, fontSize: 11, fontFamily: 'Inter_700Bold', letterSpacing: 1.5, textTransform: 'uppercase' }}>
                  Confidential
                </Text>
              </View>
            )}
            <View style={{ position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 6 }}>
              <Badge label={deal.assetClass} gold />
              <Badge label={deal.dealType.replace('_', ' ')} />
            </View>
          </View>
        </Card>

        {/* Metrics */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Metric label="Asking Price" value={formatMillions(deal.askingPrice)} />
          <Metric label="Gross Yield" value={deal.grossYield != null ? `${deal.grossYield}%` : 'N/A'} />
          <Metric label="Area" value={deal.areaSqm != null ? `${deal.areaSqm.toLocaleString()} sqm` : 'N/A'} />
          <Metric label="Occupancy" value={deal.occupancyPct != null ? `${deal.occupancyPct}%` : 'N/A'} />
        </View>

        {/* Access flow */}
        {deal.confidential && (
          <Card style={{ padding: 18, gap: 14 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Feather name="shield" size={16} color={c.primary} />
              <Text style={{ color: c.foreground, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Access Status</Text>
            </View>
            <View style={{ gap: 10 }}>
              <Step label="Request Access" done={effectiveAccess !== 'locked'} />
              <Step label="NDA Signature" done={effectiveAccess === 'granted'} />
              <Step label="Full Data Room" done={effectiveAccess === 'granted'} last />
            </View>

            {effectiveAccess === 'locked' && (
              <View style={{ gap: 10, marginTop: 4 }}>
                <Field
                  testID="req-name"
                  placeholder="Your name"
                  value={form.requesterName}
                  onChangeText={(v) => setForm((f) => ({ ...f, requesterName: v }))}
                />
                <Field
                  testID="req-company"
                  placeholder="Firm or family office"
                  value={form.requesterCompany}
                  onChangeText={(v) => setForm((f) => ({ ...f, requesterCompany: v }))}
                />
                <Field
                  testID="req-message"
                  placeholder="Message (optional)"
                  value={form.message}
                  onChangeText={(v) => setForm((f) => ({ ...f, message: v }))}
                />
                {formError && (
                  <Text style={{ color: c.destructive, fontSize: 13, fontFamily: 'Inter_500Medium' }}>{formError}</Text>
                )}
                <GoldButton
                  testID="request-access"
                  label="Request Access"
                  icon="key"
                  loading={requestAccess.isPending}
                  onPress={submitRequest}
                />
              </View>
            )}
            {effectiveAccess === 'requested' && (
              <View style={{ gap: 12, alignItems: 'center', paddingVertical: 6 }}>
                <Feather name="clock" size={20} color={c.primary} />
                <Text style={{ color: c.foreground, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>Request Pending</Text>
                <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 19 }}>
                  The broker is reviewing your profile. You will be notified when the NDA is ready to sign.
                </Text>
                <View style={{ alignSelf: 'stretch' }}>
                  <GoldButton
                    testID="simulate-nda"
                    label="Simulate NDA Signature (demo)"
                    icon="edit-3"
                    variant="outline"
                    onPress={() => {
                      if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      setAccessState('granted');
                    }}
                  />
                </View>
              </View>
            )}
            {effectiveAccess === 'granted' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: 'rgba(200,169,90,0.1)', borderRadius: colors.radius, padding: 12 }}>
                <Feather name="check-circle" size={18} color={c.primary} />
                <Text style={{ flex: 1, color: c.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
                  Access granted. Full data room unlocked.
                </Text>
              </View>
            )}
          </Card>
        )}

        {/* Overview */}
        <Card style={{ padding: 18, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="info" size={16} color={c.primary} />
            <Text style={{ color: c.foreground, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Investment Overview</Text>
          </View>
          <Text style={{ color: c.mutedForeground, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 21, fontStyle: restricted ? 'italic' : 'normal' }}>
            {restricted
              ? deal.teaser || 'Detailed description is locked until the NDA is signed.'
              : deal.description || 'No description provided.'}
          </Text>
        </Card>

        {/* Data room */}
        <Card style={{ padding: 18, gap: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Feather name="folder" size={16} color={c.primary} />
            <Text style={{ color: c.foreground, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Secure Data Room</Text>
          </View>
          {docsError ? (
            <Text style={{ color: c.destructive, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
              Could not load documents. Pull to refresh or try again later.
            </Text>
          ) : !docs || docs.length === 0 ? (
            <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
              No documents uploaded yet.
            </Text>
          ) : (
            docs.map((doc, i) => {
              const locked = doc.ndaRequired && effectiveAccess !== 'granted';
              return (
                <View
                  key={doc.id}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingTop: i === 0 ? 0 : 12,
                    borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                    borderTopColor: c.border,
                  }}
                >
                  <View
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 10,
                      backgroundColor: locked ? c.secondary : 'rgba(200,169,90,0.12)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Feather name={locked ? 'lock' : 'file-text'} size={15} color={locked ? c.mutedForeground : c.primary} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: locked ? c.mutedForeground : c.foreground, fontSize: 14, fontFamily: 'Inter_500Medium' }}>
                      {doc.name}
                    </Text>
                    <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 }}>
                      {doc.category} {'\u2022'} {(doc.sizeKb / 1024).toFixed(1)} MB
                    </Text>
                  </View>
                  <Feather name={locked ? 'slash' : 'download'} size={17} color={locked ? c.mutedForeground : c.primary} />
                </View>
              );
            })
          )}
        </Card>

        {/* Broker */}
        {deal.brokerName ? (
          <Card style={{ padding: 18, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: c.secondary,
                borderWidth: StyleSheet.hairlineWidth,
                borderColor: c.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ color: c.primary, fontSize: 17, fontFamily: 'Inter_700Bold' }}>
                {deal.brokerName.charAt(0)}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                Represented By
              </Text>
              <Text style={{ color: c.foreground, fontSize: 15, fontFamily: 'Inter_600SemiBold', marginTop: 2 }}>
                {deal.brokerName}
              </Text>
              {deal.brokerCompany ? (
                <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 1 }}>
                  {deal.brokerCompany}
                </Text>
              ) : null}
            </View>
          </Card>
        ) : null}
      </KeyboardAwareScrollViewCompat>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const c = useColors();
  return (
    <View
      style={{
        flexBasis: '47%',
        flexGrow: 1,
        backgroundColor: c.card,
        borderRadius: colors.radius,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.border,
        padding: 14,
        gap: 4,
      }}
    >
      <Text style={{ color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
      <Text style={{ color: c.foreground, fontSize: 18, fontFamily: 'Inter_700Bold' }}>{value}</Text>
    </View>
  );
}

function Step({ label, done, last = false }: { label: string; done: boolean; last?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: 2,
          borderColor: done ? c.primary : c.border,
          backgroundColor: done ? c.primary : 'transparent',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {done && <Feather name="check" size={12} color={c.primaryForeground} />}
      </View>
      <Text style={{ color: done ? c.foreground : c.mutedForeground, fontSize: 13, fontFamily: 'Inter_500Medium' }}>
        {label}
      </Text>
    </View>
  );
}

function Field({
  value,
  onChangeText,
  placeholder,
  testID,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  testID?: string;
}) {
  const c = useColors();
  return (
    <TextInput
      testID={testID}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={c.mutedForeground}
      style={{
        backgroundColor: c.secondary,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: c.border,
        borderRadius: colors.radius,
        paddingHorizontal: 14,
        height: 46,
        color: c.foreground,
        fontSize: 14,
        fontFamily: 'Inter_400Regular',
      }}
    />
  );
}
