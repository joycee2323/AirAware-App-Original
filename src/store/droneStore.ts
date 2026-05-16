import { create } from 'zustand';
import { OdidDetection } from '../services/odidParser';

export interface DroneEntry extends Partial<OdidDetection> {
  mac: string;
  rssi: number;
  lastSeen: number;
  firstSeen: number;
  path: { lat: number; lon: number; ts: number }[];
  // Accumulated fields from multiple message types
  uasId?: string;
  lat?: number;
  lon?: number;
  altGeo?: number;
  speedHoriz?: number;
  heading?: number;
  status?: number;
  opLat?: number;
  opLon?: number;
  sourceMac?: string;
  // CTA-2063-A model decode, resolved server-side at ingest. Present on
  // backend drones, absent on BLE-mode guest detections. Both nullable
  // because unknown serials resolve to null/null.
  manufacturer?: string | null;
  model?: string | null;
}

interface DroneStore {
  // BLE-detected drones (guest mode)
  bleDrones: Record<string, DroneEntry>;
  // Backend drones are session-scoped: they persist until the deployment
  // they belong to becomes inactive (passive mode entered, or a different
  // deployment becomes the active target). They are NOT evicted by age.
  // Prior implementation used a 60s sweep coupled to a 60s REST hydrate
  // filter; both have been removed. See Commit 3 / Phase 2. When the user
  // opens the app from a push notification for a drone that stopped
  // transmitting minutes ago, the whole point of the notification is
  // "look at the map" — silent age-based eviction defeats that. The
  // tradeoff is that stale drones may linger on the map until the
  // deployment ends; a per-drone freshness indicator is the planned
  // mitigation, not eviction.
  backendDrones: Record<string, any>;
  // Per-org nickname overrides keyed by uas_id. Seeded from
  // GET /api/orgs/:id/drone-nicknames on login/screen mount and kept
  // fresh by NICKNAME_UPDATE WS events. Render path consults this map
  // first, falling back to the drone row's `nickname` field.
  nicknamesByUasId: Record<string, string>;

  updateBleDrone: (uasId: string, data: Partial<OdidDetection> & { rssi: number }) => void;
  removeDrone: (uasId: string) => void;
  clearBleDrones: () => void;
  setBackendDrones: (drones: Record<string, any>) => void;
  updateBackendDrone: (drone: any) => void;
  // Drops every backendDrones entry whose deployment_id matches. Called
  // by LiveMapScreen on mode transitions: entering passive mode (clears
  // the previously-active deployment) and switching from one active
  // deployment to another (clears the prior one). No-op for the
  // same-deployment idempotent refresh path.
  clearBackendDronesForDeployment: (deploymentId: string) => void;
  setNicknames: (map: Record<string, string>) => void;
  updateNickname: (uasId: string, nickname: string | null) => void;
  nearbyNodes: Record<string, { mac: string; rssi: number; lastSeen: number }>;
  updateNearbyNode: (mac: string, rssi: number) => void;
}

// Top-level DECIMAL fields come through the pg driver as strings to preserve
// precision. @rnmapbox/maps requires numeric coordinates per RFC 7946 (unlike
// Leaflet on the web dashboard, which parses strings via parseFloat), so we
// coerce at the store boundary. Path coords do NOT need this — json_build_object
// in the backend query converts DECIMAL → JSON number natively.
const BACKEND_NUMERIC_FIELDS = [
  'last_lat', 'last_lon', 'last_altitude',
  'last_speed', 'last_heading',
  'op_lat', 'op_lon',
] as const;

function coerceBackendNumerics(drone: any): any {
  const next = { ...drone };
  for (const f of BACKEND_NUMERIC_FIELDS) {
    const v = next[f];
    if (v === null || v === undefined) continue;
    const n = Number(v);
    next[f] = Number.isFinite(n) ? n : null;
  }
  return next;
}

export const useDroneStore = create<DroneStore>((set) => ({
  bleDrones: {},
  backendDrones: {},
  nicknamesByUasId: {},
  nearbyNodes: {},

  setNicknames: (map) => set({ nicknamesByUasId: { ...map } }),

  updateNickname: (uasId, nickname) => set(state => {
    const next = { ...state.nicknamesByUasId };
    if (nickname && nickname.trim()) next[uasId] = nickname;
    else delete next[uasId];
    // Mirror onto the matching backend drone row so any consumer reading
    // `drone.nickname` directly sees the new value without an extra subscribe.
    const existing = state.backendDrones[uasId];
    const backendDrones = existing
      ? { ...state.backendDrones, [uasId]: { ...existing, nickname: nickname || null } }
      : state.backendDrones;
    return { nicknamesByUasId: next, backendDrones };
  }),

  updateBleDrone: (uasId, data) => {
    const now = Date.now();
    set(state => {
      const existing = state.bleDrones[uasId];
      const prevPath = existing?.path || [];
      const newPoint = (data.lat && data.lon)
        ? [{ lat: data.lat, lon: data.lon, ts: now }]
        : [];

      // Merge — later messages win for each field, but don't overwrite with undefined
      const merged: DroneEntry = {
        // mac here is the source/relay MAC — kept for attribution, NOT the dedup key
        mac: data.mac ?? existing?.mac ?? '',
        firstSeen: existing?.firstSeen ?? now,
        lastSeen: now,
        path: [...prevPath, ...newPoint].slice(-200), // keep last 200 points
        rssi: data.rssi,
        // Carry forward existing values, overwrite with new non-null values
        uasId: data.uasId ?? existing?.uasId ?? uasId,
        lat: data.lat ?? existing?.lat,
        lon: data.lon ?? existing?.lon,
        altGeo: data.altGeo ?? existing?.altGeo,
        speedHoriz: data.speedHoriz ?? existing?.speedHoriz,
        heading: data.heading ?? existing?.heading,
        status: data.status ?? existing?.status,
        opLat: data.opLat ?? existing?.opLat,
        opLon: data.opLon ?? existing?.opLon,
        sourceMac: (data as any).sourceMac ?? existing?.sourceMac,
        hasBasicId: data.hasBasicId || existing?.hasBasicId,
        hasLocation: data.hasLocation || existing?.hasLocation,
        hasSystem: data.hasSystem || existing?.hasSystem,
      };

      return {
        bleDrones: { ...state.bleDrones, [uasId]: merged },
      };
    });
  },

  removeDrone: (uasId) => {
    set(state => {
      const next = { ...state.bleDrones };
      delete next[uasId];
      return { bleDrones: next };
    });
  },

  clearBleDrones: () => set({ bleDrones: {} }),

  setBackendDrones: (drones) => {
    const coerced: Record<string, any> = {};
    for (const k of Object.keys(drones)) coerced[k] = coerceBackendNumerics(drones[k]);
    set({ backendDrones: coerced });
  },

  updateBackendDrone: (drone) => {
    const coerced = coerceBackendNumerics(drone);
    set(state => {
      const uasId = coerced.uas_id;
      const existing = state.backendDrones[uasId] ?? {};
      const existingPath = existing.path ?? [];
      const hasCoords =
        typeof coerced.last_lat === 'number' && typeof coerced.last_lon === 'number';
      const nextPath = hasCoords
        ? [
            ...existingPath,
            {
              lat: coerced.last_lat,
              lon: coerced.last_lon,
              alt: coerced.last_altitude,
              ts: new Date().toISOString(),
            },
          ].slice(-200)
        : existingPath;
      return {
        backendDrones: {
          ...state.backendDrones,
          [uasId]: { ...existing, ...coerced, path: nextPath },
        },
      };
    });
  },

  clearBackendDronesForDeployment: (deploymentId) => {
    set(state => {
      const next: Record<string, any> = {};
      let changed = false;
      for (const k of Object.keys(state.backendDrones)) {
        const d = state.backendDrones[k];
        if (d && d.deployment_id === deploymentId) {
          changed = true;
          continue;
        }
        next[k] = d;
      }
      return changed ? { backendDrones: next } : state;
    });
  },

  updateNearbyNode: (mac, rssi) => {
    set(state => ({
      nearbyNodes: {
        ...state.nearbyNodes,
        [mac]: { mac, rssi, lastSeen: Date.now() },
      },
    }));
    // Expire node after 15 seconds of no signal
    setTimeout(() => {
      set(state => {
        const node = state.nearbyNodes[mac];
        if (node && Date.now() - node.lastSeen >= 15000) {
          const next = { ...state.nearbyNodes };
          delete next[mac];
          return { nearbyNodes: next };
        }
        return state;
      });
    }, 15000);
  },
}));

const BLE_DRONE_STALE_MS = 30_000;
const CLEANUP_INTERVAL_MS = 10_000;

// BLE drones (guest mode) have no other lifecycle — without this sweep
// a drone that flew out of range would linger in local state forever.
// Backend drones are deliberately NOT swept by age; see the backendDrones
// field comment on the DroneStore interface above. The previous BACKEND_
// DRONE_STALE_MS sweep was removed in Commit 3 / Phase 2 along with the
// coupled 60s REST hydrate filter on LiveMapScreen.
setInterval(() => {
  const now = Date.now();
  const state = useDroneStore.getState();
  for (const uasId of Object.keys(state.bleDrones)) {
    if (now - state.bleDrones[uasId].lastSeen > BLE_DRONE_STALE_MS) {
      state.removeDrone(uasId);
    }
  }
}, CLEANUP_INTERVAL_MS);
