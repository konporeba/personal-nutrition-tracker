// The product's front door: type what you ate, get an estimate to review.
// Always visible at the top of Today so logging starts with zero taps.
//
// The rule that shapes this component: never lose the owner's typing. The text is
// cleared only after a successful estimate has been staged and the review screen
// pushed — every failure path leaves it exactly as typed, with a Retry.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { estimateErrorMessage, useEstimateMeal } from '@/data/use-estimate';
import { useTheme } from '@/hooks/use-theme';

export function MealComposer() {
  const theme = useTheme();
  const router = useRouter();
  const [text, setText] = useState('');
  const estimate = useEstimateMeal();

  const trimmed = text.trim();
  const canSubmit = trimmed.length > 0 && !estimate.isPending;

  function submit() {
    // Whitespace alone is not a meal — never spend an AI call on it.
    if (!canSubmit) return;
    estimate.mutate(trimmed, {
      onSuccess: ({ runId }) => {
        setText('');
        // The estimate itself travels through the query cache; only the run id
        // and the original text (which seeds manual entry) go through the URL.
        router.push({ pathname: '/review', params: { runId, text: trimmed } });
      },
    });
  }

  return (
    <ThemedView style={styles.container}>
      <TextInput
        style={[styles.input, { color: theme.text, backgroundColor: theme.backgroundElement }]}
        placeholder="What did you eat?"
        placeholderTextColor={theme.textSecondary}
        multiline
        value={text}
        onChangeText={setText}
        editable={!estimate.isPending}
        submitBehavior="submit"
        onSubmitEditing={submit}
      />

      {estimate.isPending ? (
        <ThemedView style={styles.pendingRow}>
          <ActivityIndicator />
          <ThemedText type="small" themeColor="textSecondary">
            Estimating…
          </ThemedText>
        </ThemedView>
      ) : (
        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={({ pressed }) => [styles.submit, pressed && styles.pressed]}>
          <ThemedView
            type={canSubmit ? 'backgroundSelected' : 'backgroundElement'}
            style={styles.submitInner}>
            <ThemedText
              type="smallBold"
              themeColor={canSubmit ? 'text' : 'textSecondary'}>
              {estimate.isError ? 'Retry' : 'Estimate'}
            </ThemedText>
          </ThemedView>
        </Pressable>
      )}

      {estimate.isError && !estimate.isPending ? (
        <ThemedText type="small" themeColor="textSecondary">
          {estimateErrorMessage(estimate.error)}
        </ThemedText>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  input: {
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    minHeight: Spacing.six,
  },
  pendingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.one,
  },
  submit: {
    alignSelf: 'flex-end',
  },
  submitInner: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
