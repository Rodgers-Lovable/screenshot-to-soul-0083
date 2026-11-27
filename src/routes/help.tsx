import { createFileRoute, Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import manual from "../../docs/user-manual/README.md?raw";

// The manual in docs/ is the single source; its images are bundled from there too.
const IMAGES = import.meta.glob<string>("../../docs/user-manual/images/*.png", {
  eager: true,
  query: "?url",
  import: "default",
});
const imageUrl = (src: string) =>
  IMAGES[`../../docs/user-manual/${src.replace(/^\.\//, "")}`] ?? src;

const MANUAL_VERSION = /\|\s*Manual version\s*\|\s*([^|\s]+)\s*\|/.exec(manual)?.[1] ?? "";
const PDF_NAME = `Study-Budget-Tracker-User-Manual-v${MANUAL_VERSION}.pdf`;

/** GitHub-style heading ids, so the manual's contents links work here too. */
function slug(children: ReactNode) {
  const text = Array.isArray(children) ? children.join("") : String(children ?? "");
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s/g, "-");
}

const components: Components = {
  h2: ({ children }) => <h2 id={slug(children)}>{children}</h2>,
  h3: ({ children }) => <h3 id={slug(children)}>{children}</h3>,
  img: ({ src, alt }) => <img src={imageUrl(String(src ?? ""))} alt={alt ?? ""} loading="lazy" />,
  a: ({ href, children }) => (
    <a href={href} {...(href?.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
      {children}
    </a>
  ),
};

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "User manual · Project Budget Tracker" },
      { name: "description", content: "How to use the Study Budget Tracker, step by step." },
      { property: "og:title", content: "User manual · Project Budget Tracker" },
      {
        property: "og:description",
        content: "How to use the Study Budget Tracker, step by step.",
      },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-3 backdrop-blur sm:px-6 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/">
            <ArrowLeft className="h-4 w-4" />
            Back to the app
          </Link>
        </Button>
        <span className="ml-auto hidden text-sm text-muted-foreground sm:inline">
          Manual version {MANUAL_VERSION}
        </span>
        <Button size="sm" asChild>
          <a href="/user-manual.pdf" download={PDF_NAME}>
            <Download className="h-4 w-4" />
            Download PDF
          </a>
        </Button>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <article className="manual">
          <Markdown remarkPlugins={[remarkGfm]} components={components}>
            {manual}
          </Markdown>
        </article>
      </main>
    </div>
  );
}
