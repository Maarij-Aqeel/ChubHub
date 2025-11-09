const { Sequelize } = require('sequelize');

// Use Railway-provided environment variables if available, otherwise use local ones
const sequelize = new Sequelize(
  process.env.MYSQLDATABASE || 'clubhub',     // Database name
  process.env.MYSQLUSER || 'root',            // Database user
  process.env.MYSQLPASSWORD || 'latifa2003',  // Database password
  {
    host: process.env.MYSQLHOST || 'localhost',
    port: process.env.MYSQLPORT || 3306,
    dialect: 'mysql',
    dialectOptions: {
      ssl: process.env.MYSQLHOST ? { require: true, rejectUnauthorized: false } : false
    },
    logging: false
  }
);

sequelize.authenticate()
  .then(() => console.log('Database connected successfully'))
  .catch(err => console.error('Database connection error:', err));

module.exports = sequelize;
