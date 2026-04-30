{
  "hosting": {
    "public": "dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "nnow-${ENV}",
          "region": "asia-southeast1",
          "pinTag": true
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ],
    "headers": [
      {
        "source": "/assets/**",
        "headers": [
          { "key": "Cache-Control", "value": "public, max-age=31536000, immutable" }
        ]
      },
      {
        "source": "**/@(sw.js|manifest.webmanifest)",
        "headers": [
          { "key": "Cache-Control", "value": "no-cache" }
        ]
      },
      {
        "source": "/",
        "headers": [
          { "key": "Cache-Control", "value": "no-cache" }
        ]
      }
    ]
  }
}
