const { DataTypes } = require("sequelize");
const sequelize  = require("../config/database");

const Message = sequelize.define(
  "Message",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    senderId: { type: DataTypes.INTEGER, allowNull: false },
    receiverId: { type: DataTypes.INTEGER, allowNull: true }, // null for broadcasts and group messages
    clubId: { type: DataTypes.INTEGER, allowNull: true }, // for club-related messages
    chatRoomId: { type: DataTypes.INTEGER, allowNull: true }, // for group chats
    message: { type: DataTypes.TEXT, allowNull: false },
    messageType: {
      type: DataTypes.ENUM('direct', 'group', 'broadcast'),
      allowNull: false,
      defaultValue: 'direct'
    }, // Type of message communication
    adminTarget: { type: DataTypes.ENUM('students', 'clubs'), allowNull: true }, // For admin broadcasts
    timestamp: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  },
  {
    tableName: "messages",
    timestamps: true,
    indexes: [
      // Index for efficient message retrieval by sender
      { fields: ['senderId'] },
      // Index for direct messages (receiver-specific)
      { fields: ['receiverId'] },
      // Index for club-related messages
      { fields: ['clubId'] },
      // Index for group chat messages
      { fields: ['chatRoomId'] },
      // Index for admin broadcasts
      { fields: ['adminTarget'] },
      // Composite index for message type and timestamp (for sorting)
      { fields: ['messageType', 'timestamp'] },
      // Composite index for club messages with timestamp
      { fields: ['clubId', 'timestamp'] },
      // Composite index for chat room messages with timestamp
      { fields: ['chatRoomId', 'timestamp'] },
    ],
  }
);

module.exports = { Message };
