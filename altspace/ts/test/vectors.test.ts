// Rung 1, rules alone: hand-derived vectors for the spawn choice, the spawn box, scoring and the scoreboard
// order, each against the upstream line it comes from. (No dotnet golden run in this job: the expected values
// are worked by hand from the C# and written next to each case.)

import assert from "node:assert/strict";
import { test } from "node:test";
import { Vector3 } from "../portkit/src/index.ts";
import { GetRandomPositionInBoxCollider, GetRandomTreasureThatIsNotActive, roundPosition, TransformPoint, type SpawnRandom } from "../src/TreasureHuntController.ts";
import { SortListOfDictionaries, UniqueNames, UpstreamSortListOfDictionaries, type ScoreEntry } from "../src/Scoreboard.ts";
import { KIT_SLOTS, MAX_ZONES, poolKinds, poolSlots, readSettings, zoneRotation, type Zone } from "../src/Settings.ts";

/** A Random that plays back fixed draws r in [0, 1), the way the runtime turns r into Range and RangeInt. */
function scripted(...draws: number[]): SpawnRandom & { used: number } {
  const queue = draws.slice();
  const next = () => {
    if (!queue.length) throw new Error("ran out of scripted draws");
    out.used++;
    return queue.shift()!;
  };
  const out = {
    used: 0,
    Range: (min: number, max: number) => min + (max - min) * next(),
    RangeInt: (min: number, max: number) => Math.floor(min) + Math.floor((Math.floor(max) - Math.floor(min)) * next()),
  };
  return out;
}

const zone = (center: [number, number, number], size: [number, number, number], rotation: [number, number, number] = [0, 0, 0]): Zone => ({
  number: 1,
  center: new Vector3(...center),
  size: new Vector3(...size),
  rotation: new Vector3(...rotation),
});

const close = (a: Vector3, b: Vector3, eps = 1e-9) => assert.ok(Vector3.Distance(a, b) <= eps, `${a} != ${b}`);

test("THC:204-236 the n-th hidden treasure is chosen, n = Random.Range(0, hidden count); all out gives -1", () => {
  const F = false;
  const T = true;
  // flags F T F F: hidden indexes 0, 2, 3. Range(0,3) with r = 0, 0.34, 0.99 gives 0, 1, 2.
  assert.equal(GetRandomTreasureThatIsNotActive([F, T, F, F], scripted(0)), 0);
  assert.equal(GetRandomTreasureThatIsNotActive([F, T, F, F], scripted(0.34)), 2);
  assert.equal(GetRandomTreasureThatIsNotActive([F, T, F, F], scripted(0.99)), 3);
  // The prefab pool (5 Coin, 3 Gem, 1 Star) with coins 0, 2 out: hidden 1,3,4,5,6,7,8; r = 0.5 -> Range(0,7) = 3 -> index 5.
  assert.equal(GetRandomTreasureThatIsNotActive([T, F, T, F, F, F, F, F, F], scripted(0.5)), 5);
  // THC:217-221: nothing hidden, no draw.
  const r = scripted();
  assert.equal(GetRandomTreasureThatIsNotActive([T, T, T], r), -1);
  assert.equal(r.used, 0);
});

test("THC:239-249 a point in the box: half the unit collider each way, then the zone's TransformPoint", () => {
  // Draws x, y, z in that order (THC:243-245). r = 0, 0.5, 0.75 -> local (-0.5, 0, 0.25).
  // size (2,4,6) scales it to (-1, 0, 1.5); centre (1,2,3) moves it to (0, 2, 4.5).
  close(GetRandomPositionInBoxCollider(zone([1, 2, 3], [2, 4, 6]), scripted(0, 0.5, 0.75)), new Vector3(0, 2, 4.5));
  // Rotated 90 degrees about Y (Unity: forward -> right, right -> back): (-1, 0, 1.5) -> (1.5, 0, 1), plus centre.
  close(GetRandomPositionInBoxCollider(zone([1, 2, 3], [2, 4, 6], [0, 90, 0]), scripted(0, 0.5, 0.75)), new Vector3(2.5, 2, 4), 1e-9);
  // The middle draw lands on the centre whatever the rotation: the collider centre is ignored (THC:241).
  const z1 = zone([-0.154, 0.553, 1.579], [1.377, 0.792, 0.642], [10, 20, 30]);
  close(GetRandomPositionInBoxCollider(z1, scripted(0.5, 0.5, 0.5)), z1.center);
  // Positions travel in millimetres.
  assert.deepEqual(roundPosition(new Vector3(0.12345, -1.0004, 2.0005)), new Vector3(0.123, -1, 2.001));
});

test("spawn boxes: 2,000 points stay inside their box, rotated ones included, and spread over it", () => {
  let seed = 7;
  const lcg = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
  const random: SpawnRandom = { Range: (a, b) => a + (b - a) * lcg(), RangeInt: (a, b) => a + Math.floor((b - a) * lcg()) };
  for (const z of [zone([-0.154, 0.553, 1.579], [1.377, 0.792, 0.642]), zone([3, 1, -2], [2, 0.5, 1], [0, 45, 0]), zone([0, 2, 0], [1, 1, 3], [30, 60, 90])]) {
    const inverse = zoneRotation(z).inverse;
    const octants = new Set<string>();
    for (let n = 0; n < 2000; n++) {
      const p = GetRandomPositionInBoxCollider(z, random);
      const local = inverse.rotate(p.sub(z.center));
      for (const [v, s] of [[local.x, z.size.x], [local.y, z.size.y], [local.z, z.size.z]] as const) assert.ok(Math.abs(v) <= s / 2 + 1e-9, `outside: ${local}`);
      octants.add(`${Math.sign(local.x)}${Math.sign(local.y)}${Math.sign(local.z)}`);
    }
    assert.equal(octants.size, 8, "every corner of the box is reached");
  }
  // TransformPoint of a corner is the corner.
  close(TransformPoint(zone([0, 0, 0], [2, 2, 2]), new Vector3(0.5, 0.5, 0.5)), new Vector3(1, 1, 1));
});

test("pool order (THP item 2): coins, then gems, then the star; kit slots coins 0-11, gems 12-17, stars 18-21", () => {
  const defaults = readSettings(new Map());
  assert.deepEqual(poolKinds(defaults), ["Coin", "Coin", "Coin", "Coin", "Coin", "Gem", "Gem", "Gem", "Star"]);
  assert.deepEqual(poolSlots(defaults), [0, 1, 2, 3, 4, 12, 13, 14, 18]);
  // SB:262-275, PSL:40-54: lists in order of first appearance.
  assert.deepEqual(UniqueNames(poolKinds(defaults)), ["Coin", "Gem", "Star"]);
  assert.deepEqual(UniqueNames(poolKinds(readSettings(new Map([["coins", "0"]])))), ["Gem", "Star"]);
  const most = readSettings(new Map([["coins", "99"], ["gems", "99"], ["stars", "99"]]));
  assert.equal(poolKinds(most).length, KIT_SLOTS);
});

test("settings (PORT.md 8.1): prefab values by default, untrusted input clamped, zero-size zones dropped", () => {
  const d = readSettings(new Map());
  assert.equal(d.maxActive, 5);
  assert.deepEqual([d.timerMin, d.timerMax], [0, 5]);
  assert.deepEqual(d.points, { Coin: 1, Gem: 5, Star: 10 });
  assert.equal(d.prizeCost, 30);
  assert.equal(d.findDistance, 0.7);
  assert.deepEqual(d.zones.map((z) => z.number), [1, 2, 3]);
  assert.deepEqual(d.zones[0]!.size, new Vector3(1.377, 0.792, 0.642));

  const odd = readSettings(
    new Map([
      ["timer-min", "9"],
      ["timer-max", "2"],
      ["max-active", "40"],
      ["coins", "-3"],
      ["gems", "abc"],
      ["zone1-size", "1 0 1"],
      ["zone2", "nonsense"],
      ["zone5", "1 1 1"],
      ["zone5-size", "0.5 0.5 0.5"],
      [`zone${MAX_ZONES}`, "0 0 0"],
      [`zone${MAX_ZONES}-size`, "1 1 1"],
      ["find-distance", "-1"],
      ["prize-cost", "1e12"],
    ]),
  );
  assert.deepEqual([odd.timerMin, odd.timerMax], [2, 9], "min and max swapped");
  assert.equal(odd.counts.Coin, 0);
  assert.equal(odd.counts.Gem, 3, "unreadable: the prefab value");
  assert.equal(odd.maxActive, 4, "at most the pool (0 coins, 3 gems, 1 star)");
  assert.deepEqual(odd.zones.map((z) => z.number), [2, 3, 5, MAX_ZONES], "zone1 has a zero size; zone2 keeps its default centre");
  assert.equal(odd.findDistance, 0.05);
  assert.equal(odd.prizeCost, 1000000000);
  assert.deepEqual(readSettings(new Map([["zone1-size", "0 0 0"], ["zone2-size", "0 0 0"], ["zone3-size", "0 0 0"]])).zones, []);
});

/** PP:66-82: total = sum of count x points, eligible at total >= cost. */
function prizeTotal(counts: Record<string, number>, names: string[], points: number[], cost: number): [number, boolean] {
  let total = 0;
  for (let i = 0; i < names.length; i++) total += (counts[names[i]!] ?? 0) * points[i]!;
  return [total, total >= cost];
}

test("PP:66-82 scoring: counts times points against the cost (29, 30, 31; missing keys read 0)", () => {
  const names = ["Coin", "Gem", "Star"];
  const points = [1, 5, 10];
  assert.deepEqual(prizeTotal({ Coin: 4, Gem: 1, Star: 2 }, names, points, 30), [29, false]);
  assert.deepEqual(prizeTotal({ Coin: 5, Gem: 1, Star: 2 }, names, points, 30), [30, true]);
  assert.deepEqual(prizeTotal({ Coin: 1, Star: 3 }, names, points, 30), [31, true]);
  assert.deepEqual(prizeTotal({}, names, points, 30), [0, false]);
  assert.deepEqual(prizeTotal({}, names, points, 0), [0, true], "a cost of 0 unlocks on the first data update");
});

const entries = (...scores: number[]): ScoreEntry[] => scores.map((score, i) => ({ name: String.fromCharCode(65 + i), score }));
const scoresOf = (list: ScoreEntry[]) => list.map((e) => e.score);
const descending = (list: number[]) => list.every((v, i) => i === 0 || list[i - 1]! >= v);

test("SB:408-431 upstream's order is wrong from four players; the port sorts highest first, ties in join order", () => {
  // Worked by hand through SB:414-428 (score1 read once per l, never refreshed after a swap):
  //   [A0 B0 C2 D1]  l=2, score1=2: j=0 swap -> [C2 B0 A0 D1]; j=1 swap -> [C2 A0 B0 D1]; j=3 (2>1) swap -> [C2 A0 D1 B0]
  assert.deepEqual(scoresOf(UpstreamSortListOfDictionaries(entries(0, 0, 2, 1))), [2, 0, 1, 0]);
  assert.deepEqual(SortListOfDictionaries(entries(0, 0, 2, 1)).map((e) => `${e.name}${e.score}`), ["C2", "D1", "A0", "B0"]);
  // Three players: upstream is right (PORT.md item 35).
  assert.deepEqual(scoresOf(UpstreamSortListOfDictionaries(entries(1, 3, 2))), [3, 2, 1]);

  // Exhaustive over scores 0..3: upstream is always descending up to three players, and not always from four;
  // the port is always descending and keeps join order among equal scores.
  let upstreamWrongAtFour = 0;
  for (let n = 1; n <= 5; n++) {
    const total = 4 ** n;
    for (let code = 0; code < total; code++) {
      const scores = Array.from({ length: n }, (_, i) => Math.floor(code / 4 ** i) % 4);
      const fixed = SortListOfDictionaries(entries(...scores));
      assert.ok(descending(scoresOf(fixed)), `port order wrong for ${scores}`);
      for (let i = 1; i < fixed.length; i++) if (fixed[i - 1]!.score === fixed[i]!.score) assert.ok(fixed[i - 1]!.name < fixed[i]!.name, "ties keep join order");
      const upstream = scoresOf(UpstreamSortListOfDictionaries(entries(...scores)));
      if (n <= 3) assert.ok(descending(upstream), `upstream wrong for ${scores} with ${n} players`);
      else if (n === 4 && !descending(upstream)) upstreamWrongAtFour++;
    }
  }
  assert.ok(upstreamWrongAtFour > 0);
});
