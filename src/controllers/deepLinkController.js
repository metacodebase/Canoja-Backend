const TESTFLIGHT_URL = "https://testflight.apple.com/join/mJxRSyKR";

/**
 * GET /api/users/deeplink/change-password
 * Serves an HTML landing page that:
 *  - Immediately tries to open the Canoja app via custom URL scheme
 *  - Falls back to TestFlight if the app is not installed
 */
const handleChangePasswordDeepLink = (req, res) => {
  const { email = "", password = "" } = req.query;
  const encodedEmail = encodeURIComponent(email);
  const encodedPassword = encodeURIComponent(password);
  const deepLinkUrl = `canoja://change-password?email=${encodedEmail}&password=${encodedPassword}`;

  res.setHeader("Content-Type", "text/html");
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Opening Canoja...</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      background: linear-gradient(135deg, #0a1a12 0%, #0d2a1a 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #ffffff;
    }
    .card {
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(64,234,84,0.25);
      border-radius: 20px;
      padding: 40px 32px;
      max-width: 360px;
      width: 90%;
      text-align: center;
    }
    .logo {
      width: 72px; height: 72px;
      background: rgba(64,234,84,0.15);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 24px;
      font-size: 32px;
    }
    h1 { font-size: 22px; font-weight: 700; margin-bottom: 10px; }
    p { font-size: 14px; color: #a5baae; line-height: 1.6; margin-bottom: 8px; }
    .spinner {
      width: 40px; height: 40px;
      border: 3px solid rgba(64,234,84,0.2);
      border-top-color: #40ea54;
      border-radius: 50%;
      animation: spin 0.9s linear infinite;
      margin: 24px auto;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .btn {
      display: inline-block;
      margin-top: 20px;
      padding: 14px 28px;
      background: linear-gradient(135deg, #40ea54, #04ca8f);
      color: #000;
      font-weight: 700;
      font-size: 15px;
      border-radius: 12px;
      text-decoration: none;
    }
    #fallback { display: none; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">🌿</div>
    <h1>Opening Canoja</h1>
    <p>Redirecting you to the app to set your password...</p>
    <div class="spinner" id="spinner"></div>
    <p id="status">Please wait...</p>

    <div id="fallback">
      <p>Canoja is not installed on this device.</p>
      <a class="btn" href="${TESTFLIGHT_URL}">Download on TestFlight</a>
    </div>
  </div>

  <script>
    var deepLink = '${deepLinkUrl}';
    var fallbackUrl = '${TESTFLIGHT_URL}';
    var appOpened = false;

    // Detect if the user left the browser (app opened successfully)
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) appOpened = true;
    });
    window.addEventListener('pagehide', function () {
      appOpened = true;
    });

    // Try opening the app immediately
    window.location.href = deepLink;

    // After 2.5s, if the user is still on this page → app is not installed
    setTimeout(function () {
      if (!appOpened && !document.hidden) {
        document.getElementById('spinner').style.display = 'none';
        document.getElementById('status').style.display = 'none';
        document.getElementById('fallback').style.display = 'block';
        // Auto-redirect to TestFlight after 1 more second
        setTimeout(function () {
          window.location.href = fallbackUrl;
        }, 1000);
      }
    }, 2500);
  </script>
</body>
</html>`);
};

module.exports = { handleChangePasswordDeepLink };
