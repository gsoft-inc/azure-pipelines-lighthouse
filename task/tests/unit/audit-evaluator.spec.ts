import 'mocha';

import * as assert from 'assert';
import { AuditEvaluator } from '../../src/library';

describe('AuditEvaluator', () => {
  function assertInvalidArguments(report: object, assertionStr: string) {
    assert.strictEqual(AuditEvaluator.evaluate(report, assertionStr), 0);
  }

  it('Should throw when empty report or audit score assertions', () => {
    assertInvalidArguments(null, null);
    assertInvalidArguments({}, null);
    assertInvalidArguments(null, '');
    assertInvalidArguments({}, '');
    assertInvalidArguments({ audits: null }, null);
    assertInvalidArguments({ audits: null }, '');
  });
});
