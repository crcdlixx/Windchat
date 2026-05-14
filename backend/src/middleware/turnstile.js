const TURNSTILE_SECRET = process.env.TURNSTILE_SECRET_KEY;

async function verifyTurnstile(req, res, next) {
    if (!TURNSTILE_SECRET) return next();

    const token = req.body.turnstile_token;
    if (!token) return res.status(400).json({ error: 'CAPTCHA token required' });

    try {
        const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                secret: TURNSTILE_SECRET,
                response: token,
                remoteip: req.ip,
            }),
        });
        const data = await response.json();
        if (!data.success) return res.status(403).json({ error: 'CAPTCHA verification failed' });
        next();
    } catch {
        return res.status(500).json({ error: 'CAPTCHA verification error' });
    }
}

module.exports = { verifyTurnstile };
