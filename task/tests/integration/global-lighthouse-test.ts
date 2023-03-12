import * as path from "path";
import * as process from "process";
import * as fs from "fs";
import * as os from "os";
import * as assert from 'assert';

import {TaskMockRunner} from "azure-pipelines-task-lib/mock-run";

const taskPath = path.join(__dirname, '..', '..', 'src', 'task.js');
const tmr = new TaskMockRunner(taskPath);

const agentTempDir = os.tmpdir();
const buildSourceDir = os.tmpdir();
const nodeExePath = process.execPath;
const npmExePath = path.resolve(path.dirname(nodeExePath), process.platform === 'win32' ? 'npm.bat' : 'npm');

const inputUrl = 'https://www.google.com/';
const lhTempDir = path.join(agentTempDir, '__lighthouse');
const lhGlobalPost10ExePath = process.platform === 'win32' ? path.join('C:', 'nodejs', 'lighthouse.ps1') : path.join('/', 'nodejs', 'lighthouse');
const lhGlobalExecCmd = `${lhGlobalPost10ExePath} ${inputUrl} --quiet --output=html --output=json --output-path=${path.join(lhTempDir, 'www.google.com-12345')} --chrome-flags=--headless`;
const htmlReportPath = path.join(lhTempDir, 'www.google.com-12345.report.html');
const jsonReportPath = path.join(lhTempDir, 'www.google.com-12345.report.json');
const jsonMetaPath = path.join(lhTempDir, 'www.google.com-12345.meta.json');

tmr.setAnswers({
  exist: {
    [lhGlobalPost10ExePath]: true,
    [htmlReportPath]: true,
    [jsonReportPath]: true,
  },
  which: {
    ['node']: nodeExePath,
    ['npm']: npmExePath,
    ['lighthouse']: lhGlobalPost10ExePath
  },
  checkPath: {
    [nodeExePath]: true,
    [npmExePath]: true,
  },
  exec: {
    [lhGlobalExecCmd]: {
      code: 0,
      stdout: ''
    }
  }
});

tmr.setInput('url', inputUrl);
tmr.setInput('args', '--quiet');

const fsClone = Object.assign({}, fs);
Object.assign(fsClone, {
  writeFileSync(path: string, data: string) {
    assert.strictEqual(path, jsonMetaPath);
  },
  readFileSync(path: string) {
    assert.strictEqual(path, jsonReportPath);
    return '{}';
  }
});

tmr.registerMock('fs', fsClone);

process.env['AGENT_TEMPDIRECTORY'] = agentTempDir;
process.env['BUILD_SOURCEDIRECTORY'] = buildSourceDir;
process.env['LIGHTHOUSE_REPORT_SUFFIX'] = '12345'

tmr.run();
