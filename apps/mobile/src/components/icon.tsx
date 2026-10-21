import Feather from "@expo/vector-icons/Feather";
import { withUniwind } from "uniwind";

export const Icon = withUniwind(Feather);
export type IconName = keyof typeof Feather.glyphMap;
