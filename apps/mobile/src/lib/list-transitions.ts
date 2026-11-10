import { Easing, FadeOut, LinearTransition, ReduceMotion } from "react-native-reanimated";

/** Keep completion/removal quiet, and let neighboring rows close the gap. */
export const listLayoutTransition = LinearTransition.duration(200)
  .easing(Easing.out(Easing.cubic))
  .reduceMotion(ReduceMotion.System);
export const listItemExit = FadeOut.duration(140).reduceMotion(ReduceMotion.System);
