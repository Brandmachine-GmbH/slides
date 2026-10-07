/** The public surface of @brandmachine/slides: everything a site's own files may import.
 *
 *  This list IS the API. It is what the decks, the deck-local scenes and the mockups in a real
 *  site were found to import, and nothing more, so that every other module in the engine stays
 *  free to change between versions. Adding an export here is a promise; removing one is a
 *  breaking change. The same modules stay reachable as `@engine/types`, `@engine/useBuildStages`
 *  and `@engine/colorScheme` through 0.x, which is how every existing deck imports them. */
export type * from "./types";
export { useBuildStages } from "./useBuildStages";
export { useColorScheme, cssToken, type ColorScheme } from "./colorScheme";
