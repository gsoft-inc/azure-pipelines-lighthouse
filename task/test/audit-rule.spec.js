"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const assert = require("assert");
const audit_rule_1 = require("../../src/task/audit-rule");
describe("AuditRule tests", () => {
    function assertRuleShouldThrow(auditRuleStr) {
        assert.throws(() => audit_rule_1.AuditRule.fromString(auditRuleStr));
    }
    function assertRule(auditRuleStr, expectedAuditName, expectedOperator, expectedScore) {
        const rule = audit_rule_1.AuditRule.fromString(auditRuleStr);
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
