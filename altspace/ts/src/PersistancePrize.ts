// PersistancePrize.cs (PP) on the portkit runtime.
//
// Upstream is a VRChat PlayerObject with persistence: one copy per player, each with a saved synced flag, and
// the container shows on every client while that copy's flag is set (PP:33-46, PPP:96-119). There are no
// PlayerObjects here (PORT.md 10.1 row 2, coordinator decision): one prize per hunt, and each player's flag is
// a key in their own saved data (PlayerData.ts, PRIZE_KEY), which only they can write and everyone present
// reads. The container shows while any present player has the flag.
//
// Not reproduced (PORT.md item 48, 10.1 row 9): upstream's missing owner test, by which a qualifying player's
// client ran the check on every copy and sounded one win per copy; and WinSequence reading `_owner` before
// OnPlayerRestored set it. Here the win is sent once, by the winner, with the winner's head position.

import { Behaviour, Quaternion, Vector3, type AudioSourceRef, type GameObject, type Player } from "../portkit/src/index.ts";
import { GetCount, HasPrize, PRIZE_KEY } from "./PlayerData.ts";
import { KINDS, readSettings, type HuntSettings, type Kind } from "./Settings.ts";

export class PersistancePrize extends Behaviour {
  // From bindings.json.
  /** "Container (Drop prize here)" (PPP:120-151): starts hidden. */
  prizeContainer!: GameObject;
  /** WinSound (PPP:152-279): clip 0 of its own list. */
  winAudioSource!: AudioSourceRef;

  // PPP:62-67, from settings: names, points, cost.
  treasureNames: Kind[] = [...KINDS];
  treasurePoints: number[] = [1, 5, 10];
  prizeCost = 30;

  private totalScore = 0;
  private settings!: HuntSettings;
  private shown = false;
  private warnedPrizeObject = false;

  /** Win sequences heard on this client (for tests). */
  winSequences = 0;
  lastWinPosition: Vector3 | null = null;

  override Start(): void {
    this.settings = readSettings(this.Settings);
    this.treasurePoints = this.treasureNames.map((name) => this.settings.points[name]);
    this.prizeCost = this.settings.prizeCost;
    const r = this.settings.prizeRotation;
    this.transform.SetPositionAndRotation(this.settings.prizePosition, Quaternion.Euler(r.x, r.y, r.z));
    this.prizeContainer.SetActive(false);
    if (this.settings.prizeObject && !this.warnedPrizeObject) {
      this.warnedPrizeObject = true;
      this.Debug.LogWarning("treasure-hunt: prize-object is not supported yet (the runtime has no scene lookup by name); only the kit's prize is shown");
    }
  }

  /** PP:37-46: the local player's flag. */
  get isElegibleForPrize(): boolean {
    return HasPrize(this.PlayerData, this.Networking.LocalPlayer);
  }

  /** PP:66-82. */
  calculateTotalScore(): void {
    this.totalScore = 0;
    for (let i = 0; i < this.treasureNames.length; i++) {
      this.totalScore = this.totalScore + GetCount(this.PlayerData, this.Networking.LocalPlayer, this.treasureNames[i]!) * this.treasurePoints[i]!;
    }
    if (this.totalScore >= this.prizeCost) {
      const head = this.Input.Poses?.head.position ?? this.Input.Position ?? this.transform.position;
      this.SendCustomNetworkEvent("All", "WinSequence", head.x, head.y, head.z);
      this.PlayerData.SetBool(PRIZE_KEY, true);
      this.RefreshContainer();
    }
  }

  /** The upstream setter's effect (PP:39-45), for one prize: shown while any present player is eligible. */
  RefreshContainer(): void {
    let any = false;
    for (const player of this.Networking.GetPlayers()) if (HasPrize(this.PlayerData, player)) any = true;
    const show = any && this.settings.prize;
    if (show === this.shown) return;
    this.shown = show;
    this.prizeContainer.SetActive(show);
  }

  get IsShown(): boolean {
    return this.shown;
  }

  /** PP:84-90. The local player's first load counts as their first data update (item 41). */
  override OnPlayerRestored(player: Player): void {
    if (player.isLocal && !this.isElegibleForPrize) this.calculateTotalScore();
    this.RefreshContainer();
  }

  /** PP:92-100. */
  override OnPlayerDataUpdated(player: Player): void {
    if (player.isLocal && !this.isElegibleForPrize) this.calculateTotalScore();
    this.RefreshContainer();
  }

  override OnPlayerJoined(): void {
    this.RefreshContainer();
  }

  override OnPlayerLeft(): void {
    this.RefreshContainer();
  }

  /** PP:102-106: the win sound, at the winner's head. */
  WinSequence(x: unknown, y: unknown, z: unknown): void {
    const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const at = new Vector3(n(x), n(y), n(z));
    this.winSequences++;
    this.lastWinPosition = at;
    this.winAudioSource.transform.position = at;
    this.winAudioSource.PlayOneShot(0);
  }
}
