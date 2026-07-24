export interface ClientAdapters {
  useAPIClient: () => any;
  useCurrentUserContext: () => any;
  useApp?: () => any;
  useT: () => (key: string) => string;
}
