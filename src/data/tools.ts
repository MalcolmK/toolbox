export type ToolboxEntry =
  | {
      kind: "tool";
      id: string;
      name: string;
      icon: "book";
      href: string;
    }
  | {
      kind: "placeholder";
      id: string;
      name: string;
      icon: "plus";
    };

export const toolboxEntries = [
  {
    kind: "tool",
    id: "jw-library-merger",
    name: "JW Library Merger",
    icon: "book",
    href: "#library-merger",
  },
  {
    kind: "placeholder",
    id: "new-tool-one",
    name: "New Tool",
    icon: "plus",
  },
  {
    kind: "placeholder",
    id: "new-tool-two",
    name: "New Tool",
    icon: "plus",
  },
] as const satisfies readonly ToolboxEntry[];
