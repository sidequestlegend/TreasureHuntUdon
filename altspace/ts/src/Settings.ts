// Port-only (PORT.md section 8.1): the snippet element's attributes, read once and checked.
//
// Upstream keeps these as serialized fields on the prefab and as scene objects (spawn zones under "Locations",
// treasures under "Treasures (Drop treasures here)"). A snippet only has flat string settings, written by a
// creator, so every value here is untrusted: anything that does not parse falls back to the upstream prefab
// value, and numbers are clamped to what the kit can show.
//
// Spawn zones (PORT.md 8.2, option 1): `zoneN` (centre, world metres), `zoneN-size` (metres), `zoneN-rotation`
// (degrees). A snippet gizmo binds only `zoneN`; size and rotation are settings. A zone counts only when all
// three size numbers are above 0. `show-zones="true"` draws the true boxes in the world.

import { Quaternion, Vector3 } from "../portkit/src/index.ts";

/** The three kinds the kit carries, in upstream's pool order (THP: 5 Coin, 3 Gem, 1 Star). */
export const KINDS = ["Coin", "Gem", "Star"] as const;
export type Kind = (typeof KINDS)[number];

/** Copies of each kind the kit holds (PORT.md 8.1: up to 12, 6 and 4). */
export const KIT_COPIES: Readonly<Record<Kind, number>> = { Coin: 12, Gem: 6, Star: 4 };
/** Kit slot of the first copy of each kind: coins 0-11, gems 12-17, stars 18-21. */
export const KIT_FIRST_SLOT: Readonly<Record<Kind, number>> = { Coin: 0, Gem: 12, Star: 18 };
export const KIT_SLOTS = 22;
/** Zone preview cubes in the kit (`show-zones`). Zones above this still spawn, without a preview. */
export const KIT_ZONE_PREVIEWS = 8;
/** Zones read from the element: zone1 .. zone32. */
export const MAX_ZONES = 32;
/** A spawn cycle is never shorter than this (PORT.md 10.1 row 7): the room's write budget is 20 per second. */
export const MIN_CYCLE_SECONDS = 0.25;

export interface Zone {
  /** 1-based, as in the attribute name. */
  number: number;
  center: Vector3;
  size: Vector3;
  rotation: Vector3;
}

export interface HuntSettings {
  /** isTreasureHunt (THC:16). False: a random spawner, nothing can be found. */
  treasureHunt: boolean;
  /** isAnimated (THC:19). */
  animated: boolean;
  /** amountOfTreasuresActive (THP:191). */
  maxActive: number;
  /** timerMin, timerMax (THP:192-193), seconds. */
  timerMin: number;
  timerMax: number;
  /** Pool copies per kind (item 2). */
  counts: Record<Kind, number>;
  /** treasurePoints (PPP:66), per kind. */
  points: Record<Kind, number>;
  /** prizeCost (PPP:67). */
  prizeCost: number;
  /** Show the kit's own prize. */
  prize: boolean;
  prizePosition: Vector3;
  prizeRotation: Vector3;
  /** Name of an object in the creator's scene to show with the prize (not supported by the runtime yet). */
  prizeObject: string;
  personalListPosition: Vector3;
  personalListRotation: Vector3;
  /** Interact proximity (THP:4308), metres from the nearest of the local head and hands. */
  findDistance: number;
  /** Valid zones only, in attribute order. */
  zones: Zone[];
  showZones: boolean;
  credits: boolean;
  /** The kit root's `scale` attribute (uniform), to size zone previews under it. */
  kitScale: number;
}

const DEFAULT_ZONES: ReadonlyArray<[string, string, string]> = [
  // Section 5.1: the prefab's three zones, as if the prefab root sat at the world origin.
  ["-0.154 0.553 1.579", "1.377 0.792 0.642", "0 0 0"],
  ["-0.557 0.910 2.554", "0.728 0.418 0.339", "0 0 0"],
  ["0.763 1.352 2.458", "1.343 0.772 0.626", "0 0 0"],
];

function parseBool(text: string | undefined, fallback: boolean): boolean {
  if (text === undefined) return fallback;
  const t = text.trim().toLowerCase();
  if (t === "true" || t === "1" || t === "yes" || t === "on") return true;
  if (t === "false" || t === "0" || t === "no" || t === "off") return false;
  return fallback;
}

function parseNumber(text: string | undefined, fallback: number, min: number, max: number): number {
  if (text === undefined || text.trim() === "") return fallback;
  const n = Number(text.trim());
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function parseInt32(text: string | undefined, fallback: number, min: number, max: number): number {
  return Math.trunc(parseNumber(text, fallback, min, max));
}

/** "x y z" (spaces or commas). Null when it is not three finite numbers. */
export function parseTriple(text: string | undefined): Vector3 | null {
  if (text === undefined) return null;
  const parts = text.trim().split(/[\s,]+/).filter((p) => p !== "");
  if (parts.length !== 3) return null;
  const n = parts.map(Number);
  if (!n.every((v) => Number.isFinite(v))) return null;
  return new Vector3(n[0]!, n[1]!, n[2]!);
}

function tripleOr(text: string | undefined, fallback: string): Vector3 {
  return parseTriple(text) ?? parseTriple(fallback)!;
}

/** Reads the element's attributes. Never throws. */
export function readSettings(attributes: ReadonlyMap<string, string>): HuntSettings {
  const get = (name: string) => attributes.get(name);
  const timerA = parseNumber(get("timer-min"), 0, 0, 3600);
  const timerB = parseNumber(get("timer-max"), 5, 0, 3600);
  const counts: Record<Kind, number> = {
    Coin: parseInt32(get("coins"), 5, 0, KIT_COPIES.Coin),
    Gem: parseInt32(get("gems"), 3, 0, KIT_COPIES.Gem),
    Star: parseInt32(get("stars"), 1, 0, KIT_COPIES.Star),
  };
  const pool = counts.Coin + counts.Gem + counts.Star;

  const zones: Zone[] = [];
  for (let n = 1; n <= MAX_ZONES; n++) {
    const fallback = DEFAULT_ZONES[n - 1];
    // A spare slot (zone4 and up) has no box until the creator gives it a size.
    const center = parseTriple(get(`zone${n}`)) ?? (fallback ? parseTriple(fallback[0])! : null);
    const size = parseTriple(get(`zone${n}-size`)) ?? (fallback ? parseTriple(fallback[1])! : null);
    const rotation = parseTriple(get(`zone${n}-rotation`)) ?? (fallback ? parseTriple(fallback[2])! : Vector3.zero);
    if (!center || !size) continue;
    if (!(size.x > 0 && size.y > 0 && size.z > 0)) continue;
    zones.push({ number: n, center, size, rotation });
  }

  const scale = parseTriple(get("scale"));
  const single = parseNumber(get("scale"), NaN, 0.001, 1000);
  const kitScale = scale ? (scale.x > 0 ? scale.x : 1) : Number.isFinite(single) ? single : 1;

  return {
    treasureHunt: parseBool(get("treasure-hunt"), true),
    animated: parseBool(get("animated"), true),
    // At least one (the script default, THC:23), at most the pool.
    maxActive: parseInt32(get("max-active"), 5, 1, Math.max(1, pool)),
    // Random.Range(min, max) takes either order; keep min <= max for readability.
    timerMin: Math.min(timerA, timerB),
    timerMax: Math.max(timerA, timerB),
    counts,
    points: {
      Coin: parseInt32(get("coin-points"), 1, 0, 1000000),
      Gem: parseInt32(get("gem-points"), 5, 0, 1000000),
      Star: parseInt32(get("star-points"), 10, 0, 1000000),
    },
    prizeCost: parseInt32(get("prize-cost"), 30, 0, 1000000000),
    prize: parseBool(get("prize"), true),
    prizePosition: tripleOr(get("prize-position"), "0.913 0.708 0.759"),
    prizeRotation: tripleOr(get("prize-rotation"), "0 0 0"),
    prizeObject: (get("prize-object") ?? "").trim(),
    personalListPosition: tripleOr(get("personal-list"), "0.75 0.898 1.359"),
    personalListRotation: tripleOr(get("personal-list-rotation"), "0 0 0"),
    findDistance: parseNumber(get("find-distance"), 0.7, 0.05, 100),
    zones,
    showZones: parseBool(get("show-zones"), false),
    credits: parseBool(get("credits"), true),
    kitScale,
  };
}

/** The kind of each pool index, in upstream order: every coin, then every gem, then every star. */
export function poolKinds(settings: HuntSettings): Kind[] {
  const out: Kind[] = [];
  for (const kind of KINDS) for (let i = 0; i < settings.counts[kind]; i++) out.push(kind);
  return out;
}

/** The kit slot that shows each pool index. */
export function poolSlots(settings: HuntSettings): number[] {
  const out: number[] = [];
  for (const kind of KINDS) for (let i = 0; i < settings.counts[kind]; i++) out.push(KIT_FIRST_SLOT[kind] + i);
  return out;
}

/** The kind a kit slot shows. */
export function kindOfSlot(slot: number): Kind {
  return slot >= KIT_FIRST_SLOT.Star ? "Star" : slot >= KIT_FIRST_SLOT.Gem ? "Gem" : "Coin";
}

export function zoneRotation(zone: Zone): Quaternion {
  return Quaternion.Euler(zone.rotation.x, zone.rotation.y, zone.rotation.z);
}
