import 'mocha';

import * as assert from 'assert';
import { ReportFilenameSanitizer } from '../src/library';

describe('ReportFilenameSanitizer', () => {
  function assertSanitized(urlStr: string, expectedOutput: string) {
    assert.strictEqual(ReportFilenameSanitizer.makeFilenameFromUrl(urlStr), expectedOutput);
  }

  function assertThrows(urlStr: string) {
    assert.throws(() => ReportFilenameSanitizer.makeFilenameFromUrl(urlStr));
  }

  it('throws on invalid URLs', () => {
    assertThrows('');
    assertThrows('a');
    assertThrows('foo.com');
    assertThrows('not an actual URL');
  });

  it('sanitize valid URLs', () => {
    assertSanitized('https://foo.com/', 'foo.com');
    assertSanitized('https://fooBAR.com/', 'foobar.com');
    assertSanitized('http://usr:pwd@fooBAR.com:1234/a/b/c.aspx?x=1&y=2&z=3#someanchor', 'foobar.com');
  });
});
