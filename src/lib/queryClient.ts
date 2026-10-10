import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 },
    mutations: { retry: 0 },
  },
});

/** Central query keys so invalidation stays consistent across features. */
export const qk = {
  profile: (uid: string | undefined) => ['profile', uid] as const,
  maps: ['maps'] as const,
  groups: ['groups'] as const,
  pins: (mapId: string) => ['pins', mapId] as const,
  allPins: ['pins', '__all'] as const,
  savedEvents: ['savedEvents'] as const,
  event: (id: string) => ['events', 'byId', id] as const,
  discover: (key: unknown) => ['events', 'discover', key] as const,
  collabMaps: ['collabMaps'] as const,
  collabMembers: (id: string) => ['collabMembers', id] as const,
  sharedPins: (id: string) => ['sharedPins', id] as const,
  invitations: (id: string) => ['invitations', id] as const,
  myInvites: ['myInvites'] as const,
  friendships: ['friendships'] as const,
  pinShares: (pinId: string) => ['pinShares', pinId] as const,
  signedUrl: (path: string) => ['signedUrl', path] as const,
};
