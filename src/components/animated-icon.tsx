// The splash hand-off: hold the native splash image, then fade it out once the
// app is ready. The starter's decorative `AnimatedIcon` lived here too and went
// with the scaffold — this file is now only the overlay.
import { Image } from 'expo-image';
import * as SplashScreen from 'expo-splash-screen';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const DURATION = 600;

export function AnimatedSplashOverlay() {
  const [animate, setAnimate] = useState(false);
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  const splashKeyframe = new Keyframe({
    0: {
      transform: [{ scale: 1 }],
      opacity: 1,
    },
    20: {
      opacity: 1,
    },
    70: {
      opacity: 0,
      easing: Easing.elastic(0.7),
    },
    100: {
      opacity: 0,
      transform: [{ scale: 1 }],
      easing: Easing.elastic(0.7),
    },
  });

  const image = <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />;

  return animate ? (
    <Animated.View
      entering={splashKeyframe.duration(DURATION).withCallback((finished) => {
        'worklet';
        if (finished) {
          scheduleOnRN(setVisible, false);
        }
      })}
      style={styles.splashOverlay}>
      {image}
    </Animated.View>
  ) : (
    <View
      onLayout={() => {
        SplashScreen.hideAsync().finally(() => {
          setAnimate(true);
        });
      }}
      style={styles.splashOverlay}>
      {image}
    </View>
  );
}

const styles = StyleSheet.create({
  image: {
    // Matches `expo-splash-screen`'s `imageWidth: 76` in app.json — the logo
    // is square, so height follows width 1:1.
    width: 76,
    height: 76,
  },
  splashOverlay: {
    ...StyleSheet.absoluteFill,
    // The dark canvas, matching `expo-splash-screen`'s `backgroundColor` in
    // app.json — the overlay has to be indistinguishable from the native
    // splash it takes over from, or the hand-off flashes. Not a theme token:
    // this paints before the theme module is guaranteed to be loaded.
    backgroundColor: '#0F1120',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
