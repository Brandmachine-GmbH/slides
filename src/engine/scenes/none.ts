// The empty deck-scene registry.
//
// `@deck-scenes` resolves here for the admin editor, which builds with no deck selected, and for
// any deck that has no scenes/ folder of its own. Having a real module to point at is what lets
// slides.tsx import the registry unconditionally instead of guarding every use of it.
import type { ComponentType } from "react";
import type { SceneProps } from "../types";

const none: Record<string, ComponentType<SceneProps>> = {};
export default none;
