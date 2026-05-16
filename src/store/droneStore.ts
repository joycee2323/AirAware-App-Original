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
  //
  // Keyed by `${deployment_id}:${uas_id}` so the same uas_id can appear in
  // multiple simultaneously-active deployments without overwriting itself.
  // Use makeBackendDroneKey / parseBackendDroneKey to construct and parse
  // these keys — do not concatenate inline. Each value carries its own
  // `deployment_id` and `uas_id` fields from the backend row, so consumers
  // that iterate `Object.values()` don't need to parse keys.
  backendDrones: Record<string, any>;
  // Per-org nickname overrides keyed by uas_id. Seeded from
  // GET /api/orgs/:id/drone-nicknames on login/screen mount and kept
  // fresh by NICKNAME_UPDATE WS events. Render path consults this map
  // first, falling back to the drone row's `nickname` field.
  nicknamesByUasId: Record<string, string>;

  updateBleDrone: (uasId: string, data: Partial<OdidDetection> & { rssi: number }) => void;
  removeDrone: (uasId: string) => void;
  clearBleDrones: () => void;
  // Wholesale replace. Caller passes an array of backend drone rows
  // (each carrying its own deployment_id + uas_id); the store builds the
  // compound keys. Currently unused by app code but kept as part of the
  // public interface for symmetry with updateBackendDrone.
  setBackendDrones: (drones: any[]) => void;
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

// Compound key for backendDrones. The same uas_id can be detected by
// nodes in two simultaneously active deployments, so a uas_id-only key
// would lose data on a cross-deployment overlap. ':' is safe as a
// separator because UAS-ID (Remote ID per CTA-2063-A / FAA Part 89) is
// alphanumeric / hyphenated and doesn't contain ':'.
export function makeBackendDroneKey(deploymentId: string, uasId: string): string {
  return `${deploymentId}:${uasId}`;
}

export function parseBackendDroneKey(key: string): { deploymentId: string; uasId: string } {
  const idx = key.indexOf(':');
  if (idx < 0) return { deploymentId: '', uasId: key };
  return { deploymentId: key.slice(0, idx), uasId: key.slice(idx + 1) };
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
    // Mirror onto every matching backend drone row. Nicknames are per-
    // (org, uas_id) on the backend (see drone_nicknames table) — i.e.
    // identity-scoped, not deployment-scoped — so a single uas_id sighted
    // in two deployments should reflect the same nickname in both. Fan
    // out across all keys whose parsed uas_id matches.
    const nextBackend: Record<string, any> = { ...state.backendDrones };
    let mutated = false;
    for (const k of Object.keys(nextBackend)) {
      const parsed = parseBackendDroneKey(k);
      if (parsed.uasId !== uasId) continue;
      nextBackend[k] = { ...nextBackend[k], nickname: nickname || null };
      mutated = true;
    }
    return {
      nicknamesByUasId: next,
      backendDrones: mutated ? nextBackend : state.backendDrones,
    };
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
    for (const d of drones) {
      if (!d || typeof d.deployment_id !== 'string' || typeof d.uas_id !== 'string') continue;
      coerced[makeBackendDroneKey(d.deployment_id, d.uas_id)] = coerceBackendNumerics(d);
    }
    set({ backendDrones: coerced });
  },

  updateBackendDrone: (drone) => {
    const coerced = coerceBackendNumerics(drone);
    set(state => {
      const deploymentId = coerced.deployment_id;
      const uasId = coerced.uas_id;
      // Defensive: a malformed payload missing either id is unindexable
      // under the compound-key scheme. Drop quietly — never going to
      // happen for backend-sourced rows (both columns are NOT NULL), but
      // a regression in the WS payload shape would silently corrupt
      // state under uas_id-only keying.
      if (typeof deploymentId !== 'string' || typeof uasId !== 'string') {
        return state;
      }
      const key = makeBackendDroneKey(deploymentId, uasId);
      const existing = state.backendDrones[key] ?? {};
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
          [key]: { ...existing, ...coerced, path: nextPath },
        },
      };
    });
  },

  clearBackendDronesForDeployment: (deploymentId) => {
    set(state => {
      const next: Record<string, any> = {};
      let changed = false;
      for (const k of Object.keys(state.backendDrones)) {
        // Parse the key (authoritative) rather than reading the value's
        // deployment_id field — the field is right today, but cheaper to
        // trust the key we just built than to double-check the payload.
        const parsed = parseBackendDroneKey(k);
        if (parsed.deploymentId === deploymentId) {
          changed = true;
          continue;
        }
        next[k] = state.backendDrones[k];
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
