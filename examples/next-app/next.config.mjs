/** @type {import('next').NextConfig} */
const nextConfig = {
  // Next.js blocks cross-origin requests to dev-only resources (including the HMR
  // WebSocket) unless the origin is allowed. Allow your Localians preview domain:
  allowedDevOrigins: ["*.preview.localhost"],
};

export default nextConfig;
