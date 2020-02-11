'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
require('mocha');
const assert = require('assert');
const task_1 = require('../src/task');
describe('AuditEvaluator', () => {
  function assertInvalidArguments(report, auditRulesStr) {
    assert.strictEqual(task_1.AuditEvaluator.evaluate(report, auditRulesStr), 0);
  }
  it('Should throw when empty report or audit rules', () => {
    assertInvalidArguments(null, null);
    assertInvalidArguments({}, null);
    assertInvalidArguments(null, '');
    assertInvalidArguments({}, '');
    assertInvalidArguments({ audits: null }, null);
    assertInvalidArguments({ audits: null }, '');
  });
});
