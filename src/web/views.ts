export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderPage(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — ScoutBot</title>
<link rel="icon" href="/favicon.ico">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&family=Roboto+Slab:wght@600;700&display=swap" rel="stylesheet">
<style>
  :root {
    --navy: #003f87;
    --navy-dark: #00274f;
    --nav-blue: #005696;
    --gold: #e6ca45;
    --gold-dark: #c9a93a;
    --bg: #f4f6f8;
    --card: #ffffff;
    --border: #dde3e9;
    --text: #1c2530;
    --muted: #667085;
  }
  * { box-sizing: border-box; }
  body {
    font-family: "Roboto", system-ui, sans-serif;
    background: var(--bg);
    color: var(--text);
    margin: 0;
    padding-bottom: 3rem;
  }
  a { color: var(--nav-blue); }
  .site-header {
    background: var(--navy);
    color: #fff;
    padding: 0.9rem 1.5rem;
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .site-header img { height: 70px; display: block; }
  .site-header .wordmark {
    font-family: "Roboto Slab", serif;
    font-weight: 700;
    font-size: 1.3rem;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #fff;
    text-decoration: none;
  }
  nav.portal-nav {
    background: var(--nav-blue);
    padding: 0.5rem 1.5rem;
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  nav.portal-nav a {
    color: #fff;
    text-decoration: none;
    padding: 0.4rem 1rem;
    border-radius: 999px;
    font-weight: 500;
    font-size: 0.92rem;
  }
  nav.portal-nav a:hover { background: rgba(255, 255, 255, 0.15); }
  main {
    max-width: 960px;
    margin: 2rem auto;
    padding: 0 1.5rem;
  }
  h1, h2, h3 {
    font-family: "Roboto Slab", serif;
    color: var(--navy);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }
  h1 { font-size: 1.7rem; border-bottom: 3px solid var(--gold); padding-bottom: 0.5rem; margin-bottom: 1.25rem; }
  h2 { font-size: 1.25rem; margin-top: 2rem; }
  h3 { font-size: 1.05rem; margin-bottom: 0.3rem; }
  .card {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1.25rem;
    box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04);
  }
  table { border-collapse: collapse; width: 100%; margin: 0.75rem 0; }
  th, td { text-align: left; padding: 0.5rem 0.7rem; border-bottom: 1px solid var(--border); font-size: 0.94rem; }
  th { background: var(--navy); color: #fff; font-weight: 500; text-transform: uppercase; font-size: 0.78rem; letter-spacing: 0.04em; }
  tr:last-child td { border-bottom: none; }
  .btn {
    display: inline-block;
    background: var(--navy);
    color: #fff;
    text-decoration: none;
    padding: 0.6rem 1.4rem;
    border-radius: 999px;
    font-weight: 500;
  }
  .btn:hover { background: var(--nav-blue); }
  .muted { color: var(--muted); font-size: 0.9em; }
  .cancelled { color: #999; text-decoration: line-through; }
  .status-ok { color: #1a7f37; font-weight: 600; }
  .status-bad { color: #c0392b; font-weight: 600; }
  pre {
    white-space: pre-wrap;
    font-family: ui-monospace, "Cascadia Code", Consolas, monospace;
    font-size: 0.85rem;
    background: var(--bg);
    padding: 0.75rem;
    border-radius: 6px;
    overflow-x: auto;
    margin: 0.5rem 0 0;
  }
</style>
</head>
<body>
<header class="site-header">
  <img src="/logo.png" alt="" onerror="this.style.display='none'">
  <a class="wordmark" href="/">ScoutBot</a>
</header>
${body}
</body>
</html>`;
}

export function renderNav(user?: { displayName: string; isLeader: boolean; isOwner: boolean }): string {
  if (!user) return "";
  const links = ['<a href="/me">My Scouts</a>'];
  if (user.isLeader) links.push('<a href="/roster">Roster</a>');
  if (user.isOwner) links.push('<a href="/health">Status</a>');
  links.push(`<a href="/auth/logout">Log out (${escapeHtml(user.displayName)})</a>`);
  return `<nav class="portal-nav">${links.join("")}</nav>`;
}

export function renderMain(innerHtml: string): string {
  return `<main>${innerHtml}</main>`;
}
