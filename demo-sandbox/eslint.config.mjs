import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const config = [...nextCoreWebVitals, { ignores: ['.next/', 'next-env.d.ts'] }]

export default config
