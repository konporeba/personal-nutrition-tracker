import { View, type ViewProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * `type` names the background *role* this view plays. `'transparent'` is the
 * escape hatch for grouping views inside an already-colored parent (a row
 * inside a `Card`, say) — it saves repeating the parent's token, which would
 * silently break the moment the parent's role changes.
 */
export type ThemedViewProps = ViewProps & {
  type?: ThemeColor | 'transparent';
};

export function ThemedView({ style, type, ...otherProps }: ThemedViewProps) {
  const theme = useTheme();
  const backgroundColor = type === 'transparent' ? 'transparent' : theme[type ?? 'background'];

  return <View style={[{ backgroundColor }, style]} {...otherProps} />;
}
