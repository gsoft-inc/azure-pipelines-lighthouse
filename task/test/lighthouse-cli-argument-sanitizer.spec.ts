import 'mocha';

import assert = require('assert');
import { LighthouseCliArgumentSanitizer } from '../src/library';

describe('LighthouseCliArgumentSanitizer tests', () => {
  function assertSanitize(argsStr: string, expectedOutput: string[]) {
    const actualOutput = LighthouseCliArgumentSanitizer.sanitize(argsStr);
    assert.strictEqual(actualOutput.join(' '), expectedOutput.join(' '));
  }

  it('Empty or whitespaces', () => {
    assertSanitize('', []);
    assertSanitize('   ', []);
  });

  it('Single-lined allowed arguments only', () => {
    assertSanitize('--quiet', ['--quiet']);
    assertSanitize('  --quiet  --verbose ', ['--quiet', '--verbose']);
    assertSanitize(' --quiet  --throttling-method=devtools --verbose ', ['--quiet', '--throttling-method=devtools', '--verbose']);
  });

  it('Single-lined illegal arguments only', () => {
    assertSanitize('--view', []);
    assertSanitize('  --output=json --output-path=./report.json ', []);
    assertSanitize(' --quiet  --throttling-method=devtools --verbose ', ['--quiet', '--throttling-method=devtools', '--verbose']);
    assertSanitize(' --extra-headers "{\\"Cookie\\":\\"monster=blue\\"}" --chrome-flags="--something" --verbose ', [
      '--extra-headers "{\\"Cookie\\":\\"monster=blue\\"}"',
      '--verbose'
    ]);
  });

  it('Multi-lined allowed arguments', () => {
    assertSanitize('--quiet  \r\n --verbose ', ['--quiet', '--verbose']);
    assertSanitize('--quiet  \n --verbose ', ['--quiet', '--verbose']);
  });

  it('Multi-lined illegal arguments only', () => {
    assertSanitize('--view', []);
    assertSanitize('  --output=json \r\n --output-path=./report.json ', []);
    assertSanitize(' --quiet \n --throttling-method=devtools \r\n  --verbose ', ['--quiet', '--throttling-method=devtools', '--verbose']);
    assertSanitize(' --extra-headers "{\\"Cookie\\":\\"monster=blue\\"}" \r\n --chrome-flags="--something" \n --verbose ', [
      '--extra-headers "{\\"Cookie\\":\\"monster=blue\\"}"',
      '--verbose'
    ]);
  });

  it('Everything', () => {
    assertSanitize(
      ' --extra-headers "{\\"Cookie\\":\\"monster=blue\\"}" --chrome-flags="--something" \n --verbose   --view \r\n --output-path=./report.json --output=json ',
      ['--extra-headers "{\\"Cookie\\":\\"monster=blue\\"}"', '--verbose']
    );
  });
});
