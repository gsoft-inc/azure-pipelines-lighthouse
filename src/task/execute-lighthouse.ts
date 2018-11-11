/// <reference path="typings/lhr-lite.d.ts"/>

import path = require('path');
import fs = require('fs');
import os = require('os');

import taskLibrary = require('azure-pipelines-task-lib/task');
import toolRunner = require('azure-pipelines-task-lib/toolrunner');

export class AuditEvaluator {
    private static readonly AuditRuleRegex = /^([a-z-]+)\s*([=>])\s*([0-9]+(\.[0-9]+)?)$/gi;

    public static evaluate(report, auditRulesStr) {
        report = report || {};
        auditRulesStr = auditRulesStr || '';

        let auditRuleStrArray = auditRulesStr
            .split(/\r?\n/)
            .map(rule => rule.trim())
            .filter(rule => rule.length > 0);

        let errors = [];

        for (let auditRuleStr of auditRuleStrArray) {
            try {
                this.evaluateAuditRuleStr(report, auditRuleStr);
            } catch (err) {
                errors.push(err.message);
            }
        }

        if (errors.length)
            throw new Error(errors.join(os.EOL));
    }

    private static evaluateAuditRuleStr(report, auditRuleStr) {
        let rule = AuditEvaluator.extractAuditRule(auditRuleStr);
        let audit = AuditEvaluator.findAudit(report.audits, rule.name);
        if (audit === null)
            return;

        let displayValue = audit.displayValue || '';
        if (displayValue.length > 0)
            displayValue = `, details: ${displayValue}`;

        if (rule.operator === '=') {
            if (audit !== rule.score)
                throw new Error(`Expected ${rule.score} for audit "${rule.name}" score but got ${audit.score}${displayValue}`);
        }
        else if (rule.operator === '>') {
            if (audit < rule.score)
                throw new Error(`Expected at least ${rule.score} for audit "${rule.name}" score but got ${audit.score}${displayValue}`);
        }
    }

    private static extractAuditRule(auditRuleStr: string) {
        let matches = AuditEvaluator.AuditRuleRegex.exec(auditRuleStr);
        if (!matches)
            throw new Error(`Audit rule "${auditRuleStr}" is malformed`);

        return {
            name: matches[1],
            operator: matches[2],
            score: parseFloat(matches[3])
        };
    }

    private static findAudit(audits: LH.ResultLite.Audit[], name: string) {
        let audit = audits[name];
        if (!audit)
            throw new Error(`Could not find audit "${name}"`);

        // Do not evaluate informative or not-applicable audits
        if (typeof audit.score === 'undefined' || audit.score === null)
            return null;

        if (typeof audit.score === 'string')
            audit.score = parseFloat(audit.score);

        return audit;
    }
}

export class LighthouseTask {
    private static readonly BaseReportName = "lighthouseresult";

    private url: string;
    private workingDirectory: string;
    private htmlReportPath: string;
    private jsonReportPath: string;
    private cliArgs: string[];
    private evaluateAuditRules: boolean;
    private auditRulesStr: string;

    private command: toolRunner.ToolRunner;

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
            if (fs.existsSync(this.htmlReportPath))
                this.addLighthouseHtmlAttachment();
        }
    }

    private defineUrl() {
        this.url = taskLibrary.getInput('url', true);
    }

    private defineWorkingDirectory() {
        let sourceDirectory = taskLibrary.getVariable('build.sourceDirectory') || taskLibrary.getVariable('build.sourcesDirectory');
        this.workingDirectory = taskLibrary.getInput('cwd', false) || sourceDirectory;
        if (!this.workingDirectory)
            throw new Error('Working directory is not defined');
    }

    private defineOutputReportPaths() {
        this.htmlReportPath = path.join(this.workingDirectory, LighthouseTask.BaseReportName + '.report.html');
        this.jsonReportPath = path.join(this.workingDirectory, LighthouseTask.BaseReportName + '.report.json');
    }

    private defineCliArgs() {
        let argsStr = taskLibrary.getInput('args', false) || '';

        let illegalArgs = [
            '--output=',
            '--output-path=',
            '--chrome-flags=',
        ];

        let args = argsStr
            .split(/\r?\n/)
            .map(arg => arg.trim())
            .filter(arg => arg.length > 0)
            .filter(arg => !illegalArgs.some(illegalArg => arg.startsWith(illegalArg)));

        args.push('--output=html');
        args.push('--output=json');
        args.push('--output-path=' + path.join(this.workingDirectory, LighthouseTask.BaseReportName));
        args.push('--chrome-flags="--headless"');

        args.unshift(this.url);

        this.cliArgs = args;
    }

    private defineLighthouseCommand() {
        let execPath: string;
        let args = this.cliArgs;

        execPath = this.getLocalLighthouseExecPath();
        if (execPath) {
            args.unshift(execPath);
            this.command = taskLibrary.tool(taskLibrary.which('node', true));
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
        this.evaluateAuditRules = taskLibrary.getBoolInput('evaluateAuditRules', false);
        this.auditRulesStr = taskLibrary.getInput('auditRulesStr', false) || '';
    }

    private getGlobalLighthouseExecPath(): string {
        let execPath = taskLibrary.which('lighthouse', false);
        return fs.existsSync(execPath) ? execPath : '';
    }

    private getLocalLighthouseExecPath(): string {
        let nodeModulesPath = path.join(this.workingDirectory, 'node_modules');
        let execPath = path.join(nodeModulesPath, 'lighthouse', 'lighthouse-cli', 'index.js');
        return fs.existsSync(execPath) ? execPath : '';
    }

    private async executeLighthouse() {
        let retCode = await this.command.exec();

        if (!fs.existsSync(this.jsonReportPath))
            throw new Error('Lighthouse did not generate a JSON output. Error code: ' + retCode);

        if (!fs.existsSync(this.htmlReportPath))
            throw new Error('Lighthouse did not generate a HTML output. Error code: ' + retCode);
    }

    private addLighthouseHtmlAttachment() {
        taskLibrary.command('task.addattachment', {
            type: 'lighthouse_html_result',
            name: 'lighthouseresult',
        }, this.htmlReportPath);
    }

    private readJsonReport() {
        let jsonStr = fs.readFileSync(this.jsonReportPath, 'utf8');
        this.jsonReport = JSON.parse(jsonStr);
    }

    private processCriticalAudits() {
        if (this.evaluateAuditRules) {
            AuditEvaluator.evaluate(
                this.jsonReport, this.auditRulesStr
            );
        }
    }
}

new LighthouseTask().run();