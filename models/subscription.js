const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Subscription = sequelize.define(
  "Subscription",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    studentId: { type: DataTypes.INTEGER, allowNull: false },
    clubId: { type: DataTypes.INTEGER, allowNull: false },
  },
  {
    tableName: "subscriptions",
    timestamps: true,
    indexes: [
      { unique: true, fields: ["studentId", "clubId"] },
    ],
  }
);

module.exports = { Subscription };


