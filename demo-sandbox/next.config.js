const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The page imports the package's committed build from ../dist
  turbopack: {
    root: path.join(__dirname, '..')
  }
}

module.exports = nextConfig
