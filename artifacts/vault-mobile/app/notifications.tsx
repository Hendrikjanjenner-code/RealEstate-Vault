import React, { useEffect } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import {
  useListNotifications,
  useMarkNotificationsRead,
  getListNotificationsQueryKey,
} from '@workspace/api-client-react';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import { Card, EmptyState, ErrorState, LoadingState, ScreenHeader } from '@/components/VaultUI';
import { timeAgo } from '@/lib/format';

function iconFor(message: string): keyof typeof Feather.glyphMap {
  if (message.includes('approved')) return 'check-circle';
  if (message.includes('declined')) return 'x-circle';
  if (message.includes('NDA')) return 'file-text';
  return 'clock';
}

export default function NotificationsScreen() {
  const c = useColors();
  const queryClient = useQueryClient();
  const notifications = useListNotifications();
  const markRead = useMarkNotificationsRead({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
      },
    },
  });

  const hasUnread = (notifications.data ?? []).some((n) => !n.read);

  // Opening the screen marks everything as read.
  useEffect(() => {
    if (hasUnread && !markRead.isPending) {
      markRead.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasUnread]);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="Notifications" showBack />
      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 16, paddingBottom: 48 }}
        refreshControl={
          <RefreshControl
            refreshing={notifications.isRefetching}
            onRefresh={() => notifications.refetch()}
            tintColor={c.primary}
          />
        }
      >
        {notifications.isLoading ? (
          <LoadingState />
        ) : notifications.isError ? (
          <ErrorState onRetry={() => notifications.refetch()} />
        ) : notifications.data && notifications.data.length > 0 ? (
          <Card>
            {notifications.data.map((n, i) => (
              <View
                key={n.id}
                testID={`notification-item-${n.id}`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 12,
                  padding: 14,
                  borderTopWidth: i === 0 ? 0 : StyleSheet.hairlineWidth,
                  borderTopColor: c.border,
                  backgroundColor: n.read ? 'transparent' : 'rgba(200,169,90,0.06)',
                }}
              >
                <View
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 17,
                    backgroundColor: c.secondary,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Feather name={iconFor(n.message)} size={15} color={c.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: c.foreground, fontSize: 13, fontFamily: 'Inter_400Regular', lineHeight: 18 }}>
                    {n.message}
                  </Text>
                  <Text style={{ color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
                    {timeAgo(n.createdAt)}
                  </Text>
                </View>
                {!n.read ? (
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.primary, marginTop: 5 }} />
                ) : null}
              </View>
            ))}
          </Card>
        ) : (
          <EmptyState
            icon="bell"
            title="No notifications yet"
            message="You'll hear from us when a broker updates one of your access requests."
          />
        )}
      </ScrollView>
    </View>
  );
}
