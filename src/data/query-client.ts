// Shared QueryClient plus an AsyncStorage-backed persister. AsyncStorage has a
// web implementation (localStorage), so this file is cross-platform with no split.
// The persisted cache gives read resilience across restarts and brief outages.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Low-write single-user app: keep data fresh-enough without chatty refetches.
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 60 * 24, // 24 hours — survives long enough to persist
      retry: 2,
    },
  },
});

export const asyncStoragePersister = createAsyncStoragePersister({
  storage: AsyncStorage,
});
