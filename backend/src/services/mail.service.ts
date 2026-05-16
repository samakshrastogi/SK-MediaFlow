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

let transporter: nodemailer.Transporter<SMTPTransport.SentMessageInfo> | null =
    null

const getTransporter = () => {
    if (!hasSmtpConfig) return null

    if (!transporter) {
        transporter = nodemailer.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
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
    from = `"SKFlix" <${EMAIL_FROM}>`,
    replyTo = `"SKFlix Support" <${EMAIL_REPLY_TO}>`,
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
    return sendEmail({
        to,
        subject: `Invitation to join ${organizationName}`,
        text: `You were invited to join ${organizationName} on SKFlix: ${inviteLink}`,
        html: `
            <div style="font-family:Arial,sans-serif;line-height:1.5">
                <h2>Organization Invite</h2>
                <p>You were invited to join <strong>${organizationName}</strong> on SKFlix.</p>
                <p><a href="${inviteLink}" target="_blank" rel="noopener noreferrer">Click here to join organization</a></p>
                <p>If the button does not work, copy this link:</p>
                <p>${inviteLink}</p>
            </div>
        `,
    })
}
