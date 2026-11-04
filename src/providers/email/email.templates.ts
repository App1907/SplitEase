import { type EmailMessage } from './email.provider';

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

function layout(title: string, lines: string[]): string {
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#222">
<h2 style="color:#1cc29f">SplitEase</h2><h3>${escapeHtml(title)}</h3>
${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('\n')}
<p style="color:#888;font-size:12px">You are receiving this because you are a member of this group.</p>
</body></html>`;
}

export function buildEmail(to: string, subject: string, lines: string[]): EmailMessage {
  return { to, subject, text: lines.join('\n'), html: layout(subject, lines) };
}
