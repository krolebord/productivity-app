import { createWsRemoteSource, getWorkerConfig, startDbWorker } from "@sqlite-sync/core/worker";
import { PartySocket } from "partysocket";
import { syncDbSchema, type UserDbProps } from "./migrations";

const workerConfig = await getWorkerConfig<UserDbProps>();

await startDbWorker({
  workerConfig,
  syncDbSchema,
  verifySchema: import.meta.env.DEV,
  storageVersion: "1",
  createRemoteSource: createWsRemoteSource({
    createWebSocket: () =>
      new PartySocket({
        // Worker scripts share the app's origin, so sync follows whatever
        // host the app is served on instead of the canonical VITE_APP_URL.
        host: globalThis.location.origin,
        prefix: "user-db",
        party: "user-db-server",
        room: `user-${workerConfig.props.userId}`,
      }),
  }),
});
