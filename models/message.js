const { DataTypes } = require("sequelize");
const { sequelize } = require("../config/database");

const Message = sequelize.define(
  "Message",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    senderId: { type: DataTypes.INTEGER, allowNull: false },
    receiverId: { type: DataTypes.INTEGER, allowNull: true }, // null for broadcasts
    clubId: { type: DataTypes.INTEGER, allowNull: true }, // for club-student chats or club broadcasts
    message: { type: DataTypes.TEXT, allowNull: false },
    adminTarget: { type: DataTypes.ENUM('students', 'clubs'), allowNull: true }, // For admin broadcasts
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "messages",
    timestamps: true,
  }
);

module.exports = { Message };
