import * as fs from 'fs';
import * as os from 'os';
import * as url from 'url';
import * as path from 'path';

import * as taskLibrary from 'azure-pipelines-task-lib/task';
import { ToolRunner } from 'azure-pipelines-task-lib/toolrunner';

export class AuditAssertion {
  public static fromString(assertionStr: string) {
    if (!assertionStr) {
      throw new Error('Audit assertion is null or empty.');
    }

    const matches = AuditAssertion.AUDIT_ASSERTION_REGEX.exec(assertionStr.trim());
    if (!matches) {
      throw new Error(`Audit assertion "${assertionStr}" is malformed.`);
    }

    const assertion = new AuditAssertion();

    assertion.auditName = matches[1];
    assertion.operator = matches[2];
    assertion.score = Number(matches[3]);

    return assertion;
  }

  private static readonly AUDIT_ASSERTION_REGEX = /^([a-z-]+)\s*([=<>])\s*([0-9]+(\.[0-9]+)?)$/i;

  public auditName: string;
  public operator: string;
  public score: number;

  protected constructor() { }
}

export class AuditEvaluator {
  public static evaluate(report: object, manyAssertionStr: string): number {
    const assertionStrArray = (manyAssertionStr || '')
      .split(/\r?\n/)
      .map(a => a.trim())
      .filter(a => a.length > 0);

    const errors = [];
    let successCount = 0;

    for (const assertionStr of assertionStrArray) {
      try {
        if (this.evaluateAuditAssertionStr(report || {}, assertionStr)) {
          successCount++;
        }
      } catch (err) {
        errors.push(err.message);
      }
    }

    if (errors.length) {
      throw new Error(errors.join(os.EOL));
    }

    return successCount;
  }

  private static evaluateAuditAssertionStr(report, assertionStr) {
    const assertion = AuditAssertion.fromString(assertionStr);
    const audit = AuditEvaluator.findAudit(report.audits, assertion.auditName);
    if (audit === null) {
      return false;
    }

    let displayValue = audit.displayValue || '';
    if (displayValue.length > 0) {
      displayValue = `, friendly display value: ${displayValue}`;
    }

    if (assertion.operator === '=') {
      if (audit.score !== assertion.score) {
        throw new Error(`Expected ${assertion.score} for audit "${assertion.auditName}" score but got ${audit.score}${displayValue}`);
      }
    } else if (assertion.operator === '>') {
      if (audit.score < assertion.score) {
        throw new Error(
          `Expected audit "${assertion.auditName}" to have a score greater than ${assertion.score}, but got ${audit.score}${displayValue}`
        );
      }
    } else if (assertion.operator === '<') {
      if (audit.score > assertion.score) {
        throw new Error(
          `Expected audit "${assertion.auditName}" to have a score lower than ${assertion.score}, but got ${audit.score}${displayValue}`
        );
      }
    }

    return true;
  }

  private static findAudit(audits: object[], name: string) {
    const audit = audits[name];
    if (!audit) {
      throw new Error(`Could not find audit "${name}"`);
    }

    // Do not evaluate informative or not-applicable audits
    if (typeof audit.score === 'undefined' || audit.score === null) {
      return null;
    }

    return audit;
  }
}

export class LighthouseCliArgumentSanitizer {
  private static readonly DEFAULT_CHROME_FLAGS: string[] = ["--headless"];
  private static readonly ILLEGAL_ARGS: string[] = ['--view', '--output=', '--output-path=', '--chrome-flags='];

  public static sanitize(argsStr: string): string[] {
    const results = [];
    const whitespaceRegex = /\s/;
    const newlineSplit = argsStr.split(/\r?\n/).map(arg => arg.trim());

    newlineSplit.reverse();

    for (const argsLine of newlineSplit) {
      let currentWord = '';
      for (let i = argsLine.length - 1; i >= 0; i--) {
        const isCurrentWordComplete = whitespaceRegex.test(argsLine[i]);
        const isLastChar = i === 0;

        if (!isCurrentWordComplete || isLastChar) {
          currentWord = argsLine[i] + currentWord;
          if (!isLastChar) continue;
        }

        if (currentWord.length > 0 && !this.ILLEGAL_ARGS.some(illegalArg => currentWord.startsWith(illegalArg))) {
          results.push(currentWord);
        }

        currentWord = '';
      }
    }

    results.reverse();

    return results;
  }

  public static sanitizeFlags(argsStr: string): string[] {
    const results: string[] = [];
    const parameterRegex = /^-{2}([a-zA-z0-9]+-?)*$/;
    const spaceSplit = argsStr.split(/\s/).map(arg => arg.trim());

    for (const parameter of spaceSplit) {
      const isWellFormed = parameterRegex.test(parameter) && !this.DEFAULT_CHROME_FLAGS.some(illegalFlag => parameter.startsWith(illegalFlag)) && parameter.length > 0;
      if (isWellFormed) {
        results.push(parameter);
      }
    }

    this.DEFAULT_CHROME_FLAGS.forEach(defaultFlag => {
      results.push(defaultFlag);
    });

    return results.reverse();
  }
}

export class ReportFilenameSanitizer {
  private static readonly illegalRegex = /[\/\?<>\\:\*\|"]/g;
  private static readonly controlRegex = /[\x00-\x1f\x80-\x9f]/g;
  private static readonly reservedRegex = /^\.+$/;
  private static readonly windowsReservedRegex = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i;
  private static readonly windowsTrailingRegex = /[\. ]+$/;

  public static makeFilenameFromUrl(urlStr: string) {
    const urlObj = url.parse(urlStr);
    if (urlObj && urlObj.hostname) return this.replaceIllegalFileCharacters(urlObj.hostname);

    throw new Error(`Could not parse target URL ${urlStr}`);
  }

  private static replaceIllegalFileCharacters(input, replacement = '-') {
    const sanitized = input
      .toLowerCase()
      .replace(this.illegalRegex, replacement)
      .replace(this.controlRegex, replacement)
      .replace(this.reservedRegex, replacement)
      .replace(this.windowsReservedRegex, replacement)
      .replace(this.windowsTrailingRegex, replacement);

    return sanitized.length > 100 ? sanitized.substring(0, 100) : sanitized;
  }
}

export class LighthouseTask {
  private static readonly TASK_TEMP_FOLDER = '__lighthouse';
  private targetUrl: string;
  private tempDirectory: string;
  private workingDirectory: string;
  private tabName: string;
  private baseReportName: string;
  private htmlReportPath: string;
  private jsonReportPath: string;
  private jsonMetaPath: string;
  private cliArgs: string[];
  private auditAssertionsStr: string;

  private nodeExecPath: string;
  private npmExecPath: string;
  private lighthouseCommand: ToolRunner;

  private jsonReport: object;

  public async run() {
    try {
      this.ensureNodeAndNpmToolsAreAvailable();
      this.ensureTemporaryDirectoryExists();
      this.defineLighthouseTargetUrl();
      this.defineWorkingDirectory();
      this.defineTabName();
      this.defineOutputReportPaths();
      this.defineLighthouseCliArgs();
      this.defineAuditAssertions();
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

  private ensureTemporaryDirectoryExists() {
    const agentTempDirectory = taskLibrary.getVariable('agent.tempDirectory');
    this.tempDirectory = path.join(agentTempDirectory, LighthouseTask.TASK_TEMP_FOLDER);

    taskLibrary.mkdirP(this.tempDirectory);
    console.log(`Temporary directory: ${this.tempDirectory}`);
  }

  private defineLighthouseTargetUrl() {
    this.targetUrl = taskLibrary.getInput('url', true).trim();
    if (this.targetUrl.length === 0) {
      throw new Error('Target URL cannot be empty');
    }

    console.log(`Lighthouse target URL: ${this.targetUrl}`);
  }

  private defineWorkingDirectory() {
    const sourceDirectory = taskLibrary.getVariable('build.sourceDirectory') || taskLibrary.getVariable('build.sourcesDirectory');
    this.workingDirectory = taskLibrary.getInput('cwd', false) || sourceDirectory;
    if (!this.workingDirectory) {
      throw new Error('Working directory is not defined');
    }

    this.workingDirectory = this.workingDirectory.trim();
    console.log(`Working directory: ${this.workingDirectory}`);
  }

  private defineTabName() {
    const userDefinedTabName = (taskLibrary.getInput('tabName', false) || '').trim();
    if (userDefinedTabName.length > 0) {
      this.tabName = userDefinedTabName;
    } else {
      const parsedTargetUrl = url.parse(this.targetUrl);
      if (!parsedTargetUrl || !parsedTargetUrl.hostname) {
        throw new Error(`Could not parse target URL ${this.targetUrl} to extract tab name`);
      }
      this.tabName = parsedTargetUrl.hostname;
    }
  }

  private defineOutputReportPaths() {
    const urlAsFilename = ReportFilenameSanitizer.makeFilenameFromUrl(this.targetUrl);
    const randomNumber = Math.trunc(Math.random() * (99999 - 10000) + 10000);

    this.baseReportName = `${urlAsFilename}-${randomNumber}`;
    this.htmlReportPath = path.join(this.tempDirectory, `${this.baseReportName}.report.html`);
    this.jsonReportPath = path.join(this.tempDirectory, `${this.baseReportName}.report.json`);
    this.jsonMetaPath = path.join(this.tempDirectory, `${this.baseReportName}.meta.json`);

    console.log(`Lighthouse HTML report will be saved at: ${this.htmlReportPath}`);
    console.log(`Lighthouse JSON report will be saved at: ${this.jsonReportPath}`);
  }

  private defineLighthouseCliArgs() {
    const argsStr = taskLibrary.getInput('args', false) || '';
    const args = LighthouseCliArgumentSanitizer.sanitize(argsStr);
    const chromeFlagsStr = taskLibrary.getInput('chromeFlags', false) || '';
    const chromeFlags = LighthouseCliArgumentSanitizer.sanitizeFlags(chromeFlagsStr);

    args.push('--output=html');
    args.push('--output=json');
    args.push(`--output-path=${path.join(this.tempDirectory, this.baseReportName)}`);
    args.push(`--chrome-flags=${chromeFlags.join(' ')}`);

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
      this.lighthouseCommand.line(args.join(' '));
      return;
    }

    execPath = this.getGloballyInstalledLighthouseExecPath();
    if (execPath) {
      console.log(`Globally installed Lighthouse found at ${execPath}`);
      this.lighthouseCommand = taskLibrary.tool(execPath);
      this.lighthouseCommand.line(args.join(' '));
      return;
    }

    execPath = await this.locallyInstallAndGetLighthouseExecPath();
    if (execPath) {
      console.log(`Locally installed Lighthouse found at ${execPath}`);
      args.unshift(execPath);
      this.lighthouseCommand = taskLibrary.tool(this.nodeExecPath);
      this.lighthouseCommand.line(args.join(' '));
      return;
    }

    throw new Error('npm package "lighthouse" is not installed globally or locally');
  }

  private defineAuditAssertions() {
    this.auditAssertionsStr = taskLibrary.getInput('assertions', false) || '';
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
    const reportFileName = path.basename(this.htmlReportPath);
    const metaFileName = path.basename(this.jsonMetaPath);

    const metaContents = {
      tabName: this.tabName,
      reportFileName: reportFileName,
      metaFileName: metaFileName
    };

    fs.writeFileSync(this.jsonMetaPath, JSON.stringify(metaContents));

    console.log('Adding the JSON meta result as attachment of this build / release');
    taskLibrary.addAttachment('lighthouse_meta_result', metaFileName, this.jsonMetaPath);

    console.log('Adding the HTML report as attachment of this build / release');
    taskLibrary.addAttachment('lighthouse_html_result', reportFileName, this.htmlReportPath);

    console.log('Uploading the HTML report so it can be downloaded from all logs');
    taskLibrary.uploadFile(this.htmlReportPath);

    console.log('Uploading the JSON report so it can be downloaded from all logs');
    taskLibrary.uploadFile(this.jsonReportPath);
  }

  private readJsonReport() {
    const jsonStr = fs.readFileSync(this.jsonReportPath, 'utf8');
    this.jsonReport = JSON.parse(jsonStr);
  }

  private processCriticalAudits() {
    AuditEvaluator.evaluate(this.jsonReport, this.auditAssertionsStr);
  }
}
