import React, { useMemo, useState } from 'react';
import {
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getListThreadMessagesQueryKey,
  useListThreadMessages,
  useListThreads,
  useSendMessage,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Feather } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useColors } from '@/hooks/useColors';
import colors from '@/constants/colors';
import { LoadingState, ScreenHeader } from '@/components/VaultUI';
import { timeAgo } from '@/lib/format';

export default function ThreadScreen() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const { id: idParam } = useLocalSearchParams<{ id: string }>();
  const id = Number(idParam ?? 0);
  const { data: messages, isLoading } = useListThreadMessages(id, {
    query: { enabled: !!id, queryKey: getListThreadMessagesQueryKey(id) },
  });
  const { data: threads } = useListThreads();
  const thread = threads?.find((t) => t.id === id);
  const sendMessage = useSendMessage();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const inverted = useMemo(() => (messages ? [...messages].reverse() : []), [messages]);

  const send = () => {
    const body = draft.trim();
    if (!body || sendMessage.isPending) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setDraft('');
    sendMessage.mutate(
      { id, data: { body } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListThreadMessagesQueryKey(id) });
        },
        onError: () => setDraft(body),
      },
    );
  };

  const bottomInset = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <ScreenHeader
        title={thread?.counterpartName ?? 'Conversation'}
        subtitle={thread ? `${thread.counterpartCompany} \u2022 ${thread.subject}` : undefined}
        showBack
      />
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {isLoading ? (
          <LoadingState />
        ) : (
          <FlatList
            data={inverted}
            inverted
            keyExtractor={(m) => String(m.id)}
            scrollEnabled={inverted.length > 0}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: 20, gap: 10 }}
            renderItem={({ item: msg }) => (
              <View
                style={{
                  alignSelf: msg.fromMe ? 'flex-end' : 'flex-start',
                  maxWidth: '82%',
                  backgroundColor: msg.fromMe ? c.primary : c.card,
                  borderWidth: msg.fromMe ? 0 : StyleSheet.hairlineWidth,
                  borderColor: c.border,
                  borderRadius: 16,
                  borderBottomRightRadius: msg.fromMe ? 4 : 16,
                  borderBottomLeftRadius: msg.fromMe ? 16 : 4,
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  gap: 4,
                }}
              >
                <Text
                  style={{
                    color: msg.fromMe ? c.primaryForeground : c.foreground,
                    fontSize: 14,
                    fontFamily: 'Inter_400Regular',
                    lineHeight: 20,
                  }}
                >
                  {msg.body}
                </Text>
                <Text
                  style={{
                    color: msg.fromMe ? 'rgba(11,45,38,0.65)' : c.mutedForeground,
                    fontSize: 10,
                    fontFamily: 'Inter_400Regular',
                    alignSelf: 'flex-end',
                  }}
                >
                  {timeAgo(msg.sentAt)}
                </Text>
              </View>
            )}
          />
        )}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            paddingHorizontal: 16,
            paddingTop: 10,
            paddingBottom: bottomInset + 10,
            borderTopWidth: StyleSheet.hairlineWidth,
            borderTopColor: c.border,
            backgroundColor: c.background,
          }}
        >
          <TextInput
            testID="message-input"
            value={draft}
            onChangeText={setDraft}
            placeholder="Write a message..."
            placeholderTextColor={c.mutedForeground}
            multiline
            style={{
              flex: 1,
              maxHeight: 110,
              backgroundColor: c.card,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: c.border,
              borderRadius: colors.radius + 6,
              paddingHorizontal: 14,
              paddingVertical: 10,
              color: c.foreground,
              fontSize: 14,
              fontFamily: 'Inter_400Regular',
            }}
          />
          <Pressable
            testID="send-message"
            onPress={send}
            disabled={!draft.trim() || sendMessage.isPending}
            style={({ pressed }) => ({
              opacity: !draft.trim() ? 0.4 : pressed ? 0.7 : 1,
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: c.primary,
              alignItems: 'center',
              justifyContent: 'center',
            })}
          >
            <Feather name="arrow-up" size={19} color={c.primaryForeground} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
