/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  async headers() {
    const staticCache = "public, max-age=31536000, immutable";
    const dataCache = "public, max-age=1800, s-maxage=86400, stale-while-revalidate=604800";

    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), geolocation=(), microphone=()" }
        ]
      },
      {
        source: "/image2/hero/:path*",
        headers: [{ key: "Cache-Control", value: staticCache }]
      },
      {
        source: "/image2/cases/:path*",
        headers: [{ key: "Cache-Control", value: staticCache }]
      },
      {
        source: "/api/image2/proxy",
        headers: [{ key: "Cache-Control", value: "public, max-age=14400, s-maxage=604800, stale-while-revalidate=2592000" }]
      },
      {
        source: "/api/image2/output/:path*",
        headers: [{ key: "Cache-Control", value: staticCache }]
      },
      {
        source: "/data/:path*",
        headers: [{ key: "Cache-Control", value: dataCache }]
      }
    ];
  },
  async redirects() {
    return [
      {
        source: "/image2-atlas",
        destination: "/image2-cases",
        permanent: false
      }
    ];
  }
};

export default nextConfig;
