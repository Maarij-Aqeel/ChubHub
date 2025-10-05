const { Sequelize } = require('sequelize');

const sequelize = new Sequelize('clubhub', 'root', 'latifa2003', {
  host: 'localhost',
  dialect: 'mysql',
  logging: false
});

module.exports = { sequelize };
