// No-op stub for `react-native-url-polyfill/auto`. Node has global URL /
// URLSearchParams, so the React Native URL polyfill (which imports `react-native`)
// is neither needed nor loadable here. The smoke-store runner aliases the polyfill
// to this file.
export default {};
