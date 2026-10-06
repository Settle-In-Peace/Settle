import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const API_URL = (
  process.env.NEXT_PUBLIC_API_URL || "https://api.settleinpeace.com"
).replace(/\/+$/, "");

/**
 * Send a password-reset email directly via the Resend REST API.
 * fetch-based (no resend package) so it runs on Cloudflare Workers.
 * Mirrors the Prime pattern: backend first, frontend Resend fallback.
 */
async function sendResetEmailDirectly(
  to: string,
  resetUrl: string,
  firstName?: string,
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[forgot-password] RESEND_API_KEY not configured on worker");
    return false;
  }

  const greeting = firstName ? `Hi ${firstName}` : "Hello";
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #ffffff;">
      <div style="background: #1f2937; padding: 24px; text-align: center; border-radius: 12px 12px 0 0;">
        <h1 style="color: #ffffff; margin: 0; font-size: 24px;">Reset Your Password</h1>
      </div>
      <div style="padding: 32px;">
        <h2 style="color: #1f2937;">${greeting},</h2>
        <p style="color: #4b5563; line-height: 1.6;">
          We received a request to reset your Settle In Peace password. Click the
          button below to choose a new password:
        </p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="background: #2563eb; color: #ffffff; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6; word-break: break-all;">
          Or paste this link into your browser: ${resetUrl}
        </p>
        <p style="color: #6b7280; font-size: 14px; line-height: 1.6;">
          This link expires in 1 hour. If you didn't request this, you can
          safely ignore this email and your password won't be changed.
        </p>
      </div>
      <div style="border-top: 1px solid #e5e7eb; padding: 24px; text-align: center;">
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">Settle In Peace</p>
      </div>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from:
          process.env.EMAIL_FROM ||
          "Settle In Peace <onboarding@settleinpeace.com>",
        to: [to],
        subject: "Reset your password — Settle In Peace",
        html,
      }),
    });

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[forgot-password] Resend API error:", res.status, errBody);
      return false;
    }
    return true;
  } catch (err) {
    console.error("[forgot-password] Failed to send email:", err);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000);

    let response: Response;
    try {
      response = await fetch(`${API_URL}/auth/forgot-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Internal key lets the API return reset internals so this route can
          // send a fallback email when the backend mailer fails. Direct callers
          // never receive those fields.
          ...(process.env.INTERNAL_API_KEY
            ? { "x-internal-key": process.env.INTERNAL_API_KEY }
            : {}),
        },
        body: JSON.stringify({ email }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
    } catch {
      clearTimeout(timeout);
      return NextResponse.json(
        {
          success: false,
          error:
            "Authentication server is unavailable. Please try again in a moment.",
        },
        { status: 503 },
      );
    }

    const data = (await response.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;

    if (!response.ok) {
      console.error("[forgot-password] Backend API error:", data);
      return NextResponse.json(
        { success: false, error: data.message || "Failed to send reset email" },
        { status: response.status },
      );
    }

    if (data._resetToken && !data._emailSent) {
      console.log(
        "[forgot-password] Backend mailer failed, sending from worker...",
      );
      const sendTo = (data._sendTo as string) || email;
      const resetUrl =
        (data._resetUrl as string) ||
        `https://settleinpeace.com/reset-password?token=${data._resetToken}`;
      await sendResetEmailDirectly(
        sendTo,
        resetUrl,
        data._firstName as string | undefined,
      );
    }

    delete data._resetToken;
    delete data._emailSent;
    delete data._sendTo;
    delete data._firstName;
    delete data._resetUrl;
    return NextResponse.json(data);
  } catch (error) {
    console.error("[forgot-password] error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to send reset email" },
      { status: 500 },
    );
  }
}
