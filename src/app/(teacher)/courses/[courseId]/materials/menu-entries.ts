import { ClipboardText, Globe, UploadSimple } from "@phosphor-icons/react";

/**
 * The "+ Materials" menu's entries (D-032 mockup). Every one adds a material:
 * Canvas Pages and Files are listed automatically, so the menu only says so.
 */
export function materialsMenuEntries(base: string) {
  return [
    { href: `${base}/new?kind=web`, icon: Globe, title: "Add a web page", help: "DALAA saves a copy of the page's text" },
    { href: `${base}/new?kind=upload`, icon: UploadSimple, title: "Upload a file", help: "Kept in DALAA, not in Canvas Files" },
    { href: `${base}/new?kind=paste`, icon: ClipboardText, title: "Paste text", help: "Notes, a transcript, an excerpt" },
  ];
}
