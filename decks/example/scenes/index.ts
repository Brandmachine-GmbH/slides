// This deck's own scenes.
//
// The name on the left is what deck.ts writes as `scene: "..."`. `make build` checks that every
// name a deck uses resolves, here or in the engine, and that no two registries claim the same
// name. Deck-local is the default because a drawing that carries one argument is not shared
// code: coupling two decks to one component means you cannot retime it for one meeting without
// touching the other.
import { lazy } from "react";
import type { ComponentType } from "react";
import type { SceneProps } from "@engine/types";

const scenes: Record<string, ComponentType<SceneProps>> = {
  "chain": lazy(() => import("./Chain")),
};
export default scenes;
