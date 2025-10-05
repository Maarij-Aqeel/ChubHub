const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Event = sequelize.define(
  "Event",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    clubId: { type: DataTypes.INTEGER, allowNull: false },
    title: { type: DataTypes.STRING(200), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    location: { type: DataTypes.STRING(200), allowNull: true },
    startsAt: { type: DataTypes.DATE, allowNull: true },
    endsAt: { type: DataTypes.DATE, allowNull: true },
    status: { type: DataTypes.ENUM('pending','approved','rejected'), defaultValue: 'pending' },
    adminNotes: { type: DataTypes.TEXT, allowNull: true } // <-- added
  },
  { tableName: 'events', timestamps: true }
);

module.exports = { Event };
