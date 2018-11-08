import path = require('path');
import fs = require('fs');

import taskLibrary = require('azure-pipelines-task-lib/task');
import toolRunner = require('azure-pipelines-task-lib/toolrunner');

let url = taskLibrary.getInput('url', true);
let sourceDirectory = taskLibrary.getVariable('build.sourceDirectory') || taskLibrary.getVariable('build.sourcesDirectory');
let workingDirectory = taskLibrary.getInput('cwd', false) || sourceDirectory;
let htmlOutputPath = path.join(workingDirectory, 'lighthouseresult.html');
let argsStr = taskLibrary.getInput('args', false);

function getGlobalLighthouseExecPath(): string {
    let execPath = taskLibrary.which('lighthouse', false);
    return fs.existsSync(execPath) ? execPath : '';
}

function getLocalLighthouseExecPath(): string {
    let nodeModulesPath = path.join(workingDirectory, 'node_modules');
    let execPath = path.join(nodeModulesPath, 'lighthouse', 'lighthouse-cli', 'index.js');
    return fs.existsSync(execPath) ? execPath : '';
}

function getArgs() {
    if (!argsStr)
        argsStr = '';

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
    args.push('--output-path=' + htmlOutputPath);
    args.push('--chrome-flags="--headless"');

    args.unshift(url);

    return args;
}

function makeLighthouseCommand(): toolRunner.ToolRunner {
    let command: toolRunner.ToolRunner;
    let execPath: string;
    let args = getArgs();

    execPath = getLocalLighthouseExecPath();
    if (execPath) {
        args.unshift(execPath);
        command = taskLibrary.tool(taskLibrary.which('node', true));
        command.arg(args);
        return command;
    }

    execPath = getGlobalLighthouseExecPath();
    if (execPath) {
        command = taskLibrary.tool(execPath);
        command.arg(args);
        return command;
    }

    throw new Error('npm package "lighthouse" is not installed globally or locally');
}

async function executeLighthouse() {
    let command: toolRunner.ToolRunner = makeLighthouseCommand();
    let retCode = await command.exec();

    if (!fs.existsSync(htmlOutputPath))
        throw new Error('Lighthouse did not generate a HTML output. Error code: ' + retCode);
}

function addLighthouseHtmlAttachment() {
    taskLibrary.command('task.addattachment', {
        type: 'lighthouse_html_result',
        name: 'lighthouseresult',
    }, htmlOutputPath);
}

async function run() {
    try {
        await executeLighthouse();
        addLighthouseHtmlAttachment();
    } catch (err) {
        taskLibrary.setResult(taskLibrary.TaskResult.Failed, err.message);
    }
}

run();




