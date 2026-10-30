import Feather from "@expo/vector-icons/Feather";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { withUniwind } from "uniwind";

export const Icon = withUniwind(Feather);
export type IconName = keyof typeof Feather.glyphMap;

/** For the few glyphs Feather lacks (e.g. the web's lucide Gauge). */
export const MaterialIcon = withUniwind(MaterialCommunityIcons);
