"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("mocha");
const assert = require("assert");
const audit_evaluator_1 = require("../src/audit-evaluator");
describe("AuditEvaluator", () => {
    function assertInvalidArguments(report, auditRulesStr) {
        assert.strictEqual(audit_evaluator_1.AuditEvaluator.evaluate(report, auditRulesStr), 0);
    }
    it("Should throw when empty report or audit rules", () => {
        assertInvalidArguments(null, null);
        assertInvalidArguments({}, null);
        assertInvalidArguments(null, "");
        assertInvalidArguments({}, "");
        assertInvalidArguments({ audits: null }, null);
        assertInvalidArguments({ audits: null }, "");
    });
});
