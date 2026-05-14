const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
    if (!transporter && process.env.SMTP_HOST) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: parseInt(process.env.SMTP_PORT || '587'),
            secure: process.env.SMTP_PORT === '465',
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
    }
    return transporter;
}

async function sendVerificationEmail(to, code) {
    const transport = getTransporter();
    if (!transport) return false;

    try {
        await transport.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to,
            subject: 'WindChat 邮箱验证码',
            text: `您的验证码是：${code}，10分钟内有效。`,
            html: `<p>您的 WindChat 邮箱验证码是：<strong>${code}</strong></p><p>验证码10分钟内有效，请勿泄露给他人。</p>`,
        });
        return true;
    } catch {
        return false;
    }
}

module.exports = { sendVerificationEmail };
