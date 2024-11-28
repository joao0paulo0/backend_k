const config = {
  development: {
    mongodb: {
      uri: process.env.MONGODB_URI || 'mongodb://localhost:27017/karateeee',
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        autoIndex: true
      }
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRE || '30d'
    },
    email: {
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      from: process.env.EMAIL_FROM
    },
    cors: {
      origin: process.env.FRONTEND_URL || 'http://localhost:3000',
      credentials: true
    }
  },
  production: {
    mongodb: {
      uri: process.env.MONGODB_URI,
      options: {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        autoIndex: false, // Don't build indexes in production
        maxPoolSize: 10
      }
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      expiresIn: process.env.JWT_EXPIRE || '7d'
    },
    email: {
      service: process.env.EMAIL_SERVICE,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      from: process.env.EMAIL_FROM
    },
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true
    }
  }
};

module.exports = config[process.env.NODE_ENV || 'development']; 