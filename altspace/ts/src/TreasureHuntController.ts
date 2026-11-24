// TreasureHuntController.cs (THC) on the portkit runtime.
//
// Upstream builds the pool at run time (THC:81-117: wrappers, return buttons) from scene objects. Here the kit
// builder has already built 22 wrappers (12 coins, 6 gems, 4 stars) with their return buttons, and the
// settings (Settings.ts) say how many of each kind are in the pool and where the spawn boxes are.
//
// What changed, and why (PORT.md 10.1):
//   - Finds are requests to the referee (SendCommand), which owns this behaviour and runs the spawn loop.
//     Upstream lets the finder take ownership and write the flags (THC:157-163, THC:282-285), so two players
//     finding one treasure at once were both credited (item 27), and a finder's stale view could overwrite a
//     spawn. The referee checks each request against the current spawn of that treasure, so a find is
//     credited exactly once, to the first request that arrives. Spawning still continues when the spawner
//     leaves: the next referee owns the controller (item 52).
//   - `ReplicateStates` runs when state arrives (OnDeserialization), not as a separate network event, so a
//     late joiner sees the treasures at once (item 51) and no message is sent per cycle (item 18).
//   - Timers 0/0 (item 20): upstream recursed until it indexed -1. Here a cycle is never shorter than
//     MIN_CYCLE_SECONDS, so "spawn immediately" is one spawn every 0.25 s until the cap.
//   - The active count reads the synced flags instead of the wrappers' activeSelf (they agree on the owner).
//   - Nothing is written when a cycle spawns nothing (upstream serialised once per period at the cap), and the
//     spawn timer is not synced (see spawnTimer).
//   - Reach is checked twice (PORT.md 10.1 row 12): on the finder's page (find-distance from the nearest of head and
//     hands; no click counts while the page knows no position) and by the referee, which asks its own app where the
//     finder's head is (relay op `userHead`, the SDK's Get User State: the avatar's head as the app places it, which no
//     page can write) and accepts the find only within find-distance plus REFEREE_REACH_SLACK of the treasure. No
//     answer, or no head known, refuses the find.

import { Behaviour, type AnimatorRef, type AudioSourceRef, type DeserializationResult, type GameObject, type ParticleSystemRef, Vector3 } from "../portkit/src/index.ts";
import { MIN_CYCLE_SECONDS, KIT_ZONE_PREVIEWS, poolKinds, poolSlots, readSettings, zoneRotation, type HuntSettings, type Kind, type Zone } from "./Settings.ts";
import type { TreasureReturner } from "./TreasureReturner.ts";

/** What Random.Range gives the spawn rules: a float in [min, max) and an int in [min, max). */
export interface SpawnRandom {
  Range(min: number, max: number): number;
  RangeInt(min: number, max: number): number;
}

/**
 * THC:204-236. Picks one of the inactive pool entries uniformly: the n-th false flag, n = Random.Range(0,
 * falseCount). Returns -1 when every flag is true (THC:217-221).
 */
export function GetRandomTreasureThatIsNotActive(isTreasureActive: readonly boolean[], random: SpawnRandom): number {
  let treasureIndexToSpawn = 0;
  let falseCount = 0;
  for (let i = 0; i < isTreasureActive.length; i++) if (!isTreasureActive[i]) falseCount++;
  if (falseCount === 0) return -1;
  let randomFalseIndex = random.RangeInt(0, falseCount);
  for (let i = 0; i < isTreasureActive.length; i++) {
    if (!isTreasureActive[i]) {
      if (randomFalseIndex === 0) treasureIndexToSpawn = i;
      randomFalseIndex--;
    }
  }
  return treasureIndexToSpawn;
}

/**
 * THC:239-249. A uniform point in a spawn box. Upstream's zones are unit BoxColliders (size 1, centre ignored)
 * whose transform's scale is the box: a local point within plus or minus half the collider size on each axis,
 * then TransformPoint (scale, rotate, translate). Draw order x, y, z.
 */
export function GetRandomPositionInBoxCollider(zone: Zone, random: SpawnRandom): Vector3 {
  const extents = new Vector3(0.5, 0.5, 0.5); // boxCollider.size / 2f, with the prefab's size of 1
  const point = new Vector3(random.Range(-extents.x, extents.x), random.Range(-extents.y, extents.y), random.Range(-extents.z, extents.z));
  return TransformPoint(zone, point);
}

/** Transform.TransformPoint for a zone: position + rotation * (scale * point). */
export function TransformPoint(zone: Zone, point: Vector3): Vector3 {
  const scaled = new Vector3(point.x * zone.size.x, point.y * zone.size.y, point.z * zone.size.z);
  return zone.center.add(zoneRotation(zone).rotate(scaled));
}

/** Positions travel rounded to millimetres, so every client holds exactly the same numbers (PORT.md 3.5). */
export function roundPosition(v: Vector3): Vector3 {
  const mm = (n: number) => Math.round(n * 1000) / 1000;
  return new Vector3(mm(v.x), mm(v.y), mm(v.z));
}

/** How long a find made here keeps its treasure hidden before the referee's answer arrives. */
const PREDICTION_SECONDS = 3;

/**
 * The referee's reach check allows find-distance plus this much between the finder's head, as the referee's app shows
 * it, and the treasure: an arm's length (the finder's own check counts from the nearer hand) and the lag of a remote
 * avatar's head (about half a second of walking).
 */
export const REFEREE_REACH_SLACK = 2.5;
/** The game's own relay op (TreasureHuntKitBuilder.RelayOps) and graph-to-page event: where a session's head is. */
export const HEAD_OP = "userHead";
/** A head reading that has not come back by then refuses the find. */
export const HEAD_ANSWER_SECONDS = 2;
/** At most this many reach checks wait at once on the referee; a request beyond them is refused. */
const MAX_HEAD_CHECKS = 64;

/** What the referee's last reach check saw (tests and the Play-mode check). */
export interface HeadCheck {
  sid: string;
  index: number;
  /** The finder's head as the referee's app reported it, or null when it knew none. */
  head: Vector3 | null;
  /** Metres from that head to the treasure (Infinity with no head). */
  distance: number;
  allowed: number;
  ok: boolean;
}

export class TreasureHuntController extends Behaviour {
  static override synced = ["isTreasureActive", "treasurePositions", "spawnSerial", "foundBy"];
  /** What a finder's SendCommand may run on the referee (nothing else is callable from the network). */
  static override networkCallable = ["ReturnItem"];

  // [UdonSynced] (THC:33-34).
  isTreasureActive: boolean[] = [];
  treasurePositions: Vector3[] = [];
  /**
   * THC:35. Not synced here: upstream sent it only with each spawn, so other clients held the value last rolled,
   * never counted down. Every client rolls one at start (THC:120) and counts down only while it owns the
   * controller, which gives a new owner the same wait as upstream (up to timer-max) and keeps every client's
   * synced state equal.
   */
  spawnTimer = 0;
  // Port-only synced fields: which spawn of each treasure this is, and the session credited with its find.
  spawnSerial: number[] = [];
  foundBy: string[] = [];

  // From bindings.json: the kit's prebuilt objects, by kit slot (Settings.ts: coins 0-11, gems 12-17, stars 18-21).
  wrappers: GameObject[] = [];
  rotators: AnimatorRef[] = [];
  returners: TreasureReturner[] = [];
  zonePreviews: GameObject[] = [];
  pickEffects: GameObject[] = [];
  pickParticles: ParticleSystemRef[] = [];
  pickAudio: AudioSourceRef[] = [];
  credits: GameObject | null = null;

  /** Settings, read in Start. */
  settings!: HuntSettings;
  /** Kind and kit slot of each pool index. */
  private kinds: Kind[] = [];
  private slots: number[] = [];
  /** What this client shows per pool index, and where, and which spawn it shows. */
  private shown: boolean[] = [];
  private placed: Array<Vector3 | null> = [];
  private shownSerial: number[] = [];
  /** Finds this client made that the referee has not answered yet: pool index -> [spawn serial, until]. */
  private readonly predicted = new Map<number, [number, number]>();
  /** Highest spawn serial of each pool index whose find this client has been credited for. */
  private readonly credited = new Map<number, number>();
  /** On the referee: finds waiting for the finder's head position, by request id. */
  private readonly headChecks = new Map<string, { sid: string; index: number; serial: number; until: number }>();
  private nextHeadCheck = 1;
  private nextEffect = 0;
  private warnedNoZones = false;

  // Counters for tests and the Play-mode check (not synced).
  pickEffectsPlayed = 0;
  spawns = 0;
  findsCredited = 0;
  findsRequested = 0;
  /** On the referee: requests refused (already found or gone, out of reach, or no head position known). */
  returnsRefused = 0;
  /** On the referee: of those, refused by the reach check (too far, no head position, no answer in time). */
  reachRefused = 0;
  lastHeadCheck: HeadCheck | null = null;

  override Start(): void {
    this.RegisterGraphEvent(HEAD_OP, "OnUserHead");
    this.Initiate();
  }

  /** THC:65-78. Only the owner (the referee, unless someone took over) counts down and spawns. */
  override Update(): void {
    this.ExpirePredictions();
    this.ExpireHeadChecks();
    if (this.Networking.IsOwner(this)) {
      if (this.spawnTimer > 0) {
        this.spawnTimer -= this.Time.deltaTime;
      } else {
        this.SpawnTreasure();
      }
    }
  }

  override OnDeserialization(result: DeserializationResult): void {
    this.FitToPool();
    this.ReplicateStates(result.isSnapshot);
    this.CheckCredits(result.isSnapshot);
  }

  // ---- Public methods (THC:80-166) ------------------------------------------------------------------------------

  /** THC:81-121, minus building objects: the kit holds them. */
  Initiate(): void {
    this.settings = readSettings(this.Settings);
    this.kinds = poolKinds(this.settings);
    this.slots = poolSlots(this.settings);
    const itemCount = this.kinds.length;

    // Every wrapper starts hidden (THC:97-101); slots not in the pool stay hidden.
    for (let slot = 0; slot < this.wrappers.length; slot++) this.wrappers[slot]!.SetActive(false);
    // isAnimated (THC:91): the wrapper's Animator is switched off (relay op animEnabled).
    if (!this.settings.animated) for (const rotator of this.rotators) rotator.enabled = false;

    // Construct data arrays to match pool (THC:104-105).
    this.isTreasureActive = new Array<boolean>(itemCount).fill(false);
    this.treasurePositions = Array.from({ length: itemCount }, () => Vector3.zero);
    this.spawnSerial = new Array<number>(itemCount).fill(0);
    this.foundBy = new Array<string>(itemCount).fill("");
    this.shown = new Array<boolean>(itemCount).fill(false);
    this.placed = new Array<Vector3 | null>(itemCount).fill(null);
    this.shownSerial = new Array<number>(itemCount).fill(0);

    this.ShowZones();
    if (this.credits) this.credits.SetActive(this.settings.credits);
    this.StartSpawnCycle();
  }

  /** THC:122-132. The 0/0 case no longer recurses (PORT.md 10.1 row 7). */
  StartSpawnCycle(): void {
    if (this.settings.timerMin === 0 && this.settings.timerMax === 0) {
      this.spawnTimer = MIN_CYCLE_SECONDS;
    } else {
      this.spawnTimer = Math.max(MIN_CYCLE_SECONDS, this.Random.Range(this.settings.timerMin, this.settings.timerMax));
    }
  }

  /**
   * THC:135-156: show or hide each treasure by its flag and put it at its position. A treasure that goes from
   * shown to hidden plays its pick effect here (upstream: TreasureReturner.OnDisable, TR:35-38), except for
   * treasures that were already hidden when this client joined (`isSnapshot`).
   */
  ReplicateStates(isSnapshot = false): void {
    for (let i = 0; i < this.kinds.length; i++) {
      const slot = this.slots[i]!;
      const wrapper = this.wrappers[slot];
      if (!wrapper) continue;
      const prediction = this.predicted.get(i);
      const show = this.isTreasureActive[i] === true && !(prediction && prediction[0] === this.spawnSerial[i]);
      const serial = this.spawnSerial[i] ?? 0;
      const respawned = this.shown[i] === true && show && serial !== this.shownSerial[i];
      if ((this.shown[i] && !show) || respawned) {
        // Found (or found and already out again somewhere else): the effect plays where it was.
        if (!isSnapshot && this.placed[i]) this.returners[slot]?.OnDisable(this.placed[i]!);
      }
      if (show) {
        const position = this.treasurePositions[i] ?? Vector3.zero;
        if (!this.placed[i] || !this.placed[i]!.equals(position)) {
          wrapper.transform.position = position;
          this.placed[i] = position.clone();
        }
      }
      if (show !== this.shown[i]) wrapper.SetActive(show);
      this.shown[i] = show;
      this.shownSerial[i] = serial;
    }
  }

  /**
   * THC:157-163, as the referee runs it. `serial` is the spawn the finder saw: a request for a spawn that is
   * already found (someone else's request came first) or gone changes nothing, so nobody is credited twice. Upstream
   * trusted the finder's own proximity check; here the referee first asks its app where the finder's head is, and
   * OnUserHead completes the find.
   */
  ReturnItem(indexToReturn: number, serial: number): void {
    const caller = this.Networking.CallingSession;
    if (!caller || !this.settings.treasureHunt) return;
    if (!Number.isInteger(indexToReturn) || indexToReturn < 0 || indexToReturn >= this.isTreasureActive.length) return;
    if (!this.isTreasureActive[indexToReturn] || this.spawnSerial[indexToReturn] !== serial || this.headChecks.size >= MAX_HEAD_CHECKS) {
      this.returnsRefused++;
      return;
    }
    const id = String(this.nextHeadCheck++);
    this.headChecks.set(id, { sid: caller.sid, index: indexToReturn, serial, until: this.Time.time + HEAD_ANSWER_SECONDS });
    this.Host.op(HEAD_OP, `wrapper${this.slots[indexToReturn]}`, [id, caller.sid]);
  }

  /**
   * The referee's app answers a `userHead` op: where that session's head is (SDK Get User State: 0 0 0 when the app
   * knows no such user, or no body for them yet). The find counts only if the head is within reach of the treasure.
   */
  OnUserHead(id: string, x: string, y: string, z: string): void {
    const check = this.headChecks.get(String(id));
    if (!check) return;
    this.headChecks.delete(String(id));
    const n = [x, y, z].map((v) => (typeof v === "string" && v.trim() !== "" ? Number(v) : NaN));
    const known = n.every((v) => Number.isFinite(v)) && !(n[0] === 0 && n[1] === 0 && n[2] === 0);
    const head = known ? new Vector3(n[0]!, n[1]!, n[2]!) : null;
    const target = this.treasurePositions[check.index] ?? Vector3.zero;
    const distance = head ? Vector3.Distance(head, target) : Infinity;
    const allowed = this.settings.findDistance + REFEREE_REACH_SLACK;
    const ok = distance <= allowed;
    this.lastHeadCheck = { sid: check.sid, index: check.index, head, distance, allowed, ok };
    if (!ok) {
      this.RefuseReach(head ? `${check.sid} is ${distance.toFixed(2)} m from treasure ${check.index} (at most ${allowed.toFixed(2)})` : `no head position for ${check.sid}`);
      return;
    }
    this.CompleteReturn(check.index, check.serial, check.sid);
  }

  /** The find, once the reach check has passed: still the same spawn and still out (another find may have come first). */
  private CompleteReturn(indexToReturn: number, serial: number, sid: string): void {
    if (!this.isTreasureActive[indexToReturn] || this.spawnSerial[indexToReturn] !== serial) {
      this.returnsRefused++;
      return;
    }
    this.TakeOwnership();
    this.isTreasureActive[indexToReturn] = false;
    this.foundBy[indexToReturn] = sid;
    this.RequestSerialization();
    this.ReplicateStates();
    this.CheckCredits(false);
  }

  private RefuseReach(why: string): void {
    this.returnsRefused++;
    this.reachRefused++;
    this.Debug.LogWarning(`treasure-hunt: a find was refused: ${why}`);
  }

  /** Reach checks whose answer did not come back in time are refused (fail closed). */
  private ExpireHeadChecks(): void {
    if (!this.headChecks.size) return;
    for (const [id, check] of [...this.headChecks]) {
      if (this.Time.time < check.until) continue;
      this.headChecks.delete(id);
      const allowed = this.settings.findDistance + REFEREE_REACH_SLACK;
      this.lastHeadCheck = { sid: check.sid, index: check.index, head: null, distance: Infinity, allowed, ok: false };
      this.RefuseReach(`no head position for ${check.sid} within ${HEAD_ANSWER_SECONDS} s`);
    }
  }

  // ---- what TreasureReturner calls --------------------------------------------------------------------------------

  /**
   * TR:22-25 on the finder's client: the click counts only within `find-distance` of the nearest of the local
   * head and hands (upstream: VRChat's proximity 0.7 m, THP:4308), and not at all while this page knows no position
   * for the player (the runtime's InReach would let it count). The treasure is hidden here at once and the referee is
   * asked to record the find (it checks the reach again). Returns false when the click does not count.
   */
  RequestReturn(slot: number): boolean {
    const index = this.slots.indexOf(slot);
    if (index < 0 || !this.settings.treasureHunt) return false;
    if (!this.isTreasureActive[index] || this.predicted.has(index)) return false;
    if (!this.Input.Position) return false;
    if (!this.Input.InReach(this.treasurePositions[index]!, this.settings.findDistance)) return false;
    this.predicted.set(index, [this.spawnSerial[index]!, this.Time.time + PREDICTION_SECONDS]);
    this.findsRequested++;
    this.ReplicateStates();
    this.SendCommand("ReturnItem", index, this.spawnSerial[index]!);
    return true;
  }

  /** The pick effect (THP:4443-9395): one of four pooled bursts with the pick sound, at `position`. */
  PlayPickEffect(position: Vector3): void {
    this.pickEffectsPlayed++;
    if (!this.pickEffects.length) return;
    const n = this.nextEffect++ % this.pickEffects.length;
    this.pickEffects[n]!.transform.position = position;
    this.pickParticles[n]?.Play();
    this.pickAudio[n]?.PlayOneShot(0);
  }

  /** The pool's treasure names, in pool order (what Scoreboard and PersonalScoreList read from TreasuresContainer). */
  PoolKinds(): Kind[] {
    if (!this.settings) this.Initiate();
    return this.kinds.slice();
  }

  // ---- private (THC:167-199, THC:269-285) ---------------------------------------------------------------------

  /** THC:167-199. */
  private SpawnTreasure(): void {
    if (!this.Networking.IsOwner(this)) return;
    if (!this.isTreasureAvailable()) {
      this.StartSpawnCycle();
      return;
    }

    // Count active treasures.
    let activeCount = 0;
    for (const active of this.isTreasureActive) if (active) activeCount++;

    // Generate new random data for new spawn.
    let spawned = false;
    const zones = this.settings.zones;
    if (activeCount < this.settings.maxActive && zones.length > 0) {
      const randomCollider = zones[this.Random.RangeInt(0, zones.length)]!;
      const randomPosition = GetRandomPositionInBoxCollider(randomCollider, this.Random);
      const treasureIndexToSpawn = GetRandomTreasureThatIsNotActive(this.isTreasureActive, this.Random);
      this.isTreasureActive[treasureIndexToSpawn] = true;
      this.treasurePositions[treasureIndexToSpawn] = roundPosition(randomPosition);
      this.spawnSerial[treasureIndexToSpawn] = (this.spawnSerial[treasureIndexToSpawn] ?? 0) + 1;
      this.foundBy[treasureIndexToSpawn] = "";
      this.spawns++;
      spawned = true;
    } else if (zones.length === 0 && !this.warnedNoZones) {
      this.warnedNoZones = true;
      this.Debug.LogWarning("treasure-hunt: no spawn zone has a size above 0 on all three axes; nothing can spawn");
    }

    // Start the next cycle and serialize.
    this.StartSpawnCycle();
    if (spawned) {
      this.RequestSerialization();
      this.ReplicateStates();
    }
  }

  /** THC:269-280: is any pool entry hidden? */
  isTreasureAvailable(): boolean {
    for (const active of this.isTreasureActive) if (!active) return true;
    return false;
  }

  /** THC:282-285. */
  private TakeOwnership(): void {
    if (!this.Networking.IsOwner(this)) this.Networking.SetOwner(this.Networking.LocalPlayer, this);
  }

  /** TR:28-30, moved here: the local player is credited once the referee has recorded their find. */
  private CheckCredits(isSnapshot: boolean): void {
    const me = this.Networking.LocalPlayer.sid;
    for (let i = 0; i < this.isTreasureActive.length; i++) {
      if (this.isTreasureActive[i] || this.foundBy[i] !== me) continue;
      const serial = this.spawnSerial[i]!;
      // Each spawn is credited once, and an older one never again: state can come back to an earlier copy (public
      // state is writable by any page), and that must not count a find twice.
      if (serial <= (this.credited.get(i) ?? 0)) continue;
      this.credited.set(i, serial);
      if (isSnapshot) continue; // a find recorded before this client arrived is not this visit's
      this.findsCredited++;
      this.returners[this.slots[i]!]?.CreditFind();
    }
  }

  /** Drops predictions the referee has answered (the spawn moved on or the flag is down) or that ran out. */
  private ExpirePredictions(): void {
    if (!this.predicted.size) return;
    let changed = false;
    for (const [index, [serial, until]] of [...this.predicted]) {
      if (this.spawnSerial[index] !== serial || !this.isTreasureActive[index] || this.Time.time >= until) {
        this.predicted.delete(index);
        changed = true;
      }
    }
    if (changed) this.ReplicateStates();
  }

  /** Stored state from before a settings change can have another pool size: it is fitted, the same on every client. */
  private FitToPool(): void {
    const n = this.kinds.length;
    const fit = <T>(list: T[] | null | undefined, fill: () => T): T[] => {
      const out = Array.isArray(list) ? list.slice(0, n) : [];
      while (out.length < n) out.push(fill());
      return out;
    };
    this.isTreasureActive = fit(this.isTreasureActive, () => false).map((v) => v === true);
    this.treasurePositions = fit(this.treasurePositions, () => Vector3.zero).map((v) => (v instanceof Vector3 ? v : Vector3.zero));
    this.spawnSerial = fit(this.spawnSerial, () => 0).map((v) => (typeof v === "number" && Number.isFinite(v) ? v : 0));
    this.foundBy = fit(this.foundBy, () => "").map((v) => (typeof v === "string" ? v : ""));
  }

  /** `show-zones`: the kit's preview cubes drawn as the real boxes (upstream's outline cubes, THP:791). */
  private ShowZones(): void {
    for (let z = 0; z < this.zonePreviews.length && z < KIT_ZONE_PREVIEWS; z++) {
      const preview = this.zonePreviews[z]!;
      const zone = this.settings.zones.find((candidate) => candidate.number === z + 1);
      const on = this.settings.showZones && !!zone;
      if (zone && on) {
        preview.transform.SetPositionAndRotation(zone.center, zoneRotation(zone));
        preview.transform.localScale = zone.size.scale(1 / this.settings.kitScale);
      }
      preview.SetActive(on);
    }
  }

  /** For tests: the kit slot of each pool index. */
  get PoolSlots(): number[] {
    return this.slots.slice();
  }

  /** For tests: what this client shows of pool index i. */
  IsShown(i: number): boolean {
    return this.shown[i] === true;
  }
}
