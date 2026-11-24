// Scoreboard.cs (SB) on the portkit runtime: one list per treasure name, one row per player present.
//
// Upstream instantiates a list per name and a row per player (SB:315-347) and destroys rows on every refresh.
// The kit holds three lists of sixteen rows (rows past the mask were clipped upstream anyway, item 37); a
// refresh shows, fills or hides them, and the relay host sends only texts that changed.
//
// Changed (PORT.md 10.1, coordinator decision): SortListOfDictionaries (SB:408-431) is meant to put the highest
// score first but reads the outer score once and never refreshes it after a swap, so from four players it can
// show rows out of order (item 35; for scores 0,0,2,1 in join order it shows 2,0,1,0). The port sorts properly:
// highest first, ties in join order. `UpstreamSortListOfDictionaries` keeps the old loop for the test vectors.

import { Behaviour, type GameObject, type Player, type TextRef } from "../portkit/src/index.ts";
import { GetCount } from "./PlayerData.ts";
import type { Kind } from "./Settings.ts";
import type { TreasureHuntController } from "./TreasureHuntController.ts";

/** One row: upstream's one-entry DataDictionary {displayName: score}. */
export interface ScoreEntry {
  name: string;
  score: number;
}

/** SB:262-275 and PSL:40-54: the distinct names, in order of first appearance. */
export function UniqueNames(pool: readonly string[]): string[] {
  const listOfTreasures: string[] = [];
  for (const t of pool) if (listOfTreasures.indexOf(t) < 0) listOfTreasures.push(t);
  return listOfTreasures;
}

/** The port's order: highest score first; equal scores keep their join order (Array.sort is stable). */
export function SortListOfDictionaries(list: readonly ScoreEntry[]): ScoreEntry[] {
  return list.slice().sort((a, b) => b.score - a.score);
}

/** SB:408-431 exactly, for one list: kept only to pin upstream's order in the test vectors. */
export function UpstreamSortListOfDictionaries(list: readonly ScoreEntry[]): ScoreEntry[] {
  const currentDataList = list.slice();
  for (let l = 0; l < currentDataList.length; l++) {
    const score1 = currentDataList[l]!.score;
    for (let j = 0; j < currentDataList.length; j++) {
      const score2 = currentDataList[j]!.score;
      if (score1 > score2) {
        const tmp = currentDataList[j]!;
        currentDataList[j] = currentDataList[l]!;
        currentDataList[l] = tmp;
      }
    }
  }
  return currentDataList;
}

export class Scoreboard extends Behaviour {
  // From bindings.json.
  /** Upstream: TreasuresContainer, read for the wrapper names. Here the controller, which knows the pool. */
  treasuresPool!: TreasureHuntController;
  /** The kit's prebuilt lists: root, title, and `rowsPerList` rows each (row object, name text, score text). */
  listRoots: GameObject[] = [];
  listTitles: TextRef[] = [];
  rowObjects: GameObject[] = [];
  rowNames: TextRef[] = [];
  rowScores: TextRef[] = [];
  rowsPerList = 16;

  listOfTreasures: Kind[] = [];
  /** Name -> rows, as SB's dataBase (a dictionary of lists of one-entry dictionaries). */
  dataBase = new Map<Kind, ScoreEntry[]>();
  private initiated = false;
  /** Refreshes done, for tests. */
  refreshes = 0;

  override Start(): void {
    this.SendCustomEventDelayedSeconds("Initiate", 1);
  }

  /** SB:255-261. */
  Initiate(): void {
    this.InitiateItems();
    this.FillDataBase();
    this.PrintLists();
    this.initiated = true;
    this.SendCustomEventDelayedFrames("PrintElements", 1);
  }

  /** SB:262-285. */
  InitiateItems(): void {
    this.dataBase.clear();
    this.listOfTreasures = UniqueNames(this.treasuresPool.PoolKinds()) as Kind[];
    for (const t of this.listOfTreasures) this.dataBase.set(t, []);
  }

  /** SB:287-311: every player present, with their saved count of each name, then sorted. */
  FillDataBase(): void {
    const allPlayers: Player[] = this.Networking.GetPlayers();
    for (const name of this.listOfTreasures) {
      const list: ScoreEntry[] = [];
      for (const player of allPlayers) list.push({ name: player.displayName, score: GetCount(this.PlayerData, player, name) });
      this.dataBase.set(name, SortListOfDictionaries(list));
    }
  }

  /** SB:315-325: one list per name, titled with it. Lists the pool does not use are hidden. */
  PrintLists(): void {
    for (let i = 0; i < this.listRoots.length; i++) {
      const name = this.listOfTreasures[i];
      this.listRoots[i]!.SetActive(name !== undefined);
      if (name !== undefined && this.listTitles[i]) this.listTitles[i]!.text = name;
    }
  }

  /** SB:326-347: the rows, shown and filled instead of instantiated. */
  PrintElements(): void {
    if (!this.initiated) return;
    this.refreshes++;
    for (let i = 0; i < this.listRoots.length; i++) {
      const entries = this.dataBase.get(this.listOfTreasures[i]!) ?? [];
      for (let p = 0; p < this.rowsPerList; p++) {
        const at = i * this.rowsPerList + p;
        const row = this.rowObjects[at];
        if (!row) continue;
        const entry = entries[p];
        row.SetActive(entry !== undefined);
        if (!entry) continue;
        this.rowNames[at]!.text = entry.name;
        this.rowScores[at]!.text = String(entry.score);
      }
    }
  }

  /** What the board shows for one name, in order (for tests). */
  Rows(name: Kind): ScoreEntry[] {
    return (this.dataBase.get(name) ?? []).slice(0, this.rowsPerList);
  }

  private Refresh(): void {
    if (!this.initiated) return;
    this.FillDataBase();
    this.PrintElements();
  }

  // SB:391-406. A player's first saved data arrives as OnPlayerDataUpdated too (right after OnPlayerRestored).
  override OnPlayerDataUpdated(): void {
    this.Refresh();
  }
  override OnPlayerJoined(): void {
    this.Refresh();
  }
  override OnPlayerLeft(): void {
    this.Refresh();
  }
}
