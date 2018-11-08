import Controls = require("VSS/Controls");
import TFS_Build_Contracts = require("TFS/Build/Contracts");
import TFS_Build_Extension_Contracts = require("TFS/Build/ExtensionContracts");
import TFS_DistributedTask_Contracts = require("TFS/DistributedTask/Contracts");
import TFS_Release_Contracts = require("ReleaseManagement/Core/Contracts");
import DT_Client = require("TFS/DistributedTask/TaskRestClient");
import RM_Client = require("ReleaseManagement/Core/RestClient");

export abstract class BaseLighthouseTab extends Controls.BaseControl {
    protected static readonly HubName = "build";
    protected static readonly AttachmentType = "lighthouse_html_result";
    protected static readonly AttachmentName = "lighthouseresult";

    protected constructor() {
        super();
    }

    protected setIframeHtmlContent(htmlStr: string) {
        let container = this.getElement().get(0);
        let iframe = container.querySelector('#lighthouse-result') as HTMLIFrameElement;
        let waiting = container.querySelector('#waiting') as HTMLElement;

        if (htmlStr && iframe && waiting) {
            iframe.srcdoc = htmlStr;
            waiting.style.display = 'none';
            iframe.style.display = 'block';
        }
    }

    protected setWaitingText(htmlStr: string) {
        let container = this.getElement().get(0);
        container.querySelector('#waiting p').innerHTML = htmlStr;
    }

    protected static arrayBufferToString(buffer: ArrayBuffer): string {
        let enc = new TextDecoder('utf-8');
        let arr = new Uint8Array(buffer);
        return enc.decode(arr);
    }
}

export class BuildLighthouseTab extends BaseLighthouseTab {
    public constructor() {
        super();
    }

    public initialize(): void {
        super.initialize();

        let sharedConfig: TFS_Build_Extension_Contracts.IBuildResultsViewExtensionConfig = VSS.getConfiguration();
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
        let vsoContext: WebContext = VSS.getWebContext();
        let taskClient: DT_Client.TaskHttpClient = DT_Client.getClient();

        let projectId = vsoContext.project.id;
        let planId = build.orchestrationPlan.planId;

        let attachments = await taskClient.getPlanAttachments(projectId, BaseLighthouseTab.HubName, planId, BaseLighthouseTab.AttachmentType);
        let attachment = BuildLighthouseTab.findLighthouseAttachment(attachments);

        if (attachment && attachment._links && attachment._links.self && attachment._links.self.href) {
            let recordId = attachment.recordId;
            let timelineId = attachment.timelineId;

            let attachmentContent = await taskClient.getAttachmentContent(projectId, BaseLighthouseTab.HubName, planId, timelineId, recordId, BaseLighthouseTab.AttachmentType, attachment.name);
            let htmlResult = BuildLighthouseTab.arrayBufferToString(attachmentContent);
            this.setIframeHtmlContent(htmlResult);
        }
    }

    private static findLighthouseAttachment(attachments: TFS_DistributedTask_Contracts.TaskAttachment[]) {
        if (attachments)
            for (let attachment of attachments)
                if (attachment.name == BaseLighthouseTab.AttachmentName)
                    return attachment;

        return null;
    }
}

export class ReleaseLighthouseTab extends BaseLighthouseTab {
    public constructor() {
        super();
    }

    public initialize(): void {
        super.initialize();

        let env: TFS_Release_Contracts.ReleaseEnvironment = VSS.getConfiguration().releaseEnvironment;
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
        let vsoContext: WebContext = VSS.getWebContext();
        let rmClient = <RM_Client.ReleaseHttpClient>RM_Client.getClient();

        let release = await rmClient.getRelease(vsoContext.project.id, releaseId);
        let env = release.environments.filter(env => env.id == environmentId)[0];

        if (!(env.deploySteps && env.deploySteps.length))
            throw new Error("This release has not been deployed yet");

        let deployStep = env.deploySteps[env.deploySteps.length - 1];
        if (!(deployStep.releaseDeployPhases && deployStep.releaseDeployPhases.length))
            throw new Error("This release has no job");

        let runPlanIds = deployStep.releaseDeployPhases.map(phase => phase.runPlanId);
        if (!runPlanIds.length)
            throw new Error("There are no plan IDs");

        let runPlanId = runPlanIds[runPlanIds.length - 1];

        let attachments = await rmClient.getTaskAttachments(
            vsoContext.project.id,
            env.releaseId,
            env.id,
            deployStep.attempt,
            runPlanId,
            BaseLighthouseTab.AttachmentType
        );

        if (attachments.length == 0)
            throw new Error("There is no Lighthouse HTML result attachment");

        let attachment = attachments[attachments.length - 1];
        if (!(attachment && attachment._links && attachment._links.self && attachment._links.self.href))
            throw new Error("There is no downloadable Lighthouse HTML result attachment");

        let attachmentContent = await rmClient.getTaskAttachmentContent(
            vsoContext.project.id,
            env.releaseId,
            env.id,
            deployStep.attempt,
            runPlanId,
            attachment.recordId,
            BaseLighthouseTab.AttachmentType,
            attachment.name
        );

        let htmlResult = BuildLighthouseTab.arrayBufferToString(attachmentContent);
        this.setIframeHtmlContent(htmlResult);
    }
}

let container = document.getElementById('container');
if (typeof VSS.getConfiguration().onBuildChanged == 'function') {
    BuildLighthouseTab.enhance(BuildLighthouseTab, container, {});
}
else if (typeof VSS.getConfiguration().releaseEnvironment == 'object') {
    ReleaseLighthouseTab.enhance(ReleaseLighthouseTab, container, {});
}

