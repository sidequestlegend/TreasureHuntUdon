// treasure-hunt: TreasureHuntUdon (https://github.com/HoshouNeko/TreasureHuntUdon, MIT, (c) 2024 Hoshou Neko)
// on the portkit runtime. The classes bindings.json names by `type`; the build bundles this with bindings.json
// into pk-treasure-hunt.js. HiScoreElement.cs is not ported (used by nothing).

import type { GameDefinition } from "../portkit/src/index.ts";
import { PersistancePrize } from "./PersistancePrize.ts";
import { PersonalScoreList } from "./PersonalScoreList.ts";
import { Scoreboard } from "./Scoreboard.ts";
import { TreasureHuntController } from "./TreasureHuntController.ts";
import { TreasureReturner } from "./TreasureReturner.ts";

const game: GameDefinition = {
  slug: "treasure-hunt",
  behaviours: { TreasureHuntController, TreasureReturner, Scoreboard, PersonalScoreList, PersistancePrize },
};

export default game;
