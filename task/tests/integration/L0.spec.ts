import 'mocha';

import * as path from 'path';
import * as assert from 'assert';

import {MockTestRunner} from 'azure-pipelines-task-lib/mock-test';

// Inspiration from MS built-in tasks
// https://github.com/microsoft/azure-pipelines-tasks/blob/1d86805603c6aaa07b29bf5523beaf6d9977824a/Tasks/GulpV1/Tests/L0.ts
describe('LighthouseV1 suite', function () {
  this.timeout(20000);

  it('L0IntegrationTest1', done => {
    const tr = new MockTestRunner(path.join(__dirname, 'L0IntegrationTest1.js'));

    tr.run();

    assert(tr.invokedToolCount === 1, 'should have only run lighthouse');
    assert(tr.succeeded, 'task should have succeeded');

    done();
  });
});
