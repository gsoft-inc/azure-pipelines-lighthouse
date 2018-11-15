
import * as fs from "fs";
import * as path from "path";

import * as taskLibrary from "azure-pipelines-task-lib/task";
import { ToolRunner } from "azure-pipelines-task-lib/toolrunner";

import { AuditEvaluator } from "./audit-evaluator";

export class LighthouseTask {
  private static readonly BASE_REPORT_NAME = "lighthouseresult";

  private url: string;
  private workingDirectory: string;
  private htmlReportPath: string;
  private jsonReportPath: string;
  private cliArgs: string[];
  private evaluateAuditRules: boolean;
  private auditRulesStr: string;

  private command: ToolRunner;

  private jsonReport: LH.ResultLite;

  public async run() {
    try {
      this.defineUrl();
      this.defineWorkingDirectory();
      this.defineOutputReportPaths();
      this.defineCliArgs();
      this.defineLighthouseCommand();
      this.defineEvaluateAuditRules();

      await this.executeLighthouse();

      this.readJsonReport();
      this.processCriticalAudits();
    } catch (err) {
      taskLibrary.setResult(taskLibrary.TaskResult.Failed, err.message);
    } finally {
      if (fs.existsSync(this.htmlReportPath)) {
        this.addLighthouseHtmlAttachment();
      }
    }
  }

  private defineUrl() {
    this.url = taskLibrary.getInput("url", true);
  }

  private defineWorkingDirectory() {
    const sourceDirectory = taskLibrary.getVariable("build.sourceDirectory") || taskLibrary.getVariable("build.sourcesDirectory");
    this.workingDirectory = taskLibrary.getInput("cwd", false) || sourceDirectory;
    if (!this.workingDirectory) {
      throw new Error("Working directory is not defined");
    }
  }

  private defineOutputReportPaths() {
    this.htmlReportPath = path.join(this.workingDirectory, `${LighthouseTask.BASE_REPORT_NAME}.report.html`);
    this.jsonReportPath = path.join(this.workingDirectory, `${LighthouseTask.BASE_REPORT_NAME}.report.json`);
  }

  private defineCliArgs() {
    const argsStr = taskLibrary.getInput("args", false) || "";

    const illegalArgs = [
      "--output=",
      "--output-path=",
      "--chrome-flags=",
    ];

    const args = argsStr
      .split(/\r?\n/)
      .map((arg) => arg.trim())
      .filter((arg) => arg.length > 0)
      .filter((arg) => !illegalArgs.some((illegalArg) => arg.startsWith(illegalArg)));

    args.push("--output=html");
    args.push("--output=json");
    args.push(`--output-path=${path.join(this.workingDirectory, LighthouseTask.BASE_REPORT_NAME)}`);
    args.push('--chrome-flags="--headless"');

    args.unshift(this.url);

    this.cliArgs = args;
  }

  private defineLighthouseCommand() {
    let execPath: string;
    const args = this.cliArgs;

    execPath = this.getLocalLighthouseExecPath();
    if (execPath) {
      args.unshift(execPath);
      this.command = taskLibrary.tool(taskLibrary.which("node", true));
      this.command.arg(args);
      return;
    }

    execPath = this.getGlobalLighthouseExecPath();
    if (execPath) {
      this.command = taskLibrary.tool(execPath);
      this.command.arg(args);
      return;
    }

    throw new Error('npm package "lighthouse" is not installed globally or locally');
  }

  private defineEvaluateAuditRules() {
    this.evaluateAuditRules = taskLibrary.getBoolInput("evaluateAuditRules", false);
    this.auditRulesStr = taskLibrary.getInput("auditRulesStr", false) || "";
  }

  private getGlobalLighthouseExecPath(): string {
    const execPath = taskLibrary.which("lighthouse", false);
    return fs.existsSync(execPath) ? execPath : "";
  }

  private getLocalLighthouseExecPath(): string {
    const nodeModulesPath = path.join(this.workingDirectory, "node_modules");
    const execPath = path.join(nodeModulesPath, "lighthouse", "lighthouse-cli", "index.js");
    return fs.existsSync(execPath) ? execPath : "";
  }

  private async executeLighthouse() {
    const retCode = await this.command.exec();

    if (!fs.existsSync(this.jsonReportPath)) {
      throw new Error(`Lighthouse did not generate a JSON output. Error code: ${retCode}`);
    }

    if (!fs.existsSync(this.htmlReportPath)) {
      throw new Error(`Lighthouse did not generate a HTML output. Error code: ${retCode}`);
    }
  }

  private addLighthouseHtmlAttachment() {
    const properties = {
      name: "lighthouseresult",
      type: "lighthouse_html_result",
    };

    taskLibrary.command("taskLibrary.addattachment", properties, this.htmlReportPath);
  }

  private readJsonReport() {
    const jsonStr = fs.readFileSync(this.jsonReportPath, "utf8");
    this.jsonReport = JSON.parse(jsonStr);
  }

  private processCriticalAudits() {
    if (this.evaluateAuditRules) {
      AuditEvaluator.evaluate(
        this.jsonReport, this.auditRulesStr,
      );
    }
  }
}

new LighthouseTask().run();
