import TFS_Release_Contracts = require('ReleaseManagement/Core/Contracts');
import RM_Client = require('ReleaseManagement/Core/RestClient');
import TFS_Build_Contracts = require('TFS/Build/Contracts');
import TFS_Build_Extension_Contracts = require('TFS/Build/ExtensionContracts');
import TFS_DistributedTask_Contracts = require('TFS/DistributedTask/Contracts');
import DT_Client = require('TFS/DistributedTask/TaskRestClient');
import Controls = require('VSS/Controls');

abstract class BaseLighthouseTab extends Controls.BaseControl {
  protected static readonly HUB_NAME = 'build';
  protected static readonly ATTACHMENT_TYPE = 'lighthouse_html_result';
  protected static readonly ATTACHMENT_NAME = 'lighthouseresult';

  protected static arrayBufferToString(buffer: ArrayBuffer): string {
    const enc = new TextDecoder('utf-8');
    const arr = new Uint8Array(buffer);
    return enc.decode(arr);
  }

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
}

class BuildLighthouseTab extends BaseLighthouseTab {
  constructor() {
    super();
  }

  public initialize(): void {
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

    const attachments = await taskClient.getPlanAttachments(
      projectId,
      BaseLighthouseTab.HUB_NAME,
      planId,
      BaseLighthouseTab.ATTACHMENT_TYPE
    );
    const attachment = this.findLighthouseAttachment(attachments);

    if (attachment && attachment._links && attachment._links.self && attachment._links.self.href) {
      const recordId = attachment.recordId;
      const timelineId = attachment.timelineId;

      const attachmentContent = await taskClient.getAttachmentContent(
        projectId,
        BaseLighthouseTab.HUB_NAME,
        planId,
        timelineId,
        recordId,
        BaseLighthouseTab.ATTACHMENT_TYPE,
        attachment.name
      );

      const htmlResult = BaseLighthouseTab.arrayBufferToString(attachmentContent);
      this.setFrameHtmlContent(htmlResult);
    }
  }

  private findLighthouseAttachment(attachments: TFS_DistributedTask_Contracts.TaskAttachment[]) {
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

class ReleaseLighthouseTab extends BaseLighthouseTab {
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

  private async searchForAttachmentAsync(releaseId: number, environmentId: number): Promise<IAttachmentMetadata[]> {
    const rmClient = RM_Client.getClient() as RM_Client.ReleaseHttpClient;
    const vsoContext: WebContext = VSS.getWebContext();

    const release = await rmClient.getRelease(vsoContext.project.id, releaseId);
    const env = release.environments.filter(e => e.id === environmentId)[0];

    if (!env.deploySteps || env.deploySteps.length === 0) {
      throw new Error('This release has not been deployed yet');
    }

    // only look for last attempt
    const deployStep = env.deploySteps[env.deploySteps.length - 1];
    if (!deployStep.releaseDeployPhases || deployStep.releaseDeployPhases.length === 0) {
      throw new Error('This release has no job');
    }

    const runPlanIds = deployStep.releaseDeployPhases.map(phase => phase.runPlanId);
    if (!runPlanIds.length) {
      throw new Error('There are no plan IDs');
    }

    const allAttachments = new Array<IAttachmentMetadata>();

    for (const runPlanId of runPlanIds) {
      const attachments = await rmClient.getTaskAttachments(
        vsoContext.project.id,
        env.releaseId,
        env.id,
        deployStep.attempt,
        runPlanId,
        BaseLighthouseTab.ATTACHMENT_TYPE
      );

      for (const attachment of attachments) {
        if (attachment && attachment._links && attachment._links.self && attachment._links.self.href) {
          allAttachments.push({
            projectId: vsoContext.project.id,
            releaseId: env.releaseId,
            environmentId: env.id,
            attemptId: deployStep.attempt,
            runPlanId: runPlanId,
            recordId: attachment.recordId,
            type: BaseLighthouseTab.ATTACHMENT_TYPE,
            name: attachment.name
          });
        }
      }
    }

    return allAttachments;
  }

  private async searchForAttachment(releaseId: number, environmentId: number) {
    const rmClient = RM_Client.getClient() as RM_Client.ReleaseHttpClient;
    const attachments = await this.searchForAttachmentAsync(releaseId, environmentId);

    if (attachments.length === 0) {
      throw new Error('There is no Lighthouse HTML result attachment');
    }

    const attachment = attachments[0];
    const attachmentContent = await rmClient.getTaskAttachmentContent(
      attachment.projectId,
      attachment.releaseId,
      attachment.environmentId,
      attachment.attemptId,
      attachment.runPlanId,
      attachment.recordId,
      attachment.type,
      attachment.name
    );

    const htmlResult = BaseLighthouseTab.arrayBufferToString(attachmentContent);
    this.setFrameHtmlContent(htmlResult);
  }
}

const rootContainer = document.getElementById('container');

if (typeof VSS.getConfiguration().onBuildChanged === 'function') {
  BuildLighthouseTab.enhance(BuildLighthouseTab, rootContainer, {});
} else if (typeof VSS.getConfiguration().releaseEnvironment === 'object') {
  ReleaseLighthouseTab.enhance(ReleaseLighthouseTab, rootContainer, {});
}

interface IAttachmentMetadata {
  projectId: string;
  releaseId: number;
  environmentId: number;
  attemptId: number;
  runPlanId: string;
  recordId: string;
  type: string;
  name: string;
}
