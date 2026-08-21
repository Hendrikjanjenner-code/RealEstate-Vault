import React from 'react';
import { FlatList, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useListThreads } from '@workspace/api-client-react';
import { router } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import { Card, EmptyState, ErrorState, LoadingState, ScreenHeader } from '@/components/VaultUI';
import { timeAgo } from '@/lib/format';

export default function MessagesScreen() {
  const c = useColors();
  const { data: threads, isLoading, isError, refetch, isRefetching } = useListThreads();

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader title="Messages" subtitle="Deal conversations" />
      {isLoading ? (
        <LoadingState />
      ) : isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : (
        <FlatList
          data={threads ?? []}
          keyExtractor={(t) => String(t.id)}
          scrollEnabled={!!threads && threads.length > 0}
          contentContainerStyle={{
            padding: 20,
            gap: 12,
            paddingBottom: Platform.OS === 'web' ? 118 : 96,
          }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor={c.primary} />
          }
          ListEmptyComponent={
            <EmptyState icon="message-circle" title="No conversations yet" message="Threads appear when you connect on a deal." />
          }
          renderItem={({ item: thread }) => (
            <Pressable
              testID={`thread-${thread.id}`}
              onPress={() => router.push(`/thread/${thread.id}`)}
              style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
            >
              <Card style={{ padding: 16, gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                  <View
                    style={{
                      width: 42,
                      height: 42,
                      borderRadius: 21,
                      backgroundColor: c.secondary,
                      borderWidth: StyleSheet.hairlineWidth,
                      borderColor: c.border,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text style={{ color: c.primary, fontSize: 16, fontFamily: 'Inter_700Bold' }}>
                      {thread.counterpartName.charAt(0)}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ color: c.foreground, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>
                      {thread.counterpartName}
                    </Text>
                    <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 1 }}>
                      {thread.counterpartCompany}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <Text style={{ color: c.mutedForeground, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                      {timeAgo(thread.lastMessageAt)}
                    </Text>
                    {thread.unread > 0 && (
                      <View
                        style={{
                          minWidth: 20,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: c.primary,
                          alignItems: 'center',
                          justifyContent: 'center',
                          paddingHorizontal: 6,
                        }}
                      >
                        <Text style={{ color: c.primaryForeground, fontSize: 11, fontFamily: 'Inter_700Bold' }}>
                          {thread.unread}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
                <Text numberOfLines={1} style={{ color: c.mutedForeground, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
                  {thread.subject}
                </Text>
                <Text numberOfLines={2} style={{ color: c.foreground, fontSize: 13, fontFamily: 'Inter_400Regular', opacity: 0.85, lineHeight: 18 }}>
                  {thread.lastMessage}
                </Text>
              </Card>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}
