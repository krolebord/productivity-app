import { syncDbSchema, type UserDbProps } from "@productivity/core/user-db/migrations";
import { createWsRemoteSource, getWorkerConfig, startDbWorker } from "@sqlite-sync/core/worker";

const workerConfig = await getWorkerConfig<UserDbProps>();

await startDbWorker({
  workerConfig,
  syncDbSchema,
  verifySchema: import.meta.env.DEV,
  storageVersion: "1",
  createRemoteSource: createWsRemoteSource({
    createWebSocket: () => {
      // Worker scripts share the app's origin, so sync follows whatever
      // host the app is served on instead of the canonical VITE_APP_URL.
      const url = new URL(`/user-db/user-db-server/user-${workerConfig.props.userId}`, globalThis.location.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      return new WebSocket(url);
    },
  }),
});
