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
    capacity: { type: DataTypes.INTEGER, allowNull: true }, 
    status: { type: DataTypes.ENUM('pending','approved','rejected'), defaultValue: 'pending' },
    adminNotes: { type: DataTypes.TEXT, allowNull: true },

    activityType: {
      type: DataTypes.STRING, // 'Workshop', 'Lecture', 'Other'
      allowNull: true,
    },
    targetAudience: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    expectedAttendees: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    // File Paths
    reservationConfirmationFile: {
      type: DataTypes.STRING, 
      allowNull: true,
    },
    eventProposalBudgetFiles: {
      type: DataTypes.JSON, 
      allowNull: true,
      defaultValue: [],
    },
    // Speaker Information
    hasSpeaker: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    speakerType: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    speakerNamePosition: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    speakerCVFile: {
      type: DataTypes.STRING, 
      allowNull: true,
    },
    // Collaboration with Internal Offices/Centers
    officeCenterName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    representativeNameOffice: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    roleType: { 
      type: DataTypes.STRING,
      allowNull: true,
    },
    requiredTasks: {
      type: DataTypes.JSON, 
      allowNull: true,
      defaultValue: [],
    },
    // Responsible Members Table Data
    responsibleMembers: {
      type: DataTypes.JSON, 
      allowNull: true,
      defaultValue: [],
    },

    // ===== Approval Tracking =====
    approvedByAdmin: { type: DataTypes.BOOLEAN, defaultValue: false },
    approvedByDean: { type: DataTypes.BOOLEAN, defaultValue: false },
    deanNotes: { type: DataTypes.TEXT, allowNull: true },
    adminApprovalDate: { type: DataTypes.DATE, allowNull: true },
    deanApprovalDate: { type: DataTypes.DATE, allowNull: true },
  },
  { tableName: 'events', timestamps: true }
);

module.exports = { Event };
