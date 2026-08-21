import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useListNotifications, getListNotificationsQueryKey } from '@workspace/api-client-react';
import { useColors } from '@/hooks/useColors';

export function NotificationsBell() {
  const c = useColors();
  const { data } = useListNotifications({ query: { queryKey: getListNotificationsQueryKey(), refetchInterval: 30000 } });
  const unreadCount = (data ?? []).filter((n) => !n.read).length;

  return (
    <Pressable
      testID="button-notifications"
      onPress={() => router.push('/notifications' as never)}
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
      <Feather name="bell" size={17} color={c.primary} />
      {unreadCount > 0 ? (
        <View
          testID="badge-unread-count"
          style={{
            position: 'absolute',
            top: -3,
            right: -3,
            minWidth: 17,
            height: 17,
            paddingHorizontal: 4,
            borderRadius: 9,
            backgroundColor: c.primary,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ color: c.primaryForeground, fontSize: 10, fontFamily: 'Inter_700Bold' }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
