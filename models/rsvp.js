const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const RSVP = sequelize.define(
  "RSVP",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    eventId: { type: DataTypes.INTEGER, allowNull: false },
    status: { type: DataTypes.ENUM('going','interested','not_going'), defaultValue: 'going' },
  },
  {
    tableName: "rsvps",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["studentId", "eventId"] },
    ],
  }
);

module.exports = { RSVP };


