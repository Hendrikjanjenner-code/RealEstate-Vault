import React from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import colors from '@/constants/colors';

export function ScreenHeader({
  title,
  subtitle,
  showBack = false,
  right,
}: {
  title: string;
  subtitle?: string;
  showBack?: boolean;
  right?: React.ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  return (
    <View
      style={{
        paddingTop: topInset + 12,
        paddingHorizontal: 20,
        paddingBottom: 14,
        backgroundColor: c.background,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: c.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      }}
    >
      {showBack && (
        <Pressable
          testID="header-back"
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => ({
            opacity: pressed ? 0.6 : 1,
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: c.secondary,
            alignItems: 'center',
            justifyContent: 'center',
          })}
        >
          <Feather name="chevron-left" size={22} color={c.primary} />
        </Pressable>
      )}
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={{
            color: c.foreground,
            fontSize: 21,
            fontFamily: 'Inter_700Bold',
            letterSpacing: -0.3,
          }}
        >
          {title}
        </Text>
        {subtitle ? (
          <Text
            numberOfLines={1}
            style={{ color: c.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular', marginTop: 2 }}
          >
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }) {
  const c = useColors();
  return (
    <View
      style={[
        {
          backgroundColor: c.card,
          borderRadius: colors.radius,
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: c.border,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function GoldButton({
  label,
  icon,
  onPress,
  disabled,
  loading,
  variant = 'solid',
  testID,
}: {
  label: string;
  icon?: keyof typeof Feather.glyphMap;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'solid' | 'outline';
  testID?: string;
}) {
  const c = useColors();
  const solid = variant === 'solid';
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
        backgroundColor: solid ? c.primary : 'transparent',
        borderWidth: solid ? 0 : 1,
        borderColor: c.primary,
        borderRadius: colors.radius,
        height: 48,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
      })}
    >
      {loading ? (
        <ActivityIndicator color={solid ? c.primaryForeground : c.primary} />
      ) : (
        <>
          {icon ? (
            <Feather name={icon} size={17} color={solid ? c.primaryForeground : c.primary} />
          ) : null}
          <Text
            style={{
              color: solid ? c.primaryForeground : c.primary,
              fontSize: 15,
              fontFamily: 'Inter_600SemiBold',
            }}
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

export function Badge({ label, gold = false }: { label: string; gold?: boolean }) {
  const c = useColors();
  return (
    <View
      style={{
        paddingHorizontal: 9,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: gold ? 'rgba(200,169,90,0.15)' : c.secondary,
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: gold ? 'rgba(200,169,90,0.4)' : c.border,
      }}
    >
      <Text
        style={{
          color: gold ? c.primary : c.mutedForeground,
          fontSize: 11,
          fontFamily: 'Inter_600SemiBold',
          textTransform: 'uppercase',
          letterSpacing: 0.6,
        }}
      >
        {label}
      </Text>
    </View>
  );
}

export function EmptyState({
  icon,
  title,
  message,
}: {
  icon: keyof typeof Feather.glyphMap;
  title: string;
  message?: string;
}) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 64, paddingHorizontal: 32, gap: 10 }}>
      <View
        style={{
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: c.secondary,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Feather name={icon} size={24} color={c.mutedForeground} />
      </View>
      <Text style={{ color: c.foreground, fontSize: 16, fontFamily: 'Inter_600SemiBold' }}>{title}</Text>
      {message ? (
        <Text
          style={{
            color: c.mutedForeground,
            fontSize: 13,
            fontFamily: 'Inter_400Regular',
            textAlign: 'center',
            lineHeight: 19,
          }}
        >
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export function LoadingState() {
  const c = useColors();
  return (
    <View style={{ paddingVertical: 64, alignItems: 'center' }}>
      <ActivityIndicator color={c.primary} size="large" />
    </View>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  const c = useColors();
  return (
    <View style={{ alignItems: 'center', paddingVertical: 48, gap: 14, paddingHorizontal: 32 }}>
      <Feather name="alert-circle" size={28} color={c.destructive} />
      <Text style={{ color: c.foreground, fontSize: 15, fontFamily: 'Inter_500Medium' }}>
        Could not load data
      </Text>
      <Pressable
        testID="retry-button"
        onPress={onRetry}
        style={({ pressed }) => ({
          opacity: pressed ? 0.7 : 1,
          borderWidth: 1,
          borderColor: c.primary,
          borderRadius: colors.radius,
          paddingHorizontal: 20,
          paddingVertical: 10,
        })}
      >
        <Text style={{ color: c.primary, fontFamily: 'Inter_600SemiBold', fontSize: 14 }}>Retry</Text>
      </Pressable>
    </View>
  );
}
