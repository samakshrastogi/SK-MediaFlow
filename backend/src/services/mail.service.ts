import nodemailer from "nodemailer"
import SMTPTransport from "nodemailer/lib/smtp-transport"

const EMAIL_FROM = process.env.EMAIL_FROM || process.env.EMAIL_USER || "no-reply@localhost"
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || EMAIL_FROM
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = Number(process.env.SMTP_PORT || 587)
const SMTP_SECURE = process.env.SMTP_SECURE === "true"
const SMTP_USER = process.env.SMTP_USER || process.env.EMAIL_USER
const SMTP_PASS = process.env.SMTP_PASS || process.env.EMAIL_PASS

const hasSmtpConfig = Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS)

export type MailSendResult = {
    delivered: boolean
    mode: "smtp" | "console"
}

type BrandedEmailOptions = {
    eyebrow?: string
    title: string
    intro: string
    bodyHtml?: string
    action?: {
        label: string
        url: string
    }
    footerNote?: string
}

let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null =
    null

const getTransporter = () => {
    if (!hasSmtpConfig) return null

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            family: 4,
            auth: {
                user: SMTP_USER,
                pass: SMTP_PASS,
            },
            connectionTimeout: 10000,
            greetingTimeout: 10000,
            socketTimeout: 10000,
            tls: {
                minVersion: "TLSv1.2",
            },
        } as SMTPTransport.Options)
    }

    return transporter
}

const escapeHtml = (value: string) =>
    value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")

export const renderBrandedEmail = ({
    eyebrow = "SK-MediaFlow",
    title,
    intro,
    bodyHtml = "",
    action,
    footerNote = "If you did not request this email, you can safely ignore it.",
}: BrandedEmailOptions) => {
    const safeEyebrow = escapeHtml(eyebrow)
    const safeTitle = escapeHtml(title)
    const safeIntro = escapeHtml(intro)
    const safeFooterNote = escapeHtml(footerNote)
    const preheader = `${title} - ${intro}`
    const actionHtml = action
        ? `
                                <tr>
                                    <td align="center" style="padding: 26px 0 6px;">
                                        <a href="${escapeHtml(action.url)}" target="_blank" rel="noopener noreferrer" style="display: inline-block; background: #1d4ed8; color: #ffffff; font-family: Arial, Helvetica, sans-serif; font-size: 15px; font-weight: 700; line-height: 20px; text-decoration: none; padding: 14px 24px; border-radius: 8px;">
                                            ${escapeHtml(action.label)}
                                        </a>
                                    </td>
                                </tr>`
        : ""

    return `<!doctype html>
<html>
    <head>
        <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>${safeTitle}</title>
    </head>
    <body style="margin: 0; padding: 0; background: #eef2f7;">
        <div style="display: none; max-height: 0; overflow: hidden; opacity: 0; color: transparent;">
            ${escapeHtml(preheader)}
        </div>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; background: #eef2f7; margin: 0; padding: 0;">
            <tr>
                <td align="center" style="padding: 32px 14px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="width: 100%; max-width: 620px; background: #ffffff; border: 1px solid #d8e0ea; border-radius: 8px; overflow: hidden;">
                        <tr>
                            <td style="background: #111827; padding: 22px 28px;">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="font-family: Arial, Helvetica, sans-serif; color: #ffffff; font-size: 20px; font-weight: 800; letter-spacing: 0;">
                                            SK-MediaFlow
                                        </td>
                                        <td align="right" style="font-family: Arial, Helvetica, sans-serif; color: #bfdbfe; font-size: 12px; font-weight: 700; text-transform: uppercase;">
                                            Secure Mail
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="padding: 34px 30px 28px;">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                                    <tr>
                                        <td style="font-family: Arial, Helvetica, sans-serif; color: #1d4ed8; font-size: 12px; font-weight: 800; letter-spacing: 0; text-transform: uppercase; padding-bottom: 12px;">
                                            ${safeEyebrow}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="font-family: Arial, Helvetica, sans-serif; color: #111827; font-size: 28px; font-weight: 800; line-height: 36px; padding-bottom: 12px;">
                                            ${safeTitle}
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="font-family: Arial, Helvetica, sans-serif; color: #4b5563; font-size: 16px; line-height: 25px; padding-bottom: 18px;">
                                            ${safeIntro}
                                        </td>
                                    </tr>
                                    ${bodyHtml}
                                    ${actionHtml}
                                    <tr>
                                        <td style="padding-top: 26px;">
                                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px;">
                                                <tr>
                                                    <td style="font-family: Arial, Helvetica, sans-serif; color: #64748b; font-size: 13px; line-height: 20px; padding: 14px 16px;">
                                                        ${safeFooterNote}
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                </table>
                            </td>
                        </tr>
                        <tr>
                            <td style="background: #f8fafc; border-top: 1px solid #e2e8f0; padding: 18px 30px; font-family: Arial, Helvetica, sans-serif; color: #64748b; font-size: 12px; line-height: 18px; text-align: center;">
                                &copy; ${new Date().getFullYear()} SK-MediaFlow. All rights reserved.
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
</html>`
}

type SendEmailOptions = {
    to: string
    subject: string
    html: string
    from?: string
    replyTo?: string
    text?: string
}

export const sendEmail = async ({
    to,
    subject,
    html,
    from = `"SK-MediaFlow" <${EMAIL_FROM}>`,
    replyTo = `"SK-MediaFlow Support" <${EMAIL_REPLY_TO}>`,
    text,
}: SendEmailOptions): Promise<MailSendResult> => {
    const smtpTransporter = getTransporter()

    if (!smtpTransporter) {
        console.info("[mail:console] SMTP is not configured. Email payload:", {
            to,
            subject,
            from,
            replyTo,
            text,
        })

        return { delivered: false, mode: "console" }
    }

    await smtpTransporter.sendMail({
        from,
        replyTo,
        to,
        subject,
        html,
        text,
    })

    return { delivered: true, mode: "smtp" }
}

export const sendOrganizationInviteEmail = async (
    to: string,
    organizationName: string,
    inviteLink: string
) => {
    const safeOrganizationName = escapeHtml(organizationName)
    const safeInviteLink = escapeHtml(inviteLink)

    return sendEmail({
        to,
        subject: `Invitation to join ${organizationName}`,
        text: `You were invited to join ${organizationName} on SK-MediaFlow: ${inviteLink}`,
        html: renderBrandedEmail({
            eyebrow: "Organization invite",
            title: "You have been invited",
            intro: `You were invited to join ${organizationName} on SK-MediaFlow.`,
            bodyHtml: `
                                    <tr>
                                        <td style="padding: 8px 0 0;">
                                            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px;">
                                                <tr>
                                                    <td style="font-family: Arial, Helvetica, sans-serif; color: #14532d; font-size: 15px; line-height: 23px; padding: 16px;">
                                                        Join <strong>${safeOrganizationName}</strong> to access shared media, playlists, and organization content.
                                                    </td>
                                                </tr>
                                            </table>
                                        </td>
                                    </tr>
                                    <tr>
                                        <td style="font-family: Arial, Helvetica, sans-serif; color: #6b7280; font-size: 13px; line-height: 20px; padding-top: 18px; word-break: break-all;">
                                            Invite link: ${safeInviteLink}
                                        </td>
                                    </tr>`,
            action: {
                label: "Join organization",
                url: inviteLink,
            },
        }),
    })
}
