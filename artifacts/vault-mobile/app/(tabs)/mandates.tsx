import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import {
  getListMandatesQueryKey,
  useCreateMandate,
  useListMandates,
} from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';
import colors from '@/constants/colors';
import {
  Badge,
  Card,
  EmptyState,
  ErrorState,
  GoldButton,
  LoadingState,
  ScreenHeader,
} from '@/components/VaultUI';
import { formatMillions } from '@/lib/format';
import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAwareScrollViewCompat } from '@/components/KeyboardAwareScrollViewCompat';

export default function MandatesScreen() {
  const c = useColors();
  const { data: mandates, isLoading, isError, refetch, isRefetching } = useListMandates();
  const [showForm, setShowForm] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title="Acquisition Mandates"
        subtitle="Active investor acquisition criteria"
        right={
          <Pressable
            testID="new-mandate-button"
            onPress={() => setShowForm(true)}
            hitSlop={8}
            style={({ pressed }) => ({
              opacity: pressed ? 0.8 : 1,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              backgroundColor: c.primary,
              borderRadius: colors.radius,
              paddingHorizontal: 14,
              height: 38,
            })}
          >
            <Feather name="plus" size={16} color={c.primaryForeground} />
            <Text style={{ color: c.primaryForeground, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
              New
            </Text>
          </Pressable>
        }
      />
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
      <NewMandateModal visible={showForm} onClose={() => setShowForm(false)} />
    </View>
  );
}

function NewMandateModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const createMandate = useCreateMandate();

  const [title, setTitle] = useState('');
  const [investorName, setInvestorName] = useState('');
  const [investorType, setInvestorType] = useState('family_office');
  const [assetClasses, setAssetClasses] = useState<string[]>([]);
  const [countries, setCountries] = useState<string[]>([]);
  const [minSize, setMinSize] = useState('');
  const [maxSize, setMaxSize] = useState('');
  const [strategy, setStrategy] = useState('core');
  const [yieldTarget, setYieldTarget] = useState('');
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setTitle('');
    setInvestorName('');
    setInvestorType('family_office');
    setAssetClasses([]);
    setCountries([]);
    setMinSize('');
    setMaxSize('');
    setStrategy('core');
    setYieldTarget('');
    setError(null);
  };

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) => {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  };

  const handleSubmit = () => {
    setError(null);
    if (!title.trim()) return setError('Please enter a mandate title.');
    if (!investorName.trim()) return setError('Please enter the investor name.');
    if (assetClasses.length === 0) return setError('Select at least one asset class.');
    if (countries.length === 0) return setError('Select at least one country.');
    const min = Number(minSize);
    const max = Number(maxSize);
    if (!minSize || Number.isNaN(min) || min <= 0) return setError('Enter a valid minimum size in €M.');
    if (!maxSize || Number.isNaN(max) || max <= 0) return setError('Enter a valid maximum size in €M.');
    if (max < min) return setError('Maximum size must be at least the minimum size.');
    let yt: number | undefined;
    if (yieldTarget.trim()) {
      yt = Number(yieldTarget);
      if (Number.isNaN(yt) || yt <= 0) return setError('Enter a valid yield target, or leave it blank.');
    }

    createMandate.mutate(
      {
        data: {
          title: title.trim(),
          investorName: investorName.trim(),
          investorType,
          assetClasses,
          countries,
          minSize: min * 1_000_000,
          maxSize: max * 1_000_000,
          strategy,
          ...(yt != null ? { yieldTarget: yt } : {}),
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMandatesQueryKey() });
          reset();
          onClose();
        },
        onError: () => setError('Could not create the mandate. Please try again.'),
      },
    );
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
        <View
          style={{
            backgroundColor: c.background,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '90%',
            paddingBottom: Math.max(insets.bottom, 16),
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              paddingHorizontal: 20,
              paddingTop: 18,
              paddingBottom: 12,
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: c.border,
            }}
          >
            <Text style={{ color: c.foreground, fontSize: 18, fontFamily: 'Inter_700Bold' }}>
              New Mandate
            </Text>
            <Pressable
              testID="close-mandate-form"
              onPress={onClose}
              hitSlop={10}
              style={({ pressed }) => ({
                opacity: pressed ? 0.6 : 1,
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: c.secondary,
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Feather name="x" size={18} color={c.mutedForeground} />
            </Pressable>
          </View>
          <KeyboardAwareScrollViewCompat
            contentContainerStyle={{ padding: 20, gap: 16 }}
            showsVerticalScrollIndicator={false}
          >
            <FormField label="Mandate Title">
              <Input
                testID="mandate-title-input"
                value={title}
                onChangeText={setTitle}
                placeholder="e.g. Core European Office Acquisition"
              />
            </FormField>
            <FormField label="Investor Name (Confidential)">
              <Input
                testID="mandate-investor-input"
                value={investorName}
                onChangeText={setInvestorName}
                placeholder="e.g. Alpine Family Office"
              />
            </FormField>
            <FormField label="Investor Type">
              <ChipRow
                options={INVESTOR_TYPES}
                selected={[investorType]}
                onToggle={(v) => setInvestorType(v)}
              />
            </FormField>
            <FormField label="Asset Classes">
              <ChipRow
                options={ASSET_CLASSES.map((v) => ({ value: v, label: v.replace('_', ' ') }))}
                selected={assetClasses}
                onToggle={(v) => toggle(assetClasses, setAssetClasses, v)}
              />
            </FormField>
            <FormField label="Countries">
              <ChipRow
                options={COUNTRIES.map((v) => ({ value: v, label: v }))}
                selected={countries}
                onToggle={(v) => toggle(countries, setCountries, v)}
              />
            </FormField>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                <FormField label="Min Size (€M)">
                  <Input
                    testID="mandate-min-input"
                    value={minSize}
                    onChangeText={setMinSize}
                    placeholder="25"
                    keyboardType="numeric"
                  />
                </FormField>
              </View>
              <View style={{ flex: 1 }}>
                <FormField label="Max Size (€M)">
                  <Input
                    testID="mandate-max-input"
                    value={maxSize}
                    onChangeText={setMaxSize}
                    placeholder="150"
                    keyboardType="numeric"
                  />
                </FormField>
              </View>
            </View>
            <FormField label="Risk Strategy">
              <ChipRow options={STRATEGIES} selected={[strategy]} onToggle={(v) => setStrategy(v)} />
            </FormField>
            <FormField label="Yield Target % (Optional)">
              <Input
                testID="mandate-yield-input"
                value={yieldTarget}
                onChangeText={setYieldTarget}
                placeholder="e.g. 5.5"
                keyboardType="numeric"
              />
            </FormField>
            {error ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Feather name="alert-circle" size={15} color={c.destructive} />
                <Text
                  testID="mandate-form-error"
                  style={{ flex: 1, color: c.destructive, fontSize: 13, fontFamily: 'Inter_500Medium' }}
                >
                  {error}
                </Text>
              </View>
            ) : null}
            <GoldButton
              testID="submit-mandate-button"
              label="Create Mandate"
              icon="target"
              onPress={handleSubmit}
              loading={createMandate.isPending}
            />
          </KeyboardAwareScrollViewCompat>
        </View>
      </View>
    </Modal>
  );
}

const INVESTOR_TYPES = [
  { value: 'institutional', label: 'Institutional' },
  { value: 'family_office', label: 'Family Office' },
  { value: 'private_equity', label: 'Private Equity' },
  { value: 'reit', label: 'REIT' },
];

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  const c = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text
        style={{
          color: c.mutedForeground,
          fontSize: 11,
          fontFamily: 'Inter_600SemiBold',
          textTransform: 'uppercase',
          letterSpacing: 0.8,
        }}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function Input({
  value,
  onChangeText,
  placeholder,
  keyboardType,
  testID,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder: string;
  keyboardType?: 'numeric' | 'default';
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
  );
}

const COUNTRIES = ['Germany', 'Austria', 'Switzerland', 'France', 'Netherlands', 'Spain', 'Italy', 'UK'];

const STRATEGIES = [
  { value: 'core', label: 'Core' },
  { value: 'core_plus', label: 'Core+' },
  { value: 'value_add', label: 'Value Add' },
  { value: 'opportunistic', label: 'Opportunistic' },
];

function ChipRow({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <Pressable
            key={opt.value}
            testID={`chip-${opt.value}`}
            onPress={() => onToggle(opt.value)}
            style={({ pressed }) => ({
              opacity: pressed ? 0.7 : 1,
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 999,
              backgroundColor: active ? 'rgba(200,169,90,0.15)' : c.secondary,
              borderWidth: 1,
              borderColor: active ? c.primary : c.border,
            })}
          >
            <Text
              style={{
                color: active ? c.primary : c.mutedForeground,
                fontSize: 12,
                fontFamily: 'Inter_600SemiBold',
                textTransform: 'capitalize',
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const ASSET_CLASSES = ['office', 'retail', 'hotel', 'logistics', 'residential', 'mixed_use'];
