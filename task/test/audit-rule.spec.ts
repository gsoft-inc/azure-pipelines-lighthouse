import "mocha";

import assert = require("assert");
import { AuditRule } from "../src/audit-rule";

describe("AuditRule tests", () => {
  function assertRuleShouldThrow(auditRuleStr: string) {
    assert.throws(() => AuditRule.fromString(auditRuleStr));
  }

  function assertRule(auditRuleStr: string, expectedAuditName: string, expectedOperator: string, expectedScore: number) {
    const rule = AuditRule.fromString(auditRuleStr);

    assert.equal(rule.auditName, expectedAuditName);
    assert.equal(rule.operator, expectedOperator);
    assert.equal(rule.score, expectedScore);
  }

  it("Null or empty rule should throw", () => {
    assertRuleShouldThrow(null);
    assertRuleShouldThrow("");
    assertRuleShouldThrow(" ");
  });

  it("Malformed rule should throw", () => {
    assertRuleShouldThrow("a");
    assertRuleShouldThrow(">");
    assertRuleShouldThrow("0");
    assertRuleShouldThrow("a >");
    assertRuleShouldThrow("> 0");
    assertRuleShouldThrow(" a > 0 ");
  });

  it("Valid integer rules", () => {
    assertRule("a = 0", "a", "=", 0);
    assertRule("a > 0", "a", ">", 0);
  });

  it("Valid float rules", () => {
    assertRule("a = 0.5", "a", "=", 0.5);
    assertRule("a > 0.5", "a", ">", 0.5);
    assertRule("a > 0.33", "a", ">", 0.33);
    assertRule("a > 0.1234", "a", ">", 0.1234);
    assertRule("a = 0.1234", "a", "=", 0.1234);
  });
});
