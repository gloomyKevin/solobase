import Link from "next/link";

const platformLinks = [
  { label: "关于", href: "/about" },
  { label: "提交产品", href: "/submit" },
  { label: "反馈", href: "/feedback" },
  { label: "RSS", href: "/feed.xml" },
];

const socialLinks = [
  { label: "即刻", href: "#" },
  { label: "小红书", href: "#" },
  { label: "Twitter", href: "#" },
];

export function Footer() {
  return (
    <footer className="border-t border-border/60 bg-surface-sunken">
      <div className="mx-auto max-w-[1200px] px-4 py-12 sm:px-6">
        <div className="grid gap-8 sm:grid-cols-3">
          {/* Brand */}
          <div>
            <div className="text-lg font-bold">
              <span className="text-primary">Solo</span>
              <span className="text-foreground">base</span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
              中文世界最有品味的个人产品发现平台
            </p>
          </div>

          {/* Platform links */}
          <div>
            <h4 className="text-sm font-semibold mb-3">平台</h4>
            <ul className="space-y-2">
              {platformLinks.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Social links */}
          <div>
            <h4 className="text-sm font-semibold mb-3">关注</h4>
            <ul className="space-y-2">
              {socialLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-border/60 pt-6 text-center text-xs text-muted-foreground">
          Made for makers &middot; &copy; {new Date().getFullYear()} Solobase
        </div>
      </div>
    </footer>
  );
}
