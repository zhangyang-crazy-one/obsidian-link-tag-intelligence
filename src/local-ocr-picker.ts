export interface LocalOcrFileSelection {
  absolutePath: string;
  fileName: string;
  isPdf: boolean;
}

export interface HtmlFilePickerOptions {
  cancelDelayMs?: number;
  timeoutMs?: number;
  doc?: Document;
  win?: Window;
}

export function pickLocalOcrFileWithHtmlInput(
  options: HtmlFilePickerOptions = {},
): Promise<LocalOcrFileSelection | null> {
  const doc = options.doc ?? document;
  const win = options.win ?? window;
  const cancelDelayMs = options.cancelDelayMs ?? 250;
  const timeoutMs = options.timeoutMs ?? 60_000;

  return new Promise((resolve) => {
    const fileInput = doc.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "image/*,application/pdf";
    fileInput.style.display = "none";
    doc.body.appendChild(fileInput);

    let settled = false;
    let cancelTimer: ReturnType<typeof setTimeout> | null = null;
    let timeoutTimer: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (cancelTimer) clearTimeout(cancelTimer);
      if (timeoutTimer) clearTimeout(timeoutTimer);
      win.removeEventListener("focus", onFocus);
      if (fileInput.parentNode) {
        fileInput.parentNode.removeChild(fileInput);
      }
    };

    const settle = (selection: LocalOcrFileSelection | null) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(selection);
    };

    const resolveCurrentFile = () => {
      const file = fileInput.files?.[0];
      if (!file) {
        settle(null);
        return;
      }
      const pathVal = (file as File & { path?: string }).path;
      if (!pathVal) {
        settle(null);
        return;
      }
      settle({
        absolutePath: pathVal,
        fileName: file.name,
        isPdf: file.name.toLowerCase().endsWith(".pdf"),
      });
    };

    const onFocus = () => {
      cancelTimer = setTimeout(() => {
        if (!fileInput.files || fileInput.files.length === 0) {
          settle(null);
        }
      }, cancelDelayMs);
    };

    fileInput.addEventListener("change", resolveCurrentFile);
    win.addEventListener("focus", onFocus);
    timeoutTimer = setTimeout(() => settle(null), timeoutMs);
    fileInput.click();
  });
}
