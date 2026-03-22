# Authentication

The download tool uses your existing Humble Bundle session cookie. Copy the `_simpleauth_sess` value from your browser.

## Steps (Chrome/Edge)

1. Go to `https://www.humblebundle.com/home/library`.
2. Open Developer Tools and select the Application tab.
3. Expand Cookies and select `https://www.humblebundle.com`.
4. Copy the value for `_simpleauth_sess`.

## Steps (Firefox)

1. Go to `https://www.humblebundle.com/home/library`.
2. Open Developer Tools and select the Storage tab.
3. Expand Cookies and select `https://www.humblebundle.com`.
4. Copy the value for `_simpleauth_sess`.

## Where to put it

Paste the value into `backend/.env` using the key in `backend/.env.example`.

## Tips

- Treat the cookie like a password.
- Cookies expire. If you see HTTP 401 or 403, grab a fresh value.
