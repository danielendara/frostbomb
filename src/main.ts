import "./style.css";
import { markMainModuleFinished, scheduleDeferredSceneInit } from "./snowflake/schedule-scene-init";

void import("./app")
  .then(({ installFrostbomb, runDeferredBoot }) => {
    installFrostbomb();
    markMainModuleFinished();
    scheduleDeferredSceneInit(() => {
      void runDeferredBoot();
    });
  })
  .catch((error) => {
    console.error("Frostbomb failed to start", error);
  });
