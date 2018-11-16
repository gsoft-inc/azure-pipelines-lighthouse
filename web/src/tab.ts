import { BuildLighthouseTab } from "./build-lighthouse-tab";
import { ReleaseLighthouseTab } from "./release-lighthouse-tab";

const container = document.getElementById("container");

if (typeof VSS.getConfiguration().onBuildChanged === "function") {
  BuildLighthouseTab.enhance(BuildLighthouseTab, container, {});
} else if (typeof VSS.getConfiguration().releaseEnvironment === "object") {
  ReleaseLighthouseTab.enhance(ReleaseLighthouseTab, container, {});
}
