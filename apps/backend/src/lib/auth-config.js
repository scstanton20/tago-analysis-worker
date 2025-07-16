export const authConfig = {
  database: {
    provider: 'sqlite',
    url: 'file:./database/auth.db',
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    minPasswordLength: 8,
    maxPasswordLength: 128,
  },
  session: {
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60 * 1000, // 5 minutes
    },
    freshAge: 60 * 60 * 1000, // 1 hour
    updateAge: 24 * 60 * 60 * 1000, // 24 hours
  },
  plugins: ['passkey'],
  trustedOrigins: ['http://localhost:5173', 'http://localhost:3000'],
  secret: process.env.SECRET_KEY || 'default-dev-secret-change-in-production',
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
  },
  rateLimit: {
    enabled: true,
    storage: 'memory',
  },
};
