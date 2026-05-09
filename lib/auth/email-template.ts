// Source: RESEARCH § Code Example 5 (custom Russian email template).
// Used by Resend provider in auth.ts via { sendVerificationRequest: ... }.
// No React Email dependency needed — pure string template (simpler, fewer deps).
import type { EmailConfig } from 'next-auth/providers/email'

type Params = {
  identifier: string
  url: string
  provider: EmailConfig
  expires: Date
  token: string
  theme: { colorScheme?: 'auto' | 'dark' | 'light' }
  request: Request
}

export async function sendVerificationRequest(params: Params): Promise<void> {
  const { identifier: email, url, provider } = params
  const { host } = new URL(url)

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${(provider as unknown as { apiKey: string }).apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: provider.from,
      to: email,
      subject: 'Вход в Klassio',
      html: htmlBody({ url, host }),
      text: textBody({ url, host }),
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => '<unreadable>')
    throw new Error(`Resend send failed: ${res.status} ${errBody}`)
  }
}

function htmlBody({ url, host }: { url: string; host: string }) {
  return `<!DOCTYPE html>
<html lang="ru">
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f9fafb;padding:40px 0;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center">
      <table width="480" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border-radius:8px;padding:32px;">
        <tr><td>
          <h1 style="font-size:20px;color:#111;margin:0 0 16px;">Klassio</h1>
          <p style="color:#444;line-height:1.5;margin:0 0 24px;">
            Здравствуйте! Перейдите по ссылке ниже, чтобы войти в личный кабинет:
          </p>
          <p>
            <a href="${url}" style="background:#111;color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px;display:inline-block;">
              Войти в Klassio
            </a>
          </p>
          <p style="color:#888;font-size:13px;line-height:1.5;margin:24px 0 0;">
            Ссылка действительна 24 часа. Если вы не запрашивали вход — просто проигнорируйте это письмо.
          </p>
          <p style="color:#aaa;font-size:11px;margin:16px 0 0;">${host}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function textBody({ url, host }: { url: string; host: string }) {
  return `Klassio — вход в личный кабинет

Перейдите по ссылке: ${url}

Ссылка действительна 24 часа. Если вы не запрашивали вход — просто проигнорируйте это письмо.

${host}`
}
