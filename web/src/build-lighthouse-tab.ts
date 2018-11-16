import TFS_Build_Contracts = require("TFS/Build/Contracts");
import TFS_Build_Extension_Contracts = require("TFS/Build/ExtensionContracts");
import TFS_DistributedTask_Contracts = require("TFS/DistributedTask/Contracts");
import DT_Client = require("TFS/DistributedTask/TaskRestClient");

import { BaseLighthouseTab } from "./base-lighthouse-tab";

export class BuildLighthouseTab extends BaseLighthouseTab {
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

    const attachments = await taskClient.getPlanAttachments(projectId, BaseLighthouseTab.HUB_NAME, planId, BaseLighthouseTab.ATTACHMENT_TYPE);
    const attachment = this.findLighthouseAttachment(attachments);

    if (attachment && attachment._links && attachment._links.self && attachment._links.self.href) {
      const recordId = attachment.recordId;
      const timelineId = attachment.timelineId;

      const attachmentContent = await taskClient.getAttachmentContent(
        projectId, BaseLighthouseTab.HUB_NAME, planId, timelineId, recordId, BaseLighthouseTab.ATTACHMENT_TYPE, attachment.name,
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
