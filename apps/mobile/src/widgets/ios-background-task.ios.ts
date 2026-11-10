import * as BackgroundTask from "expo-background-task";
import * as TaskManager from "expo-task-manager";
import { refreshWidgetsInBackground } from "./background";

const TASK_NAME = "widget-refresh";

/**
 * iOS has nothing like Android's widget handler to hang the background refresh on, so it runs as a
 * BGTaskScheduler task (expo-background-task): iOS picks the time, often hours apart. Called from
 * the entry file, because a task has to be defined at module load on every launch.
 */
export function registerIosWidgetRefreshTask() {
  TaskManager.defineTask(TASK_NAME, async () => {
    await refreshWidgetsInBackground();
    return BackgroundTask.BackgroundTaskResult.Success;
  });
  BackgroundTask.registerTaskAsync(TASK_NAME, { minimumInterval: 30 }).catch(() => {});
}
