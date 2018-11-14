export default class AuditRule {
  private static readonly AUDIT_RULE_REGEX = /^([a-z-]+)\s*([=>])\s*([0-9]+(\.[0-9]+)?)$/i;

  public auditName: string;
  public operator: string;
  public score: number;

  protected constructor() {
  }

  public static fromString(auditRuleStr: string) {
    if (!auditRuleStr) {
      throw new Error(`Audit rule string is null or empty.`);
    }

    const matches = AuditRule.AUDIT_RULE_REGEX.exec(auditRuleStr);
    if (!matches) {
      throw new Error(`Audit rule "${auditRuleStr}" is malformed.`);
    }

    const rule = new AuditRule();

    rule.auditName = matches[1];
    rule.operator = matches[2];
    rule.score = Number(matches[3]);

    return rule;
  }
}
