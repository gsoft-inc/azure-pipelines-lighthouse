import 'mocha';

import * as path from 'path';
import * as assert from 'assert';

import {MockTestRunner} from 'azure-pipelines-task-lib/mock-test';

// Inspiration from MS built-in tasks
// https://github.com/microsoft/azure-pipelines-tasks/blob/1d86805603c6aaa07b29bf5523beaf6d9977824a/Tasks/GulpV1/Tests/L0.ts
describe('LighthouseV1 suite', function () {
  // The timeout is required because azure-pipelines-task-lib actually downloads Node.js and it takes some time
  // https://github.com/microsoft/azure-pipelines-task-lib/blob/149de35abb4ee930cf512c3d88d9178f277fb3fe/node/mock-test.ts#L227
  this.timeout('20s');

  const testNames = [
    'local-lighthouse-test',
    'global-lighthouse-test'
  ];

  for (const testName of testNames) {
    it(testName, done => {
      const testPath = path.join(__dirname, testName + '.js');
      const taskJsonPath = path.join(__dirname, '..', '..', 'src', 'task.json');
      const tr = new MockTestRunner(testPath, taskJsonPath);

      // As of today (2023-03-12), azure-pipelines-task-lib testing framework doesn't support Node 18
      // https://github.com/microsoft/azure-pipelines-task-lib/blob/149de35abb4ee930cf512c3d88d9178f277fb3fe/node/mock-test.ts#L156
      tr.run(16);

      assert(tr.invokedToolCount === 1, 'Should have only run lighthouse');
      assert(tr.succeeded, 'Task should have succeeded, stdout: ' + tr.stdout);

      done();
    });
  }
});
