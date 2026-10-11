/**
 * Atlas domain types (camelCase, UI-facing). Database rows are mapped into
 * these in the feature API modules. Keeping public events, private pins,
 * groups and collaboration representations as distinct types mirrors the
 * distinct tables and prevents accidentally treating one as another.
 */
import type { PinSource } from '@/features/pins/pinSource';

/** A normalized public event (Discover). Unknown values are null, never guessed. */
export interface AtlasEvent {
  id: string;
  provider: string;
  externalId: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  category: string | null;
  genre: string | null;
  venueName: string | null;
  address: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  /** Event start instant (ISO, UTC). */
  startsAt: string | null;
  /** Event end instant (ISO, UTC). */
  endsAt: string | null;
  /** Provider-supplied local start date (YYYY-MM-DD) in the event timezone. */
  startLocalDate: string | null;
  /** Provider-supplied local start time (HH:MM[:SS]) in the event timezone. */
  startLocalTime: string | null;
  /** IANA timezone of the event/venue. */
  timezone: string | null;
  /** Venue opening time (local HH:MM[:SS]); distinct from event start. */
  venueOpenTime: string | null;
  /** Venue closing time (local HH:MM[:SS]); distinct from event end. */
  venueCloseTime: string | null;
  priceMin: number | null;
  priceMax: number | null;
  currency: string | null;
  ticketUrl: string | null;
  sourceUrl: string | null;
  sourceName: string | null;
  status: string | null;
  isDevFixture: boolean;
  lastCheckedAt: string | null;
}

export interface Profile {
  id: string;
  username: string;
  displayName: string;
  discoverable: boolean;
  mapStyle: 'positron' | 'bright' | 'liberty';
}

export interface PersonalMap {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface Group {
  id: string;
  name: string;
  color: string;
  icon: string | null;
}

export type PinShape = 'circle' | 'square' | 'rounded' | 'diamond' | 'star';
export type ImageMask = 'circle' | 'rounded' | 'square';

/** Visual appearance shared by private pins and shared representations. */
export interface PinAppearance {
  color: string | null;
  shape: PinShape;
  icon: string | null;
  size: number;
  borderColor: string | null;
  borderWidth: number;
  imageId: string | null;
  imageMask: ImageMask;
}

export const DEFAULT_APPEARANCE: PinAppearance = {
  color: null,
  shape: 'circle',
  icon: null,
  size: 32,
  borderColor: null,
  borderWidth: 2,
  imageId: null,
  imageMask: 'circle',
};

/** Metadata for an uploaded marker image; bytes live in Supabase Storage. */
export interface PinImage {
  id: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
}

/** A user-owned pin on one of their private maps. */
export interface Pin {
  id: string;
  mapId: string;
  kind: 'event' | 'custom';
  eventId: string | null;
  /** Joined public event for saved-event pins. */
  event: AtlasEvent | null;
  title: string | null;
  /** Private note: never shown outside the owner's own views. */
  note: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  appearance: PinAppearance;
  image: PinImage | null;
  groupIds: string[];
  /** Saved events only: whether the owner is going / interested (null = not set). */
  attendance: Attendance | null;
  /** Set when the pin was saved from an OpenStreetMap place ("osm:node/123"). */
  placeRef: string | null;
  /** Validated snapshot of the source place (kept separate from user-authored fields). */
  source: PinSource | null;
  createdAt: string;
}

export type Attendance = 'going' | 'interested';

export type CollabRole = 'owner' | 'editor' | 'viewer';

export interface CollabMap {
  id: string;
  name: string;
  description: string | null;
  ownerId: string;
  myRole: CollabRole;
}

export interface CollabMember {
  userId: string;
  role: CollabRole;
  username: string;
  displayName: string;
}

/** An independent representation of a pin inside a collaboration map. */
export interface SharedPin {
  id: string;
  collabMapId: string;
  sharedBy: string;
  sharedByName: string | null;
  sourcePinId: string | null;
  eventId: string | null;
  title: string;
  note: string | null;
  latitude: number;
  longitude: number;
  address: string | null;
  appearance: PinAppearance;
  image: PinImage | null;
  /** Events added directly to a collaboration map may record attendance. */
  attendance?: Attendance | null;
  placeRef?: string | null;
  source?: PinSource | null;
  createdAt: string;
}

export type FriendshipStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

export interface Friendship {
  id: string;
  status: FriendshipStatus;
  /** True when the current user sent the request. */
  outgoing: boolean;
  other: { id: string; username: string; displayName: string } | null;
  createdAt: string;
}

export interface CollabInvitation {
  id: string;
  mapId: string;
  role: CollabRole;
  recipientId: string | null;
  expiresAt: string;
  maxUses: number | null;
  useCount: number;
  revokedAt: string | null;
  declinedAt: string | null;
  createdAt: string;
}

/** A point the map can render: what all three map contexts share. */
export interface LatLng {
  latitude: number;
  longitude: number;
}
