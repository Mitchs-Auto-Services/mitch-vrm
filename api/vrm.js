 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/api/vrm.js b/api/vrm.js
index 7bb55cb5416a3726e820c8115cdd6ece955bcc53..bb90c12390796493b12bd0d5b8ec7cbd3cb413b7 100644
--- a/api/vrm.js
+++ b/api/vrm.js
@@ -1,36 +1,38 @@
 export default async function handler(req, res) {
   if (req.method !== 'POST') {
     res.setHeader('Allow', ['POST']);
     return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
   }
 
   try {
     const { vrm } = req.body || {};
     const reg = (vrm || '').toUpperCase().replace(/\s+/g, '');
     if (!reg || reg.length < 5) {
       return res.status(400).json({ error: 'Invalid or missing VRM.' });
     }
 
     // LIVE DVLA endpoint (use real plates + LIVE key)
     const DVLA_URL = 'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles';
 
+    const apiKey = process.env.DVLA_API_KEY || 'ZQHFV22Ym6ao1CfyyqEol2oxzpoWQM2w59rAkPro';
+
     const upstream = await fetch(DVLA_URL, {
       method: 'POST',
       headers: {
         'Content-Type': 'application/json',
-        'x-api-key': process.env.DVLA_API_KEY
+        'x-api-key': apiKey
       },
       body: JSON.stringify({ registrationNumber: reg }),
       cache: 'no-store'
     });
 
     const data = await upstream.json();
     if (!upstream.ok) {
       return res.status(upstream.status).json({ error: data?.message || data });
     }
 
     return res.status(200).json(data);
   } catch (err) {
     return res.status(500).json({ error: err.message || 'Server error' });
   }
 }
 
EOF
)
