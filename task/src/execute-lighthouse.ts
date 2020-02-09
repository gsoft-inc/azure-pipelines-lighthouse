import * as fs from 'fs';
import * as path from 'path';

import * as taskLibrary from 'azure-pipelines-task-lib/task';
import { ToolRunner } from 'azure-pipelines-task-lib/toolrunner';

import { AuditEvaluator } from './audit-evaluator';

export class LighthouseTask {
  private static readonly BASE_REPORT_NAME = 'lighthouseresult';
  private static readonly TASK_TEMP_FOLDER = '__lighthouse';

  private targetUrl: string;
  private tempDirectory: string;
  private workingDirectory: string;
  private htmlReportPath: string;
  private jsonReportPath: string;
  private cliArgs: string[];
  private evaluateAuditRules: boolean;
  private auditRulesStr: string;

  private nodeExecPath: string;
  private npmExecPath: string;
  private lighthouseCommand: ToolRunner;

  private jsonReport: object;

  public async run() {
    try {
      this.ensureNodeAndNpmToolsAreAvailable();
      this.ensureTemporaryDirectory();
      this.defineLighthouseTargetUrl();
      this.defineWorkingDirectory();
      this.defineOutputReportPaths();
      this.defineLighthouseCliArgs();
      this.defineEvaluateAuditRules();
      await this.defineLighthouseCommand();
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

  private ensureNodeAndNpmToolsAreAvailable() {
    this.nodeExecPath = taskLibrary.which('node', true);
    console.log(`Node.js found at: ${this.nodeExecPath}`);

    this.npmExecPath = taskLibrary.which('npm', true);
    console.log(`NPM found at: ${this.npmExecPath}`);
  }

  private ensureTemporaryDirectory() {
    const agentTempDirectory = taskLibrary.getVariable('agent.tempDirectory');
    this.tempDirectory = path.join(agentTempDirectory, LighthouseTask.TASK_TEMP_FOLDER);

    taskLibrary.mkdirP(this.tempDirectory);
    console.log(`Temporary directory: ${this.workingDirectory}`);
  }

  private defineLighthouseTargetUrl() {
    this.targetUrl = taskLibrary.getInput('url', true);
    console.log(`Lighthouse target URL: ${this.targetUrl}`);
  }

  private defineWorkingDirectory() {
    const sourceDirectory = taskLibrary.getVariable('build.sourceDirectory') || taskLibrary.getVariable('build.sourcesDirectory');
    this.workingDirectory = taskLibrary.getInput('cwd', false) || sourceDirectory;
    if (!this.workingDirectory) {
      throw new Error('Working directory is not defined');
    }

    console.log(`Working directory: ${this.workingDirectory}`);
  }

  private defineOutputReportPaths() {
    this.htmlReportPath = path.join(this.tempDirectory, `${LighthouseTask.BASE_REPORT_NAME}.report.html`);
    this.jsonReportPath = path.join(this.tempDirectory, `${LighthouseTask.BASE_REPORT_NAME}.report.json`);

    console.log(`Lighthouse HTML report will be saved at: ${this.htmlReportPath}`);
    console.log(`Lighthouse JSON report will be saved at: ${this.jsonReportPath}`);
  }

  private defineLighthouseCliArgs() {
    const argsStr = taskLibrary.getInput('args', false) || '';
    const illegalArgs = ['--help', '--version', '--view', '--output=', '--output-path=', '--chrome-flags='];

    const args = argsStr
      .split(/\r?\n/)
      .map(arg => arg.trim())
      .filter(arg => arg.length > 0)
      .filter(arg => !illegalArgs.some(illegalArg => arg.startsWith(illegalArg)));

    args.push('--output=html');
    args.push('--output=json');
    args.push(`--output-path=${path.join(this.tempDirectory, LighthouseTask.BASE_REPORT_NAME)}`);
    args.push('--chrome-flags="--headless"');

    args.unshift(this.targetUrl);

    this.cliArgs = args;
  }

  private async defineLighthouseCommand() {
    let execPath: string;
    const args = this.cliArgs;

    execPath = this.getLocallyInstalledLighthouseExecPath();
    if (execPath) {
      console.log(`Locally installed Lighthouse found at ${execPath}`);
      args.unshift(execPath);
      this.lighthouseCommand = taskLibrary.tool(this.nodeExecPath);
      this.lighthouseCommand.arg(args);
      return;
    }

    execPath = this.getGloballyInstalledLighthouseExecPath();
    if (execPath) {
      console.log(`Globally installed Lighthouse found at ${execPath}`);
      this.lighthouseCommand = taskLibrary.tool(execPath);
      this.lighthouseCommand.arg(args);
      return;
    }

    execPath = await this.locallyInstallAndGetLighthouseExecPath();
    if (execPath) {
      console.log(`Locally installed Lighthouse found at ${execPath}`);
      this.lighthouseCommand = taskLibrary.tool(execPath);
      this.lighthouseCommand.arg(args);
      return;
    }

    throw new Error('npm package "lighthouse" is not installed globally or locally');
  }

  private defineEvaluateAuditRules() {
    this.evaluateAuditRules = taskLibrary.getBoolInput('evaluateAuditRules', false);
    this.auditRulesStr = taskLibrary.getInput('auditRulesStr', false) || '';
  }

  private getLocallyInstalledLighthouseExecPath(): string {
    const nodeModulesPath = path.join(this.workingDirectory, 'node_modules');
    const execPath = path.join(nodeModulesPath, 'lighthouse', 'lighthouse-cli', 'index.js');
    return fs.existsSync(execPath) ? execPath : '';
  }

  private getGloballyInstalledLighthouseExecPath(): string {
    const execPath = taskLibrary.which('lighthouse', false);
    return fs.existsSync(execPath) ? execPath : '';
  }

  private async locallyInstallAndGetLighthouseExecPath() {
    const execPath = path.join(this.tempDirectory, 'node_modules', 'lighthouse', 'lighthouse-cli', 'index.js');
    if (fs.existsSync(execPath)) return execPath;

    console.log('Existing Lighthouse installation not found');
    console.log(`Lighthouse will be installed using NPM at: ${this.tempDirectory}`);
    const npmCommand = taskLibrary.tool(this.npmExecPath);
    npmCommand.arg(['install', 'lighthouse', '--prefix', this.tempDirectory, '--loglevel=error']);

    const npmResultCode = await npmCommand.exec();
    console.log(`Installing Lighthouse with NPM returned: ${npmResultCode}`);

    return fs.existsSync(execPath) ? execPath : '';
  }

  private async executeLighthouse() {
    console.log('Executing Lighthouse...');
    const retCode = await this.lighthouseCommand.exec();

    if (!fs.existsSync(this.jsonReportPath)) {
      throw new Error(`Lighthouse did not generate a JSON output. Error code: ${retCode}`);
    }

    if (!fs.existsSync(this.htmlReportPath)) {
      throw new Error(`Lighthouse did not generate a HTML output. Error code: ${retCode}`);
    }

    console.log(`Lighthouse returned code: ${retCode}`);
  }

  private addLighthouseHtmlAttachment() {
    const properties = {
      name: 'lighthouseresult',
      type: 'lighthouse_html_result'
    };

    console.log('Adding the report as attachment of this build / release');
    taskLibrary.command('task.addattachment', properties, this.htmlReportPath);
    taskLibrary.command('task.uploadfile', properties, this.htmlReportPath);
    taskLibrary.command('task.uploadfile', properties, this.jsonReportPath);
  }

  private readJsonReport() {
    const jsonStr = fs.readFileSync(this.jsonReportPath, 'utf8');
    this.jsonReport = JSON.parse(jsonStr);
  }

  private processCriticalAudits() {
    if (this.evaluateAuditRules) {
      AuditEvaluator.evaluate(this.jsonReport, this.auditRulesStr);
    }
  }
}

new LighthouseTask().run().catch(console.log);
