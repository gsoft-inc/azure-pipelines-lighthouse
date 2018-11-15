import * as os from "os";

import { AuditRule } from "./audit-rule";

export class AuditEvaluator {
  public static evaluate(report, auditRulesStr: string) {
    const auditRuleStrArray = auditRulesStr
      .split(/\r?\n/)
      .map((rule) => rule.trim())
      .filter((rule) => rule.length > 0);

    const errors = [];

    for (const auditRuleStr of auditRuleStrArray) {
      try {
        this.evaluateAuditRuleStr(report, auditRuleStr);
      } catch (err) {
        errors.push(err.message);
      }
    }

    if (errors.length) {
      throw new Error(errors.join(os.EOL));
    }
  }

  private static evaluateAuditRuleStr(report, auditRuleStr) {
    const rule = AuditRule.fromString(auditRuleStr);
    const audit = AuditEvaluator.findAudit(report.audits, rule.auditName);
    if (audit === null) {
      return;
    }

    let displayValue = audit.displayValue || "";
    if (displayValue.length > 0) {
      displayValue = `, details: ${displayValue}`;
    }

    if (rule.operator === "=") {
      if (audit.score !== rule.score) {
        throw new Error(`Expected ${rule.score} for audit "${rule.auditName}" score but got ${audit.score}${displayValue}`);
      }
    } else if (rule.operator === ">") {
      if (audit.score < rule.score) {
        throw new Error(`Expected at least ${rule.score} for audit "${rule.auditName}" score but got ${audit.score}${displayValue}`);
      }
    }
  }

  private static findAudit(audits: LH.ResultLite.Audit[], name: string) {
    const audit = audits[name];
    if (!audit) {
      throw new Error(`Could not find audit "${name}"`);
    }

    // Do not evaluate informative or not-applicable audits
    if (typeof audit.score === "undefined" || audit.score === null) {
      return null;
    }

    return audit;
  }
}
