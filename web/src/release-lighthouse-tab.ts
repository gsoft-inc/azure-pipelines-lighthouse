import TFS_Release_Contracts = require("ReleaseManagement/Core/Contracts");
import RM_Client = require("ReleaseManagement/Core/RestClient");

import { BaseLighthouseTab } from "./base-lighthouse-tab";

export class ReleaseLighthouseTab extends BaseLighthouseTab {
  constructor() {
    super();
  }

  public initialize(): void {
    super.initialize();

    const env: TFS_Release_Contracts.ReleaseEnvironment = VSS.getConfiguration().releaseEnvironment;
    this.trySearchForAttachment(env.releaseId, env.id);
  }

  private async trySearchForAttachment(releaseId: number, environmentId: number) {
    try {
      await this.searchForAttachment(releaseId, environmentId);
    } catch (err) {
      this.setWaitingText(err.message);
    }
  }

  private async searchForAttachment(releaseId: number, environmentId: number) {
    const vsoContext: WebContext = VSS.getWebContext();
    const rmClient = RM_Client.getClient() as RM_Client.ReleaseHttpClient;

    const release = await rmClient.getRelease(vsoContext.project.id, releaseId);
    const env = release.environments.filter((e) => e.id === environmentId)[0];

    if (!(env.deploySteps && env.deploySteps.length)) {
      throw new Error("This release has not been deployed yet");
    }

    const deployStep = env.deploySteps[env.deploySteps.length - 1];
    if (!(deployStep.releaseDeployPhases && deployStep.releaseDeployPhases.length)) {
      throw new Error("This release has no job");
    }

    const runPlanIds = deployStep.releaseDeployPhases.map((phase) => phase.runPlanId);
    if (!runPlanIds.length) {
      throw new Error("There are no plan IDs");
    }

    const runPlanId = runPlanIds[runPlanIds.length - 1];

    const attachments = await rmClient.getTaskAttachments(
      vsoContext.project.id,
      env.releaseId,
      env.id,
      deployStep.attempt,
      runPlanId,
      BaseLighthouseTab.ATTACHMENT_TYPE,
    );

    if (attachments.length === 0) {
      throw new Error("There is no Lighthouse HTML result attachment");
    }

    const attachment = attachments[attachments.length - 1];
    if (!(attachment && attachment._links && attachment._links.self && attachment._links.self.href)) {
      throw new Error("There is no downloadable Lighthouse HTML result attachment");
    }

    const attachmentContent = await rmClient.getTaskAttachmentContent(
      vsoContext.project.id,
      env.releaseId,
      env.id,
      deployStep.attempt,
      runPlanId,
      attachment.recordId,
      BaseLighthouseTab.ATTACHMENT_TYPE,
      attachment.name,
    );

    const htmlResult = BaseLighthouseTab.arrayBufferToString(attachmentContent);
    this.setFrameHtmlContent(htmlResult);
  }
}
