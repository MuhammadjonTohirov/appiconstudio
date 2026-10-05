/** Optional browser capability. Normal UI operation never depends on WebMCP. */
export function registerTools({ exportStatus, configureExport }) {
  const registry = document.modelContext;
  if (!registry?.registerTool) return;
  const lifecycle = new AbortController();
  const tools = [
    {
      name: "get_icon_export_status",
      title: "Read icon export status",
      description:
        "Read whether a user-selected logo is ready, the current options, and icon slot count. Does not read image data.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: exportStatus,
    },
    {
      name: "configure_icon_export",
      title: "Configure icon export",
      description:
        "Update the visible export platform, background color, and Mac corner option. Does not choose a file or start a download.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          platform: { type: "string", enum: ["all", "ios", "mac"] },
          background: { type: "string", pattern: "^#[0-9a-fA-F]{6}$" },
          roundedMac: { type: "boolean" },
        },
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: configureExport,
    },
  ];
  for (const tool of tools) {
    try {
      Promise.resolve(
        registry.registerTool(tool, { signal: lifecycle.signal }),
      ).catch((error) =>
        console.warn("Optional WebMCP registration failed.", error),
      );
    } catch (error) {
      console.warn("Optional WebMCP registration failed.", error);
    }
  }
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) lifecycle.abort();
  });
}
