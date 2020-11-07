import TFS_Release_Contracts = require('ReleaseManagement/Core/Contracts');
import RM_Client = require('ReleaseManagement/Core/RestClient');
import TFS_Build_Contracts = require('TFS/Build/Contracts');
import TFS_Build_Extension_Contracts = require('TFS/Build/ExtensionContracts');
import DT_Client = require('TFS/DistributedTask/TaskRestClient');
import Controls = require('VSS/Controls');

abstract class BaseLighthouseTab extends Controls.BaseControl {
  protected static readonly HUB_NAME = 'build';
  protected static readonly HTML_ATTACHMENT_TYPE = 'lighthouse_html_result';
  protected static readonly META_ATTACHMENT_TYPE = 'lighthouse_meta_result';

  protected constructor() {
    super();
  }

  protected arrayBufferToString(buffer: ArrayBuffer): string {
    const enc = new TextDecoder('utf-8');
    const arr = new Uint8Array(buffer);
    return enc.decode(arr);
  }

  protected extractHostnameFromReportFilename(filename: string): string {
    const regex = /(.+)-\d+\.report\.html/g;
    const groups = regex.exec(filename);
    return groups && groups.length === 2 ? groups[1] : filename;
  }

  protected displayReports(reports: ILighthouseReport[]) {
    this.fixIdenticalReportDisplayNames(reports);

    const container = this.getElement();
    const buttons = container.find('#tabs');
    const iframes = container.find('#reports');

    buttons.empty();
    iframes.empty();

    for (let i = 0; i < reports.length; i++) {
      const report = reports[i];

      const button = $('<button/>', {
        text: report.displayName
      });

      button.attr('onClick', `showReport(this, '${report.internalName}');`);

      const iframe = $('<iframe>', {
        srcdoc: report.html,
        id: report.internalName,
        frameborder: '0',
        width: '100%',
        height: '100%',
        scrolling: 'yes',
        marginheight: '0',
        marginwidth: '0'
      });

      if (i === 0) {
        button.addClass('active');
        iframe.addClass('active');
      }

      buttons.append(button);
      iframes.append(iframe);
    }

    this.setOverlayText('');
  }

  private fixIdenticalReportDisplayNames(reports: ILighthouseReport[]) {
    const displayNameCounters: Record<string, number> = {};

    for (const report of reports) {
      if (!displayNameCounters[report.displayName]) {
        displayNameCounters[report.displayName] = 0;
      }

      const count = ++displayNameCounters[report.displayName];
      if (count > 1) {
        report.displayName = `${report.displayName} (${count})`;
      }
    }
  }

  protected setOverlayText(htmlStr: string) {
    const overlay = this.getElement().find('#overlay');
    const overlayText = overlay.find('p');

    if (htmlStr && htmlStr.length > 0) {
      overlay.show();
      overlayText.html(htmlStr);
    } else {
      overlay.hide();
      overlayText.html('');
    }
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
      this.tryDisplayReports(build).catch(console.error);
    });
  }

  private async tryDisplayReports(build: TFS_Build_Contracts.Build) {
    try {
      await this.loadReportsFromAttachments(build);
    } catch (err) {
      this.setOverlayText(err.message);
    }
  }

  private async loadReportsFromAttachments(build: TFS_Build_Contracts.Build): Promise<void> {
    const vsoContext: WebContext = VSS.getWebContext();
    const taskClient: DT_Client.TaskHttpClient = DT_Client.getClient();

    const projectId = vsoContext.project.id;
    const planId = build.orchestrationPlan.planId;

    const attachments = await taskClient.getPlanAttachments(
      projectId,
      BaseLighthouseTab.HUB_NAME,
      planId,
      BaseLighthouseTab.HTML_ATTACHMENT_TYPE
    );

    const reports: ILighthouseReport[] = [];

    for (const attachment of attachments) {
      if (attachment && attachment._links && attachment._links.self && attachment._links.self.href) {
        const attachmentContent = await taskClient.getAttachmentContent(
          projectId,
          BaseLighthouseTab.HUB_NAME,
          planId,
          attachment.timelineId,
          attachment.recordId,
          BaseLighthouseTab.HTML_ATTACHMENT_TYPE,
          attachment.name
        );

        const htmlReport = this.arrayBufferToString(attachmentContent);

        reports.push({
          internalName: attachment.name,
          displayName: this.extractHostnameFromReportFilename(attachment.name),
          html: htmlReport
        });
      }
    }

    if (reports.length === 0) {
      throw new Error('There is no Lighthouse HTML result attachment');
    }

    this.displayReports(reports);
  }
}

class ReleaseLighthouseTab extends BaseLighthouseTab {
  constructor() {
    super();
  }

  public initialize(): void {
    super.initialize();

    const env: TFS_Release_Contracts.ReleaseEnvironment = VSS.getConfiguration().releaseEnvironment;
    this.tryDisplayReports(env.releaseId, env.id).catch(console.error);
  }

  private async tryDisplayReports(releaseId: number, environmentId: number) {
    try {
      await this.loadReportsFromAttachments(releaseId, environmentId);
    } catch (err) {
      this.setOverlayText(err.message);
    }
  }

  private async loadReportsFromAttachments(releaseId: number, environmentId: number): Promise<void> {
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

    const reports: ILighthouseReport[] = [];
    const reportTabNames: { [htmlReportName: string]: string } = {};

    for (const runPlanId of runPlanIds) {
      const metaAttachments = await rmClient.getTaskAttachments(
        vsoContext.project.id,
        env.releaseId,
        env.id,
        deployStep.attempt,
        runPlanId,
        BaseLighthouseTab.META_ATTACHMENT_TYPE
      );

      for (const attachment of metaAttachments) {
        if (attachment && attachment._links && attachment._links.self && attachment._links.self.href) {
          const attachmentContent = await rmClient.getTaskAttachmentContent(
            vsoContext.project.id,
            env.releaseId,
            env.id,
            deployStep.attempt,
            runPlanId,
            attachment.recordId,
            attachment.type,
            attachment.name
          );

          const meta = JSON.parse(this.arrayBufferToString(attachmentContent)) as ILighthouseReportMeta;
          reportTabNames[meta.reportFileName] = meta.tabName;
        }
      }

      const htmlAttachments = await rmClient.getTaskAttachments(
        vsoContext.project.id,
        env.releaseId,
        env.id,
        deployStep.attempt,
        runPlanId,
        BaseLighthouseTab.HTML_ATTACHMENT_TYPE
      );

      for (const attachment of htmlAttachments) {
        if (attachment && attachment._links && attachment._links.self && attachment._links.self.href) {
          const attachmentContent = await rmClient.getTaskAttachmentContent(
            vsoContext.project.id,
            env.releaseId,
            env.id,
            deployStep.attempt,
            runPlanId,
            attachment.recordId,
            attachment.type,
            attachment.name
          );

          const htmlReport = this.arrayBufferToString(attachmentContent);
          const tabName = reportTabNames[attachment.name] || this.extractHostnameFromReportFilename(attachment.name);

          reports.push({
            internalName: attachment.name,
            displayName: tabName,
            html: htmlReport
          });
        }
      }
    }

    if (reports.length === 0) {
      throw new Error('There is no Lighthouse HTML result attachment');
    }

    this.displayReports(reports);
  }
}

const bodyEl = $('body');
if (typeof VSS.getConfiguration().onBuildChanged === 'function') {
  BuildLighthouseTab.enhance(BuildLighthouseTab, bodyEl, {});
} else if (typeof VSS.getConfiguration().releaseEnvironment === 'object') {
  ReleaseLighthouseTab.enhance(ReleaseLighthouseTab, bodyEl, {});
}

interface ILighthouseReport {
  internalName: string;
  displayName: string;
  html: string;
}

interface ILighthouseReportMeta {
  tabName: string;
  reportFileName: string;
  metaFileName: string;
}
