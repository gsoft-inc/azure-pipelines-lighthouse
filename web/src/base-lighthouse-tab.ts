import Controls = require("VSS/Controls");

export abstract class BaseLighthouseTab extends Controls.BaseControl {
  protected static readonly HUB_NAME = "build";
  protected static readonly ATTACHMENT_TYPE = "lighthouse_html_result";
  protected static readonly ATTACHMENT_NAME = "lighthouseresult";

  protected static arrayBufferToString(buffer: ArrayBuffer): string {
    const enc = new TextDecoder("utf-8");
    const arr = new Uint8Array(buffer);
    return enc.decode(arr);
  }

  protected constructor() {
    super();
  }

  protected setFrameHtmlContent(htmlStr: string) {
    const container = this.getElement().get(0);
    const frame = container.querySelector("#lighthouse-result") as HTMLIFrameElement;
    const waiting = container.querySelector("#waiting") as HTMLElement;

    if (htmlStr && frame && waiting) {
      frame.srcdoc = htmlStr;
      waiting.style.display = "none";
      frame.style.display = "block";
    }
  }

  protected setWaitingText(htmlStr: string) {
    const container = this.getElement().get(0);
    container.querySelector("#waiting p").innerHTML = htmlStr;
  }
}
