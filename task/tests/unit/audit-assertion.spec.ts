import 'mocha';

import assert = require('assert');
import { AuditAssertion } from '../../src/library';

describe('AuditAssertion tests', () => {
  function assertParseAssertionShouldThrow(assertionStr: string) {
    assert.throws(() => AuditAssertion.fromString(assertionStr));
  }

  function assertParseAssertion(assertionStr: string, expectedAuditName: string, expectedOperator: string, expectedScore: number) {
    const assertion = AuditAssertion.fromString(assertionStr);

    assert.strictEqual(assertion.auditName, expectedAuditName);
    assert.strictEqual(assertion.operator, expectedOperator);
    assert.strictEqual(assertion.score, expectedScore);
  }

  it('Null or empty assertion should throw', () => {
    assertParseAssertionShouldThrow(null);
    assertParseAssertionShouldThrow('');
    assertParseAssertionShouldThrow(' ');
  });

  it('Malformed assertion should throw', () => {
    assertParseAssertionShouldThrow('a');
    assertParseAssertionShouldThrow('>');
    assertParseAssertionShouldThrow('<');
    assertParseAssertionShouldThrow('0');
    assertParseAssertionShouldThrow('a >');
    assertParseAssertionShouldThrow('> 0');
    assertParseAssertionShouldThrow('< 0');
  });

  it('Valid integer assertions', () => {
    assertParseAssertion('a = 0', 'a', '=', 0);
    assertParseAssertion('a > 0', 'a', '>', 0);
    assertParseAssertion('a < 0', 'a', '<', 0);
  });

  it('Valid float assertions', () => {
    assertParseAssertion('a = 0.5', 'a', '=', 0.5);
    assertParseAssertion('a > 0.5', 'a', '>', 0.5);
    assertParseAssertion('a < 0.5', 'a', '<', 0.5);
    assertParseAssertion('a > 0.33', 'a', '>', 0.33);
    assertParseAssertion('a > 0.1234', 'a', '>', 0.1234);
    assertParseAssertion('a < 0.1234', 'a', '<', 0.1234);
    assertParseAssertion('a = 0.1234', 'a', '=', 0.1234);
  });
});
