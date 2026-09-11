import path from "node:path"
import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  
  turbopack: {
    root: path.join(__dirname),
  },
  devIndicators: false,
}

export default nextConfig
