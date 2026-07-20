import { useApp, useCurrentUserContext } from '@nocobase/client-v2';

export { useApp, useCurrentUserContext };

export function useAPIClient() {
  return useApp().apiClient;
}
