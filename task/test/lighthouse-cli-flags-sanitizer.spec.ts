import 'mocha';

import assert = require('assert');
import { LighthouseCliArgumentSanitizer } from '../src/library';

describe('LighthouseCliFlagSanitizer tests', () => {
  function assertSanitize(argsStr: string, expectedOutput: string[]) {
    const actualOutput = LighthouseCliArgumentSanitizer.sanitizeFlags(argsStr);
    assert.strictEqual(actualOutput.join(' '), expectedOutput.join(' '));
  }

  it('Empty or whitespaces', () => {
    assertSanitize('', ['--headless']);
    assertSanitize('   ', ['--headless']);
  });

  it('If Set Default Flags will be used only one ', () => {
    assertSanitize('--headless', ['--headless']);
    assertSanitize('--headless --headless', ['--headless']);
  });

  it('If Set additional Flags will be used', () => {
    assertSanitize('--allow-external-pages --allow-pre-commit-input', ['--headless', '--allow-pre-commit-input', '--allow-external-pages']);
    assertSanitize('   --allow-external-pages    --allow-pre-commit-input   ', ['--headless', '--allow-pre-commit-input', '--allow-external-pages']);
  });

  it('If Set bad formed Flags will be not used', () => {
    assertSanitize('--allow-external-pages ----allow-pre-commit-input -d-s-wrong', ['--headless', '--allow-external-pages']);
  });
});
