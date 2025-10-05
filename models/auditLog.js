const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const AuditLog = sequelize.define(
  "AuditLog",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    adminId: { type: DataTypes.INTEGER, allowNull: false },
    action: { type: DataTypes.STRING(100), allowNull: false },
    targetType: { type: DataTypes.STRING(50), allowNull: false },
    targetId: { type: DataTypes.INTEGER, allowNull: false },
    details: { type: DataTypes.TEXT, allowNull: true },
  },
  { tableName: "audit_logs", timestamps: true }
);

module.exports = { AuditLog };


