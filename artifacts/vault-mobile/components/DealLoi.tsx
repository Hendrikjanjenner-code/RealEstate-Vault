import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useQueryClient } from '@tanstack/react-query';
import {
  getGetLoiDraftQueryKey,
  getListDealLoisQueryKey,
  useGetLoiDraft,
  useListDealLois,
  useSubmitLoi,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import colors from '@/constants/colors';
import { Card, GoldButton } from '@/components/VaultUI';
import { openLoiRecord } from '@/lib/loi-record';

const STATUS_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  accepted: 'Accepted',
  rejected: 'Rejected',
};

function StatusBadge({ status }: { status: string }) {
  const c = useColors();
  const tint =
    status === 'accepted'
      ? c.primary
      : status === 'rejected'
        ? c.destructive
        : status === 'under_review'
          ? '#D9A441'
          : c.mutedForeground;
  return (
    <View
      testID={`badge-loi-status-${status}`}
      style={{
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        borderWidth: 1,
        borderColor: tint,
      }}
    >
      <Text style={{ color: tint, fontSize: 10, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 1 }}>
        {STATUS_LABEL[status] ?? status.replace(/_/g, ' ')}
      </Text>
    </View>
  );
}

/**
 * Letter of Intent step on the mobile deal screen (investor-side).
 * After the NDA is signed, the investor can open the pre-generated LOI
 * draft, fill in their terms and submit; afterwards the status of their
 * open LOI is shown and the printable record can be opened.
 */
export function DealLoiSection({ dealId, ndaSigned }: { dealId: number; ndaSigned: boolean }) {
  const c = useColors();
  const queryClient = useQueryClient();
  const [preparing, setPreparing] = useState(false);
  const [offerPrice, setOfferPrice] = useState('');
  const [conditions, setConditions] = useState('');
  const [exclusivityDays, setExclusivityDays] = useState('');
  const [validityDays, setValidityDays] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [recordLoading, setRecordLoading] = useState(false);
  const [recordError, setRecordError] = useState<string | null>(null);

  const { data: loiData } = useListDealLois(dealId, {
    query: { enabled: !!dealId, queryKey: getListDealLoisQueryKey(dealId) },
  });
  const { data: draft } = useGetLoiDraft(dealId, {
    query: {
      enabled: ndaSigned && preparing,
      queryKey: getGetLoiDraftQueryKey(dealId),
    },
  });
  const submitLoi = useSubmitLoi();

  const canManage = loiData?.canManage ?? false;
  const lois = loiData?.lois ?? [];
  const myOpenLoi = !canManage ? lois.find((l) => l.status !== 'rejected') : undefined;

  // Nothing to show: managers review LOIs on the web, and investors only see
  // this step once their NDA is signed or they already have an LOI.
  if (canManage || (!ndaSigned && lois.length === 0)) return null;

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: getListDealLoisQueryKey(dealId) });

  const handleSubmit = () => {
    const price = Number(offerPrice);
    const excl = Number(exclusivityDays || draft?.defaults.exclusivityDays || 45);
    const val = Number(validityDays || draft?.defaults.validityDays || 14);
    if (!Number.isFinite(price) || price <= 0) {
      setFormError('Enter a valid offered price.');
      return;
    }
    if (!Number.isFinite(excl) || excl < 1 || excl > 365) {
      setFormError('Exclusivity must be between 1 and 365 days.');
      return;
    }
    if (!Number.isFinite(val) || val < 1 || val > 180) {
      setFormError('Validity must be between 1 and 180 days.');
      return;
    }
    setFormError(null);
    submitLoi.mutate(
      {
        id: dealId,
        data: {
          offerPrice: price,
          conditions: conditions.trim() || undefined,
          exclusivityDays: excl,
          validityDays: val,
        },
      },
      {
        onSuccess: () => {
          if (Platform.OS !== 'web') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          setPreparing(false);
          invalidate();
        },
        onError: () => setFormError('Submission failed. Please review your terms and try again.'),
      },
    );
  };

  const viewRecord = async (loiId: number) => {
    setRecordError(null);
    setRecordLoading(true);
    try {
      await openLoiRecord(loiId);
    } catch {
      setRecordError('Could not open your LOI record. Please try again.');
    } finally {
      setRecordLoading(false);
    }
  };

  return (
    <Card style={{ padding: 18, gap: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Feather name="file-text" size={16} color={c.primary} />
        <Text style={{ color: c.foreground, fontSize: 15, fontFamily: 'Inter_700Bold' }}>Letter of Intent</Text>
      </View>

      {/* Own LOI status + record */}
      {myOpenLoi && (
        <View style={{ gap: 10 }} testID="card-my-loi">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text style={{ color: c.foreground, fontSize: 13, fontFamily: 'Inter_500Medium' }}>
              Submitted {new Date(myOpenLoi.submittedAt).toLocaleDateString()}
            </Text>
            <StatusBadge status={myOpenLoi.status} />
          </View>
          <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
            Offer {myOpenLoi.currency} {myOpenLoi.offerPrice.toLocaleString('en-US')} {'\u00B7'} exclusivity {myOpenLoi.exclusivityDays}d {'\u00B7'} valid {myOpenLoi.validityDays}d
          </Text>
          <GoldButton
            testID="button-view-loi-record"
            label={recordLoading ? 'Opening...' : 'View LOI Record'}
            icon="file-text"
            variant="outline"
            loading={recordLoading}
            onPress={() => viewRecord(myOpenLoi.id)}
          />
          {recordError && (
            <Text style={{ color: c.destructive, fontSize: 13, fontFamily: 'Inter_500Medium' }}>{recordError}</Text>
          )}
        </View>
      )}

      {/* Prepare */}
      {!myOpenLoi && ndaSigned && !preparing && (
        <View style={{ gap: 10 }}>
          <Text style={{ color: c.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 19 }}>
            Your NDA is signed. A Letter of Intent pre-filled with the deal facts is ready for you.
          </Text>
          <GoldButton
            testID="button-prepare-loi"
            label="Prepare LOI"
            icon="edit-3"
            onPress={() => setPreparing(true)}
          />
        </View>
      )}

      {/* Draft preview + terms form */}
      {!myOpenLoi && ndaSigned && preparing && (
        <View style={{ gap: 12 }} testID="form-loi">
          <View
            style={{
              backgroundColor: c.secondary,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: c.border,
              borderRadius: colors.radius,
              padding: 14,
              gap: 8,
              maxHeight: 220,
              overflow: 'hidden',
            }}
          >
            <Text style={{ color: c.foreground, fontSize: 11, fontFamily: 'Inter_700Bold', textTransform: 'uppercase', letterSpacing: 1 }}>
              {draft?.title ?? 'Letter of Intent'}
            </Text>
            {(draft?.paragraphs ?? []).map((p, i) => (
              <Text key={i} style={{ color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 }}>
                {p}
              </Text>
            ))}
          </View>
          <LabeledField
            testID="input-loi-offer"
            label={`Offered Price${draft ? ` (${draft.currency})` : ''}`}
            placeholder={draft?.askingPrice != null ? String(draft.askingPrice) : 'Amount'}
            value={offerPrice}
            onChangeText={setOfferPrice}
          />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <LabeledField
                testID="input-loi-exclusivity"
                label="Exclusivity (days)"
                placeholder={String(draft?.defaults.exclusivityDays ?? 45)}
                value={exclusivityDays}
                onChangeText={setExclusivityDays}
              />
            </View>
            <View style={{ flex: 1 }}>
              <LabeledField
                testID="input-loi-validity"
                label="Validity (days)"
                placeholder={String(draft?.defaults.validityDays ?? 14)}
                value={validityDays}
                onChangeText={setValidityDays}
              />
            </View>
          </View>
          <LabeledField
            testID="input-loi-conditions"
            label="Additional Conditions (optional)"
            placeholder="e.g. subject to board approval"
            value={conditions}
            onChangeText={setConditions}
            keyboardType="default"
          />
          {formError && (
            <Text style={{ color: c.destructive, fontSize: 13, fontFamily: 'Inter_500Medium' }}>{formError}</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <GoldButton testID="button-loi-back" label="Back" variant="outline" onPress={() => setPreparing(false)} />
            </View>
            <View style={{ flex: 1 }}>
              <GoldButton
                testID="button-submit-loi"
                label={submitLoi.isPending ? 'Submitting...' : 'Submit LOI'}
                icon="send"
                loading={submitLoi.isPending}
                onPress={handleSubmit}
              />
            </View>
          </View>
        </View>
      )}
    </Card>
  );
}

function LabeledField({
  label,
  value,
  onChangeText,
  placeholder,
  testID,
  keyboardType = 'numeric',
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  testID?: string;
  keyboardType?: 'numeric' | 'default';
}) {
  const c = useColors();
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ color: c.mutedForeground, fontSize: 10, fontFamily: 'Inter_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.8 }}>
        {label}
      </Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.mutedForeground}
        keyboardType={keyboardType}
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
    </View>
  );
}
