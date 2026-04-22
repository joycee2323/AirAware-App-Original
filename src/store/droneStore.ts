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
}

interface DroneStore {
  // BLE-detected drones (guest mode)
  bleDrones: Record<string, DroneEntry>;
  // Backend-synced drones (authenticated mode)
  backendDrones: Record<string, any>;

  updateBleDrone: (uasId: string, data: Partial<OdidDetection> & { rssi: number }) => void;
  removeDrone: (uasId: string) => void;
  clearBleDrones: () => void;
  setBackendDrones: (drones: Record<string, any>) => void;
  updateBackendDrone: (drone: any) => void;
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
  nearbyNodes: {},

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
    set(state => ({
      backendDrones: { ...state.backendDrones, [coerced.uas_id]: coerced },
    }));
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

const DRONE_STALE_MS = 30000;
const CLEANUP_INTERVAL_MS = 10000;

setInterval(() => {
  const now = Date.now();
  const { bleDrones, removeDrone } = useDroneStore.getState();
  for (const uasId of Object.keys(bleDrones)) {
    if (now - bleDrones[uasId].lastSeen > DRONE_STALE_MS) {
      removeDrone(uasId);
    }
  }
}, CLEANUP_INTERVAL_MS);
