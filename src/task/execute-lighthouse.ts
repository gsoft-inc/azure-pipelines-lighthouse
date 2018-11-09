/// <reference path="typings/lhr-lite.d.ts"/>

import path = require('path');
import fs = require('fs');

import taskLibrary = require('azure-pipelines-task-lib/task');
import toolRunner = require('azure-pipelines-task-lib/toolrunner');

export class LighthouseTask {
    private static readonly BaseReportName = "lighthouseresult";

    private url: string;
    private workingDirectory: string;
    private htmlReportPath: string;
    private jsonReportPath: string;
    private cliArgs: string[];

    private command: toolRunner.ToolRunner;

    private jsonReport: LH.ResultLite;

    public async run() {
        try {
            this.defineUrl();
            this.defineWorkingDirectory();
            this.defineOutputReportPaths();
            this.defineCliArgs();
            this.defineLighthouseCommand();

            await this.executeLighthouse();

            this.addLighthouseHtmlAttachment();

            this.readJsonReport();
            this.processCriticalAudits();
        } catch (err) {
            taskLibrary.setResult(taskLibrary.TaskResult.Failed, err.message);
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
        // do something with this.jsonReport
    }
}

new LighthouseTask().run();