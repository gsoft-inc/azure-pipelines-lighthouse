import "mocha";

import * as assert from "assert";
import { AuditEvaluator } from "../src/audit-evaluator";

describe("AuditEvaluator", () => {
  function assertInvalidArguments(report: object, auditRulesStr: string) {
    assert.equal(AuditEvaluator.evaluate(report, auditRulesStr), 0);
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
