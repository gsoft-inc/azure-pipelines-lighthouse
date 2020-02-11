'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
require('mocha');
const assert = require('assert');
const task_1 = require('../src/task');
describe('AuditRule tests', () => {
  function assertRuleShouldThrow(auditRuleStr) {
    assert.throws(() => task_1.AuditRule.fromString(auditRuleStr));
  }
  function assertRule(auditRuleStr, expectedAuditName, expectedOperator, expectedScore) {
    const rule = task_1.AuditRule.fromString(auditRuleStr);
    assert.strictEqual(rule.auditName, expectedAuditName);
    assert.strictEqual(rule.operator, expectedOperator);
    assert.strictEqual(rule.score, expectedScore);
  }
  it('Null or empty rule should throw', () => {
    assertRuleShouldThrow(null);
    assertRuleShouldThrow('');
    assertRuleShouldThrow(' ');
  });
  it('Malformed rule should throw', () => {
    assertRuleShouldThrow('a');
    assertRuleShouldThrow('>');
    assertRuleShouldThrow('0');
    assertRuleShouldThrow('a >');
    assertRuleShouldThrow('> 0');
    assertRuleShouldThrow(' a > 0 ');
  });
  it('Valid integer rules', () => {
    assertRule('a = 0', 'a', '=', 0);
    assertRule('a > 0', 'a', '>', 0);
  });
  it('Valid float rules', () => {
    assertRule('a = 0.5', 'a', '=', 0.5);
    assertRule('a > 0.5', 'a', '>', 0.5);
    assertRule('a > 0.33', 'a', '>', 0.33);
    assertRule('a > 0.1234', 'a', '>', 0.1234);
    assertRule('a = 0.1234', 'a', '=', 0.1234);
  });
});
