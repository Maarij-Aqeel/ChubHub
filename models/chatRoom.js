const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ChatRoom = sequelize.define(
  "ChatRoom",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    name: { type: DataTypes.STRING(100), allowNull: false }, // Display name for the chat room
    type: {
      type: DataTypes.ENUM('club_group', 'admin_broadcast'),
      allowNull: false
    }, // Type of chat room
    clubId: { type: DataTypes.INTEGER, allowNull: true }, // For club group chats
    createdBy: { type: DataTypes.INTEGER, allowNull: false }, // User who created the room
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true }, // Room status
    lastMessageAt: { type: DataTypes.DATE, allowNull: true }, // Timestamp of last message
  },
  {
    tableName: "chat_rooms",
    timestamps: true,
    indexes: [
      // Index for active rooms
      { fields: ['isActive'] },
      // Index for club-specific rooms
      { fields: ['clubId'] },
      // Index for room type
      { fields: ['type'] },
      // Composite index for active club rooms
      { fields: ['clubId', 'isActive'] },
      // Index for last message timestamp (for sorting recent rooms)
      { fields: ['lastMessageAt'] },
    ],
  }
);

module.exports = { ChatRoom };
