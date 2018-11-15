import Controls = require("VSS/Controls");
import TFS_Build_Contracts = require("TFS/Build/Contracts");
import TFS_Build_Extension_Contracts = require("TFS/Build/ExtensionContracts");
import TFS_DistributedTask_Contracts = require("TFS/DistributedTask/Contracts");
import TFS_Release_Contracts = require("ReleaseManagement/Core/Contracts");
import DT_Client = require("TFS/DistributedTask/TaskRestClient");
import RM_Client = require("ReleaseManagement/Core/RestClient");

export abstract class BaseLighthouseTab extends Controls.BaseControl {
  protected static readonly HUB_NAME = "build";
  protected static readonly ATTACHMENT_TYPE = "lighthouse_html_result";
  protected static readonly ATTACHMENT_NAME = "lighthouseresult";

  protected constructor() {
    super();
  }

  protected setFrameHtmlContent(htmlStr: string) {
    const container = this.getElement().get(0);
    const frame = container.querySelector('#lighthouse-result') as HTMLIFrameElement;
    const waiting = container.querySelector('#waiting') as HTMLElement;

    if (htmlStr && frame && waiting) {
      frame.srcdoc = htmlStr;
      waiting.style.display = 'none';
      frame.style.display = 'block';
    }
  }

  protected setWaitingText(htmlStr: string) {
    const container = this.getElement().get(0);
    container.querySelector('#waiting p').innerHTML = htmlStr;
  }

  protected static arrayBufferToString(buffer: ArrayBuffer): string {
    const enc = new TextDecoder('utf-8');
    const arr = new Uint8Array(buffer);
    return enc.decode(arr);
  }
}

export class BuildLighthouseTab extends BaseLighthouseTab {
  constructor() {
    super();
  }

  initialize(): void {
    super.initialize();

    const sharedConfig: TFS_Build_Extension_Contracts.IBuildResultsViewExtensionConfig = VSS.getConfiguration();
    sharedConfig.onBuildChanged((build: TFS_Build_Contracts.Build) => {
      this.trySearchForAttachment(build);
    });
  }

  private async trySearchForAttachment(build: TFS_Build_Contracts.Build) {
    try {
      await this.searchForAttachment(build);
    } catch (err) {
      this.setWaitingText(err.message);
    }
  }

  private async searchForAttachment(build: TFS_Build_Contracts.Build) {
    const vsoContext: WebContext = VSS.getWebContext();
    const taskClient: DT_Client.TaskHttpClient = DT_Client.getClient();

    const projectId = vsoContext.project.id;
    const planId = build.orchestrationPlan.planId;

    const attachments = await taskClient.getPlanAttachments(projectId, BaseLighthouseTab.HUB_NAME, planId, BaseLighthouseTab.ATTACHMENT_TYPE);
    const attachment = BuildLighthouseTab.findLighthouseAttachment(attachments);

    if (attachment && attachment._links && attachment._links.self && attachment._links.self.href) {
      const recordId = attachment.recordId;
      const timelineId = attachment.timelineId;

      const attachmentContent = await taskClient.getAttachmentContent(projectId, BaseLighthouseTab.HUB_NAME, planId, timelineId, recordId, BaseLighthouseTab.ATTACHMENT_TYPE, attachment.name);
      const htmlResult = BuildLighthouseTab.arrayBufferToString(attachmentContent);
      this.setFrameHtmlContent(htmlResult);
    }
  }

  private static findLighthouseAttachment(attachments: TFS_DistributedTask_Contracts.TaskAttachment[]) {
    if (attachments) {
      for (const attachment of attachments) {
        if (attachment.name === BaseLighthouseTab.ATTACHMENT_NAME) {
          return attachment;
        }
      }
    }

    return null;
  }
}

export class ReleaseLighthouseTab extends BaseLighthouseTab {
  constructor() {
    super();
  }

  initialize(): void {
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
    const env = release.environments.filter(env => env.id === environmentId)[0];

    if (!(env.deploySteps && env.deploySteps.length)) {
      throw new Error("This release has not been deployed yet");
    }

    const deployStep = env.deploySteps[env.deploySteps.length - 1];
    if (!(deployStep.releaseDeployPhases && deployStep.releaseDeployPhases.length)) {
      throw new Error("This release has no job");
    }

    const runPlanIds = deployStep.releaseDeployPhases.map(phase => phase.runPlanId);
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
      BaseLighthouseTab.ATTACHMENT_TYPE
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
      attachment.name
    );

    const htmlResult = BuildLighthouseTab.arrayBufferToString(attachmentContent);
    this.setFrameHtmlContent(htmlResult);
  }
}

const container = document.getElementById('container');
if (typeof VSS.getConfiguration().onBuildChanged === 'function') {
  BuildLighthouseTab.enhance(BuildLighthouseTab, container, {});
}
else if (typeof VSS.getConfiguration().releaseEnvironment === 'object') {
  ReleaseLighthouseTab.enhance(ReleaseLighthouseTab, container, {});
}

